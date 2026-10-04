from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import Text, and_, cast, func, or_, select
from sqlalchemy.orm import Session, aliased

from tradelab_api.db.models import (
    Bot,
    ExchangeConnection,
    MarketCandle,
    PaperAuditEvent,
    PaperFill,
    PaperOrder,
    PaperPortfolioSnapshot,
    PaperPosition,
    PaperResumeCheckpoint,
    PaperSession,
    Strategy,
    StrategyGroup,
    StrategyVersion,
)


class PaperSessionRepository:
    def __init__(
        self,
        session: Session,
        workspace_id: UUID | None = None,
        owner_user_id: UUID | None = None,
    ) -> None:
        self.session = session
        self.workspace_id = workspace_id
        self.owner_user_id = owner_user_id
        if (workspace_id is None) != (owner_user_id is None):
            raise ValueError("Paper scope requires both workspace and owner.")

    def _base_select(self):
        bot_version = aliased(StrategyVersion)
        statement = (
            select(PaperSession)
            .join(Strategy, Strategy.id == PaperSession.strategy_id)
            .outerjoin(StrategyGroup, StrategyGroup.id == Strategy.strategy_group_id)
            .join(StrategyVersion, StrategyVersion.id == PaperSession.strategy_version_id)
            .join(Bot, Bot.id == PaperSession.bot_id)
            .outerjoin(bot_version, bot_version.id == Bot.strategy_version_id)
            .outerjoin(ExchangeConnection, ExchangeConnection.id == Bot.exchange_connection_id)
            .where(
                PaperSession.mode == "paper",
                Strategy.workspace_id == PaperSession.workspace_id,
                Strategy.created_by == PaperSession.created_by,
                or_(Strategy.strategy_group_id.is_(None), and_(
                    StrategyGroup.workspace_id == PaperSession.workspace_id,
                    StrategyGroup.created_by == PaperSession.created_by,
                )),
                StrategyVersion.strategy_id == PaperSession.strategy_id,
                StrategyVersion.workspace_id == PaperSession.workspace_id,
                StrategyVersion.created_by == PaperSession.created_by,
                Bot.workspace_id == PaperSession.workspace_id,
                Bot.created_by == PaperSession.created_by,
                or_(Bot.exchange_connection_id.is_(None), and_(
                    ExchangeConnection.workspace_id == PaperSession.workspace_id,
                    cast(ExchangeConnection.owner_user_id, Text) == PaperSession.created_by,
                )),
                Bot.strategy_id == PaperSession.strategy_id,
                or_(Bot.strategy_version_id.is_(None), and_(
                    bot_version.strategy_id == Bot.strategy_id,
                    bot_version.workspace_id == PaperSession.workspace_id,
                    bot_version.created_by == PaperSession.created_by,
                )),
            )
        )
        if self.workspace_id is not None:
            statement = statement.where(
                PaperSession.workspace_id == self.workspace_id,
                PaperSession.created_by == str(self.owner_user_id),
            )
        return statement

    def _session_ids(self, session_id: UUID, artifact_workspace_id):
        return self._base_select().with_only_columns(PaperSession.id).where(
            PaperSession.id == session_id, PaperSession.workspace_id == artifact_workspace_id,
        )

    def find_queued_session_by_idempotency_key(self, idempotency_key: str) -> PaperSession | None:
        sessions = self.session.scalars(
            self._base_select()
            .where(PaperSession.status == "queued")
            .order_by(PaperSession.created_at.desc())
        ).all()
        for session in sessions:
            gate_context = dict(session.gate_context or {})
            if gate_context.get("idempotencyKey") == idempotency_key:
                return session
        return None

    def find_retry_session_by_source_and_idempotency_key(
        self,
        source_session_id: UUID,
        idempotency_key: str,
    ) -> PaperSession | None:
        sessions = self.session.scalars(
            self._base_select()
            .where(PaperSession.status == "queued")
            .order_by(PaperSession.created_at.desc())
        ).all()
        for session in sessions:
            gate_context = dict(session.gate_context or {})
            retry_context = dict(gate_context.get("retry") or {})
            if (
                retry_context.get("sourceSessionId") == str(source_session_id)
                and gate_context.get("idempotencyKey") == idempotency_key
            ):
                return session
        return None

    def find_resumed_session_by_source_and_idempotency_key(
        self,
        source_session_id: UUID,
        idempotency_key: str,
    ) -> PaperSession | None:
        sessions = self.session.scalars(
            self._base_select()
            .where(PaperSession.id == source_session_id, PaperSession.status == "queued")
            .order_by(PaperSession.updated_at.desc())
        ).all()
        for session in sessions:
            gate_context = dict(session.gate_context or {})
            resume_context = dict(gate_context.get("resume") or {})
            if (
                resume_context.get("sourceSessionId") == str(source_session_id)
                and resume_context.get("idempotencyKey") == idempotency_key
            ):
                return session
        return None

    def get_paper_session(self, session_id: UUID) -> PaperSession | None:
        return self.session.scalar(self._base_select().where(PaperSession.id == session_id))

    def get_paper_session_for_update(self, session_id: UUID) -> PaperSession | None:
        statement = self._base_select().where(PaperSession.id == session_id)
        return self.session.scalar(statement.with_for_update(of=PaperSession).limit(1))

    def list_paper_sessions(
        self,
        *,
        strategy_id: UUID | None,
        strategy_version_id: UUID | None,
        dataset_key: str | None,
        status: str | None,
        limit: int,
    ) -> list[PaperSession]:
        statement = self._base_select()
        if strategy_id is not None:
            statement = statement.where(PaperSession.strategy_id == strategy_id)
        if strategy_version_id is not None:
            statement = statement.where(PaperSession.strategy_version_id == strategy_version_id)
        if dataset_key is not None:
            statement = statement.where(PaperSession.dataset_key == dataset_key)
        if status is not None:
            statement = statement.where(PaperSession.status == status)
        return list(
            self.session.scalars(
                statement.order_by(PaperSession.created_at.desc()).limit(limit)
            ).all()
        )

    def count_orders_for_session(self, session_id: UUID) -> int:
        return self._count_for_session(PaperOrder, session_id)

    def count_fills_for_session(self, session_id: UUID) -> int:
        return self._count_for_session(PaperFill, session_id)

    def count_positions_for_session(self, session_id: UUID) -> int:
        return self._count_for_session(PaperPosition, session_id)

    def count_portfolio_snapshots_for_session(self, session_id: UUID) -> int:
        return self._count_for_session(PaperPortfolioSnapshot, session_id)

    def count_audit_events_for_session(self, session_id: UUID) -> int:
        return self._count_for_session(PaperAuditEvent, session_id)

    def get_latest_audit_event_for_session(self, session_id: UUID) -> PaperAuditEvent | None:
        return self.session.scalars(
            select(PaperAuditEvent)
            .where(PaperAuditEvent.paper_session_id.in_(self._session_ids(session_id, PaperAuditEvent.workspace_id)))
            .order_by(PaperAuditEvent.event_at.desc())
            .limit(1)
        ).first()

    def _count_for_session(self, model: Any, session_id: UUID) -> int:
        statement = select(func.count()).select_from(model).where(
            model.paper_session_id.in_(self._session_ids(session_id, model.workspace_id)),
        )
        if model is PaperFill:
            statement = statement.join(PaperOrder, and_(
                PaperOrder.id == PaperFill.paper_order_id,
                PaperOrder.paper_session_id == PaperFill.paper_session_id,
                PaperOrder.workspace_id == PaperFill.workspace_id,
            ))
        return int(self.session.scalar(statement) or 0)

    def list_audit_events_for_session(self, session_id: UUID, *, limit: int) -> list[PaperAuditEvent]:
        return list(
            self.session.scalars(
                select(PaperAuditEvent)
                .where(PaperAuditEvent.paper_session_id.in_(self._session_ids(session_id, PaperAuditEvent.workspace_id)))
                .order_by(PaperAuditEvent.event_at.asc())
                .limit(limit)
            ).all()
        )

    def list_orders_for_session(self, session_id: UUID, *, limit: int) -> list[PaperOrder]:
        return list(
            self.session.scalars(
                select(PaperOrder)
                .where(PaperOrder.paper_session_id.in_(self._session_ids(session_id, PaperOrder.workspace_id)))
                .order_by(PaperOrder.created_at.asc())
                .limit(limit)
            ).all()
        )

    def list_fills_for_session(self, session_id: UUID, *, limit: int) -> list[PaperFill]:
        return list(
            self.session.scalars(
                select(PaperFill)
                .join(PaperOrder, and_(
                    PaperOrder.id == PaperFill.paper_order_id,
                    PaperOrder.paper_session_id == PaperFill.paper_session_id,
                    PaperOrder.workspace_id == PaperFill.workspace_id,
                ))
                .where(PaperFill.paper_session_id.in_(self._session_ids(session_id, PaperFill.workspace_id)))
                .order_by(PaperFill.fill_time.asc())
                .limit(limit)
            ).all()
        )

    def list_positions_for_session(self, session_id: UUID, *, limit: int) -> list[PaperPosition]:
        return list(
            self.session.scalars(
                select(PaperPosition)
                .where(PaperPosition.paper_session_id.in_(self._session_ids(session_id, PaperPosition.workspace_id)))
                .order_by(PaperPosition.symbol.asc())
                .limit(limit)
            ).all()
        )

    def list_portfolio_snapshots_for_session(
        self,
        session_id: UUID,
        *,
        limit: int,
    ) -> list[PaperPortfolioSnapshot]:
        return list(
            self.session.scalars(
                select(PaperPortfolioSnapshot)
                .where(PaperPortfolioSnapshot.paper_session_id.in_(self._session_ids(session_id, PaperPortfolioSnapshot.workspace_id)))
                .order_by(PaperPortfolioSnapshot.snapshot_at.asc())
                .limit(limit)
            ).all()
        )

    def get_latest_portfolio_snapshot_for_session(self, session_id: UUID) -> PaperPortfolioSnapshot | None:
        return self.session.scalars(
            select(PaperPortfolioSnapshot)
            .where(PaperPortfolioSnapshot.paper_session_id.in_(self._session_ids(session_id, PaperPortfolioSnapshot.workspace_id)))
            .order_by(PaperPortfolioSnapshot.snapshot_at.desc(), PaperPortfolioSnapshot.created_at.desc())
            .limit(1)
        ).first()

    def get_latest_resume_checkpoint_for_session(self, session_id: UUID) -> PaperResumeCheckpoint | None:
        return self.session.scalars(
            select(PaperResumeCheckpoint)
            .where(
                PaperResumeCheckpoint.paper_session_id.in_(self._session_ids(session_id, PaperResumeCheckpoint.workspace_id)),
                PaperResumeCheckpoint.is_active.is_(True),
                PaperResumeCheckpoint.is_deleted.is_(False),
            )
            .order_by(PaperResumeCheckpoint.attempt_no.desc(), PaperResumeCheckpoint.updated_at.desc())
            .limit(1)
        ).first()

    def get_artifact_identity_status_for_session(self, session_id: UUID) -> str:
        artifact_models = (PaperOrder, PaperFill, PaperPortfolioSnapshot, PaperAuditEvent)
        for model in artifact_models:
            total = self.session.scalar(
                select(func.count()).select_from(model).where(model.paper_session_id.in_(self._session_ids(session_id, model.workspace_id)))
            ) or 0
            if total == 0:
                continue
            missing = self.session.scalar(
                select(func.count())
                .select_from(model)
                .where(
                    model.paper_session_id.in_(self._session_ids(session_id, model.workspace_id)),
                    (model.artifact_key.is_(None)) | (model.artifact_key == ""),
                )
            ) or 0
            if missing:
                return "missing"
            duplicate_count = self.session.scalar(
                select(func.count())
                .select_from(
                    select(model.artifact_key)
                    .where(model.paper_session_id.in_(self._session_ids(session_id, model.workspace_id)), model.artifact_key.is_not(None))
                    .group_by(model.artifact_key)
                    .having(func.count() > 1)
                    .subquery()
                )
            ) or 0
            if duplicate_count:
                return "ambiguous"
        return "ready"

    def list_open_positions_for_session(self, session_id: UUID) -> list[PaperPosition]:
        return list(
            self.session.scalars(
                select(PaperPosition)
                .where(
                    PaperPosition.paper_session_id.in_(self._session_ids(session_id, PaperPosition.workspace_id)),
                    PaperPosition.status == "open",
                )
                .order_by(PaperPosition.symbol.asc())
            ).all()
        )

    def list_pending_orders_for_session(self, session_id: UUID) -> list[PaperOrder]:
        return list(
            self.session.scalars(
                select(PaperOrder)
                .where(
                    PaperOrder.paper_session_id.in_(self._session_ids(session_id, PaperOrder.workspace_id)),
                    PaperOrder.status.notin_(("rejected", "filled", "cancelled")),
                )
                .order_by(PaperOrder.created_at.asc())
            ).all()
        )

    def get_next_market_candle_after(
        self,
        *,
        exchange: str,
        symbol: str,
        timeframe: str,
        after_open_time,
        end_at,
    ) -> MarketCandle | None:
        return self.session.scalars(
            select(MarketCandle)
            .where(
                MarketCandle.exchange == exchange,
                MarketCandle.symbol == symbol,
                MarketCandle.timeframe == timeframe,
                MarketCandle.open_time > after_open_time,
                MarketCandle.open_time <= end_at,
            )
            .order_by(MarketCandle.open_time.asc())
            .limit(1)
        ).first()

    def get_next_market_candle_after_snapshot(self, paper_session: PaperSession, after_open_time) -> MarketCandle | None:
        return self.get_next_market_candle_after(
            exchange=paper_session.exchange,
            symbol=paper_session.symbol,
            timeframe=paper_session.timeframe,
            after_open_time=after_open_time,
            end_at=paper_session.end_at,
        )

    def create_paper_session(self, **fields: Any) -> PaperSession:
        if self.workspace_id is not None:
            from tradelab_api.services.run_repository import RunRepository

            RunRepository(self.session, self.workspace_id, self.owner_user_id)._validate_relationships(fields)
            fields["workspace_id"] = self.workspace_id
            fields["created_by"] = str(self.owner_user_id)
        session = PaperSession(**fields)
        self.session.add(session)
        self.session.flush()
        return session

    def create_audit_event(self, **fields: Any) -> PaperAuditEvent:
        if self.workspace_id is not None:
            parent = self.get_paper_session(fields["paper_session_id"])
            if parent is None:
                raise PermissionError("Paper audit parent must belong to the current owner.")
            fields["workspace_id"] = self.workspace_id
            fields["created_by"] = str(self.owner_user_id)
            fields["actor"] = str(self.owner_user_id)
        event = PaperAuditEvent(**fields)
        self.session.add(event)
        self.session.flush()
        return event
