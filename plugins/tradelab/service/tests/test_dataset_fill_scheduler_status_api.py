from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

from fastapi.testclient import TestClient

from tradelab_api.main import app

client = TestClient(app)


def _dt(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 5, 19, hour, minute, tzinfo=timezone.utc)


def assert_success_envelope(response, semantic_status: int = 200) -> dict[str, object]:
    assert response.status_code == 200
    payload = response.json()
    assert payload["Success"] is True
    assert payload["StatusCode"] == semantic_status
    assert payload["Message"] is None
    return payload["Data"]


def test_fill_scheduler_status_route_returns_success_envelope(monkeypatch) -> None:
    scheduler = SimpleNamespace(
        start=lambda: (_ for _ in ()).throw(AssertionError("Status route must not start scheduler.")),
        stop=lambda: (_ for _ in ()).throw(AssertionError("Status route must not stop scheduler.")),
        tick_once=lambda: (_ for _ in ()).throw(AssertionError("Status route must not tick scheduler.")),
        state=SimpleNamespace(
            enabled=True,
            running=False,
            worker_id="trade-lab-local-scheduler",
            interval_seconds=60.0,
            last_tick_started_at=_dt(10),
            last_tick_completed_at=_dt(10, 1),
            last_tick_status="processed",
            last_skip_reason=None,
            last_reason_code=None,
            last_job_id="job-1",
            last_dataset_key="binance:BTCUSDT:1h",
            stale_jobs_marked=1,
            consecutive_failure_count=0,
        ),
    )
    monkeypatch.setattr(app.state, "background_fill_scheduler", scheduler, raising=False)

    data = assert_success_envelope(client.get("/api/tradelab/datasets/fill-scheduler/status"))

    assert data == {
        "enabled": True,
        "running": False,
        "workerId": "trade-lab-local-scheduler",
        "intervalSeconds": 60.0,
        "lastTickStartedAt": "2026-05-19T10:00:00Z",
        "lastTickCompletedAt": "2026-05-19T10:01:00Z",
        "lastTickStatus": "processed",
        "lastSkipReason": None,
        "lastReasonCode": None,
        "lastJobId": "job-1",
        "lastDatasetKey": "binance:BTCUSDT:1h",
        "staleJobsMarked": 1,
        "consecutiveFailureCount": 0,
        "safetyStatus": "read_only_scheduler_visibility",
    }


def test_fill_scheduler_status_route_returns_safe_fallback_when_scheduler_missing(monkeypatch) -> None:
    monkeypatch.delattr(app.state, "background_fill_scheduler", raising=False)

    data = assert_success_envelope(client.get("/api/tradelab/datasets/fill-scheduler/status"))

    assert data["enabled"] is False
    assert data["running"] is False
    assert data["workerId"] == "trade-lab-local-scheduler"
    assert data["intervalSeconds"] == 60.0
    assert data["lastTickStartedAt"] is None
    assert data["lastTickCompletedAt"] is None
    assert data["lastTickStatus"] == "disabled"
    assert data["lastSkipReason"] == "dataset_fill_scheduler_unavailable"
    assert data["lastReasonCode"] == "dataset_fill_scheduler_unavailable"
    assert data["lastJobId"] is None
    assert data["lastDatasetKey"] is None
    assert data["staleJobsMarked"] == 0
    assert data["consecutiveFailureCount"] == 0
    assert data["safetyStatus"] == "read_only_scheduler_visibility"


def test_fill_scheduler_status_route_has_no_mutation_methods() -> None:
    scheduler_routes = [
        (getattr(route, "path", ""), getattr(route, "methods", set()))
        for route in app.routes
        if "fill-scheduler" in getattr(route, "path", "")
    ]

    assert scheduler_routes == [("/api/tradelab/datasets/fill-scheduler/status", {"GET"})]
