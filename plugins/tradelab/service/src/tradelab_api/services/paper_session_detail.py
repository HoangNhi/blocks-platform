from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

READ_ONLY_PAPER_SESSION_DETAIL_SAFETY_STATUS = "read_only_paper_session_detail"
DEFAULT_AUDIT_EVENT_LIMIT = 20
DEFAULT_ORDER_LIMIT = 100
DEFAULT_FILL_LIMIT = 100
DEFAULT_POSITION_LIMIT = 20
DEFAULT_PORTFOLIO_SNAPSHOT_LIMIT = 100
SECRET_KEY_PARTS = (
    "secret",
    "password",
    "token",
    "api_key",
    "apikey",
    "private_key",
    "privatekey",
    "passphrase",
)

class PaperSessionDetailValidationError(Exception):
    def __init__(self, status_code: int, reason_code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.reason_code = reason_code
        self.message = message

@dataclass(frozen=True)
class PaperSessionDetailSession:
    session_id: str
    bot_id: str
    strategy_id: str
    strategy_version_id: str
    mode: str
    status: str
    exchange: str
    symbol: str
    timeframe: str
    dataset_key: str
    start_at: datetime
    end_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    cancel_requested_at: datetime | None
    starting_cash: Decimal
    reason_code: str | None
    error_message: str | None
    created_at: datetime
    created_by: str | None
    updated_at: datetime | None
    updated_by: str | None

@dataclass(frozen=True)
class PaperSessionDetailAuditEvent:
    audit_event_id: str
    event_at: datetime
    actor: str | None
    action: str
    target_type: str
    target_id: str | None
    old_state: str | None
    new_state: str | None
    reason_code: str | None
    correlation_id: str | None
    request_id: str | None
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: datetime | None = None
    created_by: str | None = None

@dataclass(frozen=True)
class PaperSessionDetailArtifactLimits:
    orders: int
    fills: int
    positions: int
    portfolio_snapshots: int
    audit_events: int

@dataclass(frozen=True)
class PaperSessionDetailOrder:
    order_id: str
    side: str
    order_type: str
    status: str
    quantity: Decimal
    requested_price: Decimal | None
    requested_notional: Decimal | None
    submitted_at: datetime | None
    finalized_at: datetime | None
    reason_code: str | None
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: datetime | None = None
    created_by: str | None = None
    updated_at: datetime | None = None
    updated_by: str | None = None

@dataclass(frozen=True)
class PaperSessionDetailFill:
    fill_id: str
    paper_order_id: str
    source_candle_id: str | None
    fill_time: datetime
    side: str
    price: Decimal
    quantity: Decimal
    notional: Decimal
    fee_amount: Decimal
    fee_asset: str | None
    slippage_amount: Decimal
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: datetime | None = None
    created_by: str | None = None

@dataclass(frozen=True)
class PaperSessionDetailPosition:
    position_id: str
    symbol: str
    side: str
    status: str
    quantity: Decimal
    average_entry_price: Decimal | None
    realized_pnl: Decimal
    unrealized_pnl: Decimal
    opened_at: datetime | None
    closed_at: datetime | None
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: datetime | None = None
    created_by: str | None = None
    updated_at: datetime | None = None
    updated_by: str | None = None

@dataclass(frozen=True)
class PaperSessionDetailPortfolioSnapshot:
    snapshot_id: str
    source_candle_id: str | None
    snapshot_at: datetime
    cash_balance: Decimal
    equity: Decimal
    realized_pnl: Decimal
    unrealized_pnl: Decimal
    fees_paid: Decimal
    drawdown_pct: Decimal
    exposure_notional: Decimal
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: datetime | None = None
    created_by: str | None = None

@dataclass(frozen=True)
class PaperSessionDetailArtifacts:
    orders: list[PaperSessionDetailOrder]
    fills: list[PaperSessionDetailFill]
    positions: list[PaperSessionDetailPosition]
    portfolio_snapshots: list[PaperSessionDetailPortfolioSnapshot]
    limits: PaperSessionDetailArtifactLimits

@dataclass(frozen=True)
class PaperSessionDetailResult:
    session: PaperSessionDetailSession
    dataset_context: dict[str, Any]
    gate_context: dict[str, Any]
    audit_events: list[PaperSessionDetailAuditEvent]
    artifacts: PaperSessionDetailArtifacts
    safety_status: str

def build_paper_session_detail(
    paper_repository: object,
    *,
    session_id: UUID,
    audit_event_limit: int = DEFAULT_AUDIT_EVENT_LIMIT,
    order_limit: int = DEFAULT_ORDER_LIMIT,
    fill_limit: int = DEFAULT_FILL_LIMIT,
    position_limit: int = DEFAULT_POSITION_LIMIT,
    portfolio_snapshot_limit: int = DEFAULT_PORTFOLIO_SNAPSHOT_LIMIT,
) -> PaperSessionDetailResult:
    session = paper_repository.get_paper_session(session_id)
    if session is None:
        raise PaperSessionDetailValidationError(404, "paper_session_not_found", "Paper session not found.")

    bounded_audit_limit = _bounded_limit(audit_event_limit, DEFAULT_AUDIT_EVENT_LIMIT)
    bounded_order_limit = _bounded_limit(order_limit, DEFAULT_ORDER_LIMIT)
    bounded_fill_limit = _bounded_limit(fill_limit, DEFAULT_FILL_LIMIT)
    bounded_position_limit = _bounded_limit(position_limit, DEFAULT_POSITION_LIMIT)
    bounded_portfolio_snapshot_limit = _bounded_limit(
        portfolio_snapshot_limit,
        DEFAULT_PORTFOLIO_SNAPSHOT_LIMIT,
    )

    audit_events = paper_repository.list_audit_events_for_session(session_id, limit=bounded_audit_limit)
    orders = paper_repository.list_orders_for_session(session_id, limit=bounded_order_limit)
    fills = paper_repository.list_fills_for_session(session_id, limit=bounded_fill_limit)
    positions = paper_repository.list_positions_for_session(session_id, limit=bounded_position_limit)
    portfolio_snapshots = paper_repository.list_portfolio_snapshots_for_session(
        session_id,
        limit=bounded_portfolio_snapshot_limit,
    )

    sorted_audit_events = sorted(audit_events, key=lambda event: getattr(event, "event_at"))[:bounded_audit_limit]
    sorted_orders = sorted(orders, key=lambda order: getattr(order, "created_at"))[:bounded_order_limit]
    sorted_fills = sorted(fills, key=lambda fill: getattr(fill, "fill_time"))[:bounded_fill_limit]
    sorted_positions = sorted(positions, key=lambda position: getattr(position, "symbol"))[:bounded_position_limit]
    sorted_portfolio_snapshots = sorted(
        portfolio_snapshots,
        key=lambda snapshot: getattr(snapshot, "snapshot_at"),
    )[:bounded_portfolio_snapshot_limit]

    return PaperSessionDetailResult(
        session=_serialize_session(session),
        dataset_context=dict(getattr(session, "dataset_context", None) or {}),
        gate_context=dict(getattr(session, "gate_context", None) or {}),
        audit_events=[_serialize_audit_event(event) for event in sorted_audit_events],
        artifacts=PaperSessionDetailArtifacts(
            orders=[_serialize_order(order) for order in sorted_orders],
            fills=[_serialize_fill(fill) for fill in sorted_fills],
            positions=[_serialize_position(position) for position in sorted_positions],
            portfolio_snapshots=[
                _serialize_portfolio_snapshot(snapshot) for snapshot in sorted_portfolio_snapshots
            ],
            limits=PaperSessionDetailArtifactLimits(
                orders=bounded_order_limit,
                fills=bounded_fill_limit,
                positions=bounded_position_limit,
                portfolio_snapshots=bounded_portfolio_snapshot_limit,
                audit_events=bounded_audit_limit,
            ),
        ),
        safety_status=READ_ONLY_PAPER_SESSION_DETAIL_SAFETY_STATUS,
    )

def _serialize_session(session: object) -> PaperSessionDetailSession:
    return PaperSessionDetailSession(
        session_id=str(getattr(session, "id")),
        bot_id=str(getattr(session, "bot_id")),
        strategy_id=str(getattr(session, "strategy_id")),
        strategy_version_id=str(getattr(session, "strategy_version_id")),
        mode=str(getattr(session, "mode")),
        status=str(getattr(session, "status")),
        exchange=str(getattr(session, "exchange")),
        symbol=str(getattr(session, "symbol")),
        timeframe=str(getattr(session, "timeframe")),
        dataset_key=str(getattr(session, "dataset_key")),
        start_at=getattr(session, "start_at"),
        end_at=getattr(session, "end_at"),
        started_at=getattr(session, "started_at", None),
        finished_at=getattr(session, "finished_at", None),
        cancel_requested_at=getattr(session, "cancel_requested_at", None),
        starting_cash=getattr(session, "starting_cash"),
        reason_code=getattr(session, "reason_code", None),
        error_message=getattr(session, "error_message", None),
        created_at=getattr(session, "created_at"),
        created_by=getattr(session, "created_by", None),
        updated_at=getattr(session, "updated_at", None),
        updated_by=getattr(session, "updated_by", None),
    )

def _serialize_audit_event(event: object) -> PaperSessionDetailAuditEvent:
    target_id = getattr(event, "target_id", None)
    return PaperSessionDetailAuditEvent(
        audit_event_id=str(getattr(event, "id")),
        event_at=getattr(event, "event_at"),
        actor=getattr(event, "actor", None),
        action=str(getattr(event, "action")),
        target_type=str(getattr(event, "target_type")),
        target_id=str(target_id) if target_id is not None else None,
        old_state=getattr(event, "old_state", None),
        new_state=getattr(event, "new_state", None),
        reason_code=getattr(event, "reason_code", None),
        correlation_id=getattr(event, "correlation_id", None),
        request_id=getattr(event, "request_id", None),
        metadata=_sanitize_metadata(getattr(event, "metadata_", None) or {}),
        created_at=getattr(event, "created_at", None),
        created_by=getattr(event, "created_by", None),
    )

def _serialize_order(order: object) -> PaperSessionDetailOrder:
    return PaperSessionDetailOrder(
        order_id=str(getattr(order, "id")),
        side=str(getattr(order, "side")),
        order_type=str(getattr(order, "order_type")),
        status=str(getattr(order, "status")),
        quantity=getattr(order, "quantity"),
        requested_price=getattr(order, "requested_price", None),
        requested_notional=getattr(order, "requested_notional", None),
        submitted_at=getattr(order, "submitted_at", None),
        finalized_at=getattr(order, "finalized_at", None),
        reason_code=getattr(order, "reason_code", None),
        metadata=_sanitize_metadata(getattr(order, "metadata_", None) or {}),
        created_at=getattr(order, "created_at", None),
        created_by=getattr(order, "created_by", None),
        updated_at=getattr(order, "updated_at", None),
        updated_by=getattr(order, "updated_by", None),
    )

def _serialize_fill(fill: object) -> PaperSessionDetailFill:
    source_candle_id = getattr(fill, "source_candle_id", None)
    return PaperSessionDetailFill(
        fill_id=str(getattr(fill, "id")),
        paper_order_id=str(getattr(fill, "paper_order_id")),
        source_candle_id=str(source_candle_id) if source_candle_id is not None else None,
        fill_time=getattr(fill, "fill_time"),
        side=str(getattr(fill, "side")),
        price=getattr(fill, "price"),
        quantity=getattr(fill, "quantity"),
        notional=getattr(fill, "notional"),
        fee_amount=getattr(fill, "fee_amount"),
        fee_asset=getattr(fill, "fee_asset", None),
        slippage_amount=getattr(fill, "slippage_amount"),
        metadata=_sanitize_metadata(getattr(fill, "metadata_", None) or {}),
        created_at=getattr(fill, "created_at", None),
        created_by=getattr(fill, "created_by", None),
    )

def _serialize_position(position: object) -> PaperSessionDetailPosition:
    return PaperSessionDetailPosition(
        position_id=str(getattr(position, "id")),
        symbol=str(getattr(position, "symbol")),
        side=str(getattr(position, "side")),
        status=str(getattr(position, "status")),
        quantity=getattr(position, "quantity"),
        average_entry_price=getattr(position, "average_entry_price", None),
        realized_pnl=getattr(position, "realized_pnl"),
        unrealized_pnl=getattr(position, "unrealized_pnl"),
        opened_at=getattr(position, "opened_at", None),
        closed_at=getattr(position, "closed_at", None),
        metadata=_sanitize_metadata(getattr(position, "metadata_", None) or {}),
        created_at=getattr(position, "created_at", None),
        created_by=getattr(position, "created_by", None),
        updated_at=getattr(position, "updated_at", None),
        updated_by=getattr(position, "updated_by", None),
    )

def _serialize_portfolio_snapshot(snapshot: object) -> PaperSessionDetailPortfolioSnapshot:
    source_candle_id = getattr(snapshot, "source_candle_id", None)
    return PaperSessionDetailPortfolioSnapshot(
        snapshot_id=str(getattr(snapshot, "id")),
        source_candle_id=str(source_candle_id) if source_candle_id is not None else None,
        snapshot_at=getattr(snapshot, "snapshot_at"),
        cash_balance=getattr(snapshot, "cash_balance"),
        equity=getattr(snapshot, "equity"),
        realized_pnl=getattr(snapshot, "realized_pnl"),
        unrealized_pnl=getattr(snapshot, "unrealized_pnl"),
        fees_paid=getattr(snapshot, "fees_paid"),
        drawdown_pct=getattr(snapshot, "drawdown_pct"),
        exposure_notional=getattr(snapshot, "exposure_notional"),
        metadata=_sanitize_metadata(getattr(snapshot, "metadata_", None) or {}),
        created_at=getattr(snapshot, "created_at", None),
        created_by=getattr(snapshot, "created_by", None),
    )

def _bounded_limit(value: int, default: int) -> int:
    return min(max(value, 0), default)

def _sanitize_metadata(value: object) -> Any:
    if isinstance(value, dict):
        return {
            str(key): "[REDACTED]" if _is_secret_key(key) else _sanitize_metadata(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_sanitize_metadata(item) for item in value]
    if isinstance(value, tuple):
        return [_sanitize_metadata(item) for item in value]
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, str | int | float | bool) or value is None:
        return value
    return str(value)

def _is_secret_key(key: object) -> bool:
    normalized = str(key).replace("-", "_").lower()
    return any(part in normalized for part in SECRET_KEY_PARTS)
