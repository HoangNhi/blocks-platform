from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from uuid import UUID

from tradelab_api.services.market_data_repository import BACKGROUND_FILL_ENQUEUE_SOURCE, MarketDataRepository

LOCAL_CANCEL_ALLOWED_ENVIRONMENTS = {"local", "dev", "development", "test", "testing"}
LOCAL_CANCEL_SAFETY_STATUS = "local_dev_cancel_only"
LOCAL_CANCEL_REQUESTED_REASON_CODE = "dataset_fill_cancel_requested"
LOCAL_CANCEL_DEFAULT_ACTOR = "trade-lab-cancel-request"
LOCAL_CANCEL_MAX_REASON_LENGTH = 120


@dataclass(slots=True)
class DatasetFillCancelValidationError(Exception):
    reason_code: str
    message: str
    details: dict[str, object] = field(default_factory=dict)


@dataclass(slots=True)
class DatasetFillCancelResult:
    job_id: str
    dataset_key: str
    status: str
    reason_code: str
    safety_status: str


def mark_fill_job_cancel_requested(
    repository: MarketDataRepository,
    *,
    settings: object,
    job_id: str,
    confirm_cancel: bool,
    reason: str,
    requested_by: str | None = None,
    now: datetime | None = None,
) -> DatasetFillCancelResult:
    _validate_static_guards(settings=settings, confirm_cancel=confirm_cancel, reason=reason)
    job_uuid = _parse_job_id(job_id)
    job = repository.get_import_job(job_uuid)
    if job is None or job.job_type != "fill" or job.is_active is not True or job.is_deleted is True:
        raise DatasetFillCancelValidationError(
            "dataset_fill_cancel_job_not_found",
            "Background fill job was not found for cancel.",
        )
    metadata = dict(job.metadata_ or {})
    if metadata.get("source") != BACKGROUND_FILL_ENQUEUE_SOURCE:
        raise DatasetFillCancelValidationError(
            "dataset_fill_cancel_wrong_source",
            "Cancel is allowed only for background fill enqueue jobs.",
            {"jobId": str(job.id), "status": str(job.status), "datasetKey": str(job.dataset_key)},
        )
    if job.status != "running":
        raise DatasetFillCancelValidationError(
            "dataset_fill_cancel_not_running",
            "Cancel requires a running background fill job.",
            {"jobId": str(job.id), "status": str(job.status), "datasetKey": str(job.dataset_key)},
        )

    actor = (requested_by or "").strip() or LOCAL_CANCEL_DEFAULT_ACTOR
    cancelled = repository.mark_background_fill_enqueue_job_cancel_requested(
        job,
        now=now or datetime.now(timezone.utc),
        updated_by=actor,
        reason=reason.strip(),
    )
    return DatasetFillCancelResult(
        job_id=str(cancelled.id),
        dataset_key=str(cancelled.dataset_key),
        status=str(cancelled.status),
        reason_code=LOCAL_CANCEL_REQUESTED_REASON_CODE,
        safety_status=LOCAL_CANCEL_SAFETY_STATUS,
    )


def _validate_static_guards(*, settings: object, confirm_cancel: bool, reason: str) -> None:
    if getattr(settings, "tradelab_local_fill_enabled", False) is not True:
        raise DatasetFillCancelValidationError(
            "dataset_fill_cancel_local_disabled",
            "Local background fill cancel is disabled.",
        )
    environment = str(getattr(settings, "tradelab_environment", "local")).strip().lower()
    if environment not in LOCAL_CANCEL_ALLOWED_ENVIRONMENTS:
        raise DatasetFillCancelValidationError(
            "dataset_fill_cancel_not_local_dev",
            "Local background fill cancel is allowed only in local/dev/test environments.",
        )
    if confirm_cancel is not True:
        raise DatasetFillCancelValidationError(
            "dataset_fill_cancel_confirm_required",
            "Cancelling a background fill job requires explicit confirmation.",
        )
    normalized_reason = (reason or "").strip()
    if not normalized_reason or len(normalized_reason) > LOCAL_CANCEL_MAX_REASON_LENGTH:
        raise DatasetFillCancelValidationError(
            "dataset_fill_cancel_reason_invalid",
            "Cancel reason must be between 1 and 120 characters.",
        )


def _parse_job_id(job_id: str) -> UUID:
    try:
        return UUID(str(job_id))
    except ValueError as exc:
        raise DatasetFillCancelValidationError(
            "dataset_fill_cancel_job_not_found",
            "Background fill job was not found for cancel.",
        ) from exc
