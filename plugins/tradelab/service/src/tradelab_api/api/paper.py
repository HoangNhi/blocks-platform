from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from tradelab_api.api.responses import error_response, success_response
from tradelab_api.core.config import get_settings
from tradelab_api.db.session import get_db_session
from tradelab_api.schemas.paper import (
    PaperEngineTickLocalRequest,
    PaperEngineTickLocalResponse,
    PaperKillSwitchStatusResponse,
    PaperSessionCancelLocalRequest,
    PaperSessionCancelLocalResponse,
    PaperSessionDetailResponse,
    PaperSessionObservabilityResponse,
    PaperSessionPreviewRequest,
    PaperSessionPreviewResponse,
    PaperSessionResumeLocalRequest,
    PaperSessionResumeLocalResponse,
    PaperSessionResumeReadinessResponse,
    PaperSessionRetryLocalRequest,
    PaperSessionRetryLocalResponse,
    PaperSessionRunLocalRequest,
    PaperSessionRunLocalResponse,
    PaperSessionSchedulerStatusResponse,
    PaperSessionStartRequest,
    PaperSessionStartResponse,
)
from tradelab_api.services.bot_repository import BotRepository
from tradelab_api.services.market_data_repository import MarketDataRepository
from tradelab_api.services.paper_session_detail import (
    PaperSessionDetailValidationError,
    build_paper_session_detail,
)
from tradelab_api.services.paper_kill_switch import build_paper_kill_switch_status
from tradelab_api.services.paper_session_observability import (
    PaperSessionObservabilityValidationError,
    build_paper_session_observability,
)
from tradelab_api.services.paper_session_preview import (
    PaperSessionPreviewValidationError,
    build_paper_session_preview,
)
from tradelab_api.services.paper_session_repository import PaperSessionRepository
from tradelab_api.services.paper_session_start import (
    PaperSessionStartValidationError,
    start_paper_session,
)
from tradelab_api.services.paper_engine_tick_local import (
    PaperEngineTickLocalRequestData,
    execute_local_paper_engine_tick,
)
from tradelab_api.services.paper_session_run_local import (
    PaperSessionRunLocalRequestData,
    execute_local_paper_session_run,
)
from tradelab_api.services.paper_session_cancel_local import (
    PaperSessionCancelLocalRequestData,
    execute_local_paper_session_cancel,
)
from tradelab_api.services.paper_session_retry_local import (
    PaperSessionRetryLocalRequestData,
    execute_local_paper_session_retry,
)
from tradelab_api.services.paper_session_resume_local import (
    PaperSessionResumeLocalRequestData,
    execute_local_paper_session_resume,
)
from tradelab_api.services.paper_session_resume_readiness import (
    PaperSessionResumeReadinessValidationError,
    build_paper_session_resume_readiness,
)
from tradelab_api.services.paper_session_scheduler_status import get_paper_scheduler_status
from tradelab_api.services.strategy_repository import StrategyRepository

router = APIRouter()


@router.get("/paper/safety/status")
def get_paper_kill_switch_status_route() -> JSONResponse:
    status = build_paper_kill_switch_status(get_settings())
    payload = PaperKillSwitchStatusResponse.model_validate(status).model_dump(mode="json", by_alias=True)
    return success_response(payload)


@router.get("/paper/scheduler/status")
def get_paper_scheduler_status_route(request: Request) -> JSONResponse:
    scheduler = getattr(request.app.state, "paper_session_scheduler", None)
    status = get_paper_scheduler_status(scheduler)
    payload = PaperSessionSchedulerStatusResponse.model_validate(status).model_dump(mode="json", by_alias=True)
    return success_response(payload)


@router.post("/paper/sessions/preview")
def preview_paper_session(
    request: PaperSessionPreviewRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    bot_repository = BotRepository(session)
    strategy_repository = StrategyRepository(session)
    market_repository = MarketDataRepository(session)
    risk_policy_override = (
        request.risk_policy_override.model_dump(mode="python", exclude_none=True)
        if request.risk_policy_override is not None
        else None
    )
    try:
        preview = build_paper_session_preview(
            bot_repository,
            strategy_repository,
            market_repository,
            bot_id=request.bot_id,
            exchange=request.exchange,
            symbol=request.symbol,
            timeframe=request.timeframe,
            start_at=request.start_at,
            end_at=request.end_at,
            risk_policy_override=risk_policy_override,
            source=request.source,
            kill_switch_status=build_paper_kill_switch_status(get_settings()),
        )
    except PaperSessionPreviewValidationError as exc:
        return error_response(exc.status_code, exc.message, {"reasonCode": exc.reason_code})

    payload = PaperSessionPreviewResponse.model_validate(preview).model_dump(mode="json", by_alias=True)
    return success_response(payload)


@router.post("/paper/sessions/start")
def start_paper_session_route(
    request: PaperSessionStartRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    bot_repository = BotRepository(session)
    strategy_repository = StrategyRepository(session)
    market_repository = MarketDataRepository(session)
    paper_repository = PaperSessionRepository(session)
    risk_policy_override = (
        request.risk_policy_override.model_dump(mode="python", exclude_none=True)
        if request.risk_policy_override is not None
        else None
    )
    try:
        result = start_paper_session(
            bot_repository,
            strategy_repository,
            market_repository,
            paper_repository,
            bot_id=request.bot_id,
            exchange=request.exchange,
            symbol=request.symbol,
            timeframe=request.timeframe,
            start_at=request.start_at,
            end_at=request.end_at,
            starting_cash=request.starting_cash,
            risk_policy_override=risk_policy_override,
            preview_fingerprint=request.preview_fingerprint,
            idempotency_key=request.idempotency_key,
            confirm_start=request.confirm_start,
            source=request.source,
            actor=request.actor,
            kill_switch_status=build_paper_kill_switch_status(get_settings()),
        )
    except PaperSessionStartValidationError as exc:
        if exc.should_commit:
            session.commit()
        return error_response(exc.status_code, exc.message, {"reasonCode": exc.reason_code, **exc.details})

    payload = PaperSessionStartResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    if result.should_commit:
        session.commit()
    return success_response(payload, status_code=result.semantic_status_code)


@router.post("/paper/sessions/engine-tick-local")
def tick_local_paper_engine_route(
    request: PaperEngineTickLocalRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    result = execute_local_paper_engine_tick(
        session,
        settings=get_settings(),
        request=PaperEngineTickLocalRequestData(
            confirm_local_paper_engine_tick=request.confirm_local_paper_engine_tick,
            max_candles_per_tick=request.max_candles_per_tick,
            worker_id=request.worker_id,
        ),
    )
    if result.should_rollback:
        session.rollback()
    if result.should_commit:
        session.commit()
    payload = PaperEngineTickLocalResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    return success_response(payload, status_code=result.semantic_status_code)

@router.post("/paper/sessions/{session_id}/run-local")
def run_local_paper_session_route(
    session_id: UUID,
    request: PaperSessionRunLocalRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    result = execute_local_paper_session_run(
        session,
        settings=get_settings(),
        session_id=session_id,
        request=PaperSessionRunLocalRequestData(
            confirm_local_paper_run=request.confirm_local_paper_run,
            max_candles_per_tick=request.max_candles_per_tick,
            worker_id=request.worker_id,
        ),
    )
    if result.should_rollback:
        session.rollback()
    if result.should_commit:
        session.commit()
    payload = PaperSessionRunLocalResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    return success_response(payload, status_code=result.semantic_status_code)


@router.post("/paper/sessions/{session_id}/cancel-local")
def cancel_local_paper_session_route(
    session_id: UUID,
    request: PaperSessionCancelLocalRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    paper_repository = PaperSessionRepository(session)
    result = execute_local_paper_session_cancel(
        paper_repository,
        settings=get_settings(),
        session_id=session_id,
        request=PaperSessionCancelLocalRequestData(
            confirm_local_paper_cancel=request.confirm_local_paper_cancel,
            reason=request.reason,
            actor=request.actor,
        ),
    )
    if result.should_commit:
        session.commit()
    payload = PaperSessionCancelLocalResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    return success_response(payload, status_code=result.semantic_status_code)


@router.post("/paper/sessions/{session_id}/resume-local")
def resume_local_paper_session_route(
    session_id: UUID,
    request: PaperSessionResumeLocalRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    paper_repository = PaperSessionRepository(session)
    result = execute_local_paper_session_resume(
        paper_repository,
        settings=get_settings(),
        session_id=session_id,
        request=PaperSessionResumeLocalRequestData(
            confirm_local_paper_resume=request.confirm_local_paper_resume,
            idempotency_key=request.idempotency_key,
            reason=request.reason,
            actor=request.actor,
        ),
        kill_switch_status=build_paper_kill_switch_status(get_settings()),
        readiness_builder=build_paper_session_resume_readiness,
    )
    if result.should_commit:
        session.commit()
    payload = PaperSessionResumeLocalResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    return success_response(payload, status_code=result.semantic_status_code)


@router.post("/paper/sessions/{session_id}/retry-local")
def retry_local_paper_session_route(
    session_id: UUID,
    request: PaperSessionRetryLocalRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    bot_repository = BotRepository(session)
    strategy_repository = StrategyRepository(session)
    market_repository = MarketDataRepository(session)
    paper_repository = PaperSessionRepository(session)
    result = execute_local_paper_session_retry(
        bot_repository,
        strategy_repository,
        market_repository,
        paper_repository,
        settings=get_settings(),
        session_id=session_id,
        request=PaperSessionRetryLocalRequestData(
            confirm_local_paper_retry=request.confirm_local_paper_retry,
            idempotency_key=request.idempotency_key,
            reason=request.reason,
            actor=request.actor,
        ),
        kill_switch_status=build_paper_kill_switch_status(get_settings()),
    )
    if result.should_commit:
        session.commit()
    payload = PaperSessionRetryLocalResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    return success_response(payload, status_code=result.semantic_status_code)


@router.get("/paper/sessions")
def list_paper_sessions_route(
    strategy_id: str | None = Query(default=None, alias="strategyId"),
    strategy_version_id: str | None = Query(default=None, alias="strategyVersionId"),
    dataset_key: str | None = Query(default=None, alias="datasetKey"),
    status: str | None = None,
    limit: int | None = None,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    paper_repository = PaperSessionRepository(session)
    try:
        result = build_paper_session_observability(
            paper_repository,
            strategy_id=strategy_id,
            strategy_version_id=strategy_version_id,
            dataset_key=dataset_key,
            status=status,
            limit=limit,
        )
    except PaperSessionObservabilityValidationError as exc:
        return error_response(exc.status_code, exc.message, {"reasonCode": exc.reason_code, **exc.details})

    payload = PaperSessionObservabilityResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    return success_response(payload)

@router.get("/paper/sessions/{session_id}/resume-readiness")
def get_paper_session_resume_readiness_route(
    session_id: UUID,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    paper_repository = PaperSessionRepository(session)
    try:
        readiness = build_paper_session_resume_readiness(paper_repository, session_id=session_id)
    except PaperSessionResumeReadinessValidationError as exc:
        return error_response(exc.status_code, exc.message, {"reasonCode": exc.reason_code})

    payload = PaperSessionResumeReadinessResponse.model_validate(readiness).model_dump(mode="json", by_alias=True)
    return success_response(payload)

@router.get("/paper/sessions/{session_id}")
def get_paper_session_detail_route(
    session_id: UUID,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    paper_repository = PaperSessionRepository(session)
    try:
        detail = build_paper_session_detail(paper_repository, session_id=session_id)
    except PaperSessionDetailValidationError as exc:
        return error_response(exc.status_code, exc.message, {"reasonCode": exc.reason_code})

    payload = PaperSessionDetailResponse.model_validate(detail).model_dump(mode="json", by_alias=True)
    return success_response(payload)
