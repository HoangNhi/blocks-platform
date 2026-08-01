from __future__ import annotations

import os

from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://postgres:postgres123secure@localhost:5432/tradelab")

from tradelab_api.main import app  # noqa: E402
from tradelab_api.services.testnet_order_reconcile import TestnetOrderReconcileResult  # noqa: E402

client = TestClient(app)


def test_reconcile_route_returns_success_envelope_and_commits(monkeypatch) -> None:
    captured = {}

    def fake_reconcile(repository, credential_repository, request, *, vault_provider=None, http_client=None):
        captured["request"] = request
        return TestnetOrderReconcileResult(
            status="submitted",
            reason_code="testnet_order_reconcile_binance_matched",
            intent_id="00000000-0000-0000-0000-000000000001",
            client_order_id="tltn-client-1",
            exchange_order_id="12345",
            intent_status="submitted",
            reconciliation_attempt_id="00000000-0000-0000-0000-000000000002",
            should_commit=True,
        )

    monkeypatch.setattr("tradelab_api.api.testnet_orders.reconcile_testnet_order", fake_reconcile)
    response = client.post(
        "/api/tradelab/testnet/reconcile",
        json={
            "confirmTestnetReconcile": True,
            "orderId": "00000000-0000-0000-0000-000000000001",
            "trigger": "manual",
            "actor": "admin",
        },
    )

    payload = response.json()["Data"]
    assert response.status_code == 200
    assert payload["status"] == "submitted"
    assert payload["reasonCode"] == "testnet_order_reconcile_binance_matched"
    assert payload["safetyStatus"] == "assisted_testnet_reconcile_testnet_only"
    assert captured["request"].confirm_testnet_reconcile is True
    assert captured["request"].trigger == "manual"


def test_reconcile_route_returns_blocked_envelope_without_commit(monkeypatch) -> None:
    monkeypatch.setattr(
        "tradelab_api.api.testnet_orders.reconcile_testnet_order",
        lambda *args, **kwargs: TestnetOrderReconcileResult(
            status="blocked",
            reason_code="testnet_order_reconcile_confirmation_required",
            semantic_status_code=400,
            should_commit=False,
        ),
    )

    response = client.post(
        "/api/tradelab/testnet/reconcile",
        json={"confirmTestnetReconcile": False, "orderId": "00000000-0000-0000-0000-000000000001"},
    )

    assert response.status_code == 200
    assert response.json()["StatusCode"] == 400
    assert response.json()["Data"]["reasonCode"] == "testnet_order_reconcile_confirmation_required"
