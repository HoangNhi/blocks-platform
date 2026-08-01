from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest

from tradelab_api.services.execution_journal import (
    ASSISTED_LIVE_EXECUTION_JOURNAL_SAFETY_STATUS,
    ExecutionJournalBlocked,
    JournalFillInput,
    build_assisted_live_planned_snapshot,
    build_planned_snapshot,
    derive_comparison_summary,
    validate_manual_entry_request,
)


def _run(status: str = "completed") -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        strategy_id=uuid4(),
        strategy_version_id=uuid4(),
        status=status,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        start_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        end_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
        dataset_context={"datasetKey": "binance:BTCUSDT:1h"},
        runtime_config={"initialEquity": 1000},
        risk_config={"maxOrderPercent": 10},
    )


def test_validate_manual_entry_request_blocks_non_completed_run() -> None:
    with pytest.raises(ExecutionJournalBlocked) as exc_info:
        validate_manual_entry_request(_run(status="queued"), confirm_manual_entry_only=True)

    assert exc_info.value.reason_code == "execution_journal_run_not_completed"


def test_validate_manual_entry_request_requires_confirmation() -> None:
    with pytest.raises(ExecutionJournalBlocked) as exc_info:
        validate_manual_entry_request(_run(), confirm_manual_entry_only=False)

    assert exc_info.value.reason_code == "execution_journal_confirmation_required"


def test_build_planned_snapshot_captures_run_context() -> None:
    snapshot = build_planned_snapshot(_run(), planned_snapshot={"entryRule": "Breakout"})

    assert snapshot["sourceRunId"]
    assert snapshot["datasetKey"] == "binance:BTCUSDT:1h"
    assert snapshot["entryRule"] == "Breakout"
    assert snapshot["safetyStatus"] == "manual_execution_journal_only"


def test_build_assisted_live_planned_snapshot_uses_observed_evidence_status() -> None:
    run = _run()
    intent = SimpleNamespace(
        id=uuid4(),
        client_order_id="tl-live-123",
        exchange_order_id="62888061086",
        status="filled",
        exchange_order_status="FILLED",
    )

    snapshot = build_assisted_live_planned_snapshot(
        run,
        intent=intent,
        evidence={"exchangeOrderStatus": "FILLED"},
    )

    assert snapshot["source"] == "assisted_live_order"
    assert snapshot["liveOrderIntentId"] == str(intent.id)
    assert snapshot["safetyStatus"] == ASSISTED_LIVE_EXECUTION_JOURNAL_SAFETY_STATUS
    assert snapshot["safetyStatus"] == "observed_execution_evidence_only"


def test_derive_comparison_summary_handles_partial_fills_and_fees() -> None:
    fills = [
        JournalFillInput(fill_role="entry", side="buy", price=Decimal("100"), quantity=Decimal("1"), fee=Decimal("0.10")),
        JournalFillInput(fill_role="entry", side="buy", price=Decimal("110"), quantity=Decimal("1"), fee=Decimal("0.10")),
        JournalFillInput(fill_role="exit", side="sell", price=Decimal("130"), quantity=Decimal("2"), fee=Decimal("0.20")),
    ]

    summary = derive_comparison_summary(
        side="long",
        planned_snapshot={"plannedEntryPrice": 100, "plannedRiskPerUnit": 10},
        fills=fills,
        discipline_status="followed_plan",
    )

    assert summary["averageEntryPrice"] == 105.0
    assert summary["averageExitPrice"] == 130.0
    assert summary["totalFees"] == 0.4
    assert summary["realizedGrossPnl"] == 50.0
    assert summary["realizedNetPnl"] == 49.6
    assert summary["slippageBps"] == 500.0
    assert summary["rMultiple"] == 2.5
    assert summary["outcomeStatus"] == "win"


def test_derive_comparison_summary_marks_open_without_exit() -> None:
    summary = derive_comparison_summary(
        side="long",
        planned_snapshot={},
        fills=[JournalFillInput(fill_role="entry", side="buy", price=Decimal("100"), quantity=Decimal("1"), fee=None)],
        discipline_status="not_recorded",
    )

    assert summary["outcomeStatus"] == "open"
    assert summary["averageExitPrice"] is None
