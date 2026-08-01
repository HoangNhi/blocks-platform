from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from tradelab_api.db.models import ManualTradeJournalEntry, ManualTradeJournalFill


class ExecutionJournalRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list_entries_for_run(self, run_id: UUID) -> list[ManualTradeJournalEntry]:
        return list(
            self.session.execute(
                select(ManualTradeJournalEntry)
                .options(selectinload(ManualTradeJournalEntry.fills))
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
                select(ManualTradeJournalEntry)
                .options(selectinload(ManualTradeJournalEntry.fills))
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
        )
        entry.fills = [ManualTradeJournalFill(created_by=created_by, **fill) for fill in fills]
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
        entry.fills = [ManualTradeJournalFill(created_by=updated_by, **fill) for fill in fills]
        self.session.flush()
        return entry

    def soft_delete_entry(self, entry: ManualTradeJournalEntry, *, updated_by: str | None) -> None:
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

