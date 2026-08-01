from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from tradelab_api.db.models import MarketCandle, PaperAuditEvent, PaperResumeCheckpoint, PaperSession
from tradelab_api.services.paper_engine import PaperEngineCandle, PaperEngineInitialPortfolioState, PaperEngineSession

class SqlAlchemyPaperEngineSessionSource:
    def __init__(self, session: Session, *, worker_id: str) -> None:
        self.session = session
        self.worker_id = worker_id

    def has_running_session(self) -> bool:
        return (
            self.session.scalar(
                select(PaperSession.id)
                .where(PaperSession.mode == "paper", PaperSession.status == "running")
                .limit(1)
            )
            is not None
        )

    def get_paper_session_status(self, session_id: UUID) -> str | None:
        return self.session.scalar(
            select(PaperSession.status)
            .where(PaperSession.id == session_id, PaperSession.mode == "paper")
            .limit(1)
        )

    def claim_next_queued_session(self, max_candles_per_tick: int = 10000) -> PaperEngineSession | None:
        row = self.session.scalar(
            select(PaperSession)
            .where(PaperSession.mode == "paper", PaperSession.status == "queued")
            .order_by(PaperSession.created_at.asc())
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        return self._claim_queued_row(row, max_candles_per_tick=max_candles_per_tick)

    def claim_queued_session_by_id(
        self,
        session_id: UUID,
        max_candles_per_tick: int = 10000,
    ) -> PaperEngineSession | None:
        row = self.session.scalar(
            select(PaperSession)
            .where(
                PaperSession.id == session_id,
                PaperSession.mode == "paper",
                PaperSession.status == "queued",
            )
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        return self._claim_queued_row(row, max_candles_per_tick=max_candles_per_tick)

    def _claim_queued_row(
        self,
        row: PaperSession | None,
        *,
        max_candles_per_tick: int,
    ) -> PaperEngineSession | None:
        if row is None:
            return None

        now = _utcnow()
        row.status = "running"
        row.reason_code = "paper_engine_running"
        if row.started_at is None:
            row.started_at = now
        row.updated_at = now
        row.updated_by = self.worker_id
        self.session.add(
            PaperAuditEvent(
                paper_session_id=row.id,
                event_at=now,
                actor=self.worker_id,
                action="paper_session_running",
                target_type="paper_session",
                target_id=row.id,
                old_state="queued",
                new_state="running",
                reason_code="paper_engine_running",
                correlation_id=None,
                request_id=None,
                metadata_={"workerId": self.worker_id, "safetyStatus": "local_dev_paper_engine_tick"},
                created_by=self.worker_id,
            )
        )
        resume_context = self._resume_context(row)
        checkpoint = self._latest_resume_checkpoint(row) if resume_context else None
        candles = self._load_candles(row, max_candles_per_tick=max_candles_per_tick)
        self.session.flush()
        self.session.refresh(row)
        return _to_engine_session(row, candles, self.worker_id, resume_context=resume_context, checkpoint=checkpoint)

    def _resume_context(self, row: PaperSession) -> dict[str, Any]:
        gate_context = dict(row.gate_context or {})
        resume = gate_context.get("resume")
        return dict(resume) if isinstance(resume, dict) else {}

    def _latest_resume_checkpoint(self, row: PaperSession) -> PaperResumeCheckpoint | None:
        return self.session.scalars(
            select(PaperResumeCheckpoint)
            .where(
                PaperResumeCheckpoint.paper_session_id == row.id,
                PaperResumeCheckpoint.is_active.is_(True),
                PaperResumeCheckpoint.is_deleted.is_(False),
            )
            .order_by(PaperResumeCheckpoint.attempt_no.desc(), PaperResumeCheckpoint.updated_at.desc())
            .limit(1)
        ).first()

    def mark_terminal(
        self,
        session_id: str,
        status: str,
        reason_code: str,
        error_message: str | None = None,
    ) -> None:
        row = self.session.get(PaperSession, UUID(session_id))
        if row is None:
            return
        now = _utcnow()
        row.status = status
        row.reason_code = reason_code
        row.error_message = error_message
        row.updated_at = now
        row.updated_by = self.worker_id
        if status in {"completed", "failed", "cancelled"} and row.finished_at is None:
            row.finished_at = now
        self.session.flush()

    def _load_candles(self, row: PaperSession, *, max_candles_per_tick: int) -> list[PaperEngineCandle]:
        market_rows = list(
            self.session.scalars(
                select(MarketCandle)
                .where(
                    MarketCandle.exchange == row.exchange,
                    MarketCandle.symbol == row.symbol,
                    MarketCandle.timeframe == row.timeframe,
                    MarketCandle.open_time >= row.start_at,
                    MarketCandle.open_time <= row.end_at,
                )
                .order_by(MarketCandle.open_time.asc())
                .limit(max_candles_per_tick + 1)
            ).all()
        )
        return [
            PaperEngineCandle(
                candle_id=str(candle.id),
                open_time=candle.open_time,
                close_time=candle.close_time,
                open=candle.open,
                high=candle.high,
                low=candle.low,
                close=candle.close,
                volume=candle.volume,
            )
            for candle in market_rows
        ]

def _to_engine_session(
    row: PaperSession,
    candles: list[PaperEngineCandle],
    worker_id: str,
    *,
    resume_context: dict[str, Any] | None = None,
    checkpoint: PaperResumeCheckpoint | None = None,
) -> PaperEngineSession:
    runtime_config = dict(row.runtime_config or {})
    resume = resume_context or {}
    attempt_no = int(resume.get("attemptNo") or 0)
    execution_start_index = 0
    initial_portfolio = None
    if checkpoint is not None and checkpoint.next_candle_open_time is not None:
        for index, candle in enumerate(candles):
            if candle.open_time >= checkpoint.next_candle_open_time:
                execution_start_index = index
                break
        initial_portfolio = PaperEngineInitialPortfolioState(
            cash=checkpoint.cash_balance,
            quantity=checkpoint.open_position_quantity,
            average_entry_price=checkpoint.average_entry_price,
            realized_pnl=checkpoint.realized_pnl,
            fees_paid=checkpoint.fees_paid,
            peak_equity=checkpoint.peak_equity,
            max_drawdown_pct=checkpoint.max_drawdown_pct,
        )
    return PaperEngineSession(
        session_id=str(row.id),
        status=row.status,
        exchange=row.exchange,
        symbol=row.symbol,
        timeframe=row.timeframe,
        dataset_key=row.dataset_key,
        start_at=row.start_at,
        end_at=row.end_at,
        starting_cash=row.starting_cash,
        candles=candles,
        fee_bps=_decimal_config(runtime_config, "feeBps"),
        slippage_bps=_decimal_config(runtime_config, "slippageBps"),
        runtime_config=runtime_config,
        strategy_metadata={
            "strategyId": str(row.strategy_id),
            "strategyVersionId": str(row.strategy_version_id),
            "source": "noop_phase_8_13",
        },
        actor=worker_id,
        worker_id=worker_id,
        correlation_id=None,
        request_id=None,
        reason_code=row.reason_code,
        error_message=row.error_message,
        attempt_no=attempt_no,
        initial_portfolio=initial_portfolio,
        execution_start_index=execution_start_index,
    )

def _decimal_config(config: dict[str, Any], key: str) -> Decimal:
    value = config.get(key)
    if value is None:
        return Decimal("0")
    return Decimal(str(value))

def _utcnow() -> datetime:
    return datetime.now(timezone.utc)
