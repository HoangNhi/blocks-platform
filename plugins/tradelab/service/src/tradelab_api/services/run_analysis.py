from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from tradelab_api.api.serializers import serialize_sorted_value
from tradelab_api.db.models import BacktestPosition, BacktestResult, BotRun, StrategyLog, StrategySignal, TradeOrder
from tradelab_api.schemas.backtest import (
    BacktestPositionResponse,
    BacktestResultResponse,
    BotRunHistoryEntryResponse,
    BotRunSnapshotResponse,
    FuturesResearchSummaryResponse,
    TradeAnalysisAnalyzedTradeResponse,
    TradeAnalysisDatasetContextResponse,
    TradeAnalysisResponse,
    TradeAnalysisSummaryResponse,
    TradeExecutionDetailResponse,
)

ZERO = Decimal("0")


def _float_or_none(value: object) -> float | None:
    return float(value) if value is not None else None


@dataclass(slots=True)
class _TradeBucket:
    id: UUID
    entry_order_id: UUID
    exit_order_id: UUID | None
    entry_time: datetime
    exit_time: datetime | None
    side: str
    status: str
    entry_price: Decimal | None
    exit_price: Decimal | None
    quantity: Decimal | None
    pnl: Decimal | None
    pnl_pct: Decimal | None
    duration_seconds: int | None
    entry_signal_id: UUID | None
    exit_signal_id: UUID | None
    entry_reason: str | None
    exit_reason: str | None
    entry_order: TradeOrder
    exit_order: TradeOrder | None
    entry_signal: StrategySignal | None
    exit_signal: StrategySignal | None


def build_run_analysis(
    run: BotRun,
    result: BacktestResult | None,
    orders: list[TradeOrder],
    signals: list[StrategySignal],
    logs: list[StrategyLog],
    positions: list[BacktestPosition] | None = None,
) -> TradeAnalysisResponse:
    trades = _group_trades(orders, signals, logs)
    positions_response = [
        BacktestPositionResponse.model_validate(p, from_attributes=True)
        for p in (positions or [])
    ]
    metrics = dict(getattr(result, "metrics", {}) or {})
    futures_summary = FuturesResearchSummaryResponse(
        total_funding_fee_paid=float(metrics.get("totalFundingFeePaid", 0.0) or 0.0),
        total_funding_fee_received=float(metrics.get("totalFundingFeeReceived", 0.0) or 0.0),
        liquidation_count=int(metrics.get("liquidationCount", 0) or 0),
        long_trades=int(metrics.get("longTrades", 0) or 0),
        short_trades=int(metrics.get("shortTrades", 0) or 0),
        long_win_rate=_float_or_none(metrics.get("longWinRate")),
        short_win_rate=_float_or_none(metrics.get("shortWinRate")),
        avg_leverage_used=_float_or_none(metrics.get("avgLeverageUsed")),
        max_margin_usage_pct=_float_or_none(metrics.get("maxMarginUsagePct")),
        max_maintenance_margin_pct=_float_or_none(metrics.get("maxMaintenanceMarginPct")),
    )
    return TradeAnalysisResponse(
        run=BotRunHistoryEntryResponse.model_validate(run),
        result=BacktestResultResponse.model_validate(result) if result is not None else None,
        snapshot=BotRunSnapshotResponse.model_validate(
            {
                "source_snapshot": serialize_sorted_value(run.source_snapshot),
                "dataset_context": serialize_sorted_value(run.dataset_context),
                "pipeline_context": serialize_sorted_value(run.pipeline_context),
            }
        ),
        runtime_config=serialize_sorted_value(run.runtime_config),
        risk_config=serialize_sorted_value(run.risk_config),
        dataset_context=_build_dataset_context(run),
        trade_summary=_build_trade_summary(trades),
        trades=[_bucket_to_response(bucket) for bucket in trades],
        positions=positions_response,
        total_funding_fee_paid=futures_summary.total_funding_fee_paid,
        futures_summary=futures_summary if result is not None else None,
    )


def build_selected_trade_execution_detail(
    *,
    run: BotRun,
    trade_id: UUID,
    orders: list[TradeOrder],
    signals: list[StrategySignal],
    logs: list[StrategyLog],
) -> TradeExecutionDetailResponse | None:
    trade_buckets = _group_trades(orders, signals, logs)
    bucket = next((item for item in trade_buckets if item.id == trade_id), None)
    if bucket is None:
        return None
    return TradeExecutionDetailResponse(
        trade=_bucket_to_response(bucket),
        entry_order=_serialize_trade_order(bucket.entry_order),
        exit_order=_serialize_trade_order(bucket.exit_order) if bucket.exit_order is not None else None,
        entry_signal=_serialize_signal(bucket.entry_signal) if bucket.entry_signal is not None else None,
        exit_signal=_serialize_signal(bucket.exit_signal) if bucket.exit_signal is not None else None,
        logs=_serialize_trade_logs(bucket, logs),
    )


def _build_dataset_context(run: BotRun) -> TradeAnalysisDatasetContextResponse:
    snapshot_context = run.dataset_context or {}
    source_snapshot = run.source_snapshot or {}
    return TradeAnalysisDatasetContextResponse(
        dataset_key=str(snapshot_context.get("datasetKey") or snapshot_context.get("dataset_key") or ""),
        exchange=str(snapshot_context.get("exchange") or run.exchange),
        symbol=str(snapshot_context.get("symbol") or run.symbol),
        timeframe=str(snapshot_context.get("timeframe") or run.timeframe),
        requested_start_at=run.start_at
        or _parse_datetime(snapshot_context.get("requestedStartAt") or snapshot_context.get("requested_start_at")),
        requested_end_at=run.end_at
        or _parse_datetime(snapshot_context.get("requestedEndAt") or snapshot_context.get("requested_end_at")),
        source_hash=str(source_snapshot.get("sourceHash") or ""),
        strategy_version_id=_parse_uuid(source_snapshot.get("strategyVersionId") or source_snapshot.get("strategy_version_id")),
        coverage=serialize_sorted_value(snapshot_context.get("coverage")) if snapshot_context.get("coverage") is not None else None,
    )


def _build_trade_summary(trades: list[_TradeBucket]) -> TradeAnalysisSummaryResponse:
    closed_trades = [trade for trade in trades if trade.status == "closed" and trade.pnl is not None]
    open_trades = [trade for trade in trades if trade.status == "open"]
    winning_trades = [trade for trade in closed_trades if trade.pnl is not None and trade.pnl > ZERO]
    losing_trades = [trade for trade in closed_trades if trade.pnl is not None and trade.pnl < ZERO]
    break_even_trades = [trade for trade in closed_trades if trade.pnl is not None and trade.pnl == ZERO]
    realized_pnl = sum((trade.pnl or ZERO for trade in closed_trades), ZERO)
    average_pnl = realized_pnl / Decimal(len(closed_trades)) if closed_trades else None
    pnl_percentages = [trade.pnl_pct for trade in closed_trades if trade.pnl_pct is not None]
    average_pnl_pct = sum(pnl_percentages, ZERO) / Decimal(len(pnl_percentages)) if pnl_percentages else None
    durations = [trade.duration_seconds for trade in closed_trades if trade.duration_seconds is not None]
    average_duration_seconds = (
        int(sum(Decimal(duration) for duration in durations) / Decimal(len(durations))) if durations else None
    )
    gross_profit = sum((trade.pnl for trade in winning_trades if trade.pnl is not None), ZERO)
    gross_loss = sum((abs(trade.pnl) for trade in losing_trades if trade.pnl is not None), ZERO)
    profit_factor = None if gross_loss <= ZERO else gross_profit / gross_loss
    win_rate_pct = None if not closed_trades else Decimal(len(winning_trades)) / Decimal(len(closed_trades)) * Decimal("100")

    return TradeAnalysisSummaryResponse(
        total_trades=len(trades),
        closed_trades=len(closed_trades),
        open_trades=len(open_trades),
        winning_trades=len(winning_trades),
        losing_trades=len(losing_trades),
        break_even_trades=len(break_even_trades),
        realized_pnl=realized_pnl,
        average_pnl=average_pnl,
        average_pnl_pct=average_pnl_pct,
        average_duration_seconds=average_duration_seconds,
        win_rate_pct=win_rate_pct,
        profit_factor=profit_factor,
    )


def _group_trades(
    orders: list[TradeOrder],
    signals: list[StrategySignal],
    logs: list[StrategyLog],
) -> list[_TradeBucket]:
    sorted_orders = sorted(orders, key=_order_sort_key)
    signal_by_id = {signal.id: signal for signal in signals}
    trade_buckets: list[_TradeBucket] = []
    active_trade: _TradeBucket | None = None

    for order in sorted_orders:
        if order.status != "filled":
            continue
        intent = order.order_intent
        signal = signal_by_id.get(intent.strategy_signal_id) if intent is not None and intent.strategy_signal_id is not None else None
        if active_trade is None:
            active_trade = _create_trade_bucket(order=order, signal=signal)
            trade_buckets.append(active_trade)
            continue

        if _is_exit_order(active_trade, order):
            active_trade.exit_order_id = order.id
            active_trade.exit_time = order.fill_time or order.created_at
            active_trade.exit_price = order.fill_price
            active_trade.exit_signal_id = signal.id if signal is not None else None
            active_trade.exit_reason = order.reason
            active_trade.exit_order = order
            active_trade.exit_signal = signal
            active_trade.status = "closed"
            active_trade.pnl = _calculate_trade_pnl(active_trade)
            active_trade.pnl_pct = _calculate_trade_pnl_pct(active_trade)
            active_trade.duration_seconds = _calculate_trade_duration_seconds(active_trade)
            active_trade = None
            if _opens_futures_reversal(order):
                active_trade = _create_trade_bucket(order=order, signal=signal)
                trade_buckets.append(active_trade)
            continue

        active_trade = _create_trade_bucket(order=order, signal=signal)
        trade_buckets.append(active_trade)

    return trade_buckets


def _create_trade_bucket(*, order: TradeOrder, signal: StrategySignal | None) -> _TradeBucket:
    entry_time = order.fill_time or order.created_at
    return _TradeBucket(
        id=order.id,
        entry_order_id=order.id,
        exit_order_id=None,
        entry_time=entry_time,
        exit_time=None,
        side=order.side,
        status="open",
        entry_price=order.fill_price,
        exit_price=None,
        quantity=order.fill_qty,
        pnl=None,
        pnl_pct=None,
        duration_seconds=None,
        entry_signal_id=signal.id if signal is not None else None,
        exit_signal_id=None,
        entry_reason=order.reason,
        exit_reason=None,
        entry_order=order,
        exit_order=None,
        entry_signal=signal,
        exit_signal=None,
    )


def _is_exit_order(active_trade: _TradeBucket, order: TradeOrder) -> bool:
    if active_trade.side == "buy" and order.side == "sell":
        return True
    if active_trade.side == "sell" and order.side == "buy":
        return True
    return False

def _opens_futures_reversal(order: TradeOrder) -> bool:
    payload = order.payload if isinstance(order.payload, dict) else {}
    action = payload.get("action")
    return (
        payload.get("marketType") == "usd_m_futures"
        and isinstance(action, dict)
        and action.get("kind") in {"buy_market", "sell_market"}
    )


def _calculate_trade_pnl(trade: _TradeBucket) -> Decimal | None:
    if trade.entry_price is None or trade.exit_price is None or trade.quantity is None:
        return None
    if trade.side == "buy":
        return (trade.exit_price - trade.entry_price) * trade.quantity
    return (trade.entry_price - trade.exit_price) * trade.quantity


def _calculate_trade_pnl_pct(trade: _TradeBucket) -> Decimal | None:
    if trade.entry_price is None or trade.exit_price is None or trade.entry_price == ZERO:
        return None
    if trade.side == "buy":
        return (trade.exit_price - trade.entry_price) / trade.entry_price * Decimal("100")
    return (trade.entry_price - trade.exit_price) / trade.entry_price * Decimal("100")


def _calculate_trade_duration_seconds(trade: _TradeBucket) -> int | None:
    if trade.exit_time is None:
        return None
    return int((trade.exit_time - trade.entry_time).total_seconds())


def _bucket_to_response(bucket: _TradeBucket) -> TradeAnalysisAnalyzedTradeResponse:
    return TradeAnalysisAnalyzedTradeResponse(
        id=bucket.id,
        entry_order_id=bucket.entry_order_id,
        exit_order_id=bucket.exit_order_id,
        entry_time=bucket.entry_time,
        exit_time=bucket.exit_time,
        side=bucket.side,
        status=bucket.status,
        entry_price=bucket.entry_price,
        exit_price=bucket.exit_price,
        quantity=bucket.quantity,
        pnl=bucket.pnl,
        pnl_pct=bucket.pnl_pct,
        duration_seconds=bucket.duration_seconds,
        entry_signal_id=bucket.entry_signal_id,
        exit_signal_id=bucket.exit_signal_id,
        entry_reason=bucket.entry_reason,
        exit_reason=bucket.exit_reason,
    )


def _serialize_trade_order(order: TradeOrder | None) -> dict[str, object] | None:
    if order is None:
        return None
    payload = {
        "id": str(order.id),
        "bot_run_id": str(order.bot_run_id),
        "order_intent_id": str(order.order_intent_id) if order.order_intent_id is not None else None,
        "side": order.side,
        "order_type": order.order_type,
        "status": order.status,
        "fill_time": order.fill_time.isoformat() if order.fill_time is not None else None,
        "fill_price": float(order.fill_price) if order.fill_price is not None else None,
        "fill_qty": float(order.fill_qty) if order.fill_qty is not None else None,
        "fill_notional": float(order.fill_notional) if order.fill_notional is not None else None,
        "fee_amount": float(order.fee_amount) if order.fee_amount is not None else None,
        "fee_asset": order.fee_asset,
        "reason": order.reason,
        "payload": serialize_sorted_value(order.payload),
        "created_at": order.created_at.isoformat(),
    }
    return payload


def _serialize_signal(signal: StrategySignal) -> dict[str, object]:
    return {
        "id": str(signal.id),
        "bot_run_id": str(signal.bot_run_id),
        "candle_open_time": signal.candle_open_time.isoformat(),
        "signal_type": signal.signal_type,
        "strength": float(signal.strength) if signal.strength is not None else None,
        "payload": serialize_sorted_value(signal.payload),
        "created_at": signal.created_at.isoformat(),
    }


def _serialize_trade_logs(trade: _TradeBucket, logs: list[StrategyLog]) -> list[dict[str, object]]:
    start_at = trade.entry_time
    end_at = trade.exit_time
    selected_logs = [
        log
        for log in logs
        if log.created_at >= start_at and (end_at is None or log.created_at <= end_at)
    ]
    return [
        {
            "id": str(log.id),
            "bot_run_id": str(log.bot_run_id),
            "level": log.level,
            "event_type": log.event_type,
            "message": log.message,
            "payload": serialize_sorted_value(log.payload),
            "created_at": log.created_at.isoformat(),
        }
        for log in selected_logs
    ]


def _order_sort_key(order: TradeOrder) -> tuple[datetime, str]:
    return (order.fill_time or order.created_at, str(order.id))


def _parse_datetime(value: object | None) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    return None


def _parse_uuid(value: object | None) -> UUID | None:
    if isinstance(value, UUID):
        return value
    if isinstance(value, str) and value:
        return UUID(value)
    return None
