from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Protocol
from uuid import UUID

READ_ONLY_PAPER_RESUME_READINESS_SAFETY_STATUS = "read_only_paper_resume_readiness"
RESUMABLE_CANCEL_REASONS = {"paper_session_cancel_requested", "paper_kill_switch_enabled"}
NOT_RESUMABLE_REASON = "paper_local_resume_not_resumable"

class PaperSessionResumeReadinessRepository(Protocol):
    def get_paper_session(self, session_id: UUID): ...
    def get_latest_portfolio_snapshot_for_session(self, session_id: UUID): ...
    def list_open_positions_for_session(self, session_id: UUID): ...
    def list_pending_orders_for_session(self, session_id: UUID): ...
    def get_latest_resume_checkpoint_for_session(self, session_id: UUID): ...
    def get_artifact_identity_status_for_session(self, session_id: UUID) -> str: ...
    def get_next_market_candle_after(
        self,
        *,
        exchange: str,
        symbol: str,
        timeframe: str,
        after_open_time: datetime,
        end_at: datetime,
    ): ...

class PaperSessionResumeReadinessValidationError(Exception):
    def __init__(self, status_code: int, reason_code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.reason_code = reason_code
        self.message = message

@dataclass(frozen=True)
class PaperSessionResumeCheckpoint:
    last_processed_candle_id: str
    last_processed_candle_open_time: datetime
    next_candle_id: str
    next_candle_open_time: datetime
    cash_balance: Decimal
    equity: Decimal
    realized_pnl: Decimal
    unrealized_pnl: Decimal
    fees_paid: Decimal
    exposure_notional: Decimal
    open_position_quantity: Decimal
    average_entry_price: Decimal | None
    pending_orders_count: int

@dataclass(frozen=True)
class PaperSessionResumeReadinessResult:
    session_id: str
    status: str
    reason_code: str
    allowed: bool
    safety_status: str = READ_ONLY_PAPER_RESUME_READINESS_SAFETY_STATUS
    checkpoint: PaperSessionResumeCheckpoint | None = None
    checkpoint_source: str = "missing"
    artifact_identity_status: str = "missing"
    resume_mode: str = "same_session"
    attempt_no: int | None = None
    blocking_reasons: list[str] = field(default_factory=list)
    details: dict[str, object] = field(default_factory=dict)

def build_paper_session_resume_readiness(
    paper_repository: PaperSessionResumeReadinessRepository,
    *,
    session_id: UUID,
) -> PaperSessionResumeReadinessResult:
    session = paper_repository.get_paper_session(session_id)
    if session is None:
        raise PaperSessionResumeReadinessValidationError(404, "paper_session_not_found", "Paper session not found.")

    status = str(getattr(session, "status", "") or "")
    reason_code = str(getattr(session, "reason_code", "") or "")
    blocking_reasons: list[str] = []

    if getattr(session, "mode", None) != "paper":
        blocking_reasons.append("paper_local_resume_wrong_mode")
    if status != "cancelled" or reason_code not in RESUMABLE_CANCEL_REASONS:
        blocking_reasons.append(NOT_RESUMABLE_REASON)

    persisted_checkpoint = paper_repository.get_latest_resume_checkpoint_for_session(session_id)
    artifact_identity_status = paper_repository.get_artifact_identity_status_for_session(session_id)
    checkpoint: PaperSessionResumeCheckpoint | None = None
    checkpoint_source = "missing"
    attempt_no: int | None = None
    if persisted_checkpoint is not None:
        checkpoint_source = "persisted"
        attempt_no = int(getattr(persisted_checkpoint, "attempt_no", 0))
        checkpoint = PaperSessionResumeCheckpoint(
            last_processed_candle_id=str(getattr(persisted_checkpoint, "last_processed_candle_id") or ""),
            last_processed_candle_open_time=getattr(persisted_checkpoint, "last_processed_candle_open_time"),
            next_candle_id=str(getattr(persisted_checkpoint, "next_candle_id") or ""),
            next_candle_open_time=getattr(persisted_checkpoint, "next_candle_open_time"),
            cash_balance=getattr(persisted_checkpoint, "cash_balance"),
            equity=getattr(persisted_checkpoint, "equity"),
            realized_pnl=getattr(persisted_checkpoint, "realized_pnl"),
            unrealized_pnl=getattr(persisted_checkpoint, "unrealized_pnl"),
            fees_paid=getattr(persisted_checkpoint, "fees_paid"),
            exposure_notional=getattr(persisted_checkpoint, "exposure_notional"),
            open_position_quantity=getattr(persisted_checkpoint, "open_position_quantity"),
            average_entry_price=getattr(persisted_checkpoint, "average_entry_price", None),
            pending_orders_count=int(getattr(persisted_checkpoint, "pending_orders_count", 0)),
        )
        if getattr(persisted_checkpoint, "strategy_runtime_state_status", None) != "stateless_between_candles":
            blocking_reasons.append("paper_local_resume_strategy_state_unsupported")
        if not getattr(persisted_checkpoint, "next_candle_id", None) or getattr(persisted_checkpoint, "next_candle_open_time", None) is None:
            blocking_reasons.append("paper_local_resume_no_remaining_candles")
    else:
        snapshot = paper_repository.get_latest_portfolio_snapshot_for_session(session_id)
        if snapshot is None or getattr(snapshot, "source_candle_id", None) is None:
            blocking_reasons.append("paper_local_resume_checkpoint_missing")
        else:
            next_candle = paper_repository.get_next_market_candle_after(
                exchange=str(getattr(session, "exchange")),
                symbol=str(getattr(session, "symbol")),
                timeframe=str(getattr(session, "timeframe")),
                after_open_time=getattr(snapshot, "snapshot_at"),
                end_at=getattr(session, "end_at"),
            )
            if next_candle is None:
                blocking_reasons.append("paper_local_resume_no_remaining_candles")

            open_positions = list(paper_repository.list_open_positions_for_session(session_id))
            pending_orders = list(paper_repository.list_pending_orders_for_session(session_id))
            if pending_orders:
                blocking_reasons.append("paper_local_resume_pending_orders_unsupported")

            primary_position = open_positions[0] if open_positions else None
            if next_candle is not None:
                checkpoint_source = "derived"
                checkpoint = PaperSessionResumeCheckpoint(
                    last_processed_candle_id=str(getattr(snapshot, "source_candle_id")),
                    last_processed_candle_open_time=getattr(snapshot, "snapshot_at"),
                    next_candle_id=str(getattr(next_candle, "id")),
                    next_candle_open_time=getattr(next_candle, "open_time"),
                    cash_balance=getattr(snapshot, "cash_balance"),
                    equity=getattr(snapshot, "equity"),
                    realized_pnl=getattr(snapshot, "realized_pnl"),
                    unrealized_pnl=getattr(snapshot, "unrealized_pnl"),
                    fees_paid=getattr(snapshot, "fees_paid"),
                    exposure_notional=getattr(snapshot, "exposure_notional"),
                    open_position_quantity=getattr(primary_position, "quantity", Decimal("0")),
                    average_entry_price=getattr(primary_position, "average_entry_price", None),
                    pending_orders_count=len(pending_orders),
                )
            blocking_reasons.append("paper_local_resume_checkpoint_missing")

    if artifact_identity_status == "missing":
        blocking_reasons.append("paper_local_resume_artifact_identity_missing")
    elif artifact_identity_status == "ambiguous":
        blocking_reasons.append("paper_local_resume_artifact_identity_ambiguous")

    deduped_blocking_reasons = _dedupe(blocking_reasons)
    allowed = len(deduped_blocking_reasons) == 0
    resolved_reason = "paper_local_resume_readiness_ready" if allowed else deduped_blocking_reasons[0]

    return PaperSessionResumeReadinessResult(
        session_id=str(getattr(session, "id")),
        status=status,
        reason_code=resolved_reason,
        allowed=allowed,
        checkpoint=checkpoint,
        checkpoint_source=checkpoint_source,
        artifact_identity_status=artifact_identity_status,
        resume_mode="same_session",
        attempt_no=attempt_no,
        blocking_reasons=deduped_blocking_reasons,
        details={
            "sourceReasonCode": reason_code,
            "eligibleCancelReasons": sorted(RESUMABLE_CANCEL_REASONS),
            "readOnly": True,
        },
    )

def _dedupe(values: list[str]) -> list[str]:
    result: list[str] = []
    for value in values:
        if value not in result:
            result.append(value)
    return result
