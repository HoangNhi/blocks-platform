from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from tradelab_api.api.responses import error_response, success_response
from tradelab_api.api.serializers import serialize_model, serialize_value
from tradelab_api.core.config import get_settings
from tradelab_api.db.session import get_db_session
from tradelab_api.schemas.market_data import (
    DatasetFillCancelRequest,
    DatasetFillCancelResponse,
    DatasetFillEnqueueLocalRequest,
    DatasetFillEnqueueLocalResponse,
    DatasetFillJobVisibilityResponse,
    DatasetFillMarkStaleFailedRequest,
    DatasetFillMarkStaleFailedResponse,
    DatasetFillPreviewRequest,
    DatasetFillPreviewResponse,
    DatasetFillSchedulerStatusResponse,
    DatasetFillWorkerTickRequest,
    DatasetFillWorkerTickResponse,
    DatasetLocalFillAuditResponse,
    DatasetLocalFillRequest,
    DatasetLocalFillResponse,
    LocalFillSmokeFixtureResetRequest,
    LocalFillSmokeFixtureResetResponse,
    PaperRuntimeSmokeFixtureResetRequest,
    PaperRuntimeSmokeFixtureResetResponse,
)
from tradelab_api.services.dataset_fill_cancel import (
    DatasetFillCancelValidationError,
    mark_fill_job_cancel_requested,
)
from tradelab_api.services.dataset_fill_enqueue_local import (
    DatasetFillEnqueueLocalValidationError,
    enqueue_dataset_fill_local,
)
from tradelab_api.services.dataset_fill_job_visibility import (
    DatasetFillJobVisibilityValidationError,
    list_dataset_fill_job_visibility,
)
from tradelab_api.services.dataset_fill_preview import (
    DatasetFillPreviewValidationError,
    build_dataset_fill_preview,
)
from tradelab_api.services.dataset_fill_stale_recovery import (
    DatasetFillMarkStaleFailedValidationError,
    mark_stale_fill_job_failed,
)
from tradelab_api.services.dataset_fill_scheduler_status import get_fill_scheduler_status
from tradelab_api.services.dataset_fill_worker_tick import (
    DatasetFillWorkerTickValidationError,
    tick_dataset_fill_worker,
)
from tradelab_api.services.dataset_local_fill import (
    DatasetLocalFillValidationError,
    execute_dataset_local_fill,
)
from tradelab_api.services.dataset_local_fill_audit import (
    DatasetLocalFillAuditValidationError,
    list_dataset_local_fill_audit,
)
from tradelab_api.services.exchanges.binance_spot import BinanceSpotClient
from tradelab_api.services.exchange_repository import ExchangeRepository
from tradelab_api.services.local_fill_smoke_fixture import (
    LocalFillSmokeFixtureValidationError,
    reset_local_fill_smoke_fixture,
)
from tradelab_api.services.bot_repository import BotRepository
from tradelab_api.services.market_data_repository import MarketDataRepository
from tradelab_api.services.market_data_service import import_candles, sync_binance_symbols
from tradelab_api.services.paper_runtime_smoke_fixture import (
    PaperRuntimeSmokeFixtureValidationError,
    reset_paper_runtime_smoke_fixture,
)
from tradelab_api.services.strategy_repository import StrategyRepository


router = APIRouter()

SECRET_METADATA_MARKERS = (
    "apikey",
    "api_key",
    "apisecret",
    "api_secret",
    "secret",
    "token",
    "credential",
    "privatekey",
    "private_key",
)


def sanitize_dataset_metadata(value: object) -> object:
    if isinstance(value, dict):
        safe: dict[str, object] = {}
        for key, item in value.items():
            normalized_key = str(key).replace("-", "_").lower()
            compact_key = normalized_key.replace("_", "")
            if any(marker in normalized_key or marker in compact_key for marker in SECRET_METADATA_MARKERS):
                continue
            safe[str(key)] = sanitize_dataset_metadata(item)
        return safe
    if isinstance(value, list):
        return [sanitize_dataset_metadata(item) for item in value]
    return serialize_value(value)


def serialize_dataset_coverage_segment(segment: object) -> dict[str, object]:
    return {
        "id": serialize_value(segment.id),
        "segment_index": segment.segment_index,
        "start_at": serialize_value(segment.start_at),
        "end_at": serialize_value(segment.end_at),
        "row_count": segment.row_count,
    }


def serialize_dataset_coverage(coverage: object, segments: list[object]) -> dict[str, object]:
    return {
        "id": serialize_value(coverage.id),
        "dataset_key": coverage.dataset_key,
        "exchange": coverage.exchange,
        "symbol": coverage.symbol,
        "timeframe": coverage.timeframe,
        "health_status": coverage.health_status,
        "earliest_open_time": serialize_value(coverage.earliest_open_time),
        "latest_open_time": serialize_value(coverage.latest_open_time),
        "covered_start_at": serialize_value(coverage.covered_start_at),
        "covered_end_at": serialize_value(coverage.covered_end_at),
        "segment_count": coverage.segment_count,
        "gap_count": coverage.gap_count,
        "last_checked_at": serialize_value(coverage.last_checked_at),
        "metadata": sanitize_dataset_metadata(coverage.metadata_ or {}),
        "segments": [serialize_dataset_coverage_segment(segment) for segment in segments],
    }


class ExchangeConnectionCreateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    exchange: str = "binance"
    name: str
    account_label: str | None = None
    api_key_ref: str | None = None
    api_secret_ref: str | None = None
    permissions: dict[str, object] = Field(default_factory=dict)
    metadata: dict[str, object] = Field(default_factory=dict)
    created_by: str | None = None


class ImportJobCreateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    exchange: str = "binance"
    symbol: str
    timeframe: str
    start_at: datetime
    end_at: datetime


class ImportJobListQuery(BaseModel):
    model_config = ConfigDict(extra="ignore")

    exchange: str | None = None
    symbol: str | None = None
    timeframe: str | None = None


@router.get("/exchange-connections")
def list_exchange_connections(session: Session = Depends(get_db_session)) -> JSONResponse:
    repository = ExchangeRepository(session)
    return success_response({"items": [serialize_model(item) for item in repository.list_exchange_connections()]})


@router.post("/exchange-connections")
def create_exchange_connection(
    request: ExchangeConnectionCreateRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    repository = ExchangeRepository(session)
    connection = repository.create_exchange_connection(
        exchange=request.exchange,
        name=request.name,
        account_label=request.account_label,
        api_key_ref=request.api_key_ref,
        api_secret_ref=request.api_secret_ref,
        permissions=request.permissions,
        metadata_=request.metadata,
        created_by=request.created_by,
        status="active",
    )
    session.commit()
    return success_response(serialize_model(connection), status_code=201)


@router.post("/exchange-symbols/sync")
def sync_exchange_symbols(session: Session = Depends(get_db_session)) -> JSONResponse:
    repository = ExchangeRepository(session)
    client = BinanceSpotClient()
    synced = sync_binance_symbols(repository, client)
    session.commit()
    return success_response({"count": len(synced), "items": [serialize_model(item) for item in synced]})


@router.get("/exchange-symbols")
def list_exchange_symbols(session: Session = Depends(get_db_session)) -> JSONResponse:
    repository = ExchangeRepository(session)
    return success_response({"items": [serialize_model(item) for item in repository.list_exchange_symbols()]})


@router.get("/datasets/coverage")
def list_dataset_coverage(session: Session = Depends(get_db_session)) -> JSONResponse:
    repository = MarketDataRepository(session)
    items = [
        serialize_dataset_coverage(
            coverage,
            repository.list_coverage_segments(coverage_id=coverage.id),
        )
        for coverage in repository.list_coverage()
    ]
    return success_response({"items": items})

@router.post("/datasets/fill-preview")
def preview_dataset_fill(
    request: DatasetFillPreviewRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    repository = MarketDataRepository(session)
    try:
        preview = build_dataset_fill_preview(
            repository,
            strategy_id=request.strategy_id,
            exchange=request.exchange,
            symbol=request.symbol,
            timeframe=request.timeframe,
            requested_start_at=request.requested_start_at,
            requested_end_at=request.requested_end_at,
            source=request.source,
        )
    except DatasetFillPreviewValidationError as exc:
        return error_response(400, exc.message, {"reasonCode": exc.reason_code})
    payload = DatasetFillPreviewResponse.model_validate(preview).model_dump(mode="json", by_alias=True)
    return success_response(payload)

@router.post("/datasets/fill-local")
def fill_dataset_local(
    request: DatasetLocalFillRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    repository = MarketDataRepository(session)
    settings = get_settings()
    client = BinanceSpotClient(base_url=settings.binance_base_url)
    try:
        result = execute_dataset_local_fill(
            repository,
            client,
            settings=settings,
            strategy_id=request.strategy_id,
            exchange=request.exchange,
            symbol=request.symbol,
            timeframe=request.timeframe,
            requested_start_at=request.requested_start_at,
            requested_end_at=request.requested_end_at,
            preview_id=request.preview_id,
            request_fingerprint=request.request_fingerprint,
            confirm_local_fill=request.confirm_local_fill,
            source=request.source,
        )
    except DatasetLocalFillValidationError as exc:
        if exc.should_commit:
            session.commit()
        details = {"reasonCode": exc.reason_code}
        if exc.provider_status is not None:
            details["providerStatus"] = exc.provider_status
        return error_response(400, exc.message, details)
    payload = DatasetLocalFillResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    session.commit()
    return success_response(payload)

@router.post("/datasets/fill-enqueue-local")
def enqueue_dataset_fill_local_route(
    request: DatasetFillEnqueueLocalRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    repository = MarketDataRepository(session)
    settings = get_settings()
    try:
        result = enqueue_dataset_fill_local(
            repository,
            settings=settings,
            strategy_id=request.strategy_id,
            exchange=request.exchange,
            symbol=request.symbol,
            timeframe=request.timeframe,
            requested_start_at=request.requested_start_at,
            requested_end_at=request.requested_end_at,
            preview_id=request.preview_id,
            request_fingerprint=request.request_fingerprint,
            missing_ranges=[item.model_dump() for item in request.missing_ranges],
            confirm_local_fill=request.confirm_local_fill,
            source=request.source,
        )
    except DatasetFillEnqueueLocalValidationError as exc:
        return error_response(400, exc.message, {"reasonCode": exc.reason_code, **exc.details})
    payload = DatasetFillEnqueueLocalResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    session.commit()
    return success_response(payload, message="Background fill job queued.")

@router.post("/datasets/fill-jobs/worker-tick")
def tick_dataset_fill_worker_route(
    request: DatasetFillWorkerTickRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    repository = MarketDataRepository(session)
    settings = get_settings()
    client = BinanceSpotClient(base_url=settings.binance_base_url)
    try:
        result = tick_dataset_fill_worker(
            repository,
            client,
            settings=settings,
            confirm_local_worker_tick=request.confirm_local_worker_tick,
            worker_id=request.worker_id,
        )
    except DatasetFillWorkerTickValidationError as exc:
        return error_response(400, exc.message, {"reasonCode": exc.reason_code})
    payload = DatasetFillWorkerTickResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    session.commit()
    if not result.processed:
        message = "No queued background fill job."
    elif result.status == "cancelled":
        message = "Background fill worker tick cancelled job."
    elif result.status == "running" and result.reason_code:
        message = "Background fill worker tick scheduled retry."
    else:
        message = "Background fill worker tick completed."
    return success_response(payload, message=message)

@router.post("/datasets/fill-jobs/{job_id}/cancel")
def cancel_fill_job_route(
    job_id: str,
    request: DatasetFillCancelRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    repository = MarketDataRepository(session)
    settings = get_settings()
    try:
        result = mark_fill_job_cancel_requested(
            repository,
            settings=settings,
            job_id=job_id,
            confirm_cancel=request.confirm_cancel,
            reason=request.reason,
            requested_by=request.requested_by,
        )
    except DatasetFillCancelValidationError as exc:
        return error_response(400, exc.message, {"reasonCode": exc.reason_code, **exc.details})
    payload = DatasetFillCancelResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    session.commit()
    return success_response(payload, message="Background fill cancel requested.")

@router.post("/datasets/fill-jobs/{job_id}/mark-stale-failed")
def mark_stale_fill_job_failed_route(
    job_id: str,
    request: DatasetFillMarkStaleFailedRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    repository = MarketDataRepository(session)
    settings = get_settings()
    try:
        result = mark_stale_fill_job_failed(
            repository,
            settings=settings,
            job_id=job_id,
            confirm_mark_failed=request.confirm_mark_failed,
            reason=request.reason,
            requested_by=request.requested_by,
        )
    except DatasetFillMarkStaleFailedValidationError as exc:
        return error_response(400, exc.message, {"reasonCode": exc.reason_code, **exc.details})
    payload = DatasetFillMarkStaleFailedResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    session.commit()
    return success_response(payload, message="Stale background fill job marked failed.")

@router.get("/datasets/local-fill-audit")
def get_dataset_local_fill_audit(
    exchange: str | None = None,
    symbol: str | None = None,
    timeframe: str | None = None,
    dataset_key: str | None = Query(default=None, alias="datasetKey"),
    limit: int = 5,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    repository = MarketDataRepository(session)
    try:
        result = list_dataset_local_fill_audit(
            repository,
            exchange=exchange,
            symbol=symbol,
            timeframe=timeframe,
            dataset_key=dataset_key,
            limit=limit,
        )
    except DatasetLocalFillAuditValidationError as exc:
        return error_response(400, exc.message, {"reasonCode": exc.reason_code})
    payload = DatasetLocalFillAuditResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    return success_response(payload)

@router.get("/datasets/fill-job-visibility")
def get_dataset_fill_job_visibility(
    exchange: str | None = None,
    symbol: str | None = None,
    timeframe: str | None = None,
    dataset_key: str | None = Query(default=None, alias="datasetKey"),
    limit: int = 5,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    repository = MarketDataRepository(session)
    try:
        result = list_dataset_fill_job_visibility(
            repository,
            exchange=exchange,
            symbol=symbol,
            timeframe=timeframe,
            dataset_key=dataset_key,
            limit=limit,
        )
    except DatasetFillJobVisibilityValidationError as exc:
        return error_response(400, exc.message, {"reasonCode": exc.reason_code})
    payload = DatasetFillJobVisibilityResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    return success_response(payload)

@router.get("/datasets/fill-scheduler/status")
def get_dataset_fill_scheduler_status(request: Request) -> JSONResponse:
    scheduler = getattr(request.app.state, "background_fill_scheduler", None)
    result = get_fill_scheduler_status(scheduler)
    payload = DatasetFillSchedulerStatusResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    return success_response(payload)

@router.post("/smoke/local-fill-fixture/reset")
def reset_local_fill_fixture(
    request: LocalFillSmokeFixtureResetRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    strategy_repository = StrategyRepository(session)
    market_repository = MarketDataRepository(session)
    settings = get_settings()
    try:
        result = reset_local_fill_smoke_fixture(
            strategy_repository,
            market_repository,
            settings=settings,
            confirm_fixture_reset=request.confirm_fixture_reset,
        )
    except LocalFillSmokeFixtureValidationError as exc:
        return error_response(400, exc.message, {"reasonCode": exc.reason_code})
    payload = LocalFillSmokeFixtureResetResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    session.commit()
    return success_response(payload)

@router.post("/smoke/paper-runtime-fixture/reset")
def reset_paper_runtime_fixture(
    request: PaperRuntimeSmokeFixtureResetRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    strategy_repository = StrategyRepository(session)
    bot_repository = BotRepository(session)
    market_repository = MarketDataRepository(session)
    settings = get_settings()
    try:
        result = reset_paper_runtime_smoke_fixture(
            strategy_repository,
            bot_repository,
            market_repository,
            settings=settings,
            confirm_fixture_reset=request.confirm_fixture_reset,
            session_state=request.session_state,
        )
    except PaperRuntimeSmokeFixtureValidationError as exc:
        return error_response(400, exc.message, {"reasonCode": exc.reason_code})
    payload = PaperRuntimeSmokeFixtureResetResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    session.commit()
    return success_response(payload)

@router.post("/market-data/import-jobs")
def create_market_data_import_job(
    request: ImportJobCreateRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    repository = MarketDataRepository(session)
    client = BinanceSpotClient()
    result = import_candles(
        repository,
        client,
        exchange=request.exchange,
        symbol=request.symbol,
        timeframe=request.timeframe,
        start_at=request.start_at,
        end_at=request.end_at,
    )
    session.commit()
    payload = {"job": serialize_model(result.job) if result.job is not None else None, "rows_imported": result.rows_imported}
    if result.error_message is not None:
        payload["error_message"] = result.error_message
    return success_response(payload, status_code=201)


@router.get("/market-data/import-jobs")
def list_market_data_import_jobs(session: Session = Depends(get_db_session)) -> JSONResponse:
    repository = MarketDataRepository(session)
    return success_response({"items": [serialize_model(item) for item in repository.list_import_jobs()]})


@router.get("/market-candles")
def list_market_candles(
    exchange: str | None = None,
    symbol: str | None = None,
    timeframe: str | None = None,
    start_at: datetime | None = None,
    end_at: datetime | None = None,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    repository = MarketDataRepository(session)
    items = repository.list_market_candles(
        exchange=exchange,
        symbol=symbol,
        timeframe=timeframe,
        start_at=start_at,
        end_at=end_at,
    )
    return success_response({"items": [serialize_model(item) for item in items]})
