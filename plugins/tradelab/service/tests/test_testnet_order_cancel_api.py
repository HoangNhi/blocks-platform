from __future__ import annotations

import os

from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://postgres:postgres123secure@localhost:5432/tradelab")

from tradelab_api.main import app  # noqa: E402
from tradelab_api.services.testnet_order_cancel import TestnetOrderCancelResult  # noqa: E402

client = TestClient(app)


def test_cancel_route_returns_success_envelope_and_commits(monkeypatch) -> None:
    captured = {}

    def fake_cancel(repository, credential_repository, request, *, vault_provider=None, http_client=None):
        captured["request"] = request
        return TestnetOrderCancelResult(
            status="cancelled",
            reason_code="testnet_order_cancel_accepted",
            intent_id="00000000-0000-0000-0000-000000000001",
            client_order_id="tltn-client-1",
            exchange_order_id="12345",
            intent_status="cancelled",
            should_commit=True,
        )

    monkeypatch.setattr("tradelab_api.api.testnet_orders.cancel_testnet_order", fake_cancel)
    response = client.post(
        "/api/tradelab/testnet/orders/00000000-0000-0000-0000-000000000001/cancel",
        json={
            "confirmTestnetCancel": True,
            "idempotencyKey": "cancel-api-1",
            "reason": "user_requested",
            "actor": "admin",
        },
    )

    payload = response.json()["Data"]
    assert response.status_code == 200
    assert payload["status"] == "cancelled"
    assert payload["reasonCode"] == "testnet_order_cancel_accepted"
    assert payload["safetyStatus"] == "assisted_testnet_cancel_testnet_only"
    assert captured["request"].confirm_testnet_cancel is True
    assert captured["request"].idempotency_key == "cancel-api-1"


def test_cancel_route_returns_blocked_envelope_without_commit(monkeypatch) -> None:
    monkeypatch.setattr(
        "tradelab_api.api.testnet_orders.cancel_testnet_order",
        lambda *args, **kwargs: TestnetOrderCancelResult(
            status="blocked",
            reason_code="testnet_order_cancel_confirmation_required",
            semantic_status_code=400,
            should_commit=False,
        ),
    )

    response = client.post(
        "/api/tradelab/testnet/orders/00000000-0000-0000-0000-000000000001/cancel",
        json={"confirmTestnetCancel": False, "idempotencyKey": "cancel-api-1"},
    )

    assert response.status_code == 200
    assert response.json()["StatusCode"] == 400
    assert response.json()["Data"]["reasonCode"] == "testnet_order_cancel_confirmation_required"
