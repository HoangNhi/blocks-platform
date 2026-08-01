from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from tradelab_api.services.paper_session_detail import (
    PaperSessionDetailValidationError,
    build_paper_session_detail,
)

def _dt(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 1, 1, hour, minute, tzinfo=timezone.utc)

def _session(session_id: UUID | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        id=session_id or uuid4(),
        bot_id=uuid4(),
        strategy_id=uuid4(),
        strategy_version_id=uuid4(),
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
        dataset_context={
            "datasetKey": "binance:BTCUSDT:1h",
            "preflightOutcome": "ready",
        },
        gate_context={
            "idempotencyKey": "idempotency-key",
            "requestFingerprint": "paper-start:fingerprint",
            "gateResult": {"reasonCode": "paper_risk_gate_passed"},
        },
        reason_code="paper_session_queued",
        error_message=None,
        created_at=_dt(0, 1),
        created_by="local-user",
        updated_at=None,
        updated_by=None,
    )

def _audit_event(action: str, minute: int) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        event_at=_dt(0, minute),
        actor="local-user",
        action=action,
        target_type="paper_session",
        target_id=uuid4(),
        old_state=None,
        new_state="queued",
        reason_code=action,
        correlation_id="idempotency-key",
        request_id="paper-start:fingerprint",
        metadata_={"trace": action},
        created_at=_dt(0, minute),
        created_by="local-user",
    )

def _paper_order(order_id: UUID, minute: int, metadata: dict[str, object] | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        id=order_id,
        side="buy",
        order_type="market",
        status="filled",
        quantity=Decimal("1"),
        requested_price=None,
        requested_notional=Decimal("100"),
        submitted_at=_dt(0, minute),
        finalized_at=_dt(0, minute + 1),
        reason_code=None,
        metadata_=metadata or {"orderKey": f"order-{minute}"},
        created_at=_dt(0, minute),
        created_by="paper-engine",
        updated_at=None,
        updated_by=None,
    )

def _paper_fill(
    fill_id: UUID,
    paper_order_id: UUID,
    minute: int,
    metadata: dict[str, object] | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=fill_id,
        paper_order_id=paper_order_id,
        source_candle_id=None,
        fill_time=_dt(0, minute),
        side="buy",
        price=Decimal("100"),
        quantity=Decimal("1"),
        notional=Decimal("100"),
        fee_amount=Decimal("0.1"),
        fee_asset="quote",
        slippage_amount=Decimal("0"),
        metadata_=metadata or {"orderKey": f"order-{minute}"},
        created_at=_dt(0, minute),
        created_by="paper-engine",
    )

def _paper_position(position_id: UUID, symbol: str, quantity: Decimal) -> SimpleNamespace:
    return SimpleNamespace(
        id=position_id,
        symbol=symbol,
        side="long",
        status="open",
        quantity=quantity,
        average_entry_price=Decimal("100"),
        realized_pnl=Decimal("0"),
        unrealized_pnl=Decimal("10"),
        opened_at=_dt(0, 1),
        closed_at=None,
        metadata_={"source": "paper-engine"},
        created_at=_dt(0, 1),
        created_by="paper-engine",
        updated_at=None,
        updated_by=None,
    )

def _portfolio_snapshot(
    snapshot_id: UUID,
    minute: int,
    metadata: dict[str, object] | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=snapshot_id,
        source_candle_id=None,
        snapshot_at=_dt(0, minute),
        cash_balance=Decimal("900"),
        equity=Decimal("1010"),
        realized_pnl=Decimal("0"),
        unrealized_pnl=Decimal("10"),
        fees_paid=Decimal("0.1"),
        drawdown_pct=Decimal("0"),
        exposure_notional=Decimal("100"),
        metadata_=metadata or {"sourceCandleId": f"candle-{minute}"},
        created_at=_dt(0, minute),
        created_by="paper-engine",
    )

class FakePaperRepository:
    def __init__(
        self,
        session: SimpleNamespace | None,
        audit_events: list[SimpleNamespace] | None = None,
        orders: list[SimpleNamespace] | None = None,
        fills: list[SimpleNamespace] | None = None,
        positions: list[SimpleNamespace] | None = None,
        portfolio_snapshots: list[SimpleNamespace] | None = None,
    ) -> None:
        self.session = session
        self.audit_events = audit_events or []
        self.orders = orders or []
        self.fills = fills or []
        self.positions = positions or []
        self.portfolio_snapshots = portfolio_snapshots or []
        self.audit_limit: int | None = None
        self.order_limit: int | None = None
        self.fill_limit: int | None = None
        self.position_limit: int | None = None
        self.portfolio_snapshot_limit: int | None = None
        self.artifact_methods_called: list[str] = []

    def get_paper_session(self, session_id: UUID):
        return self.session if self.session is not None and self.session.id == session_id else None

    def list_audit_events_for_session(self, session_id: UUID, *, limit: int):
        self.audit_limit = limit
        return list(self.audit_events)

    def list_orders_for_session(self, session_id: UUID, *, limit: int):
        self.artifact_methods_called.append("orders")
        self.order_limit = limit
        return list(self.orders)

    def list_fills_for_session(self, session_id: UUID, *, limit: int):
        self.artifact_methods_called.append("fills")
        self.fill_limit = limit
        return list(self.fills)

    def list_positions_for_session(self, session_id: UUID, *, limit: int):
        self.artifact_methods_called.append("positions")
        self.position_limit = limit
        return list(self.positions)

    def list_portfolio_snapshots_for_session(self, session_id: UUID, *, limit: int):
        self.artifact_methods_called.append("portfolio_snapshots")
        self.portfolio_snapshot_limit = limit
        return list(self.portfolio_snapshots)

    def create_paper_session(self, **fields):
        raise AssertionError("Paper session detail must not create sessions.")

    def create_audit_event(self, **fields):
        raise AssertionError("Paper session detail must not create audit events.")

    def create_order(self, **fields):
        raise AssertionError("Paper session detail must not create orders.")

def test_detail_returns_session_context_and_audit_events() -> None:
    session = _session()
    repository = FakePaperRepository(
        session,
        [_audit_event("paper_idempotency_replayed", 3), _audit_event("paper_session_queued", 2)],
    )

    result = build_paper_session_detail(repository, session_id=session.id)

    assert result.safety_status == "read_only_paper_session_detail"
    assert result.session.session_id == str(session.id)
    assert result.session.bot_id == str(session.bot_id)
    assert result.session.strategy_id == str(session.strategy_id)
    assert result.session.strategy_version_id == str(session.strategy_version_id)
    assert result.session.status == "queued"
    assert result.session.starting_cash == Decimal("10000")
    assert result.dataset_context == session.dataset_context
    assert result.gate_context == session.gate_context
    assert [event.action for event in result.audit_events] == [
        "paper_session_queued",
        "paper_idempotency_replayed",
    ]
    assert result.audit_events[0].metadata == {"trace": "paper_session_queued"}
    assert repository.audit_limit == 20

def test_detail_limits_audit_events_to_20_sorted_by_event_at() -> None:
    session = _session()
    audit_events = [_audit_event(f"event-{minute}", minute) for minute in range(25, 0, -1)]
    repository = FakePaperRepository(session, audit_events)

    result = build_paper_session_detail(repository, session_id=session.id)

    assert len(result.audit_events) == 20
    assert [event.action for event in result.audit_events] == [f"event-{minute}" for minute in range(1, 21)]
    assert repository.audit_limit == 20

def test_detail_returns_bounded_runtime_artifacts_with_sanitized_metadata() -> None:
    session = _session()
    order_1 = _paper_order(uuid4(), 2, {"apiKey": "secret-key", "nested": {"token": "secret-token"}})
    order_2 = _paper_order(uuid4(), 1)
    fill_1 = _paper_fill(uuid4(), order_1.id, 2, {"privateKey": "secret-private"})
    fill_2 = _paper_fill(uuid4(), order_2.id, 1)
    position_b = _paper_position(uuid4(), "ETHUSDT", Decimal("2"))
    position_a = _paper_position(uuid4(), "BTCUSDT", Decimal("1"))
    snapshot_1 = _portfolio_snapshot(uuid4(), 2, {"passphrase": "secret-passphrase"})
    snapshot_2 = _portfolio_snapshot(uuid4(), 1)
    audit = _audit_event("paper_session_completed", 4)
    audit.metadata_ = {"password": "secret-password", "safe": ["keep", {"secret": "hidden"}]}
    repository = FakePaperRepository(
        session,
        audit_events=[audit],
        orders=[order_1, order_2],
        fills=[fill_1, fill_2],
        positions=[position_b, position_a],
        portfolio_snapshots=[snapshot_1, snapshot_2],
    )

    result = build_paper_session_detail(repository, session_id=session.id)

    assert result.artifacts.limits.orders == 100
    assert result.artifacts.limits.fills == 100
    assert result.artifacts.limits.positions == 20
    assert result.artifacts.limits.portfolio_snapshots == 100
    assert result.artifacts.limits.audit_events == 20
    assert repository.order_limit == 100
    assert repository.fill_limit == 100
    assert repository.position_limit == 20
    assert repository.portfolio_snapshot_limit == 100
    assert [order.order_id for order in result.artifacts.orders] == [str(order_2.id), str(order_1.id)]
    assert [fill.fill_id for fill in result.artifacts.fills] == [str(fill_2.id), str(fill_1.id)]
    assert [position.symbol for position in result.artifacts.positions] == ["BTCUSDT", "ETHUSDT"]
    assert [snapshot.snapshot_id for snapshot in result.artifacts.portfolio_snapshots] == [
        str(snapshot_2.id),
        str(snapshot_1.id),
    ]
    assert result.artifacts.orders[1].metadata == {
        "apiKey": "[REDACTED]",
        "nested": {"token": "[REDACTED]"},
    }
    assert result.artifacts.fills[1].metadata == {"privateKey": "[REDACTED]"}
    assert result.artifacts.portfolio_snapshots[1].metadata == {"passphrase": "[REDACTED]"}
    assert result.audit_events[0].metadata == {
        "password": "[REDACTED]",
        "safe": ["keep", {"secret": "[REDACTED]"}],
    }

def test_detail_applies_default_artifact_limits_after_repository_returns_extra_rows() -> None:
    session = _session()
    repository = FakePaperRepository(
        session,
        orders=[_paper_order(uuid4(), minute % 50) for minute in range(130)],
        fills=[_paper_fill(uuid4(), uuid4(), minute % 50) for minute in range(130)],
        positions=[_paper_position(uuid4(), f"SYM{minute:02d}", Decimal("1")) for minute in range(25)],
        portfolio_snapshots=[_portfolio_snapshot(uuid4(), minute % 50) for minute in range(130)],
    )

    result = build_paper_session_detail(repository, session_id=session.id)

    assert len(result.artifacts.orders) == 100
    assert len(result.artifacts.fills) == 100
    assert len(result.artifacts.positions) == 20
    assert len(result.artifacts.portfolio_snapshots) == 100

def test_detail_missing_session_returns_machine_readable_error() -> None:
    repository = FakePaperRepository(None)

    with pytest.raises(PaperSessionDetailValidationError) as exc_info:
        build_paper_session_detail(repository, session_id=uuid4())

    assert exc_info.value.status_code == 404
    assert exc_info.value.reason_code == "paper_session_not_found"
    assert exc_info.value.message == "Paper session not found."
    assert repository.audit_limit is None
    assert repository.artifact_methods_called == []
