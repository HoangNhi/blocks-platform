import unittest
from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

from sqlalchemy.dialects import postgresql

from knowledgehub.collections import (
    build_count_collections_query,
    build_get_collection_query,
    build_list_collections_query,
    build_soft_delete_collection_stmt,
    build_update_collection_stmt,
    create_collection,
    get_collection,
    list_collections,
    soft_delete_collection,
    update_collection,
)
from knowledgehub.models import CollectionModel
from knowledgehub.schemas import CollectionCreateRequest, CollectionUpdateRequest


class TestCollectionsSQL(unittest.TestCase):
    def setUp(self):
        self.dialect = postgresql.dialect()
        self.owner_id = uuid4()
        self.collection_id = uuid4()

    def test_get_collection_query_compilation(self):
        stmt = build_get_collection_query(self.collection_id, self.owner_id)
        compiled = stmt.compile(dialect=self.dialect)
        sql = str(compiled)

        self.assertIn("FROM public.collections", sql)
        self.assertIn("public.collections.id = ", sql)
        self.assertIn("public.collections.owner_id = ", sql)
        self.assertIn("public.collections.deleted_at IS NULL", sql)

    def test_list_collections_query_compilation(self):
        stmt = build_list_collections_query(self.owner_id, page_index=2, page_size=10)
        compiled = stmt.compile(dialect=self.dialect)
        sql = str(compiled)

        self.assertIn("FROM public.collections", sql)
        self.assertIn("public.collections.owner_id = ", sql)
        self.assertIn("public.collections.deleted_at IS NULL", sql)
        self.assertIn(
            "ORDER BY public.collections.created_at DESC, public.collections.id DESC",
            sql,
        )
        self.assertIn("LIMIT", sql)
        self.assertIn("OFFSET", sql)
        self.assertEqual(compiled.params["param_1"], 10)  # limit
        self.assertEqual(compiled.params["param_2"], 10)  # offset: (2-1)*10 = 10

    def test_count_collections_query_compilation(self):
        stmt = build_count_collections_query(self.owner_id)
        compiled = stmt.compile(dialect=self.dialect)
        sql = str(compiled)

        self.assertIn("count", sql.lower())
        self.assertIn("FROM public.collections", sql)
        self.assertIn("public.collections.owner_id = ", sql)
        self.assertIn("public.collections.deleted_at IS NULL", sql)

    def test_update_collection_stmt_compilation(self):
        stmt = build_update_collection_stmt(
            collection_id=self.collection_id,
            owner_id=self.owner_id,
            name="New Name",
            description="New Description",
        )
        compiled = stmt.compile(dialect=self.dialect)
        sql = str(compiled)

        self.assertTrue(sql.startswith("UPDATE public.collections SET"))
        self.assertIn("public.collections.id = ", sql)
        self.assertIn("public.collections.owner_id = ", sql)
        self.assertIn("public.collections.deleted_at IS NULL", sql)
        self.assertIn("RETURNING", sql)
        self.assertNotIn("DELETE", sql)

    def test_soft_delete_collection_stmt_compilation(self):
        stmt = build_soft_delete_collection_stmt(
            collection_id=self.collection_id,
            owner_id=self.owner_id,
        )
        compiled = stmt.compile(dialect=self.dialect)
        sql = str(compiled)

        self.assertTrue(sql.startswith("UPDATE public.collections SET"))
        self.assertIn("deleted_at=now()", sql.lower().replace(" ", ""))
        self.assertIn("public.collections.id = ", sql)
        self.assertIn("public.collections.owner_id = ", sql)
        self.assertIn("public.collections.deleted_at IS NULL", sql)
        self.assertIn("RETURNING public.collections.id", sql)
        self.assertNotIn("DELETE FROM", sql)


class TestCollectionsAsyncOperations(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.owner_id = uuid4()
        self.collection_id = uuid4()
        self.mock_session = AsyncMock()
        self.mock_session.add = MagicMock()

    async def test_create_collection(self):
        data = CollectionCreateRequest(
            Name="Kiến trúc Microservice",
            Description="Tài liệu phân tán",
        )

        collection = await create_collection(
            session=self.mock_session,
            owner_id=self.owner_id,
            data=data,
        )

        self.assertIsInstance(collection.id, UUID)
        self.assertNotEqual(collection.id, UUID("00000000-0000-0000-0000-000000000000"))
        self.assertEqual(collection.owner_id, self.owner_id)
        self.assertEqual(collection.name, "Kiến trúc Microservice")
        self.assertEqual(collection.description, "Tài liệu phân tán")

        self.mock_session.add.assert_called_once_with(collection)
        self.mock_session.flush.assert_awaited_once()

    async def test_get_collection_found(self):
        mock_result = MagicMock()
        fake_model = CollectionModel(
            id=self.collection_id,
            owner_id=self.owner_id,
            name="Found Collection",
        )
        mock_result.scalar_one_or_none.return_value = fake_model
        self.mock_session.execute.return_value = mock_result

        result = await get_collection(
            session=self.mock_session,
            collection_id=self.collection_id,
            owner_id=self.owner_id,
        )

        self.assertIsNotNone(result)
        self.assertEqual(result, fake_model)
        self.mock_session.execute.assert_awaited_once()

    async def test_get_collection_not_found(self):
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        self.mock_session.execute.return_value = mock_result

        result = await get_collection(
            session=self.mock_session,
            collection_id=self.collection_id,
            owner_id=self.owner_id,
        )

        self.assertIsNone(result)

    async def test_list_collections(self):
        mock_count_result = MagicMock()
        mock_count_result.scalar.return_value = 2

        mock_list_result = MagicMock()
        fake_items = [
            CollectionModel(id=uuid4(), owner_id=self.owner_id, name="Item 1"),
            CollectionModel(id=uuid4(), owner_id=self.owner_id, name="Item 2"),
        ]
        mock_list_result.scalars.return_value.all.return_value = fake_items

        self.mock_session.execute.side_effect = [mock_count_result, mock_list_result]

        items, total = await list_collections(
            session=self.mock_session,
            owner_id=self.owner_id,
            page_index=1,
            page_size=50,
        )

        self.assertEqual(total, 2)
        self.assertEqual(len(items), 2)
        self.assertEqual(items, fake_items)
        self.assertEqual(self.mock_session.execute.await_count, 2)

    async def test_update_collection_success(self):
        mock_result = MagicMock()
        fake_updated = CollectionModel(
            id=self.collection_id,
            owner_id=self.owner_id,
            name="Updated Name",
            description="Updated Desc",
        )
        mock_result.scalar_one_or_none.return_value = fake_updated
        self.mock_session.execute.return_value = mock_result

        data = CollectionUpdateRequest(
            Name="Updated Name",
            Description="Updated Desc",
        )
        result = await update_collection(
            session=self.mock_session,
            collection_id=self.collection_id,
            owner_id=self.owner_id,
            data=data,
        )

        self.assertIsNotNone(result)
        self.assertEqual(result, fake_updated)

    async def test_update_collection_not_found_or_deleted(self):
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        self.mock_session.execute.return_value = mock_result

        data = CollectionUpdateRequest(Name="Any Name")
        result = await update_collection(
            session=self.mock_session,
            collection_id=self.collection_id,
            owner_id=self.owner_id,
            data=data,
        )

        self.assertIsNone(result)

    async def test_soft_delete_collection_success(self):
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = self.collection_id
        self.mock_session.execute.return_value = mock_result

        success = await soft_delete_collection(
            session=self.mock_session,
            collection_id=self.collection_id,
            owner_id=self.owner_id,
        )

        self.assertTrue(success)

    async def test_soft_delete_collection_not_found_or_already_deleted(self):
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        self.mock_session.execute.return_value = mock_result

        success = await soft_delete_collection(
            session=self.mock_session,
            collection_id=self.collection_id,
            owner_id=self.owner_id,
        )

        self.assertFalse(success)

    async def test_list_collections_beyond_last_page_returns_empty_list(self):
        mock_count_result = MagicMock()
        mock_count_result.scalar.return_value = 5

        mock_list_result = MagicMock()
        mock_list_result.scalars.return_value.all.return_value = []

        self.mock_session.execute.side_effect = [mock_count_result, mock_list_result]

        items, total = await list_collections(
            session=self.mock_session,
            owner_id=self.owner_id,
            page_index=10,
            page_size=50,
        )

        self.assertEqual(total, 5)
        self.assertEqual(items, [])

    async def test_create_duplicate_name_collections_allowed(self):
        data = CollectionCreateRequest(Name="Trùng tên bộ sưu tập")
        col1 = await create_collection(self.mock_session, self.owner_id, data)
        col2 = await create_collection(self.mock_session, self.owner_id, data)

        self.assertNotEqual(col1.id, col2.id)
        self.assertEqual(col1.name, col2.name)
        self.assertEqual(col1.name, "Trùng tên bộ sưu tập")

    async def test_update_or_delete_race_no_resurrection(self):
        # Simulating concurrent soft-delete having happened right before update/delete:
        # Atomic statements include 'deleted_at IS NULL', so execute returns no rows.
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        self.mock_session.execute.return_value = mock_result

        # Update returns None (no row resurrected)
        res_update = await update_collection(
            session=self.mock_session,
            collection_id=self.collection_id,
            owner_id=self.owner_id,
            data=CollectionUpdateRequest(Name="Attempted Resurrection"),
        )
        self.assertIsNone(res_update)

        # Repeated delete returns False (cannot re-delete or fail uncleanly)
        res_delete = await soft_delete_collection(
            session=self.mock_session,
            collection_id=self.collection_id,
            owner_id=self.owner_id,
        )
        self.assertFalse(res_delete)
