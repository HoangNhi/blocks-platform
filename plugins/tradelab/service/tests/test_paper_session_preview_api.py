from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from tradelab_api.api import paper as paper_api
from tradelab_api.main import app
from tradelab_api.services.paper_session_preview import (
    PaperSessionPreviewBotContext,
    PaperSessionPreviewDatasetContext,
    PaperSessionPreviewGateFailure,
    PaperSessionPreviewResult,
    PaperSessionPreviewStrategyContext,
    PaperSessionPreviewValidationError,
)

client = TestClient(app)


def _dt(hour: int) -> datetime:
    return datetime(2026, 1, 1, hour, tzinfo=timezone.utc)


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
        raise AssertionError("Paper preview route must not commit.")

    def add(self, value) -> None:
        raise AssertionError("Paper preview route must not add rows.")

    def flush(self) -> None:
        raise AssertionError("Paper preview route must not flush writes.")

    def close(self) -> None:
        pass


def _payload() -> dict[str, object]:
    return {
        "botId": str(uuid4()),
        "exchange": "binance",
        "symbol": "BTCUSDT",
        "timeframe": "1h",
        "startAt": _dt(0).isoformat(),
        "endAt": _dt(2).isoformat(),
        "source": "strategy_lab",
    }


def _result(*, allowed: bool = True) -> PaperSessionPreviewResult:
    failed_gates = [] if allowed else [
        PaperSessionPreviewGateFailure(
            gate="dataset",
            reason_code="paper_dataset_not_ready",
            message="Dataset must be ready for the requested paper range.",
            data={"sourceReasonCode": "needs_fill"},
        )
    ]
    return PaperSessionPreviewResult(
        mode="paper",
        preview_status="allowed" if allowed else "blocked",
        allowed=allowed,
        reason_code="paper_risk_gate_passed" if allowed else "paper_dataset_not_ready",
        failed_gates=failed_gates,
        warnings=[],
        details={"checkedGateCount": 6, "failedGateCount": len(failed_gates)},
        safety_status="read_only_preview",
        bot_context=PaperSessionPreviewBotContext(
            bot_id=str(uuid4()),
            mode="paper",
            status="draft",
            symbol="BTCUSDT",
            timeframe="1h",
        ),
        strategy_context=PaperSessionPreviewStrategyContext(
            strategy_id=str(uuid4()),
            strategy_version_id=str(uuid4()),
            source_valid=True,
            version_locked=True,
            dirty=False,
        ),
        dataset_context=PaperSessionPreviewDatasetContext(
            dataset_key="binance:BTCUSDT:1h",
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            start_at=_dt(0),
            end_at=_dt(2),
            preflight_outcome="ready" if allowed else "needs_fill",
        ),
    )


def test_paper_session_preview_route_returns_allowed_success_envelope(monkeypatch) -> None:
    calls = {"preview": 0}

    def fake_build(*args, **kwargs):
        calls["preview"] += 1
        return _result(allowed=True)

    monkeypatch.setattr("tradelab_api.api.paper.build_paper_session_preview", fake_build)

    data = assert_success_envelope(client.post("/api/tradelab/paper/sessions/preview", json=_payload()))

    assert calls == {"preview": 1}
    assert data["mode"] == "paper"
    assert data["previewStatus"] == "allowed"
    assert data["allowed"] is True
    assert data["reasonCode"] == "paper_risk_gate_passed"
    assert data["failedGates"] == []
    assert data["safetyStatus"] == "read_only_preview"
    assert data["datasetContext"]["datasetKey"] == "binance:BTCUSDT:1h"


def test_paper_session_preview_route_returns_blocked_success_envelope(monkeypatch) -> None:
    monkeypatch.setattr("tradelab_api.api.paper.build_paper_session_preview", lambda *args, **kwargs: _result(allowed=False))

    data = assert_success_envelope(client.post("/api/tradelab/paper/sessions/preview", json=_payload()))

    assert data["previewStatus"] == "blocked"
    assert data["allowed"] is False
    assert data["reasonCode"] == "paper_dataset_not_ready"
    assert data["failedGates"] == [
        {
            "gate": "dataset",
            "reasonCode": "paper_dataset_not_ready",
            "message": "Dataset must be ready for the requested paper range.",
            "data": {"sourceReasonCode": "needs_fill"},
        }
    ]


def test_paper_session_preview_route_returns_machine_readable_error(monkeypatch) -> None:
    def fake_build(*args, **kwargs):
        raise PaperSessionPreviewValidationError(404, "paper_bot_not_found", "Paper bot not found.")

    monkeypatch.setattr("tradelab_api.api.paper.build_paper_session_preview", fake_build)

    data = assert_error_envelope(client.post("/api/tradelab/paper/sessions/preview", json=_payload()), 404)

    assert data == {"reasonCode": "paper_bot_not_found"}


def test_paper_session_preview_route_does_not_write_paper_rows(monkeypatch) -> None:
    monkeypatch.setattr("tradelab_api.api.paper.build_paper_session_preview", lambda *args, **kwargs: _result(allowed=True))
    app.dependency_overrides[paper_api.get_db_session] = lambda: FakeReadOnlySession()
    try:
        data = assert_success_envelope(client.post("/api/tradelab/paper/sessions/preview", json=_payload()))
    finally:
        app.dependency_overrides.pop(paper_api.get_db_session, None)

    assert data["safetyStatus"] == "read_only_preview"


def test_preview_route_passes_kill_switch_status(monkeypatch) -> None:
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

    def fake_preview(*args, **kwargs):
        captured["enabled"] = kwargs["kill_switch_status"].enabled
        return _result(allowed=False)

    monkeypatch.setattr("tradelab_api.api.paper.build_paper_session_preview", fake_preview)
    response = client.post("/api/tradelab/paper/sessions/preview", json=_payload())

    assert response.status_code == 200
    assert captured == {"enabled": True}


def test_paper_session_preview_route_has_current_paper_runtime_routes_only() -> None:
    paper_routes = sorted(
        (getattr(route, "path", ""), getattr(route, "methods", set()))
        for route in app.routes
        if "/api/tradelab/paper" in getattr(route, "path", "")
    )

    assert paper_routes == [
        ("/api/tradelab/paper/safety/status", {"GET"}),
        ("/api/tradelab/paper/scheduler/status", {"GET"}),
        ("/api/tradelab/paper/sessions", {"GET"}),
        ("/api/tradelab/paper/sessions/engine-tick-local", {"POST"}),
        ("/api/tradelab/paper/sessions/preview", {"POST"}),
        ("/api/tradelab/paper/sessions/start", {"POST"}),
        ("/api/tradelab/paper/sessions/{session_id}", {"GET"}),
        ("/api/tradelab/paper/sessions/{session_id}/cancel-local", {"POST"}),
        ("/api/tradelab/paper/sessions/{session_id}/resume-local", {"POST"}),
        ("/api/tradelab/paper/sessions/{session_id}/resume-readiness", {"GET"}),
        ("/api/tradelab/paper/sessions/{session_id}/retry-local", {"POST"}),
        ("/api/tradelab/paper/sessions/{session_id}/run-local", {"POST"}),
    ]


def test_paper_session_routes_do_not_expose_artifact_or_execution_words() -> None:
    paper_route_paths = [
        getattr(route, "path", "")
        for route in app.routes
        if "/api/tradelab/paper" in getattr(route, "path", "")
    ]

    forbidden = ("execute", "order", "fill", "position", "portfolio")
    assert sorted(paper_route_paths) == [
        "/api/tradelab/paper/safety/status",
        "/api/tradelab/paper/scheduler/status",
        "/api/tradelab/paper/sessions",
        "/api/tradelab/paper/sessions/engine-tick-local",
        "/api/tradelab/paper/sessions/preview",
        "/api/tradelab/paper/sessions/start",
        "/api/tradelab/paper/sessions/{session_id}",
        "/api/tradelab/paper/sessions/{session_id}/cancel-local",
        "/api/tradelab/paper/sessions/{session_id}/resume-local",
        "/api/tradelab/paper/sessions/{session_id}/resume-readiness",
        "/api/tradelab/paper/sessions/{session_id}/retry-local",
        "/api/tradelab/paper/sessions/{session_id}/run-local",
    ]
    assert all(all(word not in path for word in forbidden) for path in paper_route_paths)
