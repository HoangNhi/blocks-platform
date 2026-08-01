from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from threading import Event, Thread
from time import sleep
from typing import Any, Callable

from tradelab_api.core.config import get_settings
from tradelab_api.db.session import SessionLocal, get_engine
from tradelab_api.services.backtest.engine import BacktestEngine, BacktestRequest, persist_backtest_execution
from tradelab_api.services.benchmark_repository import BenchmarkRepository
from tradelab_api.services.benchmark_service import BenchmarkService
from tradelab_api.services.market_data_repository import MarketDataRepository
from tradelab_api.services.market_data_service import execute_import_job
from tradelab_api.services.run_repository import RunRepository
from tradelab_api.services.strategy_repository import StrategyRepository


@dataclass(slots=True)
class DispatcherStats:
    processed_import_jobs: int = 0
    processed_backtests: int = 0
    failed_runs: int = 0


class JobDispatcher:
    def __init__(
        self,
        *,
        session_factory: Callable[[], object] | None = None,
        poll_interval_seconds: float | None = None,
        worker_id: str | None = None,
    ) -> None:
        self._session_factory = session_factory or self._create_session
        self._poll_interval_seconds = poll_interval_seconds if poll_interval_seconds is not None else get_settings().job_poll_interval_seconds
        self._worker_id = worker_id or get_settings().default_worker_identity
        self._stop_event = Event()
        self._thread: Thread | None = None
        self.stats = DispatcherStats()

    def start(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return
            
        try:
            from sqlalchemy import text
            session = self._session_factory()
            session.execute(text("UPDATE bot_run SET status='failed', pipeline_status='failed' WHERE status IN ('queued', 'running', 'waiting_for_data')"))
            session.execute(text("UPDATE market_data_import_job SET status='failed' WHERE status IN ('queued', 'running')"))
            session.commit()
            session.close()
            print("CLEARED ALL STUCK BOT RUNS", flush=True)
        except Exception as e:
            print(f"Failed to clear runs: {e}")
            
        self._stop_event.clear()
        self._thread = Thread(target=self._run_loop, name="tradelab-job-dispatcher", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=5)
            self._thread = None

    def poll_once(self) -> DispatcherStats:
        session = self._session_factory()
        try:
            market_repository = MarketDataRepository(session)
            run_repository = RunRepository(session)
            strategy_repository = StrategyRepository(session)
            benchmark_repository = BenchmarkRepository(session)

            import_job = market_repository.claim_next_queued_import_job(worker_id=self._worker_id)
            if import_job is not None:
                self._execute_import_job(session, market_repository, run_repository, import_job)
                self.stats.processed_import_jobs += 1

            next_run = run_repository.claim_next_queued_bot_run()
            if next_run is not None:
                self._execute_backtest_run(
                    session,
                    market_repository,
                    run_repository,
                    strategy_repository,
                    benchmark_repository,
                    next_run,
                )
                self.stats.processed_backtests += 1

            session.commit()
            return self.stats
        except Exception:
            session.rollback()
            raise
        finally:
            session.close()

    def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                self.poll_once()
            except Exception as e:
                import traceback
                print(f"JobDispatcher Exception: {e}", flush=True)
                traceback.print_exc()
            sleep(max(self._poll_interval_seconds, 0.1))

    def _execute_import_job(
        self,
        session,
        market_repository: MarketDataRepository,
        run_repository: RunRepository,
        import_job,
    ) -> None:
        try:
            result = execute_import_job(market_repository=market_repository, import_job=import_job)
            if result.job is not None:
                import_job = result.job
            if result.error_message is not None:
                import_job.status = "failed"
                import_job.finished_at = datetime.now(timezone.utc)
                import_job.error_message = result.error_message
                _fail_waiting_runs(market_repository, run_repository, import_job.id, result.error_message)
                return
            _promote_waiting_runs(market_repository, run_repository, import_job.id)
        except Exception as exc:
            import_job.status = "failed"
            import_job.error_message = str(exc)
            _fail_waiting_runs(market_repository, run_repository, import_job.id, str(exc))

    def _execute_backtest_run(
        self,
        session,
        market_repository: MarketDataRepository,
        run_repository: RunRepository,
        strategy_repository: StrategyRepository,
        benchmark_repository: BenchmarkRepository,
        run,
    ) -> None:
        if run.data_job_id is not None:
            linked_job = market_repository.get_import_job(run.data_job_id)
            if linked_job is not None and linked_job.status not in {"completed"}:
                run.status = "queued"
                self.stats.processed_backtests -= 1
                return
            if linked_job is None:
                run.status = "failed"
                run.error_message = "Linked data job could not be found."
                self.stats.failed_runs += 1
                self._finalize_benchmark_repeat(run_repository, benchmark_repository, run)
                return

        strategy_version = strategy_repository.get_strategy_version(run.strategy_version_id)
        if strategy_version is None:
            run.status = "failed"
            run.error_message = "Strategy version not found."
            self.stats.failed_runs += 1
            self._finalize_benchmark_repeat(run_repository, benchmark_repository, run)
            return

        candles = market_repository.list_market_candles(
            exchange=run.exchange,
            symbol=run.symbol,
            timeframe=run.timeframe,
            start_at=run.start_at,
            end_at=run.end_at,
        )
        execution = BacktestEngine().run(
            BacktestRequest(
                strategy_source=strategy_version.source_code,
                candles=[_serialize_candle(candle) for candle in candles],
                symbol=run.symbol,
                timeframe=run.timeframe,
                exchange=run.exchange,
                initial_equity=_decimal_from_config(run.runtime_config, "initialEquity", "initial_equity", default="1000"),
                fee_bps=_decimal_from_config(run.runtime_config, "feeBps", "fee_bps", default="0"),
                slippage_bps=_decimal_from_config(run.runtime_config, "slippageBps", "slippage_bps", default="0"),
                max_order_percent=_optional_decimal_from_config(run.risk_config, "maxOrderPercent", "max_order_percent"),
                max_position_percent=_optional_decimal_from_config(run.risk_config, "maxPositionPercent", "max_position_percent"),
                min_notional=_optional_decimal_from_config(run.risk_config, "minNotional", "min_notional"),
                step_size=_optional_decimal_from_config(run.risk_config, "stepSize", "step_size"),
                tick_size=_optional_decimal_from_config(run.risk_config, "tickSize", "tick_size"),
                max_drawdown_percent=_optional_decimal_from_config(run.risk_config, "maxDrawdownPercent", "max_drawdown_percent"),
                runtime_config=dict(run.runtime_config or {}),
                risk_config=dict(run.risk_config or {}),
                market_type=str(run.runtime_config.get("marketType", "spot")).strip().lower(),
                default_leverage=int(run.runtime_config.get("defaultLeverage", 1) or 1),
                bot_id=run.bot_id,
                strategy_id=run.strategy_id,
                strategy_version_id=run.strategy_version_id,
                bot_run=run,
                source_snapshot=dict(run.source_snapshot or {}),
                dataset_context=dict(run.dataset_context or {}),
                pipeline_context=dict(run.pipeline_context or {}),
            )
        )
        persist_backtest_execution(session, execution)
        if run.data_job_id is not None:
            link = market_repository.list_job_run_links(import_job_id=run.data_job_id, bot_run_id=run.id)
            if not link:
                market_repository.create_job_run_link(import_job_id=run.data_job_id, bot_run_id=run.id, link_status="started")
        run_repository.complete_bot_run(run, status=execution.status, error_message=execution.error_message)
        self._finalize_benchmark_repeat(run_repository, benchmark_repository, run)

    def _finalize_benchmark_repeat(
        self,
        run_repository: RunRepository,
        benchmark_repository: BenchmarkRepository,
        run,
    ) -> None:
        if run.run_type != "benchmark_repeat":
            return
        BenchmarkService(
            run_repository=run_repository,
            benchmark_repository=benchmark_repository,
        ).finalize_for_run(run.id)

    @staticmethod
    def _create_session():
        return SessionLocal(bind=get_engine())


def _promote_waiting_runs(market_repository: MarketDataRepository, run_repository: RunRepository, import_job_id) -> None:
    links = market_repository.list_job_run_links(import_job_id=import_job_id)
    for link in links:
        link.link_status = "ready"
        run = run_repository.get_bot_run(link.bot_run_id)
        if run is not None:
            run.pipeline_status = "queued"
            run.data_job_id = import_job_id


def _fail_waiting_runs(
    market_repository: MarketDataRepository,
    run_repository: RunRepository,
    import_job_id,
    error_message: str,
) -> None:
    links = market_repository.list_job_run_links(import_job_id=import_job_id)
    for link in links:
        link.link_status = "failed"
        run = run_repository.get_bot_run(link.bot_run_id)
        if run is not None:
            run.status = "failed"
            run.finished_at = datetime.now(timezone.utc)
            run.error_message = error_message
            run.pipeline_status = "failed"


def _serialize_candle(candle) -> dict[str, object]:
    return {
        "open_time": candle.open_time,
        "close_time": candle.close_time,
        "open": candle.open,
        "high": candle.high,
        "low": candle.low,
        "close": candle.close,
        "volume": candle.volume,
    }

def _decimal_from_config(config: dict[str, Any] | None, *keys: str, default: str) -> Decimal:
    value = _value_from_config(config, *keys)
    if value is None:
        return Decimal(default)
    return Decimal(str(value))

def _optional_decimal_from_config(config: dict[str, Any] | None, *keys: str) -> Decimal | None:
    value = _value_from_config(config, *keys)
    if value is None:
        return None
    return Decimal(str(value))

def _value_from_config(config: dict[str, Any] | None, *keys: str) -> Any | None:
    if not config:
        return None
    for key in keys:
        value = config.get(key)
        if value is not None:
            return value
    return None
