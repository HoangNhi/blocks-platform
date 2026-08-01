from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest

from tradelab_api.services.dataset_fill_worker_tick import (
    DatasetFillWorkerTickValidationError,
    tick_dataset_fill_worker,
)


def _dt(hour: int, minute: int = 0, second: int = 0) -> datetime:
    return datetime(2026, 1, 1, hour, minute, second, tzinfo=timezone.utc)


def _settings(*, enabled: bool = True, environment: str = "local") -> SimpleNamespace:
    return SimpleNamespace(
        tradelab_local_fill_enabled=enabled,
        tradelab_environment=environment,
        default_worker_identity="worker-default",
    )


def _provider_row(hour: int) -> dict[str, object]:
    timestamp = _dt(hour)
    return {
        "open_time": timestamp,
        "close_time": timestamp,
        "open": 100 + hour,
        "high": 101 + hour,
        "low": 99 + hour,
        "close": 100 + hour,
        "volume": 10,
        "quote_volume": 1000 + hour,
        "trade_count": 20 + hour,
    }


def _http_status_error(status_code: int) -> httpx.HTTPStatusError:
    request = httpx.Request("GET", "https://api.binance.test/api/v3/klines")
    response = httpx.Response(status_code, request=request)
    return httpx.HTTPStatusError("provider failed", request=request, response=response)


def _job(
    *,
    status: str = "queued",
    source: str = "background_fill_enqueue",
    heartbeat_at: datetime | None = None,
) -> SimpleNamespace:
    metadata = {
        "source": source,
        "requestSource": "strategy_lab",
        "safetyStatus": "queued_local_dev",
        "previewId": "preview-1",
        "requestFingerprint": "fingerprint-1",
        "missingRanges": [{"startAt": _dt(3).isoformat(), "endAt": _dt(6).isoformat(), "kind": "tail"}],
        "rowsFetched": 0,
        "rowsInserted": 0,
        "rowsSkippedExisting": 0,
        "attemptCount": 0,
    }
    if heartbeat_at is not None:
        metadata["heartbeatAt"] = heartbeat_at.isoformat()
    return SimpleNamespace(
        id=uuid4(),
        dataset_key="binance:BTCUSDT:1h",
        job_type="fill",
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        requested_start_at=_dt(0),
        requested_end_at=_dt(6),
        applied_start_at=_dt(0),
        applied_end_at=_dt(6),
        claimed_at=None,
        started_at=None,
        finished_at=None,
        worker_id=None,
        start_at=_dt(0),
        end_at=_dt(6),
        status=status,
        rows_imported=0,
        error_message=None,
        metadata_=metadata,
        is_active=True,
        is_deleted=False,
    )


class FakeClient:
    def __init__(
        self,
        rows: list[dict[str, object]] | None = None,
        exc: Exception | None = None,
        responses: list[list[dict[str, object]] | Exception] | None = None,
    ) -> None:
        self.rows = rows if rows is not None else [_provider_row(3), _provider_row(4), _provider_row(5), _provider_row(6)]
        self.exc = exc
        self.responses = list(responses) if responses is not None else None
        self.calls: list[dict[str, object]] = []

    def get_klines(self, *, symbol: str, interval: str, start_time: datetime, end_time: datetime, limit: int):
        self.calls.append({"symbol": symbol, "interval": interval, "start_time": start_time, "end_time": end_time, "limit": limit})
        if self.responses is not None:
            response = self.responses.pop(0)
            if isinstance(response, Exception):
                raise response
            return response
        if self.exc is not None:
            raise self.exc
        return self.rows


class FakeRepository:
    def __init__(self, jobs: list[SimpleNamespace] | None = None, existing_hours: tuple[int, ...] = (0, 1, 2)) -> None:
        self.jobs = jobs or []
        self.existing = [
            SimpleNamespace(open_time=_dt(hour), close_time=_dt(hour), open=1, high=1, low=1, close=1, volume=1)
            for hour in existing_hours
        ]
        self.inserted: list[dict[str, object]] = []
        self.coverage_refreshes = 0
        self.claim_calls = 0
        self.stale_calls = 0

    def mark_stale_background_fill_enqueue_jobs(self, *, now: datetime, stale_after: timedelta, updated_by: str) -> int:
        self.stale_calls += 1
        count = 0
        for job in self.jobs:
            metadata = dict(job.metadata_ or {})
            if job.status != "running" or metadata.get("source") != "background_fill_enqueue":
                continue
            raw_heartbeat = metadata.get("heartbeatAt")
            heartbeat = datetime.fromisoformat(raw_heartbeat) if isinstance(raw_heartbeat, str) else job.claimed_at or job.started_at
            if heartbeat is not None and heartbeat <= now - stale_after:
                job.status = "stale"
                metadata["reasonCode"] = "dataset_fill_worker_stale"
                metadata["safetyStatus"] = "local_dev_worker_tick"
                metadata["staleMarkedAt"] = now.isoformat()
                job.metadata_ = metadata
                count += 1
        return count

    def claim_next_background_fill_enqueue_job(self, *, worker_id: str, now: datetime):
        self.claim_calls += 1
        for job in self.jobs:
            metadata = dict(job.metadata_ or {})
            if job.status == "queued" and job.job_type == "fill" and metadata.get("source") == "background_fill_enqueue":
                job.status = "running"
                job.claimed_at = now
                job.started_at = now
                job.worker_id = worker_id
                metadata["workerId"] = worker_id
                metadata["heartbeatAt"] = now.isoformat()
                metadata["attemptCount"] = int(metadata.get("attemptCount") or 0) + 1
                metadata["safetyStatus"] = "local_dev_worker_tick"
                job.metadata_ = metadata
                return job
        return None

    def claim_next_retryable_background_fill_enqueue_job(self, *, worker_id: str, now: datetime):
        self.claim_calls += 1
        for job in self.jobs:
            metadata = dict(job.metadata_ or {})
            if job.status != "running" or job.job_type != "fill" or metadata.get("source") != "background_fill_enqueue":
                continue
            retry_range = next(
                (
                    item
                    for item in metadata.get("ranges", [])
                    if isinstance(item, dict) and item.get("status") == "retrying"
                ),
                None,
            )
            if retry_range is None:
                continue
            raw_next_retry_at = retry_range.get("nextRetryAt") or metadata.get("nextRetryAt")
            next_retry_at = datetime.fromisoformat(str(raw_next_retry_at)) if raw_next_retry_at else None
            if next_retry_at is not None and next_retry_at > now:
                continue
            metadata["workerId"] = worker_id
            metadata["heartbeatAt"] = now.isoformat()
            metadata["safetyStatus"] = "local_dev_worker_tick"
            job.metadata_ = metadata
            job.worker_id = worker_id
            return job
        return None

    def claim_next_cancel_requested_background_fill_enqueue_job(self, *, worker_id: str, now: datetime):
        self.claim_calls += 1
        for job in self.jobs:
            metadata = dict(job.metadata_ or {})
            if job.status == "cancel_requested" and job.job_type == "fill" and metadata.get("source") == "background_fill_enqueue":
                metadata["workerId"] = worker_id
                metadata["heartbeatAt"] = now.isoformat()
                metadata["safetyStatus"] = "local_dev_cancel_only"
                job.metadata_ = metadata
                job.worker_id = worker_id
                return job
        return None

    def list_market_candles(self, *, exchange: str, symbol: str, timeframe: str, start_at=None, end_at=None):
        candles = list(self.existing) + [
            SimpleNamespace(
                open_time=row["open_time"],
                close_time=row["close_time"],
                open=row["open"],
                high=row["high"],
                low=row["low"],
                close=row["close"],
                volume=row["volume"],
            )
            for row in self.inserted
        ]
        if start_at is not None:
            candles = [candle for candle in candles if candle.open_time >= start_at]
        if end_at is not None:
            candles = [candle for candle in candles if candle.open_time <= end_at]
        return candles

    def create_market_candles(self, candles: list[dict[str, object]]):
        self.inserted.extend(candles)
        return [SimpleNamespace(id=uuid4(), **row) for row in candles]

    def refresh_coverage_from_candles(self, **kwargs):
        self.coverage_refreshes += 1
        return SimpleNamespace(id=uuid4(), **kwargs)

    def complete_import_job(self, job, *, applied_start_at, applied_end_at, rows_imported: int, status: str, error_message: str | None = None):
        job.applied_start_at = applied_start_at
        job.applied_end_at = applied_end_at
        job.rows_imported = rows_imported
        job.status = status
        job.finished_at = _dt(12)
        job.error_message = error_message
        return job

    def mark_background_fill_enqueue_job_cancelled(
        self,
        job,
        *,
        now: datetime,
        updated_by: str,
        rows_fetched: int,
        rows_inserted: int,
        rows_skipped_existing: int,
        range_results: list[dict[str, object]],
    ):
        metadata = dict(job.metadata_ or {})
        metadata["reasonCode"] = "dataset_fill_cancelled"
        metadata["cancelObservedAt"] = now.isoformat()
        metadata["cancelObservedBy"] = updated_by
        metadata["cancelledAt"] = now.isoformat()
        metadata["safetyStatus"] = "local_dev_cancel_only"
        metadata["rowsFetched"] = rows_fetched
        metadata["rowsInserted"] = rows_inserted
        metadata["rowsSkippedExisting"] = rows_skipped_existing
        metadata["ranges"] = range_results
        job.metadata_ = metadata
        job.rows_imported = rows_inserted
        job.status = "cancelled"
        job.finished_at = now
        job.updated_by = updated_by
        return job


def test_worker_tick_claims_one_background_job_and_completes() -> None:
    job = _job()
    repository = FakeRepository(jobs=[job])
    client = FakeClient()

    result = tick_dataset_fill_worker(
        repository,
        client,
        settings=_settings(),
        confirm_local_worker_tick=True,
        worker_id="worker-1",
        now=_dt(12),
    )

    assert result.processed is True
    assert result.job_id == str(job.id)
    assert result.status == "completed"
    assert result.safety_status == "local_dev_worker_tick"
    assert result.rows_fetched == 4
    assert result.rows_inserted == 4
    assert result.rows_skipped_existing == 0
    assert repository.claim_calls == 3
    assert repository.coverage_refreshes == 1
    assert job.worker_id == "worker-1"
    assert job.metadata_["workerId"] == "worker-1"
    assert job.metadata_["attemptCount"] == 1
    assert job.metadata_["ranges"][0]["status"] == "completed"


def test_worker_tick_is_insert_only_for_existing_candles() -> None:
    job = _job()
    repository = FakeRepository(jobs=[job], existing_hours=(0, 1, 2, 3, 4))
    client = FakeClient(rows=[_provider_row(3), _provider_row(4), _provider_row(5), _provider_row(6)])

    result = tick_dataset_fill_worker(
        repository,
        client,
        settings=_settings(),
        confirm_local_worker_tick=True,
        worker_id="worker-1",
        now=_dt(12),
    )

    assert result.rows_fetched == 4
    assert result.rows_inserted == 2
    assert result.rows_skipped_existing == 2
    assert [row["open_time"] for row in repository.inserted] == [_dt(5), _dt(6)]


def test_worker_tick_ignores_non_background_enqueue_job() -> None:
    repository = FakeRepository(jobs=[_job(source="strategy_lab_local_fill")])
    client = FakeClient()

    result = tick_dataset_fill_worker(
        repository,
        client,
        settings=_settings(),
        confirm_local_worker_tick=True,
        worker_id="worker-1",
        now=_dt(12),
    )

    assert result.processed is False
    assert result.status == "idle"
    assert client.calls == []
    assert repository.inserted == []


def test_worker_tick_schedules_retry_for_retryable_provider_failure() -> None:
    job = _job()
    repository = FakeRepository(jobs=[job])
    client = FakeClient(exc=_http_status_error(429))

    result = tick_dataset_fill_worker(
        repository,
        client,
        settings=_settings(),
        confirm_local_worker_tick=True,
        worker_id="worker-1",
        now=_dt(12),
    )

    assert result.processed is True
    assert result.status == "running"
    assert result.reason_code == "dataset_fill_provider_rate_limited"
    assert result.provider_status == "429"
    assert result.attempt_count == 1
    assert result.max_attempts == 3
    assert result.retry_exhausted is False
    assert job.status == "running"
    assert job.metadata_["hasRetryableFailure"] is True
    assert job.metadata_["retryExhausted"] is False
    assert job.metadata_["ranges"][0]["status"] == "retrying"
    assert job.metadata_["ranges"][0]["attemptCount"] == 1
    assert job.metadata_["ranges"][0]["maxAttempts"] == 3
    assert job.metadata_["ranges"][0]["retryDelaySeconds"] == 5
    assert job.metadata_["ranges"][0]["nextRetryAt"] == _dt(12, 0, 5).isoformat()
    assert repository.inserted == []


def test_worker_tick_resumes_due_retrying_job_and_completes() -> None:
    job = _job(status="running")
    metadata = dict(job.metadata_)
    metadata["ranges"] = [
        {
            "startAt": _dt(3).isoformat(),
            "endAt": _dt(6).isoformat(),
            "kind": "tail",
            "status": "retrying",
            "attemptCount": 1,
            "maxAttempts": 3,
            "nextRetryAt": _dt(11, 59).isoformat(),
            "retryDelaySeconds": 5,
            "attempts": [],
        }
    ]
    job.metadata_ = metadata
    repository = FakeRepository(jobs=[job])
    client = FakeClient()

    result = tick_dataset_fill_worker(
        repository,
        client,
        settings=_settings(),
        confirm_local_worker_tick=True,
        worker_id="worker-1",
        now=_dt(12),
    )

    assert result.processed is True
    assert result.status == "completed"
    assert result.attempt_count == 2
    assert result.max_attempts == 3
    assert result.retry_exhausted is False
    assert job.status == "completed"
    assert job.metadata_["ranges"][0]["status"] == "completed"
    assert job.metadata_["ranges"][0]["attemptCount"] == 2
    assert repository.coverage_refreshes == 1


def test_worker_tick_waits_until_next_retry_at() -> None:
    job = _job(status="running")
    metadata = dict(job.metadata_)
    metadata["ranges"] = [
        {
            "startAt": _dt(3).isoformat(),
            "endAt": _dt(6).isoformat(),
            "kind": "tail",
            "status": "retrying",
            "attemptCount": 1,
            "maxAttempts": 3,
            "nextRetryAt": _dt(12, 1).isoformat(),
            "retryDelaySeconds": 5,
            "attempts": [],
        }
    ]
    job.metadata_ = metadata
    repository = FakeRepository(jobs=[job])
    client = FakeClient()

    result = tick_dataset_fill_worker(
        repository,
        client,
        settings=_settings(),
        confirm_local_worker_tick=True,
        worker_id="worker-1",
        now=_dt(12),
    )

    assert result.processed is False
    assert result.status == "idle"
    assert job.status == "running"
    assert client.calls == []


def test_worker_tick_marks_failed_when_retry_budget_exhausted() -> None:
    job = _job(status="running")
    metadata = dict(job.metadata_)
    metadata["ranges"] = [
        {
            "startAt": _dt(3).isoformat(),
            "endAt": _dt(6).isoformat(),
            "kind": "tail",
            "status": "retrying",
            "attemptCount": 2,
            "maxAttempts": 3,
            "nextRetryAt": _dt(11, 59).isoformat(),
            "retryDelaySeconds": 15,
            "attempts": [],
        }
    ]
    job.metadata_ = metadata
    repository = FakeRepository(jobs=[job])
    client = FakeClient(exc=_http_status_error(429))

    result = tick_dataset_fill_worker(
        repository,
        client,
        settings=_settings(),
        confirm_local_worker_tick=True,
        worker_id="worker-1",
        now=_dt(12),
    )

    assert result.processed is True
    assert result.status == "failed"
    assert result.reason_code == "dataset_fill_provider_rate_limited"
    assert result.provider_status == "429"
    assert result.attempt_count == 3
    assert result.max_attempts == 3
    assert result.retry_exhausted is True
    assert job.status == "failed"
    assert job.metadata_["retryExhausted"] is True
    assert job.metadata_["failedRange"]["attemptCount"] == 3


def test_worker_tick_does_not_retry_empty_provider_response() -> None:
    job = _job()
    repository = FakeRepository(jobs=[job])
    client = FakeClient(rows=[])

    result = tick_dataset_fill_worker(
        repository,
        client,
        settings=_settings(),
        confirm_local_worker_tick=True,
        worker_id="worker-1",
        now=_dt(12),
    )

    assert result.processed is True
    assert result.status == "failed"
    assert result.reason_code == "dataset_fill_provider_empty"
    assert result.provider_status == "empty_response"
    assert result.retry_exhausted is False
    assert job.status == "failed"
    assert job.metadata_.get("nextRetryAt") is None


def test_worker_tick_marks_running_stale_job_without_requeue() -> None:
    stale_job = _job(status="running", heartbeat_at=_dt(11, 40))
    repository = FakeRepository(jobs=[stale_job])
    client = FakeClient()

    result = tick_dataset_fill_worker(
        repository,
        client,
        settings=_settings(),
        confirm_local_worker_tick=True,
        worker_id="worker-1",
        now=_dt(12),
    )

    assert result.processed is False
    assert result.stale_jobs_marked == 1
    assert stale_job.status == "stale"
    assert stale_job.metadata_["reasonCode"] == "dataset_fill_worker_stale"
    assert client.calls == []


def test_worker_tick_marks_cancel_requested_job_cancelled_before_provider_call() -> None:
    job = _job(status="cancel_requested")
    metadata = dict(job.metadata_)
    metadata["cancelRequestedAt"] = _dt(11, 59).isoformat()
    metadata["cancelRequestedBy"] = "admin"
    metadata["cancelReason"] = "user_requested"
    job.metadata_ = metadata
    repository = FakeRepository(jobs=[job])
    client = FakeClient()

    result = tick_dataset_fill_worker(
        repository,
        client,
        settings=_settings(),
        confirm_local_worker_tick=True,
        worker_id="worker-1",
        now=_dt(12),
    )

    assert result.processed is True
    assert result.status == "cancelled"
    assert result.safety_status == "local_dev_cancel_only"
    assert result.reason_code == "dataset_fill_cancelled"
    assert result.rows_inserted == 0
    assert job.status == "cancelled"
    assert job.metadata_["cancelObservedBy"] == "worker-1"
    assert client.calls == []
    assert repository.inserted == []
    assert repository.coverage_refreshes == 0


def test_worker_tick_stops_before_next_provider_call_when_cancel_observed_between_ranges() -> None:
    job = _job()
    metadata = dict(job.metadata_)
    metadata["missingRanges"] = [
        {"startAt": _dt(3).isoformat(), "endAt": _dt(4).isoformat(), "kind": "gap"},
        {"startAt": _dt(5).isoformat(), "endAt": _dt(6).isoformat(), "kind": "tail"},
    ]
    job.metadata_ = metadata
    repository = FakeRepository(jobs=[job])
    client = FakeClient(responses=[[_provider_row(3), _provider_row(4)], [_provider_row(5), _provider_row(6)]])

    original_create = repository.create_market_candles

    def create_then_cancel(candles):
        inserted = original_create(candles)
        job.status = "cancel_requested"
        metadata_after_insert = dict(job.metadata_ or {})
        metadata_after_insert["cancelRequestedAt"] = _dt(12).isoformat()
        metadata_after_insert["cancelRequestedBy"] = "admin"
        metadata_after_insert["cancelReason"] = "user_requested"
        job.metadata_ = metadata_after_insert
        return inserted

    repository.create_market_candles = create_then_cancel

    result = tick_dataset_fill_worker(
        repository,
        client,
        settings=_settings(),
        confirm_local_worker_tick=True,
        worker_id="worker-1",
        now=_dt(12),
    )

    assert result.processed is True
    assert result.status == "cancelled"
    assert result.reason_code == "dataset_fill_cancelled"
    assert len(client.calls) == 1
    assert [row["open_time"] for row in repository.inserted] == [_dt(3), _dt(4)]
    assert job.status == "cancelled"
    assert job.metadata_["rowsInserted"] == 2
    assert job.metadata_["ranges"][0]["status"] == "completed"
    assert repository.coverage_refreshes == 1


@pytest.mark.parametrize(
    ("settings", "confirm", "reason_code"),
    [
        (_settings(enabled=False), True, "dataset_fill_worker_local_disabled"),
        (_settings(environment="production"), True, "dataset_fill_worker_environment_not_allowed"),
        (_settings(), False, "dataset_fill_worker_confirm_required"),
    ],
)
def test_worker_tick_guards_do_not_mutate(settings: SimpleNamespace, confirm: bool, reason_code: str) -> None:
    repository = FakeRepository(jobs=[_job()])
    client = FakeClient()

    with pytest.raises(DatasetFillWorkerTickValidationError) as exc:
        tick_dataset_fill_worker(
            repository,
            client,
            settings=settings,
            confirm_local_worker_tick=confirm,
            worker_id="worker-1",
            now=_dt(12),
        )

    assert exc.value.reason_code == reason_code
    assert repository.claim_calls == 0
    assert repository.stale_calls == 0
    assert client.calls == []
    assert repository.inserted == []
