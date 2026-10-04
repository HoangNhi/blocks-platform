from __future__ import annotations

from fastapi.testclient import TestClient
from uuid import uuid4

from tradelab_api.main import app

client = TestClient(app, headers={"Authorization": "Bearer unit-test", "X-Workspace-Id": "00000000-0000-0000-0000-000000000001"})


def test_project_journal_route_returns_not_found_for_missing_order(monkeypatch) -> None:
    monkeypatch.setattr("tradelab_api.services.live_order_state_repository.LiveOrderStateRepository.get_intent", lambda *args, **kwargs: None)
    response = client.post(
        f"/api/tradelab/live/orders/{uuid4()}/project-journal",
        json={"confirmLiveJournalProjection": True, "source": "strategy_lab"},
    )
    payload = response.json()
    assert payload["Success"] is True
    assert payload["StatusCode"] == 404
    assert payload["Data"]["reasonCode"] == "live_order_not_found"
