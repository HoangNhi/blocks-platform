from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from knowledgehub.collections import (
    create_collection,
    get_collection,
    list_collections,
    soft_delete_collection,
    update_collection,
)
from knowledgehub.database import (
    check_db_health,
    create_db_engine,
    create_session_factory,
    get_db_session,
)
from knowledgehub.document_routes import document_router
from knowledgehub.documents import get_active_document_counts
from knowledgehub.file_service import FileServiceClient, get_file_service_client
from knowledgehub.identity import AuthenticatedUser, get_settings
from knowledgehub.permission import (
    PermissionClient,
    get_permission_client,
    require_permission,
)
from knowledgehub.responses import (
    error_response,
    setup_exception_handlers,
    success_response,
)
from knowledgehub.schemas import (
    CollectionCreateRequest,
    CollectionListResponse,
    CollectionResponse,
    CollectionUpdateRequest,
    validate_nonzero_uuid,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    permission_client = PermissionClient(settings)
    file_service_client = FileServiceClient(settings)
    engine = create_db_engine(settings.database_url.get_secret_value())

    app.state.permission_client = permission_client
    app.state.file_service_client = file_service_client
    app.state.db_engine = engine
    app.state.db_session_factory = create_session_factory(engine)

    try:
        yield
    finally:
        try:
            await permission_client.close()
        finally:
            try:
                await file_service_client.close()
            finally:
                await engine.dispose()
                app.state.permission_client = None
                app.state.file_service_client = None
                app.state.db_engine = None
                app.state.db_session_factory = None


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
    request: Request,
    permission_client: PermissionClient = Depends(get_permission_client),
    file_service_client: FileServiceClient = Depends(get_file_service_client),
):
    rpc_ok = await permission_client.check_channel_health()
    if not rpc_ok:
        return JSONResponse(status_code=503, content={"status": "unhealthy"})
    engine = getattr(request.app.state, "db_engine", None)
    db_ok = await check_db_health(engine, timeout=2.0)
    if not db_ok:
        return JSONResponse(status_code=503, content={"status": "unhealthy"})

    if not await file_service_client.check_channel_health():
        return JSONResponse(status_code=503, content={"status": "unhealthy"})

    return {"status": "healthy"}


api_router = APIRouter(prefix="/api/knowledgehub")


@api_router.get("/identity")
async def get_identity(
    user: AuthenticatedUser = Depends(require_permission("knowledgehub", 1)),
):
    return success_response(data={"ActorId": str(user.actor_id)})


@api_router.get("/collections")
async def list_collections_endpoint(
    page_index: int = Query(default=1, ge=1, description="Số trang (bắt đầu từ 1)"),
    page_size: int = Query(
        default=50, ge=1, le=100, description="Kích thước trang (1-100)"
    ),
    user: AuthenticatedUser = Depends(require_permission("knowledgehub", 1)),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Action: VIEW (1)
    Lấy danh sách các bộ sưu tập còn hoạt động của actor, có phân trang.
    """
    items, total = await list_collections(session, user.actor_id, page_index, page_size)
    # data = [CollectionResponse.from_model(item) for item in items]
    counts = await get_active_document_counts(
        session,
        user.actor_id,
        [item.id for item in items],
    )
    data = [
        CollectionResponse.from_model(item, counts.get(item.id, 0)) for item in items
    ]
    list_resp = CollectionListResponse(
        Data=data,
        TotalRow=total,
        PageIndex=page_index,
        PageSize=page_size,
    )
    return success_response(data=list_resp.model_dump())


@api_router.get("/collections/{id}")
async def get_collection_endpoint(
    id: str,
    user: AuthenticatedUser = Depends(require_permission("knowledgehub", 1)),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Action: VIEW (1)
    Lấy chi tiết một bộ sưu tập còn hoạt động thuộc sở hữu của actor.
    """
    try:
        col_id = validate_nonzero_uuid(id)
    except (ValueError, TypeError):
        return error_response(400, "Mã định danh không hợp lệ")
    item = await get_collection(session, col_id, user.actor_id)
    if item is None:
        return error_response(404, "Không tìm thấy tài nguyên")
    counts = await get_active_document_counts(session, user.actor_id, [item.id])

    return success_response(
        data=CollectionResponse.from_model(
            item,
            document_count=counts.get(item.id, 0),
        ).model_dump()
    )

@api_router.post("/collections")
async def create_collection_endpoint(
    data: CollectionCreateRequest,
    user: AuthenticatedUser = Depends(require_permission("knowledgehub", 2)),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Action: ADD (2)
    Tạo mới một bộ sưu tập do actor sở hữu.
    """
    col = await create_collection(session, user.actor_id, data)
    await session.commit()
    return success_response(data=CollectionResponse.from_model(col).model_dump())


@api_router.put("/collections/{id}")
async def update_collection_endpoint(
    id: str,
    data: CollectionUpdateRequest,
    user: AuthenticatedUser = Depends(require_permission("knowledgehub", 3)),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Action: UPDATE (3)
    Cập nhật tên và mô tả của bộ sưu tập.
    """
    try:
        col_id = validate_nonzero_uuid(id)
    except (ValueError, TypeError):
        return error_response(400, "Mã định danh không hợp lệ")
    item = await update_collection(session, col_id, user.actor_id, data)
    if item is None:
        return error_response(404, "Không tìm thấy tài nguyên")
    await session.commit()
    return success_response(data=CollectionResponse.from_model(item).model_dump())


@api_router.delete("/collections/{id}")
async def delete_collection_endpoint(
    id: str,
    user: AuthenticatedUser = Depends(require_permission("knowledgehub", 4)),
    session: AsyncSession = Depends(get_db_session),
):
    """
    Action: DELETE (4)
    Xóa mềm bộ sưu tập của actor. Không xóa vật lý dữ liệu hay file.
    """
    try:
        col_id = validate_nonzero_uuid(id)
    except (ValueError, TypeError):
        return error_response(400, "Mã định danh không hợp lệ")
    deleted = await soft_delete_collection(session, col_id, user.actor_id)
    if not deleted:
        return error_response(404, "Không tìm thấy tài nguyên")
    await session.commit()
    return success_response(data={"Id": str(col_id)})


app.include_router(api_router)
app.include_router(document_router)
