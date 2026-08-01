from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

LOCAL_PAPER_KILL_SWITCH_ALLOWED_ENVIRONMENTS = {"local", "dev", "test"}
READ_ONLY_PAPER_KILL_SWITCH_STATUS = "read_only_paper_kill_switch_status"
LOCAL_DEV_PAPER_KILL_SWITCH_STATUS = "local_dev_paper_kill_switch"
SESSION_SCOPED_KILL_SWITCH_SAFETY_STATUS = "local_dev_paper_kill_switch"
SECRET_MARKERS = ("secret", "token", "password", "apikey", "api_key", "privatekey", "private_key", "passphrase")

@dataclass(frozen=True)
class PaperKillSwitchStatus:
    enabled: bool
    reason_code: str
    safety_status: str = READ_ONLY_PAPER_KILL_SWITCH_STATUS
    source: str = "config"
    updated_at: datetime | None = None
    updated_by: str | None = None
    details: dict[str, Any] = field(default_factory=dict)

def build_paper_kill_switch_status(settings: object) -> PaperKillSwitchStatus:
    environment = str(getattr(settings, "tradelab_environment", "local") or "local").strip().lower()
    local_dev_allowed = environment in LOCAL_PAPER_KILL_SWITCH_ALLOWED_ENVIRONMENTS
    if not local_dev_allowed:
        return PaperKillSwitchStatus(
            enabled=True,
            reason_code="paper_kill_switch_environment_not_allowed",
            details={"environment": environment, "localDevOnly": False},
        )

    enabled = bool(getattr(settings, "tradelab_local_paper_kill_switch_enabled", False))
    return PaperKillSwitchStatus(
        enabled=enabled,
        reason_code="paper_kill_switch_enabled" if enabled else "paper_kill_switch_status_read",
        details={"environment": environment, "localDevOnly": True},
    )

def write_run_blocked_by_kill_switch(
    repository: object,
    row: object,
    *,
    actor: str,
    status: PaperKillSwitchStatus,
) -> object:
    return repository.create_audit_event(
        paper_session_id=row.id,
        event_at=_utcnow(),
        actor=_sanitize_actor(actor),
        action="paper_session_run_blocked_by_kill_switch",
        target_type="paper_session",
        target_id=row.id,
        old_state=getattr(row, "status", None),
        new_state=getattr(row, "status", None),
        reason_code="paper_kill_switch_enabled",
        correlation_id=None,
        request_id=None,
        metadata_={
            "safetyStatus": SESSION_SCOPED_KILL_SWITCH_SAFETY_STATUS,
            "policySource": status.source,
            "killSwitch": {
                "enabled": status.enabled,
                "reasonCode": status.reason_code,
                "details": status.details,
            },
        },
        created_by=_sanitize_actor(actor),
    )

def request_cancel_by_kill_switch(
    repository: object,
    row: object,
    *,
    actor: str,
    status: PaperKillSwitchStatus,
) -> object:
    now = _utcnow()
    clean_actor = _sanitize_actor(actor)
    previous_status = getattr(row, "status", None)
    row.status = "cancel_requested"
    row.reason_code = "paper_kill_switch_cancel_requested"
    row.cancel_requested_at = getattr(row, "cancel_requested_at", None) or now
    row.updated_at = now
    row.updated_by = clean_actor
    return repository.create_audit_event(
        paper_session_id=row.id,
        event_at=now,
        actor=clean_actor,
        action="paper_session_cancel_requested_by_kill_switch",
        target_type="paper_session",
        target_id=row.id,
        old_state=previous_status,
        new_state="cancel_requested",
        reason_code="paper_kill_switch_cancel_requested",
        correlation_id=None,
        request_id=None,
        metadata_={
            "safetyStatus": SESSION_SCOPED_KILL_SWITCH_SAFETY_STATUS,
            "policySource": status.source,
            "killSwitch": {
                "enabled": status.enabled,
                "reasonCode": status.reason_code,
                "details": status.details,
            },
        },
        created_by=clean_actor,
    )

def _sanitize_actor(actor: str) -> str:
    value = str(actor or "local-user").strip() or "local-user"
    for marker in SECRET_MARKERS:
        value = value.replace(marker, "[REDACTED]")
    return value[:80]

def _utcnow() -> datetime:
    return datetime.now(timezone.utc)
