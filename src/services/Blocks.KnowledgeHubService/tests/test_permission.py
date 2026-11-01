import asyncio
import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import grpc
from fastapi import HTTPException, Request
from pydantic import SecretStr

from knowledgehub.config import Settings
from knowledgehub.identity import AuthenticatedUser
from knowledgehub.permission import (
    PermissionClient,
    get_permission_client,
    require_permission,
)
from knowledgehub.rpc import system_pb2


class MockRpcError(grpc.RpcError):
    def __init__(self, code: grpc.StatusCode, details: str = ""):
        super().__init__()
        self._code = code
        self._details = details

    def code(self) -> grpc.StatusCode:
        return self._code

    def details(self) -> str:
        return self._details


class TestPermissionClient(unittest.IsolatedAsyncioTestCase):
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
            permission_timeout_seconds=3.0,
        )
        self.user = AuthenticatedUser(
            actor_id=uuid4(),
            username="testuser",
            token="valid.test.jwt.token",
        )
        self.mock_stub = MagicMock()
        self.client = PermissionClient(settings=self.settings, stub=self.mock_stub)

    def tearDown(self):
        self.temp_dir.cleanup()

    async def test_permission_granted_returns_true(self):
        self.mock_stub.CheckPermission = AsyncMock(
            return_value=system_pb2.CheckActionResponse(success=True)
        )
        result = await self.client.check_permission(self.user, "knowledgehub", 1)
        self.assertTrue(result)

    async def test_permission_denied_returns_false(self):
        self.mock_stub.CheckPermission = AsyncMock(
            return_value=system_pb2.CheckActionResponse(success=False)
        )
        result = await self.client.check_permission(self.user, "knowledgehub", 1)
        self.assertFalse(result)

    async def test_metadata_contain_x_service_authorization(self):
        self.mock_stub.CheckPermission = AsyncMock(
            return_value=system_pb2.CheckActionResponse(success=True)
        )
        await self.client.check_permission(self.user, "knowledgehub", 1)

        self.mock_stub.CheckPermission.assert_called_once()
        _, kwargs = self.mock_stub.CheckPermission.call_args
        metadata = kwargs.get("metadata")
        self.assertIsNotNone(metadata)
        expected_entry = ("x-service-authorization", f"Bearer {self.user.token}")
        self.assertIn(expected_entry, metadata)

        req = self.mock_stub.CheckPermission.call_args[0][0]
        self.assertEqual(req.user_id, str(self.user.actor_id))
        self.assertEqual(req.controller, "knowledgehub")
        self.assertEqual(req.action, 1)

    async def test_rpc_unavailable_maps_to_503(self):
        self.mock_stub.CheckPermission = AsyncMock(
            side_effect=MockRpcError(grpc.StatusCode.UNAVAILABLE, "Service down")
        )
        with self.assertRaises(HTTPException) as ctx:
            await self.client.check_permission(self.user, "knowledgehub", 1)
        self.assertEqual(ctx.exception.status_code, 503)
        self.assertEqual(ctx.exception.detail, "Dịch vụ xác thực quyền tạm thời không khả dụng")

    async def test_rpc_deadline_exceeded_maps_to_503(self):
        self.mock_stub.CheckPermission = AsyncMock(
            side_effect=MockRpcError(grpc.StatusCode.DEADLINE_EXCEEDED, "Timeout")
        )
        with self.assertRaises(HTTPException) as ctx:
            await self.client.check_permission(self.user, "knowledgehub", 1)
        self.assertEqual(ctx.exception.status_code, 503)
        self.assertEqual(ctx.exception.detail, "Dịch vụ xác thực quyền tạm thời không khả dụng")

    async def test_rpc_unauthenticated_maps_to_401(self):
        self.mock_stub.CheckPermission = AsyncMock(
            side_effect=MockRpcError(grpc.StatusCode.UNAUTHENTICATED, "Invalid token")
        )
        with self.assertRaises(HTTPException) as ctx:
            await self.client.check_permission(self.user, "knowledgehub", 1)
        self.assertEqual(ctx.exception.status_code, 401)
        self.assertEqual(ctx.exception.detail, "Xác thực không thành công")

    async def test_rpc_permission_denied_maps_to_403(self):
        self.mock_stub.CheckPermission = AsyncMock(
            side_effect=MockRpcError(grpc.StatusCode.PERMISSION_DENIED, "Access denied")
        )
        with self.assertRaises(HTTPException) as ctx:
            await self.client.check_permission(self.user, "knowledgehub", 1)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail, "Bạn không có quyền truy cập")

    async def test_rpc_internal_and_other_maps_to_503(self):
        for code in (grpc.StatusCode.INTERNAL, grpc.StatusCode.UNKNOWN):
            with self.subTest(code=code):
                self.mock_stub.CheckPermission = AsyncMock(
                    side_effect=MockRpcError(code, "Internal error")
                )
                with self.assertRaises(HTTPException) as ctx:
                    await self.client.check_permission(self.user, "knowledgehub", 1)
                self.assertEqual(ctx.exception.status_code, 503)
                self.assertEqual(ctx.exception.detail, "Dịch vụ xác thực quyền tạm thời không khả dụng")

    async def test_deadline_and_no_retry(self):
        self.mock_stub.CheckPermission = AsyncMock(
            side_effect=MockRpcError(grpc.StatusCode.UNAVAILABLE, "Unavailable")
        )
        with self.assertRaises(HTTPException):
            await self.client.check_permission(self.user, "knowledgehub", 1)
        self.assertEqual(self.mock_stub.CheckPermission.await_count, 1)
        _, kwargs = self.mock_stub.CheckPermission.call_args
        self.assertEqual(kwargs.get("timeout"), 3.0)

    async def test_cancellation_propagates(self):
        self.mock_stub.CheckPermission = AsyncMock(
            side_effect=asyncio.CancelledError()
        )
        with self.assertRaises(asyncio.CancelledError):
            await self.client.check_permission(self.user, "knowledgehub", 1)

    async def test_concurrent_metadata_isolated(self):
        calls = []

        async def fake_check(req, metadata=None, timeout=None):
            calls.append((req.user_id, metadata))
            await asyncio.sleep(0.01)
            return system_pb2.CheckActionResponse(success=True)

        self.mock_stub.CheckPermission = AsyncMock(side_effect=fake_check)

        user1 = AuthenticatedUser(actor_id=uuid4(), username="u1", token="tok1")
        user2 = AuthenticatedUser(actor_id=uuid4(), username="u2", token="tok2")

        res1, res2 = await asyncio.gather(
            self.client.check_permission(user1, "knowledgehub", 1),
            self.client.check_permission(user2, "knowledgehub", 1),
        )
        self.assertTrue(res1)
        self.assertTrue(res2)

        self.assertEqual(len(calls), 2)
        call1 = next(c for c in calls if c[0] == str(user1.actor_id))
        call2 = next(c for c in calls if c[0] == str(user2.actor_id))
        self.assertIn(("x-service-authorization", "Bearer tok1"), call1[1])
        self.assertIn(("x-service-authorization", "Bearer tok2"), call2[1])

    async def test_close_owned_channel(self):
        mock_channel = AsyncMock()
        client = PermissionClient(settings=self.settings, stub=self.mock_stub)
        client.channel = mock_channel
        client._owns_channel = True

        await client.close()
        mock_channel.close.assert_awaited_once()

    def test_tls_factory_uses_supplied_ca(self):
        with patch("grpc.ssl_channel_credentials") as mock_ssl_creds, \
             patch("grpc.aio.secure_channel") as mock_secure_channel:
            _ = PermissionClient(settings=self.settings)
            mock_ssl_creds.assert_called_once_with(root_certificates=self.ca_file.read_bytes())
            mock_secure_channel.assert_called_once_with(
                "localhost:7073",
                mock_ssl_creds.return_value,
            )

    async def test_require_permission_dependency_success(self):
        self.mock_stub.CheckPermission = AsyncMock(
            return_value=system_pb2.CheckActionResponse(success=True)
        )
        dep = require_permission("knowledgehub", 1)
        user_out = await dep(user=self.user, permission_client=self.client)
        self.assertEqual(user_out, self.user)

    async def test_require_permission_denied_raises_403(self):
        self.mock_stub.CheckPermission = AsyncMock(
            return_value=system_pb2.CheckActionResponse(success=False)
        )
        dep = require_permission("knowledgehub", 1)
        with self.assertRaises(HTTPException) as ctx:
            await dep(user=self.user, permission_client=self.client)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail, "Bạn không có quyền truy cập")


if __name__ == "__main__":
    unittest.main()
