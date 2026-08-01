from __future__ import annotations

from types import SimpleNamespace

from fastapi.testclient import TestClient

from tradelab_api.main import app

client = TestClient(app)


def _settings():
    return SimpleNamespace(
        tradelab_environment="local",
        tradelab_live_order_submit_kill_switch_enabled=False,
        tradelab_live_order_submit_connector_mode="real",
        tradelab_live_order_submit_network_enabled=True,
        tradelab_binance_live_base_url="https://api.binance.com",
        tradelab_live_credential_vault_provider="local_dev_encrypted",
        tradelab_live_order_submit_recv_window_ms=5000,
        tradelab_live_order_submit_timeout_seconds=5.0,
        tradelab_local_dev_live_credential_key="test-key",
    )


def test_proof_window_status_route_returns_closed_state(monkeypatch) -> None:
    monkeypatch.setattr("tradelab_api.api.live_orders.get_settings", _settings)

    response = client.get("/api/tradelab/live/proof-window/status")
    payload = response.json()

    assert payload["Success"] is True
    assert payload["StatusCode"] == 200
    assert payload["Data"]["proofWindowStatus"] in {"closed", "open", "consumed", "expired"}
    assert payload["Data"]["safetyStatus"] == "assisted_live_proof_window_controls_only"


def test_proof_window_open_route_requires_confirm(monkeypatch) -> None:
    monkeypatch.setattr("tradelab_api.api.live_orders.get_settings", _settings)

    response = client.post(
        "/api/tradelab/live/proof-window/open",
        json={
            "confirmOpen": False,
            "actor": "phase20-operator",
            "reason": "phase20_one_fill_proof",
            "ttlSeconds": 120,
            "intentBudget": 1,
        },
    )
    payload = response.json()

    assert payload["Success"] is True
    assert payload["StatusCode"] == 400
    assert payload["Data"]["reasonCode"] == "live_proof_window_confirmation_required"


def test_proof_window_open_and_close_route_round_trip(monkeypatch) -> None:
    monkeypatch.setattr("tradelab_api.api.live_orders.get_settings", _settings)

    open_response = client.post(
        "/api/tradelab/live/proof-window/open",
        json={
            "confirmOpen": True,
            "actor": "phase20-operator",
            "reason": "phase20_one_fill_proof",
            "ttlSeconds": 120,
            "intentBudget": 1,
        },
    )
    open_payload = open_response.json()
    assert open_payload["Success"] is True
    assert open_payload["StatusCode"] == 200
    assert open_payload["Data"]["proofWindowStatus"] == "open"
    assert open_payload["Data"]["remainingIntentBudget"] == 1

    status_response = client.get("/api/tradelab/live/proof-window/status")
    status_payload = status_response.json()
    assert status_payload["Success"] is True
    assert status_payload["Data"]["proofWindowStatus"] == "open"

    close_response = client.post(
        "/api/tradelab/live/proof-window/close",
        json={"confirmClose": True, "actor": "phase20-operator", "reason": "rollback_safe_close"},
    )
    close_payload = close_response.json()
    assert close_payload["Success"] is True
    assert close_payload["StatusCode"] == 200
    assert close_payload["Data"]["proofWindowStatus"] == "closed"
    assert close_payload["Data"]["remainingIntentBudget"] == 0

