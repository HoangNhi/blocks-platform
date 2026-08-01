from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

from tradelab_api.services.paper_session_run_local import PaperSessionRunLocalResult

def _dt(hour: int, minute: int = 0, second: int = 0) -> datetime:
    return datetime(2026, 1, 1, hour, minute, second, tzinfo=timezone.utc)

def _settings(
    *,
    scheduler_enabled: bool = True,
    local_paper_enabled: bool = True,
    kill_switch_enabled: bool = False,
    environment: str = "local",
    interval_seconds: float = 60.0,
    worker_id: str = "tradelab-local-paper-scheduler",
    backoff_seconds: float = 60.0,
) -> SimpleNamespace:
    return SimpleNamespace(
        tradelab_paper_scheduler_enabled=scheduler_enabled,
        tradelab_paper_scheduler_interval_seconds=interval_seconds,
        tradelab_paper_scheduler_worker_id=worker_id,
        tradelab_paper_scheduler_error_backoff_seconds=backoff_seconds,
        tradelab_local_paper_engine_enabled=local_paper_enabled,
        tradelab_local_paper_kill_switch_enabled=kill_switch_enabled,
        tradelab_environment=environment,
    )

class FakeSession:
    def __init__(self) -> None:
        self.commits = 0
        self.rollbacks = 0
        self.closed = False

    def commit(self) -> None:
        self.commits += 1

    def rollback(self) -> None:
        self.rollbacks += 1

    def close(self) -> None:
        self.closed = True

def _run_result(*, status: str = "completed", reason_code: str = "paper_engine_completed", session_id: str | None = None) -> PaperSessionRunLocalResult:
    return PaperSessionRunLocalResult(
        status=status,
        reason_code=reason_code,
        session_id=session_id,
        candles_processed=3 if session_id else 0,
        orders_created=1 if session_id else 0,
        fills_created=1 if session_id else 0,
        snapshots_created=3 if session_id else 0,
        should_commit=session_id is not None,
    )

def test_scheduler_skips_when_disabled() -> None:
    from tradelab_api.services.paper_session_scheduler import PaperSessionScheduler

    calls: list[object] = []
    scheduler = PaperSessionScheduler(
        settings_factory=lambda: _settings(scheduler_enabled=False),
        candidate_selector=lambda session: calls.append(session),
    )

    state = scheduler.tick_once(now=_dt(10))

    assert state.last_tick_status == "disabled"
    assert state.last_skip_reason == "paper_scheduler_disabled"
    assert calls == []

def test_scheduler_skips_when_local_paper_engine_disabled() -> None:
    from tradelab_api.services.paper_session_scheduler import PaperSessionScheduler

    calls: list[object] = []
    scheduler = PaperSessionScheduler(
        settings_factory=lambda: _settings(local_paper_enabled=False),
        candidate_selector=lambda session: calls.append(session),
    )

    state = scheduler.tick_once(now=_dt(10))

    assert state.last_tick_status == "skipped"
    assert state.last_skip_reason == "paper_scheduler_local_engine_disabled"
    assert calls == []

def test_scheduler_skips_in_production_environment() -> None:
    from tradelab_api.services.paper_session_scheduler import PaperSessionScheduler

    calls: list[object] = []
    scheduler = PaperSessionScheduler(
        settings_factory=lambda: _settings(environment="production"),
        candidate_selector=lambda session: calls.append(session),
    )

    state = scheduler.tick_once(now=_dt(10))

    assert state.last_tick_status == "skipped"
    assert state.last_skip_reason == "paper_scheduler_environment_blocked"
    assert calls == []

def test_scheduler_skips_when_kill_switch_enabled() -> None:
    from tradelab_api.services.paper_session_scheduler import PaperSessionScheduler

    calls: list[object] = []
    scheduler = PaperSessionScheduler(
        settings_factory=lambda: _settings(kill_switch_enabled=True),
        candidate_selector=lambda session: calls.append(session),
    )

    state = scheduler.tick_once(now=_dt(10))

    assert state.last_tick_status == "skipped"
    assert state.last_skip_reason == "paper_scheduler_kill_switch_enabled"
    assert calls == []

def test_scheduler_records_idle_when_no_queued_session() -> None:
    from tradelab_api.services.paper_session_scheduler import PaperSessionScheduler

    session = FakeSession()
    scheduler = PaperSessionScheduler(
        settings_factory=lambda: _settings(),
        session_factory=lambda: session,
        candidate_selector=lambda session: None,
    )

    state = scheduler.tick_once(now=_dt(10))

    assert state.last_tick_status == "idle"
    assert state.last_skip_reason == "paper_scheduler_no_queued_session"
    assert state.last_session_id is None
    assert session.commits == 0
    assert session.rollbacks == 0
    assert session.closed is True

def test_scheduler_delegates_to_run_local_and_commits() -> None:
    from tradelab_api.services.paper_session_scheduler import PaperSessionScheduler

    session = FakeSession()
    session_id = uuid4()
    captured: dict[str, object] = {}

    def fake_run_local(session_arg, *, settings, session_id, request):
        captured["session"] = session_arg
        captured["settings"] = settings
        captured["session_id"] = session_id
        captured["request"] = request
        return _run_result(session_id=str(session_id))

    scheduler = PaperSessionScheduler(
        settings_factory=lambda: _settings(worker_id="scheduler-1"),
        session_factory=lambda: session,
        candidate_selector=lambda session: session_id,
        run_local=fake_run_local,
    )

    state = scheduler.tick_once(now=_dt(10))

    assert state.last_tick_status == "processed"
    assert state.last_reason_code == "paper_engine_completed"
    assert state.last_session_id == str(session_id)
    assert state.candles_processed == 3
    assert state.orders_created == 1
    assert state.fills_created == 1
    assert state.snapshots_created == 3
    assert session.commits == 1
    assert session.rollbacks == 0
    assert session.closed is True
    assert captured["session"] is session
    assert captured["session_id"] == session_id
    assert captured["request"].confirm_local_paper_run is True
    assert captured["request"].worker_id == "scheduler-1"

def test_scheduler_rolls_back_when_run_local_requests_rollback() -> None:
    from tradelab_api.services.paper_session_scheduler import PaperSessionScheduler

    session = FakeSession()
    session_id = uuid4()

    def failed_run(*args, **kwargs):
        return PaperSessionRunLocalResult(
            status="failed",
            reason_code="paper_engine_unexpected_error",
            should_rollback=True,
            semantic_status_code=500,
        )

    scheduler = PaperSessionScheduler(
        settings_factory=lambda: _settings(),
        session_factory=lambda: session,
        candidate_selector=lambda session: session_id,
        run_local=failed_run,
    )

    state = scheduler.tick_once(now=_dt(10))

    assert state.last_tick_status == "skipped"
    assert state.last_skip_reason == "paper_engine_unexpected_error"
    assert state.last_reason_code == "paper_engine_unexpected_error"
    assert state.last_session_id == str(session_id)
    assert session.commits == 0
    assert session.rollbacks == 1
    assert session.closed is True

def test_scheduler_skips_overlapping_tick() -> None:
    from tradelab_api.services.paper_session_scheduler import PaperSessionScheduler

    scheduler = PaperSessionScheduler(settings_factory=lambda: _settings())
    assert scheduler._tick_lock.acquire(blocking=False) is True
    try:
        state = scheduler.tick_once(now=_dt(10))
    finally:
        scheduler._tick_lock.release()

    assert state.last_tick_status == "skipped"
    assert state.last_skip_reason == "paper_scheduler_tick_in_progress"

def test_scheduler_records_exception_rolls_back_and_closes_session() -> None:
    from tradelab_api.services.paper_session_scheduler import PaperSessionScheduler

    session = FakeSession()
    session_id = uuid4()

    def raise_error(*args, **kwargs):
        raise RuntimeError("scheduler failed")

    scheduler = PaperSessionScheduler(
        settings_factory=lambda: _settings(),
        session_factory=lambda: session,
        candidate_selector=lambda session: session_id,
        run_local=raise_error,
    )

    state = scheduler.tick_once(now=_dt(10))

    assert state.last_tick_status == "failed"
    assert state.last_reason_code == "paper_scheduler_tick_failed"
    assert state.consecutive_failure_count == 1
    assert session.commits == 0
    assert session.rollbacks == 1
    assert session.closed is True
