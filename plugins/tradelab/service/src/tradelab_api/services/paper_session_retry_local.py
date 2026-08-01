from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Protocol
from uuid import UUID

from tradelab_api.db.models import PaperSession
from tradelab_api.services.paper_kill_switch import PaperKillSwitchStatus
from tradelab_api.services.paper_session_start import (
    PaperSessionStartValidationError,
    start_paper_session,
)

LOCAL_PAPER_RETRY_ALLOWED_ENVIRONMENTS = {"local", "dev", "test"}
LOCAL_PAPER_RETRY_SAFETY_STATUS = "local_dev_paper_retry"
LOCAL_PAPER_RETRY_ALLOWED_REASONS = {"user_requested"}
LOCAL_PAPER_RETRY_SOURCE_STATUSES = {"failed", "blocked", "cancelled"}
SECRET_MARKERS = ("secret", "token", "password", "apikey", "api_key", "privatekey", "private_key", "passphrase")


class PaperSessionRetryRepository(Protocol):
    def get_paper_session_for_update(self, session_id: UUID) -> PaperSession | None: ...
    def find_queued_session_by_idempotency_key(self, idempotency_key: str) -> PaperSession | None: ...
    def find_retry_session_by_source_and_idempotency_key(
        self,
        source_session_id: UUID,
        idempotency_key: str,
    ) -> PaperSession | None: ...
    def create_paper_session(self, **fields: Any) -> PaperSession: ...
    def create_audit_event(self, **fields: Any) -> object: ...


@dataclass(frozen=True)
class PaperSessionRetryLocalRequestData:
    confirm_local_paper_retry: bool
    idempotency_key: str
    reason: str = "user_requested"
    actor: str = "local-user"


@dataclass(frozen=True)
class PaperSessionRetryLocalResult:
    status: str
    reason_code: str
    safety_status: str = LOCAL_PAPER_RETRY_SAFETY_STATUS
    source_session_id: str | None = None
    retry_session_id: str | None = None
    source_status: str | None = None
    retry_status: str | None = None
    idempotency_key: str | None = None
    details: dict[str, Any] = field(default_factory=dict)
    should_commit: bool = False
    semantic_status_code: int = 200


def execute_local_paper_session_retry(
    bot_repository: object,
    strategy_repository: object,
    market_repository: object,
    paper_repository: PaperSessionRetryRepository,
    *,
    settings: object,
    session_id: UUID,
    request: PaperSessionRetryLocalRequestData,
    kill_switch_status: PaperKillSwitchStatus,
) -> PaperSessionRetryLocalResult:
    blocked = _validate_static_guards(settings=settings, request=request)
    if blocked is not None:
        return PaperSessionRetryLocalResult(
            status="blocked",
            reason_code=blocked,
            semantic_status_code=_semantic_status_code(blocked),
        )

    source = paper_repository.get_paper_session_for_update(session_id)
    if source is None:
        return PaperSessionRetryLocalResult(
            status="blocked",
            reason_code="paper_local_retry_source_not_found",
            semantic_status_code=404,
        )
    source_status = str(getattr(source, "status", ""))
    if str(getattr(source, "mode", "")) != "paper":
        return PaperSessionRetryLocalResult(
            status="blocked",
            reason_code="paper_local_retry_wrong_mode",
            source_session_id=str(getattr(source, "id")),
            source_status=source_status,
            details={"mode": getattr(source, "mode", None), "currentStatus": source_status},
            semantic_status_code=409,
        )
    if source_status not in LOCAL_PAPER_RETRY_SOURCE_STATUSES:
        return PaperSessionRetryLocalResult(
            status="blocked",
            reason_code="paper_local_retry_not_retryable",
            source_session_id=str(source.id),
            source_status=source_status,
            details={"allowedStatuses": sorted(LOCAL_PAPER_RETRY_SOURCE_STATUSES), "currentStatus": source_status},
            semantic_status_code=409,
        )

    actor = _sanitize_actor(request.actor)
    reason = _sanitize_reason(request.reason)
    scoped_idempotency_key = _scoped_idempotency_key(source.id, request.idempotency_key)
    existing = paper_repository.find_retry_session_by_source_and_idempotency_key(source.id, scoped_idempotency_key)
    if existing is not None:
        audit = paper_repository.create_audit_event(
            paper_session_id=source.id,
            event_at=_utcnow(),
            actor=actor,
            action="paper_session_retry_idempotency_replayed",
            target_type="paper_session",
            target_id=source.id,
            old_state=source_status,
            new_state=source_status,
            reason_code="paper_local_retry_idempotency_replayed",
            correlation_id=scoped_idempotency_key,
            request_id=None,
            metadata_={"retrySessionId": str(existing.id), "reason": reason, "actor": actor},
            created_by=actor,
        )
        return PaperSessionRetryLocalResult(
            status=str(existing.status),
            reason_code="paper_local_retry_idempotency_replayed",
            source_session_id=str(source.id),
            retry_session_id=str(existing.id),
            source_status=source_status,
            retry_status=str(existing.status),
            idempotency_key=scoped_idempotency_key,
            details={"auditEventIds": [str(audit.id)], "reason": reason, "actor": actor},
            should_commit=True,
            semantic_status_code=200,
        )

    if kill_switch_status.enabled:
        audit = _write_source_audit(
            paper_repository,
            source,
            action="paper_session_retry_blocked_by_kill_switch",
            reason_code="paper_kill_switch_enabled",
            actor=actor,
            idempotency_key=scoped_idempotency_key,
            metadata={
                "safetyStatus": LOCAL_PAPER_RETRY_SAFETY_STATUS,
                "killSwitch": {
                    "enabled": kill_switch_status.enabled,
                    "reasonCode": kill_switch_status.reason_code,
                    "source": kill_switch_status.source,
                    "details": kill_switch_status.details,
                },
                "reason": reason,
                "actor": actor,
            },
        )
        return PaperSessionRetryLocalResult(
            status="blocked",
            reason_code="paper_kill_switch_enabled",
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

    lineage = {
        "sourceSessionId": str(source.id),
        "sourceStatus": source_status,
        "idempotencyKey": scoped_idempotency_key,
        "requestedBy": actor,
        "requestedReason": reason,
    }
    try:
        start_result = start_paper_session(
            bot_repository,
            strategy_repository,
            market_repository,
            paper_repository,
            bot_id=source.bot_id,
            exchange=source.exchange,
            symbol=source.symbol,
            timeframe=source.timeframe,
            start_at=source.start_at,
            end_at=source.end_at,
            starting_cash=source.starting_cash,
            risk_policy_override=dict(source.risk_config or {}),
            preview_fingerprint=None,
            idempotency_key=scoped_idempotency_key,
            confirm_start=True,
            source="strategy_lab_retry",
            actor=actor,
            kill_switch_status=kill_switch_status,
        )
    except PaperSessionStartValidationError as exc:
        audit = _write_source_audit(
            paper_repository,
            source,
            action="paper_session_retry_blocked",
            reason_code=_map_start_error_reason(exc.reason_code),
            actor=actor,
            idempotency_key=scoped_idempotency_key,
            metadata={
                "startReasonCode": exc.reason_code,
                "details": _sanitize_details(exc.details),
                "reason": reason,
                "actor": actor,
            },
        )
        return PaperSessionRetryLocalResult(
            status="blocked",
            reason_code=_map_start_error_reason(exc.reason_code),
            source_session_id=str(source.id),
            source_status=source_status,
            idempotency_key=scoped_idempotency_key,
            details={"auditEventIds": [str(audit.id)], "startReasonCode": exc.reason_code},
            should_commit=True,
            semantic_status_code=exc.status_code,
        )

    if not start_result.allowed or start_result.session_id is None:
        audit = _write_source_audit(
            paper_repository,
            source,
            action="paper_session_retry_blocked",
            reason_code="paper_local_retry_gate_failed",
            actor=actor,
            idempotency_key=scoped_idempotency_key,
            metadata={
                "startReasonCode": start_result.reason_code,
                "failedGates": [failure.reason_code for failure in start_result.failed_gates],
                "reason": reason,
                "actor": actor,
            },
        )
        return PaperSessionRetryLocalResult(
            status="blocked",
            reason_code="paper_local_retry_gate_failed",
            source_session_id=str(source.id),
            source_status=source_status,
            idempotency_key=scoped_idempotency_key,
            details={"auditEventIds": [str(audit.id)], "startReasonCode": start_result.reason_code},
            should_commit=True,
            semantic_status_code=422,
        )

    retry_session_id = start_result.session_id
    retry_row = paper_repository.find_queued_session_by_idempotency_key(scoped_idempotency_key)
    if retry_row is not None:
        retry_context = dict(retry_row.gate_context or {})
        retry_context["retry"] = lineage
        retry_row.gate_context = retry_context

    source_audit = _write_source_audit(
        paper_repository,
        source,
        action="paper_session_retry_requested",
        reason_code="paper_local_retry_requested",
        actor=actor,
        idempotency_key=scoped_idempotency_key,
        metadata={"retrySessionId": retry_session_id, "reason": reason, "actor": actor},
    )
    retry_audit = paper_repository.create_audit_event(
        paper_session_id=UUID(retry_session_id),
        event_at=_utcnow(),
        actor=actor,
        action="paper_session_retry_queued",
        target_type="paper_session",
        target_id=UUID(retry_session_id),
        old_state=None,
        new_state="queued",
        reason_code="paper_local_retry_queued",
        correlation_id=scoped_idempotency_key,
        request_id=start_result.request_fingerprint,
        metadata_={"sourceSessionId": str(source.id), "sourceStatus": source_status, "reason": reason, "actor": actor},
        created_by=actor,
    )
    return PaperSessionRetryLocalResult(
        status="queued",
        reason_code="paper_local_retry_queued",
        source_session_id=str(source.id),
        retry_session_id=retry_session_id,
        source_status=source_status,
        retry_status="queued",
        idempotency_key=scoped_idempotency_key,
        details={"auditEventIds": [str(source_audit.id), str(retry_audit.id)], "reason": reason, "actor": actor},
        should_commit=True,
        semantic_status_code=201,
    )


def _validate_static_guards(*, settings: object, request: PaperSessionRetryLocalRequestData) -> str | None:
    environment = str(getattr(settings, "tradelab_environment", "local") or "local").strip().lower()
    if environment not in LOCAL_PAPER_RETRY_ALLOWED_ENVIRONMENTS:
        return "paper_local_retry_environment_not_allowed"
    if not bool(getattr(settings, "tradelab_local_paper_engine_enabled", False)):
        return "paper_local_retry_not_enabled"
    if request.confirm_local_paper_retry is not True:
        return "paper_local_retry_confirm_required"
    raw_key = str(request.idempotency_key or "").strip()
    if not raw_key:
        return "paper_local_retry_idempotency_required"
    if _contains_secret(raw_key) or len(raw_key) > 120:
        return "paper_local_retry_idempotency_invalid"
    if _sanitize_reason(request.reason) not in LOCAL_PAPER_RETRY_ALLOWED_REASONS:
        return "paper_local_retry_reason_invalid"
    return None


def _write_source_audit(
    repository: PaperSessionRetryRepository,
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
        metadata_=_sanitize_details(metadata),
        created_by=actor,
    )


def _map_start_error_reason(reason_code: str) -> str:
    if reason_code == "paper_idempotency_conflict":
        return "paper_local_retry_idempotency_conflict"
    if reason_code == "paper_kill_switch_enabled":
        return "paper_kill_switch_enabled"
    return "paper_local_retry_source_context_invalid"


def _scoped_idempotency_key(source_session_id: UUID, raw_key: str) -> str:
    return f"paper-retry:{source_session_id}:{str(raw_key).strip()}"


def _semantic_status_code(reason_code: str) -> int:
    if reason_code in {"paper_local_retry_not_enabled", "paper_local_retry_environment_not_allowed"}:
        return 403
    if reason_code in {
        "paper_local_retry_confirm_required",
        "paper_local_retry_idempotency_required",
        "paper_local_retry_idempotency_invalid",
        "paper_local_retry_reason_invalid",
    }:
        return 400
    if reason_code == "paper_local_retry_source_not_found":
        return 404
    if reason_code in {
        "paper_local_retry_wrong_mode",
        "paper_local_retry_not_retryable",
        "paper_local_retry_idempotency_conflict",
    }:
        return 409
    if reason_code in {"paper_local_retry_source_context_invalid", "paper_local_retry_gate_failed"}:
        return 422
    if reason_code == "paper_kill_switch_enabled":
        return 403
    return 200


def _sanitize_reason(reason: str) -> str:
    value = str(reason or "").strip().lower()
    if _contains_secret(value):
        return "[REDACTED]"
    return value


def _sanitize_actor(actor: str) -> str:
    value = str(actor or "local-user").strip() or "local-user"
    for marker in SECRET_MARKERS:
        value = value.replace(marker, "[REDACTED]")
    return value[:80]


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
    return value


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)
