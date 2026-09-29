from __future__ import annotations

from typing import Any, Generic, TypeVar
from uuid import UUID

from sqlalchemy import Select, inspect, select
from sqlalchemy.orm import Session

TModel = TypeVar("TModel")

IMMUTABLE_FIELDS = frozenset({
    "id",
    "workspace_id",
    "owner_user_id",
    "created_at",
    "created_by",
})


class ScopedRepository(Generic[TModel]):
    model: type[TModel]

    def __init__(self, session: Session, workspace_id: UUID) -> None:
        if workspace_id is None:
            raise ValueError("workspace_id is required and cannot be None.")
        self.session = session
        self.workspace_id = workspace_id

    def _base_select(self) -> Select[Any]:
        stmt = select(self.model).where(self.model.workspace_id == self.workspace_id)  # type: ignore[attr-defined]
        return stmt

    def get_by_id(self, item_id: UUID, *, active_only: bool = True) -> TModel | None:
        stmt = self._base_select().where(self.model.id == item_id)  # type: ignore[attr-defined]
        if active_only and hasattr(self.model, "is_deleted"):
            stmt = stmt.where(self.model.is_deleted.is_(False))  # type: ignore[attr-defined]
        if active_only and hasattr(self.model, "is_active"):
            stmt = stmt.where(self.model.is_active.is_(True))  # type: ignore[attr-defined]
        return self.session.execute(stmt).scalar_one_or_none()

    def list_all(self, *, active_only: bool = True) -> list[TModel]:
        stmt = self._base_select()
        if active_only and hasattr(self.model, "is_deleted"):
            stmt = stmt.where(self.model.is_deleted.is_(False))  # type: ignore[attr-defined]
        if active_only and hasattr(self.model, "is_active"):
            stmt = stmt.where(self.model.is_active.is_(True))  # type: ignore[attr-defined]
        return list(self.session.execute(stmt).scalars().all())

    def create(self, obj: TModel) -> TModel:
        obj_state = inspect(obj, raiseerr=False)
        if obj_state is None or not obj_state.transient:
            raise PermissionError("Only transient objects can be created.")
        if getattr(obj, "workspace_id", None) not in (None, self.workspace_id):
            raise PermissionError("Cannot create resource belonging to another workspace.")

        setattr(obj, "workspace_id", self.workspace_id)
        self.session.add(obj)
        self.session.flush()
        self.session.refresh(obj)
        return obj

    def update(self, obj: TModel, **fields: Any) -> TModel:
        current_ws = getattr(obj, "workspace_id", None)
        if current_ws != self.workspace_id:
            raise PermissionError("Cannot update resource belonging to another workspace.")

        for field, value in fields.items():
            if field in IMMUTABLE_FIELDS:
                continue  # Never mutate immutable identity/ownership/audit fields
            setattr(obj, field, value)

        self.session.flush()
        self.session.refresh(obj)
        return obj

    def soft_delete(self, obj: TModel) -> TModel:
        current_ws = getattr(obj, "workspace_id", None)
        if current_ws != self.workspace_id:
            raise PermissionError("Cannot delete resource belonging to another workspace.")

        if hasattr(obj, "is_deleted"):
            setattr(obj, "is_deleted", True)
        if hasattr(obj, "is_active"):
            setattr(obj, "is_active", False)
        self.session.flush()
        self.session.refresh(obj)
        return obj


class ScopedCredentialRepository(ScopedRepository[TModel]):
    """Repository for credential roots that additionally require owner_user_id match."""

    def __init__(self, session: Session, workspace_id: UUID, owner_user_id: UUID) -> None:
        super().__init__(session, workspace_id)
        if owner_user_id is None:
            raise ValueError("owner_user_id is required for credential repositories.")
        self.owner_user_id = owner_user_id

    def _base_select(self) -> Select[Any]:
        stmt = (
            select(self.model)
            .where(
                self.model.workspace_id == self.workspace_id,  # type: ignore[attr-defined]
                self.model.owner_user_id == self.owner_user_id,  # type: ignore[attr-defined]
            )
        )
        return stmt

    def create(self, obj: TModel) -> TModel:
        setattr(obj, "owner_user_id", self.owner_user_id)
        return super().create(obj)

    def update(self, obj: TModel, **fields: Any) -> TModel:
        if getattr(obj, "owner_user_id", None) != self.owner_user_id:
            raise PermissionError("Cannot update credential belonging to another user.")
        return super().update(obj, **fields)

    def soft_delete(self, obj: TModel) -> TModel:
        if getattr(obj, "owner_user_id", None) != self.owner_user_id:
            raise PermissionError("Cannot delete credential belonging to another user.")
        return super().soft_delete(obj)
