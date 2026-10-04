from __future__ import annotations

import os

from sqlalchemy.engine import make_url
from uuid import UUID, uuid4
import pytest
from fastapi.testclient import TestClient

from tradelab_api.core.authorization import FunctionalAuthorizationResult
from tradelab_api.main import app

_database_url = os.environ.get("DATABASE_URL")
if (
    os.environ.get("TRADELAB_TEST_DATABASE_RESET", "false").lower() != "true"
    or not _database_url
    or make_url(_database_url).database != "tradelab_test"
):
    pytest.skip(
        "workspace API integration tests require explicitly configured disposable tradelab_test database",
        allow_module_level=True,
    )


class MockScopedAuthorityClient:
    def __init__(self, allowed_memberships: dict[tuple[UUID, UUID], str]) -> None:
        self.allowed = allowed_memberships

    async def check(self, request, perm, act, workspace_id=None):
        auth = request.headers.get("authorization", "")
        if not auth.startswith("Bearer "):
            return FunctionalAuthorizationResult(False, True, False)
        # Parse test user_id from token format: Bearer test-user-<UUID>
        token = auth.removeprefix("Bearer ").strip()
        try:
            user_id = UUID(token)
        except ValueError:
            user_id = UUID("11111111-1111-1111-1111-111111111111")

        if workspace_id is None:
            return FunctionalAuthorizationResult(True, True, True, user_id=user_id, username="testuser")

        if (user_id, workspace_id) in self.allowed:
            username = self.allowed[(user_id, workspace_id)]
            return FunctionalAuthorizationResult(
                allowed=True,
                authority_available=True,
                authenticated=True,
                user_id=user_id,
                username=username,
                workspace_id=workspace_id,
            )
        return FunctionalAuthorizationResult(False, True, True)


@pytest.fixture
def api_client():
    user_a = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
    ws_a = UUID("11111111-1111-1111-1111-111111111111")

    user_b = UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")
    ws_b = UUID("22222222-2222-2222-2222-222222222222")

    mock_client = MockScopedAuthorityClient({
        (user_a, ws_a): "alice",
        (user_b, ws_b): "bob",
    })
    app.state.system_authorization_client = mock_client
    return TestClient(app)


def test_mutation_spoof_fields_return_422(api_client: TestClient) -> None:
    ws_a = "11111111-1111-1111-1111-111111111111"
    headers = {
        "Authorization": "Bearer aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "X-Workspace-Id": ws_a,
    }

    # Attempting to supply created_by returns 422
    resp = api_client.post(
        "/api/tradelab/strategies",
        headers=headers,
        json={"name": "Strat", "slug": "strat", "created_by": "hacker"},
    )
    assert resp.status_code == 422

    # Attempting to supply workspace_id returns 422
    resp = api_client.post(
        "/api/tradelab/strategies",
        headers=headers,
        json={"name": "Strat", "slug": "strat", "workspace_id": str(uuid4())},
    )
    assert resp.status_code == 422

    # Attempting to supply camelCase createdBy returns 422
    resp = api_client.post(
        "/api/tradelab/bots",
        headers=headers,
        json={"strategy_id": str(uuid4()), "name": "Bot", "symbol": "BTC", "timeframe": "1h", "createdBy": "hacker"},
    )
    assert resp.status_code == 422


def test_cross_workspace_access_returns_404(api_client: TestClient) -> None:
    user_a = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    ws_a = "11111111-1111-1111-1111-111111111111"
    user_b = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
    ws_b = "22222222-2222-2222-2222-222222222222"

    headers_a = {"Authorization": f"Bearer {user_a}", "X-Workspace-Id": ws_a}
    headers_b = {"Authorization": f"Bearer {user_b}", "X-Workspace-Id": ws_b}

    # User A creates a strategy
    slug_a = f"alice-strat-{uuid4().hex[:8]}"
    resp_create = api_client.post(
        "/api/tradelab/strategies",
        headers=headers_a,
        json={"name": "Alice Secret", "slug": slug_a},
    )
    assert resp_create.status_code == 200
    assert resp_create.json()["StatusCode"] == 201
    strat_id = resp_create.json()["Data"]["id"]

    # User B cannot access Strategy A -> 404 Not Found in envelope
    resp_get = api_client.get(f"/api/tradelab/strategies/{strat_id}", headers=headers_b)
    assert resp_get.json()["StatusCode"] == 404
    assert resp_get.json()["Success"] is False

    # User B creating bot pointing to Alice's strategy -> 404
    resp_bot = api_client.post(
        "/api/tradelab/bots",
        headers=headers_b,
        json={"strategy_id": strat_id, "name": "Bob Bot", "symbol": "BTCUSDT", "timeframe": "1h"},
    )
    assert resp_bot.json()["StatusCode"] == 404
    assert resp_bot.json()["Success"] is False


def test_shared_route_datasets_does_not_require_workspace_header(api_client: TestClient) -> None:
    headers = {"Authorization": "Bearer aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"}
    resp = api_client.get("/api/tradelab/datasets", headers=headers)
    assert resp.status_code in (200, 404)  # 200 or 404 from business logic, but NOT 400 from middleware!
