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

@dataclass(slots=True)
class DatasetLocalFillAuditValidationError(Exception):
    reason_code: str
    message: str

@dataclass(slots=True)
class DatasetLocalFillAuditRange:
    start_at: datetime | None
    end_at: datetime | None
    kind: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

@dataclass(slots=True)
class DatasetLocalFillAuditRangeResult:
    start_at: datetime | None
    end_at: datetime | None
    kind: str | None
    rows_fetched: int
    rows_inserted: int
    rows_skipped_existing: int
    metadata: dict[str, Any] = field(default_factory=dict)

@dataclass(slots=True)
class DatasetLocalFillAuditItem:
    job_id: str
    status: str
    created_at: datetime
    finished_at: datetime | None
    requested_range: DatasetLocalFillAuditRange
    applied_range: DatasetLocalFillAuditRange
    rows_imported: int
    rows_fetched: int
    rows_inserted: int
    rows_skipped_existing: int
    error_message: str | None
    reason_code: str | None
    provider_status: str | None
    preview_id: str | None
    request_fingerprint: str | None
    missing_ranges: list[dict[str, Any]]
    range_results: list[dict[str, Any]]

@dataclass(slots=True)
class DatasetLocalFillAuditResult:
    dataset_key: str
    exchange: str
    symbol: str
    timeframe: str
    safety_status: str
    items: list[DatasetLocalFillAuditItem]

def list_dataset_local_fill_audit(
    repository: MarketDataRepository,
    *,
    exchange: str | None = None,
    symbol: str | None = None,
    timeframe: str | None = None,
    dataset_key: str | None = None,
    limit: int = 5,
) -> DatasetLocalFillAuditResult:
    resolved_exchange, resolved_symbol, resolved_timeframe, resolved_dataset_key = _resolve_dataset_context(
        exchange=exchange,
        symbol=symbol,
        timeframe=timeframe,
        dataset_key=dataset_key,
    )
    resolved_limit = _resolve_limit(limit)
    jobs = repository.list_local_fill_audit_jobs(dataset_key=resolved_dataset_key, limit=resolved_limit)
    return DatasetLocalFillAuditResult(
        dataset_key=resolved_dataset_key,
        exchange=resolved_exchange,
        symbol=resolved_symbol,
        timeframe=resolved_timeframe,
        safety_status="read_only",
        items=[_serialize_job(job) for job in jobs],
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
            raise DatasetLocalFillAuditValidationError(
                "dataset_context_invalid",
                "Dataset key must use exchange:symbol:timeframe.",
            )
        resolved_exchange, resolved_symbol, resolved_timeframe = parts
        return resolved_exchange, resolved_symbol, resolved_timeframe, dataset_key

    if not exchange or not symbol or not timeframe:
        raise DatasetLocalFillAuditValidationError(
            "dataset_context_required",
            "Exchange, symbol, and timeframe are required for local fill audit.",
        )
    resolved_exchange = exchange.strip()
    resolved_symbol = symbol.strip()
    resolved_timeframe = timeframe.strip()
    if not resolved_exchange or not resolved_symbol or not resolved_timeframe:
        raise DatasetLocalFillAuditValidationError(
            "dataset_context_required",
            "Exchange, symbol, and timeframe are required for local fill audit.",
        )
    return (
        resolved_exchange,
        resolved_symbol,
        resolved_timeframe,
        build_dataset_key(resolved_exchange, resolved_symbol, resolved_timeframe),
    )

def _resolve_limit(limit: int) -> int:
    if limit < 1 or limit > 10:
        raise DatasetLocalFillAuditValidationError(
            "local_fill_audit_limit_invalid",
            "Local fill audit limit must be between 1 and 10.",
        )
    return limit

def _serialize_job(job: object) -> DatasetLocalFillAuditItem:
    metadata = getattr(job, "metadata_", None) or {}
    return DatasetLocalFillAuditItem(
        job_id=str(job.id),
        status=str(job.status),
        created_at=job.created_at,
        finished_at=job.finished_at,
        requested_range=DatasetLocalFillAuditRange(
            start_at=job.requested_start_at,
            end_at=job.requested_end_at,
        ),
        applied_range=DatasetLocalFillAuditRange(
            start_at=job.applied_start_at,
            end_at=job.applied_end_at,
        ),
        rows_imported=int(job.rows_imported or 0),
        rows_fetched=_int_metadata(metadata, "rowsFetched", "rows_fetched"),
        rows_inserted=_int_metadata(metadata, "rowsInserted", "rows_inserted"),
        rows_skipped_existing=_int_metadata(metadata, "rowsSkippedExisting", "rows_skipped_existing"),
        error_message=job.error_message,
        reason_code=_str_metadata(metadata, "reasonCode", "reason_code"),
        provider_status=_str_metadata(metadata, "providerStatus", "provider_status"),
        preview_id=_str_metadata(metadata, "previewId", "preview_id"),
        request_fingerprint=_str_metadata(metadata, "requestFingerprint", "request_fingerprint"),
        missing_ranges=_sanitize_list(metadata.get("missingRanges") or metadata.get("missing_ranges")),
        range_results=_sanitize_list(metadata.get("rangeResults") or metadata.get("range_results")),
    )

def _int_metadata(metadata: dict[str, Any], *keys: str) -> int:
    for key in keys:
        value = metadata.get(key)
        if isinstance(value, bool):
            continue
        if isinstance(value, int):
            return value
        if isinstance(value, float):
            return int(value)
    return 0

def _str_metadata(metadata: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = metadata.get(key)
        if isinstance(value, str) and value:
            return value
    return None

def _sanitize_list(value: object) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    safe_items: list[dict[str, Any]] = []
    for item in value:
        sanitized = _sanitize_metadata_value(item)
        if isinstance(sanitized, dict):
            safe_items.append(sanitized)
    return safe_items

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
