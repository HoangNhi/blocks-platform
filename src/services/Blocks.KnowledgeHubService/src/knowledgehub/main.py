from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI
from fastapi.responses import JSONResponse

from knowledgehub.identity import AuthenticatedUser, get_settings
from knowledgehub.permission import (
    PermissionClient,
    get_permission_client,
    require_permission,
)
from knowledgehub.responses import setup_exception_handlers, success_response


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    client = PermissionClient(settings)
    app.state.permission_client = client
    try:
        yield
    finally:
        await client.close()
        app.state.permission_client = None


app = FastAPI(
    title="KnowledgeHub",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
)

setup_exception_handlers(app)


@app.get("/alive")
async def alive():
    return {"status": "alive"}


@app.get("/health")
async def health(
    permission_client: PermissionClient = Depends(get_permission_client),
):
    is_ready = await permission_client.check_channel_health()
    if not is_ready:
        return JSONResponse(status_code=503, content={"status": "unhealthy"})
    return {"status": "healthy"}


api_router = APIRouter(prefix="/api/knowledgehub")


@api_router.get("/identity")
async def get_identity(
    user: AuthenticatedUser = Depends(require_permission("knowledgehub", 1)),
):
    return success_response(data={"ActorId": str(user.actor_id)})


app.include_router(api_router)
