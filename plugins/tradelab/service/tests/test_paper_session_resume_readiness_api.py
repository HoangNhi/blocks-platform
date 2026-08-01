from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from fastapi.testclient import TestClient

from tradelab_api.api import paper as paper_api
from tradelab_api.main import app
from tradelab_api.services.paper_session_resume_readiness import (
    PaperSessionResumeCheckpoint,
    PaperSessionResumeReadinessResult,
    PaperSessionResumeReadinessValidationError,
)

client = TestClient(app)

def _dt(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 1, 1, hour, minute, tzinfo=timezone.utc)

def assert_success_envelope(response, semantic_status: int = 200) -> dict[str, object]:
    assert response.status_code == 200
    payload = response.json()
    assert payload["Success"] is True
    assert payload["StatusCode"] == semantic_status
    assert payload["Message"] is None
    return payload["Data"]

def assert_error_envelope(response, semantic_status: int) -> dict[str, object]:
    assert response.status_code == 200
    payload = response.json()
    assert payload["Success"] is False
    assert payload["StatusCode"] == semantic_status
    return payload["Data"]

class FakeReadOnlySession:
    def commit(self) -> None:
        raise AssertionError("Resume readiness route must not commit.")

    def add(self, value) -> None:
        raise AssertionError("Resume readiness route must not add rows.")

    def flush(self) -> None:
        raise AssertionError("Resume readiness route must not flush writes.")

    def close(self) -> None:
        pass

def _result(session_id: str) -> PaperSessionResumeReadinessResult:
    return PaperSessionResumeReadinessResult(
        session_id=session_id,
        status="cancelled",
        reason_code="paper_local_resume_readiness_ready",
        allowed=True,
        checkpoint_source="persisted",
        artifact_identity_status="ready",
        resume_mode="same_session",
        attempt_no=0,
        checkpoint=PaperSessionResumeCheckpoint(
            last_processed_candle_id=str(uuid4()),
            last_processed_candle_open_time=_dt(2),
            next_candle_id=str(uuid4()),
            next_candle_open_time=_dt(3),
            cash_balance=Decimal("9900"),
            equity=Decimal("10050"),
            realized_pnl=Decimal("25"),
            unrealized_pnl=Decimal("125"),
            fees_paid=Decimal("1.5"),
            exposure_notional=Decimal("500"),
            open_position_quantity=Decimal("0.25"),
            average_entry_price=Decimal("40000"),
            pending_orders_count=0,
        ),
        blocking_reasons=[],
        details={"readOnly": True},
    )

def test_resume_readiness_route_returns_success_envelope(monkeypatch) -> None:
    session_id = uuid4()
    calls = {"readiness": 0}

    def fake_readiness(repository, *, session_id):
        calls["readiness"] += 1
        return _result(str(session_id))

    monkeypatch.setattr("tradelab_api.api.paper.build_paper_session_resume_readiness", fake_readiness)

    data = assert_success_envelope(client.get(f"/api/tradelab/paper/sessions/{session_id}/resume-readiness"))

    assert calls == {"readiness": 1}
    assert data["sessionId"] == str(session_id)
    assert data["status"] == "cancelled"
    assert data["allowed"] is True
    assert data["reasonCode"] == "paper_local_resume_readiness_ready"
    assert data["safetyStatus"] == "read_only_paper_resume_readiness"
    assert data["checkpointSource"] == "persisted"
    assert data["artifactIdentityStatus"] == "ready"
    assert data["resumeMode"] == "same_session"
    assert data["attemptNo"] == 0
    assert data["checkpoint"]["cashBalance"] == "9900"
    assert data["checkpoint"]["nextCandleOpenTime"] == "2026-01-01T03:00:00Z"
    assert data["blockingReasons"] == []
    assert data["details"] == {"readOnly": True}

def test_resume_readiness_route_returns_machine_readable_not_found(monkeypatch) -> None:
    session_id = uuid4()

    def fake_readiness(repository, *, session_id):
        raise PaperSessionResumeReadinessValidationError(404, "paper_session_not_found", "Paper session not found.")

    monkeypatch.setattr("tradelab_api.api.paper.build_paper_session_resume_readiness", fake_readiness)

    data = assert_error_envelope(client.get(f"/api/tradelab/paper/sessions/{session_id}/resume-readiness"), 404)

    assert data == {"reasonCode": "paper_session_not_found"}

def test_resume_readiness_route_is_read_only(monkeypatch) -> None:
    session_id = uuid4()

    monkeypatch.setattr(
        "tradelab_api.api.paper.build_paper_session_resume_readiness",
        lambda repository, *, session_id: _result(str(session_id)),
    )
    app.dependency_overrides[paper_api.get_db_session] = lambda: FakeReadOnlySession()
    try:
        data = assert_success_envelope(client.get(f"/api/tradelab/paper/sessions/{session_id}/resume-readiness"))
    finally:
        app.dependency_overrides.pop(paper_api.get_db_session, None)

    assert data["safetyStatus"] == "read_only_paper_resume_readiness"
