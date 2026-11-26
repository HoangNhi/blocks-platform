from datetime import datetime, timezone
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

from knowledgehub.documents import (
    build_count_documents_query,
    build_get_active_document_query,
    build_list_documents_query,
    commit_finalized_reference,
    create_upload_intent,
    get_active_document_counts,
    soft_delete_document,
)
from knowledgehub.models import DocumentModel
from knowledgehub.schemas import DocumentUploadIntentRequest


def _compile_pg(stmt) -> str:
    return str(
        stmt.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    )


class TestDocumentsSQLAndRepository(unittest.IsolatedAsyncioTestCase):
    def test_document_queries_join_active_collection_and_filter_owner_and_deleted(self):
        actor_id = uuid4()
        col_id = uuid4()
        doc_id = uuid4()

        detail_sql = _compile_pg(build_get_active_document_query(doc_id, actor_id))
        self.assertIn("JOIN public.collections", detail_sql)
        self.assertIn("public.collections.owner_id =", detail_sql)
        self.assertIn("public.collections.deleted_at IS NULL", detail_sql)
        self.assertIn("public.documents.deleted_at IS NULL", detail_sql)

        list_sql = _compile_pg(
            build_list_documents_query(actor_id, col_id, page_index=1, page_size=20)
        )
        self.assertIn("JOIN public.collections", list_sql)
        self.assertIn("public.collections.owner_id =", list_sql)
        self.assertIn("public.collections.deleted_at IS NULL", list_sql)
        self.assertIn("public.documents.deleted_at IS NULL", list_sql)
        self.assertIn("ORDER BY public.documents.created_at DESC, public.documents.id DESC", list_sql)

        count_sql = _compile_pg(build_count_documents_query(actor_id, col_id))
        self.assertIn("JOIN public.collections", count_sql)
        self.assertIn("public.collections.owner_id =", count_sql)
        self.assertIn("public.collections.deleted_at IS NULL", count_sql)
        self.assertIn("public.documents.deleted_at IS NULL", count_sql)

    def test_search_escapes_percent_underscore_and_backslash(self):
        actor_id = uuid4()
        col_id = uuid4()
        sql = _compile_pg(
            build_list_documents_query(
                actor_id,
                col_id,
                page_index=1,
                page_size=20,
                query_text=r"100%_test\v1",
            )
        )
        self.assertIn(r"100\%%\_test\\v1", sql)
        self.assertIn("ESCAPE", sql)

    async def test_get_active_document_counts_filters_registered_and_active(self):
        actor_id = uuid4()
        col_id = uuid4()
        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(
            return_value=MagicMock(all=MagicMock(return_value=[(col_id, 3)]))
        )

        counts = await get_active_document_counts(mock_session, actor_id, [col_id])
        self.assertEqual(counts, {col_id: 3})

        compiled = _compile_pg(mock_session.execute.await_args.args[0])
        self.assertIn("public.documents.registration_status = 'REGISTERED'", compiled)
        self.assertIn("public.documents.deleted_at IS NULL", compiled)
        self.assertIn("public.collections.deleted_at IS NULL", compiled)
        self.assertIn("public.collections.owner_id =", compiled)

    async def test_upload_session_idempotency_and_conflict(self):
        actor_id = uuid4()
        col_id = uuid4()
        session_id = uuid4()
        req = DocumentUploadIntentRequest(
            UploadSessionId=session_id,
            OriginalFileName="spec.pdf",
            DeclaredSizeBytes=2048,
        )

        existing_doc = DocumentModel(
            id=uuid4(),
            collection_id=col_id,
            upload_session_id=session_id,
            title="spec",
            original_filename="spec.pdf",
            file_extension=".pdf",
            content_type="application/pdf",
            declared_size_bytes=2048,
            registration_status="AWAITING_UPLOAD",
            cleanup_status="NOT_REQUESTED",
        )

        mock_session = AsyncMock()
        # 1) collection lock returns collection; 2) insert returns None (conflict); 3) select existing returns existing_doc
        mock_session.scalar = AsyncMock(
            side_effect=[SimpleNamespace(id=col_id), None, existing_doc]
        )
        res = await create_upload_intent(mock_session, actor_id, col_id, req)
        self.assertIs(res, existing_doc)

        # Different metadata with same upload_session_id -> 409
        req_different = DocumentUploadIntentRequest(
            UploadSessionId=session_id,
            OriginalFileName="other.pdf",
            DeclaredSizeBytes=2048,
        )
        mock_session.scalar = AsyncMock(
            side_effect=[SimpleNamespace(id=col_id), None, existing_doc]
        )
        with self.assertRaises(HTTPException) as ctx:
            await create_upload_intent(mock_session, actor_id, col_id, req_different)
        self.assertEqual(ctx.exception.status_code, 409)

    async def test_stale_registration_attempt_id_does_not_overwrite_newer_attempt(self):
        doc_id = uuid4()
        actor_id = uuid4()
        stale_attempt_id = uuid4()
        newer_attempt_id = uuid4()
        doc = DocumentModel(
            id=doc_id,
            collection_id=uuid4(),
            upload_session_id=uuid4(),
            title="spec",
            original_filename="spec.pdf",
            file_extension=".pdf",
            content_type="application/pdf",
            declared_size_bytes=100,
            registration_status="REGISTERING",
            cleanup_status="NOT_REQUESTED",
            registration_attempt_id=newer_attempt_id,
        )
        col = SimpleNamespace(id=doc.collection_id, deleted_at=None)

        mock_session = AsyncMock()
        mock_session.execute = AsyncMock(
            return_value=MagicMock(one_or_none=MagicMock(return_value=(doc, col)))
        )
        finalized = SimpleNamespace(
            file_id=uuid4(),
            storage_key="KnowledgeHub/Documents/x/y.pdf",
            size_bytes=100,
            source_sha256="a" * 64,
        )

        res = await commit_finalized_reference(
            mock_session, doc_id, actor_id, stale_attempt_id, finalized
        )
        self.assertIsNone(res)
        self.assertEqual(doc.registration_attempt_id, newer_attempt_id)
        self.assertIsNone(doc.file_id)

    async def test_soft_delete_sets_deleted_at_and_pending_while_preserving_file_refs(self):
        doc_id = uuid4()
        actor_id = uuid4()
        file_id = uuid4()
        storage_key = f"KnowledgeHub/Documents/{doc_id}/{file_id}.pdf"
        sha = "b" * 64

        doc = DocumentModel(
            id=doc_id,
            collection_id=uuid4(),
            upload_session_id=uuid4(),
            title="spec",
            original_filename="spec.pdf",
            file_extension=".pdf",
            content_type="application/pdf",
            declared_size_bytes=100,
            file_id=file_id,
            storage_key=storage_key,
            size_bytes=100,
            source_sha256=sha,
            registration_status="REGISTERED",
            cleanup_status="NOT_REQUESTED",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        mock_session = AsyncMock()
        mock_session.scalar = AsyncMock(return_value=doc)

        deleted = await soft_delete_document(mock_session, doc_id, actor_id)
        self.assertIs(deleted, doc)
        self.assertIsNotNone(doc.deleted_at)
        self.assertEqual(doc.cleanup_status, "PENDING")
        self.assertEqual(doc.storage_key, storage_key)
        self.assertEqual(doc.file_id, file_id)
        self.assertEqual(doc.source_sha256, sha)


if __name__ == "__main__":
    unittest.main()
