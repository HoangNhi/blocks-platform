from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from tradelab_api.api.responses import install_exception_handlers
from tradelab_api.api.router import router as api_router
from tradelab_api.core.authorization import SystemFunctionalAuthorizationClient, authorize_request
from tradelab_api.core.config import get_settings
from tradelab_api.db.session import (
    SessionLocal,
    apply_schema_compatibility,
    get_engine,
    verify_database_connection,
)
from tradelab_api.services.baseline_seed import seed_baseline_fixture
from tradelab_api.services.dataset_fill_scheduler import BackgroundFillScheduler
from tradelab_api.services.job_dispatcher import JobDispatcher
from tradelab_api.services.paper_session_scheduler import PaperSessionScheduler


def seed_startup_baseline_if_enabled() -> None:
    settings = get_settings()
    if not settings.seed_baseline_on_startup:
        return
    with SessionLocal(bind=get_engine()) as session:
        try:
            seed_baseline_fixture(session, created_by=settings.seed_baseline_created_by)
            session.commit()
        except Exception:
            session.rollback()
            raise


@asynccontextmanager
async def lifespan(app: FastAPI):
    dispatcher = JobDispatcher()
    background_fill_scheduler = BackgroundFillScheduler()
    paper_session_scheduler = PaperSessionScheduler()
    app.state.job_dispatcher = dispatcher
    app.state.background_fill_scheduler = background_fill_scheduler
    app.state.paper_session_scheduler = paper_session_scheduler
    verify_database_connection()
    apply_schema_compatibility()
    seed_startup_baseline_if_enabled()
    dispatcher.start()
    try:
        background_fill_scheduler.start()
        paper_session_scheduler.start()
        yield
    finally:
        paper_session_scheduler.stop()
        background_fill_scheduler.stop()
        dispatcher.stop()


app = FastAPI(title="TradeLab API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
install_exception_handlers(app)


@app.middleware("http")
async def functional_authorization_middleware(request, call_next):
    client = getattr(request.app.state, "system_authorization_client", None)
    if client is None:
        client = SystemFunctionalAuthorizationClient(get_settings().system_service_base_url)
    denial = await authorize_request(request, client)
    if denial is not None:
        return denial
    return await call_next(request)


app.include_router(api_router, prefix="/api/tradelab")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "tradelab"}
