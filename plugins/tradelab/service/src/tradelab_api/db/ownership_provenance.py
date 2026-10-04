from time import monotonic

from sqlalchemy import event, inspect
from sqlalchemy.orm import ORMExecuteState, Session, with_loader_criteria

from tradelab_api.core.context import ExecutionContext
from tradelab_api.db.models import OwnershipProvenanceMixin

IMMUTABLE_OWNERSHIP = frozenset({
    "id", "workspace_id", "owner_user_id", "created_by", "ownership_verified_at",
})

def bind_execution_context(session: Session, context: ExecutionContext) -> None:
    if not isinstance(context, ExecutionContext) or context.authority_deadline_monotonic <= monotonic():
        raise PermissionError("Fresh execution context required for private creation.")
    session.info["execution_context"] = context

@event.listens_for(Session, "before_flush")
def enforce_ownership_provenance(session: Session, _flush_context, _instances) -> None:
    context = session.info.get("execution_context")
    for row in session.new:
        if not isinstance(row, OwnershipProvenanceMixin):
            continue
        if row.ownership_verified_at is not None:
            raise PermissionError("Ownership proof is server-owned.")
        if context is None:
            continue
        if not isinstance(context, ExecutionContext) or context.authority_deadline_monotonic <= monotonic():
            raise PermissionError("Fresh execution context required for private creation.")
        owner = getattr(row, "owner_user_id", None) if hasattr(row, "owner_user_id") else row.created_by
        expected_owner = context.actor_user_id if hasattr(row, "owner_user_id") else str(context.actor_user_id)
        if (
            context.workspace_id.int == 0 or context.actor_user_id.int == 0
            or row.workspace_id != context.workspace_id or owner != expected_owner
        ):
            raise PermissionError("Execution context does not match private ownership.")
        row.ownership_verified_at = context.authority_verified_at
    for row in session.dirty | session.deleted:
        if not isinstance(row, OwnershipProvenanceMixin):
            continue
        state = inspect(row)
        if row.ownership_verified_at is None or any(
            state.attrs[field].history.has_changes()
            for field in IMMUTABLE_OWNERSHIP if field in state.attrs
        ):
            raise PermissionError("Unverified or immutable private ownership.")

@event.listens_for(Session, "do_orm_execute")
def filter_ownership_provenance(state: ORMExecuteState) -> None:
    if not state.is_orm_statement:
        return
    mapper = state.bind_mapper
    if mapper is not None and issubclass(mapper.class_, OwnershipProvenanceMixin):
        if state.is_insert:
            raise PermissionError("Private roots require context-bound ORM creation.")
        if state.is_update:
            assigned = {getattr(column, "key", column) for column in (state.statement._values or {})}
            parameters = state.parameters or []
            if isinstance(parameters, dict):
                parameters = [parameters]
            if assigned & IMMUTABLE_OWNERSHIP or any(
                set(values) & IMMUTABLE_OWNERSHIP - {"id"} for values in parameters
            ):
                raise PermissionError("Private ownership fields are immutable.")
    if state.is_select or state.is_update or state.is_delete:
        state.statement = state.statement.options(with_loader_criteria(
            OwnershipProvenanceMixin,
            lambda root: root.ownership_verified_at.is_not(None),
            include_aliases=True,
        ))
