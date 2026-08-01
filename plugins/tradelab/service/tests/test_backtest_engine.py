from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

from tradelab_api.services.backtest.engine import BacktestEngine, BacktestRequest

FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "sma_9_21_long_only_strategy.py"


def _candles() -> list[dict[str, object]]:
    return [
        {
            "open_time": "2026-01-01T00:00:00Z",
            "close_time": "2026-01-01T01:00:00Z",
            "open": 100,
            "high": 105,
            "low": 95,
            "close": 100,
            "volume": 10,
        },
        {
            "open_time": "2026-01-01T01:00:00Z",
            "close_time": "2026-01-01T02:00:00Z",
            "open": 110,
            "high": 115,
            "low": 105,
            "close": 110,
            "volume": 10,
        },
        {
            "open_time": "2026-01-01T02:00:00Z",
            "close_time": "2026-01-01T03:00:00Z",
            "open": 120,
            "high": 125,
            "low": 115,
            "close": 120,
            "volume": 10,
        },
        {
            "open_time": "2026-01-01T03:00:00Z",
            "close_time": "2026-01-01T04:00:00Z",
            "open": 60,
            "high": 65,
            "low": 55,
            "close": 60,
            "volume": 10,
        },
    ]


def test_buy_and_sell_fill_at_next_candle_open() -> None:
    engine = BacktestEngine()
    request = BacktestRequest(
        strategy_source="""
def on_candle(ctx):
    if not ctx.state.get("entered"):
        ctx.state["entered"] = True
        return ctx.buy_market(percent=50)
    if ctx.state.get("entered") and not ctx.state.get("exited"):
        ctx.state["exited"] = True
        return ctx.sell_market(percent=100)
""".strip(),
        candles=_candles(),
        symbol="BTCUSDT",
        timeframe="1h",
        initial_equity=Decimal("100"),
        fee_bps=Decimal("0"),
        slippage_bps=Decimal("0"),
    )

    execution = engine.run(request)

    assert execution.status == "completed"
    assert execution.result is not None
    assert len([trade for trade in execution.trade_orders if trade.status == "filled"]) == 2
    assert execution.trade_orders[0].fill_price == Decimal("110")
    assert execution.trade_orders[1].fill_price == Decimal("120")


def test_fee_and_slippage_affect_equity() -> None:
    engine = BacktestEngine()
    strategy = """
def on_candle(ctx):
    if not ctx.state.get("entered"):
        ctx.state["entered"] = True
        return ctx.buy_market(percent=50)
""".strip()

    no_costs = engine.run(
        BacktestRequest(
            strategy_source=strategy,
            candles=_candles()[:2],
            symbol="BTCUSDT",
            timeframe="1h",
            initial_equity=Decimal("1000"),
            max_order_percent=Decimal("50"),
            fee_bps=Decimal("0"),
            slippage_bps=Decimal("0"),
        )
    )
    with_costs = engine.run(
        BacktestRequest(
            strategy_source=strategy,
            candles=_candles()[:2],
            symbol="BTCUSDT",
            timeframe="1h",
            initial_equity=Decimal("1000"),
            max_order_percent=Decimal("50"),
            fee_bps=Decimal("100"),
            slippage_bps=Decimal("100"),
        )
    )

    assert no_costs.result is not None and with_costs.result is not None
    assert with_costs.result.final_equity < no_costs.result.final_equity


def test_risk_rejection_for_too_small_notional() -> None:
    engine = BacktestEngine()
    execution = engine.run(
        BacktestRequest(
            strategy_source="""
def on_candle(ctx):
    return ctx.buy_market(percent=1)
""".strip(),
            candles=_candles()[:2],
            symbol="BTCUSDT",
            timeframe="1h",
            initial_equity=Decimal("100"),
            min_notional=Decimal("5"),
        )
    )

    assert execution.status == "completed"
    assert execution.trade_orders[0].status == "rejected"
    assert execution.trade_orders[0].reason == "Order notional is below the minimum notional."


def test_max_drawdown_stop() -> None:
    engine = BacktestEngine()
    execution = engine.run(
        BacktestRequest(
            strategy_source="""
def on_candle(ctx):
    if not ctx.state.get("entered"):
        ctx.state["entered"] = True
        return ctx.buy_market(percent=100)
""".strip(),
            candles=_candles(),
            symbol="BTCUSDT",
            timeframe="1h",
            initial_equity=Decimal("100"),
            max_drawdown_percent=Decimal("10"),
        )
    )

    assert execution.status == "cancelled"
    assert execution.stop_reason == "max_drawdown"


def test_zero_trade_result() -> None:
    engine = BacktestEngine()
    execution = engine.run(
        BacktestRequest(
            strategy_source="""
def on_candle(ctx):
    return None
""".strip(),
            candles=_candles()[:2],
            symbol="BTCUSDT",
            timeframe="1h",
            initial_equity=Decimal("100"),
        )
    )

    assert execution.status == "completed"
    assert execution.result is not None
    assert execution.result.total_trades == 0
    assert execution.result.win_rate_pct is None


def test_baseline_full_position_strategy_closes_at_least_one_trade() -> None:
    engine = BacktestEngine()
    source = FIXTURE_PATH.read_text(encoding="utf-8")
    candles = _trend_reversal_candles()

    execution = engine.run(
        BacktestRequest(
            strategy_source=source,
            candles=candles,
            symbol="BTCUSDT",
            timeframe="1h",
            initial_equity=Decimal("10000"),
            fee_bps=Decimal("10"),
            slippage_bps=Decimal("5"),
            max_order_percent=Decimal("100"),
            max_position_percent=Decimal("100"),
        )
    )

    assert execution.status == "completed"
    assert execution.result is not None
    assert execution.result.metrics["closedTrades"] >= 1
    assert execution.result.total_trades == execution.result.metrics["closedTrades"]
    assert execution.result.metrics["totalTrades"] == execution.result.metrics["closedTrades"]
    assert len([trade for trade in execution.trade_orders if trade.status == "filled"]) >= 2
    assert execution.trade_orders[0].side == "buy"
    assert execution.trade_orders[-1].side == "sell"


def _trend_reversal_candles() -> list[dict[str, object]]:
    prices = [100] * 21 + [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 109, 108, 107, 106, 105, 104, 103, 102, 101, 100, 99]
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    candles: list[dict[str, object]] = []
    for index, price in enumerate(prices):
        open_time = start + timedelta(hours=index)
        close_time = open_time + timedelta(hours=1)
        candles.append(
            {
                "open_time": open_time.isoformat().replace("+00:00", "Z"),
                "close_time": close_time.isoformat().replace("+00:00", "Z"),
                "open": price,
                "high": price + 1,
                "low": price - 1,
                "close": price,
                "volume": 10,
            }
        )
    return candles


def test_futures_backtest_long_close_records_funding_metrics() -> None:
    engine = BacktestEngine()
    execution = engine.run(
        BacktestRequest(
            strategy_source="""
def on_candle(ctx):
    if not ctx.state.get("entered"):
        ctx.state["entered"] = True
        return ctx.buy_market(percent=100)
    if ctx.state.get("entered") and not ctx.state.get("closed") and ctx.bar.close >= 104:
        ctx.state["closed"] = True
        return ctx.close_position()
""".strip(),
            candles=[
                {"open_time": "2026-01-01T00:00:00Z", "close_time": "2026-01-01T08:00:00Z", "open": 100, "high": 101, "low": 99, "close": 100, "volume": 1},
                {"open_time": "2026-01-01T08:00:00Z", "close_time": "2026-01-01T16:00:00Z", "open": 102, "high": 105, "low": 101, "close": 104, "volume": 1},
                {"open_time": "2026-01-01T16:00:00Z", "close_time": "2026-01-02T00:00:00Z", "open": 104, "high": 106, "low": 103, "close": 105, "volume": 1},
            ],
            symbol="BTCUSDT",
            timeframe="8h",
            initial_equity=Decimal("1000"),
            runtime_config={"marketType": "USD_M_FUTURES", "defaultLeverage": 10},
            market_type="usd_m_futures",
            default_leverage=10,
        )
    )

    assert execution.status == "completed", execution.error_message
    assert execution.result is not None
    assert execution.result.metrics["totalFundingFeePaid"] > 0
    assert execution.result.metrics["longTrades"] == 1
    assert execution.result.metrics["shortTrades"] == 0
    assert execution.result.metrics["winRatePct"] == 100.0
    assert execution.result.win_rate_pct == Decimal("100")


def test_futures_reversals_count_each_closed_position_once() -> None:
    engine = BacktestEngine()
    execution = engine.run(
        BacktestRequest(
            strategy_source="""
def on_candle(ctx):
    step = ctx.state.get("step", 0)
    if step == 0:
        ctx.state["step"] = 1
        return ctx.buy_market(percent=100)
    if step == 1:
        ctx.state["step"] = 2
        return ctx.sell_market(percent=100)
    if step == 2:
        ctx.state["step"] = 3
        return ctx.buy_market(percent=100)
""".strip(),
            candles=[
                {"open_time": "2026-01-01T00:00:00Z", "close_time": "2026-01-01T01:00:00Z", "open": 100, "high": 101, "low": 99, "close": 100, "volume": 1},
                {"open_time": "2026-01-01T01:00:00Z", "close_time": "2026-01-01T02:00:00Z", "open": 101, "high": 102, "low": 100, "close": 101, "volume": 1},
                {"open_time": "2026-01-01T02:00:00Z", "close_time": "2026-01-01T03:00:00Z", "open": 99, "high": 100, "low": 98, "close": 99, "volume": 1},
                {"open_time": "2026-01-01T03:00:00Z", "close_time": "2026-01-01T04:00:00Z", "open": 98, "high": 99, "low": 97, "close": 98, "volume": 1},
            ],
            symbol="BTCUSDT",
            timeframe="1h",
            initial_equity=Decimal("1000"),
            runtime_config={"marketType": "USD_M_FUTURES", "defaultLeverage": 2},
            market_type="usd_m_futures",
            default_leverage=2,
        )
    )

    assert execution.status == "completed", execution.error_message
    assert execution.result is not None
    assert execution.result.total_trades == 2
    assert execution.result.metrics["totalTrades"] == 2
    assert execution.result.metrics["closedTrades"] == 2
    assert len(execution.portfolio.trade_outcomes) == 2

def test_futures_backtest_cross_margin_liquidation_marks_run_metrics() -> None:
    engine = BacktestEngine()
    execution = engine.run(
        BacktestRequest(
            strategy_source="""
def on_candle(ctx):
    if not ctx.state.get("entered"):
        ctx.state["entered"] = True
        return ctx.buy_market(percent=5000)
""".strip(),
            candles=[
                {"open_time": "2026-01-01T00:00:00Z", "close_time": "2026-01-01T01:00:00Z", "open": 100, "high": 100, "low": 100, "close": 100, "volume": 1},
                {"open_time": "2026-01-01T01:00:00Z", "close_time": "2026-01-01T02:00:00Z", "open": 100, "high": 100, "low": 99, "close": 99, "volume": 1},
                {"open_time": "2026-01-01T02:00:00Z", "close_time": "2026-01-01T03:00:00Z", "open": 99, "high": 99, "low": 98, "close": 98, "volume": 1},
            ],
            symbol="BTCUSDT",
            timeframe="1h",
            initial_equity=Decimal("100"),
            runtime_config={"marketType": "USD_M_FUTURES", "defaultLeverage": 50},
            market_type="usd_m_futures",
            default_leverage=50,
        )
    )

    assert execution.status == "completed"
    assert execution.result is not None
    assert execution.result.metrics["liquidationCount"] == 1, [f"price: {p.entry_price}, size: {p.size}, close: {p.close_price}, status: {p.status}" for p in execution.positions]
    assert execution.result.metrics["maxMaintenanceMarginPct"] > 0


def test_futures_backtest_uses_default_leverage_for_entry_notional() -> None:
    engine = BacktestEngine()
    execution = engine.run(
        BacktestRequest(
            strategy_source="""
def on_candle(ctx):
    if not ctx.state.get("entered"):
        ctx.state["entered"] = True
        return ctx.buy_market(percent=100)
""".strip(),
            candles=[
                {"open_time": "2026-01-01T00:00:00Z", "close_time": "2026-01-01T01:00:00Z", "open": 100, "high": 100, "low": 100, "close": 100, "volume": 1},
                {"open_time": "2026-01-01T01:00:00Z", "close_time": "2026-01-01T02:00:00Z", "open": 100, "high": 100, "low": 100, "close": 100, "volume": 1},
            ],
            symbol="BTCUSDT",
            timeframe="1h",
            initial_equity=Decimal("1000"),
            runtime_config={"marketType": "USD_M_FUTURES", "defaultLeverage": 10},
            market_type="usd_m_futures",
            default_leverage=10,
        )
    )

    assert execution.status == "completed"
    assert execution.order_intents[0].requested_notional == Decimal("10000")
    assert execution.trade_orders[0].fill_qty == Decimal("100")
