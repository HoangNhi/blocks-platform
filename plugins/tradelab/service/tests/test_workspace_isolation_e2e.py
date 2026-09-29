from __future__ import annotations

import os
from typing import Final
from uuid import uuid4

import httpx
import pytest


_REQUIRED_ENVIRONMENT: Final = (
    "TRADELAB_E2E_ENABLED",
    "TRADELAB_E2E_BASE_URL",
    "TRADELAB_E2E_ALICE_TOKEN",
    "TRADELAB_E2E_BOB_TOKEN",
    "TRADELAB_E2E_ALICE_WORKSPACE_ID",
    "TRADELAB_E2E_BOB_WORKSPACE_ID",
)


def _require_e2e_environment() -> dict[str, str]:
    missing = [name for name in _REQUIRED_ENVIRONMENT if not os.environ.get(name)]
    if os.environ.get("TRADELAB_E2E_ENABLED") != "true":
        missing.append("TRADELAB_E2E_ENABLED=true")
    if missing:
        pytest.skip(
            "workspace E2E requires explicitly configured isolated runtime: "
            + ", ".join(sorted(set(missing)))
        )

    return {name: os.environ[name] for name in _REQUIRED_ENVIRONMENT if name in os.environ}


def _headers(token: str, workspace_id: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "X-Workspace-Id": workspace_id,
        "Content-Type": "application/json",
    }


def _assert_envelope_status(response: httpx.Response, status_code: int) -> dict[str, object]:
    assert response.status_code in {200, status_code}
    payload = response.json()
    assert payload["StatusCode"] == status_code
    return payload


def test_actual_authority_rejects_invalid_signed_token_before_workspace_processing() -> None:
    """Break caught: TradeLab trusts unverified JWT contents or accepts a fake bearer token."""
    env = _require_e2e_environment()

    with httpx.Client(base_url=env["TRADELAB_E2E_BASE_URL"], timeout=10.0) as client:
        response = client.get(
            "/api/tradelab/strategies",
            headers=_headers("invalid.not-a-signed-token.value", env["TRADELAB_E2E_ALICE_WORKSPACE_ID"]),
        )

    _assert_envelope_status(response, 401)


def test_actual_authority_and_postgres_keep_workspaces_isolated() -> None:
    """Break caught: a valid user B can list, read, or create a bot from user A's private strategy."""
    env = _require_e2e_environment()
    unique_slug = f"e2e-workspace-isolation-{uuid4().hex}"

    with httpx.Client(base_url=env["TRADELAB_E2E_BASE_URL"], timeout=10.0) as client:
        create_response = client.post(
            "/api/tradelab/strategies",
            headers=_headers(env["TRADELAB_E2E_ALICE_TOKEN"], env["TRADELAB_E2E_ALICE_WORKSPACE_ID"]),
            json={"name": "E2E Workspace Isolation", "slug": unique_slug},
        )
        create_payload = _assert_envelope_status(create_response, 201)
        strategy_id = create_payload["Data"]["id"]

        list_response = client.get(
            "/api/tradelab/strategies",
            headers=_headers(env["TRADELAB_E2E_BOB_TOKEN"], env["TRADELAB_E2E_BOB_WORKSPACE_ID"]),
        )
        list_payload = _assert_envelope_status(list_response, 200)
        assert all(item["id"] != strategy_id for item in list_payload["Data"]["items"])

        detail_response = client.get(
            f"/api/tradelab/strategies/{strategy_id}",
            headers=_headers(env["TRADELAB_E2E_BOB_TOKEN"], env["TRADELAB_E2E_BOB_WORKSPACE_ID"]),
        )
        detail_payload = _assert_envelope_status(detail_response, 404)
        assert detail_payload["Success"] is False

        bot_response = client.post(
            "/api/tradelab/bots",
            headers=_headers(env["TRADELAB_E2E_BOB_TOKEN"], env["TRADELAB_E2E_BOB_WORKSPACE_ID"]),
            json={
                "strategy_id": strategy_id,
                "name": "Unauthorized Cross-Workspace Bot",
                "symbol": "BTCUSDT",
                "timeframe": "1h",
            },
        )
        bot_payload = _assert_envelope_status(bot_response, 404)
        assert bot_payload["Success"] is False


def test_same_workspace_different_user_cannot_read_another_users_connection() -> None:
    """Break caught: membership alone grants a second user access to connection credentials."""
    env = _require_e2e_environment()
    alice_connection_id = os.environ.get("TRADELAB_E2E_ALICE_CONNECTION_ID")
    alice_peer_token = os.environ.get("TRADELAB_E2E_ALICE_PEER_TOKEN")
    if not alice_connection_id or not alice_peer_token:
        pytest.skip("same-workspace credential E2E requires peer token and seeded connection ID")

    with httpx.Client(base_url=env["TRADELAB_E2E_BASE_URL"], timeout=10.0) as client:
        response = client.get(
            f"/api/tradelab/live/credentials/{alice_connection_id}",
            headers=_headers(alice_peer_token, env["TRADELAB_E2E_ALICE_WORKSPACE_ID"]),
        )

    payload = _assert_envelope_status(response, 404)
    assert payload["Success"] is False
