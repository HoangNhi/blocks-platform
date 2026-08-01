from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.orm import joinedload

from tradelab_api.db.models import (
    BacktestPosition,
    BacktestResult,
    BotRun,
    MarketDataImportJob,
    OrderIntent,
    StrategyLog,
    StrategySignal,
    TradeOrder,
)

from .repository_base import CRUDRepository


class RunRepository(CRUDRepository[BotRun]):
    model = BotRun

    def create_bot_run(self, **fields: object) -> BotRun:
        return self.create(BotRun(**fields))

    def list_bot_runs(
        self,
        *,
        strategy_id: UUID | None = None,
        status: str | None = None,
        limit: int | None = None,
    ) -> list[BotRun]:
        query = self.session.query(BotRun)
        if strategy_id is not None:
            query = query.filter(BotRun.strategy_id == strategy_id)
        if status is not None:
            query = query.filter(BotRun.status == status)
        query = query.order_by(BotRun.created_at.desc())
        if limit is not None:
            query = query.limit(limit)
        return list(query.all())

    def list_completed_bot_runs(
        self,
        *,
        strategy_id: UUID | None = None,
        limit: int | None = None,
    ) -> list[BotRun]:
        query = self.session.query(BotRun).filter(BotRun.status == "completed")
        if strategy_id is not None:
            query = query.filter(BotRun.strategy_id == strategy_id)
        query = query.order_by(BotRun.finished_at.desc().nullslast(), BotRun.created_at.desc())
        if limit is not None:
            query = query.limit(limit)
        return list(query.all())

    def list_strategy_pipeline_runs(
        self,
        *,
        strategy_id: UUID,
        pipeline_statuses: set[str],
        include_run_status: bool = False,
        newest_first: bool = True,
        limit: int | None = None,
    ) -> list[BotRun]:
        query = self.session.query(BotRun)
        status_filters = [BotRun.pipeline_status.in_(tuple(sorted(pipeline_statuses)))]
        if include_run_status:
            status_filters.append(BotRun.status.in_(tuple(sorted(pipeline_statuses))))
        query = query.filter(BotRun.strategy_id == strategy_id).filter(or_(*status_filters))
        last_activity = func.coalesce(BotRun.finished_at, BotRun.started_at, BotRun.created_at)
        if newest_first:
            query = query.order_by(last_activity.desc(), BotRun.created_at.desc())
        else:
            query = query.order_by(last_activity.asc(), BotRun.created_at.asc())
        if limit is not None:
            query = query.limit(limit)
        return list(query.all())

    def get_bot_run(self, run_id: UUID) -> BotRun | None:
        return self.get_by_id(run_id, active_only=False)

    def claim_next_queued_bot_run(self) -> BotRun | None:
        data_job_status = (
            select(MarketDataImportJob.status)
            .where(MarketDataImportJob.id == BotRun.data_job_id)
            .scalar_subquery()
        )
        run = (
            self.session.query(BotRun)
            .filter(BotRun.status == "queued")
            .filter(
                or_(
                    BotRun.data_job_id.is_(None),
                    data_job_status == "completed",
                    data_job_status.is_(None),
                )
            )
            .order_by(BotRun.created_at.asc())
            .with_for_update(skip_locked=True)
            .first()
        )
        if run is None:
            return None
        run.status = "running"
        run.pipeline_status = "running"
        run.pipeline_context = {
            **dict(run.pipeline_context or {}),
            "state": "running",
            "runId": str(run.id),
        }
        run.started_at = datetime.now(timezone.utc)
        self.session.flush()
        self.session.refresh(run)
        return run

    def complete_bot_run(self, run: BotRun, *, status: str, error_message: str | None = None) -> BotRun:
        run.status = status
        run.pipeline_status = status
        run.pipeline_context = {
            **dict(run.pipeline_context or {}),
            "state": status,
            "runId": str(run.id),
        }
        run.finished_at = datetime.now(timezone.utc)
        run.error_message = error_message
        self.session.flush()
        self.session.refresh(run)
        return run

    def link_data_job(
        self,
        run: BotRun,
        import_job: MarketDataImportJob,
        *,
        link_status: str = "waiting",
    ) -> None:
        run.data_job_id = import_job.id
        run.pipeline_context = {
            **dict(run.pipeline_context or {}),
            "dataJobId": str(import_job.id),
            "dataJobStatus": import_job.status,
            "dataJobType": import_job.job_type,
        }
        self.session.flush()

    def list_bot_run_logs(self, run_id: UUID) -> list[StrategyLog]:
        return list(
            self.session.query(StrategyLog)
            .filter(StrategyLog.bot_run_id == run_id)
            .order_by(StrategyLog.created_at)
            .all()
        )

    def list_bot_run_orders(self, run_id: UUID) -> list[TradeOrder]:
        return list(
            self.session.query(TradeOrder)
            .options(joinedload(TradeOrder.order_intent).joinedload(OrderIntent.strategy_signal))
            .filter(TradeOrder.bot_run_id == run_id)
            .order_by(TradeOrder.created_at)
            .all()
        )

    def list_bot_run_signals(self, run_id: UUID) -> list[StrategySignal]:
        return list(
            self.session.query(StrategySignal)
            .filter(StrategySignal.bot_run_id == run_id)
            .order_by(StrategySignal.created_at)
            .all()
        )

    def get_bot_run_result(self, run_id: UUID) -> BacktestResult | None:
        return self.session.query(BacktestResult).filter(BacktestResult.bot_run_id == run_id).one_or_none()

    def list_bot_run_trades(self, run_id: UUID) -> list[TradeOrder]:
        return self.list_bot_run_orders(run_id)

    def get_backtest_positions(self, run_id: UUID) -> list[BacktestPosition]:
        return (
            self.session.query(BacktestPosition)
            .filter(BacktestPosition.run_id == run_id)
            .all()
        )

    def get_bot_run_analysis_inputs(self, run_id: UUID) -> dict[str, object]:
        run = self.get_bot_run(run_id)
        return {
            "run": run,
            "result": self.get_bot_run_result(run_id),
            "orders": self.list_bot_run_orders(run_id),
            "signals": self.list_bot_run_signals(run_id),
            "logs": self.list_bot_run_logs(run_id),
            "positions": self.get_backtest_positions(run_id) if run is not None else [],
        }
