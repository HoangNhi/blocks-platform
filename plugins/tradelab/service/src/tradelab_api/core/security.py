from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import HTTPException, Request, status

if TYPE_CHECKING:
    from tradelab_api.core.context import ExecutionContext


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
    context = get_current_execution_context(request)
    if (actor.workspace_id, actor.user_id) != (context.workspace_id, context.actor_user_id):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Security context mismatch.")
    return actor


def get_current_execution_context(request: Request) -> ExecutionContext:
    ctx = getattr(request.state, "execution_context", None)
    if ctx is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token and workspace context are required.",
        )
    return ctx
