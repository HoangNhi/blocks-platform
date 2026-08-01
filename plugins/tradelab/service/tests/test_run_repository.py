from __future__ import annotations

import os

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://postgres:postgres123secure@localhost:5432/tradelab",
)

from datetime import datetime, timezone
from uuid import uuid4

import pytest

from tradelab_api.db.models import BotRun, Strategy, StrategyGroup, StrategyVersion
from tradelab_api.db.session import (
    SessionLocal,
    apply_schema_compatibility,
    get_engine,
    verify_database_connection,
)
from tradelab_api.services.run_repository import RunRepository

try:
    verify_database_connection()
except RuntimeError as exc:
    pytest.skip(str(exc), allow_module_level=True)
apply_schema_compatibility()


def test_claim_and_complete_bot_run_keep_pipeline_status_in_sync() -> None:
    session = SessionLocal(bind=get_engine())
    run_id = uuid4()
    group_id = uuid4()
    strategy_id = uuid4()
    version_id = uuid4()
    slug_suffix = uuid4().hex[:8]
    group = StrategyGroup(
        id=group_id,
        name=f"Run Repository Group {slug_suffix}",
        slug=f"run-repository-group-{slug_suffix}",
        description="Run repository regression fixture",
        metadata_={},
        created_at=datetime.now(timezone.utc),
        created_by="codex",
    )
    strategy = Strategy(
        id=strategy_id,
        strategy_group_id=group_id,
        name=f"Run Repository Strategy {slug_suffix}",
        slug=f"run-repository-strategy-{slug_suffix}",
        description="Run repository regression fixture",
        current_version_id=None,
        status="active",
        runtime_config={},
        risk_config={},
        metadata_={},
        created_at=datetime.now(timezone.utc),
        created_by="codex",
    )
    version = StrategyVersion(
        id=version_id,
        strategy_id=strategy_id,
        version_number=1,
        source_code="def on_candle(ctx):\n    return None\n",
        source_hash=f"run-repository-{slug_suffix}",
        validation_status="valid",
        validation_message=None,
        created_at=datetime.now(timezone.utc),
        created_by="codex",
    )
    run = BotRun(
        id=run_id,
        strategy_id=strategy_id,
        strategy_version_id=version_id,
        run_type="backtest",
        status="queued",
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        start_at=datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
        end_at=datetime(2026, 1, 1, 6, 0, tzinfo=timezone.utc),
        started_at=None,
        finished_at=None,
        runtime_config={"marketType": "USD_M_FUTURES", "defaultLeverage": 10},
        risk_config={},
        source_snapshot={"sourceHash": "run-repository-test"},
        dataset_context={"datasetKey": "binance:BTCUSDT:1h"},
        pipeline_context={"state": "queued", "runId": None},
        pipeline_status="queued",
        error_message=None,
        created_at=datetime.now(timezone.utc),
        created_by="codex",
    )
    try:
        session.add_all([group, strategy, version])
        session.flush()
        strategy.current_version_id = version_id
        session.add(run)
        session.commit()

        repository = RunRepository(session)
        claimed = repository.claim_next_queued_bot_run()
        assert claimed is not None
        assert claimed.id == run_id
        assert claimed.status == "running"
        assert claimed.pipeline_status == "running"
        assert claimed.pipeline_context["state"] == "running"
        assert claimed.pipeline_context["runId"] == str(run_id)

        completed = repository.complete_bot_run(claimed, status="completed")
        session.commit()

        assert completed.status == "completed"
        assert completed.pipeline_status == "completed"
        assert completed.pipeline_context["state"] == "completed"
        assert completed.pipeline_context["runId"] == str(run_id)
        assert completed.finished_at is not None
    finally:
        session.rollback()
        session.query(BotRun).filter(BotRun.id == run_id).delete()
        session.query(Strategy).filter(Strategy.id == strategy_id).update({"current_version_id": None})
        session.query(StrategyVersion).filter(StrategyVersion.id == version_id).delete()
        session.query(Strategy).filter(Strategy.id == strategy_id).delete()
        session.query(StrategyGroup).filter(StrategyGroup.id == group_id).delete()
        session.commit()
        session.close()
