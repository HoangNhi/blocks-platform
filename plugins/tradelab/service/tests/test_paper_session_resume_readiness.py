from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from tradelab_api.services.paper_session_resume_readiness import (
    READ_ONLY_PAPER_RESUME_READINESS_SAFETY_STATUS,
    PaperSessionResumeReadinessValidationError,
    build_paper_session_resume_readiness,
)

def _dt(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 1, 1, hour, minute, tzinfo=timezone.utc)

def _session(*, status: str = "cancelled", reason_code: str = "paper_session_cancel_requested") -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        mode="paper",
        status=status,
        reason_code=reason_code,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        dataset_key="binance:BTCUSDT:1h",
        start_at=_dt(0),
        end_at=_dt(5),
        starting_cash=Decimal("10000"),
        runtime_config={"feeBps": "0", "slippageBps": "0"},
        risk_config={"maxOpenPositions": 2},
        source_snapshot={"sourceHash": "hash"},
        dataset_context={"datasetKey": "binance:BTCUSDT:1h"},
        gate_context={"gateResult": {"reasonCode": "paper_risk_gate_passed"}},
        error_message=None,
    )

def _snapshot(*, source_candle_id: UUID | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        paper_session_id=uuid4(),
        source_candle_id=source_candle_id or uuid4(),
        snapshot_at=_dt(2),
        cash_balance=Decimal("9900"),
        equity=Decimal("10050"),
        realized_pnl=Decimal("25"),
        unrealized_pnl=Decimal("125"),
        fees_paid=Decimal("1.5"),
        drawdown_pct=Decimal("0.25"),
        exposure_notional=Decimal("500"),
        metadata_={"source": "paper-engine"},
    )

def _position() -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        symbol="BTCUSDT",
        side="long",
        status="open",
        quantity=Decimal("0.25"),
        average_entry_price=Decimal("40000"),
        realized_pnl=Decimal("25"),
        unrealized_pnl=Decimal("125"),
    )

def _candle() -> SimpleNamespace:
    return SimpleNamespace(id=uuid4(), open_time=_dt(3), close_time=_dt(3, 59))

class FakeResumeReadinessRepository:
    def __init__(
        self,
        session: SimpleNamespace | None,
        *,
        latest_snapshot: SimpleNamespace | None = None,
        open_positions: list[SimpleNamespace] | None = None,
        pending_orders: list[SimpleNamespace] | None = None,
        next_candle: SimpleNamespace | None = None,
        resume_checkpoint: SimpleNamespace | None = None,
        artifact_identity_status: str = "ready",
    ) -> None:
        self.session = session
        self.latest_snapshot = latest_snapshot
        self.open_positions = open_positions or []
        self.pending_orders = pending_orders or []
        self.next_candle = next_candle
        self.resume_checkpoint = resume_checkpoint
        self.artifact_identity_status = artifact_identity_status

    def get_paper_session(self, session_id: UUID):
        return self.session if self.session is not None and self.session.id == session_id else None

    def get_latest_portfolio_snapshot_for_session(self, session_id: UUID):
        return self.latest_snapshot

    def list_open_positions_for_session(self, session_id: UUID):
        return list(self.open_positions)

    def list_pending_orders_for_session(self, session_id: UUID):
        return list(self.pending_orders)

    def get_latest_resume_checkpoint_for_session(self, session_id: UUID):
        return self.resume_checkpoint

    def get_artifact_identity_status_for_session(self, session_id: UUID) -> str:
        return self.artifact_identity_status

    def get_next_market_candle_after(
        self,
        *,
        exchange: str,
        symbol: str,
        timeframe: str,
        after_open_time: datetime,
        end_at: datetime,
    ):
        return self.next_candle

    def create_paper_session(self, **fields):
        raise AssertionError("Resume readiness must not create paper sessions.")

    def create_audit_event(self, **fields):
        raise AssertionError("Resume readiness must not create audit events.")

def _build(repository: FakeResumeReadinessRepository, session_id: UUID):
    return build_paper_session_resume_readiness(repository, session_id=session_id)

def _persisted_checkpoint(*, attempt_no: int = 0, strategy_state: str = "stateless_between_candles") -> SimpleNamespace:
    return SimpleNamespace(
        attempt_no=attempt_no,
        last_processed_candle_id=uuid4(),
        last_processed_candle_open_time=_dt(2),
        next_candle_id=uuid4(),
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
        strategy_runtime_state_status=strategy_state,
    )

def test_resume_readiness_returns_allowed_checkpoint_for_cancelled_session() -> None:
    session = _session()
    snapshot = _snapshot()
    repository = FakeResumeReadinessRepository(
        session,
        latest_snapshot=snapshot,
        resume_checkpoint=_persisted_checkpoint(),
        open_positions=[_position()],
        pending_orders=[],
        next_candle=_candle(),
    )

    result = _build(repository, session.id)

    assert result.safety_status == READ_ONLY_PAPER_RESUME_READINESS_SAFETY_STATUS
    assert result.session_id == str(session.id)
    assert result.status == "cancelled"
    assert result.allowed is True
    assert result.reason_code == "paper_local_resume_readiness_ready"
    assert result.checkpoint is not None
    assert result.checkpoint.last_processed_candle_open_time == _dt(2)
    assert result.checkpoint.next_candle_open_time == _dt(3)
    assert result.checkpoint.cash_balance == Decimal("9900")
    assert result.checkpoint.open_position_quantity == Decimal("0.25")
    assert result.checkpoint.pending_orders_count == 0
    assert result.checkpoint_source == "persisted"
    assert result.artifact_identity_status == "ready"
    assert result.resume_mode == "same_session"
    assert result.attempt_no == 0
    assert result.blocking_reasons == []

def test_resume_readiness_prefers_persisted_checkpoint() -> None:
    session = _session()
    checkpoint = _persisted_checkpoint(attempt_no=2)
    repository = FakeResumeReadinessRepository(
        session,
        latest_snapshot=_snapshot(),
        resume_checkpoint=checkpoint,
        next_candle=_candle(),
    )

    result = _build(repository, session.id)

    assert result.allowed is True
    assert result.checkpoint_source == "persisted"
    assert result.artifact_identity_status == "ready"
    assert result.resume_mode == "same_session"
    assert result.attempt_no == 2
    assert result.checkpoint is not None
    assert result.checkpoint.cash_balance == Decimal("9900")

def test_resume_readiness_blocks_derived_checkpoint() -> None:
    session = _session()
    repository = FakeResumeReadinessRepository(
        session,
        latest_snapshot=_snapshot(),
        next_candle=_candle(),
    )

    result = _build(repository, session.id)

    assert result.allowed is False
    assert result.checkpoint_source == "derived"
    assert "paper_local_resume_checkpoint_missing" in result.blocking_reasons

def test_resume_readiness_blocks_missing_artifact_identity() -> None:
    session = _session()
    repository = FakeResumeReadinessRepository(
        session,
        resume_checkpoint=_persisted_checkpoint(),
        artifact_identity_status="missing",
    )

    result = _build(repository, session.id)

    assert result.allowed is False
    assert result.artifact_identity_status == "missing"
    assert "paper_local_resume_artifact_identity_missing" in result.blocking_reasons

def test_resume_readiness_blocks_unsupported_strategy_state() -> None:
    session = _session()
    repository = FakeResumeReadinessRepository(
        session,
        resume_checkpoint=_persisted_checkpoint(strategy_state="unsupported"),
    )

    result = _build(repository, session.id)

    assert result.allowed is False
    assert result.checkpoint_source == "persisted"
    assert "paper_local_resume_strategy_state_unsupported" in result.blocking_reasons


def test_resume_readiness_blocks_persisted_checkpoint_missing_next_cursor() -> None:
    session = _session()
    checkpoint = _persisted_checkpoint()
    checkpoint.next_candle_id = None
    checkpoint.next_candle_open_time = None
    repository = FakeResumeReadinessRepository(session, resume_checkpoint=checkpoint)

    result = _build(repository, session.id)

    assert result.allowed is False
    assert result.reason_code == "paper_local_resume_no_remaining_candles"
    assert "paper_local_resume_no_remaining_candles" in result.blocking_reasons

@pytest.mark.parametrize(
    ("status", "reason_code"),
    [
        ("queued", "paper_session_queued"),
        ("running", "paper_engine_running"),
        ("cancel_requested", "paper_local_cancel_requested"),
        ("completed", "paper_engine_completed"),
        ("failed", "paper_engine_strategy_error"),
        ("blocked", "paper_risk_gate_failed"),
        ("cancelled", "paper_local_cancelled"),
    ],
)
def test_resume_readiness_blocks_non_resumable_statuses(status: str, reason_code: str) -> None:
    session = _session(status=status, reason_code=reason_code)
    repository = FakeResumeReadinessRepository(
        session,
        latest_snapshot=_snapshot(),
        next_candle=_candle(),
    )

    result = _build(repository, session.id)

    assert result.allowed is False
    assert result.reason_code == "paper_local_resume_not_resumable"
    assert "paper_local_resume_not_resumable" in result.blocking_reasons

def test_resume_readiness_blocks_missing_checkpoint() -> None:
    session = _session()
    repository = FakeResumeReadinessRepository(session, latest_snapshot=None, next_candle=_candle())

    result = _build(repository, session.id)

    assert result.allowed is False
    assert result.reason_code == "paper_local_resume_checkpoint_missing"
    assert result.checkpoint is None
    assert "paper_local_resume_checkpoint_missing" in result.blocking_reasons

def test_resume_readiness_blocks_pending_orders() -> None:
    session = _session()
    pending_order = SimpleNamespace(id=uuid4(), status="accepted")
    repository = FakeResumeReadinessRepository(
        session,
        latest_snapshot=_snapshot(),
        pending_orders=[pending_order],
        next_candle=_candle(),
    )

    result = _build(repository, session.id)

    assert result.allowed is False
    assert result.reason_code == "paper_local_resume_pending_orders_unsupported"
    assert result.checkpoint is not None
    assert result.checkpoint.pending_orders_count == 1
    assert "paper_local_resume_pending_orders_unsupported" in result.blocking_reasons

def test_resume_readiness_blocks_when_no_remaining_candles() -> None:
    session = _session()
    repository = FakeResumeReadinessRepository(session, latest_snapshot=_snapshot(), next_candle=None)

    result = _build(repository, session.id)

    assert result.allowed is False
    assert result.reason_code == "paper_local_resume_no_remaining_candles"
    assert "paper_local_resume_no_remaining_candles" in result.blocking_reasons

def test_resume_readiness_raises_not_found() -> None:
    missing_id = uuid4()
    repository = FakeResumeReadinessRepository(None)

    with pytest.raises(PaperSessionResumeReadinessValidationError) as exc:
        _build(repository, missing_id)

    assert exc.value.status_code == 404
    assert exc.value.reason_code == "paper_session_not_found"
