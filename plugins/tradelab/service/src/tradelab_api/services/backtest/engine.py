from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy.orm import Session

from tradelab_api.db.models import (
    BacktestPosition,
    BacktestResult,
    BotRun,
    OrderIntent,
    StrategyLog,
    StrategySignal,
    TradeOrder,
)
from tradelab_api.services.strategy_runner import StrategyRunnerResult, run_strategy_subprocess

from .futures import FuturesPortfolioState
from .portfolio import PortfolioState, ZERO
from .risk import RiskGuard, decimalize


@dataclass(slots=True)
class BacktestRequest:
    strategy_source: str
    candles: list[dict[str, Any]]
    symbol: str
    timeframe: str
    exchange: str = "binance"
    initial_equity: Decimal = Decimal("1000")
    fee_bps: Decimal = ZERO
    slippage_bps: Decimal = ZERO
    max_order_percent: Decimal | None = None
    max_position_percent: Decimal | None = None
    min_notional: Decimal | None = None
    step_size: Decimal | None = None
    tick_size: Decimal | None = None
    max_drawdown_percent: Decimal | None = None
    runtime_config: dict[str, Any] = field(default_factory=dict)
    risk_config: dict[str, Any] = field(default_factory=dict)
    state: dict[str, Any] = field(default_factory=dict)
    market_type: str = "spot"
    default_leverage: int = 1
    bot_id: Any | None = None
    strategy_id: Any | None = None
    strategy_version_id: Any | None = None
    bot_run: BotRun | None = None
    source_snapshot: dict[str, Any] = field(default_factory=dict)
    dataset_context: dict[str, Any] = field(default_factory=dict)
    pipeline_context: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class BacktestExecution:
    status: str
    bot_run: BotRun
    result: BacktestResult | None
    signals: list[StrategySignal]
    order_intents: list[OrderIntent]
    trade_orders: list[TradeOrder]
    logs: list[StrategyLog]
    equity_curve: list[dict[str, Any]]
    portfolio: PortfolioState | FuturesPortfolioState
    positions: list[BacktestPosition] = field(default_factory=list)
    runner_result: StrategyRunnerResult | None = None
    stop_reason: str | None = None
    error_message: str | None = None


class BacktestEngine:
    def run(self, request: BacktestRequest) -> BacktestExecution:
        candles = sorted(request.candles, key=lambda candle: candle["open_time"])
        runner_result = run_strategy_subprocess(
            strategy_source=request.strategy_source,
            candles=_serialize_candles(candles),
            symbol=request.symbol,
            timeframe=request.timeframe,
            config=request.runtime_config,
            state=request.state,
            timeout_seconds=None,
        )
        if not runner_result.success or not runner_result.payload:
            return self._failed_execution(request, runner_result)

        if request.market_type == "usd_m_futures":
            return self._run_futures_backtest(request, candles, runner_result)

        runner_payload = runner_result.payload
        actions_by_index = _group_actions(runner_payload.get("actions", []))
        strategy_logs = _convert_runner_logs(runner_payload.get("logs", []))

        portfolio = PortfolioState(quote_balance=request.initial_equity)
        guard = RiskGuard.from_mapping(
            {
                "max_order_percent": request.max_order_percent,
                "max_position_percent": request.max_position_percent,
                "min_notional": request.min_notional,
                "step_size": request.step_size,
                "tick_size": request.tick_size,
                "fee_bps": request.fee_bps,
                "slippage_bps": request.slippage_bps,
                "max_drawdown_percent": request.max_drawdown_percent,
            }
        )

        bot_run_id = request.bot_run.id if request.bot_run is not None else uuid4()
        bot_run = request.bot_run or BotRun(
            id=bot_run_id,
            bot_id=request.bot_id,
            strategy_id=request.strategy_id or uuid4(),
            strategy_version_id=request.strategy_version_id or uuid4(),
            run_type="backtest",
            status="running",
            exchange=request.exchange,
            symbol=request.symbol,
            timeframe=request.timeframe,
            start_at=_parse_time(candles[0]["open_time"]) if candles else datetime.now(timezone.utc),
            end_at=_parse_time(candles[-1]["open_time"]) if candles else datetime.now(timezone.utc),
            started_at=datetime.now(timezone.utc),
            runtime_config=request.runtime_config,
            risk_config=request.risk_config,
            source_snapshot=request.source_snapshot,
            dataset_context=request.dataset_context,
            pipeline_context=request.pipeline_context,
            pipeline_status="running",
            error_message=None,
        )
        bot_run.status = "running"
        bot_run.started_at = bot_run.started_at or datetime.now(timezone.utc)
        bot_run.exchange = request.exchange
        bot_run.symbol = request.symbol
        bot_run.timeframe = request.timeframe
        bot_run.start_at = _parse_time(candles[0]["open_time"]) if candles else bot_run.start_at
        bot_run.end_at = _parse_time(candles[-1]["open_time"]) if candles else bot_run.end_at
        bot_run.runtime_config = request.runtime_config
        bot_run.risk_config = request.risk_config
        if request.source_snapshot:
            bot_run.source_snapshot = request.source_snapshot
        if request.dataset_context:
            bot_run.dataset_context = request.dataset_context
        if request.pipeline_context:
            bot_run.pipeline_context = request.pipeline_context
        bot_run.pipeline_status = "running"

        signals: list[StrategySignal] = []
        order_intents: list[OrderIntent] = []
        trade_orders: list[TradeOrder] = []
        logs: list[StrategyLog] = [
            _build_log(bot_run_id, level="info", event_type="STRATEGY_LOG", message=item["message"], payload=item)
            for item in strategy_logs
        ]
        equity_curve: list[dict[str, Any]] = []
        pending_fills: dict[int, list[dict[str, Any]]] = {}
        last_equity = request.initial_equity
        stop_reason: str | None = None
        closed_trade_pnls: list[Decimal] = []

        for index, candle in enumerate(candles):
            candle_time = _parse_time(candle["open_time"])
            close_price = decimalize(candle["close"]) or ZERO
            if index in pending_fills:
                for pending in pending_fills.pop(index):
                    trade_order, portfolio_update, realized_pnl = _execute_pending_fill(
                        bot_run_id=bot_run_id,
                        pending=pending,
                        portfolio=portfolio,
                        fill_time=_parse_time(candle["open_time"]),
                    )
                    trade_orders.append(trade_order)
                    if portfolio_update == "buy":
                        portfolio.buy(
                            quantity=pending["decision"].fill_qty,  # type: ignore[arg-type]
                            price=pending["decision"].fill_price,  # type: ignore[arg-type]
                            fee_amount=pending["decision"].fee_amount or ZERO,
                        )
                    elif portfolio_update == "sell":
                        portfolio.sell(
                            quantity=pending["decision"].fill_qty,  # type: ignore[arg-type]
                            price=pending["decision"].fill_price,  # type: ignore[arg-type]
                            fee_amount=pending["decision"].fee_amount or ZERO,
                        )
                        if realized_pnl is not None:
                            closed_trade_pnls.append(realized_pnl)

            equity = portfolio.mark_to_market(close_price)
            last_equity = equity
            equity_curve.append(
                {
                    "timestamp": candle_time.isoformat(),
                    "open_time": candle_time.isoformat(),
                    "close_time": _parse_time(candle.get("close_time") or candle["open_time"]).isoformat(),
                    "equity": float(equity),
                    "quote_balance": float(portfolio.quote_balance),
                    "base_balance": float(portfolio.base_balance),
                    "close": float(close_price),
                    "drawdown_pct": float(portfolio.max_drawdown_pct),
                }
            )

            if guard.config.max_drawdown_percent is not None and portfolio.max_drawdown_pct > guard.config.max_drawdown_percent:
                stop_reason = "max_drawdown"
                logs.append(
                    _build_log(
                        bot_run_id,
                        level="warning",
                        event_type="BACKTEST_STOP",
                        message="Max drawdown limit exceeded.",
                        payload={
                            "maxDrawdownPct": float(portfolio.max_drawdown_pct),
                            "limitPct": float(guard.config.max_drawdown_percent),
                        },
                    )
                )
                break

            if index >= len(candles) - 1:
                continue

            for action in actions_by_index.get(index, []):
                signal = _action_to_signal(bot_run_id, action, candle_time)
                if signal is not None:
                    signals.append(signal)

                intent = _action_to_intent(action)
                if intent is None:
                    continue

                decision = guard.evaluate(
                    kind=intent["kind"],
                    portfolio=portfolio,
                    current_equity=equity,
                    next_open_price=decimalize(candles[index + 1]["open"]) or ZERO,
                    percent=intent.get("percent"),
                    quote_amount=decimalize(intent.get("quote_amount")),
                    base_amount=decimalize(intent.get("base_amount")),
                )
                order_intent = OrderIntent(
                    id=uuid4(),
                    bot_run_id=bot_run_id,
                    strategy_signal_id=signal.id if signal is not None else None,
                    side=decision.side,
                    order_type="market",
                    requested_qty=decision.requested_qty,
                    requested_notional=decision.requested_notional,
                    status="accepted" if decision.accepted else "rejected",
                    reject_reason=decision.reject_reason,
                    payload={
                        "action": action,
                        "decision": _decision_payload(decision),
                    },
                )
                order_intents.append(order_intent)

                if not decision.accepted:
                    trade_orders.append(
                        _build_trade_order(
                            bot_run_id=bot_run_id,
                            order_intent_id=order_intent.id,
                            side=decision.side,
                            status="rejected",
                            reason=decision.reject_reason,
                            payload={"action": action, "decision": _decision_payload(decision)},
                        )
                    )
                    logs.append(
                        _build_log(
                            bot_run_id,
                            level="warning",
                            event_type="RISK_REJECTED",
                            message=decision.reject_reason or "Order rejected.",
                            payload={"action": action, "decision": _decision_payload(decision)},
                        )
                    )
                    continue

                if index + 1 >= len(candles):
                    trade_orders.append(
                        _build_trade_order(
                            bot_run_id=bot_run_id,
                            order_intent_id=order_intent.id,
                            side=decision.side,
                            status="skipped",
                            reason="No next candle available for fill.",
                            payload={"action": action, "decision": _decision_payload(decision)},
                        )
                    )
                    continue

                if decision.fill_qty is None or decision.fill_price is None:
                    continue

                pending_fills.setdefault(index + 1, []).append(
                    {
                        "decision": decision,
                        "order_intent_id": order_intent.id,
                        "action": action,
                    }
                )

        if stop_reason is not None:
            status = "cancelled"
        else:
            status = "completed"

        result = _build_result(
            bot_run_id,
            last_equity,
            request.initial_equity,
            portfolio,
            trade_orders,
            equity_curve,
            closed_trade_pnls,
        )
        bot_run.status = status
        bot_run.finished_at = datetime.now(timezone.utc)
        bot_run.error_message = stop_reason
        bot_run.pipeline_status = status

        return BacktestExecution(
            status=status,
            bot_run=bot_run,
            result=result,
            signals=signals,
            order_intents=order_intents,
            trade_orders=trade_orders,
            logs=logs,
            equity_curve=equity_curve,
            portfolio=portfolio,
            runner_result=runner_result,
            stop_reason=stop_reason,
            error_message=stop_reason,
        )

    def _run_futures_backtest(
        self,
        request: BacktestRequest,
        candles: list[dict[str, Any]],
        runner_result: StrategyRunnerResult,
    ) -> BacktestExecution:
        actions_by_index = _group_actions(runner_result.payload.get("actions", []))
        strategy_logs = _convert_runner_logs(runner_result.payload.get("logs", []))
        portfolio = FuturesPortfolioState(
            initial_equity=request.initial_equity,
            symbol=request.symbol,
            default_leverage=request.default_leverage,
        )
        bot_run_id = request.bot_run.id if request.bot_run is not None else uuid4()
        bot_run = request.bot_run or BotRun(
            id=bot_run_id,
            bot_id=request.bot_id,
            strategy_id=request.strategy_id or uuid4(),
            strategy_version_id=request.strategy_version_id or uuid4(),
            run_type="backtest",
            status="running",
            exchange=request.exchange,
            symbol=request.symbol,
            timeframe=request.timeframe,
            start_at=_parse_time(candles[0]["open_time"]) if candles else datetime.now(timezone.utc),
            end_at=_parse_time(candles[-1]["open_time"]) if candles else datetime.now(timezone.utc),
            started_at=datetime.now(timezone.utc),
            runtime_config=request.runtime_config,
            risk_config=request.risk_config,
            source_snapshot=request.source_snapshot,
            dataset_context=request.dataset_context,
            pipeline_context=request.pipeline_context,
            pipeline_status="running",
            error_message=None,
        )
        logs = [
            _build_log(bot_run_id, level="info", event_type="STRATEGY_LOG", message=item["message"], payload=item)
            for item in strategy_logs
        ]
        signals: list[StrategySignal] = []
        order_intents: list[OrderIntent] = []
        trade_orders: list[TradeOrder] = []
        equity_curve: list[dict[str, Any]] = []

        for index, candle in enumerate(candles):
            candle_time = _parse_time(candle["open_time"])
            close_price = decimalize(candle["close"]) or ZERO
            portfolio.update_mark_price(close_price)
            portfolio.apply_funding_until(candle_time)
            liquidation = portfolio.evaluate_cross_margin_liquidation(at_time=candle_time)
            if liquidation is not None:
                logs.append(
                    _build_log(
                        bot_run_id,
                        level="warning",
                        event_type="LIQUIDATION",
                        message="Cross-margin liquidation triggered.",
                        payload=liquidation,
                    )
                )
            equity_curve.append(
                {
                    "timestamp": candle_time.isoformat(),
                    "open_time": candle_time.isoformat(),
                    "close_time": _parse_time(candle.get("close_time") or candle["open_time"]).isoformat(),
                    "equity": float(portfolio.portfolio_equity()),
                    "quote_balance": float(portfolio.margin_balance),
                    "base_balance": 0.0,
                    "close": float(close_price),
                    "drawdown_pct": float(portfolio.max_drawdown_pct),
                }
            )
            if liquidation is not None or index >= len(candles) - 1:
                continue
            for action in actions_by_index.get(index, []):
                signal = _action_to_signal(bot_run_id, action, candle_time)
                if signal is not None:
                    signals.append(signal)
                intent = _action_to_intent(action)
                if intent is None:
                    continue
                next_open = decimalize(candles[index + 1]["open"]) or ZERO
                requested_percent = Decimal(str(intent.get("percent") or 100))
                active_position = portfolio.positions.get(request.symbol)
                if intent["kind"] == "close_position" and active_position is None:
                    continue
                if intent["kind"] == "close_position" and active_position is not None:
                    requested_qty = active_position.quantity * requested_percent / Decimal("100")
                    requested_notional = requested_qty * next_open
                    order_side = "sell" if active_position.side == "LONG" else "buy"
                else:
                    requested_margin = portfolio.portfolio_equity() * requested_percent / Decimal("100")
                    leverage_multiplier = Decimal(str(max(request.default_leverage, 1)))
                    requested_notional = requested_margin * leverage_multiplier
                    requested_qty = requested_notional / next_open if next_open > ZERO else ZERO
                    order_side = "buy" if intent["kind"] == "buy_market" else "sell"
                order_intent = OrderIntent(
                    id=uuid4(),
                    bot_run_id=bot_run_id,
                    strategy_signal_id=signal.id if signal is not None else None,
                    side=order_side,
                    order_type="market",
                    requested_qty=requested_qty,
                    requested_notional=requested_notional,
                    status="accepted",
                    reject_reason=None,
                    payload={"action": action, "marketType": "usd_m_futures"},
                )
                order_intents.append(order_intent)
                if intent["kind"] == "buy_market":
                    if portfolio.symbol in portfolio.positions and portfolio.positions[portfolio.symbol].side == "SHORT":
                        portfolio.close_active(price=next_open, closed_at=_parse_time(candles[index + 1]["open_time"]))
                    portfolio.open_long(quantity=requested_qty, price=next_open, opened_at=_parse_time(candles[index + 1]["open_time"]))
                    trade_orders.append(
                        _build_trade_order(
                            bot_run_id=bot_run_id,
                            order_intent_id=order_intent.id,
                            side=order_side,
                            status="filled",
                            fill_time=_parse_time(candles[index + 1]["open_time"]),
                            fill_price=next_open,
                            fill_qty=requested_qty,
                            fill_notional=requested_notional,
                            fee_amount=ZERO,
                            payload={"action": action, "marketType": "usd_m_futures"},
                        )
                    )
                elif intent["kind"] == "sell_market":
                    if portfolio.symbol in portfolio.positions and portfolio.positions[portfolio.symbol].side == "LONG":
                        portfolio.close_active(price=next_open, closed_at=_parse_time(candles[index + 1]["open_time"]))
                    portfolio.open_short(quantity=requested_qty, price=next_open, opened_at=_parse_time(candles[index + 1]["open_time"]))
                    trade_orders.append(
                        _build_trade_order(
                            bot_run_id=bot_run_id,
                            order_intent_id=order_intent.id,
                            side=order_side,
                            status="filled",
                            fill_time=_parse_time(candles[index + 1]["open_time"]),
                            fill_price=next_open,
                            fill_qty=requested_qty,
                            fill_notional=requested_notional,
                            fee_amount=ZERO,
                            payload={"action": action, "marketType": "usd_m_futures"},
                        )
                    )
                elif intent["kind"] == "close_position":
                    close_time = _parse_time(candles[index + 1]["open_time"])
                    portfolio.apply_funding_until(close_time)
                    portfolio.close_active(price=next_open, closed_at=close_time)
                    trade_orders.append(
                        _build_trade_order(
                            bot_run_id=bot_run_id,
                            order_intent_id=order_intent.id,
                            side=order_side,
                            status="filled",
                            fill_time=close_time,
                            fill_price=next_open,
                            fill_qty=requested_qty,
                            fill_notional=requested_notional,
                            fee_amount=ZERO,
                            payload={"action": action, "marketType": "usd_m_futures"},
                        )
                    )

        positions = _build_futures_positions(bot_run_id, portfolio)
        result = _build_futures_result(
            bot_run_id=bot_run_id,
            initial_equity=request.initial_equity,
            portfolio=portfolio,
            equity_curve=equity_curve,
            trade_orders=trade_orders,
        )
        return BacktestExecution(
            status="completed",
            bot_run=bot_run,
            result=result,
            signals=signals,
            order_intents=order_intents,
            trade_orders=trade_orders,
            logs=logs,
            equity_curve=equity_curve,
            portfolio=portfolio,
            positions=positions,
            runner_result=runner_result,
        )

    def _failed_execution(
        self,
        request: BacktestRequest,
        runner_result: StrategyRunnerResult,
    ) -> BacktestExecution:
        bot_run_id = request.bot_run.id if request.bot_run is not None else uuid4()
        bot_run = request.bot_run or BotRun(
            id=bot_run_id,
            bot_id=request.bot_id,
            strategy_id=request.strategy_id or uuid4(),
            strategy_version_id=request.strategy_version_id or uuid4(),
            run_type="backtest",
            status="failed",
            exchange=request.exchange,
            symbol=request.symbol,
            timeframe=request.timeframe,
            start_at=datetime.now(timezone.utc),
            end_at=datetime.now(timezone.utc),
            started_at=datetime.now(timezone.utc),
            finished_at=datetime.now(timezone.utc),
            runtime_config=request.runtime_config,
            risk_config=request.risk_config,
            source_snapshot=request.source_snapshot,
            dataset_context=request.dataset_context,
            pipeline_context=request.pipeline_context,
            pipeline_status="failed",
            error_message=runner_result.error_message,
        )
        bot_run.status = "failed"
        bot_run.finished_at = datetime.now(timezone.utc)
        bot_run.error_message = runner_result.error_message
        bot_run.pipeline_status = "failed"
        logs = [
            _build_log(
                bot_run_id,
                level="error",
                event_type="RUNNER_ERROR",
                message=runner_result.error_message or "Strategy runner failed.",
                payload={
                    "stdout": runner_result.stdout,
                    "stderr": runner_result.stderr,
                    "timedOut": runner_result.timed_out,
                },
            )
        ]
        return BacktestExecution(
            status="failed",
            bot_run=bot_run,
            result=None,
            signals=[],
            order_intents=[],
            trade_orders=[],
            logs=logs,
            equity_curve=[],
            portfolio=PortfolioState(quote_balance=request.initial_equity),
            runner_result=runner_result,
            stop_reason=None,
            error_message=runner_result.error_message,
        )


def persist_backtest_execution(session: Session, execution: BacktestExecution) -> None:
    session.add(execution.bot_run)
    if execution.result is not None:
        session.add(execution.result)
    session.add_all(execution.signals)
    session.add_all(execution.order_intents)
    session.add_all(execution.trade_orders)
    session.add_all(execution.logs)
    session.add_all(execution.positions)


def _build_futures_positions(bot_run_id: UUID, portfolio: FuturesPortfolioState) -> list[BacktestPosition]:
    source_positions = list(portfolio.closed_positions)
    if portfolio.symbol in portfolio.positions and portfolio.positions[portfolio.symbol] not in source_positions:
        source_positions.append(portfolio.positions[portfolio.symbol])
    return [
        BacktestPosition(
            run_id=bot_run_id,
            symbol=position.symbol,
            side=position.side,
            size=position.quantity,
            leverage=position.leverage,
            entry_price=position.entry_price,
            close_price=position.close_price,
            liquidation_price=position.liquidation_price,
            margin_mode=position.margin_mode,
            maintenance_margin=position.maintenance_margin,
            funding_fee_paid=position.funding_fee_paid,
            max_notional=position.max_notional,
            max_margin_used=position.max_margin_used,
            peak_leverage_used=position.peak_leverage_used,
            realized_pnl=position.realized_pnl,
            status=position.status,
        )
        for position in source_positions
    ]


def _build_futures_result(
    *,
    bot_run_id: UUID,
    initial_equity: Decimal,
    portfolio: FuturesPortfolioState,
    equity_curve: list[dict[str, Any]],
    trade_orders: list[TradeOrder],
) -> BacktestResult:
    summary = portfolio.build_research_summary()
    final_equity = portfolio.portfolio_equity()
    total_return_pct = ZERO if initial_equity <= ZERO else (final_equity - initial_equity) / initial_equity * Decimal("100")
    closed_trade_pnls = [pnl for _, pnl in portfolio.trade_outcomes]
    closed_trades = len(closed_trade_pnls)
    wins = sum(1 for pnl in closed_trade_pnls if pnl >= ZERO)
    gross_profit = sum((pnl for pnl in closed_trade_pnls if pnl >= ZERO), start=ZERO)
    gross_loss = sum((abs(pnl) for pnl in closed_trade_pnls if pnl < ZERO), start=ZERO)
    profit_factor = None if gross_loss <= ZERO else gross_profit / gross_loss
    win_rate_pct = None if not closed_trade_pnls else Decimal(wins) / Decimal(len(closed_trade_pnls)) * Decimal("100")
    metrics = {
        "initialEquity": float(initial_equity),
        "finalEquity": float(final_equity),
        "totalReturnPct": float(total_return_pct),
        "maxDrawdownPct": float(portfolio.max_drawdown_pct),
        "profitFactor": float(profit_factor) if profit_factor is not None else None,
        "winRatePct": float(win_rate_pct) if win_rate_pct is not None else None,
        "totalTrades": closed_trades,
        "closedTrades": closed_trades,
        **summary,
    }
    return BacktestResult(
        id=uuid4(),
        bot_run_id=bot_run_id,
        initial_equity=initial_equity,
        final_equity=final_equity,
        total_return_pct=total_return_pct,
        max_drawdown_pct=portfolio.max_drawdown_pct,
        profit_factor=profit_factor,
        win_rate_pct=win_rate_pct,
        total_trades=closed_trades,
        metrics=metrics,
        equity_curve=equity_curve,
        created_at=datetime.now(timezone.utc),
    )


def _group_actions(actions: list[dict[str, Any]]) -> dict[int, list[dict[str, Any]]]:
    grouped: dict[int, list[dict[str, Any]]] = {}
    for item in actions:
        index = int(item.get("candleIndex", 0))
        grouped.setdefault(index, []).extend(item.get("actions", []))
    return grouped


def _serialize_candles(candles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    serialized: list[dict[str, Any]] = []
    for candle in candles:
        serialized.append(
            {
                "open_time": _parse_time(candle["open_time"]).isoformat(),
                "close_time": _parse_time(candle.get("close_time") or candle["open_time"]).isoformat(),
                "open": str(candle["open"]),
                "high": str(candle["high"]),
                "low": str(candle["low"]),
                "close": str(candle["close"]),
                "volume": str(candle["volume"]),
            }
        )
    return serialized


def _convert_runner_logs(logs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    converted: list[dict[str, Any]] = []
    for log in logs:
        converted.append(
            {
                "message": log.get("message", ""),
                "payload": log.get("payload", {}),
                "symbol": log.get("symbol"),
                "timeframe": log.get("timeframe"),
            }
        )
    return converted


def _action_to_signal(bot_run_id: Any, action: dict[str, Any], candle_time: datetime) -> StrategySignal | None:
    if "signal_type" in action:
        return StrategySignal(
            id=uuid4(),
            bot_run_id=bot_run_id,
            candle_open_time=candle_time,
            signal_type=action["signal_type"],
            strength=decimalize(action.get("strength")),
            payload=action.get("payload", {}),
            created_at=datetime.now(timezone.utc),
        )
    kind = action.get("kind")
    if kind not in {"buy_market", "sell_market", "close_position"}:
        return None
    signal_type = "buy" if kind == "buy_market" else "sell" if kind == "sell_market" else "close"
    return StrategySignal(
        id=uuid4(),
        bot_run_id=bot_run_id,
        candle_open_time=candle_time,
        signal_type=signal_type,
        strength=decimalize(action.get("strength")),
        payload={"action": action},
        created_at=datetime.now(timezone.utc),
    )


def _action_to_intent(action: dict[str, Any]) -> dict[str, Any] | None:
    kind = action.get("kind")
    if kind not in {"buy_market", "sell_market", "close_position"}:
        return None
    return {
        "kind": kind,
        "percent": action.get("percent"),
        "quote_amount": action.get("quote_amount"),
        "base_amount": action.get("base_amount"),
        "payload": action.get("payload", {}),
    }


def _execute_pending_fill(
    *,
    bot_run_id: Any,
    pending: dict[str, Any],
    portfolio: PortfolioState,
    fill_time: datetime,
) -> tuple[TradeOrder, str, Decimal | None]:
    decision = pending["decision"]
    realized_pnl: Decimal | None = None
    entry_price = portfolio.average_entry_price
    if decision.side == "sell" and entry_price is not None and decision.fill_price is not None and decision.fill_qty is not None:
        realized_pnl = (decision.fill_price - entry_price) * decision.fill_qty - (decision.fee_amount or ZERO)
    trade_order = _build_trade_order(
        bot_run_id=bot_run_id,
        order_intent_id=pending["order_intent_id"],
        side=decision.side,
        status="filled",
        fill_time=fill_time,
        fill_price=decision.fill_price,
        fill_qty=decision.fill_qty,
        fill_notional=decision.fill_notional,
        fee_amount=decision.fee_amount,
        payload={
            "action": pending["action"],
            "decision": _decision_payload(decision),
            "entryPrice": str(entry_price) if entry_price is not None else None,
            "realizedPnl": str(realized_pnl) if realized_pnl is not None else None,
        },
    )
    portfolio_action = "buy" if decision.side == "buy" else "sell"
    return trade_order, portfolio_action, realized_pnl


def _build_trade_order(
    *,
    bot_run_id: Any,
    order_intent_id: Any,
    side: str,
    status: str,
    reason: str | None = None,
    payload: dict[str, Any] | None = None,
    fill_time: datetime | None = None,
    fill_price: Decimal | None = None,
    fill_qty: Decimal | None = None,
    fill_notional: Decimal | None = None,
    fee_amount: Decimal | None = None,
) -> TradeOrder:
    return TradeOrder(
        id=uuid4(),
        bot_run_id=bot_run_id,
        order_intent_id=order_intent_id,
        side=side,
        order_type="market",
        status=status,
        fill_time=fill_time,
        fill_price=fill_price,
        fill_qty=fill_qty,
        fill_notional=fill_notional,
        fee_amount=fee_amount,
        fee_asset="quote" if fee_amount is not None else None,
        reason=reason,
        payload=payload or {},
        created_at=fill_time or datetime.now(timezone.utc),
    )


def _build_log(
    bot_run_id: Any,
    *,
    level: str,
    event_type: str,
    message: str,
    payload: dict[str, Any],
) -> StrategyLog:
    return StrategyLog(
        id=uuid4(),
        bot_run_id=bot_run_id,
        level=level,
        event_type=event_type,
        message=message,
        payload=payload,
        created_at=datetime.now(timezone.utc),
    )


def _build_result(
    bot_run_id: Any,
    final_equity: Decimal,
    initial_equity: Decimal,
    portfolio: PortfolioState,
    trade_orders: list[TradeOrder],
    equity_curve: list[dict[str, Any]],
    closed_trade_pnls: list[Decimal],
) -> BacktestResult:
    wins = 0
    gross_profit = ZERO
    gross_loss = ZERO
    for pnl in closed_trade_pnls:
        if pnl >= ZERO:
            wins += 1
            gross_profit += pnl
        else:
            gross_loss += abs(pnl)
    profit_factor = None if gross_loss <= ZERO else gross_profit / gross_loss
    win_rate_pct = None if not closed_trade_pnls else Decimal(wins) / Decimal(len(closed_trade_pnls)) * Decimal("100")
    total_return_pct = ZERO if initial_equity <= ZERO else (final_equity - initial_equity) / initial_equity * Decimal("100")
    closed_trades = len(closed_trade_pnls)
    metrics = {
        "initialEquity": float(initial_equity),
        "finalEquity": float(final_equity),
        "totalReturnPct": float(total_return_pct),
        "maxDrawdownPct": float(portfolio.max_drawdown_pct),
        "profitFactor": float(profit_factor) if profit_factor is not None else None,
        "winRatePct": float(win_rate_pct) if win_rate_pct is not None else None,
        "totalTrades": closed_trades,
        "closedTrades": closed_trades,
        "equityCurvePoints": len(equity_curve),
    }
    return BacktestResult(
        id=uuid4(),
        bot_run_id=bot_run_id,
        initial_equity=initial_equity,
        final_equity=final_equity,
        total_return_pct=total_return_pct,
        max_drawdown_pct=portfolio.max_drawdown_pct,
        profit_factor=profit_factor,
        win_rate_pct=win_rate_pct,
        total_trades=closed_trades,
        metrics=metrics,
        equity_curve=equity_curve,
        created_at=datetime.now(timezone.utc),
    )


def _decision_payload(decision: Any) -> dict[str, Any]:
    return {
        "accepted": decision.accepted,
        "side": decision.side,
        "requestedQty": str(decision.requested_qty) if decision.requested_qty is not None else None,
        "requestedNotional": str(decision.requested_notional) if decision.requested_notional is not None else None,
        "fillQty": str(decision.fill_qty) if decision.fill_qty is not None else None,
        "fillPrice": str(decision.fill_price) if decision.fill_price is not None else None,
        "fillNotional": str(decision.fill_notional) if decision.fill_notional is not None else None,
        "feeAmount": str(decision.fee_amount) if decision.fee_amount is not None else None,
        "rejectReason": decision.reject_reason,
        "payload": decision.payload,
    }


def _parse_time(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    text = str(value)
    return datetime.fromisoformat(text.replace("Z", "+00:00"))
