from __future__ import annotations

import os
from collections.abc import Iterator
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID, uuid4

import pytest
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
    PaperPortfolioSnapshot,
    PaperResumeCheckpoint,
    PaperSession,
    Strategy,
    StrategyGroup,
    StrategyVersion,
)
from tradelab_api.db.session import SessionLocal, get_engine  # noqa: E402
from tradelab_api.services.paper_artifact_writer import SqlAlchemyPaperArtifactWriter  # noqa: E402
from tradelab_api.services.paper_engine import PaperEngineRunner  # noqa: E402
from tradelab_api.services.paper_engine_tick_local import (  # noqa: E402
    LOCAL_PAPER_ENGINE_SAFETY_STATUS,
    LocalPaperCancelProvider,
    NoOpPaperStrategySignalProvider,
)
from tradelab_api.services.paper_engine_session_source import SqlAlchemyPaperEngineSessionSource  # noqa: E402
from tradelab_api.services.paper_strategy_adapter import (  # noqa: E402
    PaperStrategySourceResolver,
    SubprocessPaperStrategySignalProvider,
)

Base.metadata.create_all(bind=get_engine())

def _dt(hour: int) -> datetime:
    return datetime(2026, 1, 1, hour, tzinfo=timezone.utc)

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
        name=f"Paper Source Group {suffix}",
        slug=f"paper-source-group-{suffix}",
        description="Paper session source test group",
        metadata_={"visibility": "test", "purpose": "paper_engine_session_source"},
        created_by="pytest",
    )
    session.add(group)
    session.flush()
    strategy = Strategy(
        strategy_group_id=group.id,
        name=f"Paper Source Strategy {suffix}",
        slug=f"paper-source-strategy-{suffix}",
        description="Paper session source test strategy",
        status="active",
        runtime_config={"feeBps": "0", "slippageBps": "0"},
        risk_config={},
        metadata_={"visibility": "test", "purpose": "paper_engine_session_source"},
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
        name=f"Paper Source Bot {suffix}",
        mode="paper",
        status="draft",
        symbol="BTCUSDT",
        timeframe="1h",
        runtime_config={},
        risk_config={},
        metadata_={"visibility": "test", "purpose": "paper_engine_session_source"},
        created_by="pytest",
    )
    session.add(bot)
    session.flush()
    return {"bot_id": bot.id, "strategy_id": strategy.id, "strategy_version_id": version.id}

def _paper_session(
    session: Session,
    *,
    status: str = "queued",
    created_hour: int = 0,
    symbol: str = "BTCUSDT",
) -> PaperSession:
    ids = _create_strategy_tree(session)
    row = PaperSession(
        bot_id=ids["bot_id"],
        strategy_id=ids["strategy_id"],
        strategy_version_id=ids["strategy_version_id"],
        mode="paper",
        status=status,
        exchange="binance",
        symbol=symbol,
        timeframe="1h",
        dataset_key=f"binance:{symbol}:1h",
        start_at=_dt(0),
        end_at=_dt(3),
        starting_cash=Decimal("1000"),
        runtime_config={"feeBps": "0", "slippageBps": "0"},
        risk_config={},
        source_snapshot={"strategyVersionId": str(ids["strategy_version_id"])},
        dataset_context={"datasetKey": f"binance:{symbol}:1h"},
        gate_context={"requestFingerprint": f"source-{uuid4().hex}"},
        reason_code="paper_session_queued" if status == "queued" else "paper_session_running",
        created_by="pytest",
    )
    row.created_at = _dt(created_hour)
    session.add(row)
    session.flush()
    return row

def _market_candle(session: Session, hour: int, *, symbol: str = "BTCUSDT") -> MarketCandle:
    price = Decimal("100") + Decimal(hour)
    row = MarketCandle(
        exchange="binance",
        symbol=symbol,
        timeframe="1h",
        open_time=_dt(hour),
        close_time=_dt(hour) + timedelta(hours=1),
        open=price,
        high=price + Decimal("5"),
        low=price - Decimal("5"),
        close=price,
        volume=Decimal("10"),
        source="pytest",
    )
    session.add(row)
    session.flush()
    return row

def test_claims_oldest_queued_session_and_loads_ordered_candles(db_session: Session) -> None:
    symbol = f"T{uuid4().hex[:8].upper()}USDT"
    newer = _paper_session(db_session, status="queued", created_hour=2, symbol=symbol)
    older = _paper_session(db_session, status="queued", created_hour=1, symbol=symbol)
    candles = [_market_candle(db_session, hour, symbol=symbol) for hour in [2, 0, 1]]
    db_session.flush()

    source = SqlAlchemyPaperEngineSessionSource(db_session, worker_id="local-worker")
    claimed = source.claim_next_queued_session(max_candles_per_tick=10000)

    assert claimed is not None
    assert claimed.session_id == str(older.id)
    assert claimed.status == "running"
    assert [candle.candle_id for candle in claimed.candles] == [
        str(candles[1].id),
        str(candles[2].id),
        str(candles[0].id),
    ]
    assert older.status == "running"
    assert older.reason_code == "paper_engine_running"
    assert older.started_at is not None
    assert older.updated_by == "local-worker"
    assert newer.status == "queued"
    audit = db_session.query(PaperAuditEvent).filter(PaperAuditEvent.paper_session_id == older.id).one()
    assert audit.action == "paper_session_running"
    assert audit.old_state == "queued"
    assert audit.new_state == "running"

def test_has_running_session_detects_running_paper_only(db_session: Session) -> None:
    _paper_session(db_session, status="running")
    source = SqlAlchemyPaperEngineSessionSource(db_session, worker_id="local-worker")

    assert source.has_running_session() is True

def test_claim_returns_none_when_no_queued_session(db_session: Session) -> None:
    db_session.query(PaperSession).filter(PaperSession.mode == "paper", PaperSession.status == "queued").update(
        {PaperSession.status: "completed", PaperSession.reason_code: "pytest_no_queued_cleanup"},
        synchronize_session=False,
    )
    db_session.flush()
    source = SqlAlchemyPaperEngineSessionSource(db_session, worker_id="local-worker")

    assert source.claim_next_queued_session(max_candles_per_tick=10000) is None

def test_claim_loads_one_extra_candle_for_cap_detection(db_session: Session) -> None:
    symbol = f"T{uuid4().hex[:8].upper()}USDT"
    row = _paper_session(db_session, status="queued", symbol=symbol)
    for hour in range(3):
        _market_candle(db_session, hour, symbol=symbol)

    source = SqlAlchemyPaperEngineSessionSource(db_session, worker_id="local-worker")
    claimed = source.claim_next_queued_session(max_candles_per_tick=2)

    assert claimed is not None
    assert claimed.session_id == str(row.id)
    assert len(claimed.candles) == 3

def test_mark_terminal_updates_session_when_writer_failed_before_terminal_update(db_session: Session) -> None:
    row = _paper_session(db_session, status="running")
    source = SqlAlchemyPaperEngineSessionSource(db_session, worker_id="local-worker")

    source.mark_terminal(str(row.id), "failed", "paper_engine_artifact_write_failed", "writer failed")

    assert row.status == "failed"
    assert row.reason_code == "paper_engine_artifact_write_failed"
    assert row.error_message == "writer failed"
    assert row.finished_at is not None
    assert row.updated_by == "local-worker"

def test_runner_with_db_source_and_writer_completes_session_and_persists_snapshots(db_session: Session) -> None:
    symbol = f"T{uuid4().hex[:8].upper()}USDT"
    row = _paper_session(db_session, status="queued", symbol=symbol)
    for hour in range(3):
        _market_candle(db_session, hour, symbol=symbol)

    source = SqlAlchemyPaperEngineSessionSource(db_session, worker_id="local-worker")
    runner = PaperEngineRunner(
        session_source=source,
        strategy_provider=NoOpPaperStrategySignalProvider(),
        cancel_provider=LocalPaperCancelProvider(),
        artifact_writer=SqlAlchemyPaperArtifactWriter(db_session, actor="local-worker"),
        worker_id="local-worker",
        safety_status=LOCAL_PAPER_ENGINE_SAFETY_STATUS,
    )

    result = runner.tick(max_candles_per_tick=10000)
    db_session.flush()
    db_session.refresh(row)

    assert result.status == "completed"
    assert result.reason_code == "paper_engine_completed"
    assert result.session_id == str(row.id)
    assert result.candles_processed == 3
    assert result.orders_created == 0
    assert result.fills_created == 0
    assert result.snapshots_created == 3
    assert row.status == "completed"
    assert row.reason_code == "paper_engine_completed"
    assert row.finished_at is not None
    assert len(row.orders) == 0
    assert len(row.fills) == 0
    assert len(row.portfolio_snapshots) == 3
    assert row.gate_context["paperEngineSummary"]["candlesProcessed"] == 3

def test_runner_with_db_source_marks_no_candle_session_failed(db_session: Session) -> None:
    symbol = f"T{uuid4().hex[:8].upper()}USDT"
    row = _paper_session(db_session, status="queued", symbol=symbol)
    source = SqlAlchemyPaperEngineSessionSource(db_session, worker_id="local-worker")
    runner = PaperEngineRunner(
        session_source=source,
        strategy_provider=NoOpPaperStrategySignalProvider(),
        cancel_provider=LocalPaperCancelProvider(),
        artifact_writer=SqlAlchemyPaperArtifactWriter(db_session, actor="local-worker"),
        worker_id="local-worker",
        safety_status=LOCAL_PAPER_ENGINE_SAFETY_STATUS,
    )

    result = runner.tick(max_candles_per_tick=10000)
    db_session.flush()
    db_session.refresh(row)

    assert result.status == "failed"
    assert result.reason_code == "paper_engine_no_candles"
    assert row.status == "failed"
    assert row.reason_code == "paper_engine_no_candles"
    assert row.finished_at is not None
    assert len(row.portfolio_snapshots) == 0

def test_runner_with_subprocess_strategy_provider_persists_order_and_fill(db_session: Session) -> None:
    symbol = f"T{uuid4().hex[:8].upper()}USDT"
    row = _paper_session(db_session, status="queued", symbol=symbol)
    row.strategy_version.source_code = (
        "def on_candle(ctx):\n"
        "    if len(ctx.history.get('close', [])) == 1:\n"
        "        return ctx.buy_market(percent=50)\n"
        "    if len(ctx.history.get('close', [])) == 3:\n"
        "        return ctx.close_position()\n"
        "    return []\n"
    )
    for hour in range(4):
        _market_candle(db_session, hour, symbol=symbol)

    source = SqlAlchemyPaperEngineSessionSource(db_session, worker_id="local-worker")
    runner = PaperEngineRunner(
        session_source=source,
        strategy_provider=SubprocessPaperStrategySignalProvider(
            source_resolver=PaperStrategySourceResolver(db_session),
        ),
        cancel_provider=LocalPaperCancelProvider(),
        artifact_writer=SqlAlchemyPaperArtifactWriter(db_session, actor="local-worker"),
        worker_id="local-worker",
        safety_status=LOCAL_PAPER_ENGINE_SAFETY_STATUS,
    )

    result = runner.tick(max_candles_per_tick=10000)
    db_session.flush()
    db_session.refresh(row)

    assert result.status == "completed"
    assert result.orders_created == 2
    assert result.fills_created == 2
    assert len(row.orders) == 2
    assert len(row.fills) == 2
    assert row.gate_context["paperEngineSummary"]["ordersCreated"] == 2
    assert row.gate_context["paperEngineSummary"]["fillsCreated"] == 2
    assert any(event.action == "paper_strategy_runtime_prepared" for event in row.audit_events)

def test_runner_with_inactive_strategy_source_marks_session_failed(db_session: Session) -> None:
    symbol = f"T{uuid4().hex[:8].upper()}USDT"
    row = _paper_session(db_session, status="queued", symbol=symbol)
    row.strategy_version.is_active = False
    for hour in range(2):
        _market_candle(db_session, hour, symbol=symbol)

    source = SqlAlchemyPaperEngineSessionSource(db_session, worker_id="local-worker")
    runner = PaperEngineRunner(
        session_source=source,
        strategy_provider=SubprocessPaperStrategySignalProvider(
            source_resolver=PaperStrategySourceResolver(db_session),
        ),
        cancel_provider=LocalPaperCancelProvider(),
        artifact_writer=SqlAlchemyPaperArtifactWriter(db_session, actor="local-worker"),
        worker_id="local-worker",
        safety_status=LOCAL_PAPER_ENGINE_SAFETY_STATUS,
    )

    result = runner.tick(max_candles_per_tick=10000)
    db_session.flush()
    db_session.refresh(row)

    assert result.status == "failed"
    assert result.reason_code == "paper_strategy_source_inactive"
    assert row.status == "failed"
    assert row.reason_code == "paper_strategy_source_inactive"
    assert len(row.orders) == 0
    assert len(row.fills) == 0

def test_claim_queued_session_by_id_claims_requested_session_only(db_session: Session) -> None:
    symbol = f"T{uuid4().hex[:8].upper()}USDT"
    older = _paper_session(db_session, status="queued", created_hour=1, symbol=symbol)
    requested = _paper_session(db_session, status="queued", created_hour=2, symbol=symbol)
    for hour in [0, 1, 2]:
        _market_candle(db_session, hour, symbol=symbol)

    source = SqlAlchemyPaperEngineSessionSource(db_session, worker_id="local-worker")
    claimed = source.claim_queued_session_by_id(requested.id, max_candles_per_tick=10000)

    assert claimed is not None
    assert claimed.session_id == str(requested.id)
    assert claimed.status == "running"
    assert requested.status == "running"
    assert requested.reason_code == "paper_engine_running"
    assert requested.started_at is not None
    assert requested.updated_by == "local-worker"
    assert older.status == "queued"

def test_claim_queued_session_by_id_returns_none_for_missing_or_nonqueued_session(db_session: Session) -> None:
    completed = _paper_session(db_session, status="completed")
    source = SqlAlchemyPaperEngineSessionSource(db_session, worker_id="local-worker")

    assert source.claim_queued_session_by_id(completed.id, max_candles_per_tick=10000) is None
    assert source.claim_queued_session_by_id(uuid4(), max_candles_per_tick=10000) is None
    assert completed.status == "completed"

def test_get_paper_session_status_returns_status_or_none(db_session: Session) -> None:
    queued = _paper_session(db_session, status="queued")
    source = SqlAlchemyPaperEngineSessionSource(db_session, worker_id="local-worker")

    assert source.get_paper_session_status(queued.id) == "queued"
    assert source.get_paper_session_status(uuid4()) is None


def test_claim_resumed_queued_session_loads_checkpoint_state_and_attempt(db_session: Session) -> None:
    symbol = f"T{uuid4().hex[:8].upper()}USDT"
    row = _paper_session(db_session, status="queued", symbol=symbol)
    candles = [_market_candle(db_session, hour, symbol=symbol) for hour in range(4)]
    row.gate_context = {
        "requestFingerprint": "resume-source",
        "resume": {
            "sourceSessionId": str(row.id),
            "idempotencyKey": f"paper-resume:{row.id}:resume-key-1",
            "attemptNo": 1,
            "lastProcessedCandleId": str(candles[1].id),
            "nextCandleOpenTime": candles[2].open_time.isoformat(),
            "implementationMode": "same_session",
        },
    }
    checkpoint = PaperResumeCheckpoint(
        paper_session_id=row.id,
        attempt_no=0,
        last_processed_candle_id=candles[1].id,
        last_processed_candle_open_time=candles[1].close_time,
        last_processed_snapshot_id=None,
        next_candle_id=candles[2].id,
        next_candle_open_time=candles[2].open_time,
        cash_balance=Decimal("9000"),
        equity=Decimal("9050"),
        realized_pnl=Decimal("10"),
        unrealized_pnl=Decimal("50"),
        fees_paid=Decimal("1"),
        exposure_notional=Decimal("500"),
        open_position_quantity=Decimal("0.5"),
        average_entry_price=Decimal("100"),
        peak_equity=Decimal("9100"),
        max_drawdown_pct=Decimal("0.25"),
        pending_orders_count=0,
        strategy_runtime_state_status="stateless_between_candles",
        checkpoint_source="persisted",
        reason_code="paper_session_cancel_requested",
        metadata_={},
        created_by="pytest",
        updated_by="pytest",
    )
    db_session.add(checkpoint)
    db_session.flush()

    source = SqlAlchemyPaperEngineSessionSource(db_session, worker_id="local-worker")
    claimed = source.claim_queued_session_by_id(row.id, max_candles_per_tick=10000)

    assert claimed is not None
    assert claimed.attempt_no == 1
    assert claimed.initial_portfolio is not None
    assert claimed.initial_portfolio.cash == Decimal("9000")
    assert claimed.initial_portfolio.quantity == Decimal("0.5")
    assert claimed.execution_start_index == 2
    assert [candle.candle_id for candle in claimed.candles] == [str(candle.id) for candle in candles]


def test_runner_resumed_session_appends_attempt_one_artifacts_without_rewriting_history(db_session: Session) -> None:
    symbol = f"T{uuid4().hex[:8].upper()}USDT"
    row = _paper_session(db_session, status="queued", symbol=symbol)
    candles = [_market_candle(db_session, hour, symbol=symbol) for hour in range(4)]
    existing_snapshot = PaperPortfolioSnapshot(
        paper_session_id=row.id,
        artifact_key=f"paper:{row.id}:attempt:0:candle:{candles[1].id}:kind:snapshot:seq:0",
        source_candle_id=candles[1].id,
        snapshot_at=candles[1].close_time,
        cash_balance=Decimal("9000"),
        equity=Decimal("9050"),
        realized_pnl=Decimal("10"),
        unrealized_pnl=Decimal("50"),
        fees_paid=Decimal("1"),
        drawdown_pct=Decimal("0.25"),
        exposure_notional=Decimal("500"),
        metadata_={"sourceCandleId": str(candles[1].id)},
        created_by="pytest",
    )
    db_session.add(existing_snapshot)
    checkpoint = PaperResumeCheckpoint(
        paper_session_id=row.id,
        attempt_no=0,
        last_processed_candle_id=candles[1].id,
        last_processed_candle_open_time=candles[1].close_time,
        last_processed_snapshot_id=None,
        next_candle_id=candles[2].id,
        next_candle_open_time=candles[2].open_time,
        cash_balance=Decimal("9000"),
        equity=Decimal("9050"),
        realized_pnl=Decimal("10"),
        unrealized_pnl=Decimal("50"),
        fees_paid=Decimal("1"),
        exposure_notional=Decimal("500"),
        open_position_quantity=Decimal("0.5"),
        average_entry_price=Decimal("100"),
        peak_equity=Decimal("9100"),
        max_drawdown_pct=Decimal("0.25"),
        pending_orders_count=0,
        strategy_runtime_state_status="stateless_between_candles",
        checkpoint_source="persisted",
        reason_code="paper_session_cancel_requested",
        metadata_={},
        created_by="pytest",
        updated_by="pytest",
    )
    db_session.add(checkpoint)
    row.gate_context = {
        "resume": {
            "sourceSessionId": str(row.id),
            "idempotencyKey": f"paper-resume:{row.id}:resume-key-1",
            "attemptNo": 1,
            "nextCandleOpenTime": candles[2].open_time.isoformat(),
            "implementationMode": "same_session",
        }
    }
    db_session.flush()

    source = SqlAlchemyPaperEngineSessionSource(db_session, worker_id="local-worker")
    runner = PaperEngineRunner(
        session_source=source,
        strategy_provider=NoOpPaperStrategySignalProvider(),
        cancel_provider=LocalPaperCancelProvider(),
        artifact_writer=SqlAlchemyPaperArtifactWriter(db_session, actor="local-worker"),
        worker_id="local-worker",
        safety_status=LOCAL_PAPER_ENGINE_SAFETY_STATUS,
    )

    result = runner.tick(max_candles_per_tick=10000)
    db_session.flush()
    db_session.refresh(row)

    assert result.status == "completed"
    assert result.candles_processed == 2
    assert len(row.portfolio_snapshots) == 3
    assert any(":attempt:1:" in snapshot.artifact_key for snapshot in row.portfolio_snapshots)
    assert existing_snapshot in row.portfolio_snapshots
