from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from tradelab_api.api import paper as paper_api
from tradelab_api.main import app
from tradelab_api.services.paper_session_start import (
    PaperSessionStartResult,
    PaperSessionStartValidationError,
)

client = TestClient(app)


def _dt(hour: int) -> datetime:
    return datetime(2026, 1, 1, hour, tzinfo=timezone.utc)


def _payload() -> dict[str, object]:
    return {
        "botId": str(uuid4()),
        "exchange": "binance",
        "symbol": "BTCUSDT",
        "timeframe": "1h",
        "startAt": _dt(0).isoformat(),
        "endAt": _dt(2).isoformat(),
        "startingCash": "10000",
        "idempotencyKey": "idempotency-key",
        "confirmStart": True,
        "source": "strategy_lab",
        "actor": "local-user",
    }


def _result(*, status: str = "queued", semantic_status_code: int = 201) -> PaperSessionStartResult:
    allowed = status == "queued"
    return PaperSessionStartResult(
        session_id=str(uuid4()) if allowed else None,
        status=status,
        allowed=allowed,
        reason_code="paper_session_queued" if allowed else "paper_dataset_not_ready",
        safety_status="paper_start_accepted" if allowed else "paper_start_blocked",
        request_fingerprint="paper-start:fingerprint",
        idempotency_key="idempotency-key",
        failed_gates=[],
        warnings=[],
        details={"checkedGateCount": 6, "failedGateCount": 0 if allowed else 1},
        dataset_context={
            "datasetKey": "binance:BTCUSDT:1h",
            "exchange": "binance",
            "symbol": "BTCUSDT",
            "timeframe": "1h",
            "startAt": _dt(0).isoformat(),
            "endAt": _dt(2).isoformat(),
            "preflightOutcome": "ready" if allowed else "needs_fill",
        },
        gate_context={
            "idempotencyKey": "idempotency-key",
            "requestFingerprint": "paper-start:fingerprint",
        },
        audit_event_ids=[str(uuid4())] if allowed else [],
        semantic_status_code=semantic_status_code,
        should_commit=allowed,
    )


def assert_success_envelope(response, semantic_status: int) -> dict[str, object]:
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


class FakeWriteSession:
    def __init__(self) -> None:
        self.commits = 0

    def commit(self) -> None:
        self.commits += 1

    def close(self) -> None:
        pass


class FakeNoCommitSession:
    def commit(self) -> None:
        raise AssertionError("Blocked paper start must not commit.")

    def close(self) -> None:
        pass


def test_paper_session_start_route_returns_queued_success_envelope_and_commits(monkeypatch) -> None:
    fake_session = FakeWriteSession()
    calls = {"start": 0}

    def fake_start(*args, **kwargs):
        calls["start"] += 1
        return _result(status="queued", semantic_status_code=201)

    monkeypatch.setattr("tradelab_api.api.paper.start_paper_session", fake_start)
    app.dependency_overrides[paper_api.get_db_session] = lambda: fake_session
    try:
        data = assert_success_envelope(client.post("/api/tradelab/paper/sessions/start", json=_payload()), 201)
    finally:
        app.dependency_overrides.pop(paper_api.get_db_session, None)

    assert calls == {"start": 1}
    assert fake_session.commits == 1
    assert data["status"] == "queued"
    assert data["allowed"] is True
    assert data["reasonCode"] == "paper_session_queued"
    assert data["safetyStatus"] == "paper_start_accepted"
    assert data["sessionId"] is not None
    assert data["auditEventIds"]


def test_paper_session_start_route_returns_blocked_success_envelope_without_commit(monkeypatch) -> None:
    monkeypatch.setattr(
        "tradelab_api.api.paper.start_paper_session",
        lambda *args, **kwargs: _result(status="blocked", semantic_status_code=200),
    )
    app.dependency_overrides[paper_api.get_db_session] = lambda: FakeNoCommitSession()
    try:
        data = assert_success_envelope(client.post("/api/tradelab/paper/sessions/start", json=_payload()), 200)
    finally:
        app.dependency_overrides.pop(paper_api.get_db_session, None)

    assert data["status"] == "blocked"
    assert data["allowed"] is False
    assert data["sessionId"] is None
    assert data["auditEventIds"] == []


def test_start_route_passes_kill_switch_status(monkeypatch) -> None:
    captured = {}
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

    def fake_start(*args, **kwargs):
        captured["enabled"] = kwargs["kill_switch_status"].enabled
        return _result(status="blocked", semantic_status_code=200)

    monkeypatch.setattr("tradelab_api.api.paper.start_paper_session", fake_start)

    data = assert_success_envelope(client.post("/api/tradelab/paper/sessions/start", json=_payload()), 200)

    assert captured == {"enabled": True}
    assert data["status"] == "blocked"


def test_paper_session_start_route_returns_machine_readable_error(monkeypatch) -> None:
    fake_session = FakeWriteSession()

    def fake_start(*args, **kwargs):
        raise PaperSessionStartValidationError(
            409,
            "paper_idempotency_conflict",
            "Paper session idempotency key conflicts with a different request.",
            {"sessionId": str(uuid4())},
            should_commit=True,
        )

    monkeypatch.setattr("tradelab_api.api.paper.start_paper_session", fake_start)
    app.dependency_overrides[paper_api.get_db_session] = lambda: fake_session
    try:
        data = assert_error_envelope(client.post("/api/tradelab/paper/sessions/start", json=_payload()), 409)
    finally:
        app.dependency_overrides.pop(paper_api.get_db_session, None)

    assert data["reasonCode"] == "paper_idempotency_conflict"
    assert data["sessionId"] is not None
    assert fake_session.commits == 1
