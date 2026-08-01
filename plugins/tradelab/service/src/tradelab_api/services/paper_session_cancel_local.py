from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Protocol
from uuid import UUID

from tradelab_api.db.models import PaperSession

LOCAL_PAPER_CANCEL_ALLOWED_ENVIRONMENTS = {"local", "dev", "test"}
LOCAL_PAPER_CANCEL_SAFETY_STATUS = "local_dev_paper_cancel"
LOCAL_PAPER_CANCEL_ALLOWED_REASONS = {"user_requested"}
LOCAL_PAPER_CANCEL_CANCELLABLE_STATUSES = {"queued", "running"}
SECRET_MARKERS = ("secret", "token", "password", "apikey", "api_key", "privatekey", "private_key", "passphrase")


class PaperSessionCancelRepository(Protocol):
    def get_paper_session_for_update(self, session_id: UUID) -> PaperSession | None: ...
    def create_audit_event(self, **fields: Any) -> object: ...


class PaperSessionStatusRepository(Protocol):
    def get_paper_session_status(self, session_id: UUID) -> str | None: ...


@dataclass(frozen=True)
class PaperSessionCancelLocalRequestData:
    confirm_local_paper_cancel: bool
    reason: str = "user_requested"
    actor: str = "local-user"


@dataclass(frozen=True)
class PaperSessionCancelLocalResult:
    status: str
    reason_code: str
    safety_status: str = LOCAL_PAPER_CANCEL_SAFETY_STATUS
    session_id: str | None = None
    previous_status: str | None = None
    current_status: str | None = None
    cancel_requested_at: datetime | None = None
    details: dict[str, Any] = field(default_factory=dict)
    should_commit: bool = False
    semantic_status_code: int = 200


class LocalPaperCancelProvider:
    def __init__(self, repository: PaperSessionStatusRepository, *, kill_switch_enabled: bool = False) -> None:
        self.repository = repository
        self._kill_switch_enabled = kill_switch_enabled

    def should_cancel(self, session_id: str) -> bool:
        try:
            parsed_session_id = UUID(session_id)
        except ValueError:
            return False
        return self.repository.get_paper_session_status(parsed_session_id) == "cancel_requested"

    def kill_switch_enabled(self) -> bool:
        return self._kill_switch_enabled


def execute_local_paper_session_cancel(
    repository: PaperSessionCancelRepository,
    *,
    settings: object,
    session_id: UUID,
    request: PaperSessionCancelLocalRequestData,
    now: datetime | None = None,
) -> PaperSessionCancelLocalResult:
    blocked = _validate_guards(settings=settings, request=request)
    if blocked is not None:
        return PaperSessionCancelLocalResult(
            status="blocked",
            reason_code=blocked,
            semantic_status_code=_semantic_status_code(blocked),
        )

    row = repository.get_paper_session_for_update(session_id)
    if row is None:
        return PaperSessionCancelLocalResult(
            status="blocked",
            reason_code="paper_local_cancel_session_not_found",
            semantic_status_code=404,
        )
    if row.mode != "paper":
        return PaperSessionCancelLocalResult(
            status="blocked",
            reason_code="paper_local_cancel_wrong_mode",
            session_id=str(row.id),
            previous_status=row.status,
            current_status=row.status,
            details={"currentStatus": row.status, "mode": row.mode},
            semantic_status_code=409,
        )
    if row.status not in LOCAL_PAPER_CANCEL_CANCELLABLE_STATUSES:
        return PaperSessionCancelLocalResult(
            status="blocked",
            reason_code="paper_local_cancel_not_cancellable",
            session_id=str(row.id),
            previous_status=row.status,
            current_status=row.status,
            details={"currentStatus": row.status},
            semantic_status_code=409,
        )

    requested_at = now or _utcnow()
    actor = _sanitize_actor(request.actor)
    reason = _sanitize_reason(request.reason)
    previous_status = row.status
    if previous_status == "queued":
        current_status = "cancelled"
        reason_code = "paper_local_cancelled"
        action = "paper_session_cancelled"
        row.finished_at = row.finished_at or requested_at
    else:
        current_status = "cancel_requested"
        reason_code = "paper_local_cancel_requested"
        action = "paper_session_cancel_requested"

    row.status = current_status
    row.reason_code = reason_code
    row.cancel_requested_at = row.cancel_requested_at or requested_at
    row.updated_at = requested_at
    row.updated_by = actor
    repository.create_audit_event(
        paper_session_id=row.id,
        event_at=requested_at,
        actor=actor,
        action=action,
        target_type="paper_session",
        target_id=row.id,
        old_state=previous_status,
        new_state=current_status,
        reason_code=reason_code,
        correlation_id=None,
        request_id=None,
        metadata_={
            "safetyStatus": LOCAL_PAPER_CANCEL_SAFETY_STATUS,
            "reason": reason,
            "actor": actor,
        },
        created_by=actor,
    )
    return PaperSessionCancelLocalResult(
        status=current_status,
        reason_code=reason_code,
        session_id=str(row.id),
        previous_status=previous_status,
        current_status=current_status,
        cancel_requested_at=row.cancel_requested_at,
        details={"reason": reason, "actor": actor},
        should_commit=True,
        semantic_status_code=200,
    )


def _validate_guards(*, settings: object, request: PaperSessionCancelLocalRequestData) -> str | None:
    environment = str(getattr(settings, "tradelab_environment", "local") or "local").strip().lower()
    if environment not in LOCAL_PAPER_CANCEL_ALLOWED_ENVIRONMENTS:
        return "paper_local_cancel_environment_not_allowed"
    if not bool(getattr(settings, "tradelab_local_paper_engine_enabled", False)):
        return "paper_local_cancel_not_enabled"
    if request.confirm_local_paper_cancel is not True:
        return "paper_local_cancel_confirm_required"
    if _sanitize_reason(request.reason) not in LOCAL_PAPER_CANCEL_ALLOWED_REASONS:
        return "paper_local_cancel_reason_invalid"
    return None


def _sanitize_reason(reason: str) -> str:
    value = str(reason or "").strip().lower()
    if any(marker in value.replace("-", "_") for marker in SECRET_MARKERS):
        return "[REDACTED]"
    return value


def _sanitize_actor(actor: str) -> str:
    value = str(actor or "local-user").strip() or "local-user"
    for marker in SECRET_MARKERS:
        value = value.replace(marker, "[REDACTED]")
    return value[:80]


def _semantic_status_code(reason_code: str) -> int:
    if reason_code in {"paper_local_cancel_not_enabled", "paper_local_cancel_environment_not_allowed"}:
        return 403
    if reason_code in {"paper_local_cancel_confirm_required", "paper_local_cancel_reason_invalid"}:
        return 400
    if reason_code == "paper_local_cancel_session_not_found":
        return 404
    if reason_code in {"paper_local_cancel_not_cancellable", "paper_local_cancel_wrong_mode"}:
        return 409
    return 200


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)
