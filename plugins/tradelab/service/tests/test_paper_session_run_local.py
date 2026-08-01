from __future__ import annotations

from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from tradelab_api.services.paper_engine import PaperEngineTickResult
from tradelab_api.services.paper_engine_tick_local import LOCAL_PAPER_ENGINE_SAFETY_STATUS
from tradelab_api.services.paper_session_run_local import (
    PaperSessionRunLocalRequestData,
    execute_local_paper_session_run,
)

def _settings(*, enabled: bool = True, environment: str = "local") -> SimpleNamespace:
    return SimpleNamespace(
        tradelab_local_paper_engine_enabled=enabled,
        tradelab_environment=environment,
    )

def _request(
    *,
    confirm: bool = True,
    max_candles_per_tick: int = 10000,
    worker_id: str = "strategy-lab-local-paper-run",
) -> PaperSessionRunLocalRequestData:
    return PaperSessionRunLocalRequestData(
        confirm_local_paper_run=confirm,
        max_candles_per_tick=max_candles_per_tick,
        worker_id=worker_id,
    )

class FakeSource:
    def __init__(self, *, status: str | None = "queued", running: bool = False) -> None:
        self.status = status
        self.running = running
        self.status_calls: list[UUID] = []

    def get_paper_session_status(self, session_id: UUID) -> str | None:
        self.status_calls.append(session_id)
        return self.status

    def has_running_session(self) -> bool:
        return self.running

class FakeRunner:
    def __init__(self, result: PaperEngineTickResult) -> None:
        self.result = result
        self.calls: list[int] = []

    def tick(self, *, max_candles_per_tick: int) -> PaperEngineTickResult:
        self.calls.append(max_candles_per_tick)
        return self.result

class FakePaperRepository:
    def __init__(self, row) -> None:
        self.row = row
        self.audit_events = []

    def get_paper_session_for_update(self, session_id: UUID):
        return self.row

    def create_audit_event(self, **fields):
        event = SimpleNamespace(id=uuid4(), **fields)
        self.audit_events.append(event)
        return event

@pytest.mark.parametrize(
    ("settings", "request_data", "reason_code", "semantic_status_code"),
    [
        (_settings(enabled=False), _request(), "paper_local_run_not_enabled", 403),
        (_settings(environment="production"), _request(), "paper_local_run_environment_not_allowed", 403),
        (_settings(), _request(confirm=False), "paper_local_run_confirmation_required", 400),
        (_settings(), _request(max_candles_per_tick=0), "paper_engine_invalid_max_candles_per_tick", 400),
        (_settings(), _request(max_candles_per_tick=10001), "paper_engine_invalid_max_candles_per_tick", 400),
    ],
)
def test_run_local_static_guards_block_before_source_lookup(settings, request_data, reason_code, semantic_status_code) -> None:
    result = execute_local_paper_session_run(
        SimpleNamespace(),
        settings=settings,
        session_id=uuid4(),
        request=request_data,
    )

    assert result.status == "blocked"
    assert result.reason_code == reason_code
    assert result.session_id is None
    assert result.safety_status == LOCAL_PAPER_ENGINE_SAFETY_STATUS
    assert result.should_commit is False
    assert result.should_rollback is False
    assert result.semantic_status_code == semantic_status_code

@pytest.mark.parametrize(
    ("source", "reason_code", "status", "semantic_status_code"),
    [
        (FakeSource(status=None), "paper_local_run_session_not_found", "blocked", 404),
        (FakeSource(status="completed"), "paper_local_run_session_not_queued", "blocked", 409),
        (FakeSource(status="queued", running=True), "paper_local_run_already_running", "busy", 409),
    ],
)
def test_run_local_blocks_missing_nonqueued_or_running(monkeypatch, source, reason_code, status, semantic_status_code) -> None:
    monkeypatch.setattr(
        "tradelab_api.services.paper_session_run_local._build_source",
        lambda session, *, worker_id: source,
    )

    result = execute_local_paper_session_run(
        SimpleNamespace(),
        settings=_settings(),
        session_id=uuid4(),
        request=_request(),
    )

    assert result.status == status
    assert result.reason_code == reason_code
    assert result.should_commit is False
    assert result.semantic_status_code == semantic_status_code

def test_run_local_completed_requests_commit_and_returns_counts(monkeypatch) -> None:
    session_id = uuid4()
    source = FakeSource(status="queued", running=False)
    runner = FakeRunner(
        PaperEngineTickResult(
            status="completed",
            reason_code="paper_engine_completed",
            safety_status=LOCAL_PAPER_ENGINE_SAFETY_STATUS,
            session_id=str(session_id),
            candles_processed=3,
            orders_created=1,
            fills_created=1,
            snapshots_created=3,
        )
    )
    monkeypatch.setattr(
        "tradelab_api.services.paper_session_run_local._build_source",
        lambda session, *, worker_id: source,
    )
    monkeypatch.setattr(
        "tradelab_api.services.paper_session_run_local._build_runner",
        lambda session, *, session_id, worker_id, max_candles_per_tick, kill_switch_enabled=False: runner,
    )

    result = execute_local_paper_session_run(
        SimpleNamespace(),
        settings=_settings(),
        session_id=session_id,
        request=_request(max_candles_per_tick=3, worker_id=" worker with apiSecret=hidden "),
    )

    assert result.status == "completed"
    assert result.reason_code == "paper_engine_completed"
    assert result.session_id == str(session_id)
    assert result.candles_processed == 3
    assert result.orders_created == 1
    assert result.fills_created == 1
    assert result.snapshots_created == 3
    assert result.details["workerId"] == "worker-with-[REDACTED]=hidden"
    assert result.details["maxCandlesPerTick"] == 3
    assert result.should_commit is True
    assert runner.calls == [3]

def test_run_local_maps_engine_busy_reason_to_wrapper_reason(monkeypatch) -> None:
    source = FakeSource(status="queued", running=False)
    runner = FakeRunner(
        PaperEngineTickResult(
            status="busy",
            reason_code="paper_engine_already_running",
            safety_status=LOCAL_PAPER_ENGINE_SAFETY_STATUS,
        )
    )
    monkeypatch.setattr(
        "tradelab_api.services.paper_session_run_local._build_source",
        lambda session, *, worker_id: source,
    )
    monkeypatch.setattr(
        "tradelab_api.services.paper_session_run_local._build_runner",
        lambda session, *, session_id, worker_id, max_candles_per_tick, kill_switch_enabled=False: runner,
    )

    result = execute_local_paper_session_run(
        SimpleNamespace(),
        settings=_settings(),
        session_id=uuid4(),
        request=_request(),
    )

    assert result.status == "busy"
    assert result.reason_code == "paper_local_run_already_running"
    assert result.should_commit is False
    assert result.semantic_status_code == 409

def test_run_local_unexpected_error_requests_rollback_and_redacts(monkeypatch) -> None:
    source = FakeSource(status="queued", running=False)

    def raise_error(*args, **kwargs):
        raise RuntimeError("boom apiSecret=hidden")

    monkeypatch.setattr(
        "tradelab_api.services.paper_session_run_local._build_source",
        lambda session, *, worker_id: source,
    )
    monkeypatch.setattr("tradelab_api.services.paper_session_run_local._build_runner", raise_error)

    result = execute_local_paper_session_run(
        SimpleNamespace(),
        settings=_settings(),
        session_id=uuid4(),
        request=_request(),
    )

    assert result.status == "failed"
    assert result.reason_code == "paper_engine_unexpected_error"
    assert result.details["errorMessage"] == "[REDACTED]"
    assert result.should_commit is False
    assert result.should_rollback is True
    assert result.semantic_status_code == 500

def test_run_local_kill_switch_blocks_queued_session_and_writes_audit(monkeypatch) -> None:
    session_id = uuid4()
    row = SimpleNamespace(
        id=session_id,
        mode="paper",
        status="queued",
        reason_code="paper_session_queued",
        cancel_requested_at=None,
        updated_at=None,
        updated_by=None,
    )
    source = FakeSource(status="queued", running=False)
    repository = FakePaperRepository(row)
    monkeypatch.setattr("tradelab_api.services.paper_session_run_local._build_source", lambda session, *, worker_id: source)
    monkeypatch.setattr("tradelab_api.services.paper_session_run_local.PaperSessionRepository", lambda session: repository)

    result = execute_local_paper_session_run(
        SimpleNamespace(),
        settings=SimpleNamespace(
            tradelab_local_paper_engine_enabled=True,
            tradelab_environment="local",
            tradelab_local_paper_kill_switch_enabled=True,
        ),
        session_id=session_id,
        request=_request(),
    )

    assert result.status == "blocked"
    assert result.reason_code == "paper_kill_switch_enabled"
    assert result.session_id == str(session_id)
    assert result.should_commit is True
    assert result.semantic_status_code == 409
    assert row.status == "queued"
    assert repository.audit_events[0].action == "paper_session_run_blocked_by_kill_switch"
    assert repository.audit_events[0].old_state == "queued"
    assert repository.audit_events[0].new_state == "queued"

def test_run_local_kill_switch_requests_cancel_for_running_session(monkeypatch) -> None:
    session_id = uuid4()
    row = SimpleNamespace(
        id=session_id,
        mode="paper",
        status="running",
        reason_code="paper_engine_running",
        cancel_requested_at=None,
        updated_at=None,
        updated_by=None,
    )
    source = FakeSource(status="running", running=True)
    repository = FakePaperRepository(row)
    monkeypatch.setattr("tradelab_api.services.paper_session_run_local._build_source", lambda session, *, worker_id: source)
    monkeypatch.setattr("tradelab_api.services.paper_session_run_local.PaperSessionRepository", lambda session: repository)

    result = execute_local_paper_session_run(
        SimpleNamespace(),
        settings=SimpleNamespace(
            tradelab_local_paper_engine_enabled=True,
            tradelab_environment="local",
            tradelab_local_paper_kill_switch_enabled=True,
        ),
        session_id=session_id,
        request=_request(),
    )

    assert result.status == "cancel_requested"
    assert result.reason_code == "paper_kill_switch_cancel_requested"
    assert result.session_id == str(session_id)
    assert result.should_commit is True
    assert row.status == "cancel_requested"
    assert row.cancel_requested_at is not None
    assert repository.audit_events[0].action == "paper_session_cancel_requested_by_kill_switch"
