from __future__ import annotations

from fastapi.testclient import TestClient

from tradelab_api.api import paper as paper_api
from tradelab_api.main import app

client = TestClient(app)

def assert_success_envelope(response, semantic_status: int) -> dict[str, object]:
    assert response.status_code == 200
    payload = response.json()
    assert payload["Success"] is True
    assert payload["StatusCode"] == semantic_status
    assert payload["Message"] is None
    return payload["Data"]

def test_kill_switch_status_route_returns_read_only_status(monkeypatch) -> None:
    monkeypatch.setattr(
        paper_api,
        "get_settings",
        lambda: type(
            "Settings",
            (),
            {
                "tradelab_environment": "local",
                "tradelab_local_paper_kill_switch_enabled": True,
            },
        )(),
    )

    data = assert_success_envelope(client.get("/api/tradelab/paper/safety/status"), 200)

    assert data["enabled"] is True
    assert data["reasonCode"] == "paper_kill_switch_enabled"
    assert data["safetyStatus"] == "read_only_paper_kill_switch_status"
    assert data["source"] == "config"
    assert data["updatedAt"] is None
    assert data["updatedBy"] is None
    assert data["details"] == {"environment": "local", "localDevOnly": True}
