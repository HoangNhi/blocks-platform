from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import NAMESPACE_URL, uuid5

RESEARCH_ROBUSTNESS_SAFETY_STATUS = "research_robustness_gate_only"

MIN_TRADES_WARN = 10
MIN_TRADES_PASS = 30
MAX_DRAWDOWN_PASS = Decimal("15")
MAX_DRAWDOWN_WARN = Decimal("25")
STRESS_FEE_BPS = Decimal("10")
STRESS_SLIPPAGE_BPS = Decimal("5")


class ResearchRobustnessGateBlocked(ValueError):
    def __init__(self, reason_code: str, message: str) -> None:
        super().__init__(message)
        self.reason_code = reason_code


def build_research_robustness_gate(*, run: Any, result: Any | None, analysis: Any | None, strategy_name: str) -> dict[str, Any]:
    if run is None:
        raise ResearchRobustnessGateBlocked("research_robustness_run_not_found", "Bot run not found.")
    if getattr(run, "status", None) != "completed":
        raise ResearchRobustnessGateBlocked(
            "research_robustness_run_not_completed",
            "Research robustness gate requires a completed run.",
        )
    if analysis is None:
        raise ResearchRobustnessGateBlocked(
            "research_robustness_analysis_missing",
            "Research robustness gate requires run analysis evidence.",
        )

    generated_at = datetime.now(UTC)
    runtime_config = _dict(getattr(run, "runtime_config", {}))
    trade_summary = getattr(analysis, "trade_summary", None)
    dataset_context = getattr(analysis, "dataset_context", None)
    trades = _closed_trades(analysis)
    gates = {
        "outOfSample": _out_of_sample_gate(trades),
        "feeSlippageStress": _fee_slippage_gate(result=result, trades=trades, runtime_config=runtime_config),
        "drawdown": _drawdown_gate(result),
        "tradeCount": _trade_count_gate(int(getattr(trade_summary, "total_trades", 0) or 0)),
        "parameterSensitivity": _parameter_sensitivity_gate(runtime_config),
    }
    warnings = _warnings(gates)
    candidate_label = _candidate_label(gates)
    gate_id = str(uuid5(NAMESPACE_URL, f"tradelab:research-robustness:{getattr(run, 'id')}:{generated_at.isoformat()}"))

    return {
        "robustnessGateId": gate_id,
        "sourceRunId": str(getattr(run, "id")),
        "strategyId": str(getattr(run, "strategy_id")),
        "strategyVersionId": str(getattr(run, "strategy_version_id")),
        "strategyName": strategy_name,
        "exchange": str(getattr(run, "exchange", "")),
        "symbol": str(getattr(run, "symbol", "")),
        "timeframe": str(getattr(run, "timeframe", "")),
        "datasetKey": getattr(dataset_context, "dataset_key", None),
        "generatedAt": generated_at.isoformat(),
        "candidateLabel": candidate_label,
        "liveReadinessStatus": "not_live_ready",
        "safetyStatus": RESEARCH_ROBUSTNESS_SAFETY_STATUS,
        "gates": gates,
        "warnings": warnings,
        "limitations": [
            "Research evidence only. This is not live trading readiness.",
            "Parameter sensitivity requires dedicated rerun evidence before stronger labels.",
        ],
        "sourceMetrics": _source_metrics(result),
        "sourceTradeSummary": _trade_summary(trade_summary),
    }


def _dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def _decimal_text(value: Any) -> str | None:
    number = _decimal(value)
    return None if number is None else str(number)


def _closed_trades(analysis: Any) -> list[Any]:
    return [trade for trade in list(getattr(analysis, "trades", []) or []) if getattr(trade, "status", None) == "closed"]


def _pnl(trade: Any) -> Decimal:
    return _decimal(getattr(trade, "pnl", None)) or Decimal("0")


def _out_of_sample_gate(trades: list[Any]) -> dict[str, Any]:
    if len(trades) < MIN_TRADES_WARN:
        return _gate("fail", "out_of_sample_trade_count_too_low", "Need at least 10 closed trades for split evidence.")
    split_index = max(1, int(len(trades) * Decimal("0.7")))
    in_sample = trades[:split_index]
    out_of_sample = trades[split_index:]
    if not out_of_sample:
        return _gate("warn", "out_of_sample_split_missing", "No out-of-sample segment could be derived.")
    in_sample_pnl = sum((_pnl(trade) for trade in in_sample), Decimal("0"))
    out_sample_pnl = sum((_pnl(trade) for trade in out_of_sample), Decimal("0"))
    status = "pass" if out_sample_pnl >= Decimal("0") else "fail"
    reason = "out_of_sample_non_negative" if status == "pass" else "out_of_sample_negative"
    return {
        **_gate(status, reason, "70/30 closed-trade split derived from completed run evidence."),
        "splitMethod": "closed_trade_order_70_30",
        "inSampleTrades": len(in_sample),
        "outOfSampleTrades": len(out_of_sample),
        "inSamplePnl": str(in_sample_pnl),
        "outOfSamplePnl": str(out_sample_pnl),
    }


def _fee_slippage_gate(*, result: Any | None, trades: list[Any], runtime_config: dict[str, Any]) -> dict[str, Any]:
    base_fee = _decimal(runtime_config.get("fee_bps") or runtime_config.get("feeBps")) or Decimal("0")
    base_slippage = _decimal(runtime_config.get("slippage_bps") or runtime_config.get("slippageBps")) or Decimal("0")
    extra_cost_bps = max(Decimal("0"), STRESS_FEE_BPS - base_fee) + max(Decimal("0"), STRESS_SLIPPAGE_BPS - base_slippage)
    total_return = _decimal(getattr(result, "total_return_pct", None))
    closed_count = Decimal(len(trades))
    stress_penalty_pct = (extra_cost_bps * closed_count) / Decimal("100")
    stressed_return = None if total_return is None else total_return - stress_penalty_pct
    if stressed_return is None:
        return _gate("warn", "fee_slippage_source_return_missing", "Source return is missing.")
    status = "pass" if stressed_return >= Decimal("0") else "fail"
    return {
        **_gate(
            status,
            "fee_slippage_stress_non_negative" if status == "pass" else "fee_slippage_stress_negative",
            "Stress applies 10 bps fee and 5 bps slippage defaults.",
        ),
        "baseFeeBps": str(base_fee),
        "baseSlippageBps": str(base_slippage),
        "stressFeeBps": str(STRESS_FEE_BPS),
        "stressSlippageBps": str(STRESS_SLIPPAGE_BPS),
        "stressedReturnPct": str(stressed_return),
    }


def _drawdown_gate(result: Any | None) -> dict[str, Any]:
    drawdown = _decimal(getattr(result, "max_drawdown_pct", None))
    if drawdown is None:
        return _gate("warn", "drawdown_missing", "Max drawdown evidence is missing.")
    if drawdown <= MAX_DRAWDOWN_PASS:
        status = "pass"
        reason = "drawdown_within_limit"
    elif drawdown <= MAX_DRAWDOWN_WARN:
        status = "warn"
        reason = "drawdown_elevated"
    else:
        status = "fail"
        reason = "drawdown_above_limit"
    return {**_gate(status, reason, "Drawdown threshold uses 15 percent pass and 25 percent fail bands."), "maxDrawdownPct": str(drawdown)}


def _trade_count_gate(total_trades: int) -> dict[str, Any]:
    if total_trades >= MIN_TRADES_PASS:
        status = "pass"
        reason = "trade_count_sufficient"
    elif total_trades >= MIN_TRADES_WARN:
        status = "warn"
        reason = "trade_count_watch"
    else:
        status = "fail"
        reason = "trade_count_below_minimum"
    return {
        **_gate(status, reason, "Trade count threshold uses 30 pass and 10 fail bands."),
        "totalTrades": total_trades,
        "minimumTrades": MIN_TRADES_WARN,
        "preferredTrades": MIN_TRADES_PASS,
    }


def _parameter_sensitivity_gate(runtime_config: dict[str, Any]) -> dict[str, Any]:
    parameters = {key: value for key, value in runtime_config.items() if key.lower().endswith("period") and _decimal(value) is not None}
    if not parameters:
        return _gate("warn", "parameter_sensitivity_inputs_missing", "No safe numeric period parameters were found.")
    return {
        **_gate("warn", "parameter_sensitivity_requires_rerun_evidence", "Parameter rerun evidence is required before stronger candidate labels."),
        "parameters": parameters,
        "perturbationPlan": {key: [str(_decimal(value) - Decimal("1")), str(_decimal(value) + Decimal("1"))] for key, value in parameters.items()},
    }


def _gate(status: str, reason_code: str, summary: str) -> dict[str, Any]:
    return {"status": status, "reasonCode": reason_code, "summary": summary}


def _warnings(gates: dict[str, dict[str, Any]]) -> list[str]:
    return [gate["reasonCode"] for gate in gates.values() if gate["status"] in {"warn", "fail"}]


def _candidate_label(gates: dict[str, dict[str, Any]]) -> str:
    statuses = [gate["status"] for gate in gates.values()]
    if "fail" in statuses:
        return "not_candidate"
    if statuses.count("pass") >= 3:
        return "research_candidate"
    return "insufficient_evidence"


def _source_metrics(result: Any | None) -> dict[str, Any]:
    return {
        "totalReturnPct": _decimal_text(getattr(result, "total_return_pct", None)),
        "maxDrawdownPct": _decimal_text(getattr(result, "max_drawdown_pct", None)),
        "profitFactor": _decimal_text(getattr(result, "profit_factor", None)),
        "winRatePct": _decimal_text(getattr(result, "win_rate_pct", None)),
    }


def _trade_summary(summary: Any | None) -> dict[str, Any]:
    return {
        "totalTrades": int(getattr(summary, "total_trades", 0) or 0),
        "closedTrades": int(getattr(summary, "closed_trades", 0) or 0),
        "openTrades": int(getattr(summary, "open_trades", 0) or 0),
    }
