from __future__ import annotations

from types import SimpleNamespace

import pytest

from tradelab_api.services.paper_engine_tick_local import (
    LOCAL_PAPER_ENGINE_SAFETY_STATUS,
    PaperEngineTickLocalRequestData,
    _build_runner,
    execute_local_paper_engine_tick,
)
from tradelab_api.services.paper_engine import PaperEngineTickResult
from tradelab_api.services.paper_strategy_adapter import SubprocessPaperStrategySignalProvider

def _settings(*, enabled: bool = True, environment: str = "local") -> SimpleNamespace:
    return SimpleNamespace(
        tradelab_local_paper_engine_enabled=enabled,
        tradelab_environment=environment,
    )

class GuardOnlySession:
    def commit(self) -> None:
        raise AssertionError("Guard-blocked local paper engine tick must not commit.")

    def rollback(self) -> None:
        raise AssertionError("Guard-blocked local paper engine tick must not rollback.")

def _request(
    *,
    confirm: bool = True,
    max_candles_per_tick: int = 10000,
    worker_id: str = "local-paper-engine",
) -> PaperEngineTickLocalRequestData:
    return PaperEngineTickLocalRequestData(
        confirm_local_paper_engine_tick=confirm,
        max_candles_per_tick=max_candles_per_tick,
        worker_id=worker_id,
    )

@pytest.mark.parametrize(
    ("settings", "request_data", "reason_code"),
    [
        (_settings(enabled=False), _request(), "paper_engine_local_tick_not_enabled"),
        (_settings(environment="production"), _request(), "paper_engine_local_tick_environment_not_allowed"),
        (_settings(), _request(confirm=False), "paper_engine_local_tick_confirmation_required"),
        (_settings(), _request(max_candles_per_tick=0), "paper_engine_invalid_max_candles_per_tick"),
        (_settings(), _request(max_candles_per_tick=10001), "paper_engine_invalid_max_candles_per_tick"),
    ],
)
def test_local_tick_static_guards_block_before_mutation(settings, request_data, reason_code) -> None:
    result = execute_local_paper_engine_tick(GuardOnlySession(), settings=settings, request=request_data)

    assert result.status == "blocked"
    assert result.reason_code == reason_code
    assert result.session_id is None
    assert result.candles_processed == 0
    assert result.orders_created == 0
    assert result.fills_created == 0
    assert result.snapshots_created == 0
    assert result.safety_status == LOCAL_PAPER_ENGINE_SAFETY_STATUS
    assert result.should_commit is False
    assert result.should_rollback is False

def test_local_tick_sanitizes_worker_id_for_details(monkeypatch) -> None:
    class IdleRunner:
        def tick(self, *, max_candles_per_tick: int):
            from tradelab_api.services.paper_engine import PaperEngineTickResult

            return PaperEngineTickResult(
                status="idle",
                reason_code="paper_engine_no_queued_session",
                safety_status=LOCAL_PAPER_ENGINE_SAFETY_STATUS,
            )

    monkeypatch.setattr("tradelab_api.services.paper_engine_tick_local._build_runner", lambda *args, **kwargs: IdleRunner())

    result = execute_local_paper_engine_tick(
        SimpleNamespace(),
        settings=_settings(),
        request=_request(worker_id=" worker with apiSecret=hidden "),
    )

    assert result.status == "idle"
    assert result.reason_code == "paper_engine_no_queued_session"
    assert result.details["workerId"] == "worker-with-[REDACTED]=hidden"
    assert result.should_commit is False

class FakeRunner:
    def __init__(self, result: PaperEngineTickResult, calls: list[dict[str, object]]) -> None:
        self.result = result
        self.calls = calls

    def tick(self, *, max_candles_per_tick: int):
        self.calls.append({"max_candles_per_tick": max_candles_per_tick})
        return self.result

def test_local_tick_idle_does_not_commit(monkeypatch) -> None:
    calls: list[dict[str, object]] = []
    monkeypatch.setattr(
        "tradelab_api.services.paper_engine_tick_local._build_runner",
        lambda *args, **kwargs: FakeRunner(
            PaperEngineTickResult(
                status="idle",
                reason_code="paper_engine_no_queued_session",
                safety_status=LOCAL_PAPER_ENGINE_SAFETY_STATUS,
            ),
            calls,
        ),
    )

    result = execute_local_paper_engine_tick(
        SimpleNamespace(),
        settings=_settings(),
        request=_request(max_candles_per_tick=12),
    )

    assert result.status == "idle"
    assert result.reason_code == "paper_engine_no_queued_session"
    assert result.should_commit is False
    assert calls == [{"max_candles_per_tick": 12}]

def test_local_tick_completed_requests_commit(monkeypatch) -> None:
    calls: list[dict[str, object]] = []
    monkeypatch.setattr(
        "tradelab_api.services.paper_engine_tick_local._build_runner",
        lambda *args, **kwargs: FakeRunner(
            PaperEngineTickResult(
                status="completed",
                reason_code="paper_engine_completed",
                safety_status=LOCAL_PAPER_ENGINE_SAFETY_STATUS,
                session_id="paper-session-1",
                candles_processed=3,
                orders_created=0,
                fills_created=0,
                snapshots_created=3,
            ),
            calls,
        ),
    )

    result = execute_local_paper_engine_tick(SimpleNamespace(), settings=_settings(), request=_request())

    assert result.status == "completed"
    assert result.reason_code == "paper_engine_completed"
    assert result.session_id == "paper-session-1"
    assert result.candles_processed == 3
    assert result.orders_created == 0
    assert result.fills_created == 0
    assert result.snapshots_created == 3
    assert result.should_commit is True
    assert result.safety_status == LOCAL_PAPER_ENGINE_SAFETY_STATUS

def test_local_tick_unexpected_runner_error_requests_rollback(monkeypatch) -> None:
    def raise_error(*args, **kwargs):
        raise RuntimeError("boom apiSecret=hidden")

    monkeypatch.setattr("tradelab_api.services.paper_engine_tick_local._build_runner", raise_error)

    result = execute_local_paper_engine_tick(SimpleNamespace(), settings=_settings(), request=_request())

    assert result.status == "failed"
    assert result.reason_code == "paper_engine_unexpected_error"
    assert result.should_commit is False
    assert result.should_rollback is True
    assert result.semantic_status_code == 500
    assert result.details["errorMessage"] == "[REDACTED]"


def test_local_tick_build_runner_receives_kill_switch_enabled(monkeypatch) -> None:
    captured = {}

    class IdleRunner:
        def tick(self, *, max_candles_per_tick: int):
            return PaperEngineTickResult(
                status="idle",
                reason_code="paper_engine_no_queued_session",
                safety_status=LOCAL_PAPER_ENGINE_SAFETY_STATUS,
            )

    def fake_build_runner(session, *, worker_id, kill_switch_enabled=False):
        captured["kill_switch_enabled"] = kill_switch_enabled
        return IdleRunner()

    monkeypatch.setattr("tradelab_api.services.paper_engine_tick_local._build_runner", fake_build_runner)

    execute_local_paper_engine_tick(
        SimpleNamespace(),
        settings=SimpleNamespace(
            tradelab_local_paper_engine_enabled=True,
            tradelab_environment="local",
            tradelab_local_paper_kill_switch_enabled=True,
        ),
        request=_request(),
    )

    assert captured == {"kill_switch_enabled": True}


def test_build_runner_uses_subprocess_strategy_provider() -> None:
    runner = _build_runner(SimpleNamespace(), worker_id="local-worker")

    assert isinstance(runner.strategy_provider, SubprocessPaperStrategySignalProvider)
