import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import httpx
import jwt
from pydantic import SecretStr

from knowledgehub.config import Settings
from knowledgehub.identity import get_settings
from knowledgehub.main import app
from knowledgehub.permission import get_permission_client


class TestEndpoints(unittest.IsolatedAsyncioTestCase):
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
            permission_timeout_seconds=3.0,
        )
        self.mock_client = MagicMock()
        self.actor_id = uuid4()

        app.dependency_overrides[get_settings] = lambda: self.mock_settings
        app.dependency_overrides[get_permission_client] = lambda: self.mock_client
        self.settings_patcher = patch("knowledgehub.main.get_settings", return_value=self.mock_settings)
        self.settings_patcher.start()

    def tearDown(self):
        self.settings_patcher.stop()
        app.dependency_overrides.clear()
        self.temp_dir.cleanup()

    def _make_token(self, actor_id, expired=False, key=None):
        exp = int(time.time()) - 10 if expired else int(time.time()) + 3600
        payload = {
            "name": str(actor_id),
            "unique_name": "testuser",
            "iss": "BlocksStudio",
            "aud": "BlocksWeb",
            "exp": exp,
            "nbf": int(time.time()) - 10,
        }
        return jwt.encode(payload, key or self.secret, algorithm="HS256")

    async def test_alive_endpoint_returns_200(self):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/alive")
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.json(), {"status": "alive"})

    async def test_health_healthy_returns_200(self):
        self.mock_client.check_channel_health = AsyncMock(return_value=True)
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/health")
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(resp.json(), {"status": "healthy"})

    async def test_health_unhealthy_returns_503(self):
        self.mock_client.check_channel_health = AsyncMock(return_value=False)
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/health")
            self.assertEqual(resp.status_code, 503)
            self.assertEqual(resp.json(), {"status": "unhealthy"})

    async def test_identity_without_token_returns_envelope_401(self):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/knowledgehub/identity")
            self.assertEqual(resp.status_code, 200)
            body = resp.json()
            self.assertFalse(body["Success"])
            self.assertEqual(body["StatusCode"], 401)
            self.assertIsNone(body["Data"])
            self.assertEqual(body["Message"], "Xác thực không thành công")

    async def test_identity_with_valid_token_and_permission_returns_envelope_200(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=True)

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/knowledgehub/identity",
                headers={"Authorization": f"Bearer {token}"},
            )
            self.assertEqual(resp.status_code, 200)
            body = resp.json()
            self.assertTrue(body["Success"])
            self.assertEqual(body["StatusCode"], 200)
            self.assertEqual(body["Data"]["ActorId"], str(self.actor_id))
            self.assertIsNone(body["Message"])

    async def test_identity_with_valid_token_but_denied_returns_envelope_403(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=False)

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/api/knowledgehub/identity",
                headers={"Authorization": f"Bearer {token}"},
            )
            self.assertEqual(resp.status_code, 200)
            body = resp.json()
            self.assertFalse(body["Success"])
            self.assertEqual(body["StatusCode"], 403)
            self.assertIsNone(body["Data"])
            self.assertEqual(body["Message"], "Bạn không có quyền truy cập")

    async def test_invalid_tokens_never_call_permission(self):
        self.mock_client.check_permission = AsyncMock()
        transport = httpx.ASGITransport(app=app)
        bad_tokens = [
            "",  # missing
            "Bearer not.a.valid.jwt",  # malformed
            f"Bearer {self._make_token(self.actor_id, expired=True)}",  # expired
            f"Bearer {self._make_token(self.actor_id, key='wrong_key_123456789012345678901234')}",  # bad sig
        ]

        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            for token_header in bad_tokens:
                headers = {"Authorization": token_header} if token_header else {}
                resp = await client.get("/api/knowledgehub/identity", headers=headers)
                self.assertEqual(resp.status_code, 200)
                body = resp.json()
                self.assertFalse(body["Success"])
                self.assertEqual(body["StatusCode"], 401)
                self.assertEqual(body["Message"], "Xác thực không thành công")

        self.mock_client.check_permission.assert_not_called()

    async def test_actor_input_cannot_override_claim(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=True)

        forged_id = "00000000-0000-0000-0000-000000000000"
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                f"/api/knowledgehub/identity?actor_id={forged_id}&controller=other&action=999",
                headers={"Authorization": f"Bearer {token}"},
            )
            self.assertEqual(resp.status_code, 200)
            body = resp.json()
            self.assertEqual(body["Data"]["ActorId"], str(self.actor_id))

        self.mock_client.check_permission.assert_called_once()
        user_arg, controller_arg, action_arg = self.mock_client.check_permission.call_args[0]
        self.assertEqual(user_arg.actor_id, self.actor_id)
        self.assertEqual(controller_arg, "knowledgehub")
        self.assertEqual(action_arg, 1)

    async def test_lifespan_closes_on_error_and_recreates_client(self):
        created_clients = []

        class FakeClient:
            def __init__(self, s):
                self.closed = False
                created_clients.append(self)

            async def close(self):
                self.closed = True

        with patch("knowledgehub.main.PermissionClient", FakeClient):
            # First run: clean exit
            async with app.router.lifespan_context(app):
                self.assertEqual(len(created_clients), 1)
                self.assertFalse(created_clients[0].closed)
                self.assertIs(app.state.permission_client, created_clients[0])
            self.assertTrue(created_clients[0].closed)
            self.assertIsNone(app.state.permission_client)

            # Second run: exception inside lifespan
            try:
                async with app.router.lifespan_context(app):
                    self.assertEqual(len(created_clients), 2)
                    self.assertIsNot(created_clients[0], created_clients[1])
                    self.assertFalse(created_clients[1].closed)
                    raise RuntimeError("Simulated lifespan error")
            except RuntimeError:
                pass
            self.assertTrue(created_clients[1].closed)
            self.assertIsNone(app.state.permission_client)

    async def test_health_outage_recovery(self):
        self.mock_client.check_channel_health = AsyncMock(return_value=False)
        self.mock_client.check_permission = AsyncMock()
        transport = httpx.ASGITransport(app=app)

        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            # Outage state
            resp_health = await client.get("/health")
            self.assertEqual(resp_health.status_code, 503)
            resp_alive = await client.get("/alive")
            self.assertEqual(resp_alive.status_code, 200)

            # Recovery
            self.mock_client.check_channel_health = AsyncMock(return_value=True)
            resp_health_ok = await client.get("/health")
            self.assertEqual(resp_health_ok.status_code, 200)
            resp_alive_ok = await client.get("/alive")
            self.assertEqual(resp_alive_ok.status_code, 200)

        # No permission RPC was used for health/alive checks
        self.mock_client.check_permission.assert_not_called()

    async def test_docs_endpoints_disabled(self):
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            for path in ("/docs", "/redoc", "/openapi.json"):
                resp = await client.get(path)
                self.assertEqual(resp.status_code, 200)
                body = resp.json()
                self.assertEqual(body["StatusCode"], 404)


if __name__ == "__main__":
    unittest.main()
