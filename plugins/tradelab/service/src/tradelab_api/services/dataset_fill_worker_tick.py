from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from tradelab_api.db.models import MarketDataImportJob
from tradelab_api.services.exchanges.binance_spot import BinanceSpotClient
from tradelab_api.services.market_data_integrity import inspect_candles
from tradelab_api.services.market_data_repository import MarketDataRepository
from tradelab_api.services.market_data_service import _fetch_remote_candles, _to_market_candle_rows

LOCAL_WORKER_ALLOWED_ENVIRONMENTS = {"local", "dev", "development", "test", "testing"}
LOCAL_WORKER_SAFETY_STATUS = "local_dev_worker_tick"
LOCAL_CANCEL_SAFETY_STATUS = "local_dev_cancel_only"
LOCAL_CANCELLED_REASON_CODE = "dataset_fill_cancelled"
LOCAL_WORKER_STALE_THRESHOLD = timedelta(minutes=10)
MAX_ATTEMPTS_PER_RANGE = 3
RETRY_DELAY_SECONDS_BY_ATTEMPT = {2: 5, 3: 15}
RETRYABLE_PROVIDER_REASON_CODES = {
    "dataset_fill_provider_timeout",
    "dataset_fill_provider_rate_limited",
    "dataset_fill_provider_unavailable",
}


@dataclass(slots=True)
class DatasetFillWorkerTickValidationError(Exception):
    reason_code: str
    message: str


@dataclass(slots=True)
class DatasetFillWorkerProviderError(Exception):
    reason_code: str
    message: str
    provider_status: str


@dataclass(slots=True)
class DatasetFillWorkerRetryPending(Exception):
    reason_code: str
    message: str
    provider_status: str
    attempt_count: int
    max_attempts: int


@dataclass(slots=True)
class DatasetFillWorkerCancelled(Exception):
    range_results: list["_RangeResult"]
    rows_fetched: int
    rows_inserted: int
    rows_skipped_existing: int

@dataclass(slots=True)
class DatasetFillWorkerTickResult:
    processed: bool
    job_id: str | None
    dataset_key: str | None
    status: str
    safety_status: str
    rows_fetched: int
    rows_inserted: int
    rows_skipped_existing: int
    stale_jobs_marked: int
    reason_code: str | None = None
    provider_status: str | None = None
    attempt_count: int = 0
    max_attempts: int = MAX_ATTEMPTS_PER_RANGE
    retry_exhausted: bool = False


@dataclass(slots=True)
class _RangeResult:
    start_at: datetime
    end_at: datetime
    kind: str
    status: str
    rows_fetched: int
    rows_inserted: int
    rows_skipped_existing: int
    attempt_count: int = 1
    max_attempts: int = MAX_ATTEMPTS_PER_RANGE
    reason_code: str | None = None
    provider_status: str | None = None
    retry_delay_seconds: int | None = None
    next_retry_at: datetime | None = None
    attempts: list[dict[str, Any]] | None = None


def tick_dataset_fill_worker(
    repository: MarketDataRepository,
    client: BinanceSpotClient,
    *,
    settings: object,
    confirm_local_worker_tick: bool,
    worker_id: str | None = None,
    now: datetime | None = None,
) -> DatasetFillWorkerTickResult:
    _validate_static_guards(settings=settings, confirm_local_worker_tick=confirm_local_worker_tick, worker_id=worker_id)
    resolved_now = now or datetime.now(timezone.utc)
    resolved_worker_id = (worker_id or getattr(settings, "default_worker_identity", "trade-lab-local-worker")).strip()
    stale_jobs_marked = repository.mark_stale_background_fill_enqueue_jobs(
        now=resolved_now,
        stale_after=LOCAL_WORKER_STALE_THRESHOLD,
        updated_by=resolved_worker_id,
    )
    job = repository.claim_next_cancel_requested_background_fill_enqueue_job(worker_id=resolved_worker_id, now=resolved_now)
    if job is not None:
        return _cancel_job_result(
            repository,
            job,
            worker_id=resolved_worker_id,
            now=resolved_now,
            stale_jobs_marked=stale_jobs_marked,
            range_results=[
                _range_result_from_metadata(item)
                for item in (job.metadata_ or {}).get("ranges", [])
                if isinstance(item, dict)
            ],
        )
    job = repository.claim_next_retryable_background_fill_enqueue_job(worker_id=resolved_worker_id, now=resolved_now)
    if job is None:
        job = repository.claim_next_background_fill_enqueue_job(worker_id=resolved_worker_id, now=resolved_now)
    if job is None:
        return DatasetFillWorkerTickResult(
            processed=False,
            job_id=None,
            dataset_key=None,
            status="idle",
            safety_status=LOCAL_WORKER_SAFETY_STATUS,
            rows_fetched=0,
            rows_inserted=0,
            rows_skipped_existing=0,
            stale_jobs_marked=stale_jobs_marked,
        )

    try:
        rows_fetched, rows_inserted, rows_skipped, range_results = _process_job_ranges(
            repository,
            client,
            job,
            resolved_worker_id,
            now=resolved_now,
        )
        _refresh_dataset_coverage(repository, job)
        _complete_job(
            repository,
            job,
            status="completed",
            rows_imported=rows_inserted,
            error_message=None,
            range_results=range_results,
            rows_fetched=rows_fetched,
            rows_inserted=rows_inserted,
            rows_skipped_existing=rows_skipped,
        )
        metadata = job.metadata_ or {}
        return DatasetFillWorkerTickResult(
            processed=True,
            job_id=str(job.id),
            dataset_key=str(job.dataset_key),
            status="completed",
            safety_status=LOCAL_WORKER_SAFETY_STATUS,
            rows_fetched=rows_fetched,
            rows_inserted=rows_inserted,
            rows_skipped_existing=rows_skipped,
            stale_jobs_marked=stale_jobs_marked,
            attempt_count=int(metadata.get("attemptCount") or 1),
            max_attempts=MAX_ATTEMPTS_PER_RANGE,
            retry_exhausted=False,
        )
    except DatasetFillWorkerCancelled as exc:
        if exc.rows_inserted > 0:
            _refresh_dataset_coverage(repository, job)
        return _cancel_job_result(
            repository,
            job,
            worker_id=resolved_worker_id,
            now=resolved_now,
            stale_jobs_marked=stale_jobs_marked,
            range_results=exc.range_results,
            rows_fetched=exc.rows_fetched,
            rows_inserted=exc.rows_inserted,
            rows_skipped_existing=exc.rows_skipped_existing,
        )
    except DatasetFillWorkerRetryPending as exc:
        metadata = job.metadata_ or {}
        return DatasetFillWorkerTickResult(
            processed=True,
            job_id=str(job.id),
            dataset_key=str(job.dataset_key),
            status="running",
            safety_status=LOCAL_WORKER_SAFETY_STATUS,
            rows_fetched=int(metadata.get("rowsFetched") or 0),
            rows_inserted=int(metadata.get("rowsInserted") or 0),
            rows_skipped_existing=int(metadata.get("rowsSkippedExisting") or 0),
            stale_jobs_marked=stale_jobs_marked,
            reason_code=exc.reason_code,
            provider_status=exc.provider_status,
            attempt_count=exc.attempt_count,
            max_attempts=exc.max_attempts,
            retry_exhausted=False,
        )
    except DatasetFillWorkerProviderError as exc:
        metadata = job.metadata_ or {}
        _complete_job(
            repository,
            job,
            status="failed",
            rows_imported=int(metadata.get("rowsInserted") or 0),
            error_message=exc.message,
            range_results=[_range_result_from_metadata(item) for item in metadata.get("ranges", []) if isinstance(item, dict)],
            rows_fetched=int(metadata.get("rowsFetched") or 0),
            rows_inserted=int(metadata.get("rowsInserted") or 0),
            rows_skipped_existing=int(metadata.get("rowsSkippedExisting") or 0),
            reason_code=exc.reason_code,
            provider_status=exc.provider_status,
        )
        metadata = job.metadata_ or {}
        return DatasetFillWorkerTickResult(
            processed=True,
            job_id=str(job.id),
            dataset_key=str(job.dataset_key),
            status="failed",
            safety_status=LOCAL_WORKER_SAFETY_STATUS,
            rows_fetched=int(metadata.get("rowsFetched") or 0),
            rows_inserted=int(metadata.get("rowsInserted") or 0),
            rows_skipped_existing=int(metadata.get("rowsSkippedExisting") or 0),
            stale_jobs_marked=stale_jobs_marked,
            reason_code=exc.reason_code,
            provider_status=exc.provider_status,
            attempt_count=int(metadata.get("attemptCount") or 1),
            max_attempts=MAX_ATTEMPTS_PER_RANGE,
            retry_exhausted=bool(metadata.get("retryExhausted") is True),
        )
    except Exception as exc:
        provider_error = _provider_error_from_exception(exc)
        metadata = job.metadata_ or {}
        _complete_job(
            repository,
            job,
            status="failed",
            rows_imported=int(metadata.get("rowsInserted") or 0),
            error_message=provider_error.message,
            range_results=[_range_result_from_metadata(item) for item in metadata.get("ranges", []) if isinstance(item, dict)],
            rows_fetched=int(metadata.get("rowsFetched") or 0),
            rows_inserted=int(metadata.get("rowsInserted") or 0),
            rows_skipped_existing=int(metadata.get("rowsSkippedExisting") or 0),
            reason_code=provider_error.reason_code,
            provider_status=provider_error.provider_status,
        )
        metadata = job.metadata_ or {}
        return DatasetFillWorkerTickResult(
            processed=True,
            job_id=str(job.id),
            dataset_key=str(job.dataset_key),
            status="failed",
            safety_status=LOCAL_WORKER_SAFETY_STATUS,
            rows_fetched=int(metadata.get("rowsFetched") or 0),
            rows_inserted=int(metadata.get("rowsInserted") or 0),
            rows_skipped_existing=int(metadata.get("rowsSkippedExisting") or 0),
            stale_jobs_marked=stale_jobs_marked,
            reason_code=provider_error.reason_code,
            provider_status=provider_error.provider_status,
            attempt_count=int(metadata.get("attemptCount") or 1),
            max_attempts=MAX_ATTEMPTS_PER_RANGE,
            retry_exhausted=bool(metadata.get("retryExhausted") is True),
        )


def _validate_static_guards(*, settings: object, confirm_local_worker_tick: bool, worker_id: str | None) -> None:
    if getattr(settings, "tradelab_local_fill_enabled", False) is not True:
        raise DatasetFillWorkerTickValidationError(
            "dataset_fill_worker_local_disabled",
            "Local background fill worker tick is disabled.",
        )
    environment = str(getattr(settings, "tradelab_environment", "local")).strip().lower()
    if environment not in LOCAL_WORKER_ALLOWED_ENVIRONMENTS:
        raise DatasetFillWorkerTickValidationError(
            "dataset_fill_worker_environment_not_allowed",
            "Local background fill worker tick is allowed only in local/dev/test environments.",
        )
    if confirm_local_worker_tick is not True:
        raise DatasetFillWorkerTickValidationError(
            "dataset_fill_worker_confirm_required",
            "Local background fill worker tick requires explicit confirmation.",
        )
    if worker_id is not None and not worker_id.strip():
        raise DatasetFillWorkerTickValidationError(
            "dataset_fill_worker_id_invalid",
            "Worker id cannot be blank.",
        )


def _process_job_ranges(
    repository: MarketDataRepository,
    client: BinanceSpotClient,
    job: MarketDataImportJob,
    worker_id: str,
    *,
    now: datetime,
) -> tuple[int, int, int, list[_RangeResult]]:
    ranges = _missing_ranges(job)
    if not ranges:
        raise DatasetFillWorkerProviderError(
            "dataset_fill_provider_empty",
            "Background fill job has no missing ranges to process.",
            "empty_response",
        )
    existing_results = _existing_range_results(job)
    range_results: list[_RangeResult] = []
    rows_fetched_total = int((job.metadata_ or {}).get("rowsFetched") or 0)
    rows_inserted_total = int((job.metadata_ or {}).get("rowsInserted") or 0)
    rows_skipped_total = int((job.metadata_ or {}).get("rowsSkippedExisting") or 0)
    if _is_cancel_requested(job):
        raise DatasetFillWorkerCancelled(range_results, rows_fetched_total, rows_inserted_total, rows_skipped_total)
    for item in ranges:
        if _is_cancel_requested(job):
            raise DatasetFillWorkerCancelled(range_results, rows_fetched_total, rows_inserted_total, rows_skipped_total)
        key = _range_key(item)
        existing_result = existing_results.get(key)
        if existing_result and existing_result.get("status") == "completed":
            range_results.append(_range_result_from_metadata(existing_result))
            continue
        previous_attempts = int((existing_result or {}).get("attemptCount") or 0)
        attempt_count = previous_attempts + 1
        try:
            range_result, fetched, inserted, skipped = _process_one_range(
                repository,
                client,
                job,
                worker_id,
                item,
                attempt_count=attempt_count,
            )
        except DatasetFillWorkerProviderError as exc:
            if _is_retryable_provider_error(exc) and attempt_count < MAX_ATTEMPTS_PER_RANGE:
                retry_delay = _retry_delay_seconds(attempt_count + 1)
                next_retry_at = now + timedelta(seconds=retry_delay)
                attempts = list((existing_result or {}).get("attempts") or [])
                attempts.append(
                    {
                        "attempt": attempt_count,
                        "status": "failed_retryable",
                        "reasonCode": exc.reason_code,
                        "providerStatus": exc.provider_status,
                        "rowsFetched": 0,
                        "rowsInserted": 0,
                        "rowsSkippedExisting": 0,
                        "finishedAt": now.isoformat(),
                    }
                )
                retry_result = _RangeResult(
                    start_at=item["start_at"],
                    end_at=item["end_at"],
                    kind=item["kind"],
                    status="retrying",
                    rows_fetched=0,
                    rows_inserted=0,
                    rows_skipped_existing=0,
                    attempt_count=attempt_count,
                    max_attempts=MAX_ATTEMPTS_PER_RANGE,
                    reason_code=exc.reason_code,
                    provider_status=exc.provider_status,
                    retry_delay_seconds=retry_delay,
                    next_retry_at=next_retry_at,
                    attempts=attempts,
                )
                _write_retry_metadata(
                    job,
                    worker_id=worker_id,
                    range_results=[*range_results, retry_result],
                    rows_fetched=rows_fetched_total,
                    rows_inserted=rows_inserted_total,
                    rows_skipped_existing=rows_skipped_total,
                    reason_code=exc.reason_code,
                    provider_status=exc.provider_status,
                    retry_delay_seconds=retry_delay,
                    next_retry_at=next_retry_at,
                    attempt_count=attempt_count,
                    retry_exhausted=False,
                )
                raise DatasetFillWorkerRetryPending(
                    exc.reason_code,
                    exc.message,
                    exc.provider_status,
                    attempt_count,
                    MAX_ATTEMPTS_PER_RANGE,
                ) from exc
            if _is_retryable_provider_error(exc) and attempt_count >= MAX_ATTEMPTS_PER_RANGE:
                attempts = list((existing_result or {}).get("attempts") or [])
                attempts.append(
                    {
                        "attempt": attempt_count,
                        "status": "failed_exhausted",
                        "reasonCode": exc.reason_code,
                        "providerStatus": exc.provider_status,
                        "rowsFetched": 0,
                        "rowsInserted": 0,
                        "rowsSkippedExisting": 0,
                        "finishedAt": now.isoformat(),
                    }
                )
                failed_result = _RangeResult(
                    start_at=item["start_at"],
                    end_at=item["end_at"],
                    kind=item["kind"],
                    status="failed",
                    rows_fetched=0,
                    rows_inserted=0,
                    rows_skipped_existing=0,
                    attempt_count=attempt_count,
                    max_attempts=MAX_ATTEMPTS_PER_RANGE,
                    reason_code=exc.reason_code,
                    provider_status=exc.provider_status,
                    attempts=attempts,
                )
                _write_retry_metadata(
                    job,
                    worker_id=worker_id,
                    range_results=[*range_results, failed_result],
                    rows_fetched=rows_fetched_total,
                    rows_inserted=rows_inserted_total,
                    rows_skipped_existing=rows_skipped_total,
                    reason_code=exc.reason_code,
                    provider_status=exc.provider_status,
                    retry_delay_seconds=None,
                    next_retry_at=None,
                    attempt_count=attempt_count,
                    retry_exhausted=True,
                    failed_range={
                        "startAt": item["start_at"].isoformat(),
                        "endAt": item["end_at"].isoformat(),
                        "kind": item["kind"],
                        "attemptCount": attempt_count,
                    },
                )
            raise
        range_results.append(range_result)
        rows_fetched_total += fetched
        rows_inserted_total += inserted
        rows_skipped_total += skipped
        _write_progress_metadata(
            job,
            worker_id=worker_id,
            range_results=range_results,
            rows_fetched=rows_fetched_total,
            rows_inserted=rows_inserted_total,
            rows_skipped_existing=rows_skipped_total,
            attempt_count=attempt_count,
        )
        if _is_cancel_requested(job):
            raise DatasetFillWorkerCancelled(range_results, rows_fetched_total, rows_inserted_total, rows_skipped_total)
    return rows_fetched_total, rows_inserted_total, rows_skipped_total, range_results


def _process_one_range(
    repository: MarketDataRepository,
    client: BinanceSpotClient,
    job: MarketDataImportJob,
    worker_id: str,
    item: dict[str, Any],
    *,
    attempt_count: int,
) -> tuple[_RangeResult, int, int, int]:
    _touch_heartbeat(job, worker_id)
    try:
        remote_rows = _fetch_remote_candles(
            client,
            symbol=job.symbol,
            timeframe=job.timeframe,
            start_at=item["start_at"],
            end_at=item["end_at"],
        )
    except Exception as exc:
        raise _provider_error_from_exception(exc) from exc
    if not remote_rows:
        raise DatasetFillWorkerProviderError(
            "dataset_fill_provider_empty",
            "Binance public klines returned no candles for the missing range.",
            "empty_response",
        )
    integrity = inspect_candles(remote_rows, timeframe=job.timeframe, assume_complete=True)
    if integrity.health_status != "healthy":
        raise DatasetFillWorkerProviderError(
            "dataset_fill_integrity_failed",
            "Background fill worker fetched invalid candles.",
            "invalid_candles",
        )
    candle_rows = _to_market_candle_rows(remote_rows, exchange=job.exchange, symbol=job.symbol, timeframe=job.timeframe)
    existing = repository.list_market_candles(
        exchange=job.exchange,
        symbol=job.symbol,
        timeframe=job.timeframe,
        start_at=item["start_at"],
        end_at=item["end_at"],
    )
    existing_keys = {candle.open_time for candle in existing}
    rows_to_insert = [row for row in candle_rows if row["open_time"] not in existing_keys]
    inserted = repository.create_market_candles(rows_to_insert) if rows_to_insert else []
    rows_fetched = len(candle_rows)
    rows_inserted = len(inserted)
    rows_skipped = rows_fetched - rows_inserted
    return (
        _RangeResult(
            start_at=item["start_at"],
            end_at=item["end_at"],
            kind=item["kind"],
            status="completed",
            rows_fetched=rows_fetched,
            rows_inserted=rows_inserted,
            rows_skipped_existing=rows_skipped,
            attempt_count=attempt_count,
            max_attempts=MAX_ATTEMPTS_PER_RANGE,
        ),
        rows_fetched,
        rows_inserted,
        rows_skipped,
    )


def _missing_ranges(job: MarketDataImportJob) -> list[dict[str, Any]]:
    ranges: list[dict[str, Any]] = []
    for item in (job.metadata_ or {}).get("missingRanges", []):
        if not isinstance(item, dict):
            continue
        start_at = _parse_datetime(item.get("startAt") or item.get("start_at"))
        end_at = _parse_datetime(item.get("endAt") or item.get("end_at"))
        if start_at is None or end_at is None or start_at >= end_at:
            continue
        ranges.append({"start_at": start_at, "end_at": end_at, "kind": str(item.get("kind", "missing"))})
    return ranges


def _refresh_dataset_coverage(repository: MarketDataRepository, job: MarketDataImportJob) -> None:
    candles = repository.list_market_candles(exchange=job.exchange, symbol=job.symbol, timeframe=job.timeframe)
    if not candles:
        return
    health = inspect_candles(
        [
            {
                "open_time": candle.open_time,
                "close_time": candle.close_time,
                "open": candle.open,
                "high": candle.high,
                "low": candle.low,
                "close": candle.close,
                "volume": candle.volume,
            }
            for candle in candles
        ],
        timeframe=job.timeframe,
        assume_complete=False,
    ).health_status
    repository.refresh_coverage_from_candles(
        exchange=job.exchange,
        symbol=job.symbol,
        timeframe=job.timeframe,
        candles=candles,
        health_status=health,
        metadata={"jobType": "fill", "createdBy": "trade-lab-worker-tick"},
    )


def _complete_job(
    repository: MarketDataRepository,
    job: MarketDataImportJob,
    *,
    status: str,
    rows_imported: int,
    error_message: str | None,
    range_results: list[_RangeResult],
    rows_fetched: int,
    rows_inserted: int,
    rows_skipped_existing: int,
    reason_code: str | None = None,
    provider_status: str | None = None,
) -> None:
    metadata = dict(job.metadata_ or {})
    metadata["safetyStatus"] = LOCAL_WORKER_SAFETY_STATUS
    metadata["ranges"] = [_serialize_range_result(item) for item in range_results]
    metadata["rowsFetched"] = rows_fetched
    metadata["rowsInserted"] = rows_inserted
    metadata["rowsSkippedExisting"] = rows_skipped_existing
    metadata["heartbeatAt"] = datetime.now(timezone.utc).isoformat()
    metadata["attemptCount"] = int(metadata.get("attemptCount") or 1)
    metadata["maxAttemptsPerRange"] = MAX_ATTEMPTS_PER_RANGE
    metadata["retryExhausted"] = bool(metadata.get("retryExhausted") is True)
    if status == "completed":
        metadata["hasRetryableFailure"] = False
        metadata.pop("nextRetryAt", None)
        metadata.pop("retryDelaySeconds", None)
    if reason_code is not None:
        metadata["reasonCode"] = reason_code
    if provider_status is not None:
        metadata["providerStatus"] = provider_status
    job.metadata_ = metadata
    repository.complete_import_job(
        job,
        applied_start_at=job.applied_start_at,
        applied_end_at=job.applied_end_at,
        rows_imported=rows_imported,
        status=status,
        error_message=error_message,
    )


def _touch_heartbeat(job: MarketDataImportJob, worker_id: str) -> None:
    metadata = dict(job.metadata_ or {})
    metadata["workerId"] = worker_id
    metadata["heartbeatAt"] = datetime.now(timezone.utc).isoformat()
    metadata["safetyStatus"] = LOCAL_WORKER_SAFETY_STATUS
    job.metadata_ = metadata


def _cancel_job_result(
    repository: MarketDataRepository,
    job: MarketDataImportJob,
    *,
    worker_id: str,
    now: datetime,
    stale_jobs_marked: int,
    range_results: list[_RangeResult],
    rows_fetched: int | None = None,
    rows_inserted: int | None = None,
    rows_skipped_existing: int | None = None,
) -> DatasetFillWorkerTickResult:
    metadata = job.metadata_ or {}
    resolved_rows_fetched = int(metadata.get("rowsFetched") or 0) if rows_fetched is None else rows_fetched
    resolved_rows_inserted = int(metadata.get("rowsInserted") or 0) if rows_inserted is None else rows_inserted
    resolved_rows_skipped = int(metadata.get("rowsSkippedExisting") or 0) if rows_skipped_existing is None else rows_skipped_existing
    cancelled = repository.mark_background_fill_enqueue_job_cancelled(
        job,
        now=now,
        updated_by=worker_id,
        rows_fetched=resolved_rows_fetched,
        rows_inserted=resolved_rows_inserted,
        rows_skipped_existing=resolved_rows_skipped,
        range_results=[_serialize_range_result(item) for item in range_results],
    )
    return DatasetFillWorkerTickResult(
        processed=True,
        job_id=str(cancelled.id),
        dataset_key=str(cancelled.dataset_key),
        status="cancelled",
        safety_status=LOCAL_CANCEL_SAFETY_STATUS,
        rows_fetched=resolved_rows_fetched,
        rows_inserted=resolved_rows_inserted,
        rows_skipped_existing=resolved_rows_skipped,
        stale_jobs_marked=stale_jobs_marked,
        reason_code=LOCAL_CANCELLED_REASON_CODE,
        provider_status=None,
        attempt_count=int((cancelled.metadata_ or {}).get("attemptCount") or 1),
        max_attempts=MAX_ATTEMPTS_PER_RANGE,
        retry_exhausted=bool((cancelled.metadata_ or {}).get("retryExhausted") is True),
    )


def _is_cancel_requested(job: MarketDataImportJob) -> bool:
    return job.status == "cancel_requested"


def _write_progress_metadata(
    job: MarketDataImportJob,
    *,
    worker_id: str,
    range_results: list[_RangeResult],
    rows_fetched: int,
    rows_inserted: int,
    rows_skipped_existing: int,
    attempt_count: int = 1,
) -> None:
    metadata = dict(job.metadata_ or {})
    metadata["workerId"] = worker_id
    metadata["heartbeatAt"] = datetime.now(timezone.utc).isoformat()
    metadata["safetyStatus"] = LOCAL_WORKER_SAFETY_STATUS
    metadata["ranges"] = [_serialize_range_result(item) for item in range_results]
    metadata["rowsFetched"] = rows_fetched
    metadata["rowsInserted"] = rows_inserted
    metadata["rowsSkippedExisting"] = rows_skipped_existing
    metadata["attemptCount"] = attempt_count
    metadata["maxAttemptsPerRange"] = MAX_ATTEMPTS_PER_RANGE
    metadata["hasRetryableFailure"] = False
    metadata["retryExhausted"] = False
    metadata.pop("nextRetryAt", None)
    metadata.pop("retryDelaySeconds", None)
    job.metadata_ = metadata


def _write_retry_metadata(
    job: MarketDataImportJob,
    *,
    worker_id: str,
    range_results: list[_RangeResult],
    rows_fetched: int,
    rows_inserted: int,
    rows_skipped_existing: int,
    reason_code: str,
    provider_status: str,
    retry_delay_seconds: int | None,
    next_retry_at: datetime | None,
    attempt_count: int,
    retry_exhausted: bool,
    failed_range: dict[str, Any] | None = None,
) -> None:
    metadata = dict(job.metadata_ or {})
    metadata["workerId"] = worker_id
    metadata["heartbeatAt"] = datetime.now(timezone.utc).isoformat()
    metadata["safetyStatus"] = LOCAL_WORKER_SAFETY_STATUS
    metadata["ranges"] = [_serialize_range_result(item) for item in range_results]
    metadata["rowsFetched"] = rows_fetched
    metadata["rowsInserted"] = rows_inserted
    metadata["rowsSkippedExisting"] = rows_skipped_existing
    metadata["attemptCount"] = attempt_count
    metadata["maxAttemptsPerRange"] = MAX_ATTEMPTS_PER_RANGE
    metadata["hasRetryableFailure"] = True
    metadata["retryExhausted"] = retry_exhausted
    metadata["reasonCode"] = reason_code
    metadata["providerStatus"] = provider_status
    metadata["retryPolicy"] = {
        "scope": "provider_transient_only",
        "maxAttemptsPerRange": MAX_ATTEMPTS_PER_RANGE,
        "delayScheduleSeconds": [5, 15],
    }
    if retry_delay_seconds is not None:
        metadata["retryDelaySeconds"] = retry_delay_seconds
    else:
        metadata.pop("retryDelaySeconds", None)
    if next_retry_at is not None:
        metadata["nextRetryAt"] = next_retry_at.isoformat()
    else:
        metadata.pop("nextRetryAt", None)
    if failed_range is not None:
        metadata["failedRange"] = failed_range
    job.metadata_ = metadata


def _provider_error_from_exception(exc: Exception) -> DatasetFillWorkerProviderError:
    if isinstance(exc, httpx.TimeoutException):
        return DatasetFillWorkerProviderError("dataset_fill_provider_timeout", "Binance public klines request timed out.", "timeout")
    if isinstance(exc, httpx.HTTPStatusError):
        status_code = exc.response.status_code
        if status_code == 429:
            return DatasetFillWorkerProviderError("dataset_fill_provider_rate_limited", "Binance public klines rate limit was reached.", "429")
        if status_code >= 500:
            return DatasetFillWorkerProviderError("dataset_fill_provider_unavailable", "Binance public klines is unavailable.", str(status_code))
        return DatasetFillWorkerProviderError("dataset_fill_provider_failed", "Binance public klines request failed.", str(status_code))
    if isinstance(exc, httpx.TransportError):
        return DatasetFillWorkerProviderError("dataset_fill_provider_unavailable", "Binance public klines is unavailable.", "network_unavailable")
    return DatasetFillWorkerProviderError("dataset_fill_provider_failed", "Binance public klines request failed.", "unknown")


def _is_retryable_provider_error(error: DatasetFillWorkerProviderError) -> bool:
    return error.reason_code in RETRYABLE_PROVIDER_REASON_CODES


def _retry_delay_seconds(next_attempt: int) -> int:
    return RETRY_DELAY_SECONDS_BY_ATTEMPT.get(next_attempt, RETRY_DELAY_SECONDS_BY_ATTEMPT[max(RETRY_DELAY_SECONDS_BY_ATTEMPT)])


def _range_key(item: dict[str, Any]) -> tuple[str, str, str]:
    return (
        item["start_at"].isoformat(),
        item["end_at"].isoformat(),
        str(item.get("kind", "missing")),
    )


def _metadata_range_key(item: dict[str, Any]) -> tuple[str, str, str] | None:
    start_at = _parse_datetime(item.get("startAt") or item.get("start_at"))
    end_at = _parse_datetime(item.get("endAt") or item.get("end_at"))
    if start_at is None or end_at is None:
        return None
    return (start_at.isoformat(), end_at.isoformat(), str(item.get("kind", "missing")))


def _existing_range_results(job: MarketDataImportJob) -> dict[tuple[str, str, str], dict[str, Any]]:
    results: dict[tuple[str, str, str], dict[str, Any]] = {}
    for item in (job.metadata_ or {}).get("ranges", []):
        if not isinstance(item, dict):
            continue
        key = _metadata_range_key(item)
        if key is not None:
            results[key] = item
    return results


def _range_result_from_metadata(item: dict[str, Any]) -> _RangeResult:
    start_at = _parse_datetime(item.get("startAt") or item.get("start_at")) or datetime.now(timezone.utc)
    end_at = _parse_datetime(item.get("endAt") or item.get("end_at")) or start_at
    return _RangeResult(
        start_at=start_at,
        end_at=end_at,
        kind=str(item.get("kind", "missing")),
        status=str(item.get("status", "completed")),
        rows_fetched=int(item.get("rowsFetched") or 0),
        rows_inserted=int(item.get("rowsInserted") or 0),
        rows_skipped_existing=int(item.get("rowsSkippedExisting") or 0),
        attempt_count=int(item.get("attemptCount") or 1),
        max_attempts=int(item.get("maxAttempts") or MAX_ATTEMPTS_PER_RANGE),
        reason_code=str(item["reasonCode"]) if item.get("reasonCode") else None,
        provider_status=str(item["providerStatus"]) if item.get("providerStatus") else None,
        retry_delay_seconds=int(item["retryDelaySeconds"]) if item.get("retryDelaySeconds") is not None else None,
        next_retry_at=_parse_datetime(item.get("nextRetryAt")),
        attempts=list(item.get("attempts") or []),
    )


def _parse_datetime(value: object) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def _serialize_range_result(item: _RangeResult) -> dict[str, Any]:
    data: dict[str, Any] = {
        "startAt": item.start_at.isoformat(),
        "endAt": item.end_at.isoformat(),
        "kind": item.kind,
        "status": item.status,
        "rowsFetched": item.rows_fetched,
        "rowsInserted": item.rows_inserted,
        "rowsSkippedExisting": item.rows_skipped_existing,
        "attemptCount": item.attempt_count,
        "maxAttempts": item.max_attempts,
    }
    if item.reason_code is not None:
        data["reasonCode"] = item.reason_code
    if item.provider_status is not None:
        data["providerStatus"] = item.provider_status
    if item.retry_delay_seconds is not None:
        data["retryDelaySeconds"] = item.retry_delay_seconds
    if item.next_retry_at is not None:
        data["nextRetryAt"] = item.next_retry_at.isoformat()
    if item.attempts:
        data["attempts"] = item.attempts
    return data
