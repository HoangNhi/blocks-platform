from __future__ import annotations

from uuid import UUID

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from tradelab_api.db.models import Strategy, StrategyGroup, StrategyVersion
from tradelab_api.services.scoped_repository import PrivateOwnerRepository


class StrategyRepository(PrivateOwnerRepository[Strategy]):
    model = Strategy

    def __init__(self, session: Session, workspace_id: UUID, owner_user_id: UUID) -> None:
        super().__init__(session, workspace_id, owner_user_id)

    def _base_select(self):
        return (
            super()._base_select()
            .outerjoin(StrategyGroup, StrategyGroup.id == Strategy.strategy_group_id)
            .where(or_(Strategy.strategy_group_id.is_(None), and_(
                StrategyGroup.workspace_id == self.workspace_id,
                StrategyGroup.created_by == str(self.owner_user_id),
            )))
        )

    def create_strategy_group(self, **fields: object) -> StrategyGroup:
        fields.pop("workspace_id", None)
        fields.pop("created_by", None)
        fields["created_by"] = str(self.owner_user_id)
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
                StrategyGroup.created_by == str(self.owner_user_id),
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
                StrategyGroup.created_by == str(self.owner_user_id),
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
                StrategyGroup.created_by == str(self.owner_user_id),
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
                StrategyGroup.created_by == str(self.owner_user_id),
            )
        )
        return self.session.execute(stmt).scalar_one_or_none()

    def update_strategy_group(self, group: StrategyGroup, **fields: object) -> StrategyGroup:
        current_ws = getattr(group, "workspace_id", None)
        if current_ws != self.workspace_id or group.created_by != str(self.owner_user_id):
            raise PermissionError("Cannot update private strategy group belonging to another owner.")
        fields.pop("workspace_id", None)
        fields.pop("created_by", None)
        for field, value in fields.items():
            setattr(group, field, value)
        self.session.flush()
        self.session.refresh(group)
        return group

    def create_strategy(self, **fields: object) -> Strategy:
        fields.pop("workspace_id", None)
        group_id = fields.get("strategy_group_id")
        if group_id is not None:
            group = self.get_strategy_group(group_id) if isinstance(group_id, UUID) else None
            if group is None:
                raise PermissionError("Strategy group must belong to the current owner and workspace.")
        return self.create(Strategy(**fields))

    def list_strategies(self, *, strategy_group_id: UUID | None = None) -> list[Strategy]:
        stmt = (
            self._base_select()
            .where(
                Strategy.workspace_id == self.workspace_id,
                Strategy.created_by == str(self.owner_user_id),
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
            self._base_select()
            .where(
                Strategy.slug == slug,
                Strategy.workspace_id == self.workspace_id,
                Strategy.created_by == str(self.owner_user_id),
                Strategy.is_deleted.is_(False),
                Strategy.is_active.is_(True),
            )
        )
        return self.session.execute(stmt).scalar_one_or_none()

    def get_any_strategy_by_slug(self, slug: str) -> Strategy | None:
        stmt = (
            self._base_select()
            .where(
                Strategy.slug == slug,
                Strategy.workspace_id == self.workspace_id,
                Strategy.created_by == str(self.owner_user_id),
            )
        )
        return self.session.execute(stmt).scalar_one_or_none()

    def update_strategy(self, strategy: Strategy, **fields: object) -> Strategy:
        group_id = fields.get("strategy_group_id", strategy.strategy_group_id)
        if group_id is not None:
            group = self.get_strategy_group(group_id) if isinstance(group_id, UUID) else None
            if group is None:
                raise PermissionError("Strategy group must belong to the current owner and workspace.")

        version_id = fields.get("current_version_id", strategy.current_version_id)
        if version_id is not None:
            version = self.get_strategy_version(version_id) if isinstance(version_id, UUID) else None
            if version is None or version.strategy_id != strategy.id:
                raise PermissionError("Strategy version must belong to the current strategy and owner.")
        return self.update(strategy, **fields)

    def create_strategy_version(self, **fields: object) -> StrategyVersion:
        fields.pop("workspace_id", None)
        strategy_id = fields.get("strategy_id")
        if not isinstance(strategy_id, UUID) or self.get_strategy(strategy_id) is None:
            raise PermissionError("Strategy version parent must belong to the current owner and workspace.")
        fields["created_by"] = str(self.owner_user_id)
        obj = StrategyVersion(workspace_id=self.workspace_id, **fields)
        self.session.add(obj)
        self.session.flush()
        self.session.refresh(obj)
        return obj

    def list_strategy_versions(self, strategy_id: UUID) -> list[StrategyVersion]:
        stmt = (
            select(StrategyVersion)
            .join(Strategy, Strategy.id == StrategyVersion.strategy_id)
            .where(
                StrategyVersion.strategy_id == strategy_id,
                StrategyVersion.strategy_id.in_(self._base_select().with_only_columns(Strategy.id)),
                StrategyVersion.workspace_id == self.workspace_id,
                StrategyVersion.created_by == str(self.owner_user_id),
                StrategyVersion.is_deleted.is_(False),
                StrategyVersion.is_active.is_(True),
                Strategy.workspace_id == self.workspace_id,
                Strategy.created_by == str(self.owner_user_id),
            )
            .order_by(StrategyVersion.version_number.desc())
        )
        return list(self.session.execute(stmt).scalars().all())

    def get_strategy_version(self, version_id: UUID) -> StrategyVersion | None:
        stmt = (
            select(StrategyVersion)
            .join(Strategy, Strategy.id == StrategyVersion.strategy_id)
            .where(
                StrategyVersion.id == version_id,
                StrategyVersion.strategy_id.in_(self._base_select().with_only_columns(Strategy.id)),
                StrategyVersion.workspace_id == self.workspace_id,
                StrategyVersion.created_by == str(self.owner_user_id),
                StrategyVersion.is_deleted.is_(False),
                StrategyVersion.is_active.is_(True),
                Strategy.workspace_id == self.workspace_id,
                Strategy.created_by == str(self.owner_user_id),
            )
        )
        return self.session.execute(stmt).scalar_one_or_none()
