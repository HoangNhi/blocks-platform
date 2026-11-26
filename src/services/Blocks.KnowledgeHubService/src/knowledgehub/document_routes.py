from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession

from knowledgehub.database import get_db_session
from knowledgehub.documents import (
    claim_registration,
    commit_finalized_reference,
    create_upload_intent,
    get_active_document,
    get_document_and_parent,
    list_documents,
    mark_registration_failed,
    soft_delete_document,
    update_cleanup_status,
)
from knowledgehub.file_service import FileServiceClient, get_file_service_client
from knowledgehub.identity import AuthenticatedUser
from knowledgehub.permission import require_permission
from knowledgehub.responses import error_response, success_response
from knowledgehub.schemas import (
    DocumentDeleteResponse,
    DocumentPageResponse,
    DocumentResponse,
    DocumentUploadIntentRequest,
    DocumentUploadIntentResponse,
    validate_nonzero_uuid,
)

document_router = APIRouter(prefix="/api/knowledgehub")


@document_router.post("/collections/{collection_id}/documents/upload-intents")
async def create_document_upload_intent_enpoint(
    collection_id: str,
    data: DocumentUploadIntentRequest,
    user: AuthenticatedUser = Depends(require_permission("knowledgehub", 2)),
    session: AsyncSession = Depends(get_db_session),
):
    try:
        parsed_collection_id = validate_nonzero_uuid(collection_id)
    except (ValueError, TypeError):
        return error_response(400, "Mã định danh không hợp lệ")

    document = await create_upload_intent(
        session, user.actor_id, parsed_collection_id, data
    )

    if document is None:
        return error_response(404, "Không tìm thấy tài nguyên")

    await session.commit()

    response = DocumentUploadIntentResponse(
        DocumentId=str(document.id),
        UploadSessionId=str(document.upload_session_id),
        RegistrationStatus=document.registration_status,
    )
    return success_response(data=response.model_dump())


@document_router.post("/documents/{document_id}/finalize")
async def finalize_document_endpoint(
    document_id: str,
    user: AuthenticatedUser = Depends(require_permission("knowledgehub", 2)),
    session: AsyncSession = Depends(get_db_session),
    file_service: FileServiceClient = Depends(get_file_service_client),
):
    try:
        parsed_document_id = validate_nonzero_uuid(document_id)
    except (ValueError, TypeError):
        return error_response(400, "Mã định danh không hợp lệ")

    pair = await get_document_and_parent(
        session,
        parsed_document_id,
        user.actor_id,
    )

    if pair is None:
        return error_response(404, "Không tìm thấy tài nguyên")

    document, collection = pair

    if collection.deleted_at is not None:
        document.registration_status = "BLOCKED_PARENT_DELETED"
        await session.commit()
        return error_response(404, "Không tìm thấy tài nguyên")

    if document.registration_status == "REGISTERED":
        return success_response(data=DocumentResponse.from_model(document).model_dump())

    claimed = await claim_registration(
        session,
        parsed_document_id,
        user.actor_id,
    )
    if claimed is None:
        await session.commit()
        return error_response(404, "Không tìm thấy tài nguyên")

    document, attempt_id = claimed
    if attempt_id is None:
        return success_response(data=DocumentResponse.from_model(document).model_dump())

    # Important: commit the lease before calling FileService.
    await session.commit()

    try:
        finalized = await file_service.finalize_upload(
            user,
            document.id,
            document.upload_session_id,
            document.original_filename,
            document.file_extension,
            document.declared_size_bytes,
        )
    except HTTPException as exc:
        await mark_registration_failed(
            session,
            document.id,
            attempt_id,
            f"FILESERVICE_{exc.status_code}",
        )
        await session.commit()
        raise
    except Exception:
        await mark_registration_failed(
            session,
            document.id,
            attempt_id,
            "FILESERVICE_UNEXPECTED",
        )
        await session.commit()
        raise HTTPException(
            status_code=503,
            detail="Không thể hoàn tất đăng ký tài liệu",
        ) from None

    # New transaction: lock and recheck the parent collection after RPC.
    registered = await commit_finalized_reference(
        session,
        document.id,
        user.actor_id,
        attempt_id,
        finalized,
    )

    if registered is None:
        await session.rollback()
        return error_response(409, "Yêu cầu đăng ký đã hết hiệu lực")

    await session.commit()

    if registered.registration_status == "PARENT_DELETED_RETAINED":
        return error_response(404, "Không tìm thấy tài nguyên")

    return success_response(data=DocumentResponse.from_model(registered).model_dump())

@document_router.get("/collections/{collection_id}/documents")
async def list_documents_endpoint(
    collection_id: str,
    q: str | None = Query(default=None, max_length=255),
    registration_status: str | None = Query(default=None),
    page_index: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user: AuthenticatedUser = Depends(require_permission("knowledgehub", 1)),
    session: AsyncSession = Depends(get_db_session),
):
    try:
        parsed_collection_id = validate_nonzero_uuid(collection_id)
    except (ValueError, TypeError):
        return error_response(400, "Mã định danh không hợp lệ")

    allowed_statuses = {
        "AWAITING_UPLOAD",
        "REGISTERING",
        "REGISTRATION_FAILED",
        "REGISTERED",
    }

    if registration_status is not None and registration_status not in allowed_statuses:
        return error_response(400, "RegistrationStatus không hợp lệ")

    from knowledgehub.collections import get_collection

    collection = await get_collection(session, parsed_collection_id, user.actor_id)

    if collection is None:
        return error_response(404, "Không tìm thấy tài nguyên")

    items, total = await list_documents(
        session,
        user.actor_id,
        parsed_collection_id,
        page_index,
        page_size,
        q,
        registration_status,
    )

    response = DocumentPageResponse(
        Data=[DocumentResponse.from_model(item) for item in items],
        TotalRow=total,
        PageIndex=page_index,
        PageSize=page_size,
    )

    return success_response(data=response.model_dump())

@document_router.get("/documents/{document_id}")
async def get_document_endpoint(
    document_id: str,
    user: AuthenticatedUser = Depends(require_permission("knowledgehub", 1)),
    session: AsyncSession = Depends(get_db_session),
):
    try:
        parsed_document_id = validate_nonzero_uuid(document_id)
    except (ValueError, TypeError):
        return error_response(400, "Mã định danh không hợp lệ")

    document = await get_active_document(
        session,
        parsed_document_id,
        user.actor_id,
    )

    if document is None:
        return error_response(404, "Không tìm thấy tài nguyên")
    
    return success_response(data=DocumentResponse.from_model(document).model_dump())

@document_router.get("/documents/{document_id}/download")
async def download_document_endpoint(
    document_id: str,
    user: AuthenticatedUser = Depends(require_permission("knowledgehub", 1)),
    session: AsyncSession = Depends(get_db_session),
    file_service: FileServiceClient = Depends(get_file_service_client),
):
    try:
        parsed_document_id = validate_nonzero_uuid(document_id)
    except (ValueError, TypeError):
        return error_response(400, "Mã định danh không hợp lệ")

    document = await get_active_document(
        session,
        parsed_document_id,
        user.actor_id,
    )

    if (
        document is None
        or document.registration_status != "REGISTERED"
        or not document.storage_key
    ):
        return error_response(404, "Không tìm thấy tài nguyên")

    preview = await file_service.preview_file(
        user,
        document.storage_key,
    )

    safe_filename = quote(document.original_filename)

    return Response(
        content=preview.content,
        media_type=document.content_type,
        headers={
            "Content-Disposition": (
                "attachment; filename*=UTF-8''" + safe_filename
            ),
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )

@document_router.delete("/documents/{document_id}")
async def delete_document_endpoint(
    document_id: str,
    user: AuthenticatedUser = Depends(require_permission("knowledgehub", 4)),
    session: AsyncSession = Depends(get_db_session),
    file_service: FileServiceClient = Depends(get_file_service_client)
):
    try:
        parsed_document_id = validate_nonzero_uuid(document_id)
    except (ValueError, TypeError):
        return error_response(400, "Mã định danh không hợp lệ")

    document = await soft_delete_document(
        session,
        parsed_document_id,
        user.actor_id,
    )

    if document is None:
        return error_response(404, "Không tìm thấy tài nguyên")

    await session.commit()

    cleanup_status = "FAILED"
    try:
        deleted = await file_service.delete_file(
            user,
            document.storage_key,
        )

        cleanup_status = "COMPLETED" if deleted else "FAILED"
    except Exception:
        cleanup_status = "FAILED"

    await update_cleanup_status(
        session,
        document.id,
        cleanup_status
    )

    await session.commit()

    response = DocumentDeleteResponse(
        Id = str(document.id),
        CleanupStatus = cleanup_status
    )

    return success_response(data=response.model_dump())