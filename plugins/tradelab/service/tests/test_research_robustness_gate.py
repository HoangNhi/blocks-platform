from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest

from tradelab_api.services.research_robustness_gate import (
    RESEARCH_ROBUSTNESS_SAFETY_STATUS,
    ResearchRobustnessGateBlocked,
    build_research_robustness_gate,
)


def _run(*, status: str = "completed", runtime_config: dict[str, object] | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        strategy_id=uuid4(),
        strategy_version_id=uuid4(),
        status=status,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        start_at=datetime(2026, 1, 1, tzinfo=UTC),
        end_at=datetime(2026, 1, 31, tzinfo=UTC),
        runtime_config=runtime_config or {"fee_bps": 5, "slippage_bps": 2, "fastPeriod": 9, "slowPeriod": 21},
        risk_config={"maxOrderPercent": 10},
    )


def _result() -> SimpleNamespace:
    return SimpleNamespace(
        total_return_pct=Decimal("14.5"),
        max_drawdown_pct=Decimal("6.5"),
        profit_factor=Decimal("1.9"),
        win_rate_pct=Decimal("55.0"),
    )


def _analysis(total_trades: int = 36, pnl: Decimal = Decimal("12")) -> SimpleNamespace:
    trades = [
        SimpleNamespace(
            id=str(index),
            status="closed",
            pnl=pnl,
            entry_time=datetime(2026, 1, 1 + min(index, 27), tzinfo=UTC),
            exit_time=datetime(2026, 1, 1 + min(index, 27), 1, tzinfo=UTC),
        )
        for index in range(total_trades)
    ]
    return SimpleNamespace(
        trade_summary=SimpleNamespace(total_trades=total_trades, closed_trades=total_trades, open_trades=0),
        dataset_context=SimpleNamespace(dataset_key="binance:BTCUSDT:1h"),
        trades=trades,
    )


def test_build_research_robustness_gate_returns_conservative_candidate_evidence() -> None:
    gate = build_research_robustness_gate(run=_run(), result=_result(), analysis=_analysis(), strategy_name="Baseline SMA")

    assert gate["sourceRunId"]
    assert gate["strategyName"] == "Baseline SMA"
    assert gate["candidateLabel"] == "research_candidate"
    assert gate["safetyStatus"] == RESEARCH_ROBUSTNESS_SAFETY_STATUS
    assert gate["liveReadinessStatus"] == "not_live_ready"
    assert gate["gates"]["tradeCount"]["status"] == "pass"
    assert gate["gates"]["drawdown"]["status"] == "pass"
    assert gate["gates"]["feeSlippageStress"]["status"] == "pass"
    assert gate["gates"]["outOfSample"]["status"] in {"pass", "warn"}
    assert gate["gates"]["parameterSensitivity"]["status"] == "warn"
    assert "parameter_sensitivity_requires_rerun_evidence" in gate["warnings"]
    assert gate["candidateLabel"] != "live_ready"


def test_build_research_robustness_gate_marks_low_trade_count_not_candidate() -> None:
    gate = build_research_robustness_gate(run=_run(), result=_result(), analysis=_analysis(total_trades=4), strategy_name="Thin")

    assert gate["candidateLabel"] == "not_candidate"
    assert gate["gates"]["tradeCount"]["status"] == "fail"
    assert gate["gates"]["tradeCount"]["reasonCode"] == "trade_count_below_minimum"


def test_build_research_robustness_gate_warns_when_parameter_inputs_are_not_safe() -> None:
    gate = build_research_robustness_gate(
        run=_run(runtime_config={"fee_bps": 5, "slippage_bps": 2}),
        result=_result(),
        analysis=_analysis(),
        strategy_name="No Params",
    )

    assert gate["gates"]["parameterSensitivity"]["status"] == "warn"
    assert gate["gates"]["parameterSensitivity"]["reasonCode"] == "parameter_sensitivity_inputs_missing"


def test_build_research_robustness_gate_blocks_non_completed_run() -> None:
    with pytest.raises(ResearchRobustnessGateBlocked) as exc:
        build_research_robustness_gate(run=_run(status="running"), result=None, analysis=None, strategy_name="Open")

    assert exc.value.reason_code == "research_robustness_run_not_completed"


def test_research_robustness_gate_does_not_expose_forbidden_exchange_fields() -> None:
    package_text = str(build_research_robustness_gate(run=_run(), result=_result(), analysis=_analysis(), strategy_name="Safe"))

    assert "apiSecret" not in package_text
    assert "private_key" not in package_text
    assert "Submit order" not in package_text
    assert "testnetOrder" not in package_text
