from __future__ import annotations

from decimal import Decimal

from tradelab_api.services.fake_binance_testnet_connector import FakeBinanceTestnetConnector
from tradelab_api.services.testnet_connector_contract import (
    ConnectorOrderRequest,
    ConnectorOutcome,
    TestnetOrderState as OrderState,
)


def _request(client_order_id: str = "tl-testnet-abc123") -> ConnectorOrderRequest:
    return ConnectorOrderRequest(
        symbol="BTCUSDT",
        side="buy",
        order_type="market",
        quantity=Decimal("0.01"),
        quote_quantity=None,
        client_order_id=client_order_id,
    )


def test_contract_types_are_pure_value_objects() -> None:
    request = _request()

    assert request.quantity == Decimal("0.01")
    assert OrderState.USER_CONFIRMED.value == "user_confirmed"


def test_fake_connector_accepted_submit_returns_submitted_snapshot() -> None:
    connector = FakeBinanceTestnetConnector(scenario="accepted")

    result = connector.submit_order(_request())

    assert result.outcome == ConnectorOutcome.ACCEPTED
    assert result.reason_code == "testnet_order_submit_accepted"
    assert result.snapshot is not None
    assert result.snapshot.state == OrderState.SUBMITTED
    assert result.snapshot.exchange_order_id == "fake-exchange-tl-testnet-abc123"
    assert connector.get_order("tl-testnet-abc123") == result.snapshot


def test_fake_connector_rejected_submit_returns_normalized_reject() -> None:
    connector = FakeBinanceTestnetConnector(scenario="rejected")

    result = connector.submit_order(_request())

    assert result.outcome == ConnectorOutcome.REJECTED
    assert result.reason_code == "testnet_order_submit_rejected"
    assert result.snapshot is not None
    assert result.snapshot.state == OrderState.REJECTED
    assert result.snapshot.metadata["rejectReason"] == "fake_insufficient_balance"


def test_fake_connector_timeout_unknown_requires_reconcile_by_client_order_id() -> None:
    connector = FakeBinanceTestnetConnector(scenario="timeout_unknown")

    submit = connector.submit_order(_request())
    reconcile = connector.reconcile(_request())

    assert submit.outcome == ConnectorOutcome.UNKNOWN
    assert submit.reason_code == "testnet_order_submit_unknown_state"
    assert reconcile.outcome == ConnectorOutcome.ACCEPTED
    assert reconcile.snapshot is not None
    assert reconcile.snapshot.state == OrderState.SUBMITTED
    assert reconcile.snapshot.client_order_id == "tl-testnet-abc123"


def test_fake_connector_cancel_fill_race_requires_reconciliation() -> None:
    connector = FakeBinanceTestnetConnector(scenario="cancel_fill_race")
    connector.submit_order(_request())

    cancel = connector.cancel_order(_request())

    assert cancel.outcome == ConnectorOutcome.RECONCILIATION_REQUIRED
    assert cancel.reason_code == "testnet_order_cancel_reconciliation_required"
    assert cancel.snapshot is not None
    assert cancel.snapshot.state == OrderState.RECONCILIATION_REQUIRED
    assert cancel.snapshot.metadata["fillRaceDetected"] is True
