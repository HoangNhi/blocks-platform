# -*- coding: utf-8 -*-
"""Kiểm thử serialization API cho futures run response - Task 4."""
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from tradelab_api.db.models import BacktestPosition, BacktestResult, BotRun
from tradelab_api.services.run_analysis import build_run_analysis


def _make_run() -> BotRun:
    strategy_id = uuid4()
    strategy_version_id = uuid4()
    return BotRun(
        id=uuid4(),
        bot_id=None,
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
        runtime_config={},
        risk_config={},
        pipeline_status="completed",
        error_message=None,
        source_snapshot={},
        dataset_context={
            "datasetKey": "binance:BTCUSDT:1h",
            "exchange": "binance",
            "symbol": "BTCUSDT",
            "timeframe": "1h",
        },
        pipeline_context={},
        created_at=datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
        created_by="test",
    )


def _make_position(run_id: object) -> BacktestPosition:
    return BacktestPosition(
        id=uuid4(),
        run_id=run_id,
        symbol="BTCUSDT",
        side="LONG",
        size=1.0,
        leverage=10,
        entry_price=50000.0,
        liquidation_price=45200.0,
        funding_fee_paid=0.0,
        realized_pnl=0.0,
        status="LIQUIDATED",
    )


def test_backtest_run_analysis_includes_positions() -> None:
    """Response của run analysis phải có trường positions."""
    run = _make_run()
    pos = _make_position(run.id)

    analysis = build_run_analysis(
        run=run,
        result=None,
        orders=[],
        signals=[],
        logs=[],
        positions=[pos],
    )

    assert hasattr(analysis, "positions"), "TradeAnalysisResponse phải có trường positions"
    assert len(analysis.positions) == 1
    assert analysis.positions[0].symbol == "BTCUSDT"
    assert analysis.positions[0].side == "LONG"
    assert analysis.positions[0].status == "LIQUIDATED"
    assert analysis.positions[0].leverage == 10
    assert analysis.positions[0].liquidation_price == 45200.0


def test_backtest_run_analysis_includes_total_funding_fee_paid() -> None:
    """Response của run analysis phải có trường total_funding_fee_paid."""
    run = _make_run()

    analysis = build_run_analysis(
        run=run,
        result=None,
        orders=[],
        signals=[],
        logs=[],
        positions=[],
    )

    assert hasattr(analysis, "total_funding_fee_paid"), "TradeAnalysisResponse phải có trường total_funding_fee_paid"
    assert analysis.total_funding_fee_paid == 0.0


def test_backtest_run_analysis_positions_empty_when_no_futures() -> None:
    """Response phải trả về danh sách positions rỗng khi không có vị thế."""
    run = _make_run()

    analysis = build_run_analysis(
        run=run,
        result=None,
        orders=[],
        signals=[],
        logs=[],
    )

    assert analysis.positions == []


def test_backtest_run_analysis_model_dump_includes_positions_key() -> None:
    """model_dump() phải bao gồm key 'positions' và 'totalFundingFeePaid' (camelCase)."""
    run = _make_run()
    pos = _make_position(run.id)

    analysis = build_run_analysis(
        run=run,
        result=None,
        orders=[],
        signals=[],
        logs=[],
        positions=[pos],
    )

    data = analysis.model_dump(mode="json", by_alias=True)
    assert "positions" in data, "JSON dump phải có key 'positions'"
    assert "totalFundingFeePaid" in data, "JSON dump phải có key 'totalFundingFeePaid'"
    assert len(data["positions"]) == 1
    assert data["positions"][0]["symbol"] == "BTCUSDT"


def test_backtest_run_analysis_includes_futures_summary_payload() -> None:
    run = _make_run()
    result = BacktestResult(
        id=uuid4(),
        bot_run_id=run.id,
        initial_equity=Decimal("1000"),
        final_equity=Decimal("900"),
        total_return_pct=Decimal("-10"),
        max_drawdown_pct=Decimal("20"),
        profit_factor=None,
        win_rate_pct=None,
        total_trades=1,
        metrics={
            "totalFundingFeePaid": 12.5,
            "totalFundingFeeReceived": 0.0,
            "liquidationCount": 1,
            "longTrades": 1,
            "shortTrades": 0,
            "longWinRate": 0.0,
            "shortWinRate": None,
            "avgLeverageUsed": 10.0,
            "maxMarginUsagePct": 80.0,
            "maxMaintenanceMarginPct": 25.0,
        },
        equity_curve=[],
        created_at=datetime(2026, 1, 1, 3, 0, tzinfo=timezone.utc),
    )

    analysis = build_run_analysis(
        run=run,
        result=result,
        orders=[],
        signals=[],
        logs=[],
        positions=[],
    )

    data = analysis.model_dump(mode="json", by_alias=True)
    assert data["totalFundingFeePaid"] == 12.5
    assert data["futuresSummary"]["liquidationCount"] == 1
    assert data["futuresSummary"]["maxMarginUsagePct"] == 80.0
