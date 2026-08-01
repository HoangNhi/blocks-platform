from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest

from tradelab_api.services.manual_signal_package import (
    MANUAL_SIGNAL_SAFETY_STATUS,
    ManualSignalPackageBlocked,
    build_manual_signal_package,
)


def test_build_manual_signal_package_derives_completed_run_evidence() -> None:
    run_id = uuid4()
    strategy_id = uuid4()
    version_id = uuid4()
    run = SimpleNamespace(
        id=run_id,
        strategy_id=strategy_id,
        strategy_version_id=version_id,
        status="completed",
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        start_at=datetime(2026, 1, 1, tzinfo=UTC),
        end_at=datetime(2026, 1, 31, tzinfo=UTC),
        runtime_config={"fee_bps": 5, "slippage_bps": 2},
        risk_config={"maxOrderPercent": 10, "maxDrawdownPercent": 15},
    )
    result = SimpleNamespace(
        total_return_pct=Decimal("12.5"),
        max_drawdown_pct=Decimal("4.2"),
        profit_factor=Decimal("1.8"),
        win_rate_pct=Decimal("54.5"),
    )
    analysis = SimpleNamespace(
        trade_summary=SimpleNamespace(total_trades=24, closed_trades=24, open_trades=0),
        dataset_context=SimpleNamespace(dataset_key="binance:BTCUSDT:1h"),
        trades=[SimpleNamespace(status="closed", entry_reason="sma_cross", exit_reason="take_profit")],
    )

    package = build_manual_signal_package(run=run, result=result, analysis=analysis, strategy_name="Breakout Lab")

    assert package["sourceRunId"] == str(run_id)
    assert package["strategyId"] == str(strategy_id)
    assert package["strategyVersionId"] == str(version_id)
    assert package["strategyName"] == "Breakout Lab"
    assert package["action"] == "watch"
    assert (
        package["entryRule"]
        == "Use the strategy setup from completed run evidence; place manually only after current market matches the setup."
    )
    assert package["stopRule"] == "Use configured risk guard before placing any manual order."
    assert package["positionSizingRule"] == "Risk config maxOrderPercent=10; confirm account size manually before trading."
    assert package["sourceMetrics"]["totalReturnPct"] == "12.5"
    assert package["sourceTradeSummary"]["totalTrades"] == 24
    assert package["datasetEvidence"]["datasetKey"] == "binance:BTCUSDT:1h"
    assert package["robustnessEvidenceStatus"] == "not_available"
    assert package["liveReadinessStatus"] == "manual_handoff_only"
    assert package["safetyStatus"] == MANUAL_SIGNAL_SAFETY_STATUS
    assert "manual handoff only" in package["markdown"].lower()


def test_build_manual_signal_package_blocks_non_completed_run() -> None:
    run = SimpleNamespace(id=uuid4(), status="failed")
    with pytest.raises(ManualSignalPackageBlocked) as exc:
        build_manual_signal_package(run=run, result=None, analysis=None, strategy_name="Failed")
    assert exc.value.reason_code == "manual_signal_run_not_completed"


def test_build_manual_signal_package_warns_when_evidence_is_weak() -> None:
    run = SimpleNamespace(
        id=uuid4(),
        strategy_id=uuid4(),
        strategy_version_id=uuid4(),
        status="completed",
        exchange="binance",
        symbol="ETHUSDT",
        timeframe="1h",
        start_at=datetime(2026, 1, 1, tzinfo=UTC),
        end_at=datetime(2026, 1, 2, tzinfo=UTC),
        runtime_config={},
        risk_config={},
    )
    result = SimpleNamespace(
        total_return_pct=Decimal("3"),
        max_drawdown_pct=Decimal("18"),
        profit_factor=None,
        win_rate_pct=None,
    )
    analysis = SimpleNamespace(
        trade_summary=SimpleNamespace(total_trades=2, closed_trades=2, open_trades=0),
        dataset_context=SimpleNamespace(dataset_key="binance:ETHUSDT:1h"),
        trades=[],
    )

    package = build_manual_signal_package(run=run, result=result, analysis=analysis, strategy_name="Weak Evidence")

    assert "low_trade_count" in package["warnings"]
    assert "high_drawdown" in package["warnings"]
    assert "missing_fee_or_slippage_assumption" in package["warnings"]
    assert package["liveReadinessStatus"] == "manual_handoff_only"


def test_manual_signal_package_does_not_expose_forbidden_exchange_fields() -> None:
    run = SimpleNamespace(
        id=uuid4(),
        strategy_id=uuid4(),
        strategy_version_id=uuid4(),
        status="completed",
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        start_at=datetime(2026, 1, 1, tzinfo=UTC),
        end_at=datetime(2026, 1, 31, tzinfo=UTC),
        runtime_config={"fee_bps": 1, "slippage_bps": 1},
        risk_config={"maxOrderPercent": 5},
    )
    analysis = SimpleNamespace(
        trade_summary=SimpleNamespace(total_trades=30, closed_trades=30, open_trades=0),
        dataset_context=SimpleNamespace(dataset_key="binance:BTCUSDT:1h"),
        trades=[],
    )

    package_text = str(build_manual_signal_package(run=run, result=None, analysis=analysis, strategy_name="Safe"))

    assert "apiSecret" not in package_text
    assert "private_key" not in package_text
    assert "Submit order" not in package_text
    assert "testnetOrder" not in package_text
