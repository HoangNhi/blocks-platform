from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import Select, Update, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from knowledgehub.models import CollectionModel
from knowledgehub.schemas import CollectionCreateRequest, CollectionUpdateRequest


def build_get_collection_query(
    collection_id: UUID, owner_id: UUID
) -> Select[Any]:
    """
    Tạo truy vấn lấy chi tiết một bộ sưu tập theo ID và Owner, chỉ khi còn hoạt động.
    """
    return select(CollectionModel).where(
        CollectionModel.id == collection_id,
        CollectionModel.owner_id == owner_id,
        CollectionModel.deleted_at.is_(None),
    )


def build_list_collections_query(
    owner_id: UUID, page_index: int = 1, page_size: int = 50
) -> Select[Any]:
    """
    Tạo truy vấn lấy danh sách bộ sưu tập có phân trang, sắp xếp created_at DESC, id DESC.
    """
    offset = (page_index - 1) * page_size
    return (
        select(CollectionModel)
        .where(
            CollectionModel.owner_id == owner_id,
            CollectionModel.deleted_at.is_(None),
        )
        .order_by(CollectionModel.created_at.desc(), CollectionModel.id.desc())
        .limit(page_size)
        .offset(offset)
    )


def build_count_collections_query(owner_id: UUID) -> Select[Any]:
    """
    Tạo truy vấn đếm tổng số bộ sưu tập còn hoạt động của owner.
    """
    return (
        select(func.count())
        .select_from(CollectionModel)
        .where(
            CollectionModel.owner_id == owner_id,
            CollectionModel.deleted_at.is_(None),
        )
    )


def build_update_collection_stmt(
    collection_id: UUID,
    owner_id: UUID,
    name: str,
    description: str | None,
) -> Update:
    """
    Tạo câu lệnh UPDATE nguyên tử có điều kiện owner_id và deleted_at IS NULL (chống lỗi hồi sinh).
    """
    return (
        update(CollectionModel)
        .where(
            CollectionModel.id == collection_id,
            CollectionModel.owner_id == owner_id,
            CollectionModel.deleted_at.is_(None),
        )
        .values(
            name=name,
            description=description,
        )
        .returning(CollectionModel)
    )


def build_soft_delete_collection_stmt(collection_id: UUID, owner_id: UUID) -> Update:
    """
    Tạo câu lệnh soft delete (cập nhật deleted_at) có điều kiện owner_id và deleted_at IS NULL (chống lỗi hồi sinh).
    """
    return (
        update(CollectionModel)
        .where(
            CollectionModel.id == collection_id,
            CollectionModel.owner_id == owner_id,
            CollectionModel.deleted_at.is_(None),
        )
        .values(deleted_at=func.now())
        .returning(CollectionModel.id)
    )


async def create_collection(
    session: AsyncSession, owner_id: UUID, data: CollectionCreateRequest
) -> CollectionModel:
    """
    Tạo mới bộ sưu tập với UUID sinh phía server.
    """
    collection = CollectionModel(
        id=uuid4(),
        owner_id=owner_id,
        name=data.Name,
        description=data.Description,
    )
    session.add(collection)
    await session.flush()
    return collection


async def get_collection(
    session: AsyncSession, collection_id: UUID, owner_id: UUID
) -> CollectionModel | None:
    """
    Lấy thông tin bộ sưu tập thuộc sở hữu của owner và chưa bị xoá mềm.
    """
    stmt = build_get_collection_query(collection_id, owner_id)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def list_collections(
    session: AsyncSession, owner_id: UUID, page_index: int = 1, page_size: int = 50
) -> tuple[list[CollectionModel], int]:
    """
    Lấy danh sách bộ sưu tập có phân trang và tổng số dòng khả dụng.
    """
    count_stmt = build_count_collections_query(owner_id)
    count_result = await session.execute(count_stmt)
    total_val = count_result.scalar()
    total_row = int(total_val) if total_val is not None else 0

    list_stmt = build_list_collections_query(owner_id, page_index, page_size)
    list_result = await session.execute(list_stmt)
    items: list[CollectionModel] = list(list_result.scalars().all())

    return items, total_row


async def update_collection(
    session: AsyncSession,
    collection_id: UUID,
    owner_id: UUID,
    data: CollectionUpdateRequest,
) -> CollectionModel | None:
    """
    Cập nhật thông tin bộ sưu tập nguyên tử, trả về None nếu không tìm thấy hoặc đã bị xoá.
    """
    stmt = build_update_collection_stmt(
        collection_id, owner_id, data.Name, data.Description
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def soft_delete_collection(
    session: AsyncSession, collection_id: UUID, owner_id: UUID
) -> bool:
    """
    Xoá mềm bộ sưu tập, trả về True nếu xoá thành công, False nếu không tồn tại hoặc đã xoá.
    """
    stmt = build_soft_delete_collection_stmt(collection_id, owner_id)
    result = await session.execute(stmt)
    deleted_id = result.scalar_one_or_none()
    return deleted_id is not None
