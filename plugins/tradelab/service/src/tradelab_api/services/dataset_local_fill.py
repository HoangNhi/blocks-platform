from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import httpx

from tradelab_api.db.models import MarketDataImportJob
from tradelab_api.services.dataset_fill_preview import (
    DatasetFillPreviewValidationError,
    build_dataset_fill_preview,
)
from tradelab_api.services.exchanges.binance_spot import BinanceSpotClient
from tradelab_api.services.market_data_integrity import inspect_candles, timeframe_to_timedelta
from tradelab_api.services.market_data_repository import MarketDataRepository
from tradelab_api.services.market_data_service import _fetch_remote_candles, _to_market_candle_rows

LOCAL_FILL_ALLOWED_ENVIRONMENTS = {"local", "dev", "development", "test", "testing"}
LOCAL_FILL_SAFETY_STATUS = "local_dev_fill_only"


@dataclass(slots=True)
class DatasetLocalFillValidationError(Exception):
    reason_code: str
    message: str
    should_commit: bool = False
    provider_status: str | None = None

@dataclass(slots=True)
class DatasetLocalFillProviderError(Exception):
    reason_code: str
    message: str
    provider_status: str


@dataclass(slots=True)
class DatasetLocalFillRange:
    start_at: datetime
    end_at: datetime


@dataclass(slots=True)
class DatasetLocalFillRangeResult:
    start_at: datetime
    end_at: datetime
    kind: str
    rows_fetched: int
    rows_inserted: int
    rows_skipped_existing: int


@dataclass(slots=True)
class DatasetLocalFillResult:
    job_id: str
    dataset_key: str
    status: str
    safety_status: str
    requested_range: DatasetLocalFillRange
    ranges_filled: list[DatasetLocalFillRangeResult]
    rows_fetched: int
    rows_inserted: int
    rows_skipped_existing: int
    blocked_reasons: list[str] = field(default_factory=list)
    preview_id: str = ""
    request_fingerprint: str = ""


def execute_dataset_local_fill(
    repository: MarketDataRepository,
    client: BinanceSpotClient,
    *,
    settings: object,
    strategy_id: UUID,
    exchange: str,
    symbol: str,
    timeframe: str,
    requested_start_at: datetime | None,
    requested_end_at: datetime | None,
    preview_id: str,
    request_fingerprint: str,
    confirm_local_fill: bool,
    source: str = "strategy_lab",
    generated_at: datetime | None = None,
) -> DatasetLocalFillResult:
    _validate_static_guards(
        settings=settings,
        exchange=exchange,
        timeframe=timeframe,
        confirm_local_fill=confirm_local_fill,
    )

    try:
        preview = build_dataset_fill_preview(
            repository,
            strategy_id=strategy_id,
            exchange=exchange,
            symbol=symbol,
            timeframe=timeframe,
            requested_start_at=requested_start_at,
            requested_end_at=requested_end_at,
            source=source,
            generated_at=generated_at,
        )
    except DatasetFillPreviewValidationError as exc:
        reason = "dataset_fill_unsupported_timeframe" if "timeframe" in exc.reason_code else exc.reason_code
        raise DatasetLocalFillValidationError(reason, exc.message) from exc

    if preview.preview_id != preview_id or preview.request_fingerprint != request_fingerprint:
        raise DatasetLocalFillValidationError(
            "dataset_fill_preview_mismatch",
            "Dataset fill preview changed. Run preview again before confirming local fill.",
        )
    if "active_job_exists" in preview.blocked_reasons:
        raise DatasetLocalFillValidationError("active_job_exists", "Dataset already has a compatible active data job.")
    if preview.blocked_reasons:
        raise DatasetLocalFillValidationError(preview.blocked_reasons[0], "Dataset fill preview is blocked.")
    if not preview.missing_ranges:
        raise DatasetLocalFillValidationError(
            "dataset_fill_no_missing_ranges",
            "Dataset fill preview has no missing ranges to fill.",
        )

    job = _create_running_job(
        repository,
        dataset_key=preview.dataset_key,
        exchange=exchange,
        symbol=symbol,
        timeframe=timeframe,
        requested_start_at=preview.requested_range.start_at,
        requested_end_at=preview.requested_range.end_at,
        preview_id=preview.preview_id,
        request_fingerprint=preview.request_fingerprint,
        missing_ranges=preview.missing_ranges,
        source=source,
        settings=settings,
    )

    try:
        range_results: list[DatasetLocalFillRangeResult] = []
        rows_fetched_total = 0
        rows_inserted_total = 0
        rows_skipped_total = 0

        for missing_range in preview.missing_ranges:
            range_start = missing_range["start_at"]
            range_end = missing_range["end_at"]
            remote_rows = _fetch_remote_candles(
                client,
                symbol=symbol,
                timeframe=timeframe,
                start_at=range_start,
                end_at=range_end,
            )
            candle_rows = _to_market_candle_rows(remote_rows, exchange=exchange, symbol=symbol, timeframe=timeframe)
            if not candle_rows:
                raise DatasetLocalFillProviderError(
                    "dataset_fill_provider_empty",
                    "Binance public klines returned no candles for the missing range.",
                    "empty_response",
                )
            existing = repository.list_market_candles(
                exchange=exchange,
                symbol=symbol,
                timeframe=timeframe,
                start_at=range_start,
                end_at=range_end,
            )
            existing_keys = {candle.open_time for candle in existing}
            rows_to_insert = [row for row in candle_rows if row["open_time"] not in existing_keys]
            inserted = repository.create_market_candles(rows_to_insert) if rows_to_insert else []
            rows_fetched = len(candle_rows)
            rows_inserted = len(inserted)
            rows_skipped = rows_fetched - rows_inserted
            rows_fetched_total += rows_fetched
            rows_inserted_total += rows_inserted
            rows_skipped_total += rows_skipped
            range_results.append(
                DatasetLocalFillRangeResult(
                    start_at=range_start,
                    end_at=range_end,
                    kind=str(missing_range["kind"]),
                    rows_fetched=rows_fetched,
                    rows_inserted=rows_inserted,
                    rows_skipped_existing=rows_skipped,
                )
            )

        _refresh_dataset_coverage(repository, exchange=exchange, symbol=symbol, timeframe=timeframe, job_type="fill")
        _complete_job_with_metadata(
            repository,
            job,
            status="completed",
            rows_imported=rows_inserted_total,
            error_message=None,
            range_results=range_results,
            rows_fetched=rows_fetched_total,
            rows_inserted=rows_inserted_total,
            rows_skipped_existing=rows_skipped_total,
        )
        return DatasetLocalFillResult(
            job_id=str(job.id),
            dataset_key=preview.dataset_key,
            status="completed",
            safety_status=LOCAL_FILL_SAFETY_STATUS,
            requested_range=DatasetLocalFillRange(
                start_at=preview.requested_range.start_at,
                end_at=preview.requested_range.end_at,
            ),
            ranges_filled=range_results,
            rows_fetched=rows_fetched_total,
            rows_inserted=rows_inserted_total,
            rows_skipped_existing=rows_skipped_total,
            blocked_reasons=[],
            preview_id=preview.preview_id,
            request_fingerprint=preview.request_fingerprint,
        )
    except DatasetLocalFillValidationError:
        raise
    except DatasetLocalFillProviderError as exc:
        _complete_job_with_metadata(
            repository,
            job,
            status="failed",
            rows_imported=0,
            error_message="Binance public klines request failed.",
            range_results=[],
            rows_fetched=0,
            rows_inserted=0,
            rows_skipped_existing=0,
            reason_code=exc.reason_code,
            provider_status=exc.provider_status,
        )
        raise DatasetLocalFillValidationError(
            exc.reason_code,
            exc.message,
            should_commit=True,
            provider_status=exc.provider_status,
        ) from exc
    except Exception as exc:
        provider_error = _provider_error_from_exception(exc)
        _complete_job_with_metadata(
            repository,
            job,
            status="failed",
            rows_imported=0,
            error_message="Binance public klines request failed.",
            range_results=[],
            rows_fetched=0,
            rows_inserted=0,
            rows_skipped_existing=0,
            reason_code=provider_error.reason_code,
            provider_status=provider_error.provider_status,
        )
        raise DatasetLocalFillValidationError(
            provider_error.reason_code,
            provider_error.message,
            should_commit=True,
            provider_status=provider_error.provider_status,
        ) from exc


def _validate_static_guards(
    *,
    settings: object,
    exchange: str,
    timeframe: str,
    confirm_local_fill: bool,
) -> None:
    if getattr(settings, "tradelab_local_fill_enabled", False) is not True:
        raise DatasetLocalFillValidationError("local_fill_disabled", "Local dataset fill is disabled.")
    environment = str(getattr(settings, "tradelab_environment", "local")).strip().lower()
    if environment not in LOCAL_FILL_ALLOWED_ENVIRONMENTS:
        raise DatasetLocalFillValidationError(
            "local_fill_not_allowed_in_environment",
            "Local dataset fill is allowed only in local/dev/test environments.",
        )
    if confirm_local_fill is not True:
        raise DatasetLocalFillValidationError(
            "local_fill_confirmation_required",
            "Local dataset fill requires explicit confirmation.",
        )
    if exchange.lower() != "binance":
        raise DatasetLocalFillValidationError(
            "dataset_fill_unsupported_exchange",
            "Dataset local fill currently supports Binance only.",
        )
    try:
        timeframe_to_timedelta(timeframe)
    except ValueError as exc:
        raise DatasetLocalFillValidationError(
            "dataset_fill_unsupported_timeframe",
            f"Unsupported timeframe for dataset local fill: {timeframe}.",
        ) from exc


def _create_running_job(
    repository: MarketDataRepository,
    *,
    dataset_key: str,
    exchange: str,
    symbol: str,
    timeframe: str,
    requested_start_at: datetime,
    requested_end_at: datetime,
    preview_id: str,
    request_fingerprint: str,
    missing_ranges: list[dict[str, Any]],
    source: str,
    settings: object,
) -> MarketDataImportJob:
    now = datetime.now(timezone.utc)
    return repository.create_import_job(
        dataset_key=dataset_key,
        job_type="fill",
        exchange=exchange,
        symbol=symbol,
        timeframe=timeframe,
        requested_start_at=requested_start_at,
        requested_end_at=requested_end_at,
        applied_start_at=requested_start_at,
        applied_end_at=requested_end_at,
        start_at=requested_start_at,
        end_at=requested_end_at,
        status="running",
        rows_imported=0,
        error_message=None,
        started_at=now,
        claimed_at=now,
        worker_id=getattr(settings, "default_worker_identity", "trade-lab-local-worker"),
        metadata_={
            "source": "strategy_lab_local_fill",
            "requestSource": source,
            "previewId": preview_id,
            "requestFingerprint": request_fingerprint,
            "safetyStatus": LOCAL_FILL_SAFETY_STATUS,
            "missingRanges": [_serialize_range(item) for item in missing_ranges],
            "ranges": [],
            "rowsFetched": 0,
            "rowsInserted": 0,
            "rowsSkippedExisting": 0,
        },
        created_by="trade-lab-local-fill",
    )


def _refresh_dataset_coverage(
    repository: MarketDataRepository,
    *,
    exchange: str,
    symbol: str,
    timeframe: str,
    job_type: str,
) -> None:
    candles = repository.list_market_candles(exchange=exchange, symbol=symbol, timeframe=timeframe)
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
        timeframe=timeframe,
        assume_complete=False,
    ).health_status
    repository.refresh_coverage_from_candles(
        exchange=exchange,
        symbol=symbol,
        timeframe=timeframe,
        candles=candles,
        health_status=health,
        metadata={"jobType": job_type, "createdBy": "trade-lab-local-fill"},
    )


def _complete_job_with_metadata(
    repository: MarketDataRepository,
    job: MarketDataImportJob,
    *,
    status: str,
    rows_imported: int,
    error_message: str | None,
    range_results: list[DatasetLocalFillRangeResult],
    rows_fetched: int,
    rows_inserted: int,
    rows_skipped_existing: int,
    reason_code: str | None = None,
    provider_status: str | None = None,
) -> None:
    metadata = dict(job.metadata_ or {})
    metadata["ranges"] = [_serialize_range_result(item) for item in range_results]
    metadata["rowsFetched"] = rows_fetched
    metadata["rowsInserted"] = rows_inserted
    metadata["rowsSkippedExisting"] = rows_skipped_existing
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


def _provider_error_from_exception(exc: Exception) -> DatasetLocalFillProviderError:
    if isinstance(exc, httpx.TimeoutException):
        return DatasetLocalFillProviderError(
            "dataset_fill_provider_timeout",
            "Binance public klines request timed out.",
            "timeout",
        )
    if isinstance(exc, httpx.HTTPStatusError):
        status_code = exc.response.status_code
        if status_code == 429:
            return DatasetLocalFillProviderError(
                "dataset_fill_provider_rate_limited",
                "Binance public klines rate limit was reached.",
                "429",
            )
        if status_code >= 500:
            return DatasetLocalFillProviderError(
                "dataset_fill_provider_unavailable",
                "Binance public klines is unavailable.",
                str(status_code),
            )
        return DatasetLocalFillProviderError(
            "dataset_fill_provider_failed",
            "Binance public klines request failed.",
            str(status_code),
        )
    if isinstance(exc, httpx.TransportError):
        return DatasetLocalFillProviderError(
            "dataset_fill_provider_unavailable",
            "Binance public klines is unavailable.",
            "network_unavailable",
        )
    return DatasetLocalFillProviderError(
        "dataset_fill_provider_failed",
        "Binance public klines request failed.",
        "unknown",
    )

def _serialize_range(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "startAt": item["start_at"].isoformat(),
        "endAt": item["end_at"].isoformat(),
        "kind": item["kind"],
    }


def _serialize_range_result(item: DatasetLocalFillRangeResult) -> dict[str, Any]:
    return {
        "startAt": item.start_at.isoformat(),
        "endAt": item.end_at.isoformat(),
        "kind": item.kind,
        "rowsFetched": item.rows_fetched,
        "rowsInserted": item.rows_inserted,
        "rowsSkippedExisting": item.rows_skipped_existing,
    }
