from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from tradelab_api.main import app


@pytest.mark.parametrize("method,path", [
    ("GET", "/live/proof-window/status"),
    ("POST", "/live/proof-window/open"),
    ("POST", "/live/proof-window/close"),
    ("GET", "/live/safety/status"),
    ("POST", "/live/safety/reopen"),
])
def test_tenant_cannot_access_operator_controls(method, path):
    client = TestClient(app, headers={"Authorization": "Bearer unit-test", "X-Workspace-Id": "00000000-0000-0000-0000-000000000001"})
    response = client.request(method, "/api/tradelab" + path, json={})
    assert response.status_code == 403
    assert response.json()["Success"] is False
