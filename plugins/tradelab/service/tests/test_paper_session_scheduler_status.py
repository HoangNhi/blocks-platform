from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

from tradelab_api.services.paper_session_scheduler_status import get_paper_scheduler_status


def _dt(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 5, 29, hour, minute, tzinfo=timezone.utc)


def test_paper_scheduler_status_projects_in_memory_state() -> None:
    scheduler = SimpleNamespace(
        state=SimpleNamespace(
            enabled=True,
            running=False,
            worker_id="tradelab-local-paper-scheduler",
            interval_seconds=60.0,
            last_tick_started_at=_dt(10),
            last_tick_completed_at=_dt(10, 1),
            last_tick_status="processed",
            last_skip_reason=None,
            last_reason_code="paper_engine_completed",
            last_session_id="paper-session-1",
            candles_processed=100,
            orders_created=1,
            fills_created=1,
            snapshots_created=100,
            consecutive_failure_count=0,
        )
    )

    result = get_paper_scheduler_status(scheduler)

    assert result.enabled is True
    assert result.last_tick_status == "processed"
    assert result.last_session_id == "paper-session-1"
    assert result.candles_processed == 100
    assert result.safety_status == "read_only_paper_scheduler_visibility"


def test_paper_scheduler_status_returns_safe_fallback_when_scheduler_missing() -> None:
    result = get_paper_scheduler_status(None)

    assert result.enabled is False
    assert result.worker_id == "tradelab-local-paper-scheduler"
    assert result.last_tick_status == "disabled"
    assert result.last_skip_reason == "paper_scheduler_unavailable"
    assert result.last_reason_code == "paper_scheduler_unavailable"


def test_paper_scheduler_status_returns_safe_fallback_when_state_missing() -> None:
    result = get_paper_scheduler_status(SimpleNamespace())

    assert result.last_tick_status == "disabled"
    assert result.last_reason_code == "paper_scheduler_unavailable"
