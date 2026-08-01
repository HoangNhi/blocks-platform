from __future__ import annotations

from fastapi.testclient import TestClient

from tradelab_api.api import paper as paper_api
from tradelab_api.main import app
from tradelab_api.services.paper_session_cancel_local import PaperSessionCancelLocalResult

client = TestClient(app)


def assert_success_envelope(response, semantic_status: int) -> dict[str, object]:
    assert response.status_code == 200
    payload = response.json()
    assert payload["Success"] is True
    assert payload["StatusCode"] == semantic_status
    assert payload["Message"] is None
    return payload["Data"]


class FakeSession:
    def __init__(self) -> None:
        self.commits = 0
        self.rollbacks = 0

    def commit(self) -> None:
        self.commits += 1

    def rollback(self) -> None:
        self.rollbacks += 1

    def close(self) -> None:
        pass


def test_cancel_local_route_returns_cancelled_envelope_and_commits(monkeypatch) -> None:
    fake_session = FakeSession()
    calls: list[dict[str, object]] = []

    def fake_execute(repository, *, settings, session_id, request):
        calls.append(
            {
                "session_id": str(session_id),
                "confirm": request.confirm_local_paper_cancel,
                "reason": request.reason,
                "actor": request.actor,
            }
        )
        return PaperSessionCancelLocalResult(
            status="cancelled",
            reason_code="paper_local_cancelled",
            session_id=str(session_id),
            previous_status="queued",
            current_status="cancelled",
            should_commit=True,
            semantic_status_code=200,
        )

    monkeypatch.setattr("tradelab_api.api.paper.execute_local_paper_session_cancel", fake_execute)
    app.dependency_overrides[paper_api.get_db_session] = lambda: fake_session
    try:
        data = assert_success_envelope(
            client.post(
                "/api/tradelab/paper/sessions/00000000-0000-0000-0000-000000000001/cancel-local",
                json={
                    "confirmLocalPaperCancel": True,
                    "reason": "user_requested",
                    "actor": "admin",
                },
            ),
            200,
        )
    finally:
        app.dependency_overrides.pop(paper_api.get_db_session, None)

    assert calls == [
        {
            "session_id": "00000000-0000-0000-0000-000000000001",
            "confirm": True,
            "reason": "user_requested",
            "actor": "admin",
        }
    ]
    assert fake_session.commits == 1
    assert fake_session.rollbacks == 0
    assert data["status"] == "cancelled"
    assert data["reasonCode"] == "paper_local_cancelled"
    assert data["sessionId"] == "00000000-0000-0000-0000-000000000001"
    assert data["previousStatus"] == "queued"
    assert data["currentStatus"] == "cancelled"
    assert data["safetyStatus"] == "local_dev_paper_cancel"


def test_cancel_local_route_returns_blocked_without_commit(monkeypatch) -> None:
    fake_session = FakeSession()
    monkeypatch.setattr(
        "tradelab_api.api.paper.execute_local_paper_session_cancel",
        lambda *args, **kwargs: PaperSessionCancelLocalResult(
            status="blocked",
            reason_code="paper_local_cancel_confirm_required",
            should_commit=False,
            semantic_status_code=400,
        ),
    )
    app.dependency_overrides[paper_api.get_db_session] = lambda: fake_session
    try:
        data = assert_success_envelope(
            client.post(
                "/api/tradelab/paper/sessions/00000000-0000-0000-0000-000000000001/cancel-local",
                json={"confirmLocalPaperCancel": False},
            ),
            400,
        )
    finally:
        app.dependency_overrides.pop(paper_api.get_db_session, None)

    assert fake_session.commits == 0
    assert fake_session.rollbacks == 0
    assert data["status"] == "blocked"
    assert data["reasonCode"] == "paper_local_cancel_confirm_required"
    assert data["sessionId"] is None
