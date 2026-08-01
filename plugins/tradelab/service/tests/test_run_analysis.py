from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from tradelab_api.db.models import BacktestResult, BotRun, OrderIntent, StrategyLog, StrategySignal, TradeOrder
from tradelab_api.services.run_analysis import build_run_analysis, build_selected_trade_execution_detail


def test_build_run_analysis_groups_trades_deterministically() -> None:
    run, result, orders, signals, logs = _build_trade_fixture()

    analysis_a = build_run_analysis(run, result, list(reversed(orders)), signals, logs)
    analysis_b = build_run_analysis(run, result, orders, signals, logs)

    assert [trade.id for trade in analysis_a.trades] == [trade.id for trade in analysis_b.trades]
    assert analysis_a.trade_summary.total_trades == 2
    assert analysis_a.trade_summary.closed_trades == 1
    assert analysis_a.trade_summary.open_trades == 1
    assert analysis_a.trade_summary.winning_trades == 1
    assert analysis_a.trade_summary.losing_trades == 0
    assert analysis_a.trades[0].status == "closed"
    assert analysis_a.trades[0].pnl == Decimal("10")
    assert analysis_a.trades[0].duration_seconds == 3600
    assert analysis_a.trades[1].status == "open"
    assert analysis_a.trades[1].exit_time is None

def test_build_run_analysis_preserves_futures_reversal_entry() -> None:
    run, result, orders, signals, logs = _build_trade_fixture()
    orders[1].payload = {"action": {"kind": "sell_market"}, "marketType": "usd_m_futures"}
    orders[2].payload = {"action": {"kind": "buy_market"}, "marketType": "usd_m_futures"}

    analysis = build_run_analysis(run, result, orders, signals, logs)

    assert analysis.trade_summary.total_trades == 3
    assert analysis.trade_summary.closed_trades == 2
    assert analysis.trade_summary.open_trades == 1
    assert [trade.status for trade in analysis.trades] == ["closed", "closed", "open"]


def test_build_selected_trade_execution_detail_returns_related_inputs() -> None:
    run, _, orders, signals, logs = _build_trade_fixture()
    detail = build_selected_trade_execution_detail(
        run=run,
        trade_id=orders[0].id,
        orders=orders,
        signals=signals,
        logs=logs,
    )

    assert detail is not None
    assert detail.trade.id == orders[0].id
    assert detail.entry_order is not None and detail.entry_order["id"] == str(orders[0].id)
    assert detail.exit_order is not None and detail.exit_order["id"] == str(orders[1].id)
    assert detail.entry_signal is not None and detail.entry_signal["id"] == str(signals[0].id)
    assert detail.exit_signal is not None and detail.exit_signal["id"] == str(signals[1].id)
    assert [item["event_type"] for item in detail.logs] == ["ENTRY", "EXIT"]


def test_build_run_analysis_uses_run_date_range_for_dataset_context() -> None:
    run, result, orders, signals, logs = _build_trade_fixture()
    run.end_at = datetime(2026, 1, 1, 2, 0, tzinfo=timezone.utc)
    run.dataset_context = {
        **run.dataset_context,
        "requestedEndAt": "2026-01-01T03:00:00Z",
    }

    analysis = build_run_analysis(run, result, orders, signals, logs)

    assert analysis.dataset_context.requested_start_at == run.start_at
    assert analysis.dataset_context.requested_end_at == run.end_at


def _build_trade_fixture() -> tuple[BotRun, BacktestResult, list[TradeOrder], list[StrategySignal], list[StrategyLog]]:
    strategy_id = uuid4()
    strategy_version_id = uuid4()
    run = BotRun(
        id=uuid4(),
        bot_id=uuid4(),
        strategy_id=strategy_id,
        strategy_version_id=strategy_version_id,
        run_type="backtest",
        status="completed",
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        start_at=datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
        end_at=datetime(2026, 1, 1, 3, 0, tzinfo=timezone.utc),
        started_at=datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
        finished_at=datetime(2026, 1, 1, 3, 0, tzinfo=timezone.utc),
        runtime_config={
            "exchange": "binance",
            "symbol": "BTCUSDT",
            "timeframe": "1h",
            "startAt": "2026-01-01T00:00:00Z",
            "endAt": "2026-01-01T03:00:00Z",
        },
        risk_config={
            "maxOrderPercent": 10,
            "maxPositionPercent": 100,
            "maxDrawdownPercent": 15,
        },
        source_snapshot={
            "sourceCode": "print('strategy')",
            "sourceHash": "hash-1",
            "strategyVersionId": str(strategy_version_id),
        },
        dataset_context={
            "datasetKey": "binance:BTCUSDT:1h",
            "exchange": "binance",
            "symbol": "BTCUSDT",
            "timeframe": "1h",
            "requestedStartAt": "2026-01-01T00:00:00Z",
            "requestedEndAt": "2026-01-01T03:00:00Z",
            "coverage": {
                "datasetKey": "binance:BTCUSDT:1h",
                "exchange": "binance",
                "symbol": "BTCUSDT",
                "timeframe": "1h",
            },
        },
        pipeline_context={"preflight": {"outcome": "ready"}},
        pipeline_status="completed",
        error_message=None,
        created_at=datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
        created_by="codex",
    )

    result = BacktestResult(
        id=uuid4(),
        bot_run_id=run.id,
        initial_equity=Decimal("1000"),
        final_equity=Decimal("1010"),
        total_return_pct=Decimal("1"),
        max_drawdown_pct=Decimal("2"),
        profit_factor=Decimal("1.5"),
        win_rate_pct=Decimal("50"),
        total_trades=2,
        metrics={
            "initialEquity": 1000,
            "finalEquity": 1010,
            "totalReturnPct": 1,
            "maxDrawdownPct": 2,
            "profitFactor": 1.5,
            "winRatePct": 50,
            "totalTrades": 2,
            "closedTrades": 1,
        },
        equity_curve=[],
        created_at=datetime(2026, 1, 1, 3, 0, tzinfo=timezone.utc),
    )

    entry_signal = StrategySignal(
        id=uuid4(),
        bot_run_id=run.id,
        candle_open_time=datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
        signal_type="buy",
        strength=Decimal("1"),
        payload={"kind": "entry"},
        created_at=datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
    )
    exit_signal = StrategySignal(
        id=uuid4(),
        bot_run_id=run.id,
        candle_open_time=datetime(2026, 1, 1, 1, 0, tzinfo=timezone.utc),
        signal_type="sell",
        strength=Decimal("1"),
        payload={"kind": "exit"},
        created_at=datetime(2026, 1, 1, 1, 0, tzinfo=timezone.utc),
    )
    open_signal = StrategySignal(
        id=uuid4(),
        bot_run_id=run.id,
        candle_open_time=datetime(2026, 1, 1, 2, 0, tzinfo=timezone.utc),
        signal_type="buy",
        strength=Decimal("1"),
        payload={"kind": "open"},
        created_at=datetime(2026, 1, 1, 2, 0, tzinfo=timezone.utc),
    )

    entry_intent = OrderIntent(
        id=uuid4(),
        bot_run_id=run.id,
        strategy_signal_id=entry_signal.id,
        side="buy",
        order_type="market",
        requested_qty=Decimal("1"),
        requested_notional=Decimal("100"),
        status="accepted",
        reject_reason=None,
        payload={"action": "buy_market"},
        created_at=datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
    )
    exit_intent = OrderIntent(
        id=uuid4(),
        bot_run_id=run.id,
        strategy_signal_id=exit_signal.id,
        side="sell",
        order_type="market",
        requested_qty=Decimal("1"),
        requested_notional=Decimal("110"),
        status="accepted",
        reject_reason=None,
        payload={"action": "sell_market"},
        created_at=datetime(2026, 1, 1, 1, 0, tzinfo=timezone.utc),
    )
    open_intent = OrderIntent(
        id=uuid4(),
        bot_run_id=run.id,
        strategy_signal_id=open_signal.id,
        side="buy",
        order_type="market",
        requested_qty=Decimal("1"),
        requested_notional=Decimal("120"),
        status="accepted",
        reject_reason=None,
        payload={"action": "buy_market"},
        created_at=datetime(2026, 1, 1, 2, 0, tzinfo=timezone.utc),
    )

    entry_order = TradeOrder(
        id=uuid4(),
        bot_run_id=run.id,
        order_intent_id=entry_intent.id,
        side="buy",
        order_type="market",
        status="filled",
        fill_time=datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
        fill_price=Decimal("100"),
        fill_qty=Decimal("1"),
        fill_notional=Decimal("100"),
        fee_amount=Decimal("0"),
        fee_asset="quote",
        reason="entry",
        payload={"kind": "entry"},
        created_at=datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
    )
    exit_order = TradeOrder(
        id=uuid4(),
        bot_run_id=run.id,
        order_intent_id=exit_intent.id,
        side="sell",
        order_type="market",
        status="filled",
        fill_time=datetime(2026, 1, 1, 1, 0, tzinfo=timezone.utc),
        fill_price=Decimal("110"),
        fill_qty=Decimal("1"),
        fill_notional=Decimal("110"),
        fee_amount=Decimal("0"),
        fee_asset="quote",
        reason="exit",
        payload={"kind": "exit"},
        created_at=datetime(2026, 1, 1, 1, 0, tzinfo=timezone.utc),
    )
    open_order = TradeOrder(
        id=uuid4(),
        bot_run_id=run.id,
        order_intent_id=open_intent.id,
        side="buy",
        order_type="market",
        status="filled",
        fill_time=datetime(2026, 1, 1, 2, 0, tzinfo=timezone.utc),
        fill_price=Decimal("120"),
        fill_qty=Decimal("1"),
        fill_notional=Decimal("120"),
        fee_amount=Decimal("0"),
        fee_asset="quote",
        reason="open",
        payload={"kind": "open"},
        created_at=datetime(2026, 1, 1, 2, 0, tzinfo=timezone.utc),
    )

    logs = [
        StrategyLog(
            id=uuid4(),
            bot_run_id=run.id,
            level="info",
            event_type="PRE_RUN",
            message="Before trade window.",
            payload={},
            created_at=datetime(2025, 12, 31, 23, 0, tzinfo=timezone.utc),
        ),
        StrategyLog(
            id=uuid4(),
            bot_run_id=run.id,
            level="info",
            event_type="ENTRY",
            message="Opened trade.",
            payload={},
            created_at=datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
        ),
        StrategyLog(
            id=uuid4(),
            bot_run_id=run.id,
            level="info",
            event_type="EXIT",
            message="Closed trade.",
            payload={},
            created_at=datetime(2026, 1, 1, 1, 0, tzinfo=timezone.utc),
        ),
        StrategyLog(
            id=uuid4(),
            bot_run_id=run.id,
            level="info",
            event_type="OPEN",
            message="Still open.",
            payload={},
            created_at=datetime(2026, 1, 1, 2, 0, tzinfo=timezone.utc),
        ),
    ]

    entry_order.order_intent = entry_intent
    exit_order.order_intent = exit_intent
    open_order.order_intent = open_intent
    entry_intent.strategy_signal = entry_signal
    exit_intent.strategy_signal = exit_signal
    open_intent.strategy_signal = open_signal

    return run, result, [entry_order, exit_order, open_order], [entry_signal, exit_signal, open_signal], logs


def test_build_run_analysis_exposes_futures_research_summary() -> None:
    run, result, orders, signals, logs = _build_trade_fixture()
    result.metrics = {
        **dict(result.metrics),
        "totalFundingFeePaid": 12.5,
        "totalFundingFeeReceived": 0.0,
        "liquidationCount": 1,
        "longTrades": 2,
        "shortTrades": 1,
        "longWinRate": 50.0,
        "shortWinRate": 100.0,
        "avgLeverageUsed": 8.5,
        "maxMarginUsagePct": 72.0,
        "maxMaintenanceMarginPct": 19.5,
    }

    analysis = build_run_analysis(run, result, orders, signals, logs, positions=[])

    assert analysis.total_funding_fee_paid == 12.5
    assert analysis.futures_summary is not None
    assert analysis.futures_summary.liquidation_count == 1
    assert analysis.futures_summary.max_margin_usage_pct == 72.0
