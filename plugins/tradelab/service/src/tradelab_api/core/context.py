from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from math import isfinite
from uuid import UUID

from tradelab_api.core.authorization import FunctionalPermissionAction


@dataclass(frozen=True, slots=True)
class ExecutionContext:
    workspace_id: UUID
    actor_user_id: UUID
    permission_key: str
    action: FunctionalPermissionAction
    resource_type: str
    resource_id: UUID | None
    run_id: UUID | None
    correlation_id: str
    authority_verified_at: datetime
    authority_deadline_monotonic: float

    def __post_init__(self) -> None:
        if not isinstance(self.workspace_id, UUID) or not isinstance(self.actor_user_id, UUID):
            raise ValueError("Execution context requires workspace and actor UUIDs.")
        if self.resource_id is not None and not isinstance(self.resource_id, UUID):
            raise ValueError("resource_id must be a UUID or None.")
        if self.run_id is not None and not isinstance(self.run_id, UUID):
            raise ValueError("run_id must be a UUID or None.")
        if not isinstance(self.action, FunctionalPermissionAction):
            raise ValueError("action must be a functional permission action.")
        for name in ("permission_key", "resource_type", "correlation_id"):
            value = getattr(self, name)
            if not isinstance(value, str) or not value.strip():
                raise ValueError(f"{name} must be a non-empty string.")
        timestamp = self.authority_verified_at
        if (
            not isinstance(timestamp, datetime)
            or timestamp.tzinfo is None
            or timestamp.utcoffset() != timedelta(0)
        ):
            raise ValueError("authority_verified_at must be a UTC datetime.")
        object.__setattr__(self, "authority_verified_at", timestamp.astimezone(timezone.utc))
        deadline = self.authority_deadline_monotonic
        if (
            isinstance(deadline, bool)
            or not isinstance(deadline, (int, float))
            or not isfinite(deadline)
            or deadline <= 0
        ):
            raise ValueError("authority_deadline_monotonic must be a finite positive value.")
        object.__setattr__(self, "authority_deadline_monotonic", float(deadline))
