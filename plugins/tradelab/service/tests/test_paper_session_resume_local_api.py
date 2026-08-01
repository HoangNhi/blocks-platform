from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from tradelab_api.main import app
from tradelab_api.services.paper_session_resume_local import PaperSessionResumeCursor, PaperSessionResumeLocalResult

client = TestClient(app)


def _dt(hour: int) -> datetime:
    return datetime(2026, 1, 1, hour, tzinfo=timezone.utc)


def assert_success_envelope(response, semantic_status: int = 200) -> dict[str, object]:
    assert response.status_code == 200
    payload = response.json()
    assert payload["Success"] is True
    assert payload["StatusCode"] == semantic_status
    return payload["Data"]


def test_resume_local_route_returns_success_envelope(monkeypatch) -> None:
    session_id = uuid4()
    calls = {"resume": 0}

    def fake_resume(repository, *, settings, session_id, request, kill_switch_status, readiness_builder):
        calls["resume"] += 1
        assert request.confirm_local_paper_resume is True
        assert request.idempotency_key == "resume-key-1"
        return PaperSessionResumeLocalResult(
            status="queued",
            reason_code="paper_local_resume_queued",
            source_session_id=str(session_id),
            resume_session_id=str(session_id),
            source_status="cancelled",
            resume_status="queued",
            idempotency_key=f"paper-resume:{session_id}:resume-key-1",
            resume_cursor=PaperSessionResumeCursor(
                last_processed_candle_id=str(uuid4()),
                next_candle_open_time=_dt(3),
                attempt_no=1,
            ),
            details={"auditEventIds": [str(uuid4())], "reason": "user_requested", "actor": "admin"},
            should_commit=True,
            semantic_status_code=200,
        )

    monkeypatch.setattr("tradelab_api.api.paper.execute_local_paper_session_resume", fake_resume)

    data = assert_success_envelope(
        client.post(
            f"/api/tradelab/paper/sessions/{session_id}/resume-local",
            json={
                "confirmLocalPaperResume": True,
                "idempotencyKey": "resume-key-1",
                "reason": "user_requested",
                "actor": "admin",
            },
        )
    )

    assert calls == {"resume": 1}
    assert data["status"] == "queued"
    assert data["reasonCode"] == "paper_local_resume_queued"
    assert data["sourceSessionId"] == str(session_id)
    assert data["resumeSessionId"] == str(session_id)
    assert data["resumeCursor"]["attemptNo"] == 1
    assert data["safetyStatus"] == "local_dev_paper_resume"


def test_resume_local_route_returns_blocked_semantic_status(monkeypatch) -> None:
    session_id = uuid4()

    def fake_resume(repository, *, settings, session_id, request, kill_switch_status, readiness_builder):
        return PaperSessionResumeLocalResult(
            status="blocked",
            reason_code="paper_local_resume_confirm_required",
            semantic_status_code=400,
        )

    monkeypatch.setattr("tradelab_api.api.paper.execute_local_paper_session_resume", fake_resume)

    data = assert_success_envelope(
        client.post(
            f"/api/tradelab/paper/sessions/{session_id}/resume-local",
            json={"confirmLocalPaperResume": False, "idempotencyKey": "resume-key-1"},
        ),
        semantic_status=400,
    )

    assert data["status"] == "blocked"
    assert data["reasonCode"] == "paper_local_resume_confirm_required"
