from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tradelab_api.db.session import SessionLocal, get_engine
from tradelab_api.main import app
from tradelab_api.services.testnet_order_read import get_testnet_order_detail
from tradelab_api.services.testnet_order_state_repository import TestnetOrderStateRepository as OrderStateRepository

from test_testnet_order_state_repository import _intent_payload

client = TestClient(app)


@pytest.fixture()
def db_session() -> Iterator[Session]:
    connection = get_engine().connect()
    transaction = connection.begin()
    session = SessionLocal(bind=connection)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()

def test_list_testnet_orders_empty_response() -> None:
    response = client.get("/api/tradelab/testnet/orders")
    payload = response.json()
    assert payload["Success"] is True
    assert payload["Data"]["safetyStatus"] == "assisted_testnet_order_list_read_only"
    assert isinstance(payload["Data"]["items"], list)

def test_missing_testnet_order_detail_returns_not_found_envelope() -> None:
    response = client.get("/api/tradelab/testnet/orders/00000000-0000-0000-0000-000000000001")
    payload = response.json()
    assert payload["Success"] is True
    assert payload["StatusCode"] == 404
    assert payload["Data"]["reasonCode"] == "testnet_order_not_found"

def test_order_detail_includes_cancel_reconcile_events_and_attempts(db_session: Session) -> None:
    repository = OrderStateRepository(db_session)
    intent = repository.create_intent(**_intent_payload(db_session))
    repository.add_event(
        intent_id=intent.id,
        preview_id=None,
        event_type="testnet_order_cancel_requested",
        from_status="submitted",
        to_status="cancel_requested",
        reason_code="testnet_order_cancel_requested",
        idempotency_key="cancel-read-detail-1",
        client_order_id=intent.client_order_id,
        exchange_order_id="12345",
        actor="admin",
        metadata={"safe": "yes"},
    )
    repository.add_event(
        intent_id=intent.id,
        preview_id=None,
        event_type="testnet_order_cancel_accepted",
        from_status="cancel_requested",
        to_status="cancelled",
        reason_code="testnet_order_cancel_binance_accepted",
        idempotency_key="cancel-read-detail-1",
        client_order_id=intent.client_order_id,
        exchange_order_id="12345",
        actor="admin",
        metadata={"signature": "SECRET"},
    )
    repository.add_event(
        intent_id=intent.id,
        preview_id=None,
        event_type="testnet_order_reconcile_started",
        from_status="reconciliation_required",
        to_status="reconciliation_required",
        reason_code="testnet_order_reconcile_started",
        idempotency_key=None,
        client_order_id=intent.client_order_id,
        exchange_order_id="12345",
        actor="admin",
        metadata={"trigger": "manual"},
    )
    repository.add_event(
        intent_id=intent.id,
        preview_id=None,
        event_type="testnet_order_reconcile_completed",
        from_status="reconciliation_required",
        to_status="cancelled",
        reason_code="testnet_order_reconcile_binance_matched",
        idempotency_key=None,
        client_order_id=intent.client_order_id,
        exchange_order_id="12345",
        actor="admin",
        metadata={"safe": "yes"},
    )
    repository.add_reconciliation_attempt(
        intent_id=intent.id,
        attempt_no=0,
        trigger="manual",
        status="matched",
        reason_code="testnet_order_reconcile_binance_matched",
        exchange_order_status="CANCELED",
        fills_snapshot={"apiSecret": "SECRET"},
        metadata={"safe": "yes"},
        actor="admin",
    )

    detail = get_testnet_order_detail(repository, intent.id)

    assert detail is not None
    event_types = [event["eventType"] for event in detail["events"]]
    assert "testnet_order_cancel_requested" in event_types
    assert "testnet_order_cancel_accepted" in event_types
    assert "testnet_order_reconcile_started" in event_types
    assert "testnet_order_reconcile_completed" in event_types
    assert detail["reconciliationAttempts"][0]["status"] == "matched"
    assert "SECRET" not in str(detail)
