from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace


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

def test_scheduler_does_not_claim_or_run_without_workload_authority() -> None:
    from tradelab_api.services.paper_session_scheduler import PaperSessionScheduler

    calls = []
    scheduler = PaperSessionScheduler(
        settings_factory=lambda: _settings(),
        session_factory=lambda: calls.append("session"),
        candidate_selector=lambda session: calls.append("claim"),
        run_local=lambda **kwargs: calls.append("run"),
    )
    assert scheduler.start() is False
    state = scheduler.tick_once(now=_dt(10))
    assert state.last_tick_status == "skipped"
    assert state.last_skip_reason == "workspace_authority_recheck_unavailable"
    assert calls == []
