from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from fastapi import HTTPException, Request, status


@dataclass(frozen=True)
class SecurityActor:
    user_id: UUID
    workspace_id: UUID
    username: str | None = None


def get_current_actor(request: Request) -> SecurityActor:
    actor = getattr(request.state, "actor", None)
    if actor is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token and workspace context are required.",
        )
    return actor
