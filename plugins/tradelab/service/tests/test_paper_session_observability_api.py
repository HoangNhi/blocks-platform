from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from fastapi.testclient import TestClient

from tradelab_api.api import paper as paper_api
from tradelab_api.main import app
from tradelab_api.services.paper_session_observability import (
    PaperSessionObservabilityArtifactCounts,
    PaperSessionObservabilityGateSummary,
    PaperSessionObservabilityItem,
    PaperSessionObservabilityLatestAudit,
    PaperSessionObservabilityResult,
    PaperSessionObservabilityValidationError,
)

client = TestClient(app)


def _dt(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 1, 1, hour, minute, tzinfo=timezone.utc)


def _result(session_id: str) -> PaperSessionObservabilityResult:
    return PaperSessionObservabilityResult(
        safety_status="read_only_paper_session_observability",
        items=[
            PaperSessionObservabilityItem(
                session_id=session_id,
                status="completed",
                reason_code="paper_engine_completed",
                safety_status="read_only_paper_session_observability",
                strategy_id=str(uuid4()),
                strategy_version_id=str(uuid4()),
                dataset_key="binance:BTCUSDT:1h",
                exchange="binance",
                symbol="BTCUSDT",
                timeframe="1h",
                start_at=_dt(0),
                end_at=_dt(2),
                created_at=_dt(0, 1),
                started_at=_dt(0, 2),
                finished_at=_dt(0, 5),
                error_message=None,
                artifact_counts=PaperSessionObservabilityArtifactCounts(
                    orders=2,
                    fills=1,
                    positions=1,
                    portfolio_snapshots=3,
                    audit_events=4,
                ),
                latest_audit=PaperSessionObservabilityLatestAudit(
                    audit_event_id=str(uuid4()),
                    event_at=_dt(0, 5),
                    action="paper_session_completed",
                    reason_code="paper_engine_completed",
                    new_state="completed",
                    actor="local-worker",
                    metadata={"safe": "visible"},
                ),
                gate_summary=PaperSessionObservabilityGateSummary(
                    failed_gate_count=0,
                    failed_gate_reasons=[],
                    blocked_reason_code=None,
                ),
            )
        ],
        has_more=False,
    )


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
        raise AssertionError("Paper session observability route must not commit.")

    def add(self, value) -> None:
        raise AssertionError("Paper session observability route must not add rows.")

    def flush(self) -> None:
        raise AssertionError("Paper session observability route must not flush writes.")

    def close(self) -> None:
        pass


def test_paper_session_observability_route_returns_success_envelope(monkeypatch) -> None:
    calls: dict[str, object] = {}
    strategy_id = str(uuid4())
    version_id = str(uuid4())
    session_id = str(uuid4())

    def fake_observability(repository, *, strategy_id, strategy_version_id, dataset_key, status, limit):
        calls.update(
            {
                "strategy_id": strategy_id,
                "strategy_version_id": strategy_version_id,
                "dataset_key": dataset_key,
                "status": status,
                "limit": limit,
            }
        )
        return _result(session_id)

    monkeypatch.setattr("tradelab_api.api.paper.build_paper_session_observability", fake_observability)

    data = assert_success_envelope(
        client.get(
            "/api/tradelab/paper/sessions",
            params={
                "strategyId": strategy_id,
                "strategyVersionId": version_id,
                "datasetKey": "binance:BTCUSDT:1h",
                "status": "completed",
                "limit": 5,
            },
        )
    )

    assert calls == {
        "strategy_id": strategy_id,
        "strategy_version_id": version_id,
        "dataset_key": "binance:BTCUSDT:1h",
        "status": "completed",
        "limit": 5,
    }
    assert data["safetyStatus"] == "read_only_paper_session_observability"
    assert data["hasMore"] is False
    assert data["items"][0]["sessionId"] == session_id
    assert data["items"][0]["artifactCounts"] == {
        "orders": 2,
        "fills": 1,
        "positions": 1,
        "portfolioSnapshots": 3,
        "auditEvents": 4,
    }
    assert data["items"][0]["latestAudit"]["action"] == "paper_session_completed"


def test_paper_session_observability_route_returns_machine_readable_invalid_filter(monkeypatch) -> None:
    def fake_observability(repository, *, strategy_id, strategy_version_id, dataset_key, status, limit):
        raise PaperSessionObservabilityValidationError(
            400,
            "paper_session_observability_invalid_filter",
            "Invalid paper session observability filter: status.",
            {"filter": "status", "allowedStatuses": ["completed"]},
        )

    monkeypatch.setattr("tradelab_api.api.paper.build_paper_session_observability", fake_observability)

    data = assert_error_envelope(client.get("/api/tradelab/paper/sessions", params={"status": "retry"}), 400)

    assert data == {
        "reasonCode": "paper_session_observability_invalid_filter",
        "filter": "status",
        "allowedStatuses": ["completed"],
    }


def test_paper_session_observability_route_is_read_only(monkeypatch) -> None:
    session_id = str(uuid4())
    monkeypatch.setattr(
        "tradelab_api.api.paper.build_paper_session_observability",
        lambda repository, *, strategy_id, strategy_version_id, dataset_key, status, limit: _result(session_id),
    )
    app.dependency_overrides[paper_api.get_db_session] = lambda: FakeReadOnlySession()
    try:
        data = assert_success_envelope(client.get("/api/tradelab/paper/sessions"))
    finally:
        app.dependency_overrides.pop(paper_api.get_db_session, None)

    assert data["safetyStatus"] == "read_only_paper_session_observability"
