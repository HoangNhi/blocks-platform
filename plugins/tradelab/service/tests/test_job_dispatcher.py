from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import tradelab_api.services.job_dispatcher as job_dispatcher


class FakeSession:
    def commit(self) -> None:
        return None

    def rollback(self) -> None:
        return None

    def close(self) -> None:
        return None


class FakeMarketDataRepository:
    def __init__(self, session) -> None:  # noqa: ANN001
        self.session = session

    def claim_next_queued_import_job(self, *, worker_id: str):  # noqa: ANN001
        for job in STATE["import_jobs"]:
            if job.status == "queued":
                job.status = "running"
                job.worker_id = worker_id
                job.started_at = datetime.now(timezone.utc)
                return job
        return None

    def get_import_job(self, job_id):  # noqa: ANN001
        return next((job for job in STATE["import_jobs"] if job.id == job_id), None)

    def list_market_candles(self, **kwargs):  # noqa: ANN001
        return [SimpleNamespace(**candle) for candle in STATE["candles"]]

    def create_job_run_link(self, **fields):  # noqa: ANN001
        link = SimpleNamespace(created_at=datetime.now(timezone.utc), **fields)
        STATE["links"].append(link)
        return link

    def list_job_run_links(self, *, import_job_id=None, bot_run_id=None):  # noqa: ANN001
        items = STATE["links"]
        if import_job_id is not None:
            items = [link for link in items if link.import_job_id == import_job_id]
        if bot_run_id is not None:
            items = [link for link in items if link.bot_run_id == bot_run_id]
        return items


class FakeRunRepository:
    def __init__(self, session) -> None:  # noqa: ANN001
        self.session = session

    def claim_next_queued_bot_run(self):  # noqa: ANN001
        for run in STATE["runs"]:
            if run.status == "queued":
                if run.data_job_id is None:
                    run.status = "running"
                    run.started_at = datetime.now(timezone.utc)
                    return run
                linked_job = next((job for job in STATE["import_jobs"] if job.id == run.data_job_id), None)
                if linked_job is not None and linked_job.status == "completed":
                    run.status = "running"
                    run.started_at = datetime.now(timezone.utc)
                    return run
        return None

    def get_bot_run(self, run_id):  # noqa: ANN001
        return next((run for run in STATE["runs"] if run.id == run_id), None)

    def complete_bot_run(self, run, *, status: str, error_message: str | None = None):  # noqa: ANN001
        run.status = status
        run.pipeline_status = status
        run.error_message = error_message
        run.finished_at = datetime.now(timezone.utc)
        return run

    def link_data_job(self, run, import_job):  # noqa: ANN001
        run.data_job_id = import_job.id
        run.pipeline_status = "waiting_for_data"

    def list_bot_run_orders(self, run_id):  # noqa: ANN001
        return []

    def list_bot_run_signals(self, run_id):  # noqa: ANN001
        return []

    def list_bot_run_logs(self, run_id):  # noqa: ANN001
        return []

    def get_bot_run_result(self, run_id):  # noqa: ANN001
        return None


class FakeStrategyRepository:
    def __init__(self, session) -> None:  # noqa: ANN001
        self.session = session

    def get_strategy_version(self, version_id):  # noqa: ANN001
        return SimpleNamespace(id=version_id, source_code="def on_candle(ctx):\n    return None\n")


class FakeEngine:
    def run(self, request):  # noqa: ANN001
        return SimpleNamespace(
            status="completed",
            bot_run=request.bot_run,
            result=SimpleNamespace(metrics={}, equity_curve=[]),
            signals=[],
            order_intents=[],
            trade_orders=[],
            logs=[],
            equity_curve=[],
            portfolio=None,
            runner_result=None,
            stop_reason=None,
            error_message=None,
        )


STATE = {
    "import_jobs": [],
    "runs": [],
    "links": [],
    "candles": [],
}


def test_dispatcher_chains_data_job_into_backtest(monkeypatch) -> None:
    STATE["import_jobs"] = [
        SimpleNamespace(
            id=uuid4(),
            status="queued",
            job_type="repair",
            dataset_key="binance:BTCUSDT:1h",
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            requested_start_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            requested_end_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
            applied_start_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            applied_end_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
            started_at=None,
            claimed_at=None,
            finished_at=None,
            worker_id=None,
            metadata_={},
        )
    ]
    STATE["runs"] = [
        SimpleNamespace(
            id=uuid4(),
            bot_id=uuid4(),
            strategy_id=uuid4(),
            strategy_version_id=uuid4(),
            run_type="backtest",
            status="queued",
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            start_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            end_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
            started_at=None,
            finished_at=None,
            runtime_config={},
            risk_config={},
            source_snapshot={"sourceCode": "print('ok')"},
            dataset_context={},
            pipeline_context={},
            pipeline_status="waiting_for_data",
            data_job_id=STATE["import_jobs"][0].id,
            error_message=None,
        )
    ]
    STATE["links"] = [
        SimpleNamespace(
            import_job_id=STATE["import_jobs"][0].id,
            bot_run_id=STATE["runs"][0].id,
            link_status="waiting",
            created_at=datetime.now(timezone.utc),
        )
    ]
    STATE["candles"] = [
        {
            "open_time": datetime(2026, 1, 1, tzinfo=timezone.utc),
            "close_time": datetime(2026, 1, 1, 1, tzinfo=timezone.utc),
            "open": 100,
            "high": 101,
            "low": 99,
            "close": 100,
            "volume": 10,
        }
    ]

    monkeypatch.setattr(job_dispatcher, "MarketDataRepository", FakeMarketDataRepository)
    monkeypatch.setattr(job_dispatcher, "RunRepository", FakeRunRepository)
    monkeypatch.setattr(job_dispatcher, "StrategyRepository", FakeStrategyRepository)
    monkeypatch.setattr(job_dispatcher, "BacktestEngine", FakeEngine)
    monkeypatch.setattr(job_dispatcher, "persist_backtest_execution", lambda session, execution: None)
    monkeypatch.setattr(
        job_dispatcher,
        "execute_import_job",
        lambda *, market_repository, import_job, client=None: _complete_import_job(import_job),
    )

    dispatcher = job_dispatcher.JobDispatcher(session_factory=FakeSession, poll_interval_seconds=0)
    dispatcher.poll_once()

    assert STATE["import_jobs"][0].status == "completed"
    assert STATE["runs"][0].status == "completed"
    assert STATE["links"][0].link_status == "ready"


def test_dispatcher_marks_waiting_runs_failed_when_import_fails(monkeypatch) -> None:
    STATE["import_jobs"] = [
        SimpleNamespace(
            id=uuid4(),
            status="queued",
            job_type="fill",
            dataset_key="binance:BTCUSDT:1h",
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            requested_start_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            requested_end_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
            applied_start_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            applied_end_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
            started_at=None,
            claimed_at=None,
            finished_at=None,
            worker_id=None,
            metadata_={},
        )
    ]
    STATE["runs"] = [
        SimpleNamespace(
            id=uuid4(),
            bot_id=uuid4(),
            strategy_id=uuid4(),
            strategy_version_id=uuid4(),
            run_type="backtest",
            status="queued",
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            start_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            end_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
            started_at=None,
            finished_at=None,
            runtime_config={},
            risk_config={},
            source_snapshot={"sourceCode": "print('ok')"},
            dataset_context={},
            pipeline_context={},
            pipeline_status="waiting_for_data",
            data_job_id=STATE["import_jobs"][0].id,
            error_message=None,
        )
    ]
    STATE["links"] = [
        SimpleNamespace(
            import_job_id=STATE["import_jobs"][0].id,
            bot_run_id=STATE["runs"][0].id,
            link_status="waiting",
            created_at=datetime.now(timezone.utc),
        )
    ]

    monkeypatch.setattr(job_dispatcher, "MarketDataRepository", FakeMarketDataRepository)
    monkeypatch.setattr(job_dispatcher, "RunRepository", FakeRunRepository)
    monkeypatch.setattr(job_dispatcher, "StrategyRepository", FakeStrategyRepository)
    monkeypatch.setattr(job_dispatcher, "BacktestEngine", FakeEngine)
    monkeypatch.setattr(job_dispatcher, "persist_backtest_execution", lambda session, execution: None)
    monkeypatch.setattr(
        job_dispatcher,
        "execute_import_job",
        lambda *, market_repository, import_job, client=None: SimpleNamespace(job=import_job, rows_imported=0, candles=[], error_message="boom"),
    )

    dispatcher = job_dispatcher.JobDispatcher(session_factory=FakeSession, poll_interval_seconds=0)
    dispatcher.poll_once()

    assert STATE["import_jobs"][0].status == "failed"
    assert STATE["runs"][0].status == "failed"
    assert STATE["links"][0].link_status == "failed"


def test_dispatcher_finalizes_benchmark_repeat(monkeypatch) -> None:
    finalized = []

    class FakeBenchmarkRepository:
        def __init__(self, session) -> None:  # noqa: ANN001
            self.session = session

    class FakeBenchmarkService:
        def __init__(self, *, run_repository, benchmark_repository) -> None:  # noqa: ANN001
            self.run_repository = run_repository
            self.benchmark_repository = benchmark_repository

        def finalize_for_run(self, run_id):  # noqa: ANN001
            finalized.append(run_id)

    run_id = uuid4()
    STATE["import_jobs"] = []
    STATE["links"] = []
    STATE["candles"] = [
        {
            "open_time": datetime(2026, 1, 1, tzinfo=timezone.utc),
            "close_time": datetime(2026, 1, 1, 1, tzinfo=timezone.utc),
            "open": 100,
            "high": 101,
            "low": 99,
            "close": 100,
            "volume": 10,
        }
    ]
    STATE["runs"] = [
        SimpleNamespace(
            id=run_id,
            bot_id=uuid4(),
            strategy_id=uuid4(),
            strategy_version_id=uuid4(),
            run_type="benchmark_repeat",
            status="queued",
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            start_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            end_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
            started_at=None,
            finished_at=None,
            runtime_config={},
            risk_config={},
            source_snapshot={"sourceCode": "print('ok')"},
            dataset_context={},
            pipeline_context={},
            pipeline_status="queued",
            data_job_id=None,
            error_message=None,
        )
    ]

    monkeypatch.setattr(job_dispatcher, "MarketDataRepository", FakeMarketDataRepository)
    monkeypatch.setattr(job_dispatcher, "RunRepository", FakeRunRepository)
    monkeypatch.setattr(job_dispatcher, "StrategyRepository", FakeStrategyRepository)
    monkeypatch.setattr(job_dispatcher, "BacktestEngine", FakeEngine)
    monkeypatch.setattr(job_dispatcher, "persist_backtest_execution", lambda session, execution: None)
    monkeypatch.setattr(job_dispatcher, "BenchmarkRepository", FakeBenchmarkRepository)
    monkeypatch.setattr(job_dispatcher, "BenchmarkService", FakeBenchmarkService)

    dispatcher = job_dispatcher.JobDispatcher(session_factory=FakeSession, poll_interval_seconds=0)
    dispatcher.poll_once()

    assert finalized == [run_id]

def test_dispatcher_passes_runtime_and_risk_config_to_backtest_request(monkeypatch) -> None:
    captured_requests = []

    class CapturingEngine(FakeEngine):
        def run(self, request):  # noqa: ANN001
            captured_requests.append(request)
            return super().run(request)

    run_id = uuid4()
    STATE["import_jobs"] = []
    STATE["links"] = []
    STATE["candles"] = [
        {
            "open_time": datetime(2026, 1, 1, tzinfo=timezone.utc),
            "close_time": datetime(2026, 1, 1, 1, tzinfo=timezone.utc),
            "open": 100,
            "high": 101,
            "low": 99,
            "close": 100,
            "volume": 10,
        }
    ]
    STATE["runs"] = [
        SimpleNamespace(
            id=run_id,
            bot_id=uuid4(),
            strategy_id=uuid4(),
            strategy_version_id=uuid4(),
            run_type="backtest",
            status="queued",
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            start_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            end_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
            started_at=None,
            finished_at=None,
            runtime_config={"initialEquity": 100, "feeBps": 10, "slippageBps": 2},
            risk_config={
                "maxOrderPercent": 25,
                "maxPositionPercent": 100,
                "maxDrawdownPercent": 15,
                "minNotional": 10,
                "stepSize": 0.001,
                "tickSize": 0.01,
            },
            source_snapshot={"sourceCode": "print('ok')"},
            dataset_context={},
            pipeline_context={},
            pipeline_status="queued",
            data_job_id=None,
            error_message=None,
        )
    ]

    monkeypatch.setattr(job_dispatcher, "MarketDataRepository", FakeMarketDataRepository)
    monkeypatch.setattr(job_dispatcher, "RunRepository", FakeRunRepository)
    monkeypatch.setattr(job_dispatcher, "StrategyRepository", FakeStrategyRepository)
    monkeypatch.setattr(job_dispatcher, "BacktestEngine", CapturingEngine)
    monkeypatch.setattr(job_dispatcher, "persist_backtest_execution", lambda session, execution: None)

    dispatcher = job_dispatcher.JobDispatcher(session_factory=FakeSession, poll_interval_seconds=0)
    dispatcher.poll_once()

    assert len(captured_requests) == 1
    request = captured_requests[0]
    assert request.initial_equity == Decimal("100")
    assert request.fee_bps == Decimal("10")
    assert request.slippage_bps == Decimal("2")
    assert request.max_order_percent == Decimal("25")
    assert request.max_position_percent == Decimal("100")
    assert request.max_drawdown_percent == Decimal("15")
    assert request.min_notional == Decimal("10")
    assert request.step_size == Decimal("0.001")
    assert request.tick_size == Decimal("0.01")

def test_dispatcher_persists_runner_failure(monkeypatch) -> None:
    class FailedEngine:
        def run(self, request):  # noqa: ANN001
            request.bot_run.status = "failed"
            request.bot_run.pipeline_status = "failed"
            request.bot_run.error_message = "runner working directory missing"
            return SimpleNamespace(
                status="failed",
                bot_run=request.bot_run,
                result=None,
                signals=[],
                order_intents=[],
                trade_orders=[],
                logs=[],
                equity_curve=[],
                portfolio=None,
                runner_result=None,
                stop_reason=None,
                error_message="runner working directory missing",
            )

    run_id = uuid4()
    STATE["import_jobs"] = []
    STATE["links"] = []
    STATE["candles"] = [
        {
            "open_time": datetime(2026, 1, 1, tzinfo=timezone.utc),
            "close_time": datetime(2026, 1, 1, 1, tzinfo=timezone.utc),
            "open": 100,
            "high": 101,
            "low": 99,
            "close": 100,
            "volume": 10,
        }
    ]
    STATE["runs"] = [
        SimpleNamespace(
            id=run_id,
            bot_id=uuid4(),
            strategy_id=uuid4(),
            strategy_version_id=uuid4(),
            run_type="backtest",
            status="queued",
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            start_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            end_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
            started_at=None,
            finished_at=None,
            runtime_config={},
            risk_config={},
            source_snapshot={"sourceCode": "print('ok')"},
            dataset_context={},
            pipeline_context={},
            pipeline_status="queued",
            data_job_id=None,
            error_message=None,
        )
    ]

    monkeypatch.setattr(job_dispatcher, "MarketDataRepository", FakeMarketDataRepository)
    monkeypatch.setattr(job_dispatcher, "RunRepository", FakeRunRepository)
    monkeypatch.setattr(job_dispatcher, "StrategyRepository", FakeStrategyRepository)
    monkeypatch.setattr(job_dispatcher, "BacktestEngine", FailedEngine)
    monkeypatch.setattr(job_dispatcher, "persist_backtest_execution", lambda session, execution: None)

    dispatcher = job_dispatcher.JobDispatcher(session_factory=FakeSession, poll_interval_seconds=0)
    dispatcher.poll_once()

    run = STATE["runs"][0]
    assert run.status == "failed"
    assert run.pipeline_status == "failed"
    assert run.error_message == "runner working directory missing"


def _complete_import_job(import_job):  # noqa: ANN001
    import_job.status = "completed"
    import_job.finished_at = datetime.now(timezone.utc)
    return SimpleNamespace(job=import_job, rows_imported=1, candles=[], error_message=None)
