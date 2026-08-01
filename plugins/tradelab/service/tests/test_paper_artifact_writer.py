from __future__ import annotations

import os
from dataclasses import replace
from collections.abc import Iterator
from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://postgres:postgres123secure@localhost:5432/tradelab",
)

from tradelab_api.db.models import (  # noqa: E402
    Base,
    Bot,
    MarketCandle,
    PaperAuditEvent,
    PaperFill,
    PaperOrder,
    PaperPortfolioSnapshot,
    PaperPosition,
    PaperResumeCheckpoint,
    PaperSession,
    Strategy,
    StrategyGroup,
    StrategyVersion,
)
from tradelab_api.db.session import SessionLocal, apply_schema_compatibility, get_engine  # noqa: E402
from tradelab_api.services.paper_artifact_writer import (  # noqa: E402
    PaperArtifactWriterError,
    SqlAlchemyPaperArtifactWriter,
)
from tradelab_api.services.paper_engine import (  # noqa: E402
    PaperEngineArtifacts,
    PaperEngineAuditArtifact,
    PaperEngineFillArtifact,
    PaperEngineOrderArtifact,
    PaperEnginePortfolioSnapshotArtifact,
    PaperEnginePositionArtifact,
    PaperEngineTickResult,
)

Base.metadata.create_all(bind=get_engine())
apply_schema_compatibility()


def _dt(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 1, 1, hour, minute, tzinfo=timezone.utc)


@pytest.fixture()
def db_session() -> Iterator[Session]:
    connection = get_engine().connect()
    transaction = connection.begin()
    session = SessionLocal(bind=connection)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


def _create_strategy_tree(session: Session) -> dict[str, UUID]:
    suffix = uuid4().hex[:10]
    group = StrategyGroup(
        name=f"Paper Writer Group {suffix}",
        slug=f"paper-writer-group-{suffix}",
        description="Automated writer test group",
        metadata_={"visibility": "test", "purpose": "paper_artifact_writer"},
        created_by="pytest",
    )
    session.add(group)
    session.flush()

    strategy = Strategy(
        strategy_group_id=group.id,
        name=f"Paper Writer Strategy {suffix}",
        slug=f"paper-writer-strategy-{suffix}",
        description="Automated writer test strategy",
        status="active",
        runtime_config={},
        risk_config={},
        metadata_={"visibility": "test", "purpose": "paper_artifact_writer"},
        created_by="pytest",
    )
    session.add(strategy)
    session.flush()

    version = StrategyVersion(
        strategy_id=strategy.id,
        version_number=1,
        source_code="def on_candle(ctx):\n    return []\n",
        source_hash=f"hash-{suffix}",
        validation_status="valid",
        validation_message=None,
        created_by="pytest",
    )
    session.add(version)
    session.flush()
    strategy.current_version_id = version.id

    bot = Bot(
        strategy_id=strategy.id,
        strategy_version_id=version.id,
        name=f"Paper Writer Bot {suffix}",
        mode="paper",
        status="draft",
        symbol="BTCUSDT",
        timeframe="1h",
        runtime_config={},
        risk_config={},
        metadata_={"visibility": "test", "purpose": "paper_artifact_writer"},
        created_by="pytest",
    )
    session.add(bot)
    session.flush()
    return {
        "bot_id": bot.id,
        "strategy_id": strategy.id,
        "strategy_version_id": version.id,
    }


def _create_paper_session(session: Session) -> PaperSession:
    ids = _create_strategy_tree(session)
    paper_session = PaperSession(
        bot_id=ids["bot_id"],
        strategy_id=ids["strategy_id"],
        strategy_version_id=ids["strategy_version_id"],
        mode="paper",
        status="running",
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        dataset_key="binance:BTCUSDT:1h",
        start_at=_dt(0),
        end_at=_dt(3),
        started_at=None,
        finished_at=None,
        cancel_requested_at=None,
        starting_cash=Decimal("1000"),
        runtime_config={},
        risk_config={},
        source_snapshot={},
        dataset_context={"datasetKey": "binance:BTCUSDT:1h"},
        gate_context={
            "idempotencyKey": "writer-idempotency",
            "requestFingerprint": "writer-fingerprint",
            "gateResult": {"reasonCode": "paper_risk_gate_passed"},
        },
        reason_code="paper_session_running",
        error_message=None,
        created_by="pytest",
    )
    session.add(paper_session)
    session.flush()
    return paper_session


def _tick_result(session_id: UUID) -> PaperEngineTickResult:
    return PaperEngineTickResult(
        session_id=str(session_id),
        status="completed",
        reason_code="paper_session_completed",
        safety_status="pure_paper_engine_skeleton",
        candles_processed=2,
        orders_created=3,
        fills_created=1,
        snapshots_created=1,
        starting_cash=Decimal("1000"),
        ending_cash=Decimal("500"),
        ending_equity=Decimal("1100"),
        error_message=None,
        artifacts=PaperEngineArtifacts(
            orders=[
                PaperEngineOrderArtifact(
                    session_id=str(session_id),
                    order_key="order-0",
                    artifact_key=f"paper:{session_id}:attempt:0:candle:not-a-uuid-candle-0:kind:order:seq:0",
                    candle_id="not-a-uuid-candle-0",
                    action_kind="buy_market",
                    side="buy",
                    order_type="market",
                    status="accepted",
                    quantity=Decimal("5"),
                    requested_notional=Decimal("500"),
                    reason_code=None,
                    metadata={"apiSecret": "super-secret-value", "nested": {"token": "token-value"}},
                ),
                PaperEngineOrderArtifact(
                    session_id=str(session_id),
                    order_key="order-1",
                    artifact_key=f"paper:{session_id}:attempt:0:candle:not-a-uuid-candle-1:kind:order:seq:1",
                    candle_id="not-a-uuid-candle-1",
                    action_kind="sell_market",
                    side="sell",
                    order_type="market",
                    status="rejected",
                    quantity=Decimal("0"),
                    requested_notional=Decimal("100"),
                    reason_code="paper_insufficient_position",
                    metadata={"trace": "safe"},
                ),
                PaperEngineOrderArtifact(
                    session_id=str(session_id),
                    order_key="order-2",
                    artifact_key=f"paper:{session_id}:attempt:0:candle:not-a-uuid-candle-2:kind:order:seq:2",
                    candle_id="not-a-uuid-candle-2",
                    action_kind="limit_buy",
                    side=None,
                    order_type="market",
                    status="rejected",
                    quantity=Decimal("0"),
                    requested_notional=Decimal("100"),
                    reason_code="paper_order_type_not_supported",
                    metadata={"privateKey": "private-value"},
                ),
            ],
            fills=[
                PaperEngineFillArtifact(
                    session_id=str(session_id),
                    order_key="order-0",
                    artifact_key=f"paper:{session_id}:attempt:0:candle:not-a-uuid-candle-1:kind:fill:seq:0",
                    source_candle_id="not-a-uuid-candle-1",
                    fill_time=_dt(1),
                    side="buy",
                    price=Decimal("100"),
                    quantity=Decimal("5"),
                    notional=Decimal("500"),
                    fee_amount=Decimal("0.5"),
                    slippage_amount=Decimal("0.1"),
                    metadata={"sourceCandleId": "not-a-uuid-candle-1"},
                )
            ],
            positions=[
                PaperEnginePositionArtifact(
                    session_id=str(session_id),
                    symbol="BTCUSDT",
                    status="open",
                    quantity=Decimal("5"),
                    average_entry_price=Decimal("100"),
                    realized_pnl=Decimal("0"),
                    unrealized_pnl=Decimal("100"),
                )
            ],
            snapshots=[
                PaperEnginePortfolioSnapshotArtifact(
                    session_id=str(session_id),
                    artifact_key=f"paper:{session_id}:attempt:0:candle:not-a-uuid-candle-1:kind:snapshot:seq:0",
                    source_candle_id="not-a-uuid-candle-1",
                    snapshot_at=_dt(1, 30),
                    cash_balance=Decimal("500"),
                    equity=Decimal("1100"),
                    realized_pnl=Decimal("0"),
                    unrealized_pnl=Decimal("100"),
                    fees_paid=Decimal("0.5"),
                    drawdown_pct=Decimal("0"),
                    exposure_notional=Decimal("500"),
                    metadata={"fillIndex": 0, "sourceCandleId": "not-a-uuid-candle-1"},
                )
            ],
            audits=[
                PaperEngineAuditArtifact(
                    session_id=str(session_id),
                    artifact_key=f"paper:{session_id}:attempt:0:candle:not-a-uuid-candle-0:kind:audit:seq:0",
                    action="paper_order_created",
                    old_state=None,
                    new_state="accepted",
                    reason_code=None,
                    metadata={
                        "actor": "unit-test",
                        "correlationId": "correlation-1",
                        "requestId": "request-1",
                        "targetType": "paper_order",
                        "targetId": "not-a-uuid-order",
                        "apiKey": "key-value",
                    },
                ),
                PaperEngineAuditArtifact(
                    session_id=str(session_id),
                    artifact_key=f"paper:{session_id}:attempt:0:candle:not-a-uuid-candle-2:kind:audit:seq:1",
                    action="paper_order_rejected",
                    old_state=None,
                    new_state="rejected",
                    reason_code="paper_order_type_not_supported",
                    metadata={"orderKey": "order-2", "passphrase": "phrase-value"},
                ),
            ],
        ),
    )


def _stringify(value: object) -> str:
    if isinstance(value, dict):
        return " ".join(f"{key}={_stringify(item)}" for key, item in value.items())
    if isinstance(value, list):
        return " ".join(_stringify(item) for item in value)
    return str(value)


def test_writer_persists_artifacts_updates_session_and_sanitizes_metadata(db_session: Session) -> None:
    paper_session = _create_paper_session(db_session)
    result = _tick_result(paper_session.id)

    SqlAlchemyPaperArtifactWriter(db_session).write(result)

    orders = db_session.scalars(
        select(PaperOrder)
        .where(PaperOrder.paper_session_id == paper_session.id)
        .order_by(PaperOrder.created_at.asc())
    ).all()
    orders = sorted(orders, key=lambda order: order.metadata_["orderKey"])
    fills = db_session.scalars(select(PaperFill).where(PaperFill.paper_session_id == paper_session.id)).all()
    positions = db_session.scalars(select(PaperPosition).where(PaperPosition.paper_session_id == paper_session.id)).all()
    snapshots = db_session.scalars(
        select(PaperPortfolioSnapshot).where(PaperPortfolioSnapshot.paper_session_id == paper_session.id)
    ).all()
    audits = db_session.scalars(select(PaperAuditEvent).where(PaperAuditEvent.paper_session_id == paper_session.id)).all()
    db_session.refresh(paper_session)

    assert len(orders) == 2
    assert [order.metadata_["orderKey"] for order in orders] == ["order-0", "order-1"]
    assert orders[0].side == "buy"
    assert orders[0].status == "accepted"
    assert orders[1].side == "sell"
    assert orders[1].status == "rejected"
    assert orders[1].finalized_at is not None
    assert len(fills) == 1
    assert fills[0].paper_order_id == orders[0].id
    assert fills[0].source_candle_id is None
    assert fills[0].fee_asset == "quote"
    assert len(positions) == 1
    assert positions[0].symbol == "BTCUSDT"
    assert positions[0].side == "long"
    assert positions[0].status == "open"
    assert len(snapshots) == 1
    assert snapshots[0].source_candle_id is None
    assert len(audits) == 2
    assert audits[0].actor == "unit-test"
    assert audits[0].target_type == "paper_order"
    assert audits[0].target_id is None
    assert audits[0].correlation_id == "correlation-1"
    assert audits[0].request_id == "request-1"
    assert paper_session.status == "completed"
    assert paper_session.reason_code == "paper_session_completed"
    assert paper_session.error_message is None
    assert paper_session.started_at is not None
    assert paper_session.finished_at is not None
    assert paper_session.updated_by == "paper-engine"
    assert paper_session.gate_context["idempotencyKey"] == "writer-idempotency"
    assert paper_session.gate_context["requestFingerprint"] == "writer-fingerprint"
    assert paper_session.gate_context["gateResult"] == {"reasonCode": "paper_risk_gate_passed"}
    assert paper_session.gate_context["paperEngineSummary"] == {
        "candlesProcessed": 2,
        "ordersCreated": 3,
        "fillsCreated": 1,
        "snapshotsCreated": 1,
        "startingCash": "1000",
        "endingCash": "500",
        "endingEquity": "1100",
        "safetyStatus": "pure_paper_engine_skeleton",
        "writerVersion": "phase-8.11",
    }
    serialized_metadata = _stringify(
        {
            "orders": [order.metadata_ for order in orders],
            "fills": [fill.metadata_ for fill in fills],
            "snapshots": [snapshot.metadata_ for snapshot in snapshots],
            "audits": [audit.metadata_ for audit in audits],
        }
    )
    assert "super-secret-value" not in serialized_metadata
    assert "token-value" not in serialized_metadata
    assert "private-value" not in serialized_metadata
    assert "key-value" not in serialized_metadata
    assert "phrase-value" not in serialized_metadata
    assert "[REDACTED]" in serialized_metadata


def test_writer_rejects_missing_artifact_key(db_session: Session) -> None:
    paper_session = _create_paper_session(db_session)
    result = _tick_result(paper_session.id)
    result.artifacts.orders[0] = replace(result.artifacts.orders[0], artifact_key="")

    with pytest.raises(PaperArtifactWriterError) as exc_info:
        SqlAlchemyPaperArtifactWriter(db_session).write(result)

    assert exc_info.value.reason_code == "paper_artifact_identity_missing"

def test_writer_rejects_duplicate_artifact_key_in_payload(db_session: Session) -> None:
    paper_session = _create_paper_session(db_session)
    result = _tick_result(paper_session.id)
    result.artifacts.orders[1] = replace(
        result.artifacts.orders[1],
        artifact_key=result.artifacts.orders[0].artifact_key,
    )

    with pytest.raises(PaperArtifactWriterError) as exc_info:
        SqlAlchemyPaperArtifactWriter(db_session).write(result)

    assert exc_info.value.reason_code == "paper_artifact_duplicate"

def test_writer_rejects_duplicate_artifact_key_already_in_database(db_session: Session) -> None:
    paper_session = _create_paper_session(db_session)
    result = _tick_result(paper_session.id)
    SqlAlchemyPaperArtifactWriter(db_session).write(result)

    with pytest.raises(PaperArtifactWriterError) as exc_info:
        SqlAlchemyPaperArtifactWriter(db_session).write(_tick_result(paper_session.id))

    assert exc_info.value.reason_code == "paper_artifact_duplicate"

def test_writer_persists_resume_checkpoint(db_session: Session) -> None:
    paper_session = _create_paper_session(db_session)
    result = _tick_result(paper_session.id)

    SqlAlchemyPaperArtifactWriter(db_session).write(result)

    checkpoint = db_session.scalar(
        select(PaperResumeCheckpoint).where(PaperResumeCheckpoint.paper_session_id == paper_session.id)
    )

    assert checkpoint is not None
    assert checkpoint.attempt_no == 0
    assert checkpoint.checkpoint_source == "persisted"
    assert checkpoint.cash_balance == Decimal("500.000000000000")
    assert checkpoint.equity == Decimal("1100.000000000000")
    assert checkpoint.pending_orders_count == 0
    assert checkpoint.strategy_runtime_state_status == "unsupported"


def test_writer_persists_resume_checkpoint_next_cursor_and_supported_strategy_state(db_session: Session) -> None:
    paper_session = _create_paper_session(db_session)
    paper_session.symbol = f"T{uuid4().hex[:8].upper()}USDT"
    paper_session.dataset_key = f"binance:{paper_session.symbol}:1h"
    paper_session.dataset_context = {"datasetKey": paper_session.dataset_key}
    current_candle = MarketCandle(
        exchange=paper_session.exchange,
        symbol=paper_session.symbol,
        timeframe=paper_session.timeframe,
        open_time=_dt(1),
        close_time=_dt(1, 59),
        open=Decimal("100"),
        high=Decimal("105"),
        low=Decimal("95"),
        close=Decimal("101"),
        volume=Decimal("10"),
        source="pytest",
    )
    next_candle = MarketCandle(
        exchange=paper_session.exchange,
        symbol=paper_session.symbol,
        timeframe=paper_session.timeframe,
        open_time=_dt(2),
        close_time=_dt(2, 59),
        open=Decimal("102"),
        high=Decimal("107"),
        low=Decimal("97"),
        close=Decimal("103"),
        volume=Decimal("11"),
        source="pytest",
    )
    db_session.add_all([current_candle, next_candle])
    db_session.flush()
    result = _tick_result(paper_session.id)
    result.artifacts.snapshots[0] = replace(
        result.artifacts.snapshots[0],
        source_candle_id=str(current_candle.id),
        snapshot_at=current_candle.open_time,
    )

    SqlAlchemyPaperArtifactWriter(db_session).write(result)

    checkpoint = db_session.scalar(
        select(PaperResumeCheckpoint).where(PaperResumeCheckpoint.paper_session_id == paper_session.id)
    )
    assert checkpoint is not None
    assert checkpoint.next_candle_id == next_candle.id
    assert checkpoint.next_candle_open_time == next_candle.open_time
    assert checkpoint.strategy_runtime_state_status == "stateless_between_candles"

def test_writer_raises_machine_readable_error_when_session_is_missing(db_session: Session) -> None:
    missing_id = uuid4()

    with pytest.raises(PaperArtifactWriterError) as exc_info:
        SqlAlchemyPaperArtifactWriter(db_session).write(_tick_result(missing_id))

    assert exc_info.value.reason_code == "paper_session_not_found"
    assert str(missing_id) in str(exc_info.value)


def test_writer_raises_when_fill_order_key_has_no_persisted_order(db_session: Session) -> None:
    paper_session = _create_paper_session(db_session)
    result = _tick_result(paper_session.id)
    result.artifacts.orders.clear()

    with pytest.raises(PaperArtifactWriterError) as exc_info:
        SqlAlchemyPaperArtifactWriter(db_session).write(result)

    assert exc_info.value.reason_code == "paper_artifact_order_link_missing"
    assert "order-0" in str(exc_info.value)


def test_writer_flushes_but_does_not_commit(db_session: Session) -> None:
    paper_session = _create_paper_session(db_session)

    SqlAlchemyPaperArtifactWriter(db_session).write(_tick_result(paper_session.id))

    same_transaction_count = db_session.scalar(
        select(func.count()).select_from(PaperOrder).where(PaperOrder.paper_session_id == paper_session.id)
    )
    with SessionLocal(bind=get_engine()) as separate_session:
        separate_transaction_count = separate_session.scalar(
            select(func.count()).select_from(PaperOrder).where(PaperOrder.paper_session_id == paper_session.id)
        )

    assert same_transaction_count == 2
    assert separate_transaction_count == 0


def test_writer_updates_existing_position_for_same_session_and_symbol(db_session: Session) -> None:
    paper_session = _create_paper_session(db_session)
    existing_position = PaperPosition(
        paper_session_id=paper_session.id,
        symbol="BTCUSDT",
        side="long",
        status="open",
        quantity=Decimal("1"),
        average_entry_price=Decimal("90"),
        realized_pnl=Decimal("0"),
        unrealized_pnl=Decimal("10"),
        metadata_={"existing": True},
        created_by="pytest",
    )
    db_session.add(existing_position)
    db_session.flush()

    SqlAlchemyPaperArtifactWriter(db_session).write(_tick_result(paper_session.id))

    positions = db_session.scalars(select(PaperPosition).where(PaperPosition.paper_session_id == paper_session.id)).all()
    assert len(positions) == 1
    assert positions[0].id == existing_position.id
    assert positions[0].quantity == Decimal("5.000000000000")
    assert positions[0].average_entry_price == Decimal("100.000000000000")
    assert positions[0].metadata_ == {"source": "paper-engine", "symbol": "BTCUSDT"}
