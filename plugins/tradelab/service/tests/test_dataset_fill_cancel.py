from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from tradelab_api.services.dataset_fill_cancel import (
    DatasetFillCancelValidationError,
    mark_fill_job_cancel_requested,
)


def _dt(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 1, 1, hour, minute, tzinfo=timezone.utc)


def _settings(*, enabled: bool = True, environment: str = "local") -> SimpleNamespace:
    return SimpleNamespace(tradelab_local_fill_enabled=enabled, tradelab_environment=environment)


def _job(
    *,
    status: str = "running",
    source: str = "background_fill_enqueue",
    job_type: str = "fill",
    active: bool = True,
    deleted: bool = False,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        dataset_key="binance:BTCUSDT:1h",
        job_type=job_type,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        requested_start_at=_dt(0),
        requested_end_at=_dt(6),
        applied_start_at=_dt(0),
        applied_end_at=_dt(6),
        claimed_at=_dt(9, 45),
        started_at=_dt(9, 45),
        finished_at=None,
        worker_id="worker-old",
        start_at=_dt(0),
        end_at=_dt(6),
        status=status,
        rows_imported=0,
        error_message=None,
        metadata_={
            "source": source,
            "workerId": "worker-old",
            "heartbeatAt": _dt(9, 50).isoformat(),
            "missingRanges": [{"startAt": _dt(3).isoformat(), "endAt": _dt(6).isoformat(), "kind": "tail"}],
            "rowsFetched": 0,
            "rowsInserted": 0,
            "rowsSkippedExisting": 0,
        },
        is_active=active,
        is_deleted=deleted,
        updated_by=None,
    )


class FakeRepository:
    def __init__(self, jobs: list[SimpleNamespace] | None = None) -> None:
        self.jobs = jobs or []
        self.cancel_calls = 0
        self.candle_calls = 0

    def get_import_job(self, job_id):
        return next((job for job in self.jobs if str(job.id) == str(job_id)), None)

    def mark_background_fill_enqueue_job_cancel_requested(self, job, *, now, updated_by: str, reason: str):
        self.cancel_calls += 1
        metadata = dict(job.metadata_ or {})
        metadata.update(
            {
                "reasonCode": "dataset_fill_cancel_requested",
                "cancelRequestedAt": now.isoformat(),
                "cancelRequestedBy": updated_by,
                "cancelReason": reason,
                "safetyStatus": "local_dev_cancel_only",
            }
        )
        job.metadata_ = metadata
        job.status = "cancel_requested"
        job.finished_at = None
        job.updated_by = updated_by
        return job

    def create_market_candles(self, candles):
        self.candle_calls += 1
        raise AssertionError("Cancel request must not create candles.")


def test_cancel_request_marks_running_background_job_cancel_requested() -> None:
    job = _job()
    repository = FakeRepository([job])

    result = mark_fill_job_cancel_requested(
        repository,
        settings=_settings(),
        job_id=str(job.id),
        confirm_cancel=True,
        reason="user_requested",
        requested_by="admin",
        now=_dt(10, 0),
    )

    assert result.job_id == str(job.id)
    assert result.dataset_key == "binance:BTCUSDT:1h"
    assert result.status == "cancel_requested"
    assert result.reason_code == "dataset_fill_cancel_requested"
    assert result.safety_status == "local_dev_cancel_only"
    assert job.status == "cancel_requested"
    assert job.is_active is True
    assert job.is_deleted is False
    assert job.finished_at is None
    assert job.updated_by == "admin"
    assert job.metadata_["cancelRequestedAt"] == _dt(10, 0).isoformat()
    assert job.metadata_["cancelRequestedBy"] == "admin"
    assert job.metadata_["cancelReason"] == "user_requested"
    assert job.metadata_["safetyStatus"] == "local_dev_cancel_only"
    assert repository.cancel_calls == 1
    assert repository.candle_calls == 0


@pytest.mark.parametrize(
    ("settings", "confirm", "reason", "reason_code"),
    [
        (_settings(enabled=False), True, "user_requested", "dataset_fill_cancel_local_disabled"),
        (_settings(environment="production"), True, "user_requested", "dataset_fill_cancel_not_local_dev"),
        (_settings(), False, "user_requested", "dataset_fill_cancel_confirm_required"),
        (_settings(), True, "", "dataset_fill_cancel_reason_invalid"),
        (_settings(), True, "x" * 121, "dataset_fill_cancel_reason_invalid"),
    ],
)
def test_cancel_request_guards_do_not_mutate(settings, confirm, reason, reason_code) -> None:
    job = _job()
    repository = FakeRepository([job])

    with pytest.raises(DatasetFillCancelValidationError) as exc:
        mark_fill_job_cancel_requested(
            repository,
            settings=settings,
            job_id=str(job.id),
            confirm_cancel=confirm,
            reason=reason,
            requested_by="admin",
            now=_dt(10),
        )

    assert exc.value.reason_code == reason_code
    assert job.status == "running"
    assert repository.cancel_calls == 0


@pytest.mark.parametrize(
    ("job", "reason_code"),
    [
        (_job(status="queued"), "dataset_fill_cancel_not_running"),
        (_job(status="stale"), "dataset_fill_cancel_not_running"),
        (_job(status="completed"), "dataset_fill_cancel_not_running"),
        (_job(status="failed"), "dataset_fill_cancel_not_running"),
        (_job(status="cancelled"), "dataset_fill_cancel_not_running"),
        (_job(status="cancel_requested"), "dataset_fill_cancel_not_running"),
        (_job(source="strategy_lab_local_fill"), "dataset_fill_cancel_wrong_source"),
        (_job(job_type="repair"), "dataset_fill_cancel_job_not_found"),
        (_job(active=False), "dataset_fill_cancel_job_not_found"),
        (_job(deleted=True), "dataset_fill_cancel_job_not_found"),
    ],
)
def test_cancel_request_rejects_jobs_outside_contract(job, reason_code) -> None:
    repository = FakeRepository([job])

    with pytest.raises(DatasetFillCancelValidationError) as exc:
        mark_fill_job_cancel_requested(
            repository,
            settings=_settings(),
            job_id=str(job.id),
            confirm_cancel=True,
            reason="user_requested",
            requested_by="admin",
            now=_dt(10),
        )

    assert exc.value.reason_code == reason_code
    assert repository.cancel_calls == 0


def test_cancel_request_rejects_invalid_job_id() -> None:
    repository = FakeRepository([])

    with pytest.raises(DatasetFillCancelValidationError) as exc:
        mark_fill_job_cancel_requested(
            repository,
            settings=_settings(),
            job_id="not-a-uuid",
            confirm_cancel=True,
            reason="user_requested",
            requested_by="admin",
            now=_dt(10),
        )

    assert exc.value.reason_code == "dataset_fill_cancel_job_not_found"
    assert repository.cancel_calls == 0
