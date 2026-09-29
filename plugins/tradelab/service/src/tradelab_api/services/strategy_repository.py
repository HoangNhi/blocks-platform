from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from tradelab_api.db.models import Strategy, StrategyGroup, StrategyVersion
from tradelab_api.services.scoped_repository import ScopedRepository


class StrategyRepository(ScopedRepository[Strategy]):
    model = Strategy

    def __init__(self, session: Session, workspace_id: UUID) -> None:
        super().__init__(session, workspace_id)

    def create_strategy_group(self, **fields: object) -> StrategyGroup:
        fields.pop("workspace_id", None)
        obj = StrategyGroup(workspace_id=self.workspace_id, **fields)
        self.session.add(obj)
        self.session.flush()
        self.session.refresh(obj)
        return obj

    def list_strategy_groups(self) -> list[StrategyGroup]:
        stmt = (
            select(StrategyGroup)
            .where(
                StrategyGroup.workspace_id == self.workspace_id,
                StrategyGroup.is_deleted.is_(False),
                StrategyGroup.is_active.is_(True),
            )
        )
        return list(self.session.execute(stmt).scalars().all())

    def get_strategy_group(self, group_id: UUID) -> StrategyGroup | None:
        stmt = (
            select(StrategyGroup)
            .where(
                StrategyGroup.id == group_id,
                StrategyGroup.workspace_id == self.workspace_id,
                StrategyGroup.is_deleted.is_(False),
                StrategyGroup.is_active.is_(True),
            )
        )
        return self.session.execute(stmt).scalar_one_or_none()

    def get_strategy_group_by_slug(self, slug: str) -> StrategyGroup | None:
        stmt = (
            select(StrategyGroup)
            .where(
                StrategyGroup.slug == slug,
                StrategyGroup.workspace_id == self.workspace_id,
                StrategyGroup.is_deleted.is_(False),
                StrategyGroup.is_active.is_(True),
            )
        )
        return self.session.execute(stmt).scalar_one_or_none()

    def get_any_strategy_group_by_slug(self, slug: str) -> StrategyGroup | None:
        stmt = (
            select(StrategyGroup)
            .where(
                StrategyGroup.slug == slug,
                StrategyGroup.workspace_id == self.workspace_id,
            )
        )
        return self.session.execute(stmt).scalar_one_or_none()

    def update_strategy_group(self, group: StrategyGroup, **fields: object) -> StrategyGroup:
        current_ws = getattr(group, "workspace_id", None)
        if current_ws != self.workspace_id:
            raise PermissionError("Cannot update strategy group belonging to another workspace.")
        fields.pop("workspace_id", None)
        for field, value in fields.items():
            setattr(group, field, value)
        self.session.flush()
        self.session.refresh(group)
        return group

    def create_strategy(self, **fields: object) -> Strategy:
        fields.pop("workspace_id", None)
        return self.create(Strategy(**fields))

    def list_strategies(self, *, strategy_group_id: UUID | None = None) -> list[Strategy]:
        stmt = (
            select(Strategy)
            .where(
                Strategy.workspace_id == self.workspace_id,
                Strategy.is_deleted.is_(False),
                Strategy.is_active.is_(True),
            )
        )
        if strategy_group_id is not None:
            stmt = stmt.where(Strategy.strategy_group_id == strategy_group_id)
        return list(self.session.execute(stmt).scalars().all())

    def get_strategy(self, strategy_id: UUID) -> Strategy | None:
        return self.get_by_id(strategy_id)

    def get_strategy_by_slug(self, slug: str) -> Strategy | None:
        stmt = (
            select(Strategy)
            .where(
                Strategy.slug == slug,
                Strategy.workspace_id == self.workspace_id,
                Strategy.is_deleted.is_(False),
                Strategy.is_active.is_(True),
            )
        )
        return self.session.execute(stmt).scalar_one_or_none()

    def get_any_strategy_by_slug(self, slug: str) -> Strategy | None:
        stmt = (
            select(Strategy)
            .where(
                Strategy.slug == slug,
                Strategy.workspace_id == self.workspace_id,
            )
        )
        return self.session.execute(stmt).scalar_one_or_none()

    def update_strategy(self, strategy: Strategy, **fields: object) -> Strategy:
        return self.update(strategy, **fields)

    def create_strategy_version(self, **fields: object) -> StrategyVersion:
        fields.pop("workspace_id", None)
        obj = StrategyVersion(workspace_id=self.workspace_id, **fields)
        self.session.add(obj)
        self.session.flush()
        self.session.refresh(obj)
        return obj

    def list_strategy_versions(self, strategy_id: UUID) -> list[StrategyVersion]:
        stmt = (
            select(StrategyVersion)
            .where(
                StrategyVersion.strategy_id == strategy_id,
                StrategyVersion.workspace_id == self.workspace_id,
            )
            .order_by(StrategyVersion.version_number.desc())
        )
        return list(self.session.execute(stmt).scalars().all())

    def get_strategy_version(self, version_id: UUID) -> StrategyVersion | None:
        stmt = (
            select(StrategyVersion)
            .where(
                StrategyVersion.id == version_id,
                StrategyVersion.workspace_id == self.workspace_id,
            )
        )
        return self.session.execute(stmt).scalar_one_or_none()
