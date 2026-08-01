from __future__ import annotations

import os

from fastapi.testclient import TestClient

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://postgres:postgres123secure@localhost:5432/tradelab")

from tradelab_api.main import app  # noqa: E402
from tradelab_api.services.testnet_order_journal_projection import TestnetOrderJournalProjectionResult  # noqa: E402

client = TestClient(app)


def test_project_journal_route_returns_success_envelope_and_commits(monkeypatch) -> None:
    captured = {}

    def fake_project(*, order_repository, journal_repository, run_repository, request):
        captured["request"] = request
        return TestnetOrderJournalProjectionResult(
            status="journal_projected",
            reason_code="testnet_order_journal_projection_created",
            should_commit=True,
            intent_id="00000000-0000-0000-0000-000000000001",
            journal_entry_id="00000000-0000-0000-0000-000000000002",
            client_order_id="tltn-client-1",
            intent_status="journal_projected",
            audit_event_ids=["00000000-0000-0000-0000-000000000003"],
        )

    monkeypatch.setattr("tradelab_api.api.testnet_orders.project_testnet_order_to_journal", fake_project)
    response = client.post(
        "/api/tradelab/testnet/orders/00000000-0000-0000-0000-000000000001/project-journal",
        json={"confirmTestnetJournalProjection": True, "source": "strategy_lab", "actor": "admin"},
    )

    payload = response.json()["Data"]
    assert response.status_code == 200
    assert payload["status"] == "journal_projected"
    assert payload["reasonCode"] == "testnet_order_journal_projection_created"
    assert payload["journalEntryId"] == "00000000-0000-0000-0000-000000000002"
    assert captured["request"].confirm_testnet_journal_projection is True
    assert captured["request"].source == "strategy_lab"


def test_project_journal_route_returns_blocked_envelope(monkeypatch) -> None:
    monkeypatch.setattr(
        "tradelab_api.api.testnet_orders.project_testnet_order_to_journal",
        lambda **kwargs: TestnetOrderJournalProjectionResult(
            status="blocked",
            reason_code="testnet_order_journal_projection_confirm_required",
            semantic_status_code=400,
            should_commit=False,
        ),
    )

    response = client.post(
        "/api/tradelab/testnet/orders/00000000-0000-0000-0000-000000000001/project-journal",
        json={"confirmTestnetJournalProjection": False},
    )

    assert response.status_code == 200
    assert response.json()["StatusCode"] == 400
    assert response.json()["Data"]["reasonCode"] == "testnet_order_journal_projection_confirm_required"
