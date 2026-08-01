from __future__ import annotations

from fastapi.testclient import TestClient

from tradelab_api.api import paper as paper_api
from tradelab_api.main import app
from tradelab_api.services.paper_session_run_local import PaperSessionRunLocalResult

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

def test_run_local_route_returns_completed_envelope_and_commits(monkeypatch) -> None:
    fake_session = FakeSession()
    calls: list[dict[str, object]] = []

    def fake_execute(session, *, settings, session_id, request):
        calls.append(
            {
                "session_id": str(session_id),
                "confirm": request.confirm_local_paper_run,
                "max": request.max_candles_per_tick,
                "worker": request.worker_id,
            }
        )
        return PaperSessionRunLocalResult(
            status="completed",
            reason_code="paper_engine_completed",
            session_id=str(session_id),
            candles_processed=3,
            orders_created=1,
            fills_created=1,
            snapshots_created=3,
            details={"workerId": "strategy-lab-local-paper-run", "maxCandlesPerTick": 3},
            should_commit=True,
            semantic_status_code=200,
        )

    monkeypatch.setattr("tradelab_api.api.paper.execute_local_paper_session_run", fake_execute)
    app.dependency_overrides[paper_api.get_db_session] = lambda: fake_session
    try:
        data = assert_success_envelope(
            client.post(
                "/api/tradelab/paper/sessions/00000000-0000-0000-0000-000000000001/run-local",
                json={
                    "confirmLocalPaperRun": True,
                    "maxCandlesPerTick": 3,
                    "workerId": "strategy-lab-local-paper-run",
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
            "max": 3,
            "worker": "strategy-lab-local-paper-run",
        }
    ]
    assert fake_session.commits == 1
    assert fake_session.rollbacks == 0
    assert data["status"] == "completed"
    assert data["reasonCode"] == "paper_engine_completed"
    assert data["sessionId"] == "00000000-0000-0000-0000-000000000001"
    assert data["candlesProcessed"] == 3
    assert data["ordersCreated"] == 1
    assert data["fillsCreated"] == 1
    assert data["snapshotsCreated"] == 3
    assert data["safetyStatus"] == "local_dev_paper_engine_tick"

def test_run_local_route_returns_blocked_without_commit(monkeypatch) -> None:
    fake_session = FakeSession()
    monkeypatch.setattr(
        "tradelab_api.api.paper.execute_local_paper_session_run",
        lambda *args, **kwargs: PaperSessionRunLocalResult(
            status="blocked",
            reason_code="paper_local_run_confirmation_required",
            should_commit=False,
            semantic_status_code=400,
        ),
    )
    app.dependency_overrides[paper_api.get_db_session] = lambda: fake_session
    try:
        data = assert_success_envelope(
            client.post(
                "/api/tradelab/paper/sessions/00000000-0000-0000-0000-000000000001/run-local",
                json={"confirmLocalPaperRun": False},
            ),
            400,
        )
    finally:
        app.dependency_overrides.pop(paper_api.get_db_session, None)

    assert fake_session.commits == 0
    assert fake_session.rollbacks == 0
    assert data["status"] == "blocked"
    assert data["reasonCode"] == "paper_local_run_confirmation_required"
    assert data["sessionId"] is None

def test_run_local_route_rolls_back_unexpected_error_result(monkeypatch) -> None:
    fake_session = FakeSession()
    monkeypatch.setattr(
        "tradelab_api.api.paper.execute_local_paper_session_run",
        lambda *args, **kwargs: PaperSessionRunLocalResult(
            status="failed",
            reason_code="paper_engine_unexpected_error",
            details={"errorMessage": "[REDACTED]"},
            should_rollback=True,
            semantic_status_code=500,
        ),
    )
    app.dependency_overrides[paper_api.get_db_session] = lambda: fake_session
    try:
        data = assert_success_envelope(
            client.post(
                "/api/tradelab/paper/sessions/00000000-0000-0000-0000-000000000001/run-local",
                json={"confirmLocalPaperRun": True},
            ),
            500,
        )
    finally:
        app.dependency_overrides.pop(paper_api.get_db_session, None)

    assert fake_session.commits == 0
    assert fake_session.rollbacks == 1
    assert data["status"] == "failed"
    assert data["reasonCode"] == "paper_engine_unexpected_error"
    assert data["details"]["errorMessage"] == "[REDACTED]"
