from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

from tradelab_api.services.dataset_fill_scheduler_status import get_fill_scheduler_status


def _dt(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 5, 19, hour, minute, tzinfo=timezone.utc)


def test_scheduler_status_projects_in_memory_state() -> None:
    scheduler = SimpleNamespace(
        state=SimpleNamespace(
            enabled=True,
            running=False,
            worker_id="trade-lab-local-scheduler",
            interval_seconds=60.0,
            last_tick_started_at=_dt(10),
            last_tick_completed_at=_dt(10, 1),
            last_tick_status="processed",
            last_skip_reason=None,
            last_reason_code=None,
            last_job_id="job-1",
            last_dataset_key="binance:BTCUSDT:1h",
            stale_jobs_marked=2,
            consecutive_failure_count=0,
        )
    )

    result = get_fill_scheduler_status(scheduler)

    assert result.enabled is True
    assert result.running is False
    assert result.worker_id == "trade-lab-local-scheduler"
    assert result.interval_seconds == 60.0
    assert result.last_tick_started_at == _dt(10)
    assert result.last_tick_completed_at == _dt(10, 1)
    assert result.last_tick_status == "processed"
    assert result.last_skip_reason is None
    assert result.last_reason_code is None
    assert result.last_job_id == "job-1"
    assert result.last_dataset_key == "binance:BTCUSDT:1h"
    assert result.stale_jobs_marked == 2
    assert result.consecutive_failure_count == 0
    assert result.safety_status == "read_only_scheduler_visibility"


def test_scheduler_status_returns_safe_unavailable_fallback_when_scheduler_missing() -> None:
    result = get_fill_scheduler_status(None)

    assert result.enabled is False
    assert result.running is False
    assert result.worker_id == "trade-lab-local-scheduler"
    assert result.interval_seconds == 60.0
    assert result.last_tick_started_at is None
    assert result.last_tick_completed_at is None
    assert result.last_tick_status == "disabled"
    assert result.last_skip_reason == "dataset_fill_scheduler_unavailable"
    assert result.last_reason_code == "dataset_fill_scheduler_unavailable"
    assert result.last_job_id is None
    assert result.last_dataset_key is None
    assert result.stale_jobs_marked == 0
    assert result.consecutive_failure_count == 0
    assert result.safety_status == "read_only_scheduler_visibility"


def test_scheduler_status_returns_safe_unavailable_fallback_when_state_missing() -> None:
    result = get_fill_scheduler_status(SimpleNamespace())

    assert result.last_tick_status == "disabled"
    assert result.last_skip_reason == "dataset_fill_scheduler_unavailable"
    assert result.last_reason_code == "dataset_fill_scheduler_unavailable"
