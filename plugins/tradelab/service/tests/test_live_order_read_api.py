from __future__ import annotations

from fastapi.testclient import TestClient

from tradelab_api.main import app

client = TestClient(app)


def test_list_live_orders_empty_response() -> None:
    response = client.get("/api/tradelab/live/orders")
    payload = response.json()
    assert payload["Success"] is True
    assert payload["Data"]["safetyStatus"] == "assisted_live_order_list_read_only"
    assert isinstance(payload["Data"]["items"], list)


def test_missing_live_order_detail_returns_not_found_envelope() -> None:
    response = client.get("/api/tradelab/live/orders/00000000-0000-0000-0000-000000000001")
    payload = response.json()
    assert payload["Success"] is True
    assert payload["StatusCode"] == 404
    assert payload["Data"]["reasonCode"] == "live_order_not_found"
