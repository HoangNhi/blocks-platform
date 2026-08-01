from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

from fastapi.testclient import TestClient

from tradelab_api.main import app
from tradelab_api.schemas.testnet_orders import TestnetOrderPreviewRequest, TestnetOrderPreviewResultResponse

client = TestClient(app)

def test_preview_schema_uses_camel_aliases() -> None:
    request = TestnetOrderPreviewRequest.model_validate({"confirmPreviewOnly": True, "idempotencyKey": "key", "clientActionId": "action", "strategyId": str(uuid4()), "strategyVersionId": str(uuid4()), "credentialRefId": str(uuid4()), "symbol": "BTCUSDT", "side": "buy", "quoteQuantity": "25"})
    assert request.confirm_preview_only is True
    dumped = TestnetOrderPreviewResultResponse(status="previewed", allowed=True, reason_code="ok", safety_status="assisted_testnet_preview_only", client_order_id="tltn-1", credential_snapshot={}, risk_snapshot={}).model_dump(by_alias=True)
    assert "clientOrderId" in dumped
    assert "credentialSnapshot" in dumped
    assert "riskSnapshot" in dumped
    assert "safetyStatus" in dumped

def test_testnet_order_routes_include_preview_read_submit_cancel_and_project_journal() -> None:
    routes = sorted((getattr(route, "path", ""), getattr(route, "methods", set())) for route in app.routes if "/api/tradelab/testnet/orders" in getattr(route, "path", ""))
    assert routes == [
        ("/api/tradelab/testnet/orders", {"GET"}),
        ("/api/tradelab/testnet/orders/preview", {"POST"}),
        ("/api/tradelab/testnet/orders/{order_id}", {"GET"}),
        ("/api/tradelab/testnet/orders/{order_id}/cancel", {"POST"}),
        ("/api/tradelab/testnet/orders/{order_id}/project-journal", {"POST"}),
        ("/api/tradelab/testnet/orders/{preview_id}/confirm-submit", {"POST"}),
    ]

def test_preview_route_blocks_missing_confirmation() -> None:
    response = client.post("/api/tradelab/testnet/orders/preview", json={"confirmPreviewOnly": False, "idempotencyKey": "key", "clientActionId": "action", "strategyId": str(uuid4()), "strategyVersionId": str(uuid4()), "credentialRefId": str(uuid4()), "symbol": "BTCUSDT", "side": "buy", "quoteQuantity": str(Decimal("25"))})
    payload = response.json()
    assert payload["Success"] is True
    assert payload["Data"]["allowed"] is False
    assert payload["Data"]["reasonCode"] == "testnet_order_preview_confirmation_required"
