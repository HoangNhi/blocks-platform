from __future__ import annotations

from fastapi.testclient import TestClient
from uuid import uuid4

from tradelab_api.main import app

client = TestClient(app)


def test_cancel_route_returns_not_found_for_missing_order() -> None:
    response = client.post(
        f"/api/tradelab/live/orders/{uuid4()}/cancel",
        json={"confirmLiveCancel": True, "idempotencyKey": "cancel-key-1", "reason": "user_requested", "actor": "admin"},
    )
    payload = response.json()
    assert payload["Success"] is True
    assert payload["StatusCode"] == 404
    assert payload["Data"]["reasonCode"] == "live_order_cancel_order_not_found"
