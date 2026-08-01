from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest

from tradelab_api.services.testnet_order_journal_projection import (
    TestnetOrderJournalProjectionRequestData,
    project_testnet_order_to_journal,
)


def _request(confirm: bool = True) -> TestnetOrderJournalProjectionRequestData:
    return TestnetOrderJournalProjectionRequestData(
        order_id=uuid4(),
        confirm_testnet_journal_projection=confirm,
        source="strategy_lab",
        actor="local-user",
    )


class FakeOrderRepository:
    def __init__(self, status: str = "filled", exchange_status: str = "FILLED") -> None:
        self.intent = SimpleNamespace(
            id=uuid4(),
            strategy_id=uuid4(),
            strategy_version_id=uuid4(),
            source_run_id=uuid4(),
            latest_preview_id=uuid4(),
            status=status,
            status_reason_code=None,
            client_order_id="client-order-1",
            exchange_order_id="exchange-1",
            exchange_order_status=exchange_status,
            symbol="BTCUSDT",
            side="buy",
            quantity=Decimal("1"),
            quote_quantity=None,
            metadata_={},
            journal_entry_id=None,
        )
        self.events: list[dict[str, object]] = []

    def get_intent(self, intent_id, *, active_only: bool = True):
        return self.intent

    def mark_journal_projected(self, intent, *, journal_entry_id, reason_code: str, actor: str):
        intent.status = "journal_projected"
        intent.status_reason_code = reason_code
        intent.journal_entry_id = journal_entry_id
        return intent

    def add_event(self, **kwargs):
        event = SimpleNamespace(id=uuid4(), **kwargs)
        self.events.append(kwargs)
        return event


class FakeJournalRepository:
    def __init__(self) -> None:
        self.entries: list[dict[str, object]] = []

    def create_entry(self, **kwargs):
        entry = SimpleNamespace(id=uuid4(), **kwargs)
        self.entries.append(kwargs)
        return entry


class FakeRunRepository:
    def __init__(self, status: str = "completed") -> None:
        self.status = status

    def get_run(self, run_id):
        return SimpleNamespace(
            id=run_id,
            strategy_id=uuid4(),
            strategy_version_id=uuid4(),
            status=self.status,
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            start_at=None,
            end_at=None,
            dataset_context={"datasetKey": "binance:BTCUSDT:1h"},
            runtime_config={},
            risk_config={},
        )


def test_projection_blocks_without_confirmation() -> None:
    result = project_testnet_order_to_journal(
        order_repository=FakeOrderRepository(),
        journal_repository=FakeJournalRepository(),
        run_repository=FakeRunRepository(),
        request=_request(confirm=False),
    )

    assert result.status == "blocked"
    assert result.reason_code == "testnet_order_journal_projection_confirm_required"


@pytest.mark.parametrize("status", ["submitted", "partially_filled", "unknown", "reconciliation_required", "cancel_requested"])
def test_projection_blocks_non_terminal_status(status: str) -> None:
    result = project_testnet_order_to_journal(
        order_repository=FakeOrderRepository(status=status),
        journal_repository=FakeJournalRepository(),
        run_repository=FakeRunRepository(),
        request=_request(),
    )

    assert result.status == "blocked"
    assert result.reason_code == "testnet_order_journal_projection_non_terminal"


def test_projection_creates_journal_entry_and_marks_order_projected() -> None:
    order_repository = FakeOrderRepository(status="filled", exchange_status="FILLED")
    journal_repository = FakeJournalRepository()
    result = project_testnet_order_to_journal(
        order_repository=order_repository,
        journal_repository=journal_repository,
        run_repository=FakeRunRepository(status="completed"),
        request=_request(),
    )

    assert result.status == "journal_projected"
    assert result.reason_code == "testnet_order_journal_projection_created"
    assert result.should_commit is True
    assert order_repository.intent.status == "journal_projected"
    assert order_repository.intent.journal_entry_id is not None
    assert journal_repository.entries[0]["planned_snapshot"]["source"] == "assisted_testnet_order"
    assert journal_repository.entries[0]["planned_snapshot"]["testnetOrderIntentId"] == str(order_repository.intent.id)
    assert order_repository.events[0]["event_type"] == "testnet_order_journal_projection_planned"
