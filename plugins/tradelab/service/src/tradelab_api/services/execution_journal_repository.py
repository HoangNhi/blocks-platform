from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from tradelab_api.db.models import BotRun, ManualTradeJournalEntry, ManualTradeJournalFill
from tradelab_api.services.run_repository import RunRepository


class ExecutionJournalRepository:
    def __init__(self, session: Session, workspace_id: UUID | None = None, owner_user_id: UUID | None = None) -> None:
        self.session = session
        self.workspace_id = workspace_id
        self.owner_user_id = owner_user_id
        if (workspace_id is None) != (owner_user_id is None):
            raise ValueError("Journal scope requires both workspace and owner.")

    def _base_select(self):
        statement = select(ManualTradeJournalEntry)
        if self.workspace_id is not None:
            statement = statement.join(BotRun, BotRun.id == ManualTradeJournalEntry.source_run_id).where(
                ManualTradeJournalEntry.source_run_id.in_(RunRepository(self.session, self.workspace_id, self.owner_user_id)._base_select().with_only_columns(BotRun.id)),
                ManualTradeJournalEntry.strategy_id == BotRun.strategy_id,
                ManualTradeJournalEntry.strategy_version_id == BotRun.strategy_version_id,
                BotRun.workspace_id == self.workspace_id,
                BotRun.created_by == str(self.owner_user_id),
                ManualTradeJournalEntry.workspace_id == self.workspace_id,
                ManualTradeJournalEntry.created_by == str(self.owner_user_id),
            )
            statement = statement.options(selectinload(ManualTradeJournalEntry.fills.and_(
                ManualTradeJournalFill.workspace_id == self.workspace_id,
            ))).execution_options(populate_existing=True)
        return statement

    def _validate_parent(self, source_run_id: UUID):
        from tradelab_api.services.run_repository import RunRepository

        run = RunRepository(self.session, self.workspace_id, self.owner_user_id).get_bot_run(source_run_id)
        if run is None:
            raise PermissionError("Journal source run must belong to the current owner.")
        return run

    def _validate_entry(self, entry: ManualTradeJournalEntry) -> None:
        if self.workspace_id is not None:
            self._validate_parent(entry.source_run_id)
            if entry.workspace_id != self.workspace_id or entry.created_by != str(self.owner_user_id):
                raise PermissionError("Journal entry must belong to the current owner.")

    def list_entries_for_run(self, run_id: UUID) -> list[ManualTradeJournalEntry]:
        return list(
            self.session.execute(
                self._base_select()
                .where(
                    ManualTradeJournalEntry.source_run_id == run_id,
                    ManualTradeJournalEntry.is_active.is_(True),
                    ManualTradeJournalEntry.is_deleted.is_(False),
                )
                .order_by(ManualTradeJournalEntry.created_at.desc())
            )
            .scalars()
            .all()
        )

    def get_entry(self, entry_id: UUID) -> ManualTradeJournalEntry | None:
        return (
            self.session.execute(
                self._base_select()
                .where(
                    ManualTradeJournalEntry.id == entry_id,
                    ManualTradeJournalEntry.is_active.is_(True),
                    ManualTradeJournalEntry.is_deleted.is_(False),
                )
            )
            .scalars()
            .one_or_none()
        )

    def create_entry(
        self,
        *,
        source_run_id: UUID,
        strategy_id: UUID | None,
        strategy_version_id: UUID | None,
        symbol: str,
        timeframe: str,
        side: str,
        planned_snapshot: dict[str, object],
        comparison_summary: dict[str, object],
        outcome_status: str,
        discipline_status: str,
        safety_status: str,
        notes: str | None,
        fills: list[dict[str, object]],
        created_by: str | None,
    ) -> ManualTradeJournalEntry:
        if self.workspace_id is not None:
            run = self._validate_parent(source_run_id)
            if strategy_id != run.strategy_id or strategy_version_id != run.strategy_version_id:
                raise PermissionError("Journal strategy references must match the source run.")
            created_by = str(self.owner_user_id)
        entry = ManualTradeJournalEntry(
            source_run_id=source_run_id,
            strategy_id=strategy_id,
            strategy_version_id=strategy_version_id,
            symbol=symbol,
            timeframe=timeframe,
            side=side,
            planned_snapshot=planned_snapshot,
            comparison_summary=comparison_summary,
            outcome_status=outcome_status,
            discipline_status=discipline_status,
            safety_status=safety_status,
            notes=notes,
            created_by=created_by,
            workspace_id=self.workspace_id,
        )
        entry.fills = [ManualTradeJournalFill(workspace_id=self.workspace_id, created_by=created_by, **fill) for fill in fills]
        self.session.add(entry)
        self.session.flush()
        return entry

    def replace_entry(
        self,
        entry: ManualTradeJournalEntry,
        *,
        side: str,
        planned_snapshot: dict[str, object],
        comparison_summary: dict[str, object],
        outcome_status: str,
        discipline_status: str,
        safety_status: str,
        notes: str | None,
        fills: list[dict[str, object]],
        updated_by: str | None,
    ) -> ManualTradeJournalEntry:
        self._validate_entry(entry)
        if self.workspace_id is not None:
            updated_by = str(self.owner_user_id)
        now = datetime.now(timezone.utc)
        entry.side = side
        entry.planned_snapshot = planned_snapshot
        entry.comparison_summary = comparison_summary
        entry.outcome_status = outcome_status
        entry.discipline_status = discipline_status
        entry.safety_status = safety_status
        entry.notes = notes
        entry.updated_at = now
        entry.updated_by = updated_by
        entry.fills = [ManualTradeJournalFill(workspace_id=self.workspace_id, created_by=updated_by, **fill) for fill in fills]
        self.session.flush()
        return entry

    def soft_delete_entry(self, entry: ManualTradeJournalEntry, *, updated_by: str | None) -> None:
        self._validate_entry(entry)
        if self.workspace_id is not None:
            updated_by = str(self.owner_user_id)
        now = datetime.now(timezone.utc)
        entry.is_active = False
        entry.is_deleted = True
        entry.updated_at = now
        entry.updated_by = updated_by
        for fill in entry.fills:
            fill.is_active = False
            fill.is_deleted = True
            fill.updated_at = now
            fill.updated_by = updated_by
        self.session.flush()

