from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from uuid import UUID

from tradelab_api.db.models import MarketDataImportJob
from tradelab_api.services.dataset_fill_preview import (
    DatasetFillPreviewValidationError,
    build_dataset_fill_preview,
)
from tradelab_api.services.market_data_repository import MarketDataRepository

LOCAL_ENQUEUE_ALLOWED_ENVIRONMENTS = {"local", "test"}
LOCAL_ENQUEUE_SAFETY_STATUS = "queued_local_dev"
LOCAL_ENQUEUE_ACTOR = "trade-lab-background-fill-enqueue"


@dataclass(slots=True)
class DatasetFillEnqueueLocalValidationError(Exception):
    reason_code: str
    message: str
    details: dict[str, object] = field(default_factory=dict)


@dataclass(slots=True)
class DatasetFillEnqueueRange:
    start_at: datetime
    end_at: datetime


@dataclass(slots=True)
class DatasetFillEnqueueLocalResult:
    job_id: str
    dataset_key: str
    status: str
    safety_status: str
    requested_range: DatasetFillEnqueueRange
    missing_range_count: int
    preview_id: str
    request_fingerprint: str


def enqueue_dataset_fill_local(
    repository: MarketDataRepository,
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
    missing_ranges: list[dict[str, Any]],
    confirm_local_fill: bool,
    source: str = "strategy_lab",
    generated_at: datetime | None = None,
) -> DatasetFillEnqueueLocalResult:
    _validate_static_guards(settings=settings, confirm_local_fill=confirm_local_fill)
    resolved_exchange = exchange.strip()
    resolved_symbol = symbol.strip()
    resolved_timeframe = timeframe.strip()
    if not resolved_exchange or not resolved_symbol or not resolved_timeframe:
        raise DatasetFillEnqueueLocalValidationError(
            "dataset_fill_enqueue_context_invalid",
            "Dataset fill enqueue requires exchange, symbol and timeframe.",
        )
    if not preview_id or not request_fingerprint:
        raise DatasetFillEnqueueLocalValidationError(
            "dataset_fill_enqueue_preview_required",
            "Dataset fill enqueue requires a fresh preview.",
        )
    if not missing_ranges:
        raise DatasetFillEnqueueLocalValidationError(
            "dataset_fill_enqueue_missing_ranges_required",
            "Dataset fill enqueue requires missing ranges from preview.",
        )

    try:
        preview = build_dataset_fill_preview(
            repository,
            strategy_id=strategy_id,
            exchange=resolved_exchange,
            symbol=resolved_symbol,
            timeframe=resolved_timeframe,
            requested_start_at=requested_start_at,
            requested_end_at=requested_end_at,
            source=source,
            generated_at=generated_at,
        )
    except DatasetFillPreviewValidationError as exc:
        raise DatasetFillEnqueueLocalValidationError("dataset_fill_enqueue_range_invalid", exc.message) from exc

    if preview.preview_id != preview_id or preview.request_fingerprint != request_fingerprint:
        raise DatasetFillEnqueueLocalValidationError(
            "dataset_fill_enqueue_fingerprint_mismatch",
            "Dataset fill preview changed. Run preview again before queueing background fill.",
        )
    if not preview.missing_ranges:
        raise DatasetFillEnqueueLocalValidationError(
            "dataset_fill_enqueue_missing_ranges_required",
            "Dataset fill preview has no missing ranges to queue.",
        )
    if not _ranges_match(preview.missing_ranges, missing_ranges):
        raise DatasetFillEnqueueLocalValidationError(
            "dataset_fill_enqueue_fingerprint_mismatch",
            "Dataset fill preview ranges changed. Run preview again before queueing background fill.",
        )

    duplicate = _find_duplicate_active_job(
        repository,
        dataset_key=preview.dataset_key,
        requested_start_at=preview.requested_range.start_at,
        requested_end_at=preview.requested_range.end_at,
        missing_ranges=preview.missing_ranges,
    )
    if duplicate is not None:
        raise DatasetFillEnqueueLocalValidationError(
            "dataset_fill_job_already_active",
            "A background fill job is already active for this dataset range.",
            {"jobId": str(duplicate.id), "status": str(duplicate.status), "datasetKey": str(duplicate.dataset_key)},
        )

    job = repository.create_import_job(
        dataset_key=preview.dataset_key,
        job_type="fill",
        exchange=preview.exchange,
        symbol=preview.symbol,
        timeframe=preview.timeframe,
        requested_start_at=preview.requested_range.start_at,
        requested_end_at=preview.requested_range.end_at,
        applied_start_at=preview.requested_range.start_at,
        applied_end_at=preview.requested_range.end_at,
        claimed_at=None,
        started_at=None,
        finished_at=None,
        worker_id=None,
        start_at=preview.requested_range.start_at,
        end_at=preview.requested_range.end_at,
        status="queued",
        rows_imported=0,
        error_message=None,
        metadata_={
            "source": "background_fill_enqueue",
            "requestSource": source,
            "mode": "local_dev",
            "previewId": preview.preview_id,
            "requestFingerprint": preview.request_fingerprint,
            "safetyStatus": LOCAL_ENQUEUE_SAFETY_STATUS,
            "missingRanges": [_serialize_range(item) for item in preview.missing_ranges],
            "rowsFetched": 0,
            "rowsInserted": 0,
            "rowsSkippedExisting": 0,
            "attemptCount": 0,
        },
        created_by=LOCAL_ENQUEUE_ACTOR,
    )
    return DatasetFillEnqueueLocalResult(
        job_id=str(job.id),
        dataset_key=preview.dataset_key,
        status="queued",
        safety_status=LOCAL_ENQUEUE_SAFETY_STATUS,
        requested_range=DatasetFillEnqueueRange(
            start_at=preview.requested_range.start_at,
            end_at=preview.requested_range.end_at,
        ),
        missing_range_count=len(preview.missing_ranges),
        preview_id=preview.preview_id,
        request_fingerprint=preview.request_fingerprint,
    )


enqueue_dataset_fill_local.preview_builder = build_dataset_fill_preview


def _validate_static_guards(*, settings: object, confirm_local_fill: bool) -> None:
    if getattr(settings, "tradelab_local_fill_enabled", False) is not True:
        raise DatasetFillEnqueueLocalValidationError(
            "dataset_fill_enqueue_local_disabled",
            "Local background fill enqueue is disabled.",
        )
    environment = str(getattr(settings, "tradelab_environment", "local")).strip().lower()
    if environment not in LOCAL_ENQUEUE_ALLOWED_ENVIRONMENTS:
        raise DatasetFillEnqueueLocalValidationError(
            "dataset_fill_enqueue_environment_not_allowed",
            "Local background fill enqueue is allowed only in local/test environments.",
        )
    if confirm_local_fill is not True:
        raise DatasetFillEnqueueLocalValidationError(
            "dataset_fill_enqueue_confirm_required",
            "Queueing background fill requires explicit local/dev confirmation.",
        )


def _ranges_match(expected: list[dict[str, Any]], actual: list[dict[str, Any]]) -> bool:
    return [_serialize_range(item) for item in expected] == [_serialize_range(item) for item in actual]


def _serialize_range(item: dict[str, Any]) -> dict[str, str]:
    start_at = item.get("start_at", item.get("startAt"))
    end_at = item.get("end_at", item.get("endAt"))
    kind = item.get("kind", "missing")
    if not isinstance(start_at, datetime) or not isinstance(end_at, datetime) or start_at >= end_at:
        raise DatasetFillEnqueueLocalValidationError(
            "dataset_fill_enqueue_range_invalid",
            "Dataset fill enqueue ranges must start before they end.",
        )
    return {"startAt": start_at.isoformat(), "endAt": end_at.isoformat(), "kind": str(kind)}


def _find_duplicate_active_job(
    repository: MarketDataRepository,
    *,
    dataset_key: str,
    requested_start_at: datetime,
    requested_end_at: datetime,
    missing_ranges: list[dict[str, Any]],
) -> MarketDataImportJob | None:
    for job in repository.list_active_fill_jobs_for_dataset(dataset_key=dataset_key):
        if _ranges_overlap(requested_start_at, requested_end_at, job.requested_start_at, job.requested_end_at):
            return job
        for item in (job.metadata_ or {}).get("missingRanges", []):
            if not isinstance(item, dict):
                continue
            job_start = _parse_datetime(item.get("startAt") or item.get("start_at"))
            job_end = _parse_datetime(item.get("endAt") or item.get("end_at"))
            if job_start is None or job_end is None:
                continue
            for requested in missing_ranges:
                requested_start = requested.get("start_at", requested.get("startAt"))
                requested_end = requested.get("end_at", requested.get("endAt"))
                if isinstance(requested_start, datetime) and isinstance(requested_end, datetime):
                    if _ranges_overlap(requested_start, requested_end, job_start, job_end):
                        return job
    return None


def _ranges_overlap(
    left_start: datetime | None,
    left_end: datetime | None,
    right_start: datetime | None,
    right_end: datetime | None,
) -> bool:
    if left_start is None or left_end is None or right_start is None or right_end is None:
        return False
    return left_start < right_end and right_start < left_end


def _parse_datetime(value: object) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None
