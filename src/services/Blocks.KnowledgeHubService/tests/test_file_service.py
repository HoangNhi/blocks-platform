import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import grpc
from fastapi import HTTPException
from google.protobuf.wrappers_pb2 import DoubleValue
from pydantic import SecretStr

from knowledgehub.config import Settings
from knowledgehub.file_service import FileServiceClient
from knowledgehub.identity import AuthenticatedUser
from knowledgehub.rpc import file_pb2


class _FakeRpcError(grpc.RpcError):
    def __init__(self, code: grpc.StatusCode, details: str = "error"):
        super().__init__()
        self._code = code
        self._details = details

    def code(self) -> grpc.StatusCode:
        return self._code

    def details(self) -> str:
        return self._details


class TestFileServiceClient(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.ca_file = Path(self.temp_dir.name) / "ca.pem"
        fixture_ca = Path(__file__).resolve().parent / "fixtures" / "test_ca.pem"
        self.ca_file.write_text(fixture_ca.read_text(encoding="utf-8"), encoding="utf-8")
        self.settings = Settings(
            _env_file=None,
            jwt_key=SecretStr("12345678901234567890123456789012"),
            jwt_issuer="BlocksStudio",
            jwt_audience="BlocksWeb",
            system_grpc_url="https://localhost:7073",
            system_grpc_ca_file=self.ca_file,
            file_grpc_url="https://files.internal:7074",
            file_grpc_ca_file=self.ca_file,
            file_rpc_timeout_seconds=12.5,
            file_download_timeout_seconds=45.0,
            database_url=SecretStr("postgresql+asyncpg://dev:secret@localhost:5432/knowledgehub"),
        )
        self.user = AuthenticatedUser(
            actor_id=uuid4(),
            username="tester",
            token="user.jwt.token",
        )
        self.mock_stub = MagicMock()
        self.client = FileServiceClient(settings=self.settings, stub=self.mock_stub)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_secure_channel_created_from_https_host_port_and_ca(self):
        with (
            patch("knowledgehub.file_service.grpc.ssl_channel_credentials") as mock_creds,
            patch("knowledgehub.file_service.grpc.aio.secure_channel") as mock_channel,
            patch("knowledgehub.file_service.file_pb2_grpc.FileProtoStub") as mock_stub_cls,
        ):
            client = FileServiceClient(settings=self.settings)
            mock_creds.assert_called_once_with(root_certificates=self.ca_file.read_bytes())
            mock_channel.assert_called_once()
            target_arg = mock_channel.call_args.args[0]
            self.assertEqual(target_arg, "files.internal:7074")
            mock_stub_cls.assert_called_once()
            self.assertIsNotNone(client.channel)

    async def test_finalize_upload_sends_expected_request_metadata_and_timeout(self):
        doc_id = uuid4()
        session_id = uuid4()
        file_id = uuid4()
        sha = "a1" * 32
        storage_key = f"KnowledgeHub/Documents/{doc_id}/{file_id}.pdf"

        self.mock_stub.UploadData = AsyncMock(
            return_value=file_pb2.UploadDataResponse(
                attachments=[
                    file_pb2.ModelAttachmentProto(
                        id=str(file_id),
                        related_id=str(doc_id),
                        file_name="report",
                        file_extension=".pdf",
                        file_url=storage_key,
                        file_size=DoubleValue(value=1024.0),
                        source_sha256=sha,
                    )
                ]
            )
        )

        result = await self.client.finalize_upload(
            user=self.user,
            document_id=doc_id,
            upload_session_id=session_id,
            original_filename="report.pdf",
            file_extension=".pdf",
            declared_size_bytes=1024,
        )

        self.assertEqual(result.file_id, file_id)
        self.assertEqual(result.storage_key, storage_key)
        self.assertEqual(result.size_bytes, 1024)
        self.assertEqual(result.source_sha256, sha)

        call = self.mock_stub.UploadData.await_args
        req = call.args[0]
        self.assertEqual(req.related_id, str(doc_id))
        self.assertEqual(req.service_path, "KnowledgeHub")
        self.assertEqual(req.folder_name, "Documents")
        self.assertEqual(req.temp_folder, str(session_id))
        self.assertEqual(
            call.kwargs["metadata"],
            (("x-service-authorization", "Bearer user.jwt.token"),),
        )
        self.assertEqual(call.kwargs["timeout"], 12.5)

    async def test_preview_file_semaphore_serializes_requests(self):
        active = 0
        max_active = 0

        async def _slow_preview(request, metadata=None, timeout=None):
            nonlocal active, max_active
            active += 1
            max_active = max(max_active, active)
            await asyncio.sleep(0.03)
            active -= 1
            return file_pb2.PreviewFileResponse(
                file_content=b"pdf-bytes",
                file_name="doc.pdf",
                content_type="application/pdf",
            )

        self.mock_stub.PreviewFile = AsyncMock(side_effect=_slow_preview)
        await asyncio.gather(
            self.client.preview_file(self.user, "KnowledgeHub/Documents/a/b.pdf"),
            self.client.preview_file(self.user, "KnowledgeHub/Documents/a/c.pdf"),
        )
        self.assertEqual(max_active, 1)
        for call in self.mock_stub.PreviewFile.await_args_list:
            self.assertEqual(call.kwargs["timeout"], 12.5)
            self.assertEqual(
                call.kwargs["metadata"],
                (("x-service-authorization", "Bearer user.jwt.token"),),
            )

    async def test_finalize_upload_rejects_invalid_sha256_size_and_storage_key(self):
        doc_id = uuid4()
        session_id = uuid4()
        file_id = uuid4()
        valid_key = f"KnowledgeHub/Documents/{doc_id}/{file_id}.pdf"

        bad_cases = [
            ("bad_sha", valid_key, 1024.0, "not-hex"),
            ("fractional_size", valid_key, 1024.5, "a" * 64),
            ("mismatched_size", valid_key, 2048.0, "a" * 64),
            ("wrong_namespace", f"System/Attachments/{doc_id}/{file_id}.pdf", 1024.0, "a" * 64),
            ("wrong_doc_id", f"KnowledgeHub/Documents/{uuid4()}/{file_id}.pdf", 1024.0, "a" * 64),
            ("wrong_file_id", f"KnowledgeHub/Documents/{doc_id}/{uuid4()}.pdf", 1024.0, "a" * 64),
        ]

        for name, key, size_val, sha in bad_cases:
            with self.subTest(case=name):
                self.mock_stub.UploadData = AsyncMock(
                    return_value=file_pb2.UploadDataResponse(
                        attachments=[
                            file_pb2.ModelAttachmentProto(
                                id=str(file_id),
                                related_id=str(doc_id),
                                file_name="report",
                                file_extension=".pdf",
                                file_url=key,
                                file_size=DoubleValue(value=size_val),
                                source_sha256=sha,
                            )
                        ]
                    )
                )
                with self.assertRaises(HTTPException) as ctx:
                    await self.client.finalize_upload(
                        user=self.user,
                        document_id=doc_id,
                        upload_session_id=session_id,
                        original_filename="report.pdf",
                        file_extension=".pdf",
                        declared_size_bytes=1024,
                    )
                self.assertEqual(ctx.exception.status_code, 503)

    async def test_grpc_status_mapping(self):
        expected = [
            (grpc.StatusCode.UNAUTHENTICATED, 401),
            (grpc.StatusCode.PERMISSION_DENIED, 403),
            (grpc.StatusCode.NOT_FOUND, 404),
            (grpc.StatusCode.INVALID_ARGUMENT, 400),
            (grpc.StatusCode.FAILED_PRECONDITION, 409),
            (grpc.StatusCode.RESOURCE_EXHAUSTED, 413),
            (grpc.StatusCode.UNAVAILABLE, 503),
            (grpc.StatusCode.DEADLINE_EXCEEDED, 503),
        ]
        for code, http_status in expected:
            with self.subTest(grpc_code=code):
                self.mock_stub.DeleteData = AsyncMock(side_effect=_FakeRpcError(code))
                with self.assertRaises(HTTPException) as ctx:
                    await self.client.delete_file(self.user, "KnowledgeHub/Documents/a/b.pdf")
                self.assertEqual(ctx.exception.status_code, http_status)
                self.assertEqual(
                    self.mock_stub.DeleteData.await_args.kwargs["timeout"], 12.5
                )

    async def test_cancellation_propagates(self):
        self.mock_stub.UploadData = AsyncMock(side_effect=asyncio.CancelledError())
        with self.assertRaises(asyncio.CancelledError):
            await self.client.finalize_upload(
                user=self.user,
                document_id=uuid4(),
                upload_session_id=uuid4(),
                original_filename="a.pdf",
                file_extension=".pdf",
                declared_size_bytes=10,
            )


if __name__ == "__main__":
    unittest.main()
