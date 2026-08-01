from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from tradelab_api.services.dataset_fill_enqueue_local import (
    DatasetFillEnqueueLocalValidationError,
    enqueue_dataset_fill_local,
)
from tradelab_api.services.dataset_fill_stale_recovery import (
    DatasetFillMarkStaleFailedValidationError,
    mark_stale_fill_job_failed,
)


def _dt(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 1, 1, hour, minute, tzinfo=timezone.utc)


def _settings(*, enabled: bool = True, environment: str = "local") -> SimpleNamespace:
    return SimpleNamespace(tradelab_local_fill_enabled=enabled, tradelab_environment=environment)


def _job(
    *,
    status: str = "stale",
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
            "workerId": "worker-metadata",
            "heartbeatAt": _dt(9, 50).isoformat(),
            "staleMarkedAt": _dt(10, 0).isoformat(),
            "missingRanges": [{"startAt": _dt(3).isoformat(), "endAt": _dt(6).isoformat(), "kind": "tail"}],
            "requestFingerprint": "fingerprint-1",
            "previewId": "preview-1",
        },
        is_active=active,
        is_deleted=deleted,
        updated_by=None,
    )


class FakeRepository:
    def __init__(self, jobs: list[SimpleNamespace] | None = None) -> None:
        self.jobs = jobs or []
        self.mark_calls = 0
        self.created_jobs: list[dict[str, object]] = []

    def get_import_job(self, job_id):
        return next((job for job in self.jobs if str(job.id) == str(job_id)), None)

    def mark_stale_background_fill_enqueue_job_failed(self, job, *, now, updated_by: str, reason: str):
        self.mark_calls += 1
        metadata = dict(job.metadata_ or {})
        heartbeat = datetime.fromisoformat(str(metadata["heartbeatAt"]))
        metadata.update(
            {
                "reasonCode": "dataset_fill_stale_marked_failed",
                "recoveryAction": "mark_stale_failed",
                "recoveryRequestedAt": now.isoformat(),
                "recoveryRequestedBy": updated_by,
                "recoveryReason": reason,
                "lastHeartbeatAt": heartbeat.isoformat(),
                "previousWorkerId": metadata.get("workerId") or job.worker_id,
                "staleAgeSeconds": int((now - heartbeat).total_seconds()),
                "safetyStatus": "local_dev_recovery_only",
            }
        )
        job.metadata_ = metadata
        job.status = "failed"
        job.finished_at = now
        job.error_message = "Stale background fill job marked failed for local/dev recovery."
        job.updated_by = updated_by
        return job

    def get_coverage(self, *, dataset_key: str):
        return None

    def list_coverage_segments(self, *, coverage_id):
        return []

    def list_market_candle_source_summary(self, **kwargs):
        return []

    def list_market_candles(self, *, exchange: str, symbol: str, timeframe: str, start_at=None, end_at=None):
        return [
            SimpleNamespace(open_time=_dt(0), close_time=_dt(0), open=1, high=1, low=1, close=1, volume=1),
            SimpleNamespace(open_time=_dt(1), close_time=_dt(1), open=1, high=1, low=1, close=1, volume=1),
            SimpleNamespace(open_time=_dt(2), close_time=_dt(2), open=1, high=1, low=1, close=1, volume=1),
        ]

    def find_compatible_active_import_job(self, *, dataset_key: str, job_type: str, start_at: datetime, end_at: datetime):
        return None

    def list_active_fill_jobs_for_dataset(self, *, dataset_key: str):
        return [
            job
            for job in self.jobs
            if job.dataset_key == dataset_key and job.status in {"queued", "running", "cancel_requested", "stale"}
        ]

    def create_import_job(self, **fields):
        self.created_jobs.append(fields)
        return SimpleNamespace(id=uuid4(), **fields)


def test_mark_stale_background_job_failed_records_audit_metadata() -> None:
    job = _job()
    repository = FakeRepository([job])

    result = mark_stale_fill_job_failed(
        repository,
        settings=_settings(),
        job_id=str(job.id),
        confirm_mark_failed=True,
        reason="stale_worker_heartbeat",
        requested_by="admin",
        now=_dt(10, 15),
    )

    assert result.job_id == str(job.id)
    assert result.dataset_key == "binance:BTCUSDT:1h"
    assert result.status == "failed"
    assert result.reason_code == "dataset_fill_stale_marked_failed"
    assert result.safety_status == "local_dev_recovery_only"
    assert job.status == "failed"
    assert job.is_active is True
    assert job.is_deleted is False
    assert job.finished_at == _dt(10, 15)
    assert job.updated_by == "admin"
    assert job.metadata_["recoveryAction"] == "mark_stale_failed"
    assert job.metadata_["recoveryRequestedBy"] == "admin"
    assert job.metadata_["recoveryReason"] == "stale_worker_heartbeat"
    assert job.metadata_["lastHeartbeatAt"] == _dt(9, 50).isoformat()
    assert job.metadata_["previousWorkerId"] == "worker-metadata"
    assert job.metadata_["staleMarkedAt"] == _dt(10, 0).isoformat()
    assert job.metadata_["staleAgeSeconds"] == 1500
    assert repository.mark_calls == 1


@pytest.mark.parametrize(
    ("settings", "confirm", "reason", "reason_code"),
    [
        (_settings(enabled=False), True, "stale_worker_heartbeat", "dataset_fill_recovery_local_disabled"),
        (_settings(environment="production"), True, "stale_worker_heartbeat", "dataset_fill_recovery_not_local_dev"),
        (_settings(), False, "stale_worker_heartbeat", "dataset_fill_recovery_confirm_required"),
        (_settings(), True, "", "dataset_fill_recovery_reason_invalid"),
        (_settings(), True, "x" * 121, "dataset_fill_recovery_reason_invalid"),
    ],
)
def test_recovery_guards_do_not_mutate(settings, confirm, reason, reason_code) -> None:
    job = _job()
    repository = FakeRepository([job])

    with pytest.raises(DatasetFillMarkStaleFailedValidationError) as exc:
        mark_stale_fill_job_failed(
            repository,
            settings=settings,
            job_id=str(job.id),
            confirm_mark_failed=confirm,
            reason=reason,
            requested_by="admin",
            now=_dt(10, 15),
        )

    assert exc.value.reason_code == reason_code
    assert job.status == "stale"
    assert repository.mark_calls == 0


@pytest.mark.parametrize(
    ("job", "reason_code"),
    [
        (_job(status="running"), "dataset_fill_recovery_not_stale"),
        (_job(status="failed"), "dataset_fill_recovery_not_stale"),
        (_job(source="strategy_lab_local_fill"), "dataset_fill_recovery_wrong_source"),
        (_job(job_type="repair"), "dataset_fill_recovery_job_not_found"),
        (_job(active=False), "dataset_fill_recovery_job_not_found"),
        (_job(deleted=True), "dataset_fill_recovery_job_not_found"),
    ],
)
def test_recovery_rejects_jobs_outside_contract(job, reason_code) -> None:
    repository = FakeRepository([job])

    with pytest.raises(DatasetFillMarkStaleFailedValidationError) as exc:
        mark_stale_fill_job_failed(
            repository,
            settings=_settings(),
            job_id=str(job.id),
            confirm_mark_failed=True,
            reason="stale_worker_heartbeat",
            requested_by="admin",
            now=_dt(10, 15),
        )

    assert exc.value.reason_code == reason_code
    assert repository.mark_calls == 0


def test_recovery_rejects_missing_or_invalid_job_id() -> None:
    repository = FakeRepository([])

    with pytest.raises(DatasetFillMarkStaleFailedValidationError) as exc:
        mark_stale_fill_job_failed(
            repository,
            settings=_settings(),
            job_id="not-a-uuid",
            confirm_mark_failed=True,
            reason="stale_worker_heartbeat",
            requested_by="admin",
            now=_dt(10, 15),
        )

    assert exc.value.reason_code == "dataset_fill_recovery_job_not_found"
    assert repository.mark_calls == 0


def test_mark_failed_releases_duplicate_active_enqueue_blocker() -> None:
    job = _job()
    repository = FakeRepository([job])

    with pytest.raises(DatasetFillEnqueueLocalValidationError) as before_exc:
        _enqueue(repository)
    assert before_exc.value.reason_code == "dataset_fill_job_already_active"

    mark_stale_fill_job_failed(
        repository,
        settings=_settings(),
        job_id=str(job.id),
        confirm_mark_failed=True,
        reason="stale_worker_heartbeat",
        requested_by="admin",
        now=_dt(10, 15),
    )
    result = _enqueue(repository)

    assert result.status == "queued"
    assert len(repository.created_jobs) == 1


def _enqueue(repository: FakeRepository):
    strategy_id = uuid4()
    preview = enqueue_dataset_fill_local.preview_builder(
        repository,
        strategy_id=strategy_id,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        requested_start_at=_dt(0),
        requested_end_at=_dt(6),
        source="strategy_lab",
        generated_at=_dt(12),
    )
    return enqueue_dataset_fill_local(
        repository,
        settings=_settings(),
        strategy_id=strategy_id,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        requested_start_at=_dt(0),
        requested_end_at=_dt(6),
        preview_id=preview.preview_id,
        request_fingerprint=preview.request_fingerprint,
        missing_ranges=[{"start_at": _dt(3), "end_at": _dt(6), "kind": "tail"}],
        confirm_local_fill=True,
        source="strategy_lab",
        generated_at=_dt(12),
    )
