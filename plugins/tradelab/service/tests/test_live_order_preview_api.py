from __future__ import annotations

from collections.abc import Iterator
import os
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://postgres:postgres123secure@localhost:5432/tradelab")

from tradelab_api.db.session import SessionLocal, apply_schema_compatibility, get_engine  # noqa: E402
from tradelab_api.main import app  # noqa: E402
from tradelab_api.services.live_order_preview import LiveOrderPreviewResult  # noqa: E402

apply_schema_compatibility()

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


def test_preview_route_blocks_by_default_kill_switch() -> None:
    response = client.post(
        "/api/tradelab/live/orders/preview",
        json={
            "confirmPreviewOnly": True,
            "idempotencyKey": "preview-1",
            "clientActionId": "action-1",
            "source": "strategy_lab",
            "actor": "admin",
            "strategyId": str(uuid4()),
            "strategyVersionId": str(uuid4()),
            "credentialRefId": str(uuid4()),
            "environment": "binance_live",
            "exchange": "binance",
            "marketType": "spot",
            "symbol": "BTCUSDT",
            "side": "buy",
            "orderType": "market",
            "quoteQuantity": "25",
        },
    )
    payload = response.json()
    assert payload["Success"] is True
    assert payload["Data"]["reasonCode"] == "live_order_submit_kill_switch_enabled"


def test_preview_route_blocks_when_real_mode_is_open_but_proof_window_is_closed(monkeypatch) -> None:
    from types import SimpleNamespace

    captured = {"kwargs": None}

    def fake_preview_live_order(order_repository, credential_repository, request, **kwargs):
        captured["kwargs"] = kwargs
        assert kwargs["live_order_submit_kill_switch_enabled"] is False
        assert kwargs["connector_mode"] == "real"
        assert kwargs["real_network_enabled"] is True
        assert kwargs["environment_name"] == "local"
        assert kwargs["binance_live_base_url"] == "https://api.binance.com"
        assert kwargs["vault_provider_name"] == "local_dev_encrypted"
        return LiveOrderPreviewResult(
            status="blocked",
            allowed=False,
            reason_code="live_order_proof_window_closed",
            semantic_status_code=403,
            should_commit=False,
        )

    monkeypatch.setattr("tradelab_api.api.live_orders.get_settings", lambda: SimpleNamespace(
        tradelab_live_order_submit_kill_switch_enabled=False,
        tradelab_live_order_submit_connector_mode="real",
        tradelab_live_order_submit_network_enabled=True,
        tradelab_environment="local",
        tradelab_binance_live_base_url="https://api.binance.com",
        tradelab_live_credential_vault_provider="local_dev_encrypted",
        tradelab_live_order_submit_recv_window_ms=5000,
        tradelab_live_order_submit_timeout_seconds=5.0,
        tradelab_local_dev_live_credential_key="test-key",
    ))
    monkeypatch.setattr("tradelab_api.api.live_orders.preview_live_order", fake_preview_live_order)

    response = client.post(
        "/api/tradelab/live/orders/preview",
        json={
            "confirmPreviewOnly": True,
            "idempotencyKey": "preview-proof-window-1",
            "clientActionId": "action-proof-window-1",
            "source": "strategy_lab",
            "actor": "admin",
            "strategyId": str(uuid4()),
            "strategyVersionId": str(uuid4()),
            "credentialRefId": str(uuid4()),
            "environment": "binance_live",
            "exchange": "binance",
            "marketType": "spot",
            "symbol": "BTCUSDT",
            "side": "buy",
            "orderType": "market",
            "quoteQuantity": "25",
        },
    )
    payload = response.json()

    assert payload["Success"] is True
    assert payload["StatusCode"] == 403
    assert payload["Data"]["reasonCode"] == "live_order_proof_window_closed"
    assert captured["kwargs"] is not None
