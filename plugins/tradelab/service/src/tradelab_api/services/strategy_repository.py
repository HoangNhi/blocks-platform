from __future__ import annotations

from uuid import UUID

from tradelab_api.db.models import Strategy, StrategyGroup, StrategyVersion

from .repository_base import CRUDRepository


class StrategyRepository(CRUDRepository[Strategy]):
    model = Strategy

    def create_strategy_group(self, **fields: object) -> StrategyGroup:
        obj = StrategyGroup(**fields)
        self.session.add(obj)
        self.session.flush()
        self.session.refresh(obj)
        return obj

    def list_strategy_groups(self) -> list[StrategyGroup]:
        return list(
            self.session.query(StrategyGroup)
            .filter(StrategyGroup.is_deleted.is_(False), StrategyGroup.is_active.is_(True))
            .all()
        )

    def get_strategy_group(self, group_id: UUID) -> StrategyGroup | None:
        return (
            self.session.query(StrategyGroup)
            .filter(
                StrategyGroup.id == group_id,
                StrategyGroup.is_deleted.is_(False),
                StrategyGroup.is_active.is_(True),
            )
            .one_or_none()
        )

    def get_strategy_group_by_slug(self, slug: str) -> StrategyGroup | None:
        return (
            self.session.query(StrategyGroup)
            .filter(
                StrategyGroup.slug == slug,
                StrategyGroup.is_deleted.is_(False),
                StrategyGroup.is_active.is_(True),
            )
            .one_or_none()
        )

    def get_any_strategy_group_by_slug(self, slug: str) -> StrategyGroup | None:
        return self.session.query(StrategyGroup).filter(StrategyGroup.slug == slug).one_or_none()

    def update_strategy_group(self, group: StrategyGroup, **fields: object) -> StrategyGroup:
        for field, value in fields.items():
            setattr(group, field, value)
        self.session.flush()
        self.session.refresh(group)
        return group

    def create_strategy(self, **fields: object) -> Strategy:
        return self.create(Strategy(**fields))

    def list_strategies(self, *, strategy_group_id: UUID | None = None) -> list[Strategy]:
        query = self.session.query(Strategy).filter(
            Strategy.is_deleted.is_(False), Strategy.is_active.is_(True)
        )
        if strategy_group_id is not None:
            query = query.filter(Strategy.strategy_group_id == strategy_group_id)
        return list(query.all())

    def get_strategy(self, strategy_id: UUID) -> Strategy | None:
        return self.get_by_id(strategy_id)

    def get_strategy_by_slug(self, slug: str) -> Strategy | None:
        return (
            self.session.query(Strategy)
            .filter(
                Strategy.slug == slug,
                Strategy.is_deleted.is_(False),
                Strategy.is_active.is_(True),
            )
            .one_or_none()
        )

    def get_any_strategy_by_slug(self, slug: str) -> Strategy | None:
        return self.session.query(Strategy).filter(Strategy.slug == slug).one_or_none()

    def update_strategy(self, strategy: Strategy, **fields: object) -> Strategy:
        return self.update(strategy, **fields)

    def create_strategy_version(self, **fields: object) -> StrategyVersion:
        obj = StrategyVersion(**fields)
        self.session.add(obj)
        self.session.flush()
        self.session.refresh(obj)
        return obj

    def list_strategy_versions(self, strategy_id: UUID) -> list[StrategyVersion]:
        return list(
            self.session.query(StrategyVersion)
            .filter(StrategyVersion.strategy_id == strategy_id)
            .order_by(StrategyVersion.version_number.desc())
            .all()
        )

    def get_strategy_version(self, version_id: UUID) -> StrategyVersion | None:
        return self.session.get(StrategyVersion, version_id)
