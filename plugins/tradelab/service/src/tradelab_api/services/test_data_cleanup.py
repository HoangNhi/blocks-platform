from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.orm import Session

from tradelab_api.db.models import Bot, Strategy, StrategyGroup, StrategyVersion

CLEANUP_ACTOR = "tradelab-test-data-cleanup"
BASELINE_GROUP_SLUG = "tradelab-baseline"


class CleanupGuardError(RuntimeError):
    """Raised when cleanup targets data that must be preserved."""


@dataclass(frozen=True)
class CleanupGroup:
    id: UUID
    slug: str
    name: str
    visibility: str | None
    purpose: str | None
    reason: str

    def as_dict(self) -> dict[str, object | None]:
        return {
            "id": str(self.id),
            "slug": self.slug,
            "name": self.name,
            "visibility": self.visibility,
            "purpose": self.purpose,
            "reason": self.reason,
        }


@dataclass(frozen=True)
class TestDataCleanupSummary:
    mode: str
    groups: list[CleanupGroup] = field(default_factory=list)
    strategy_ids: list[UUID] = field(default_factory=list)
    version_ids: list[UUID] = field(default_factory=list)
    bot_ids: list[UUID] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def group_ids(self) -> list[UUID]:
        return [group.id for group in self.groups]

    @property
    def group_count(self) -> int:
        return len(self.groups)

    @property
    def strategy_count(self) -> int:
        return len(self.strategy_ids)

    @property
    def version_count(self) -> int:
        return len(self.version_ids)

    @property
    def bot_count(self) -> int:
        return len(self.bot_ids)

    def as_dict(self) -> dict[str, object]:
        return {
            "mode": self.mode,
            "groupCount": self.group_count,
            "strategyCount": self.strategy_count,
            "versionCount": self.version_count,
            "botCount": self.bot_count,
            "groups": [group.as_dict() for group in self.groups],
            "strategyIds": [str(item) for item in self.strategy_ids],
            "versionIds": [str(item) for item in self.version_ids],
            "botIds": [str(item) for item in self.bot_ids],
            "warnings": self.warnings,
        }


def build_test_data_cleanup_plan(session: Session, *, mode: str = "preview") -> TestDataCleanupSummary:
    active_groups = _active_groups(session)
    groups = [_cleanup_group(group, reason) for group, reason in _target_groups(active_groups)]
    _guard_targets(active_groups=active_groups, groups=groups)
    group_ids = [group.id for group in groups]
    strategy_ids = _strategy_ids_for_groups(session, group_ids)
    version_ids = _version_ids_for_strategies(session, strategy_ids)
    bot_ids = _bot_ids_for_strategies(session, strategy_ids)
    return TestDataCleanupSummary(
        mode=mode,
        groups=groups,
        strategy_ids=strategy_ids,
        version_ids=version_ids,
        bot_ids=bot_ids,
    )


def apply_test_data_cleanup(
    session: Session,
    *,
    updated_by: str = CLEANUP_ACTOR,
) -> TestDataCleanupSummary:
    summary = build_test_data_cleanup_plan(session, mode="apply")
    if summary.group_count == 0:
        return summary

    now = datetime.now(timezone.utc)
    _soft_delete_many(
        session.query(Bot).filter(Bot.id.in_(summary.bot_ids)).all(),
        updated_by=updated_by,
        updated_at=now,
    )
    _soft_delete_many(
        session.query(StrategyVersion).filter(StrategyVersion.id.in_(summary.version_ids)).all(),
        updated_by=updated_by,
        updated_at=now,
    )
    _soft_delete_many(
        session.query(Strategy).filter(Strategy.id.in_(summary.strategy_ids)).all(),
        updated_by=updated_by,
        updated_at=now,
    )
    _soft_delete_many(
        session.query(StrategyGroup).filter(StrategyGroup.id.in_(summary.group_ids)).all(),
        updated_by=updated_by,
        updated_at=now,
    )
    session.flush()
    return summary


def _active_groups(session: Session) -> list[StrategyGroup]:
    return list(
        session.query(StrategyGroup)
        .filter(StrategyGroup.is_active.is_(True), StrategyGroup.is_deleted.is_(False))
        .order_by(StrategyGroup.created_at.asc(), StrategyGroup.id.asc())
        .all()
    )


def _target_groups(groups: list[StrategyGroup]) -> list[tuple[StrategyGroup, str]]:
    targets: list[tuple[StrategyGroup, str]] = []
    for group in groups:
        metadata = dict(group.metadata_ or {})
        visibility = metadata.get("visibility")
        purpose = metadata.get("purpose")
        if visibility == "test":
            targets.append((group, "metadata.visibility=test"))
            continue
        if purpose == "automated_test_fixture":
            targets.append((group, "metadata.purpose=automated_test_fixture"))
            continue
        if group.slug.startswith("test-group-"):
            targets.append((group, "slug=test-group-*"))
            continue
        if group.description == "Integration test group":
            targets.append((group, "description=Integration test group"))
    return targets


def _cleanup_group(group: StrategyGroup, reason: str) -> CleanupGroup:
    metadata = dict(group.metadata_ or {})
    visibility = metadata.get("visibility")
    purpose = metadata.get("purpose")
    return CleanupGroup(
        id=group.id,
        slug=group.slug,
        name=group.name,
        visibility=visibility if isinstance(visibility, str) else None,
        purpose=purpose if isinstance(purpose, str) else None,
        reason=reason,
    )


def _guard_targets(*, active_groups: list[StrategyGroup], groups: list[CleanupGroup]) -> None:
    if not groups:
        return
    active_by_id = {group.id: group for group in active_groups}
    failures: list[str] = []
    for target in groups:
        group = active_by_id[target.id]
        metadata = dict(group.metadata_ or {})
        if group.slug == BASELINE_GROUP_SLUG:
            failures.append(f"{group.id} {group.slug}: baseline slug")
        if metadata.get("isBaseline") is True:
            failures.append(f"{group.id} {group.slug}: baseline metadata")
        if metadata.get("visibility") == "workbench":
            failures.append(f"{group.id} {group.slug}: workbench visibility")
    if len(groups) >= len(active_groups):
        failures.append("target selection includes all active strategy groups")
    if failures:
        raise CleanupGuardError("; ".join(failures))


def _strategy_ids_for_groups(session: Session, group_ids: list[UUID]) -> list[UUID]:
    if not group_ids:
        return []
    return [
        item.id
        for item in session.query(Strategy)
        .filter(
            Strategy.strategy_group_id.in_(group_ids),
            Strategy.is_active.is_(True),
            Strategy.is_deleted.is_(False),
        )
        .order_by(Strategy.created_at.asc(), Strategy.id.asc())
        .all()
    ]


def _version_ids_for_strategies(session: Session, strategy_ids: list[UUID]) -> list[UUID]:
    if not strategy_ids:
        return []
    return [
        item.id
        for item in session.query(StrategyVersion)
        .filter(
            StrategyVersion.strategy_id.in_(strategy_ids),
            StrategyVersion.is_active.is_(True),
            StrategyVersion.is_deleted.is_(False),
        )
        .order_by(StrategyVersion.created_at.asc(), StrategyVersion.id.asc())
        .all()
    ]


def _bot_ids_for_strategies(session: Session, strategy_ids: list[UUID]) -> list[UUID]:
    if not strategy_ids:
        return []
    return [
        item.id
        for item in session.query(Bot)
        .filter(
            Bot.strategy_id.in_(strategy_ids),
            Bot.is_active.is_(True),
            Bot.is_deleted.is_(False),
        )
        .order_by(Bot.created_at.asc(), Bot.id.asc())
        .all()
    ]


def _soft_delete_many(items: list[object], *, updated_by: str, updated_at: datetime) -> None:
    for item in items:
        if hasattr(item, "is_active"):
            setattr(item, "is_active", False)
        if hasattr(item, "is_deleted"):
            setattr(item, "is_deleted", True)
        if hasattr(item, "updated_by"):
            setattr(item, "updated_by", updated_by)
        if hasattr(item, "updated_at"):
            setattr(item, "updated_at", updated_at)
