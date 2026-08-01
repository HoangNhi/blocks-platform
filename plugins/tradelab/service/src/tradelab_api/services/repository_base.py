from __future__ import annotations

from typing import Any, Generic, TypeVar
from uuid import UUID

from sqlalchemy import Select, select
from sqlalchemy.orm import Session


TModel = TypeVar("TModel")


class CRUDRepository(Generic[TModel]):
    model: type[TModel]

    def __init__(self, session: Session) -> None:
        self.session = session

    def _base_select(self) -> Select[Any]:
        return select(self.model)

    def create(self, obj: TModel) -> TModel:
        self.session.add(obj)
        self.session.flush()
        self.session.refresh(obj)
        return obj

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

    def update(self, obj: TModel, **fields: Any) -> TModel:
        for field, value in fields.items():
            setattr(obj, field, value)
        self.session.flush()
        self.session.refresh(obj)
        return obj

    def soft_delete(self, obj: TModel) -> TModel:
        if hasattr(obj, "is_deleted"):
            setattr(obj, "is_deleted", True)
        if hasattr(obj, "is_active"):
            setattr(obj, "is_active", False)
        self.session.flush()
        self.session.refresh(obj)
        return obj

