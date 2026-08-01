from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

from fastapi.testclient import TestClient

from tradelab_api.api import paper as paper_api
from tradelab_api.main import app
from tradelab_api.services.paper_session_detail import (
    PaperSessionDetailArtifacts,
    PaperSessionDetailArtifactLimits,
    PaperSessionDetailAuditEvent,
    PaperSessionDetailFill,
    PaperSessionDetailOrder,
    PaperSessionDetailPortfolioSnapshot,
    PaperSessionDetailPosition,
    PaperSessionDetailResult,
    PaperSessionDetailSession,
    PaperSessionDetailValidationError,
)

client = TestClient(app)


def _dt(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 1, 1, hour, minute, tzinfo=timezone.utc)


def _result(session_id: str) -> PaperSessionDetailResult:
    return PaperSessionDetailResult(
        session=PaperSessionDetailSession(
            session_id=session_id,
            bot_id=str(uuid4()),
            strategy_id=str(uuid4()),
            strategy_version_id=str(uuid4()),
            mode="paper",
            status="queued",
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            dataset_key="binance:BTCUSDT:1h",
            start_at=_dt(0),
            end_at=_dt(2),
            started_at=None,
            finished_at=None,
            cancel_requested_at=None,
            starting_cash=Decimal("10000"),
            reason_code="paper_session_queued",
            error_message=None,
            created_at=_dt(0, 1),
            created_by="local-user",
            updated_at=None,
            updated_by=None,
        ),
        dataset_context={"datasetKey": "binance:BTCUSDT:1h", "preflightOutcome": "ready"},
        gate_context={"idempotencyKey": "idempotency-key"},
        audit_events=[
            PaperSessionDetailAuditEvent(
                audit_event_id=str(uuid4()),
                event_at=_dt(0, 2),
                actor="local-user",
                action="paper_session_queued",
                target_type="paper_session",
                target_id=session_id,
                old_state=None,
                new_state="queued",
                reason_code="paper_session_queued",
                correlation_id="idempotency-key",
                request_id="paper-start:fingerprint",
                metadata={"trace": "queued"},
                created_at=_dt(0, 2),
                created_by="local-user",
            )
        ],
        artifacts=PaperSessionDetailArtifacts(
            orders=[
                PaperSessionDetailOrder(
                    order_id=str(uuid4()),
                    side="buy",
                    order_type="market",
                    status="filled",
                    quantity=Decimal("1"),
                    requested_price=None,
                    requested_notional=Decimal("100"),
                    submitted_at=_dt(0, 2),
                    finalized_at=_dt(0, 3),
                    reason_code=None,
                    metadata={"orderKey": "order-0"},
                    created_at=_dt(0, 2),
                    created_by="paper-engine",
                    updated_at=None,
                    updated_by=None,
                )
            ],
            fills=[
                PaperSessionDetailFill(
                    fill_id=str(uuid4()),
                    paper_order_id=str(uuid4()),
                    source_candle_id=None,
                    fill_time=_dt(0, 3),
                    side="buy",
                    price=Decimal("100"),
                    quantity=Decimal("1"),
                    notional=Decimal("100"),
                    fee_amount=Decimal("0.1"),
                    fee_asset="quote",
                    slippage_amount=Decimal("0"),
                    metadata={"orderKey": "order-0"},
                    created_at=_dt(0, 3),
                    created_by="paper-engine",
                )
            ],
            positions=[
                PaperSessionDetailPosition(
                    position_id=str(uuid4()),
                    symbol="BTCUSDT",
                    side="long",
                    status="open",
                    quantity=Decimal("1"),
                    average_entry_price=Decimal("100"),
                    realized_pnl=Decimal("0"),
                    unrealized_pnl=Decimal("10"),
                    opened_at=_dt(0, 3),
                    closed_at=None,
                    metadata={"source": "paper-engine"},
                    created_at=_dt(0, 3),
                    created_by="paper-engine",
                    updated_at=None,
                    updated_by=None,
                )
            ],
            portfolio_snapshots=[
                PaperSessionDetailPortfolioSnapshot(
                    snapshot_id=str(uuid4()),
                    source_candle_id=None,
                    snapshot_at=_dt(0, 3),
                    cash_balance=Decimal("900"),
                    equity=Decimal("1010"),
                    realized_pnl=Decimal("0"),
                    unrealized_pnl=Decimal("10"),
                    fees_paid=Decimal("0.1"),
                    drawdown_pct=Decimal("0"),
                    exposure_notional=Decimal("100"),
                    metadata={"sourceCandleId": "candle-1"},
                    created_at=_dt(0, 3),
                    created_by="paper-engine",
                )
            ],
            limits=PaperSessionDetailArtifactLimits(
                orders=100,
                fills=100,
                positions=20,
                portfolio_snapshots=100,
                audit_events=20,
            ),
        ),
        safety_status="read_only_paper_session_detail",
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
        raise AssertionError("Paper session detail route must not commit.")

    def add(self, value) -> None:
        raise AssertionError("Paper session detail route must not add rows.")

    def flush(self) -> None:
        raise AssertionError("Paper session detail route must not flush writes.")

    def close(self) -> None:
        pass


def test_paper_session_detail_route_returns_success_envelope(monkeypatch) -> None:
    session_id = uuid4()
    calls = {"detail": 0}

    def fake_detail(repository, *, session_id):
        calls["detail"] += 1
        return _result(str(session_id))

    monkeypatch.setattr("tradelab_api.api.paper.build_paper_session_detail", fake_detail)

    data = assert_success_envelope(client.get(f"/api/tradelab/paper/sessions/{session_id}"))

    assert calls == {"detail": 1}
    assert data["safetyStatus"] == "read_only_paper_session_detail"
    assert data["session"]["sessionId"] == str(session_id)
    assert data["session"]["status"] == "queued"
    assert data["session"]["startingCash"] == "10000"
    assert data["datasetContext"] == {"datasetKey": "binance:BTCUSDT:1h", "preflightOutcome": "ready"}
    assert data["gateContext"] == {"idempotencyKey": "idempotency-key"}
    assert data["auditEvents"][0]["action"] == "paper_session_queued"
    assert data["auditEvents"][0]["metadata"] == {"trace": "queued"}
    assert data["artifacts"]["limits"] == {
        "orders": 100,
        "fills": 100,
        "positions": 20,
        "portfolioSnapshots": 100,
        "auditEvents": 20,
    }
    assert data["artifacts"]["orders"][0]["quantity"] == "1"
    assert data["artifacts"]["orders"][0]["requestedNotional"] == "100"
    assert data["artifacts"]["fills"][0]["paperOrderId"]
    assert data["artifacts"]["fills"][0]["price"] == "100"
    assert data["artifacts"]["positions"][0]["positionId"]
    assert data["artifacts"]["positions"][0]["unrealizedPnl"] == "10"
    assert data["artifacts"]["portfolioSnapshots"][0]["snapshotId"]
    assert data["artifacts"]["portfolioSnapshots"][0]["equity"] == "1010"


def test_paper_session_detail_route_returns_machine_readable_not_found(monkeypatch) -> None:
    session_id = uuid4()

    def fake_detail(repository, *, session_id):
        raise PaperSessionDetailValidationError(404, "paper_session_not_found", "Paper session not found.")

    monkeypatch.setattr("tradelab_api.api.paper.build_paper_session_detail", fake_detail)

    data = assert_error_envelope(client.get(f"/api/tradelab/paper/sessions/{session_id}"), 404)

    assert data == {"reasonCode": "paper_session_not_found"}


def test_paper_session_detail_route_is_read_only(monkeypatch) -> None:
    session_id = uuid4()

    monkeypatch.setattr(
        "tradelab_api.api.paper.build_paper_session_detail",
        lambda repository, *, session_id: _result(str(session_id)),
    )
    app.dependency_overrides[paper_api.get_db_session] = lambda: FakeReadOnlySession()
    try:
        data = assert_success_envelope(client.get(f"/api/tradelab/paper/sessions/{session_id}"))
    finally:
        app.dependency_overrides.pop(paper_api.get_db_session, None)

    assert data["safetyStatus"] == "read_only_paper_session_detail"
