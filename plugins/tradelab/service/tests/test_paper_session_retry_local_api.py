from __future__ import annotations

from fastapi.testclient import TestClient

from tradelab_api.api import paper as paper_api
from tradelab_api.main import app
from tradelab_api.services.paper_session_retry_local import PaperSessionRetryLocalResult

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


def test_retry_local_route_returns_queued_envelope_and_commits(monkeypatch) -> None:
    fake_session = FakeSession()
    calls: list[dict[str, object]] = []

    def fake_execute(*args, **kwargs):
        request = kwargs["request"]
        calls.append(
            {
                "session_id": str(kwargs["session_id"]),
                "confirm": request.confirm_local_paper_retry,
                "idempotency_key": request.idempotency_key,
                "reason": request.reason,
                "actor": request.actor,
                "kill_switch_enabled": kwargs["kill_switch_status"].enabled,
            }
        )
        return PaperSessionRetryLocalResult(
            status="queued",
            reason_code="paper_local_retry_queued",
            source_session_id=str(kwargs["session_id"]),
            retry_session_id="00000000-0000-0000-0000-000000000002",
            source_status="failed",
            retry_status="queued",
            idempotency_key="paper-retry:key",
            should_commit=True,
            semantic_status_code=201,
        )

    monkeypatch.setattr("tradelab_api.api.paper.execute_local_paper_session_retry", fake_execute)
    app.dependency_overrides[paper_api.get_db_session] = lambda: fake_session
    try:
        data = assert_success_envelope(
            client.post(
                "/api/tradelab/paper/sessions/00000000-0000-0000-0000-000000000001/retry-local",
                json={
                    "confirmLocalPaperRetry": True,
                    "idempotencyKey": "retry-click-1",
                    "reason": "user_requested",
                    "actor": "admin",
                },
            ),
            201,
        )
    finally:
        app.dependency_overrides.pop(paper_api.get_db_session, None)

    assert calls == [
        {
            "session_id": "00000000-0000-0000-0000-000000000001",
            "confirm": True,
            "idempotency_key": "retry-click-1",
            "reason": "user_requested",
            "actor": "admin",
            "kill_switch_enabled": False,
        }
    ]
    assert fake_session.commits == 1
    assert fake_session.rollbacks == 0
    assert data["status"] == "queued"
    assert data["reasonCode"] == "paper_local_retry_queued"
    assert data["sourceSessionId"] == "00000000-0000-0000-0000-000000000001"
    assert data["retrySessionId"] == "00000000-0000-0000-0000-000000000002"
    assert data["safetyStatus"] == "local_dev_paper_retry"


def test_retry_local_route_returns_blocked_without_commit(monkeypatch) -> None:
    fake_session = FakeSession()
    monkeypatch.setattr(
        "tradelab_api.api.paper.execute_local_paper_session_retry",
        lambda *args, **kwargs: PaperSessionRetryLocalResult(
            status="blocked",
            reason_code="paper_local_retry_confirm_required",
            source_session_id=str(kwargs["session_id"]),
            source_status="failed",
            should_commit=False,
            semantic_status_code=400,
        ),
    )
    app.dependency_overrides[paper_api.get_db_session] = lambda: fake_session
    try:
        data = assert_success_envelope(
            client.post(
                "/api/tradelab/paper/sessions/00000000-0000-0000-0000-000000000001/retry-local",
                json={"confirmLocalPaperRetry": False, "idempotencyKey": "retry-click-1"},
            ),
            400,
        )
    finally:
        app.dependency_overrides.pop(paper_api.get_db_session, None)

    assert fake_session.commits == 0
    assert fake_session.rollbacks == 0
    assert data["status"] == "blocked"
    assert data["reasonCode"] == "paper_local_retry_confirm_required"
    assert data["retrySessionId"] is None


def test_retry_local_route_passes_enabled_kill_switch(monkeypatch) -> None:
    captured = {}
    monkeypatch.setattr(
        paper_api,
        "get_settings",
        lambda: type(
            "Settings",
            (),
            {
                "tradelab_environment": "local",
                "tradelab_local_paper_engine_enabled": True,
                "tradelab_local_paper_kill_switch_enabled": True,
            },
        )(),
    )

    def fake_execute(*args, **kwargs):
        captured["enabled"] = kwargs["kill_switch_status"].enabled
        return PaperSessionRetryLocalResult(
            status="blocked",
            reason_code="paper_kill_switch_enabled",
            source_session_id=str(kwargs["session_id"]),
            source_status="failed",
            should_commit=True,
            semantic_status_code=403,
        )

    monkeypatch.setattr("tradelab_api.api.paper.execute_local_paper_session_retry", fake_execute)

    data = assert_success_envelope(
        client.post(
            "/api/tradelab/paper/sessions/00000000-0000-0000-0000-000000000001/retry-local",
            json={
                "confirmLocalPaperRetry": True,
                "idempotencyKey": "retry-click-1",
                "reason": "user_requested",
            },
        ),
        403,
    )

    assert captured == {"enabled": True}
    assert data["status"] == "blocked"
    assert data["reasonCode"] == "paper_kill_switch_enabled"
