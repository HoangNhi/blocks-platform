from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4
import pytest

from tradelab_api.db.models import (
    BacktestPosition,
    BacktestResult,
    BotRun,
    StrategyLog,
    StrategySignal,
    TradeOrder,
)
from tradelab_api.services.backtest.engine import BacktestExecution, persist_backtest_execution


@pytest.mark.parametrize("workspace_id", [None, uuid4()])
def test_dispatcher_does_not_open_session_without_workload_authority(workspace_id) -> None:
    from tradelab_api.services.job_dispatcher import JobDispatcher

    run = BotRun(workspace_id=workspace_id, status="queued")
    opened = []

    def forbidden_session():
        opened.append(True)
        raise AssertionError("Worker opened a session without authority")

    dispatcher = JobDispatcher(session_factory=forbidden_session)
    with pytest.raises(RuntimeError, match="workspace_authority_recheck_unavailable"):
        dispatcher.poll_once()
    assert opened == []
    assert run.status == "queued"
    assert run.workspace_id == workspace_id
    assert dispatcher.stats.processed_backtests == 0

def test_persist_backtest_execution_stamps_origin_workspace() -> None:
    ws_id = uuid4()
    run = BotRun(
        id=uuid4(),
        workspace_id=ws_id,
        strategy_id=uuid4(),
        strategy_version_id=uuid4(),
        run_type="backtest",
        status="running",
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        start_at=datetime.now(timezone.utc),
        end_at=datetime.now(timezone.utc),
    )
    result = BacktestResult(
        id=uuid4(),
        bot_run_id=run.id,
        initial_equity=1000,
        final_equity=1100,
        total_return_pct=10,
        max_drawdown_pct=5,
    )
    signal = StrategySignal(
        id=uuid4(),
        bot_run_id=run.id,
        candle_open_time=datetime.now(timezone.utc),
        signal_type="BUY",
    )
    order = TradeOrder(
        id=uuid4(),
        bot_run_id=run.id,
        side="buy",
        order_type="market",
        status="filled",
    )
    log = StrategyLog(
        id=uuid4(),
        bot_run_id=run.id,
        level="info",
        event_type="TEST",
        message="msg",
    )
    pos = BacktestPosition(
        id=uuid4(),
        run_id=run.id,
        symbol="BTCUSDT",
        side="LONG",
        size=1,
        leverage=1,
        entry_price=50000,
        status="closed",
    )

    execution = BacktestExecution(
        status="completed",
        bot_run=run,
        result=result,
        signals=[signal],
        order_intents=[],
        trade_orders=[order],
        logs=[log],
        equity_curve=[],
        portfolio=None,
        runner_result=None,
        stop_reason=None,
        positions=[pos],
    )

    class RecordingSession:
        def __init__(self):
            self.added = []
        def add(self, obj): self.added.append(obj)
        def add_all(self, objs): self.added.extend(objs)

    session = RecordingSession()
    persist_backtest_execution(session, execution)

    assert result.workspace_id == ws_id
    assert signal.workspace_id == ws_id
    assert order.workspace_id == ws_id
    assert log.workspace_id == ws_id
    assert pos.workspace_id == ws_id
