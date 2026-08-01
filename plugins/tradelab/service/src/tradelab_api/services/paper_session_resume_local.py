from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Protocol
from uuid import UUID

from tradelab_api.db.models import PaperSession
from tradelab_api.services.paper_kill_switch import PaperKillSwitchStatus

LOCAL_PAPER_RESUME_ALLOWED_ENVIRONMENTS = {"local", "dev", "test"}
LOCAL_PAPER_RESUME_SAFETY_STATUS = "local_dev_paper_resume"
LOCAL_PAPER_RESUME_ALLOWED_REASONS = {"user_requested"}
LOCAL_PAPER_RESUME_SOURCE_REASONS = {"paper_session_cancel_requested", "paper_kill_switch_enabled"}
SECRET_MARKERS = ("secret", "token", "password", "apikey", "api_key", "privatekey", "private_key", "passphrase")


class PaperSessionResumeRepository(Protocol):
    def get_paper_session_for_update(self, session_id: UUID) -> PaperSession | None: ...
    def find_resumed_session_by_source_and_idempotency_key(
        self,
        source_session_id: UUID,
        idempotency_key: str,
    ) -> PaperSession | None: ...
    def create_audit_event(self, **fields: Any) -> object: ...


@dataclass(frozen=True)
class PaperSessionResumeLocalRequestData:
    confirm_local_paper_resume: bool
    idempotency_key: str
    reason: str = "user_requested"
    actor: str = "local-user"


@dataclass(frozen=True)
class PaperSessionResumeCursor:
    last_processed_candle_id: str
    next_candle_open_time: datetime
    attempt_no: int


@dataclass(frozen=True)
class PaperSessionResumeLocalResult:
    status: str
    reason_code: str
    safety_status: str = LOCAL_PAPER_RESUME_SAFETY_STATUS
    source_session_id: str | None = None
    resume_session_id: str | None = None
    source_status: str | None = None
    resume_status: str | None = None
    idempotency_key: str | None = None
    resume_cursor: PaperSessionResumeCursor | None = None
    details: dict[str, Any] = field(default_factory=dict)
    should_commit: bool = False
    semantic_status_code: int = 200


class ReadinessBuilder(Protocol):
    def __call__(self, repository: PaperSessionResumeRepository, *, session_id: UUID) -> Any: ...


def execute_local_paper_session_resume(
    repository: PaperSessionResumeRepository,
    *,
    settings: object,
    session_id: UUID,
    request: PaperSessionResumeLocalRequestData,
    kill_switch_status: PaperKillSwitchStatus,
    readiness_builder: ReadinessBuilder,
) -> PaperSessionResumeLocalResult:
    blocked = _validate_static_guards(settings=settings, request=request)
    if blocked is not None:
        return PaperSessionResumeLocalResult(
            status="blocked",
            reason_code=blocked,
            semantic_status_code=_semantic_status_code(blocked),
        )

    source = repository.get_paper_session_for_update(session_id)
    if source is None:
        return PaperSessionResumeLocalResult(
            status="blocked",
            reason_code="paper_local_resume_source_not_found",
            semantic_status_code=404,
        )

    source_status = str(getattr(source, "status", ""))
    source_reason = str(getattr(source, "reason_code", "") or "")
    if str(getattr(source, "mode", "")) != "paper":
        return _blocked_source(source, "paper_local_resume_wrong_mode", 409)
    if source_status != "cancelled" or source_reason not in LOCAL_PAPER_RESUME_SOURCE_REASONS:
        return _blocked_source(source, "paper_local_resume_not_resumable", 409)

    actor = _sanitize_actor(request.actor)
    reason = _sanitize_reason(request.reason)
    scoped_idempotency_key = _scoped_idempotency_key(source.id, request.idempotency_key)
    existing = repository.find_resumed_session_by_source_and_idempotency_key(source.id, scoped_idempotency_key)
    if existing is not None:
        audit = _write_source_audit(
            repository,
            source,
            action="paper_session_resume_idempotency_replayed",
            reason_code="paper_local_resume_idempotency_replayed",
            actor=actor,
            idempotency_key=scoped_idempotency_key,
            metadata={"resumeSessionId": str(existing.id), "reason": reason, "actor": actor},
        )
        return PaperSessionResumeLocalResult(
            status=str(existing.status),
            reason_code="paper_local_resume_idempotency_replayed",
            source_session_id=str(source.id),
            resume_session_id=str(existing.id),
            source_status=source_status,
            resume_status=str(existing.status),
            idempotency_key=scoped_idempotency_key,
            details={"auditEventIds": [str(audit.id)], "reason": reason, "actor": actor},
            should_commit=True,
            semantic_status_code=200,
        )

    if kill_switch_status.enabled:
        audit = _write_source_audit(
            repository,
            source,
            action="paper_session_resume_blocked_by_kill_switch",
            reason_code="paper_local_resume_kill_switch_enabled",
            actor=actor,
            idempotency_key=scoped_idempotency_key,
            metadata={
                "killSwitch": {"enabled": True, "reasonCode": kill_switch_status.reason_code},
                "reason": reason,
                "actor": actor,
            },
        )
        return PaperSessionResumeLocalResult(
            status="blocked",
            reason_code="paper_local_resume_kill_switch_enabled",
            source_session_id=str(source.id),
            source_status=source_status,
            idempotency_key=scoped_idempotency_key,
            details={
                "auditEventIds": [str(audit.id)],
                "killSwitch": {"enabled": True, "reasonCode": kill_switch_status.reason_code},
            },
            should_commit=True,
            semantic_status_code=403,
        )

    readiness = readiness_builder(repository, session_id=source.id)
    readiness_block = _readiness_block_reason(readiness)
    if readiness_block is not None:
        action = (
            "paper_session_resume_checkpoint_missing"
            if readiness_block == "paper_local_resume_checkpoint_missing"
            else "paper_session_resume_blocked"
        )
        audit = _write_source_audit(
            repository,
            source,
            action=action,
            reason_code=readiness_block,
            actor=actor,
            idempotency_key=scoped_idempotency_key,
            metadata={
                "readinessReasonCode": getattr(readiness, "reason_code", None),
                "blockingReasons": list(getattr(readiness, "blocking_reasons", []) or []),
                "reason": reason,
                "actor": actor,
            },
        )
        return PaperSessionResumeLocalResult(
            status="blocked",
            reason_code=readiness_block,
            source_session_id=str(source.id),
            source_status=source_status,
            idempotency_key=scoped_idempotency_key,
            details={"auditEventIds": [str(audit.id)], "readinessReasonCode": getattr(readiness, "reason_code", None)},
            should_commit=True,
            semantic_status_code=_semantic_status_code(readiness_block),
        )

    cursor = _cursor_from_readiness(readiness)
    requested = _write_source_audit(
        repository,
        source,
        action="paper_session_resume_requested",
        reason_code="paper_local_resume_requested",
        actor=actor,
        idempotency_key=scoped_idempotency_key,
        metadata={"resumeCursor": _cursor_details(cursor), "reason": reason, "actor": actor},
    )
    previous_status = source_status
    source.status = "queued"
    source.reason_code = "paper_local_resume_queued"
    source.error_message = None
    source.finished_at = None
    source.cancel_requested_at = None
    source.updated_at = _utcnow()
    source.updated_by = actor
    gate_context = dict(getattr(source, "gate_context", None) or {})
    gate_context["resume"] = {
        "sourceSessionId": str(source.id),
        "idempotencyKey": scoped_idempotency_key,
        "attemptNo": cursor.attempt_no,
        "lastProcessedCandleId": cursor.last_processed_candle_id,
        "nextCandleOpenTime": cursor.next_candle_open_time.isoformat(),
        "requestedBy": actor,
        "requestedReason": reason,
        "safetyStatus": LOCAL_PAPER_RESUME_SAFETY_STATUS,
        "implementationMode": "same_session",
    }
    source.gate_context = _sanitize_details(gate_context)
    queued = _write_source_audit(
        repository,
        source,
        action="paper_session_resume_queued",
        reason_code="paper_local_resume_queued",
        actor=actor,
        idempotency_key=scoped_idempotency_key,
        metadata={"previousStatus": previous_status, "resumeCursor": _cursor_details(cursor), "reason": reason, "actor": actor},
    )
    return PaperSessionResumeLocalResult(
        status="queued",
        reason_code="paper_local_resume_queued",
        source_session_id=str(source.id),
        resume_session_id=str(source.id),
        source_status=previous_status,
        resume_status="queued",
        idempotency_key=scoped_idempotency_key,
        resume_cursor=cursor,
        details={"auditEventIds": [str(requested.id), str(queued.id)], "reason": reason, "actor": actor},
        should_commit=True,
        semantic_status_code=200,
    )


def _validate_static_guards(*, settings: object, request: PaperSessionResumeLocalRequestData) -> str | None:
    environment = str(getattr(settings, "tradelab_environment", "local") or "local").strip().lower()
    if environment not in LOCAL_PAPER_RESUME_ALLOWED_ENVIRONMENTS:
        return "paper_local_resume_environment_not_allowed"
    if not bool(getattr(settings, "tradelab_local_paper_engine_enabled", False)):
        return "paper_local_resume_not_enabled"
    if request.confirm_local_paper_resume is not True:
        return "paper_local_resume_confirm_required"
    raw_key = str(request.idempotency_key or "").strip()
    if not raw_key:
        return "paper_local_resume_idempotency_required"
    if _contains_secret(raw_key) or len(raw_key) > 120:
        return "paper_local_resume_idempotency_invalid"
    if _sanitize_reason(request.reason) not in LOCAL_PAPER_RESUME_ALLOWED_REASONS:
        return "paper_local_resume_reason_invalid"
    return None


def _blocked_source(source: PaperSession, reason_code: str, semantic_status_code: int) -> PaperSessionResumeLocalResult:
    return PaperSessionResumeLocalResult(
        status="blocked",
        reason_code=reason_code,
        source_session_id=str(source.id),
        source_status=str(source.status),
        details={"currentStatus": str(source.status), "mode": getattr(source, "mode", None)},
        semantic_status_code=semantic_status_code,
    )


def _readiness_block_reason(readiness: object) -> str | None:
    if getattr(readiness, "allowed", False) is not True:
        blocking = list(getattr(readiness, "blocking_reasons", []) or [])
        return str(blocking[0] if blocking else getattr(readiness, "reason_code", "paper_local_resume_readiness_failed"))
    if getattr(readiness, "checkpoint_source", None) != "persisted":
        return "paper_local_resume_checkpoint_missing"
    if getattr(readiness, "artifact_identity_status", None) != "ready":
        return "paper_local_resume_artifact_identity_ambiguous"
    checkpoint = getattr(readiness, "checkpoint", None)
    if checkpoint is None:
        return "paper_local_resume_checkpoint_missing"
    if not getattr(checkpoint, "next_candle_id", None) or getattr(checkpoint, "next_candle_open_time", None) is None:
        return "paper_local_resume_no_remaining_candles"
    if int(getattr(checkpoint, "pending_orders_count", 0) or 0) != 0:
        return "paper_local_resume_pending_orders_unsupported"
    return None


def _cursor_from_readiness(readiness: object) -> PaperSessionResumeCursor:
    checkpoint = getattr(readiness, "checkpoint")
    attempt_no = int(getattr(readiness, "attempt_no", 0) or 0) + 1
    return PaperSessionResumeCursor(
        last_processed_candle_id=str(getattr(checkpoint, "last_processed_candle_id")),
        next_candle_open_time=getattr(checkpoint, "next_candle_open_time"),
        attempt_no=attempt_no,
    )


def _cursor_details(cursor: PaperSessionResumeCursor) -> dict[str, object]:
    return {
        "lastProcessedCandleId": cursor.last_processed_candle_id,
        "nextCandleOpenTime": cursor.next_candle_open_time.isoformat(),
        "attemptNo": cursor.attempt_no,
    }


def _write_source_audit(
    repository: PaperSessionResumeRepository,
    source: PaperSession,
    *,
    action: str,
    reason_code: str,
    actor: str,
    idempotency_key: str,
    metadata: dict[str, Any],
) -> object:
    return repository.create_audit_event(
        paper_session_id=source.id,
        event_at=_utcnow(),
        actor=actor,
        action=action,
        target_type="paper_session",
        target_id=source.id,
        old_state=source.status,
        new_state=source.status,
        reason_code=reason_code,
        correlation_id=idempotency_key,
        request_id=None,
        metadata_=_sanitize_details({"safetyStatus": LOCAL_PAPER_RESUME_SAFETY_STATUS, **metadata}),
        created_by=actor,
    )


def _scoped_idempotency_key(source_session_id: UUID, raw_key: str) -> str:
    return f"paper-resume:{source_session_id}:{str(raw_key).strip()}"


def _sanitize_actor(actor: str) -> str:
    value = str(actor or "local-user").strip() or "local-user"
    for marker in SECRET_MARKERS:
        value = value.replace(marker, "[REDACTED]")
    return value[:80]


def _sanitize_reason(reason: str) -> str:
    value = str(reason or "").strip().lower()
    if _contains_secret(value):
        return "[REDACTED]"
    return value


def _contains_secret(value: str) -> bool:
    normalized = value.replace("-", "_").strip().lower()
    return any(marker in normalized for marker in SECRET_MARKERS)


def _sanitize_details(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            str(key): "[REDACTED]" if _contains_secret(str(key)) else _sanitize_details(nested)
            for key, nested in value.items()
        }
    if isinstance(value, list):
        return [_sanitize_details(item) for item in value]
    if isinstance(value, tuple):
        return [_sanitize_details(item) for item in value]
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _semantic_status_code(reason_code: str) -> int:
    if reason_code in {
        "paper_local_resume_not_enabled",
        "paper_local_resume_environment_not_allowed",
        "paper_local_resume_kill_switch_enabled",
    }:
        return 403
    if reason_code in {
        "paper_local_resume_confirm_required",
        "paper_local_resume_idempotency_required",
        "paper_local_resume_idempotency_invalid",
        "paper_local_resume_reason_invalid",
    }:
        return 400
    if reason_code == "paper_local_resume_source_not_found":
        return 404
    if reason_code in {
        "paper_local_resume_wrong_mode",
        "paper_local_resume_not_resumable",
        "paper_local_resume_idempotency_conflict",
    }:
        return 409
    if reason_code in {
        "paper_local_resume_readiness_failed",
        "paper_local_resume_checkpoint_missing",
        "paper_local_resume_checkpoint_ambiguous",
        "paper_local_resume_no_remaining_candles",
        "paper_local_resume_pending_orders_unsupported",
        "paper_local_resume_strategy_state_unsupported",
        "paper_local_resume_run_context_invalid",
    }:
        return 422
    return 200


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)
