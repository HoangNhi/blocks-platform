import tempfile
import time
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import httpx
import jwt
from fastapi import HTTPException
from pydantic import SecretStr

from knowledgehub.config import Settings
from knowledgehub.database import get_db_session
from knowledgehub.file_service import FilePreview, FinalizedFile, get_file_service_client
from knowledgehub.identity import get_settings
from knowledgehub.main import app
from knowledgehub.models import CollectionModel, DocumentModel
from knowledgehub.permission import get_permission_client


class TestDocumentEndpoints(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.ca_file = Path(self.temp_dir.name) / "ca.pem"
        fixture_ca = Path(__file__).resolve().parent / "fixtures" / "test_ca.pem"
        self.ca_file.write_text(fixture_ca.read_text(encoding="utf-8"), encoding="utf-8")
        self.secret = "12345678901234567890123456789012"
        self.mock_settings = Settings(
            _env_file=None,
            jwt_key=SecretStr(self.secret),
            jwt_issuer="BlocksStudio",
            jwt_audience="BlocksWeb",
            system_grpc_url="https://localhost:7073",
            system_grpc_ca_file=self.ca_file,
            file_grpc_url="https://localhost:7074",
            file_grpc_ca_file=self.ca_file,
            permission_timeout_seconds=3.0,
            database_url=SecretStr("postgresql+asyncpg://dev:secret@localhost:5432/knowledgehub"),
        )
        self.actor_a = uuid4()
        self.actor_b = uuid4()

        self.mock_perm = MagicMock()
        self.mock_file = MagicMock()
        self.mock_file.check_channel_health = AsyncMock(return_value=True)
        self.mock_session = AsyncMock()
        self.mock_session.commit = AsyncMock()
        self.mock_session.rollback = AsyncMock()
        self.mock_session.flush = AsyncMock()

        async def _override_db():
            yield self.mock_session

        app.dependency_overrides[get_settings] = lambda: self.mock_settings
        app.dependency_overrides[get_permission_client] = lambda: self.mock_perm
        app.dependency_overrides[get_file_service_client] = lambda: self.mock_file
        app.dependency_overrides[get_db_session] = _override_db
        self.settings_patcher = patch("knowledgehub.main.get_settings", return_value=self.mock_settings)
        self.settings_patcher.start()

    def tearDown(self):
        self.settings_patcher.stop()
        app.dependency_overrides.clear()
        self.temp_dir.cleanup()

    def _token(self, actor_id):
        now = int(time.time())
        return jwt.encode(
            {
                "name": str(actor_id),
                "unique_name": "user",
                "iss": "BlocksStudio",
                "aud": "BlocksWeb",
                "exp": now + 3600,
                "nbf": now - 10,
            },
            self.secret,
            algorithm="HS256",
        )

    def _doc_model(self, *, doc_id=None, col_id=None, status="REGISTERED"):
        now = datetime.now(timezone.utc)
        did = doc_id or uuid4()
        fid = uuid4()
        return DocumentModel(
            id=did,
            collection_id=col_id or uuid4(),
            upload_session_id=uuid4(),
            title="guide",
            original_filename="guide.pdf",
            file_extension=".pdf",
            content_type="application/pdf",
            declared_size_bytes=512,
            file_id=fid if status == "REGISTERED" else None,
            storage_key=f"KnowledgeHub/Documents/{did}/{fid}.pdf" if status == "REGISTERED" else None,
            size_bytes=512 if status == "REGISTERED" else None,
            source_sha256="a" * 64 if status == "REGISTERED" else None,
            registration_status=status,
            cleanup_status="NOT_REQUESTED",
            created_at=now,
            updated_at=now,
            registered_at=now if status == "REGISTERED" else None,
        )

    async def test_permission_codes_bound_for_add_view_delete(self):
        col_id = uuid4()
        doc_id = uuid4()
        self.mock_perm.check_permission = AsyncMock(return_value=False)
        self.mock_file.finalize_upload = AsyncMock()
        self.mock_file.preview_file = AsyncMock()
        self.mock_file.delete_file = AsyncMock()

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {self._token(self.actor_a)}"}
            r1 = await client.post(
                f"/api/knowledgehub/collections/{col_id}/documents/upload-intents",
                json={"UploadSessionId": str(uuid4()), "OriginalFileName": "a.pdf", "DeclaredSizeBytes": 100},
                headers=headers,
            )
            r2 = await client.post(f"/api/knowledgehub/documents/{doc_id}/finalize", headers=headers)
            r3 = await client.get(f"/api/knowledgehub/collections/{col_id}/documents", headers=headers)
            r4 = await client.get(f"/api/knowledgehub/documents/{doc_id}", headers=headers)
            r5 = await client.get(f"/api/knowledgehub/documents/{doc_id}/download", headers=headers)
            r6 = await client.delete(f"/api/knowledgehub/documents/{doc_id}", headers=headers)

        for resp in (r1, r2, r3, r4, r5, r6):
            self.assertEqual(resp.json()["StatusCode"], 403)

        actions = [c.args[2] for c in self.mock_perm.check_permission.await_args_list]
        self.assertEqual(actions, [2, 2, 1, 1, 1, 4])
        self.mock_file.finalize_upload.assert_not_called()
        self.mock_file.preview_file.assert_not_called()
        self.mock_file.delete_file.assert_not_called()

    async def test_foreign_actor_cannot_access_document_and_never_calls_fileservice(self):
        doc_id = uuid4()
        self.mock_perm.check_permission = AsyncMock(return_value=True)
        self.mock_file.finalize_upload = AsyncMock()
        self.mock_file.preview_file = AsyncMock()
        self.mock_file.delete_file = AsyncMock()

        with (
            patch("knowledgehub.document_routes.get_document_and_parent", AsyncMock(return_value=None)),
            patch("knowledgehub.document_routes.get_active_document", AsyncMock(return_value=None)),
            patch("knowledgehub.document_routes.soft_delete_document", AsyncMock(return_value=None)),
        ):
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                headers = {"Authorization": f"Bearer {self._token(self.actor_b)}"}
                for method, url in [
                    ("POST", f"/api/knowledgehub/documents/{doc_id}/finalize"),
                    ("GET", f"/api/knowledgehub/documents/{doc_id}"),
                    ("GET", f"/api/knowledgehub/documents/{doc_id}/download"),
                    ("DELETE", f"/api/knowledgehub/documents/{doc_id}"),
                ]:
                    resp = await client.request(method, url, headers=headers)
                    self.assertEqual(resp.json()["StatusCode"], 404)

        self.mock_file.finalize_upload.assert_not_called()
        self.mock_file.preview_file.assert_not_called()
        self.mock_file.delete_file.assert_not_called()

    async def test_finalize_commits_claim_before_grpc_and_commits_result_after(self):
        doc = self._doc_model(status="AWAITING_UPLOAD")
        col = CollectionModel(id=doc.collection_id, owner_id=self.actor_a, name="C", deleted_at=None)
        attempt_id = uuid4()
        events = []

        async def _commit():
            events.append("commit")

        async def _finalize(*args, **kwargs):
            events.append("grpc_finalize")
            return FinalizedFile(
                file_id=uuid4(),
                document_id=doc.id,
                storage_key=f"KnowledgeHub/Documents/{doc.id}/{uuid4()}.pdf",
                original_filename="guide.pdf",
                file_extension=".pdf",
                size_bytes=512,
                source_sha256="c" * 64,
            )

        self.mock_session.commit = AsyncMock(side_effect=_commit)
        self.mock_perm.check_permission = AsyncMock(return_value=True)
        self.mock_file.finalize_upload = AsyncMock(side_effect=_finalize)

        registered_doc = self._doc_model(doc_id=doc.id, col_id=doc.collection_id, status="REGISTERED")
        with (
            patch("knowledgehub.document_routes.get_document_and_parent", AsyncMock(return_value=(doc, col))),
            patch("knowledgehub.document_routes.claim_registration", AsyncMock(return_value=(doc, attempt_id))),
            patch("knowledgehub.document_routes.commit_finalized_reference", AsyncMock(return_value=registered_doc)),
        ):
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    f"/api/knowledgehub/documents/{doc.id}/finalize",
                    headers={"Authorization": f"Bearer {self._token(self.actor_a)}"},
                )

        self.assertEqual(resp.json()["StatusCode"], 200)
        self.assertEqual(events, ["commit", "grpc_finalize", "commit"])

    async def test_finalize_timeout_marks_failed_and_does_not_return_success(self):
        doc = self._doc_model(status="AWAITING_UPLOAD")
        col = CollectionModel(id=doc.collection_id, owner_id=self.actor_a, name="C", deleted_at=None)
        attempt_id = uuid4()

        self.mock_perm.check_permission = AsyncMock(return_value=True)
        self.mock_file.finalize_upload = AsyncMock(
            side_effect=HTTPException(status_code=503, detail="FileService xử lý quá thời gian")
        )
        mock_mark_failed = AsyncMock(return_value=True)

        with (
            patch("knowledgehub.document_routes.get_document_and_parent", AsyncMock(return_value=(doc, col))),
            patch("knowledgehub.document_routes.claim_registration", AsyncMock(return_value=(doc, attempt_id))),
            patch("knowledgehub.document_routes.mark_registration_failed", mock_mark_failed),
        ):
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    f"/api/knowledgehub/documents/{doc.id}/finalize",
                    headers={"Authorization": f"Bearer {self._token(self.actor_a)}"},
                )

        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.json()["Success"])
        self.assertEqual(resp.json()["StatusCode"], 503)
        mock_mark_failed.assert_awaited_once_with(
            self.mock_session, doc.id, attempt_id, "FILESERVICE_503"
        )

    async def test_download_returns_bytes_and_security_headers(self):
        doc = self._doc_model(status="REGISTERED")
        self.mock_perm.check_permission = AsyncMock(return_value=True)
        self.mock_file.preview_file = AsyncMock(
            return_value=FilePreview(
                content=b"%PDF-1.4\nhello",
                file_name="guide.pdf",
                content_type="application/pdf",
            )
        )

        with patch("knowledgehub.document_routes.get_active_document", AsyncMock(return_value=doc)):
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get(
                    f"/api/knowledgehub/documents/{doc.id}/download",
                    headers={"Authorization": f"Bearer {self._token(self.actor_a)}"},
                )

        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.content, b"%PDF-1.4\nhello")
        self.assertIn("attachment; filename*=UTF-8''guide.pdf", resp.headers["content-disposition"])
        self.assertEqual(resp.headers["cache-control"], "private, no-store")
        self.assertEqual(resp.headers["x-content-type-options"], "nosniff")

    async def test_delete_commits_logical_deletion_before_delete_data_and_handles_cleanup_failure(self):
        doc = self._doc_model(status="REGISTERED")
        events = []

        async def _commit():
            events.append("commit")

        async def _delete_file(*args, **kwargs):
            events.append("grpc_delete")
            raise RuntimeError("FileService down")

        self.mock_session.commit = AsyncMock(side_effect=_commit)
        self.mock_perm.check_permission = AsyncMock(return_value=True)
        self.mock_file.delete_file = AsyncMock(side_effect=_delete_file)
        mock_update_cleanup = AsyncMock(return_value=True)

        with (
            patch("knowledgehub.document_routes.soft_delete_document", AsyncMock(return_value=doc)),
            patch("knowledgehub.document_routes.update_cleanup_status", mock_update_cleanup),
        ):
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.delete(
                    f"/api/knowledgehub/documents/{doc.id}",
                    headers={"Authorization": f"Bearer {self._token(self.actor_a)}"},
                )

        body = resp.json()
        self.assertTrue(body["Success"])
        self.assertEqual(body["Data"]["Id"], str(doc.id))
        self.assertEqual(body["Data"]["CleanupStatus"], "FAILED")
        self.assertEqual(events, ["commit", "grpc_delete", "commit"])
        mock_update_cleanup.assert_awaited_once_with(self.mock_session, doc.id, "FAILED")

    async def test_collection_delete_and_finalize_race_outcomes(self):
        doc = self._doc_model(status="AWAITING_UPLOAD")
        self.mock_perm.check_permission = AsyncMock(return_value=True)

        # Outcome 1: collection deleted before gRPC -> BLOCKED_PARENT_DELETED + 404, no FileService call
        deleted_col = CollectionModel(
            id=doc.collection_id,
            owner_id=self.actor_a,
            name="Deleted",
            deleted_at=datetime.now(timezone.utc),
        )
        self.mock_file.finalize_upload = AsyncMock()
        with patch("knowledgehub.document_routes.get_document_and_parent", AsyncMock(return_value=(doc, deleted_col))):
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                r1 = await client.post(
                    f"/api/knowledgehub/documents/{doc.id}/finalize",
                    headers={"Authorization": f"Bearer {self._token(self.actor_a)}"},
                )
        self.assertEqual(r1.json()["StatusCode"], 404)
        self.assertEqual(doc.registration_status, "BLOCKED_PARENT_DELETED")
        self.mock_file.finalize_upload.assert_not_called()

        # Outcome 2: collection deleted during gRPC -> PARENT_DELETED_RETAINED + 404
        active_col = CollectionModel(id=doc.collection_id, owner_id=self.actor_a, name="Active", deleted_at=None)
        retained_doc = self._doc_model(doc_id=doc.id, col_id=doc.collection_id, status="PARENT_DELETED_RETAINED")
        self.mock_file.finalize_upload = AsyncMock(return_value=SimpleNamespace())
        with (
            patch("knowledgehub.document_routes.get_document_and_parent", AsyncMock(return_value=(doc, active_col))),
            patch("knowledgehub.document_routes.claim_registration", AsyncMock(return_value=(doc, uuid4()))),
            patch("knowledgehub.document_routes.commit_finalized_reference", AsyncMock(return_value=retained_doc)),
        ):
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                r2 = await client.post(
                    f"/api/knowledgehub/documents/{doc.id}/finalize",
                    headers={"Authorization": f"Bearer {self._token(self.actor_a)}"},
                )
        self.assertEqual(r2.json()["StatusCode"], 404)

    async def test_health_depends_on_file_service_and_alive_does_not(self):
        self.mock_perm.check_channel_health = AsyncMock(return_value=True)
        self.mock_file.check_channel_health = AsyncMock(return_value=False)

        with patch("knowledgehub.main.check_db_health", AsyncMock(return_value=True)):
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                r_health = await client.get("/health")
                r_alive = await client.get("/alive")

        self.assertEqual(r_health.status_code, 503)
        self.assertEqual(r_alive.status_code, 200)


if __name__ == "__main__":
    unittest.main()
