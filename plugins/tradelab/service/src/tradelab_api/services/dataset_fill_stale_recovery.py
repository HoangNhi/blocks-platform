from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from uuid import UUID

from tradelab_api.services.market_data_repository import BACKGROUND_FILL_ENQUEUE_SOURCE, MarketDataRepository

LOCAL_RECOVERY_ALLOWED_ENVIRONMENTS = {"local", "dev", "development", "test", "testing"}
LOCAL_RECOVERY_SAFETY_STATUS = "local_dev_recovery_only"
LOCAL_RECOVERY_REASON_CODE = "dataset_fill_stale_marked_failed"
LOCAL_RECOVERY_DEFAULT_ACTOR = "trade-lab-stale-recovery"
LOCAL_RECOVERY_MAX_REASON_LENGTH = 120


@dataclass(slots=True)
class DatasetFillMarkStaleFailedValidationError(Exception):
    reason_code: str
    message: str
    details: dict[str, object] = field(default_factory=dict)


@dataclass(slots=True)
class DatasetFillMarkStaleFailedResult:
    job_id: str
    dataset_key: str
    status: str
    reason_code: str
    safety_status: str


def mark_stale_fill_job_failed(
    repository: MarketDataRepository,
    *,
    settings: object,
    job_id: str,
    confirm_mark_failed: bool,
    reason: str,
    requested_by: str | None = None,
    now: datetime | None = None,
) -> DatasetFillMarkStaleFailedResult:
    _validate_static_guards(settings=settings, confirm_mark_failed=confirm_mark_failed, reason=reason)
    job_uuid = _parse_job_id(job_id)
    job = repository.get_import_job(job_uuid)
    if job is None or job.job_type != "fill" or job.is_active is not True or job.is_deleted is True:
        raise DatasetFillMarkStaleFailedValidationError(
            "dataset_fill_recovery_job_not_found",
            "Background fill job was not found for stale recovery.",
        )
    metadata = dict(job.metadata_ or {})
    if metadata.get("source") != BACKGROUND_FILL_ENQUEUE_SOURCE:
        raise DatasetFillMarkStaleFailedValidationError(
            "dataset_fill_recovery_wrong_source",
            "Stale recovery is allowed only for background fill enqueue jobs.",
            {"jobId": str(job.id), "status": str(job.status), "datasetKey": str(job.dataset_key)},
        )
    if job.status != "stale":
        raise DatasetFillMarkStaleFailedValidationError(
            "dataset_fill_recovery_not_stale",
            "Stale recovery requires a job with stale status.",
            {"jobId": str(job.id), "status": str(job.status), "datasetKey": str(job.dataset_key)},
        )

    actor = (requested_by or "").strip() or LOCAL_RECOVERY_DEFAULT_ACTOR
    recovered = repository.mark_stale_background_fill_enqueue_job_failed(
        job,
        now=now or datetime.now(timezone.utc),
        updated_by=actor,
        reason=reason.strip(),
    )
    return DatasetFillMarkStaleFailedResult(
        job_id=str(recovered.id),
        dataset_key=str(recovered.dataset_key),
        status=str(recovered.status),
        reason_code=LOCAL_RECOVERY_REASON_CODE,
        safety_status=LOCAL_RECOVERY_SAFETY_STATUS,
    )


def _validate_static_guards(*, settings: object, confirm_mark_failed: bool, reason: str) -> None:
    if getattr(settings, "tradelab_local_fill_enabled", False) is not True:
        raise DatasetFillMarkStaleFailedValidationError(
            "dataset_fill_recovery_local_disabled",
            "Local stale fill recovery is disabled.",
        )
    environment = str(getattr(settings, "tradelab_environment", "local")).strip().lower()
    if environment not in LOCAL_RECOVERY_ALLOWED_ENVIRONMENTS:
        raise DatasetFillMarkStaleFailedValidationError(
            "dataset_fill_recovery_not_local_dev",
            "Local stale fill recovery is allowed only in local/dev/test environments.",
        )
    if confirm_mark_failed is not True:
        raise DatasetFillMarkStaleFailedValidationError(
            "dataset_fill_recovery_confirm_required",
            "Marking a stale background fill failed requires explicit confirmation.",
        )
    normalized_reason = (reason or "").strip()
    if not normalized_reason or len(normalized_reason) > LOCAL_RECOVERY_MAX_REASON_LENGTH:
        raise DatasetFillMarkStaleFailedValidationError(
            "dataset_fill_recovery_reason_invalid",
            "Stale recovery reason must be between 1 and 120 characters.",
        )


def _parse_job_id(job_id: str) -> UUID:
    try:
        return UUID(str(job_id))
    except ValueError as exc:
        raise DatasetFillMarkStaleFailedValidationError(
            "dataset_fill_recovery_job_not_found",
            "Background fill job was not found for stale recovery.",
        ) from exc
