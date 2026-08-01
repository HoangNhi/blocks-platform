from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import NAMESPACE_URL, uuid5

MANUAL_SIGNAL_SAFETY_STATUS = "manual_live_signal_handoff_only"


class ManualSignalPackageBlocked(ValueError):
    def __init__(self, reason_code: str, message: str) -> None:
        super().__init__(message)
        self.reason_code = reason_code


def build_manual_signal_package(*, run: Any, result: Any | None, analysis: Any | None, strategy_name: str) -> dict[str, Any]:
    if run is None:
        raise ManualSignalPackageBlocked("manual_signal_run_not_found", "Bot run not found.")
    if getattr(run, "status", None) != "completed":
        raise ManualSignalPackageBlocked("manual_signal_run_not_completed", "Manual signal package requires a completed run.")
    if analysis is None:
        raise ManualSignalPackageBlocked("manual_signal_analysis_missing", "Manual signal package requires run analysis evidence.")

    generated_at = datetime.now(UTC)
    runtime_config = _dict(getattr(run, "runtime_config", {}))
    risk_config = _dict(getattr(run, "risk_config", {}))
    trade_summary = getattr(analysis, "trade_summary", None)
    dataset_context = getattr(analysis, "dataset_context", None)
    total_trades = int(getattr(trade_summary, "total_trades", 0) or 0)
    max_drawdown = _decimal_text(getattr(result, "max_drawdown_pct", None))
    warnings = _build_warnings(total_trades=total_trades, max_drawdown=max_drawdown, runtime_config=runtime_config)
    signal_package_id = str(uuid5(NAMESPACE_URL, f"tradelab:manual-signal:{getattr(run, 'id')}:{generated_at.isoformat()}"))

    package = {
        "signalPackageId": signal_package_id,
        "sourceRunId": str(getattr(run, "id")),
        "strategyId": str(getattr(run, "strategy_id")),
        "strategyVersionId": str(getattr(run, "strategy_version_id")),
        "strategyName": strategy_name,
        "exchange": str(getattr(run, "exchange", "")),
        "symbol": str(getattr(run, "symbol", "")),
        "timeframe": str(getattr(run, "timeframe", "")),
        "datasetKey": getattr(dataset_context, "dataset_key", None),
        "runStartAt": _iso(getattr(run, "start_at", None)),
        "runEndAt": _iso(getattr(run, "end_at", None)),
        "generatedAt": generated_at.isoformat(),
        "action": "watch",
        "entryRule": "Use the strategy setup from completed run evidence; place manually only after current market matches the setup.",
        "stopRule": "Use configured risk guard before placing any manual order.",
        "takeProfitRule": None,
        "exitRule": _exit_rule(analysis),
        "positionSizingRule": _position_sizing_rule(risk_config),
        "maxRiskPerTrade": _risk_text(risk_config),
        "invalidationRule": "Do not trade if current market, timeframe, or risk context differs from the completed backtest evidence.",
        "manualExecutionNotes": [
            "Manual handoff only. TradeLab does not submit orders in Phase 15.",
            "Confirm current price, liquidity, fees, account size, and exchange rules outside TradeLab before trading.",
        ],
        "limitations": [
            "Backtest evidence is historical and does not guarantee future results.",
            "Phase 16 robustness gates are not available yet.",
        ],
        "warnings": warnings,
        "sourceMetrics": _source_metrics(result),
        "sourceTradeSummary": _trade_summary(trade_summary),
        "datasetEvidence": _dataset_evidence(dataset_context),
        "riskEvidence": risk_config,
        "robustnessEvidenceStatus": "not_available",
        "liveReadinessStatus": "manual_handoff_only",
        "safetyStatus": MANUAL_SIGNAL_SAFETY_STATUS,
    }
    package["markdown"] = _build_markdown(package)
    return package


def _dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _iso(value: Any) -> str:
    return value.isoformat() if hasattr(value, "isoformat") else ""


def _decimal_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return str(value)
    return str(value)


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


def _dataset_evidence(dataset_context: Any | None) -> dict[str, Any]:
    return {"datasetKey": getattr(dataset_context, "dataset_key", None)}


def _position_sizing_rule(risk_config: dict[str, Any]) -> str:
    max_order = risk_config.get("maxOrderPercent") or risk_config.get("max_order_percent")
    if max_order is None:
        return "No max order percent found in risk config; size manually before trading."
    return f"Risk config maxOrderPercent={max_order}; confirm account size manually before trading."


def _risk_text(risk_config: dict[str, Any]) -> str | None:
    value = risk_config.get("maxOrderPercent") or risk_config.get("max_order_percent")
    return str(value) if value is not None else None


def _exit_rule(analysis: Any) -> str:
    trades = list(getattr(analysis, "trades", []) or [])
    for trade in reversed(trades):
        reason = getattr(trade, "exit_reason", None)
        if reason:
            return f"Use strategy exit evidence from last closed trade: {reason}."
    return "Use the strategy exit rule from the completed run snapshot; do not improvise exit handling."


def _build_warnings(*, total_trades: int, max_drawdown: str | None, runtime_config: dict[str, Any]) -> list[str]:
    warnings = ["historical_backtest_only", "robustness_not_available"]
    if total_trades < 20:
        warnings.append("low_trade_count")
    if max_drawdown is not None and Decimal(max_drawdown) >= Decimal("15"):
        warnings.append("high_drawdown")
    if not (runtime_config.get("fee_bps") or runtime_config.get("feeBps")) or not (
        runtime_config.get("slippage_bps") or runtime_config.get("slippageBps")
    ):
        warnings.append("missing_fee_or_slippage_assumption")
    return warnings


def _build_markdown(package: dict[str, Any]) -> str:
    lines = [
        "# TradeLab Manual Signal Handoff",
        "",
        f"Safety: {package['safetyStatus']}",
        "This is manual handoff only. TradeLab does not submit orders in Phase 15.",
        "",
        f"Strategy: {package['strategyName']}",
        f"Run: {package['sourceRunId']}",
        f"Market: {package['exchange']} {package['symbol']} {package['timeframe']}",
        f"Dataset: {package.get('datasetKey') or 'N/A'}",
        "",
        f"Action: {package['action']}",
        f"Entry: {package['entryRule']}",
        f"Stop: {package['stopRule']}",
        f"Exit: {package['exitRule']}",
        f"Sizing: {package['positionSizingRule']}",
        f"Invalidation: {package['invalidationRule']}",
        "",
        "Warnings:",
        *[f"- {warning}" for warning in package["warnings"]],
    ]
    return "\n".join(lines)
