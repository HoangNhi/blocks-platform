from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from knowledgehub.models import CollectionModel, DocumentModel
from knowledgehub.schemas import (
    DOCUMENT_MIME_TYPES,
    DocumentUploadIntentRequest,
)

REGISTRATION_LEASE_SECONDS = 90


def _document_query():
    return select(DocumentModel).join(
        CollectionModel, CollectionModel.id == DocumentModel.collection_id
    )


def build_get_active_document_query(document_id: UUID, actor_id: UUID):
    return _document_query().where(
        DocumentModel.id == document_id,
        DocumentModel.deleted_at.is_(None),
        CollectionModel.owner_id == actor_id,
        CollectionModel.deleted_at.is_(None),
    )


def build_list_documents_query(
    actor_id: UUID,
    collection_id: UUID,
    page_index: int,
    page_size: int,
    query_text: str | None = None,
    registration_status: str | None = None,
):
    stmt = _document_query().where(
        DocumentModel.collection_id == collection_id,
        DocumentModel.deleted_at.is_(None),
        CollectionModel.id == collection_id,
        CollectionModel.owner_id == actor_id,
        CollectionModel.deleted_at.is_(None),
    )

    if query_text:
        escaped = (
            query_text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        )
        pattern = f"%{escaped}%"
        stmt = stmt.where(or_(
            DocumentModel.title.ilike(pattern, escape="\\"),
            DocumentModel.original_filename.ilike(pattern, escape="\\"),
        ))

    if registration_status:
        stmt = stmt.where(DocumentModel.registration_status == registration_status)

    return (
        stmt.order_by(DocumentModel.created_at.desc(), DocumentModel.id.desc())
        .offset((page_index - 1) * page_size)
        .limit(page_size)
    )

def build_count_documents_query(
    actor_id: UUID,
    collection_id: UUID,
    query_text: str | None = None,
    registration_status: str | None = None,
):
    stmt = select(func.count()).select_from(DocumentModel).join(
        CollectionModel, CollectionModel.id == DocumentModel.collection_id
    ).where(
        DocumentModel.collection_id == collection_id,
        DocumentModel.deleted_at.is_(None),
        CollectionModel.owner_id == actor_id,
        CollectionModel.deleted_at.is_(None),
    )

    if query_text:
        escaped = (
            query_text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        )
        pattern = f"%{escaped}%"
        stmt = stmt.where(or_(
            DocumentModel.title.ilike(pattern, escape="\\"),
            DocumentModel.original_filename.ilike(pattern, escape="\\"),
        ))

    if registration_status:
        stmt = stmt.where(DocumentModel.registration_status == registration_status)

    return stmt

async def create_upload_intent(
    session: AsyncSession,
    actor_id: UUID,
    collection_id: UUID,
    data: DocumentUploadIntentRequest
) -> DocumentModel | None:
    collection = await session.scalar(
        select(CollectionModel).where(
            CollectionModel.id == collection_id,
            CollectionModel.owner_id == actor_id,
            CollectionModel.deleted_at.is_(None),
        )
        .with_for_update()
    )

    if collection is None:
        return None

    extension = Path(data.OriginalFileName).suffix.lower()
    content_type = DOCUMENT_MIME_TYPES[extension]
    title = Path(data.OriginalFileName).stem
    document_id = uuid4()

    insert_stmt = (
        pg_insert(DocumentModel)
        .values(
            id=document_id,
            collection_id=collection_id,
            upload_session_id=data.UploadSessionId,
            title=title,
            original_filename=data.OriginalFileName,
            file_extension=extension,
            content_type=content_type,
            declared_size_bytes=data.DeclaredSizeBytes,
            registration_status="AWAITING_UPLOAD",
            cleanup_status="NOT_REQUESTED"
        )
        .on_conflict_do_nothing(index_elements=[DocumentModel.upload_session_id])
        .returning(DocumentModel.id)
    )

    inserted_id = await session.scalar(insert_stmt)
    if inserted_id is not None:
        await session.flush()
        return await session.scalar(
            select(DocumentModel).where(DocumentModel.id == inserted_id)
        )

    existing = await session.scalar(
        _document_query().where(
            DocumentModel.upload_session_id == data.UploadSessionId,
            CollectionModel.owner_id == actor_id,
        )
    )

    if(
        existing is None
        or existing.collection_id != collection_id
        or existing.original_filename != data.OriginalFileName
        or existing.declared_size_bytes != data.DeclaredSizeBytes
    ):
        raise HTTPException(
            status_code=409,
            detail="UploadSessionId đã được sử dụng cho upload intent khác",
        )

    return existing

async def get_document_and_parent(
    session: AsyncSession,
    document_id: UUID,
    actor_id: UUID
):
    result = await session.execute(
        select(DocumentModel, CollectionModel)
        .join(CollectionModel, CollectionModel.id == DocumentModel.collection_id)
        .where(
            DocumentModel.id == document_id,
            CollectionModel.owner_id == actor_id,
        )
    )
    return result.one_or_none()

async def get_active_document(
    session: AsyncSession,
    document_id: UUID,
    actor_id: UUID
) -> DocumentModel | None:
    return await session.scalar(
        build_get_active_document_query(document_id, actor_id)
    )

async def claim_registration(
    session: AsyncSession,
    document_id: UUID,
    actor_id: UUID
):
    result = await session.execute(
        select(DocumentModel, CollectionModel)
        .join(CollectionModel, CollectionModel.id == DocumentModel.collection_id)
        .where(
            DocumentModel.id == document_id,
            CollectionModel.owner_id == actor_id,
        )
        .with_for_update()
    )
    pair = result.one_or_none()
    if pair is None:
        return None

    document, collection = pair
    if collection.deleted_at is not None:
        document.registration_status = "BLOCKED_PARENT_DELETED"
        document.registration_attempt_id = None
        document.registration_lease_until = None
        await session.flush()
        return None

    if document.registration_status == "REGISTERED":
        return document, None

    now = datetime.now(timezone.utc)
    if(
        document.registration_status == "REGISTERING"
        and document.registration_lease_until is not None
        and document.registration_lease_until > now
    ):
        raise HTTPException(
            status_code=409,
            detail="Tài liệu đang được đăng ký",
        )

    attempt_id = uuid4()
    document.registration_status = "REGISTERING"
    document.registration_attempt_id = attempt_id
    document.registration_lease_until = now + timedelta(
        seconds=REGISTRATION_LEASE_SECONDS
    )
    document.last_error_code = None
    document.last_error_at = None
    await session.flush()

    return document, attempt_id

async def mark_registration_failed(
    session: AsyncSession,
    document_id: UUID,
    attempt_id: UUID,
    error_code: str
) -> bool:
    result = await session.execute(
        update(DocumentModel)
        .where(
            DocumentModel.id == document_id,
            DocumentModel.registration_attempt_id == attempt_id,
            DocumentModel.registration_status == "REGISTERING",
        )
        .values(
            registration_status="REGISTRATION_FAILED",
            registration_attempt_id=None,
            registration_lease_until=None,
            last_error_code=error_code[:64],
            last_error_at=func.now(),
        )
        .returning(DocumentModel.id)
    )
    return result.scalar_one_or_none() is not None

async def commit_finalized_reference(
    session: AsyncSession,
    document_id: UUID,
    actor_id: UUID,
    attempt_id: UUID,
    finalized,
) -> DocumentModel | None:
    pair = await session.execute(
        select(DocumentModel, CollectionModel)
        .join(CollectionModel, CollectionModel.id == DocumentModel.collection_id)
        .where(
            DocumentModel.id == document_id,
            CollectionModel.owner_id == actor_id,
        )
        .with_for_update()
    )
    row = pair.one_or_none()
    if row is None:
        return None

    document, collection = row

    if document.registration_attempt_id != attempt_id:
        return None

    document.file_id = finalized.file_id
    document.storage_key = finalized.storage_key
    document.size_bytes = finalized.size_bytes
    document.source_sha256 = finalized.source_sha256.lower()
    document.content_type = DOCUMENT_MIME_TYPES[document.file_extension]
    document.registration_attempt_id = None
    document.registration_lease_until = None

    if collection.deleted_at is None:
        document.registration_status = "REGISTERED"
        document.registered_at = datetime.now(timezone.utc)
        document.last_error_code = None
        document.last_error_at = None
    else:
        document.registration_status = "PARENT_DELETED_RETAINED"
        document.registered_at = None

    await session.flush()
    return document

async def list_documents(
    session: AsyncSession,
    actor_id: UUID,
    collection_id: UUID,
    page_index: int,
    page_size: int,
    query_text: str | None = None,
    registration_status: str | None = None
):
    count_resul = await session.execute(
        build_count_documents_query(
            actor_id, collection_id, query_text, registration_status
        )
    )
    total = int(count_resul.scalar_one() or 0)

    result = await session.execute(
        build_list_documents_query(
            actor_id, collection_id, page_index, page_size, query_text, registration_status
        )
    )
    return list(result.scalars().all()), total

async def soft_delete_document(
    session: AsyncSession,
    document_id: UUID,
    actor_id: UUID
) -> DocumentModel | None:
    document = await session.scalar(
        select(DocumentModel)
        .join(CollectionModel, CollectionModel.id == DocumentModel.collection_id)
        .where(
            DocumentModel.id == document_id,
            CollectionModel.owner_id == actor_id,
            CollectionModel.deleted_at.is_(None),
            DocumentModel.deleted_at.is_(None),
            DocumentModel.registration_status == "REGISTERED",
        )
        .with_for_update()
    )
    if document is None:
        return None

    document.deleted_at = datetime.now(timezone.utc)
    document.cleanup_status = "PENDING"
    await session.flush()
    return document

async def update_cleanup_status(
    session: AsyncSession,
    document_id: UUID,
    cleanup_status: str
) -> bool:
    result = await session.execute(
        update(DocumentModel)
        .where(DocumentModel.id == document_id, DocumentModel.deleted_at.is_not(None))
        .values(cleanup_status=cleanup_status)
        .returning(DocumentModel.id)
    )
    return result.scalar_one_or_none() is not None

async def get_active_document_counts(
    session: AsyncSession,
    actor_id: UUID,
    collection_ids: list[UUID]
) -> dict[UUID, int]:
    if not collection_ids:
        return {}
    
    result = await session.execute(
        select(
            DocumentModel.collection_id,
            func.count(DocumentModel.id)
        )
        .join(CollectionModel, CollectionModel.id == DocumentModel.collection_id)
        .where(
            DocumentModel.collection_id.in_(collection_ids),
            DocumentModel.deleted_at.is_(None),
            DocumentModel.registration_status == "REGISTERED",
            CollectionModel.owner_id == actor_id,
            CollectionModel.deleted_at.is_(None),
        )
        .group_by(DocumentModel.collection_id)
    )
    return {collection_id: int(count) for collection_id, count in result.all()}

