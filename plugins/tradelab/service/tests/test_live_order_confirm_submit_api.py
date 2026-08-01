from __future__ import annotations

from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from uuid import uuid4

from tradelab_api.main import app
from tradelab_api.services.live_order_confirm_submit import LiveOrderConfirmSubmitResult  # noqa: E402

client = TestClient(app)


def test_confirm_submit_route_returns_not_found_for_missing_preview() -> None:
    response = client.post(
        f"/api/tradelab/live/orders/{uuid4()}/confirm-submit",
        json={"confirmLiveOrder": True, "idempotencyKey": "submit-key-1", "actor": "admin"},
    )
    payload = response.json()
    assert payload["Success"] is True
    assert payload["StatusCode"] == 404
    assert payload["Data"]["reasonCode"] == "live_order_submit_preview_not_found"


def test_confirm_submit_route_returns_block_when_real_mode_proof_window_is_closed(monkeypatch) -> None:
    from types import SimpleNamespace

    captured = {"kwargs": None}

    def fake_confirm_submit_live_order(order_repository, credential_repository, request, **kwargs):
        captured["kwargs"] = kwargs
        assert request.live_order_submit_kill_switch_enabled is False
        assert request.connector_mode == "real"
        assert request.real_network_enabled is True
        assert request.environment_name == "local"
        assert request.binance_live_base_url == "https://api.binance.com"
        assert request.vault_provider_name == "local_dev_encrypted"
        return LiveOrderConfirmSubmitResult(
            status="blocked",
            reason_code="live_order_proof_window_closed",
            semantic_status_code=409,
            should_commit=False,
            safety_status="assisted_live_real_submit_live_only",
        )

    monkeypatch.setattr(
        "tradelab_api.api.live_orders.get_settings",
        lambda: SimpleNamespace(
            tradelab_live_order_submit_kill_switch_enabled=False,
            tradelab_live_order_submit_connector_mode="real",
            tradelab_live_order_submit_network_enabled=True,
            tradelab_environment="local",
            tradelab_binance_live_base_url="https://api.binance.com",
            tradelab_live_credential_vault_provider="local_dev_encrypted",
            tradelab_live_order_submit_recv_window_ms=5000,
            tradelab_live_order_submit_timeout_seconds=5.0,
            tradelab_local_dev_live_credential_key=Fernet.generate_key().decode("ascii"),
        ),
    )
    monkeypatch.setattr("tradelab_api.api.live_orders.confirm_submit_live_order", fake_confirm_submit_live_order)

    response = client.post(
        f"/api/tradelab/live/orders/{uuid4()}/confirm-submit",
        json={"confirmLiveOrder": True, "idempotencyKey": "submit-key-1", "actor": "admin"},
    )
    payload = response.json()

    assert payload["Success"] is True
    assert payload["StatusCode"] == 409
    assert payload["Data"]["reasonCode"] == "live_order_proof_window_closed"
    assert captured["kwargs"] is not None
