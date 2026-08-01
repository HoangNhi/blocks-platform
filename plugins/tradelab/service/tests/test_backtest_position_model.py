from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from collections.abc import Iterator
import os
import pytest
from sqlalchemy.orm import Session
from tradelab_api.db.session import SessionLocal, apply_schema_compatibility, get_engine
from tradelab_api.db.models import BacktestPosition, BotRun, Strategy, StrategyVersion

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://postgres:postgres123secure@localhost:5432/tradelab")
apply_schema_compatibility()

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


def test_backtest_position_creation_persists_futures_research_fields(db_session: Session) -> None:
    strategy = Strategy(name="Research Strategy", slug="research-" + str(uuid4()), status="active")
    db_session.add(strategy)
    db_session.flush()

    version = StrategyVersion(
        strategy_id=strategy.id,
        version_number=1,
        validation_status="valid",
        source_code="def on_candle(ctx): pass",
        source_hash="hash-" + str(uuid4()),
    )
    db_session.add(version)
    db_session.flush()

    run = BotRun(
        id=uuid4(),
        bot_id=None,
        strategy_id=strategy.id,
        strategy_version_id=version.id,
        run_type="backtest",
        status="completed",
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        start_at=datetime.now(timezone.utc),
        end_at=datetime.now(timezone.utc),
    )
    db_session.add(run)
    db_session.flush()

    pos = BacktestPosition(
        run_id=run.id,
        symbol="BTCUSDT",
        side="LONG",
        size=1.0,
        leverage=10,
        entry_price=50000.0,
        close_price=51000.0,
        liquidation_price=45200.0,
        margin_mode="CROSS",
        maintenance_margin=204.0,
        funding_fee_paid=12.5,
        max_notional=51000.0,
        max_margin_used=5000.0,
        peak_leverage_used=10.0,
        realized_pnl=1000.0,
        status="CLOSED",
    )
    db_session.add(pos)
    db_session.commit()

    assert pos.margin_mode == "CROSS"
    assert float(pos.maintenance_margin) == 204.0
    assert float(pos.funding_fee_paid) == 12.5
    assert float(pos.max_notional) == 51000.0
    assert float(pos.max_margin_used) == 5000.0
    assert float(pos.peak_leverage_used) == 10.0
