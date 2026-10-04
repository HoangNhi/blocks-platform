from __future__ import annotations

from fastapi.testclient import TestClient

from tradelab_api.main import app


def test_tenant_cannot_reset_shared_smoke_fixtures():
    client = TestClient(app, headers={"Authorization": "Bearer unit-test", "X-Workspace-Id": "00000000-0000-0000-0000-000000000001"})
    response = client.post("/api/tradelab/smoke/local-fill-fixture/reset", json={"confirmFixtureReset": True})
    assert response.status_code == 403
    assert response.json()["Success"] is False
