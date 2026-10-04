from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import and_, func, or_, select, text, update
from sqlalchemy.orm import Session, joinedload

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
from tradelab_api.services.bot_repository import BotRepository
from tradelab_api.services.scoped_repository import PrivateOwnerRepository
from tradelab_api.services.strategy_repository import StrategyRepository
from tradelab_api.db.models import Bot, Strategy, StrategyVersion


class RunRepository(PrivateOwnerRepository[BotRun]):
    model = BotRun

    def __init__(self, session: Session, workspace_id: UUID, owner_user_id: UUID) -> None:
        super().__init__(session, workspace_id, owner_user_id)

    def _base_select(self):
        return (
            super()._base_select()
            .join(Strategy, Strategy.id == BotRun.strategy_id)
            .join(StrategyVersion, StrategyVersion.id == BotRun.strategy_version_id)
            .outerjoin(Bot, Bot.id == BotRun.bot_id)
            .where(
                Strategy.workspace_id == self.workspace_id,
                Strategy.created_by == str(self.owner_user_id),
                BotRun.strategy_id.in_(StrategyRepository(self.session, self.workspace_id, self.owner_user_id)._base_select().with_only_columns(Strategy.id)),
                StrategyVersion.strategy_id == BotRun.strategy_id,
                StrategyVersion.workspace_id == self.workspace_id,
                StrategyVersion.created_by == str(self.owner_user_id),
                or_(BotRun.bot_id.is_(None), and_(
                    BotRun.bot_id.in_(BotRepository(self.session, self.workspace_id, self.owner_user_id)._base_select().with_only_columns(Bot.id)),
                    Bot.workspace_id == self.workspace_id,
                    Bot.created_by == str(self.owner_user_id),
                    Bot.strategy_id == BotRun.strategy_id,
                )),
            )
        )

    def create_bot_run(self, **fields: object) -> BotRun:
        fields.pop("workspace_id", None)
        self._validate_relationships(fields)
        if fields.get("run_type", "backtest") == "backtest" and fields.get("status", "queued") == "queued":
            self.session.execute(text("SELECT pg_advisory_xact_lock(841012)"))
            global_count = self.session.scalar(select(func.count(BotRun.id)).where(BotRun.run_type == "backtest", BotRun.status == "queued")) or 0
            user_count = self.session.scalar(select(func.count(BotRun.id)).where(BotRun.run_type == "backtest", BotRun.status == "queued", BotRun.created_by == str(self.owner_user_id))) or 0
            if global_count >= 100 or user_count >= 20:
                raise ValueError("Backtest queued quota exceeded.")
        return self.create(BotRun(**fields))

    def _validate_relationships(self, fields: dict[str, object]) -> None:
        strategy_id = fields.get("strategy_id")
        version_id = fields.get("strategy_version_id")
        if not isinstance(strategy_id, UUID) or not isinstance(version_id, UUID):
            raise PermissionError("Run strategy and version must belong to the current owner.")

        strategy_repository = StrategyRepository(
            self.session, self.workspace_id, self.owner_user_id
        )
        strategy = strategy_repository.get_strategy(strategy_id)
        version = strategy_repository.get_strategy_version(version_id)
        if strategy is None or version is None or version.strategy_id != strategy.id:
            raise PermissionError("Run strategy version must belong to the selected strategy.")

        bot_id = fields.get("bot_id")
        if bot_id is not None:
            bot = (
                BotRepository(self.session, self.workspace_id, self.owner_user_id).get_bot(bot_id)
                if isinstance(bot_id, UUID)
                else None
            )
            if (
                bot is None
                or bot.strategy_id != strategy.id
                or bot.strategy_version_id not in (None, version.id)
            ):
                raise PermissionError("Run bot must belong to the selected strategy and version.")

    def list_bot_runs(
        self,
        *,
        strategy_id: UUID | None = None,
        status: str | None = None,
        limit: int | None = None,
    ) -> list[BotRun]:
        stmt = self._base_select()
        if strategy_id is not None:
            stmt = stmt.where(BotRun.strategy_id == strategy_id)
        if status is not None:
            stmt = stmt.where(BotRun.status == status)
        stmt = stmt.order_by(BotRun.created_at.desc())
        if limit is not None:
            stmt = stmt.limit(limit)
        return list(self.session.execute(stmt).scalars().all())

    def list_completed_bot_runs(
        self,
        *,
        strategy_id: UUID | None = None,
        limit: int | None = None,
    ) -> list[BotRun]:
        stmt = self._base_select().where(BotRun.status == "completed")
        if strategy_id is not None:
            stmt = stmt.where(BotRun.strategy_id == strategy_id)
        stmt = stmt.order_by(BotRun.finished_at.desc().nullslast(), BotRun.created_at.desc())
        if limit is not None:
            stmt = stmt.limit(limit)
        return list(self.session.execute(stmt).scalars().all())

    def list_strategy_pipeline_runs(
        self,
        *,
        strategy_id: UUID,
        pipeline_statuses: set[str],
        include_run_status: bool = False,
        newest_first: bool = True,
        limit: int | None = None,
    ) -> list[BotRun]:
        stmt = self._base_select()
        status_filters = [BotRun.pipeline_status.in_(tuple(sorted(pipeline_statuses)))]
        if include_run_status:
            status_filters.append(BotRun.status.in_(tuple(sorted(pipeline_statuses))))
        stmt = stmt.where(BotRun.strategy_id == strategy_id, or_(*status_filters))
        last_activity = func.coalesce(BotRun.finished_at, BotRun.started_at, BotRun.created_at)
        if newest_first:
            stmt = stmt.order_by(last_activity.desc(), BotRun.created_at.desc())
        else:
            stmt = stmt.order_by(last_activity.asc(), BotRun.created_at.asc())
        if limit is not None:
            stmt = stmt.limit(limit)
        return list(self.session.execute(stmt).scalars().all())

    def get_bot_run(self, run_id: UUID) -> BotRun | None:
        return self.get_by_id(run_id, active_only=False)

    def claim_next_queued_bot_run(self) -> BotRun | None:
        data_job_status = (
            select(MarketDataImportJob.status)
            .where(MarketDataImportJob.id == BotRun.data_job_id)
            .scalar_subquery()
        )
        stmt = (
            self._base_select()
            .where(BotRun.status == "queued")
            .where(
                or_(
                    BotRun.data_job_id.is_(None),
                    data_job_status == "completed",
                    data_job_status.is_(None),
                )
            )
            .order_by(BotRun.created_at.asc())
            .with_for_update(skip_locked=True, of=BotRun)
            .limit(1)
        )
        run = self.session.execute(stmt).scalar_one_or_none()
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

    def complete_bot_run(self, run: BotRun, *, status: str, error_message: str | None = None) -> BotRun | None:
        if getattr(run, "status", None) not in ("running", "queued"):
            return None
        if run.workspace_id != self.workspace_id or run.created_by != str(self.owner_user_id):
            raise PermissionError("Cannot complete another owner's run.")
        if status not in ("completed", "failed", "cancelled"):
            raise ValueError("Completion requires a terminal status.")
        statement = (
            update(BotRun)
            .where(
                BotRun.id == run.id,
                BotRun.workspace_id == self.workspace_id,
                BotRun.created_by == str(self.owner_user_id),
                BotRun.status.in_(("running", "queued")),
            )
            .values(
                status=status,
                pipeline_status=status,
                pipeline_context={
                    **dict(run.pipeline_context or {}),
                    "state": status,
                    "runId": str(run.id),
                },
                finished_at=datetime.now(timezone.utc),
                error_message=error_message,
            )
            .returning(BotRun)
            .execution_options(synchronize_session=False, populate_existing=True)
        )
        return self.session.execute(statement).scalar_one_or_none()

    def link_data_job(
        self,
        run: BotRun,
        import_job: MarketDataImportJob,
        *,
        link_status: str = "waiting",
    ) -> None:
        if (
            getattr(run, "workspace_id", None) != self.workspace_id
            or getattr(run, "created_by", None) != str(self.owner_user_id)
        ):
            raise PermissionError("Cannot link data job for run belonging to another owner.")

        stored_job = self.session.execute(
            select(MarketDataImportJob).where(MarketDataImportJob.id == import_job.id)
        ).scalar_one_or_none()
        if (
            stored_job is None
            or stored_job.exchange != run.exchange
            or stored_job.symbol != run.symbol
            or stored_job.timeframe != run.timeframe
        ):
            raise PermissionError("Data job must match the run's shared market-data selection.")

        self.update(
            run,
            data_job_id=stored_job.id,
            pipeline_context={
                **dict(run.pipeline_context or {}),
                "dataJobId": str(stored_job.id),
                "dataJobStatus": stored_job.status,
                "dataJobType": stored_job.job_type,
            },
        )

    def list_bot_run_logs(self, run_id: UUID) -> list[StrategyLog]:
        run = self.get_bot_run(run_id)
        if run is None:
            return []
        stmt = (
            select(StrategyLog)
            .where(StrategyLog.bot_run_id == run_id, StrategyLog.workspace_id == self.workspace_id)
            .order_by(StrategyLog.created_at)
        )
        return list(self.session.execute(stmt).scalars().all())

    def list_bot_run_orders(self, run_id: UUID) -> list[TradeOrder]:
        run = self.get_bot_run(run_id)
        if run is None:
            return []
        stmt = (
            select(TradeOrder)
            .options(joinedload(TradeOrder.order_intent).joinedload(OrderIntent.strategy_signal))
            .where(TradeOrder.bot_run_id == run_id, TradeOrder.workspace_id == self.workspace_id)
            .order_by(TradeOrder.created_at)
        )
        return list(self.session.execute(stmt).scalars().all())

    def list_bot_run_signals(self, run_id: UUID) -> list[StrategySignal]:
        run = self.get_bot_run(run_id)
        if run is None:
            return []
        stmt = (
            select(StrategySignal)
            .where(StrategySignal.bot_run_id == run_id, StrategySignal.workspace_id == self.workspace_id)
            .order_by(StrategySignal.created_at)
        )
        return list(self.session.execute(stmt).scalars().all())

    def get_bot_run_result(self, run_id: UUID) -> BacktestResult | None:
        run = self.get_bot_run(run_id)
        if run is None:
            return None
        stmt = select(BacktestResult).where(
            BacktestResult.bot_run_id == run_id,
            BacktestResult.workspace_id == self.workspace_id,
        )
        return self.session.execute(stmt).scalar_one_or_none()

    def list_bot_run_trades(self, run_id: UUID) -> list[TradeOrder]:
        return self.list_bot_run_orders(run_id)

    def get_backtest_positions(self, run_id: UUID) -> list[BacktestPosition]:
        run = self.get_bot_run(run_id)
        if run is None:
            return []
        stmt = select(BacktestPosition).where(
            BacktestPosition.run_id == run_id,
            BacktestPosition.workspace_id == self.workspace_id,
        )
        return list(self.session.execute(stmt).scalars().all())

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
