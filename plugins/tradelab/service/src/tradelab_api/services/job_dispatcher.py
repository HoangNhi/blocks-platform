from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
import os
from threading import Event, Thread
from time import monotonic
from typing import Any, Callable
from uuid import UUID, uuid4

from tradelab_api.core.authorization import (
    FunctionalAuthorizationResult,
    FunctionalPermissionAction,
)
from tradelab_api.core.config import get_settings
from tradelab_api.core.context import ExecutionContext
from tradelab_api.db.models import BotRun
from tradelab_api.db.session import SessionLocal, get_engine
from tradelab_api.services.backtest.engine import (
    BacktestEngine,
    BacktestRequest,
    persist_backtest_execution,
)
from tradelab_api.services.benchmark_repository import BenchmarkRepository
from tradelab_api.services.benchmark_service import BenchmarkService
from tradelab_api.services.market_data_repository import MarketDataRepository
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
        auth_client: Any | None = None,
    ) -> None:
        self._session_factory = session_factory or self._create_session
        self._poll_interval_seconds = (
            poll_interval_seconds
            if poll_interval_seconds is not None
            else get_settings().job_poll_interval_seconds
        )
        self._worker_id = worker_id or get_settings().default_worker_identity
        self._instance_id = str(uuid4())
        self._stop_event = Event()
        self._thread: Thread | None = None
        self.stats = DispatcherStats()
        self._retry_at: dict[str, tuple[float, float]] = {}
        self._last_claimed: dict[str, float] = {}
        self._executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="tradelab-backtest")
        self._futures = {}
        self._dispatcher_connection = None
        self._dispatcher_backend_pid = None

        if auth_client is None:
            settings = get_settings()
            key = None
            if hasattr(settings, "system_service_authorization_key") and settings.system_service_authorization_key:
                val = settings.system_service_authorization_key
                key = val.get_secret_value() if hasattr(val, "get_secret_value") else str(val)
            if not key:
                key = (
                    os.getenv("SYSTEM_SERVICE_AUTHORIZATION_KEY")
                    or os.getenv("TRADELAB_WORKER_AUTHORITY_KEY")
                    or os.getenv("INTERNAL_SERVICE_AUTHORIZATION_KEY")
                )
            if key and key.strip():
                from tradelab_api.core.authorization import SystemFunctionalAuthorizationClient

                base_url = (
                    getattr(settings, "system_service_base_url", None)
                    or os.getenv("SYSTEM_SERVICE_BASE_URL")
                    or "http://systemservice"
                )
                self._auth_client = SystemFunctionalAuthorizationClient(
                    base_url=str(base_url),
                    service_authorization_key=key.strip(),
                )
            else:
                self._auth_client = None
        else:
            self._auth_client = auth_client

    def _has_workload_authority(self) -> bool:
        if self._auth_client is None:
            return False
        key = getattr(self._auth_client, "_service_authorization_key", None)
        return bool(key and str(key).strip())

    def _check_workload_authority(self, user_id: UUID, workspace_id: UUID) -> FunctionalAuthorizationResult:
        if self._auth_client is not None:
            coro = self._auth_client.check_workload(user_id, workspace_id)
            if asyncio.iscoroutine(coro):
                try:
                    loop = asyncio.get_running_loop()
                except RuntimeError:
                    loop = None
                if loop and loop.is_running():
                    import concurrent.futures

                    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                        return executor.submit(asyncio.run, self._bounded_authority(coro)).result(timeout=2.5)
                return asyncio.run(self._bounded_authority(coro))
            return coro
        return FunctionalAuthorizationResult(False, False, False)

    @staticmethod
    async def _bounded_authority(coro) -> FunctionalAuthorizationResult:
        try:
            return await asyncio.wait_for(coro, timeout=2)
        except Exception:
            return FunctionalAuthorizationResult(False, False, False)

    def _is_quarantined(self, run: BotRun) -> bool:
        if getattr(run, "ownership_verified_at", None) is None:
            return True
        if not isinstance(getattr(run, "workspace_id", None), UUID) or run.workspace_id.int == 0:
            return True
        creator = getattr(run, "created_by", None)
        if not creator or not isinstance(creator, str):
            return True
        try:
            parsed = UUID(creator.strip())
            return parsed.int == 0 or creator != str(parsed)
        except (ValueError, TypeError):
            return True

    def _evaluate_candidate_authority(self, run: BotRun) -> str:
        if self._is_quarantined(run):
            return "quarantine"
        user_id = UUID(str(run.created_by).strip())
        workspace_id = run.workspace_id
        res = self._check_workload_authority(user_id, workspace_id)
        if not res.authority_available or not res.authenticated or res.user_id != user_id or res.workspace_id != workspace_id:
            return "backoff"
        if not res.allowed:
            return "denied"
        return "allowed"

    def _recheck_authority_before_persist(self, user_id: UUID, workspace_id: UUID) -> bool:
        res = self._check_workload_authority(user_id, workspace_id)
        return bool(res.authority_available and res.authenticated and res.allowed and res.user_id == user_id and res.workspace_id == workspace_id)

    def start(self) -> None:
        if not self._has_workload_authority():
            raise RuntimeError("workspace_authority_recheck_unavailable")
        if self._thread is not None and self._thread.is_alive():
            return

        from sqlalchemy import text
        from tradelab_api.services.strategy_runner import verify_strategy_executor

        verify_strategy_executor()
        connection = get_engine().connect().execution_options(isolation_level="AUTOCOMMIT")
        try:
            backend_pid, acquired = connection.execute(text("SELECT pg_backend_pid(), pg_try_advisory_lock(841013)")).one()
            if not acquired:
                raise RuntimeError("A TradeLab dispatcher already owns this database.")
        except Exception:
            connection.close()
            raise
        self._dispatcher_connection = connection
        self._dispatcher_backend_pid = backend_pid
        self._stop_event.clear()
        self._thread = Thread(target=self._run_loop, name="tradelab-job-dispatcher", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join()
            self._thread = None
        self._executor.shutdown(wait=True, cancel_futures=True)
        if self._dispatcher_connection is not None:
            try:
                self._dispatcher_connection.invalidate()
            finally:
                self._dispatcher_connection.close()
                self._dispatcher_connection = None
                self._dispatcher_backend_pid = None

    def _backoff(self, actor: str, *, now: float | None = None) -> None:
        now = monotonic() if now is None else now
        delay = min(self._retry_at.get(actor, (0, 0))[1] * 2 or 1, 30)
        self._retry_at[actor] = (now + delay, delay)

    def _sandbox_name(self, run_id: UUID) -> str:
        return "tradelab-run-" + run_id.hex + "-" + UUID(self._instance_id).hex

    def poll_once(self) -> DispatcherStats:
        if not self._has_workload_authority():
            raise RuntimeError("workspace_authority_recheck_unavailable")

        from sqlalchemy import func, or_, select, text
        from tradelab_api.db.models import MarketDataImportJob

        if self._dispatcher_connection is not None:
            try:
                backend_pid, owns_lock = self._dispatcher_connection.execute(text(
                    "SELECT pg_backend_pid(), EXISTS (SELECT 1 FROM pg_locks "
                    "WHERE locktype = 'advisory' AND pid = pg_backend_pid() "
                    "AND classid = 0 AND objid = 841013 AND objsubid = 1 "
                    "AND mode = 'ExclusiveLock' AND granted)"
                )).one()
                if backend_pid != self._dispatcher_backend_pid or owns_lock is not True:
                    raise RuntimeError("TradeLab dispatcher lock lost.")
            except Exception:
                self._stop_event.set()
                raise
        for run_id, future in list(self._futures.items()):
            if future.done():
                del self._futures[run_id]
                future.result()
        if len(self._futures) >= 2:
            return self.stats
        with self._session_factory() as session:
            dependency = select(MarketDataImportJob.status).where(MarketDataImportJob.id == BotRun.data_job_id).scalar_subquery()
            ranked = (
                select(
                    BotRun.id,
                    func.row_number().over(partition_by=BotRun.created_by, order_by=(BotRun.created_at, BotRun.id)).label("rank"),
                )
                .where(BotRun.status == "queued", BotRun.run_type == "backtest", or_(BotRun.data_job_id.is_(None), dependency == "completed"))
                .subquery()
            )
            statement = (
                select(BotRun.id, BotRun.workspace_id, BotRun.created_by, BotRun.data_job_id, BotRun.strategy_id, BotRun.strategy_version_id, BotRun.bot_id, BotRun.ownership_verified_at)
                .join(ranked, BotRun.id == ranked.c.id)
                .where(ranked.c.rank == 1)
                .order_by(BotRun.created_at, BotRun.id)
                .limit(100)
            )
            candidates = session.execute(statement).all()

        pending_actors = {candidate[2] for candidate in candidates}
        self._last_claimed = {actor: timestamp for actor, timestamp in self._last_claimed.items() if actor in pending_actors}
        self._retry_at = {actor: value for actor, value in self._retry_at.items() if actor in pending_actors}
        candidates.sort(key=lambda candidate: self._last_claimed.get(candidate[2], 0))
        for candidate in candidates:
            if len(self._futures) >= 2:
                break
            run_id, workspace_id, actor, data_job_id, strategy_id, version_id, bot_id, ownership_verified_at = candidate
            if monotonic() < self._retry_at.get(actor, (0, 0))[0]:
                continue
            reference = BotRun(id=run_id, workspace_id=workspace_id, created_by=actor, data_job_id=data_job_id, ownership_verified_at=ownership_verified_at)
            decision = self._evaluate_candidate_authority(reference)
            if decision == "backoff":
                self._backoff(actor)
                continue
            self._retry_at.pop(actor, None)
            with self._session_factory() as session:
                session.execute(text("SELECT pg_advisory_xact_lock(841012)"))
                run = session.scalar(select(BotRun).where(BotRun.id == run_id, BotRun.status == "queued").with_for_update(skip_locked=True))
                if run is None or (run.workspace_id, run.created_by, run.data_job_id, run.strategy_id, run.strategy_version_id, run.bot_id) != (workspace_id, actor, data_job_id, strategy_id, version_id, bot_id):
                    continue
                if decision == "allowed" and RunRepository(session, workspace_id, UUID(actor)).get_bot_run(run_id) is None:
                    decision = "quarantine"
                if decision in ("quarantine", "denied"):
                    run.status = run.pipeline_status = "failed"
                    run.pipeline_context = {**dict(run.pipeline_context or {}), "state": "failed", "runId": str(run.id)}
                    run.finished_at = datetime.now(timezone.utc)
                    run.error_message = "Run authority denied or ownership unresolved."
                    session.commit()
                    self.stats.failed_runs += 1
                    continue
                reservations = BotRun.__table__.c
                active = session.scalar(select(func.count()).select_from(BotRun.__table__).where(reservations.status == "running", reservations.run_type == "backtest")) or 0
                if active >= 2:
                    break
                actor_active = session.scalar(select(func.count()).select_from(BotRun.__table__).where(reservations.created_by == actor, reservations.status == "running", reservations.run_type == "backtest")) or 0
                if actor_active:
                    continue
                if data_job_id is not None and session.scalar(select(MarketDataImportJob.status).where(MarketDataImportJob.id == data_job_id)) != "completed":
                    continue
                run.status = run.pipeline_status = "running"
                run.started_at = datetime.now(timezone.utc)
                run.pipeline_context = {**dict(run.pipeline_context or {}), "state": "running", "runId": str(run.id), "workerId": self._worker_id, "workerInstanceId": self._instance_id, "sandboxName": self._sandbox_name(run.id)}
                session.commit()
            self._last_claimed[actor] = monotonic()
            self._futures[run_id] = self._executor.submit(self._execute_with_cleanup, run_id, workspace_id, UUID(actor))
        return self.stats

    def _execute_with_cleanup(self, run_id: UUID, workspace_id: UUID, user_id: UUID) -> None:
        try:
            self._execute_claimed_backtest_run(run_id, workspace_id, user_id)
        except Exception:
            self._fail_claimed_run(run_id, workspace_id, user_id, "Backtest execution failed.")
            raise

    def _execute_claimed_backtest_run(
        self,
        run_id: UUID,
        workspace_id: UUID,
        user_id: UUID,
    ) -> None:
        proof = self._check_workload_authority(user_id, workspace_id)
        if not (proof.authority_available and proof.authenticated and proof.allowed and proof.user_id == user_id and proof.workspace_id == workspace_id):
            self._fail_claimed_run(run_id, workspace_id, user_id, "Authority unavailable before launch.")
            return
        context = ExecutionContext(
            workspace_id=workspace_id,
            actor_user_id=user_id,
            permission_key="tradelab.backtests",
            action=FunctionalPermissionAction.ANALYZE,
            resource_type="bot_run",
            resource_id=run_id,
            run_id=run_id,
            correlation_id=str(run_id),
            authority_verified_at=datetime.now(timezone.utc),
            authority_deadline_monotonic=monotonic() + 7,
        )

        def supervise() -> str | None:
            if self._stop_event.is_set():
                return "Dispatcher stopped."
            if not self._recheck_authority_before_persist(user_id, workspace_id):
                return "Authority revoked or unavailable during execution."
            with self._session_factory() as session:
                current = RunRepository(session, workspace_id, user_id).get_bot_run(run_id)
                if current is None or current.status != "running":
                    return "Run cancelled or ownership changed."
            return None

        # Step 1: Read run inputs in short transaction, then close session
        with self._session_factory() as session:
            from tradelab_api.db.ownership_provenance import bind_execution_context
            bind_execution_context(session, context)
            run_repository = RunRepository(session, workspace_id=workspace_id, owner_user_id=user_id)
            run = run_repository.get_bot_run(run_id)
            if run is None or run.status != "running":
                return

            sandbox_name = self._sandbox_name(run_id)
            if (run.pipeline_context or {}).get("workerInstanceId") != self._instance_id or (run.pipeline_context or {}).get("sandboxName") != sandbox_name:
                self._stop_event.set()
                return

            run_repository._validate_relationships({"strategy_id": run.strategy_id, "strategy_version_id": run.strategy_version_id, "bot_id": run.bot_id})
            market_repository = MarketDataRepository(session)
            strategy_repository = StrategyRepository(
                session, workspace_id=workspace_id, owner_user_id=user_id
            )

            strategy_version = strategy_repository.get_strategy_version(run.strategy_version_id)
            if strategy_version is None:
                run_repository.complete_bot_run(
                    run, status="failed", error_message="Strategy version not found."
                )
                session.commit()
                self.stats.failed_runs += 1
                return

            candles = market_repository.list_market_candles(
                exchange=run.exchange,
                symbol=run.symbol,
                timeframe=run.timeframe,
                start_at=run.start_at,
                end_at=run.end_at,
            )
            serialized_candles = [_serialize_candle(candle) for candle in candles]

            request = BacktestRequest(
                sandbox_name=sandbox_name,
                execution_context=context,
                supervisor=supervise,
                strategy_source=strategy_version.source_code,
                candles=serialized_candles,
                symbol=run.symbol,
                timeframe=run.timeframe,
                exchange=run.exchange,
                initial_equity=_decimal_from_config(
                    run.runtime_config, "initialEquity", "initial_equity", default="1000"
                ),
                fee_bps=_decimal_from_config(run.runtime_config, "feeBps", "fee_bps", default="0"),
                slippage_bps=_decimal_from_config(
                    run.runtime_config, "slippageBps", "slippage_bps", default="0"
                ),
                max_order_percent=_optional_decimal_from_config(
                    run.risk_config, "maxOrderPercent", "max_order_percent"
                ),
                max_position_percent=_optional_decimal_from_config(
                    run.risk_config, "maxPositionPercent", "max_position_percent"
                ),
                min_notional=_optional_decimal_from_config(
                    run.risk_config, "minNotional", "min_notional"
                ),
                step_size=_optional_decimal_from_config(run.risk_config, "stepSize", "step_size"),
                tick_size=_optional_decimal_from_config(run.risk_config, "tickSize", "tick_size"),
                max_drawdown_percent=_optional_decimal_from_config(
                    run.risk_config, "maxDrawdownPercent", "max_drawdown_percent"
                ),
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

        # Step 2: Compute outside DB session
        reason = supervise()
        if reason is not None:
            self._fail_claimed_run(run_id, workspace_id, user_id, reason)
            return
        try:
            execution = BacktestEngine().run(request)
        except Exception:
            self._fail_claimed_run(run_id, workspace_id, user_id, "Backtest execution failed.")
            raise

        if execution.runner_result is not None and not execution.runner_result.sandbox_termination_confirmed:
            self._stop_event.set()
            return

        # Step 3: Pre-persistence authority recheck
        if self._stop_event.is_set() or not self._recheck_authority_before_persist(user_id, workspace_id):
            self._fail_claimed_run(run_id, workspace_id, user_id, "Dispatcher stopped or authority revoked during strategy execution.")
            return

        # Step 4: Persist results in short write transaction
        with self._session_factory() as session:
            run_repo = RunRepository(session, workspace_id=workspace_id, owner_user_id=user_id)
            current_run = run_repo.get_bot_run(run_id)
            if current_run is None:
                return
            if (current_run.pipeline_context or {}).get("workerInstanceId") != self._instance_id:
                self._stop_event.set()
                return
            run_repo._validate_relationships({"strategy_id": current_run.strategy_id, "strategy_version_id": current_run.strategy_version_id, "bot_id": current_run.bot_id})

            completed_run = run_repo.complete_bot_run(
                current_run, status=execution.status, error_message=execution.error_message
            )
            # If completed_run is None, run was cancelled while compute was running
            if completed_run is not None:
                execution.bot_run = completed_run
                if execution.status == "completed":
                    persist_backtest_execution(session, execution)
                self.stats.processed_backtests += 1
                bench_repo = BenchmarkRepository(session)
                self._finalize_benchmark_repeat(run_repo, bench_repo, completed_run)
                session.commit()
            else:
                session.rollback()

    def _fail_claimed_run(self, run_id: UUID, workspace_id: UUID, user_id: UUID, message: str) -> None:
        with self._session_factory() as session:
            repository = RunRepository(session, workspace_id, user_id)
            current = repository.get_bot_run(run_id)
            if current is not None and (current.pipeline_context or {}).get("workerInstanceId") == self._instance_id:
                repository.complete_bot_run(current, status="failed", error_message=message)
                session.commit()
        self.stats.failed_runs += 1

    def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                self.poll_once()
            except Exception as e:
                import traceback

                print(f"JobDispatcher Exception: {e}", flush=True)
                traceback.print_exc()
            self._stop_event.wait(max(self._poll_interval_seconds, 0.1))

    def _finalize_benchmark_repeat(
        self,
        run_repository: RunRepository,
        benchmark_repository: BenchmarkRepository,
        run: BotRun,
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


def _serialize_candle(candle: Any) -> dict[str, object]:
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
