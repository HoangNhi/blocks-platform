from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any

MANUAL_EXECUTION_JOURNAL_SAFETY_STATUS = "manual_execution_journal_only"
OBSERVED_EXECUTION_EVIDENCE_STATUS = "observed_execution_evidence_only"
ASSISTED_TESTNET_EXECUTION_JOURNAL_SAFETY_STATUS = OBSERVED_EXECUTION_EVIDENCE_STATUS
ASSISTED_LIVE_EXECUTION_JOURNAL_SAFETY_STATUS = OBSERVED_EXECUTION_EVIDENCE_STATUS
NOT_LIVE_READY_STATUS = "not_live_ready"

ALLOWED_ENTRY_SIDES = {"long", "short", "flat_or_watch"}
ALLOWED_FILL_ROLES = {"entry", "exit", "adjustment"}
ALLOWED_FILL_SIDES = {"buy", "sell"}
ALLOWED_DISCIPLINE_STATUSES = {"followed_plan", "partial_deviation", "broke_plan", "not_recorded"}


class ExecutionJournalBlocked(ValueError):
    def __init__(self, message: str, reason_code: str) -> None:
        super().__init__(message)
        self.reason_code = reason_code


@dataclass(frozen=True)
class JournalFillInput:
    fill_role: str
    side: str
    price: Decimal
    quantity: Decimal
    fee: Decimal | None = None


def validate_manual_entry_request(run: object, *, confirm_manual_entry_only: bool) -> None:
    if not confirm_manual_entry_only:
        raise ExecutionJournalBlocked(
            "Execution journal requires manual-entry-only confirmation.",
            "execution_journal_confirmation_required",
        )
    if getattr(run, "status", None) != "completed":
        raise ExecutionJournalBlocked(
            "Execution journal requires a completed source run.",
            "execution_journal_run_not_completed",
        )


def validate_fill(fill: JournalFillInput) -> None:
    if fill.fill_role not in ALLOWED_FILL_ROLES:
        raise ExecutionJournalBlocked("Fill role is not supported.", "execution_journal_invalid_fill")
    if fill.side not in ALLOWED_FILL_SIDES:
        raise ExecutionJournalBlocked("Fill side is not supported.", "execution_journal_invalid_fill")
    if fill.price <= 0 or fill.quantity <= 0:
        raise ExecutionJournalBlocked("Fill price and quantity must be positive.", "execution_journal_invalid_fill")
    if fill.fee is not None and fill.fee < 0:
        raise ExecutionJournalBlocked("Fill fee must be non-negative.", "execution_journal_invalid_fill")


def build_planned_snapshot(run: object, *, planned_snapshot: dict[str, Any] | None = None) -> dict[str, Any]:
    dataset_context = dict(getattr(run, "dataset_context", {}) or {})
    base = {
        "sourceRunId": str(getattr(run, "id")),
        "strategyId": _optional_str(getattr(run, "strategy_id", None)),
        "strategyVersionId": _optional_str(getattr(run, "strategy_version_id", None)),
        "exchange": getattr(run, "exchange", None),
        "symbol": getattr(run, "symbol", None),
        "timeframe": getattr(run, "timeframe", None),
        "datasetKey": dataset_context.get("datasetKey"),
        "runStartAt": _iso_or_none(getattr(run, "start_at", None)),
        "runEndAt": _iso_or_none(getattr(run, "end_at", None)),
        "runtimeConfig": dict(getattr(run, "runtime_config", {}) or {}),
        "riskConfig": dict(getattr(run, "risk_config", {}) or {}),
        "safetyStatus": MANUAL_EXECUTION_JOURNAL_SAFETY_STATUS,
        "liveReadinessStatus": NOT_LIVE_READY_STATUS,
    }
    base.update(planned_snapshot or {})
    return base

def build_assisted_testnet_planned_snapshot(run: object, *, intent: object, evidence: dict[str, Any]) -> dict[str, Any]:
    return build_planned_snapshot(
        run,
        planned_snapshot={
            "source": "assisted_testnet_order",
            "testnetOrderIntentId": str(getattr(intent, "id")),
            "clientOrderId": getattr(intent, "client_order_id", None),
            "exchangeOrderId": getattr(intent, "exchange_order_id", None),
            "testnetOrderStatus": getattr(intent, "status", None),
            "testnetExchangeStatus": getattr(intent, "exchange_order_status", None),
            "evidence": evidence,
            "safetyStatus": ASSISTED_TESTNET_EXECUTION_JOURNAL_SAFETY_STATUS,
            "liveReadinessStatus": NOT_LIVE_READY_STATUS,
        },
    )


def build_assisted_live_planned_snapshot(run: object, *, intent: object, evidence: dict[str, Any]) -> dict[str, Any]:
    return build_planned_snapshot(
        run,
        planned_snapshot={
            "source": "assisted_live_order",
            "liveOrderIntentId": str(getattr(intent, "id")),
            "clientOrderId": getattr(intent, "client_order_id", None),
            "exchangeOrderId": getattr(intent, "exchange_order_id", None),
            "liveOrderStatus": getattr(intent, "status", None),
            "liveExchangeStatus": getattr(intent, "exchange_order_status", None),
            "evidence": evidence,
            "safetyStatus": ASSISTED_LIVE_EXECUTION_JOURNAL_SAFETY_STATUS,
            "liveReadinessStatus": NOT_LIVE_READY_STATUS,
        },
    )


def derive_comparison_summary(
    *,
    side: str,
    planned_snapshot: dict[str, Any],
    fills: list[JournalFillInput],
    discipline_status: str,
) -> dict[str, Any]:
    for fill in fills:
        validate_fill(fill)
    if side not in ALLOWED_ENTRY_SIDES:
        raise ExecutionJournalBlocked("Journal side is not supported.", "execution_journal_invalid_fill")
    if discipline_status not in ALLOWED_DISCIPLINE_STATUSES:
        raise ExecutionJournalBlocked("Discipline status is not supported.", "execution_journal_invalid_fill")

    entry_fills = [fill for fill in fills if fill.fill_role == "entry"]
    exit_fills = [fill for fill in fills if fill.fill_role == "exit"]
    total_fees = sum((fill.fee or Decimal("0")) for fill in fills)
    entry_quantity = sum(fill.quantity for fill in entry_fills)
    exit_quantity = sum(fill.quantity for fill in exit_fills)
    average_entry = _weighted_average(entry_fills)
    average_exit = _weighted_average(exit_fills)

    gross_pnl: Decimal | None = None
    net_pnl: Decimal | None = None
    if average_entry is not None and average_exit is not None and exit_quantity > 0:
        direction = Decimal("1") if side == "long" else Decimal("-1")
        gross_pnl = (average_exit - average_entry) * exit_quantity * direction
        net_pnl = gross_pnl - total_fees

    planned_entry = _decimal_or_none(planned_snapshot.get("plannedEntryPrice"))
    planned_risk = _decimal_or_none(planned_snapshot.get("plannedRiskPerUnit"))
    slippage_bps = None
    if average_entry is not None and planned_entry is not None and planned_entry > 0:
        slippage_bps = ((average_entry - planned_entry) / planned_entry) * Decimal("10000")

    r_multiple = None
    if gross_pnl is not None and planned_risk is not None and planned_risk > 0 and exit_quantity > 0:
        r_multiple = gross_pnl / (planned_risk * exit_quantity)

    outcome_status = _outcome_status(gross_pnl=gross_pnl, has_entry=entry_quantity > 0, has_exit=exit_quantity > 0)
    return {
        "averageEntryPrice": _float_or_none(average_entry),
        "averageExitPrice": _float_or_none(average_exit),
        "entryQuantity": _float(entry_quantity),
        "exitQuantity": _float(exit_quantity),
        "totalFees": _float(total_fees),
        "realizedGrossPnl": _float_or_none(gross_pnl),
        "realizedNetPnl": _float_or_none(net_pnl),
        "slippageBps": _float_or_none(slippage_bps),
        "rMultiple": _float_or_none(r_multiple),
        "disciplineStatus": discipline_status,
        "outcomeStatus": outcome_status,
        "safetyStatus": OBSERVED_EXECUTION_EVIDENCE_STATUS,
        "liveReadinessStatus": NOT_LIVE_READY_STATUS,
    }


def _weighted_average(fills: list[JournalFillInput]) -> Decimal | None:
    quantity = sum(fill.quantity for fill in fills)
    if quantity <= 0:
        return None
    notional = sum(fill.price * fill.quantity for fill in fills)
    return notional / quantity


def _decimal_or_none(value: object) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def _float(value: Decimal) -> float:
    return float(value)


def _float_or_none(value: Decimal | None) -> float | None:
    return None if value is None else float(value)


def _outcome_status(*, gross_pnl: Decimal | None, has_entry: bool, has_exit: bool) -> str:
    if not has_entry:
        return "incomplete"
    if not has_exit:
        return "open"
    if gross_pnl is None:
        return "incomplete"
    if gross_pnl > 0:
        return "win"
    if gross_pnl < 0:
        return "loss"
    return "breakeven"


def _optional_str(value: object) -> str | None:
    return str(value) if value is not None else None


def _iso_or_none(value: object) -> str | None:
    isoformat = getattr(value, "isoformat", None)
    return isoformat() if callable(isoformat) else None
