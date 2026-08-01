from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from tradelab_api.services.dataset_fill_scheduler import LOCAL_SCHEDULER_DEFAULT_WORKER_ID

SCHEDULER_STATUS_SAFETY_STATUS = "read_only_scheduler_visibility"
SCHEDULER_STATUS_UNAVAILABLE_REASON = "dataset_fill_scheduler_unavailable"


@dataclass(slots=True, frozen=True)
class DatasetFillSchedulerStatusResult:
    enabled: bool
    running: bool
    worker_id: str
    interval_seconds: float
    last_tick_started_at: datetime | None
    last_tick_completed_at: datetime | None
    last_tick_status: str
    last_skip_reason: str | None
    last_reason_code: str | None
    last_job_id: str | None
    last_dataset_key: str | None
    stale_jobs_marked: int
    consecutive_failure_count: int
    safety_status: str = SCHEDULER_STATUS_SAFETY_STATUS


def get_fill_scheduler_status(scheduler: object | None) -> DatasetFillSchedulerStatusResult:
    state = getattr(scheduler, "state", None)
    if state is None:
        return DatasetFillSchedulerStatusResult(
            enabled=False,
            running=False,
            worker_id=LOCAL_SCHEDULER_DEFAULT_WORKER_ID,
            interval_seconds=60.0,
            last_tick_started_at=None,
            last_tick_completed_at=None,
            last_tick_status="disabled",
            last_skip_reason=SCHEDULER_STATUS_UNAVAILABLE_REASON,
            last_reason_code=SCHEDULER_STATUS_UNAVAILABLE_REASON,
            last_job_id=None,
            last_dataset_key=None,
            stale_jobs_marked=0,
            consecutive_failure_count=0,
        )

    return DatasetFillSchedulerStatusResult(
        enabled=bool(getattr(state, "enabled", False)),
        running=bool(getattr(state, "running", False)),
        worker_id=_non_empty_text(getattr(state, "worker_id", None), LOCAL_SCHEDULER_DEFAULT_WORKER_ID),
        interval_seconds=_number(getattr(state, "interval_seconds", None), 60.0),
        last_tick_started_at=_datetime_or_none(getattr(state, "last_tick_started_at", None)),
        last_tick_completed_at=_datetime_or_none(getattr(state, "last_tick_completed_at", None)),
        last_tick_status=_non_empty_text(getattr(state, "last_tick_status", None), "disabled"),
        last_skip_reason=_nullable_text(getattr(state, "last_skip_reason", None)),
        last_reason_code=_nullable_text(getattr(state, "last_reason_code", None)),
        last_job_id=_nullable_text(getattr(state, "last_job_id", None)),
        last_dataset_key=_nullable_text(getattr(state, "last_dataset_key", None)),
        stale_jobs_marked=max(_integer(getattr(state, "stale_jobs_marked", None), 0), 0),
        consecutive_failure_count=max(_integer(getattr(state, "consecutive_failure_count", None), 0), 0),
    )


def _non_empty_text(value: object, fallback: str) -> str:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return fallback


def _nullable_text(value: object) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _number(value: object, fallback: float) -> float:
    if isinstance(value, int | float):
        return float(value)
    return fallback


def _integer(value: object, fallback: int) -> int:
    if isinstance(value, int):
        return value
    return fallback


def _datetime_or_none(value: object) -> datetime | None:
    return value if isinstance(value, datetime) else None
