from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi.testclient import TestClient

from tradelab_api.main import app


client = TestClient(app)


def _dt(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 5, 29, hour, minute, tzinfo=timezone.utc)


def assert_success_envelope(response, semantic_status: int = 200) -> dict[str, object]:
    assert response.status_code == 200
    payload = response.json()
    assert payload["Success"] is True
    assert payload["StatusCode"] == semantic_status
    assert payload["Message"] is None
    return payload["Data"]


def test_paper_scheduler_status_route_returns_success_envelope(monkeypatch) -> None:
    scheduler = SimpleNamespace(
        start=lambda: (_ for _ in ()).throw(AssertionError("must not start")),
        stop=lambda: (_ for _ in ()).throw(AssertionError("must not stop")),
        tick_once=lambda: (_ for _ in ()).throw(AssertionError("must not tick")),
        state=SimpleNamespace(
            enabled=True,
            running=False,
            worker_id="tradelab-local-paper-scheduler",
            interval_seconds=60.0,
            last_tick_started_at=_dt(10),
            last_tick_completed_at=_dt(10, 1),
            last_tick_status="processed",
            last_skip_reason=None,
            last_reason_code="paper_engine_completed",
            last_session_id="paper-session-1",
            candles_processed=100,
            orders_created=1,
            fills_created=1,
            snapshots_created=100,
            consecutive_failure_count=0,
        ),
    )
    monkeypatch.setattr(app.state, "paper_session_scheduler", scheduler, raising=False)

    data = assert_success_envelope(client.get("/api/tradelab/paper/scheduler/status"))

    assert data["lastTickStatus"] == "processed"
    assert data["lastSessionId"] == "paper-session-1"
    assert data["candlesProcessed"] == 100
    assert data["safetyStatus"] == "read_only_paper_scheduler_visibility"


def test_paper_scheduler_status_route_returns_safe_fallback_when_scheduler_missing(monkeypatch) -> None:
    monkeypatch.delattr(app.state, "paper_session_scheduler", raising=False)

    data = assert_success_envelope(client.get("/api/tradelab/paper/scheduler/status"))

    assert data["lastTickStatus"] == "disabled"
    assert data["lastReasonCode"] == "paper_scheduler_unavailable"
    assert data["lastSessionId"] is None


def test_paper_scheduler_status_route_has_no_mutation_methods() -> None:
    scheduler_routes = [
        (getattr(route, "path", ""), getattr(route, "methods", set()))
        for route in app.routes
        if "paper/scheduler" in getattr(route, "path", "")
    ]

    assert scheduler_routes == [("/api/tradelab/paper/scheduler/status", {"GET"})]
