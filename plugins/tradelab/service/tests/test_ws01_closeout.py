from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest


@pytest.mark.asyncio
@pytest.mark.parametrize("enabled", [False, True])
async def test_lifespan_gates_dispatcher_and_stops_on_exit(monkeypatch, enabled):
    from tradelab_api import main

    dispatcher = MagicMock()
    monkeypatch.setattr(main, "JobDispatcher", lambda: dispatcher)
    monkeypatch.setattr(main, "BackgroundFillScheduler", MagicMock())
    monkeypatch.setattr(main, "PaperSessionScheduler", MagicMock())
    monkeypatch.setattr(main, "verify_database_connection", lambda: None)
    monkeypatch.setattr(main, "apply_schema_compatibility", lambda: None)
    monkeypatch.setattr(main, "get_settings", lambda: SimpleNamespace(tradelab_job_dispatcher_enabled=enabled))
    async with main.lifespan(main.app):
        assert dispatcher.start.call_count == int(enabled)
    dispatcher.stop.assert_called_once()


def test_completion_uses_database_compare_and_swap():
    from tradelab_api.db.models import BotRun
    from tradelab_api.services.run_repository import RunRepository

    session = MagicMock()
    workspace, owner = uuid4(), uuid4()
    run = BotRun(id=uuid4(), workspace_id=workspace, created_by=str(owner), status="running")
    session.execute.return_value.scalar_one_or_none.return_value = None
    repository = RunRepository(session, workspace, owner)
    assert repository.complete_bot_run(run, status="completed") is None
    statement = str(session.execute.call_args.args[0])
    assert statement.startswith("UPDATE bot_run")
    assert "bot_run.status IN" in statement
    assert "bot_run.workspace_id =" in statement
    assert "bot_run.created_by =" in statement
    session.flush.assert_not_called()


@pytest.mark.parametrize("finder", ["find_queued_session_by_idempotency_key", "find_retry_session_by_source_and_idempotency_key", "find_resumed_session_by_source_and_idempotency_key"])
def test_paper_replay_queries_include_trusted_scope(finder):
    from tradelab_api.services.paper_session_repository import PaperSessionRepository

    session = MagicMock()
    session.scalars.return_value.all.return_value = []
    repository = PaperSessionRepository(session, uuid4(), uuid4())
    args = ("collision",) if finder.startswith("find_queued") else (uuid4(), "collision")
    assert getattr(repository, finder)(*args) is None
    statement = str(session.scalars.call_args.args[0])
    assert "paper_session.workspace_id =" in statement
    assert "paper_session.created_by =" in statement


def test_paper_create_stamps_trusted_identity(monkeypatch):
    from tradelab_api.services.paper_session_repository import PaperSessionRepository
    from tradelab_api.services.bot_repository import BotRepository
    from tradelab_api.services.strategy_repository import StrategyRepository

    session = MagicMock()
    workspace, owner, strategy_id, version_id, bot_id = [uuid4() for _ in range(5)]
    monkeypatch.setattr(BotRepository, "get_bot", lambda *args: SimpleNamespace(strategy_id=strategy_id, strategy_version_id=version_id))
    monkeypatch.setattr(StrategyRepository, "get_strategy", lambda *args: SimpleNamespace(id=strategy_id))
    monkeypatch.setattr(StrategyRepository, "get_strategy_version", lambda *args: SimpleNamespace(id=version_id, strategy_id=strategy_id))
    repository = PaperSessionRepository(session, workspace, owner)
    created = repository.create_paper_session(bot_id=bot_id, strategy_id=strategy_id, strategy_version_id=version_id, created_by="spoof", workspace_id=uuid4())
    assert created.created_by == str(owner)
    assert created.workspace_id == workspace


def test_journal_entry_lookup_scopes_parent_and_child():
    from tradelab_api.services.execution_journal_repository import ExecutionJournalRepository

    session = MagicMock()
    repository = ExecutionJournalRepository(session, uuid4(), uuid4())
    repository.get_entry(uuid4())
    statement = str(session.execute.call_args.args[0])
    assert "bot_run.workspace_id =" in statement
    assert "bot_run.created_by =" in statement
    assert "manual_trade_journal_entry.workspace_id =" in statement


def test_dispatcher_backoff_survives_ticks_and_is_exponential():
    from tradelab_api.services.job_dispatcher import JobDispatcher

    dispatcher = JobDispatcher(auth_client=MagicMock())
    owner = str(uuid4())
    dispatcher._backoff(owner, now=10)
    assert dispatcher._retry_at[owner] == (11, 1)
    dispatcher._backoff(owner, now=11)
    assert dispatcher._retry_at[owner] == (13, 2)
    for current in range(12, 22):
        dispatcher._backoff(owner, now=current)
    assert dispatcher._retry_at[owner][1] == 30


def test_queued_limit_is_reserved_under_transaction_lock(monkeypatch):
    from tradelab_api.services.run_repository import RunRepository

    session = MagicMock()
    session.scalar.return_value = 100
    repository = RunRepository(session, uuid4(), uuid4())
    monkeypatch.setattr(repository, "_validate_relationships", lambda fields: None)
    with pytest.raises(ValueError, match="queued quota"):
        repository.create_bot_run(run_type="backtest", status="queued")
    assert "pg_advisory_xact_lock" in str(session.execute.call_args_list[0].args[0])
    session.add.assert_not_called()


def test_executor_requires_pinned_runner_image(monkeypatch):
    from tradelab_api.services import strategy_runner

    monkeypatch.setattr(strategy_runner, "get_settings", lambda: SimpleNamespace(tradelab_runner_image="runner:latest"))
    with pytest.raises(RuntimeError, match="pinned"):
        strategy_runner.verify_strategy_executor()


def test_supervisor_timeout_is_fail_closed():
    import time
    from tradelab_api.services.strategy_runner import _supervisor_reason

    started = time.monotonic()
    assert "unavailable" in _supervisor_reason(lambda: time.sleep(3), timeout=0.02)
    assert time.monotonic() - started < 0.5


@pytest.mark.parametrize("field,value", [("seed", True), ("as_of_time", "2025-01-01T00:00:00Z"), ("resource_policy", {})])
def test_runner_consumes_full_c02_contract(field, value):
    import sys
    from pathlib import Path
    from datetime import datetime, timezone
    from tradelab_api.core.invocation import ResourcePolicyV1, StrategyInvocation

    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "runner" / "src"))
    from tradelab_sdk.runner import RunnerError, execute_strategy_payload

    invocation = StrategyInvocation.create(strategy_source="def on_candle(ctx): return []", bars=[{"open_time": "2026-01-01T00:00:00Z", "close_time": "2026-01-01T01:00:00Z", "open": "1", "high": "1", "low": "1", "close": "1", "volume": "0"}], symbol="EURUSD", timeframe="1h", config={}, initial_state={}, seed=42, as_of_time=datetime(2026, 1, 2, tzinfo=timezone.utc), resource_policy=ResourcePolicyV1())
    payload = invocation.to_payload()
    payload[field] = value
    with pytest.raises(RunnerError):
        execute_strategy_payload(payload)


@pytest.mark.parametrize("change", [{"candlesProcessed": True}, {"symbol": "OTHER"}, {"actions": [{"candleIndex": 99, "actions": []}]}, {"logs": [{"value": float("nan")}]}])
def test_runner_output_is_bound_to_invocation(change):
    from datetime import datetime, timezone
    from tradelab_api.core.invocation import ResourcePolicyV1, StrategyInvocation
    from tradelab_api.services.strategy_runner import _validate_runner_output

    invocation = StrategyInvocation.create(strategy_source="def on_candle(ctx): return []", bars=[], symbol="EURUSD", timeframe="1h", config={}, initial_state={}, seed=0, as_of_time=datetime(2026, 1, 1, tzinfo=timezone.utc), resource_policy=ResourcePolicyV1())
    payload = {"status": "ok", "symbol": "EURUSD", "timeframe": "1h", "candlesProcessed": 0, "actions": [], "logs": [], **change}
    with pytest.raises(ValueError):
        _validate_runner_output(payload, invocation)


def test_repository_cannot_reassign_owner_after_create():
    from tradelab_api.db.models import BotRun
    from tradelab_api.services.run_repository import RunRepository

    workspace, owner = uuid4(), uuid4()
    repository = RunRepository(MagicMock(), workspace, owner)
    run = BotRun(workspace_id=workspace, created_by=str(owner))
    with pytest.raises(PermissionError):
        repository.update(run, created_by=str(uuid4()))
    with pytest.raises(PermissionError):
        repository.update(run, workspace_id=uuid4())


@pytest.mark.parametrize("market_type", ["spot", "usd_m_futures"])
def test_supervisor_also_stops_post_runner_simulation(monkeypatch, market_type):
    from tradelab_api.services.backtest import engine
    from tradelab_api.services.strategy_runner import StrategyRunnerResult

    monkeypatch.setattr(engine, "run_strategy_subprocess", lambda **kwargs: StrategyRunnerResult(True, 0, "", "", payload={"actions": [], "logs": []}))
    times = iter([0, 5, 5])
    monkeypatch.setattr(engine, "monotonic", lambda: next(times))
    request = engine.BacktestRequest(strategy_source="def on_candle(ctx): return []", candles=[{"open_time": "2026-01-01T00:00:00Z", "close_time": "2026-01-01T01:00:00Z", "open": "1", "high": "1", "low": "1", "close": "1", "volume": "0"}], symbol="BTCUSDT", timeframe="1h", market_type=market_type, supervisor=lambda: "Run cancelled.")
    result = engine.BacktestEngine().run(request)
    assert result.status == "failed"
    assert result.error_message == "Run cancelled."
    assert result.result is None


@pytest.mark.parametrize("provider", ["live", "testnet"])
def test_order_preview_does_not_expose_foreign_parent(monkeypatch, provider):
    from tradelab_api.services.live_order_state_repository import LiveOrderStateRepository
    from tradelab_api.services.testnet_order_state_repository import TestnetOrderStateRepository

    session = MagicMock()
    preview = SimpleNamespace(intent=SimpleNamespace(id=uuid4(), is_active=True, is_deleted=False))
    session.scalars.return_value.first.return_value = preview
    repository_type = LiveOrderStateRepository if provider == "live" else TestnetOrderStateRepository
    repository = repository_type(session, uuid4(), uuid4())
    monkeypatch.setattr(repository, "get_intent", lambda intent_id: None)
    assert repository.get_preview_with_intent(uuid4()) == (None, None)


@pytest.mark.parametrize("provider", ["live", "testnet"])
def test_order_mutation_rejects_foreign_parent_before_writing(monkeypatch, provider):
    from tradelab_api.services.live_order_state_repository import LiveOrderStateRepository
    from tradelab_api.services.testnet_order_state_repository import TestnetOrderStateRepository

    session = MagicMock()
    repository_type = LiveOrderStateRepository if provider == "live" else TestnetOrderStateRepository
    repository = repository_type(session, uuid4(), uuid4())
    monkeypatch.setattr(repository, "get_intent", lambda *args, **kwargs: None)
    intent = SimpleNamespace(id=uuid4(), status="completed")
    with pytest.raises(PermissionError):
        repository.set_latest_preview(intent, preview_id=uuid4(), actor="spoof")
    session.flush.assert_not_called()


def test_dispatcher_instance_identity_changes_after_restart():
    from tradelab_api.services.job_dispatcher import JobDispatcher

    first = JobDispatcher(auth_client=MagicMock())
    second = JobDispatcher(auth_client=MagicMock())
    assert first._instance_id != second._instance_id
    first.stop()
    second.stop()


def test_dispatcher_lock_loss_stops_before_discovery():
    from tradelab_api.services.job_dispatcher import JobDispatcher

    authority = MagicMock()
    authority._service_authorization_key = "non-secret-test-only"
    session_factory = MagicMock(side_effect=AssertionError("Queue discovery after lock loss"))
    dispatcher = JobDispatcher(auth_client=authority, session_factory=session_factory)
    connection = MagicMock()
    connection.execute.return_value.one.return_value = (222, False)
    dispatcher._dispatcher_connection = connection
    dispatcher._dispatcher_backend_pid = 111
    with pytest.raises(RuntimeError, match="dispatcher lock lost"):
        dispatcher.poll_once()
    assert dispatcher._stop_event.is_set()
    session_factory.assert_not_called()
    dispatcher._dispatcher_connection = None
    dispatcher.stop()


def test_sandbox_cleanup_never_removes_foreign_container(monkeypatch):
    from tradelab_api.services import strategy_runner

    command = MagicMock(return_value=SimpleNamespace(returncode=0, stdout="foreign-id foreign-token", stderr=""))
    monkeypatch.setattr(strategy_runner.subprocess, "run", command)
    assert strategy_runner._terminate_sandbox("tradelab-run-test", "owned-token") is False
    assert command.call_count == 1
    assert "rm" not in command.call_args.args[0]


def test_sandbox_cleanup_removes_verified_container_id(monkeypatch):
    from tradelab_api.services import strategy_runner

    command = MagicMock(side_effect=[
        SimpleNamespace(returncode=0, stdout="owned-id owned-token", stderr=""),
        SimpleNamespace(returncode=0, stdout="owned-id", stderr=""),
        SimpleNamespace(returncode=1, stdout="", stderr="Error: No such container: owned-id"),
    ])
    monkeypatch.setattr(strategy_runner.subprocess, "run", command)
    assert strategy_runner._terminate_sandbox("tradelab-run-test", "owned-token") is True
    assert command.call_args_list[1].args[0] == ["docker", "rm", "--force", "owned-id"]


def test_unconfirmed_sandbox_cleanup_blocks_dispatcher(monkeypatch):
    from tradelab_api.core.authorization import FunctionalAuthorizationResult
    from tradelab_api.services import job_dispatcher
    from tradelab_api.services.strategy_runner import StrategyRunnerResult

    workspace, owner, run_id = uuid4(), uuid4(), uuid4()
    dispatcher = job_dispatcher.JobDispatcher(auth_client=MagicMock())
    proof = FunctionalAuthorizationResult(True, True, True, user_id=owner, workspace_id=workspace)
    monkeypatch.setattr(dispatcher, "_check_workload_authority", lambda *args: proof)
    repository = MagicMock()
    repository.get_bot_run.return_value = SimpleNamespace(
        id=run_id, status="running", workspace_id=workspace, created_by=str(owner),
        strategy_id=uuid4(), strategy_version_id=uuid4(), bot_id=None,
        pipeline_context={"workerInstanceId": dispatcher._instance_id, "sandboxName": dispatcher._sandbox_name(run_id)},
        exchange="binance", symbol="BTC/USDT", timeframe="1h", start_at=None, end_at=None,
        runtime_config={}, risk_config={}, source_snapshot={}, dataset_context={},
    )
    monkeypatch.setattr(job_dispatcher, "RunRepository", lambda *args, **kwargs: repository)
    monkeypatch.setattr(job_dispatcher, "StrategyRepository", MagicMock())
    market = MagicMock()
    market.list_market_candles.return_value = []
    monkeypatch.setattr(job_dispatcher, "MarketDataRepository", lambda *args: market)
    dispatcher._session_factory = MagicMock()
    engine = MagicMock()
    engine.run.return_value = SimpleNamespace(runner_result=StrategyRunnerResult(False, -1, "", "", sandbox_termination_confirmed=False))
    monkeypatch.setattr(job_dispatcher, "BacktestEngine", lambda: engine)
    dispatcher._execute_claimed_backtest_run(run_id, workspace, owner)
    assert dispatcher._stop_event.is_set()
    repository.complete_bot_run.assert_not_called()
    dispatcher.stop()


def test_failure_cleanup_cannot_complete_another_worker_claim(monkeypatch):
    from tradelab_api.services import job_dispatcher

    workspace, owner, run_id = uuid4(), uuid4(), uuid4()
    dispatcher = job_dispatcher.JobDispatcher(auth_client=MagicMock())
    dispatcher._session_factory = MagicMock()
    repository = MagicMock()
    repository.get_bot_run.return_value = SimpleNamespace(pipeline_context={"workerInstanceId": str(uuid4())})
    monkeypatch.setattr(job_dispatcher, "RunRepository", lambda *args, **kwargs: repository)
    dispatcher._fail_claimed_run(run_id, workspace, owner, "Authority unavailable.")
    repository.complete_bot_run.assert_not_called()
    dispatcher.stop()
