from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from tradelab_api.api.serializers import serialize_value
from tradelab_api.services.market_data_repository import MarketDataRepository, build_dataset_key

SECRET_METADATA_MARKERS = (
    "apikey",
    "api_key",
    "apisecret",
    "api_secret",
    "secret",
    "token",
    "credential",
    "privatekey",
    "private_key",
)
MAX_LIMIT = 20


@dataclass(slots=True)
class DatasetFillJobVisibilityValidationError(Exception):
    reason_code: str
    message: str


@dataclass(slots=True)
class DatasetFillJobVisibilityRange:
    start_at: datetime | None
    end_at: datetime | None


@dataclass(slots=True)
class DatasetFillJobVisibilityItem:
    job_id: str
    dataset_key: str
    job_type: str
    status: str
    requested_range: DatasetFillJobVisibilityRange
    applied_range: DatasetFillJobVisibilityRange
    rows_imported: int
    rows_fetched: int
    rows_inserted: int
    rows_skipped_existing: int
    reason_code: str | None
    provider_status: str | None
    attempt_count: int
    worker_id: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    heartbeat_at: str | None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class DatasetFillJobVisibilityResult:
    dataset_key: str
    exchange: str
    symbol: str
    timeframe: str
    safety_status: str
    active: list[DatasetFillJobVisibilityItem]
    recent: list[DatasetFillJobVisibilityItem]


def list_dataset_fill_job_visibility(
    repository: MarketDataRepository,
    *,
    exchange: str | None = None,
    symbol: str | None = None,
    timeframe: str | None = None,
    dataset_key: str | None = None,
    limit: int = 5,
) -> DatasetFillJobVisibilityResult:
    resolved_exchange, resolved_symbol, resolved_timeframe, resolved_dataset_key = _resolve_dataset_context(
        exchange=exchange,
        symbol=symbol,
        timeframe=timeframe,
        dataset_key=dataset_key,
    )
    resolved_limit = _resolve_limit(limit)
    active_jobs = repository.list_fill_visibility_active_jobs(dataset_key=resolved_dataset_key, limit=resolved_limit)
    recent_jobs = repository.list_fill_visibility_recent_jobs(dataset_key=resolved_dataset_key, limit=resolved_limit)
    active_ids = {str(job.id) for job in active_jobs}
    return DatasetFillJobVisibilityResult(
        dataset_key=resolved_dataset_key,
        exchange=resolved_exchange,
        symbol=resolved_symbol,
        timeframe=resolved_timeframe,
        safety_status="read_only",
        active=[_serialize_job(job) for job in active_jobs],
        recent=[_serialize_job(job) for job in recent_jobs if str(job.id) not in active_ids],
    )


def _resolve_dataset_context(
    *,
    exchange: str | None,
    symbol: str | None,
    timeframe: str | None,
    dataset_key: str | None,
) -> tuple[str, str, str, str]:
    if dataset_key:
        parts = [part.strip() for part in dataset_key.split(":")]
        if len(parts) != 3 or any(not part for part in parts):
            raise DatasetFillJobVisibilityValidationError(
                "dataset_fill_job_visibility_dataset_key_invalid",
                "Dataset key must use exchange:symbol:timeframe.",
            )
        resolved_exchange, resolved_symbol, resolved_timeframe = parts
        return resolved_exchange, resolved_symbol, resolved_timeframe, dataset_key

    if not exchange or not symbol or not timeframe:
        raise DatasetFillJobVisibilityValidationError(
            "dataset_fill_job_visibility_context_required",
            "Dataset context is required for fill job visibility.",
        )
    resolved_exchange = exchange.strip()
    resolved_symbol = symbol.strip()
    resolved_timeframe = timeframe.strip()
    if not resolved_exchange or not resolved_symbol or not resolved_timeframe:
        raise DatasetFillJobVisibilityValidationError(
            "dataset_fill_job_visibility_context_required",
            "Dataset context is required for fill job visibility.",
        )
    return (
        resolved_exchange,
        resolved_symbol,
        resolved_timeframe,
        build_dataset_key(resolved_exchange, resolved_symbol, resolved_timeframe),
    )


def _resolve_limit(limit: int) -> int:
    if limit < 1:
        raise DatasetFillJobVisibilityValidationError(
            "dataset_fill_job_visibility_limit_invalid",
            "Fill job visibility limit must be greater than zero.",
        )
    return min(limit, MAX_LIMIT)


def _serialize_job(job: object) -> DatasetFillJobVisibilityItem:
    metadata = _sanitize_metadata_value(getattr(job, "metadata_", None) or {})
    if not isinstance(metadata, dict):
        metadata = {}
    return DatasetFillJobVisibilityItem(
        job_id=str(job.id),
        dataset_key=str(job.dataset_key),
        job_type=str(job.job_type),
        status=str(job.status),
        requested_range=DatasetFillJobVisibilityRange(start_at=job.requested_start_at, end_at=job.requested_end_at),
        applied_range=DatasetFillJobVisibilityRange(start_at=job.applied_start_at, end_at=job.applied_end_at),
        rows_imported=int(job.rows_imported or 0),
        rows_fetched=_int_metadata(metadata, "rowsFetched", "rows_fetched", default=0),
        rows_inserted=_int_metadata(metadata, "rowsInserted", "rows_inserted", default=0),
        rows_skipped_existing=_int_metadata(metadata, "rowsSkippedExisting", "rows_skipped_existing", default=0),
        reason_code=_str_metadata(metadata, "reasonCode", "reason_code"),
        provider_status=_str_metadata(metadata, "providerStatus", "provider_status"),
        attempt_count=_int_metadata(metadata, "attemptCount", "attempt_count", default=1),
        worker_id=str(job.worker_id) if job.worker_id else _str_metadata(metadata, "workerId", "worker_id"),
        created_at=job.created_at,
        started_at=job.started_at,
        finished_at=job.finished_at,
        heartbeat_at=_str_metadata(metadata, "heartbeatAt", "heartbeat_at"),
        metadata=metadata,
    )


def _int_metadata(metadata: dict[str, Any], *keys: str, default: int) -> int:
    for key in keys:
        value = metadata.get(key)
        if isinstance(value, bool):
            continue
        if isinstance(value, int):
            return value
        if isinstance(value, float):
            return int(value)
    return default


def _str_metadata(metadata: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = metadata.get(key)
        if isinstance(value, str) and value:
            return value
    return None


def _sanitize_metadata_value(value: object) -> object:
    if isinstance(value, dict):
        safe: dict[str, object] = {}
        for key, item in value.items():
            normalized_key = str(key).replace("-", "_").lower()
            compact_key = normalized_key.replace("_", "")
            if any(marker in normalized_key or marker in compact_key for marker in SECRET_METADATA_MARKERS):
                continue
            safe[str(key)] = _sanitize_metadata_value(item)
        return safe
    if isinstance(value, list):
        return [_sanitize_metadata_value(item) for item in value]
    return serialize_value(value)
