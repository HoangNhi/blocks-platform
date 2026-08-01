from __future__ import annotations

import os
from uuid import uuid4

from cryptography.fernet import Fernet
from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://postgres:postgres123secure@localhost:5432/tradelab")

from tradelab_api.api import testnet_orders as orders_api
from tradelab_api.main import app
from tradelab_api.schemas.testnet_orders import (
    TestnetOrderConfirmSubmitRequest,
    TestnetOrderConfirmSubmitResponse,
)
from tradelab_api.core.config import Settings

client = TestClient(app)


def test_confirm_submit_schema_uses_camel_aliases() -> None:
    request = TestnetOrderConfirmSubmitRequest.model_validate(
        {
            "confirmTestnetOrder": True,
            "idempotencyKey": "submit-key-1",
            "actor": "admin",
        }
    )
    assert request.confirm_testnet_order is True
    dumped = TestnetOrderConfirmSubmitResponse(
        status="submitted",
        reason_code="testnet_order_submit_fake_accepted",
        safety_status="assisted_testnet_confirm_submit_fake_only",
        intent_id=str(uuid4()),
        preview_id=str(uuid4()),
        client_order_id="tltn-abc",
        exchange_order_id="fake-exchange-tltn-abc",
        intent_status="submitted",
        submit_snapshot={"state": "submitted"},
        audit_event_ids=[str(uuid4())],
    ).model_dump(by_alias=True)

    assert "reasonCode" in dumped
    assert "safetyStatus" in dumped
    assert "intentId" in dumped
    assert "previewId" in dumped
    assert "clientOrderId" in dumped
    assert "exchangeOrderId" in dumped
    assert "intentStatus" in dumped
    assert "submitSnapshot" in dumped
    assert "auditEventIds" in dumped


def test_testnet_order_routes_include_submit_cancel_reconcile_but_not_live() -> None:
    routes = {route.path: route.methods for route in app.routes if route.path.startswith("/api/tradelab/testnet")}

    assert "/api/tradelab/testnet/orders/{preview_id}/confirm-submit" in routes
    assert "/api/tradelab/testnet/orders/{order_id}/cancel" in routes
    assert "/api/tradelab/testnet/reconcile" in routes
    assert all("live" not in path for path in routes)
    assert all("/api/v3/order/test" not in path for path in routes)


def test_confirm_submit_route_blocks_missing_preview() -> None:
    response = client.post(
        f"/api/tradelab/testnet/orders/{uuid4()}/confirm-submit",
        json={
            "confirmTestnetOrder": True,
            "idempotencyKey": "submit-key-1",
            "actor": "admin",
        },
    )
    payload = response.json()
    assert payload["Success"] is True
    assert payload["Data"]["status"] == "blocked"
    assert payload["Data"]["reasonCode"] == "testnet_order_submit_preview_not_found"
    assert payload["Data"]["safetyStatus"] == "assisted_testnet_confirm_submit_fake_only"


def test_confirm_submit_route_blocks_without_confirmation() -> None:
    response = client.post(
        f"/api/tradelab/testnet/orders/{uuid4()}/confirm-submit",
        json={
            "confirmTestnetOrder": False,
            "idempotencyKey": "submit-key-1",
            "actor": "admin",
        },
    )
    payload = response.json()
    assert payload["Success"] is True
    assert payload["Data"]["status"] == "blocked"
    assert payload["Data"]["reasonCode"] == "testnet_order_submit_confirmation_required"

def test_confirm_submit_route_uses_real_submit_safety_status(monkeypatch) -> None:
    monkeypatch.setattr(
        orders_api,
        "get_settings",
        lambda: Settings(
            tradelab_environment="test",
            tradelab_testnet_order_submit_kill_switch_enabled=False,
            tradelab_testnet_order_submit_connector_mode="real",
            tradelab_testnet_order_submit_network_enabled=True,
            tradelab_testnet_credential_vault_provider="local_dev_encrypted",
            tradelab_local_dev_testnet_credential_key=Fernet.generate_key().decode("ascii"),
        ),
    )
    response = client.post(
        f"/api/tradelab/testnet/orders/{uuid4()}/confirm-submit",
        json={
            "confirmTestnetOrder": True,
            "idempotencyKey": "real-submit-api-1",
            "actor": "admin",
        },
    )
    payload = response.json()

    assert payload["Success"] is True
    assert payload["Data"]["status"] == "blocked"
    assert payload["Data"]["reasonCode"] == "testnet_order_submit_preview_not_found"
    assert payload["Data"]["safetyStatus"] == "assisted_testnet_real_submit_testnet_only"
