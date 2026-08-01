from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from tradelab_api.api.responses import error_response, success_response
from tradelab_api.api.serializers import serialize_model, serialize_value
from tradelab_api.db.models import (
    BenchmarkRunCheck,
    Bot,
    BotRun,
    ManualTradeJournalEntry,
    MarketDataImportJob,
    StrategyVersion,
)
from tradelab_api.db.session import get_db_session
from tradelab_api.schemas.backtest import ExecutionJournalEntryRequest, ManualSignalPackageRequest, ResearchRobustnessGateRequest
from tradelab_api.services.benchmark_repository import BenchmarkRepository
from tradelab_api.services.benchmark_service import BenchmarkService
from tradelab_api.services.bot_repository import BotRepository
from tradelab_api.services.credential_boundary import validate_credential_boundary_metadata
from tradelab_api.services.execution_modes import (
    build_execution_mode_not_enabled_error,
    build_execution_mode_not_runnable_error,
    can_create_execution_mode,
    is_runnable_execution_mode,
    normalize_execution_mode,
    normalize_execution_status,
)
from tradelab_api.services.execution_journal import (
    ExecutionJournalBlocked,
    JournalFillInput,
    build_planned_snapshot,
    derive_comparison_summary,
    validate_manual_entry_request,
)
from tradelab_api.services.execution_journal_repository import ExecutionJournalRepository
from tradelab_api.services.job_dispatcher import JobDispatcher
from tradelab_api.services.manual_signal_package import ManualSignalPackageBlocked, build_manual_signal_package
from tradelab_api.services.market_data_preflight import build_preflight_result
from tradelab_api.services.market_data_repository import MarketDataRepository
from tradelab_api.services.research_robustness_gate import ResearchRobustnessGateBlocked, build_research_robustness_gate
from tradelab_api.services.run_analysis import build_run_analysis, build_selected_trade_execution_detail
from tradelab_api.services.run_repository import RunRepository
from tradelab_api.services.strategy_repository import StrategyRepository


router = APIRouter()

JOB_VISIBILITY_ACTIVE_STATUSES = {"queued", "running", "waiting_for_data"}
JOB_VISIBILITY_TERMINAL_STATUSES = {"completed", "failed"}
JOB_VISIBILITY_DEFAULT_LIMIT = 5
JOB_VISIBILITY_MAX_LIMIT = 20
JOB_VISIBILITY_STALE_THRESHOLD_MINUTES = 10
JOB_VISIBILITY_STALE_REASON = "active_job_exceeded_stale_threshold"


class BotCreateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    strategy_id: UUID
    strategy_version_id: UUID | None = None
    name: str
    mode: str = "backtest"
    status: str = "draft"
    exchange_connection_id: UUID | None = None
    symbol: str
    timeframe: str
    runtime_config: dict[str, object] = Field(default_factory=dict)
    risk_config: dict[str, object] = Field(default_factory=dict)
    metadata: dict[str, object] = Field(default_factory=dict)
    created_by: str | None = None


class BotBacktestRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    exchange: str = "binance"
    symbol: str
    timeframe: str
    start_at: datetime
    end_at: datetime
    initial_equity: Decimal = Decimal("1000")
    fee_bps: Decimal = Decimal("0")
    slippage_bps: Decimal = Decimal("0")
    max_order_percent: Decimal | None = None
    max_position_percent: Decimal | None = None
    min_notional: Decimal | None = None
    max_drawdown_percent: Decimal | None = None

class BenchmarkRepeatRequest(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    confirm_same_input: bool = Field(..., alias="confirm_same_input")


@router.get("/bots")
def list_bots(session: Session = Depends(get_db_session)) -> JSONResponse:
    repository = BotRepository(session)
    return success_response({"items": [serialize_model(item) for item in repository.list_bots()]})

def _execution_mode_not_enabled_response(mode: str | None) -> JSONResponse:
    normalized_mode = normalize_execution_mode(mode)
    return error_response(
        status.HTTP_400_BAD_REQUEST,
        f"Execution mode '{normalized_mode}' is not enabled yet.",
        build_execution_mode_not_enabled_error(normalized_mode),
    )

def _execution_mode_not_runnable_response(mode: str | None) -> JSONResponse:
    normalized_mode = normalize_execution_mode(mode)
    return error_response(
        status.HTTP_400_BAD_REQUEST,
        f"Execution mode '{normalized_mode}' is not runnable yet.",
        build_execution_mode_not_runnable_error(normalized_mode),
    )


@router.post("/bots")
def create_bot(request: BotCreateRequest, session: Session = Depends(get_db_session)) -> JSONResponse:
    mode = normalize_execution_mode(request.mode)
    bot_status = normalize_execution_status(request.status)
    if not can_create_execution_mode(mode, bot_status):
        return _execution_mode_not_enabled_response(mode)
    credential_boundary_error = validate_credential_boundary_metadata(request.metadata)
    if credential_boundary_error is not None:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            credential_boundary_error.message,
            credential_boundary_error.data,
        )
    repository = BotRepository(session)
    bot = repository.create_bot(
        strategy_id=request.strategy_id,
        strategy_version_id=request.strategy_version_id,
        name=request.name,
        mode=mode,
        status=bot_status,
        exchange_connection_id=request.exchange_connection_id,
        symbol=request.symbol,
        timeframe=request.timeframe,
        runtime_config=request.runtime_config,
        risk_config=request.risk_config,
        metadata_=request.metadata,
        created_by=request.created_by,
    )
    session.commit()
    return success_response(serialize_model(bot), status_code=201)


@router.post("/bots/{bot_id}/backtests/preflight")
def preflight_bot_backtest(
    bot_id: UUID,
    request: BotBacktestRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    bot_repository = BotRepository(session)
    bot = bot_repository.get_bot(bot_id)
    if bot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bot not found.")
    if not is_runnable_execution_mode(bot.mode):
        return _execution_mode_not_runnable_response(bot.mode)
    strategy_version = _resolve_strategy_version(session, bot)
    if strategy_version is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bot has no strategy version.")

    market_repository = MarketDataRepository(session)
    preflight = build_preflight_result(
        market_repository,
        exchange=request.exchange,
        symbol=request.symbol,
        timeframe=request.timeframe,
        requested_start_at=request.start_at,
        requested_end_at=request.end_at,
    )
    return success_response(_serialize_preflight(preflight))


@router.post("/bots/{bot_id}/backtests")
def start_bot_backtest(
    bot_id: UUID,
    request: BotBacktestRequest,
    http_request: Request,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    bot_repository = BotRepository(session)
    market_repository = MarketDataRepository(session)
    run_repository = RunRepository(session)
    bot = bot_repository.get_bot(bot_id)
    if bot is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bot not found.")
    if not is_runnable_execution_mode(bot.mode):
        return _execution_mode_not_runnable_response(bot.mode)

    strategy_version = _resolve_strategy_version(session, bot)
    if strategy_version is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Bot has no strategy version.")

    preflight = build_preflight_result(
        market_repository,
        exchange=request.exchange,
        symbol=request.symbol,
        timeframe=request.timeframe,
        requested_start_at=request.start_at,
        requested_end_at=request.end_at,
    )

    if preflight.outcome == "blocked":
        return error_response(
            status.HTTP_409_CONFLICT,
            preflight.reasons[0] if preflight.reasons else "Dataset preflight blocked the backtest.",
            {
                "reasonCode": preflight.provenance_reason_code or "dataset_preflight_blocked",
                "preflight": _serialize_preflight(preflight),
            },
        )

    bot_run = run_repository.create_bot_run(
        bot_id=bot.id,
        strategy_id=bot.strategy_id,
        strategy_version_id=strategy_version.id,
        run_type="backtest",
        status="queued",
        exchange=request.exchange,
        symbol=request.symbol,
        timeframe=request.timeframe,
        start_at=request.start_at,
        end_at=request.end_at,
        started_at=None,
        finished_at=None,
        runtime_config={
            **dict(bot.runtime_config or {}),
            "exchange": request.exchange,
            "symbol": request.symbol,
            "timeframe": request.timeframe,
            "startAt": request.start_at.isoformat(),
            "endAt": request.end_at.isoformat(),
            "initialEquity": float(request.initial_equity),
            "feeBps": float(request.fee_bps),
            "slippageBps": float(request.slippage_bps),
        },
        risk_config={
            **dict(bot.risk_config or {}),
            "maxOrderPercent": float(request.max_order_percent) if request.max_order_percent is not None else None,
            "maxPositionPercent": float(request.max_position_percent) if request.max_position_percent is not None else None,
            "minNotional": float(request.min_notional) if request.min_notional is not None else None,
            "maxDrawdownPercent": float(request.max_drawdown_percent) if request.max_drawdown_percent is not None else None,
        },
        source_snapshot={
            "sourceCode": strategy_version.source_code,
            "sourceHash": strategy_version.source_hash,
            "strategyVersionId": str(strategy_version.id),
            "capturedAt": datetime.now(timezone.utc).isoformat(),
        },
        dataset_context={
            "datasetKey": preflight.dataset_key,
            "exchange": request.exchange,
            "symbol": request.symbol,
            "timeframe": request.timeframe,
            "requestedStartAt": request.start_at.isoformat(),
            "requestedEndAt": request.end_at.isoformat(),
            "coverage": _serialize_preflight_coverage(preflight),
            "sourceSummary": [
                {"source": item.source, "rowCount": item.row_count}
                for item in preflight.source_summary
            ],
        },
        pipeline_context={
            "preflight": _serialize_preflight(preflight),
            "state": "queued",
            "runId": None,
        },
        pipeline_status="queued",
        data_job_id=None,
        error_message=None,
        created_by="trade-lab",
    )

    import_job = None
    if preflight.outcome != "ready":
        import_job = _create_or_join_import_job(
            market_repository,
            run_repository,
            bot_run,
            preflight,
            created_by="trade-lab",
        )
        bot_run.data_job_id = import_job.id
        bot_run.pipeline_status = "waiting_for_data"
        market_repository.create_job_run_link(
            import_job_id=import_job.id,
            bot_run_id=bot_run.id,
            link_status="waiting",
            metadata={"source": "run-backtest"},
            created_by="trade-lab",
        )
    elif preflight.active_job_id is not None:
        existing_job = market_repository.get_import_job(UUID(preflight.active_job_id))
        if existing_job is not None:
            import_job = existing_job
            run_repository.link_data_job(bot_run, existing_job)
            bot_run.pipeline_status = "waiting_for_data"
            market_repository.create_job_run_link(
                import_job_id=existing_job.id,
                bot_run_id=bot_run.id,
                link_status="waiting",
                metadata={"source": "run-backtest", "joined": True},
                created_by="trade-lab",
            )

    session.commit()

    payload = _serialize_pipeline(
        bot_run=bot_run,
        preflight=preflight,
        import_job=import_job,
        run_repository=run_repository,
        market_repository=market_repository,
    )
    return success_response(payload, status_code=201)


@router.get("/bot-runs")
def list_bot_runs(
    strategy_id: UUID | None = None,
    status: str | None = None,
    limit: int | None = None,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    repository = RunRepository(session)
    return success_response(
        {"items": [serialize_model(item) for item in repository.list_bot_runs(strategy_id=strategy_id, status=status, limit=limit)]}
    )


@router.get("/bot-runs/{run_id}")
def get_bot_run(run_id: UUID, session: Session = Depends(get_db_session)) -> JSONResponse:
    repository = RunRepository(session)
    run = repository.get_bot_run(run_id)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bot run not found.")
    payload = serialize_model(run)
    payload["result"] = _serialize_result(repository.get_bot_run_result(run_id))
    payload["snapshot"] = _serialize_snapshot(run)
    payload["pipeline"] = _serialize_pipeline_from_run(repository, run)
    return success_response(payload)


@router.get("/bot-runs/{run_id}/analysis")
def get_bot_run_analysis(run_id: UUID, session: Session = Depends(get_db_session)) -> JSONResponse:
    repository = RunRepository(session)
    inputs = repository.get_bot_run_analysis_inputs(run_id)
    run = inputs["run"]
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bot run not found.")
    analysis = build_run_analysis(
        run=run,
        result=inputs["result"],
        orders=inputs["orders"],
        signals=inputs["signals"],
        logs=inputs["logs"],
        positions=inputs.get("positions", []),
    )
    return success_response(analysis.model_dump(mode="json"))


@router.post("/bot-runs/{run_id}/manual-signal-package")
def create_manual_signal_package(
    run_id: UUID,
    request: ManualSignalPackageRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    if not request.confirm_manual_signal_only:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "Manual signal package requires manual-only confirmation.",
            {"reasonCode": "manual_signal_confirmation_required"},
        )

    repository = RunRepository(session)
    inputs = repository.get_bot_run_analysis_inputs(run_id)
    run = inputs["run"]
    if run is None:
        return error_response(
            status.HTTP_404_NOT_FOUND,
            "Bot run not found.",
            {"reasonCode": "manual_signal_run_not_found"},
        )

    analysis = build_run_analysis(
        run=run,
        result=inputs["result"],
        orders=inputs["orders"],
        signals=inputs["signals"],
        logs=inputs["logs"],
    )
    strategy_name = getattr(getattr(run, "strategy", None), "name", "Unknown strategy") or "Unknown strategy"
    try:
        package = build_manual_signal_package(
            run=run,
            result=inputs["result"],
            analysis=analysis,
            strategy_name=strategy_name,
        )
    except ManualSignalPackageBlocked as exc:
        return error_response(status.HTTP_400_BAD_REQUEST, str(exc), {"reasonCode": exc.reason_code})
    return success_response(package)


@router.post("/bot-runs/{run_id}/robustness-gate")
def create_research_robustness_gate(
    run_id: UUID,
    request: ResearchRobustnessGateRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    if not request.confirm_research_only:
        return error_response(
            status.HTTP_400_BAD_REQUEST,
            "Research robustness gate requires research-only confirmation.",
            {"reasonCode": "research_robustness_confirmation_required"},
        )

    repository = RunRepository(session)
    inputs = repository.get_bot_run_analysis_inputs(run_id)
    run = inputs["run"]
    if run is None:
        return error_response(
            status.HTTP_404_NOT_FOUND,
            "Bot run not found.",
            {"reasonCode": "research_robustness_run_not_found"},
        )

    analysis = build_run_analysis(
        run=run,
        result=inputs["result"],
        orders=inputs["orders"],
        signals=inputs["signals"],
        logs=inputs["logs"],
    )
    strategy_name = getattr(getattr(run, "strategy", None), "name", "Unknown strategy") or "Unknown strategy"
    try:
        gate = build_research_robustness_gate(
            run=run,
            result=inputs["result"],
            analysis=analysis,
            strategy_name=strategy_name,
        )
    except ResearchRobustnessGateBlocked as exc:
        return error_response(status.HTTP_400_BAD_REQUEST, str(exc), {"reasonCode": exc.reason_code})
    return success_response(gate)

@router.get("/bot-runs/{run_id}/execution-journal")
def list_execution_journal_entries(run_id: UUID, session: Session = Depends(get_db_session)) -> JSONResponse:
    run_repository = RunRepository(session)
    run = run_repository.get_bot_run(run_id)
    if run is None:
        return error_response(
            status.HTTP_404_NOT_FOUND,
            "Bot run not found.",
            {"reasonCode": "execution_journal_source_run_not_found"},
        )
    repository = ExecutionJournalRepository(session)
    return success_response(
        {"items": [_serialize_execution_journal_entry(entry) for entry in repository.list_entries_for_run(run_id)]}
    )

@router.post("/bot-runs/{run_id}/execution-journal")
def create_execution_journal_entry(
    run_id: UUID,
    request: ExecutionJournalEntryRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    run_repository = RunRepository(session)
    run = run_repository.get_bot_run(run_id)
    if run is None:
        return error_response(
            status.HTTP_404_NOT_FOUND,
            "Bot run not found.",
            {"reasonCode": "execution_journal_source_run_not_found"},
        )
    try:
        validate_manual_entry_request(run, confirm_manual_entry_only=request.confirm_manual_entry_only)
        planned_snapshot = build_planned_snapshot(run, planned_snapshot=request.planned_snapshot)
        comparison_summary = derive_comparison_summary(
            side=request.side,
            planned_snapshot=planned_snapshot,
            fills=_journal_fill_inputs(request),
            discipline_status=request.discipline_status,
        )
    except ExecutionJournalBlocked as exc:
        return error_response(status.HTTP_400_BAD_REQUEST, str(exc), {"reasonCode": exc.reason_code})

    repository = ExecutionJournalRepository(session)
    entry = repository.create_entry(
        source_run_id=run.id,
        strategy_id=getattr(run, "strategy_id", None),
        strategy_version_id=getattr(run, "strategy_version_id", None),
        symbol=run.symbol,
        timeframe=run.timeframe,
        side=request.side,
        planned_snapshot=planned_snapshot,
        comparison_summary=comparison_summary,
        outcome_status=str(comparison_summary["outcomeStatus"]),
        discipline_status=request.discipline_status,
        safety_status="manual_execution_journal_only",
        notes=request.notes,
        fills=_journal_fill_rows(request),
        created_by="trade-lab",
    )
    session.commit()
    return success_response(_serialize_execution_journal_entry(entry))

@router.get("/execution-journal/{entry_id}")
def get_execution_journal_entry(entry_id: UUID, session: Session = Depends(get_db_session)) -> JSONResponse:
    repository = ExecutionJournalRepository(session)
    entry = repository.get_entry(entry_id)
    if entry is None:
        return error_response(
            status.HTTP_404_NOT_FOUND,
            "Execution journal entry not found.",
            {"reasonCode": "execution_journal_entry_not_found"},
        )
    return success_response(_serialize_execution_journal_entry(entry))

@router.patch("/execution-journal/{entry_id}")
def update_execution_journal_entry(
    entry_id: UUID,
    request: ExecutionJournalEntryRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    repository = ExecutionJournalRepository(session)
    entry = repository.get_entry(entry_id)
    if entry is None:
        return error_response(
            status.HTTP_404_NOT_FOUND,
            "Execution journal entry not found.",
            {"reasonCode": "execution_journal_entry_not_found"},
        )
    run_repository = RunRepository(session)
    run = run_repository.get_bot_run(entry.source_run_id)
    if run is None:
        return error_response(
            status.HTTP_404_NOT_FOUND,
            "Bot run not found.",
            {"reasonCode": "execution_journal_source_run_not_found"},
        )
    try:
        validate_manual_entry_request(run, confirm_manual_entry_only=request.confirm_manual_entry_only)
        planned_snapshot = build_planned_snapshot(run, planned_snapshot=request.planned_snapshot)
        comparison_summary = derive_comparison_summary(
            side=request.side,
            planned_snapshot=planned_snapshot,
            fills=_journal_fill_inputs(request),
            discipline_status=request.discipline_status,
        )
    except ExecutionJournalBlocked as exc:
        return error_response(status.HTTP_400_BAD_REQUEST, str(exc), {"reasonCode": exc.reason_code})
    updated = repository.replace_entry(
        entry,
        side=request.side,
        planned_snapshot=planned_snapshot,
        comparison_summary=comparison_summary,
        outcome_status=str(comparison_summary["outcomeStatus"]),
        discipline_status=request.discipline_status,
        safety_status="manual_execution_journal_only",
        notes=request.notes,
        fills=_journal_fill_rows(request),
        updated_by="trade-lab",
    )
    session.commit()
    return success_response(_serialize_execution_journal_entry(updated))

@router.delete("/execution-journal/{entry_id}")
def delete_execution_journal_entry(entry_id: UUID, session: Session = Depends(get_db_session)) -> JSONResponse:
    repository = ExecutionJournalRepository(session)
    entry = repository.get_entry(entry_id)
    if entry is None:
        return error_response(
            status.HTTP_404_NOT_FOUND,
            "Execution journal entry not found.",
            {"reasonCode": "execution_journal_entry_not_found"},
        )
    repository.soft_delete_entry(entry, updated_by="trade-lab")
    session.commit()
    return success_response({"entryId": str(entry_id), "deleted": True, "safetyStatus": "manual_execution_journal_only"})

def _journal_fill_inputs(request: ExecutionJournalEntryRequest) -> list[JournalFillInput]:
    return [
        JournalFillInput(
            fill_role=fill.fill_role,
            side=fill.side,
            price=fill.price,
            quantity=fill.quantity,
            fee=fill.fee,
        )
        for fill in request.fills
    ]

def _journal_fill_rows(request: ExecutionJournalEntryRequest) -> list[dict[str, object]]:
    return [
        {
            "fill_role": fill.fill_role,
            "side": fill.side,
            "fill_time": fill.fill_time,
            "price": fill.price,
            "quantity": fill.quantity,
            "fee": fill.fee,
            "fee_asset": fill.fee_asset,
            "notes": fill.notes,
        }
        for fill in request.fills
    ]

def _serialize_execution_journal_entry(entry: ManualTradeJournalEntry) -> dict[str, object]:
    fills = sorted(entry.fills, key=lambda item: (item.fill_time is None, item.fill_time or item.created_at))
    return {
        "entryId": str(entry.id),
        "sourceRunId": str(entry.source_run_id),
        "strategyId": str(entry.strategy_id) if entry.strategy_id else None,
        "strategyVersionId": str(entry.strategy_version_id) if entry.strategy_version_id else None,
        "symbol": entry.symbol,
        "timeframe": entry.timeframe,
        "side": entry.side,
        "plannedSnapshot": entry.planned_snapshot,
        "comparisonSummary": entry.comparison_summary,
        "outcomeStatus": entry.outcome_status,
        "disciplineStatus": entry.discipline_status,
        "safetyStatus": entry.safety_status,
        "liveReadinessStatus": entry.comparison_summary.get("liveReadinessStatus", "not_live_ready"),
        "notes": entry.notes,
        "fills": [
            {
                "fillId": str(fill.id),
                "fillRole": fill.fill_role,
                "side": fill.side,
                "fillTime": fill.fill_time.isoformat() if fill.fill_time else None,
                "price": float(fill.price),
                "quantity": float(fill.quantity),
                "fee": float(fill.fee) if fill.fee is not None else None,
                "feeAsset": fill.fee_asset,
                "notes": fill.notes,
                "createdAt": fill.created_at.isoformat() if fill.created_at else None,
                "updatedAt": fill.updated_at.isoformat() if fill.updated_at else None,
            }
            for fill in fills
            if fill.is_active and not fill.is_deleted
        ],
        "createdAt": entry.created_at.isoformat() if entry.created_at else None,
        "updatedAt": entry.updated_at.isoformat() if entry.updated_at else None,
    }

@router.post("/bot-runs/{run_id}/benchmark-repeat")
def start_benchmark_repeat(
    run_id: UUID,
    request: BenchmarkRepeatRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    if not request.confirm_same_input:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Benchmark repeat requires same-input confirmation.",
        )
    run_repository = RunRepository(session)
    benchmark_repository = BenchmarkRepository(session)
    service = BenchmarkService(run_repository=run_repository, benchmark_repository=benchmark_repository)
    try:
        check = service.start_repeat_benchmark(run_id, created_by="trade-lab")
    except ValueError as exc:
        message = str(exc)
        if "not found" in message.lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bot run not found.") from exc
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message) from exc
    session.commit()
    return success_response(_serialize_benchmark_check(check), status_code=201)

@router.get("/bot-runs/{run_id}/benchmark-checks")
def list_benchmark_checks(run_id: UUID, session: Session = Depends(get_db_session)) -> JSONResponse:
    repository = BenchmarkRepository(session)
    latest = repository.get_latest_for_run(run_id)
    return success_response({"latest": _serialize_benchmark_check(latest) if latest is not None else None})

@router.get("/bot-runs/{run_id}/pipeline")
def get_bot_run_pipeline(run_id: UUID, session: Session = Depends(get_db_session)) -> JSONResponse:
    run_repository = RunRepository(session)
    market_repository = MarketDataRepository(session)
    run = run_repository.get_bot_run(run_id)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bot run not found.")
    return success_response(_serialize_pipeline_from_run(run_repository, run, market_repository=market_repository))


@router.get("/strategies/{strategy_id}/job-visibility")
def get_strategy_job_visibility(
    strategy_id: UUID,
    limit: int = JOB_VISIBILITY_DEFAULT_LIMIT,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    strategy_repository = StrategyRepository(session)
    if strategy_repository.get_strategy(strategy_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy not found.")

    normalized_limit = max(1, min(limit, JOB_VISIBILITY_MAX_LIMIT))
    run_repository = RunRepository(session)
    market_repository = MarketDataRepository(session)
    active_runs = run_repository.list_strategy_pipeline_runs(
        strategy_id=strategy_id,
        pipeline_statuses=JOB_VISIBILITY_ACTIVE_STATUSES,
        include_run_status=True,
        newest_first=False,
    )
    recent_runs = run_repository.list_strategy_pipeline_runs(
        strategy_id=strategy_id,
        pipeline_statuses=JOB_VISIBILITY_TERMINAL_STATUSES,
        include_run_status=True,
        newest_first=True,
        limit=normalized_limit,
    )
    now = datetime.now(timezone.utc)
    return success_response(
        {
            "strategy_id": str(strategy_id),
            "active": [
                _serialize_job_visibility_item(
                    run_repository,
                    market_repository,
                    run,
                    now=now,
                    active=True,
                )
                for run in active_runs
            ],
            "recent": [
                _serialize_job_visibility_item(
                    run_repository,
                    market_repository,
                    run,
                    now=now,
                    active=False,
                )
                for run in recent_runs
            ],
            "stale_threshold_minutes": JOB_VISIBILITY_STALE_THRESHOLD_MINUTES,
        }
    )

@router.get("/bot-runs/{run_id}/chart")
def get_bot_run_chart(
    run_id: UUID,
    selected_trade_id: UUID | None = None,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    run_repository = RunRepository(session)
    market_repository = MarketDataRepository(session)
    run = run_repository.get_bot_run(run_id)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bot run not found.")
    candles = market_repository.list_market_candles(
        exchange=run.exchange,
        symbol=run.symbol,
        timeframe=run.timeframe,
        start_at=run.start_at,
        end_at=run.end_at,
    )
    orders = run_repository.list_bot_run_orders(run_id)
    signals = run_repository.list_bot_run_signals(run_id)
    result = run_repository.get_bot_run_result(run_id)
    markers = [_serialize_marker(order, signals) for order in orders if order.status == "filled"]
    selected_trade = _serialize_selected_trade(selected_trade_id, markers, orders, signals, run_repository.list_bot_run_logs(run_id))
    payload = {
        "candles": [serialize_model(item) for item in candles],
        "markers": markers,
        "equity_curve": serialize_value(getattr(result, "equity_curve", [])) if result is not None else [],
        "selected_trade": selected_trade,
    }
    return success_response(payload)


@router.get("/bot-runs/{run_id}/trades/{trade_id}")
def get_bot_run_trade_detail(
    run_id: UUID,
    trade_id: UUID,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    repository = RunRepository(session)
    inputs = repository.get_bot_run_analysis_inputs(run_id)
    run = inputs["run"]
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bot run not found.")
    detail = build_selected_trade_execution_detail(
        run=run,
        trade_id=trade_id,
        orders=inputs["orders"],
        signals=inputs["signals"],
        logs=inputs["logs"],
    )
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trade not found.")
    return success_response(detail.model_dump(mode="json"))


@router.get("/bot-runs/{run_id}/logs")
def list_bot_run_logs(run_id: UUID, session: Session = Depends(get_db_session)) -> JSONResponse:
    repository = RunRepository(session)
    return success_response({"items": [serialize_model(item) for item in repository.list_bot_run_logs(run_id)]})


@router.get("/bot-runs/{run_id}/orders")
def list_bot_run_orders(run_id: UUID, session: Session = Depends(get_db_session)) -> JSONResponse:
    repository = RunRepository(session)
    return success_response({"items": [serialize_model(item) for item in repository.list_bot_run_orders(run_id)]})


@router.get("/bot-runs/{run_id}/result")
def get_bot_run_result(run_id: UUID, session: Session = Depends(get_db_session)) -> JSONResponse:
    repository = RunRepository(session)
    result = repository.get_bot_run_result(run_id)
    if result is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Backtest result not found.")
    return success_response(_serialize_result(result))
def _resolve_strategy_version(session: Session, bot: Bot) -> StrategyVersion | None:
    if bot.strategy_version_id is not None:
        version = session.get(StrategyVersion, bot.strategy_version_id)
        if version is not None:
            return version
    strategy_repository = StrategyRepository(session)
    strategy = strategy_repository.get_strategy(bot.strategy_id)
    if strategy is None or strategy.current_version_id is None:
        return None
    return session.get(StrategyVersion, strategy.current_version_id)


def _create_or_join_import_job(
    market_repository: MarketDataRepository,
    run_repository: RunRepository,
    bot_run: BotRun,
    preflight,
    *,
    created_by: str | None = None,
) -> MarketDataImportJob:
    active_job = None
    if preflight.active_job_id is not None:
        active_job = market_repository.get_import_job(UUID(preflight.active_job_id))
    if active_job is not None:
        if market_repository.list_job_run_links(import_job_id=active_job.id, bot_run_id=bot_run.id):
            return active_job
        return active_job

    missing_ranges = [
        {"startAt": segment.start_at.isoformat(), "endAt": segment.end_at.isoformat(), "kind": segment.kind}
        for segment in preflight.missing_segments
    ]
    job = market_repository.create_import_job(
        coverage_id=preflight.coverage.metadata.get("coverageId") if preflight.coverage else None,
        dataset_key=preflight.dataset_key,
        job_type=preflight.action or "fill",
        exchange=preflight.exchange,
        symbol=preflight.symbol,
        timeframe=preflight.timeframe,
        requested_start_at=preflight.requested_start_at,
        requested_end_at=preflight.requested_end_at,
        applied_start_at=preflight.repair_start_at or preflight.requested_start_at,
        applied_end_at=preflight.repair_end_at or preflight.requested_end_at,
        start_at=preflight.requested_start_at,
        end_at=preflight.requested_end_at,
        status="queued",
        rows_imported=0,
        error_message=None,
        metadata_={
            "missingRanges": missing_ranges,
            "preflight": _serialize_preflight(preflight),
            "botRunId": str(bot_run.id),
        },
        created_by=created_by,
    )
    run_repository.link_data_job(bot_run, job)
    return job


def _serialize_pipeline(
    *,
    bot_run: BotRun,
    preflight,
    import_job: MarketDataImportJob | None,
    run_repository: RunRepository,
    market_repository: MarketDataRepository,
) -> dict[str, object]:
    return {
        "run": serialize_model(bot_run),
        "preflight": _serialize_preflight(preflight),
        "data_job": serialize_model(import_job) if import_job is not None else None,
        "backtest_job": _serialize_run_pipeline_job(bot_run, run_repository, market_repository),
        "status": bot_run.pipeline_status,
        "message": _pipeline_message(bot_run, preflight, import_job),
    }


def _serialize_pipeline_from_run(
    run_repository: RunRepository,
    run: BotRun,
    market_repository: MarketDataRepository | None = None,
) -> dict[str, object]:
    import_job = market_repository.get_import_job(run.data_job_id) if market_repository and run.data_job_id else None
    preflight = run.pipeline_context.get("preflight") if isinstance(run.pipeline_context, dict) else None
    return {
        "run": serialize_model(run),
        "preflight": preflight,
        "data_job": serialize_model(import_job) if import_job is not None else None,
        "backtest_job": _serialize_run_pipeline_job(run, run_repository, market_repository),
        "status": run.pipeline_status,
        "message": run.error_message,
    }


def _serialize_run_pipeline_job(
    run: BotRun,
    run_repository: RunRepository,
    market_repository: MarketDataRepository | None,
) -> dict[str, object] | None:
    if run.data_job_id is None:
        return {
            "id": str(run.id),
            "status": run.status,
            "startedAt": run.started_at.isoformat() if run.started_at else None,
            "finishedAt": run.finished_at.isoformat() if run.finished_at else None,
            "errorMessage": run.error_message,
        }
    job = market_repository.get_import_job(run.data_job_id) if market_repository else None
    if job is None:
        return None
    return {
        "id": str(run.id),
        "status": run.status,
        "startedAt": run.started_at.isoformat() if run.started_at else None,
        "finishedAt": run.finished_at.isoformat() if run.finished_at else None,
        "errorMessage": run.error_message,
        "dataJob": serialize_model(job),
    }


def _serialize_job_visibility_item(
    run_repository: RunRepository,
    market_repository: MarketDataRepository,
    run: BotRun,
    *,
    now: datetime,
    active: bool,
) -> dict[str, object]:
    import_job = market_repository.get_import_job(run.data_job_id) if run.data_job_id else None
    payload = _serialize_pipeline_from_run(run_repository, run, market_repository=market_repository)
    last_activity_at = _resolve_job_visibility_last_activity(run, import_job, active=active)
    is_stale = (
        active
        and last_activity_at is not None
        and now - last_activity_at > timedelta(minutes=JOB_VISIBILITY_STALE_THRESHOLD_MINUTES)
    )
    payload["is_stale"] = is_stale
    payload["stale_reason"] = JOB_VISIBILITY_STALE_REASON if is_stale else None
    payload["last_activity_at"] = last_activity_at.isoformat() if last_activity_at is not None else None
    return payload


def _resolve_job_visibility_last_activity(
    run: BotRun,
    import_job: MarketDataImportJob | None,
    *,
    active: bool,
) -> datetime | None:
    if active and import_job is not None:
        return (
            import_job.started_at
            or import_job.claimed_at
            or import_job.created_at
            or run.started_at
            or run.created_at
        )
    if active:
        return run.started_at or run.created_at
    if import_job is not None:
        return (
            run.finished_at
            or import_job.finished_at
            or run.started_at
            or import_job.started_at
            or run.created_at
        )
    return run.finished_at or run.started_at or run.created_at


def _serialize_snapshot(run: BotRun) -> dict[str, object]:
    return {
        "source_snapshot": serialize_value(run.source_snapshot),
        "dataset_context": serialize_value(run.dataset_context),
        "pipeline_context": serialize_value(run.pipeline_context),
    }


def _serialize_preflight(preflight) -> dict[str, object]:
    if preflight is None:
        return {}
    return {
        "dataset_key": preflight.dataset_key,
        "exchange": preflight.exchange,
        "symbol": preflight.symbol,
        "timeframe": preflight.timeframe,
        "requested_start_at": preflight.requested_start_at.isoformat(),
        "requested_end_at": preflight.requested_end_at.isoformat(),
        "outcome": preflight.outcome,
        "action": preflight.action,
        "reasons": preflight.reasons,
        "coverage": _serialize_preflight_coverage(preflight),
        "missing_segments": [
            {"start_at": segment.start_at.isoformat(), "end_at": segment.end_at.isoformat(), "kind": segment.kind}
            for segment in preflight.missing_segments
        ],
        "repair_start_at": preflight.repair_start_at.isoformat() if preflight.repair_start_at else None,
        "repair_end_at": preflight.repair_end_at.isoformat() if preflight.repair_end_at else None,
        "active_job_id": preflight.active_job_id,
        "active_job_type": preflight.active_job_type,
        "source_blocked": preflight.source_blocked,
        "source_summary": [
            {"source": item.source, "row_count": item.row_count}
            for item in preflight.source_summary
        ],
        "provenance_blocked": preflight.provenance_blocked,
        "provenance_reason_code": preflight.provenance_reason_code,
    }


def _serialize_preflight_coverage(preflight) -> dict[str, object] | None:
    if preflight.coverage is None:
        return None
    return {
        "dataset_key": preflight.coverage.dataset_key,
        "exchange": preflight.coverage.exchange,
        "symbol": preflight.coverage.symbol,
        "timeframe": preflight.coverage.timeframe,
        "health_status": preflight.coverage.health_status,
        "earliest_open_time": preflight.coverage.earliest_open_time.isoformat() if preflight.coverage.earliest_open_time else None,
        "latest_open_time": preflight.coverage.latest_open_time.isoformat() if preflight.coverage.latest_open_time else None,
        "covered_start_at": preflight.coverage.covered_start_at.isoformat() if preflight.coverage.covered_start_at else None,
        "covered_end_at": preflight.coverage.covered_end_at.isoformat() if preflight.coverage.covered_end_at else None,
        "segment_count": preflight.coverage.segment_count,
        "gap_count": preflight.coverage.gap_count,
        "segments": [
            {
                "start_at": segment.start_at.isoformat(),
                "end_at": segment.end_at.isoformat(),
                "row_count": segment.row_count,
            }
            for segment in preflight.coverage.segments
        ],
        "metadata": serialize_value(preflight.coverage.metadata),
    }


def _pipeline_message(bot_run: BotRun, preflight, import_job: MarketDataImportJob | None) -> str | None:
    if bot_run.status == "failed":
        return bot_run.error_message
    if preflight.outcome == "ready":
        return "Backtest queued."
    if import_job is not None:
        return f"{preflight.action or 'fill'} job queued."
    return "Pipeline queued."


def _serialize_result(result: object | None) -> dict[str, object] | None:
    if result is None:
        return None
    payload = serialize_model(result)
    payload["metrics"] = serialize_value(getattr(result, "metrics"))
    payload["equity_curve"] = serialize_value(getattr(result, "equity_curve"))
    return payload


def _serialize_benchmark_check(check: BenchmarkRunCheck) -> dict[str, object]:
    return {
        "id": str(check.id),
        "baseline_run_id": str(check.baseline_run_id),
        "repeat_run_id": str(check.repeat_run_id) if check.repeat_run_id else None,
        "strategy_id": str(check.strategy_id),
        "strategy_version_id": str(check.strategy_version_id),
        "dataset_key": check.dataset_key,
        "input_fingerprint": check.input_fingerprint,
        "repeat_input_fingerprint": check.repeat_input_fingerprint,
        "input_match": check.input_match,
        "result_fingerprint": check.result_fingerprint,
        "repeat_result_fingerprint": check.repeat_result_fingerprint,
        "result_match": check.result_match,
        "tolerance_policy": serialize_value(check.tolerance_policy),
        "metric_diffs": serialize_value(check.metric_diffs),
        "status": check.status,
        "error_message": check.error_message,
        "created_at": check.created_at.isoformat() if check.created_at else None,
        "updated_at": check.updated_at.isoformat() if check.updated_at else None,
    }

def _serialize_marker(order, signals) -> dict[str, object]:
    related_signal = next((signal for signal in signals if signal.id == order.order_intent.strategy_signal_id), None) if getattr(order, "order_intent", None) is not None else None
    return {
        "id": str(order.id),
        "timestamp": order.fill_time.isoformat() if order.fill_time else order.created_at.isoformat(),
        "kind": "buy" if order.side == "buy" else "sell",
        "side": order.side,
        "price": float(order.fill_price) if order.fill_price is not None else None,
        "quantity": float(order.fill_qty) if order.fill_qty is not None else None,
        "trade_order_id": str(order.id),
        "strategy_signal_id": str(order.order_intent.strategy_signal_id) if getattr(order, "order_intent", None) is not None and order.order_intent.strategy_signal_id is not None else None,
        "message": order.reason,
        "payload": serialize_value(order.payload),
        "signal": serialize_model(related_signal) if related_signal is not None else None,
    }


def _serialize_selected_trade(selected_trade_id, markers, orders, signals, logs):
    selected_marker = None
    if selected_trade_id is not None:
        selected_marker = next((marker for marker in markers if marker["trade_order_id"] == str(selected_trade_id)), None)
    if selected_marker is None and markers:
        selected_marker = markers[0]
    if selected_marker is None:
        return None
    order = next((item for item in orders if str(item.id) == selected_marker["trade_order_id"]), None)
    signal = None
    if order is not None and getattr(order, "order_intent", None) is not None and order.order_intent.strategy_signal_id is not None:
        signal = next((item for item in signals if str(item.id) == str(order.order_intent.strategy_signal_id)), None)
    related_logs = [
        serialize_model(log)
        for log in logs
        if order is None or log.created_at >= (order.fill_time or order.created_at)
    ]
    return {
        "marker": selected_marker,
        "order": serialize_model(order) if order is not None else None,
        "signal": serialize_model(signal) if signal is not None else None,
        "logs": related_logs,
    }


def _get_dispatcher(request: Request) -> JobDispatcher | None:
    dispatcher = getattr(request.app.state, "job_dispatcher", None)
    return dispatcher if isinstance(dispatcher, JobDispatcher) else None
