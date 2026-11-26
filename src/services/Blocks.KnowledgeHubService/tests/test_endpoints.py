from datetime import datetime, timezone
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import httpx
import jwt
from pydantic import SecretStr
from sqlalchemy.exc import OperationalError

from knowledgehub.config import Settings
from knowledgehub.database import get_db_session
from knowledgehub.file_service import get_file_service_client
from knowledgehub.identity import get_settings
from knowledgehub.main import app
from knowledgehub.models import CollectionModel
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
            file_grpc_url="https://localhost:7074",
            file_grpc_ca_file=self.ca_file,
            permission_timeout_seconds=3.0,
            database_url=SecretStr("postgresql+asyncpg://dev:secret@localhost:5432/knowledgehub"),
        )
        self.mock_client = MagicMock()
        self.mock_file_service = MagicMock()
        self.mock_file_service.check_channel_health = AsyncMock(return_value=True)
        self.actor_id = uuid4()

        self.mock_session = AsyncMock()
        self.mock_session.commit = AsyncMock()
        self.mock_session.rollback = AsyncMock()
        self.mock_session.flush = AsyncMock()
        self.mock_session.add = MagicMock()
        self.mock_session.execute = AsyncMock(return_value=MagicMock(all=MagicMock(return_value=[])))

        async def _override_get_db_session():
            yield self.mock_session

        app.dependency_overrides[get_settings] = lambda: self.mock_settings
        app.dependency_overrides[get_permission_client] = lambda: self.mock_client
        app.dependency_overrides[get_file_service_client] = lambda: self.mock_file_service
        app.dependency_overrides[get_db_session] = _override_get_db_session
        self.settings_patcher = patch("knowledgehub.main.get_settings", return_value=self.mock_settings)
        self.settings_patcher.start()
        self.db_health_patcher = patch("knowledgehub.main.check_db_health", new_callable=AsyncMock, return_value=True)
        self.mock_check_db_health = self.db_health_patcher.start()

    def tearDown(self):
        self.db_health_patcher.stop()
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

    def _make_collection_model(
        self,
        col_id=None,
        name="Test Collection",
        description="Test Description",
    ):
        now = datetime(2026, 11, 15, 10, 0, 0, tzinfo=timezone.utc)
        return CollectionModel(
            id=col_id or uuid4(),
            owner_id=self.actor_id,
            name=name,
            description=description,
            created_at=now,
            updated_at=now,
        )

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
        # Case 1: RPC channel unhealthy
        self.mock_client.check_channel_health = AsyncMock(return_value=False)
        self.mock_check_db_health.return_value = True
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/health")
            self.assertEqual(resp.status_code, 503)
            self.assertEqual(resp.json(), {"status": "unhealthy"})

        # Case 2: DB probe unhealthy
        self.mock_client.check_channel_health = AsyncMock(return_value=True)
        self.mock_check_db_health.return_value = False
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

        with (
            patch("knowledgehub.main.PermissionClient", FakeClient),
            patch("knowledgehub.main.FileServiceClient", lambda s: AsyncMock()),
        ):
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

    # -------------------------------------------------------------------------
    # Route 1: GET /api/knowledgehub/collections (VIEW, Action 1)
    # -------------------------------------------------------------------------
    async def test_list_collections_success(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=True)

        col1 = self._make_collection_model(name="Col 1", description="Desc 1")
        col2 = self._make_collection_model(name="Col 2", description=None)

        with patch("knowledgehub.main.list_collections", new_callable=AsyncMock) as mock_list:
            mock_list.return_value = ([col1, col2], 2)
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get(
                    "/api/knowledgehub/collections?page_index=1&page_size=50",
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.assertEqual(resp.status_code, 200)
                body = resp.json()
                self.assertTrue(body["Success"])
                self.assertEqual(body["StatusCode"], 200)
                self.assertIsNone(body["Message"])

                data = body["Data"]
                self.assertEqual(data["PageIndex"], 1)
                self.assertEqual(data["PageSize"], 50)
                self.assertEqual(data["TotalRow"], 2)
                self.assertEqual(len(data["Data"]), 2)

                item1 = data["Data"][0]
                self.assertEqual(item1["Id"], str(col1.id))
                self.assertEqual(item1["Name"], "Col 1")
                self.assertEqual(item1["Description"], "Desc 1")
                self.assertEqual(item1["DocumentCount"], 0)
                self.assertIn("T", item1["CreatedAt"])
                self.assertIn("T", item1["UpdatedAt"])

            mock_list.assert_called_once_with(self.mock_session, self.actor_id, 1, 50)
            self.mock_session.commit.assert_not_called()

    async def test_list_collections_permission_action_view_bound(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=True)

        with patch("knowledgehub.main.list_collections", new_callable=AsyncMock) as mock_list:
            mock_list.return_value = ([], 0)
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get(
                    "/api/knowledgehub/collections?controller=admin&action=999&actor_id=00000000-0000-0000-0000-000000000000",
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.assertEqual(resp.status_code, 200)
                body = resp.json()
                self.assertEqual(body["StatusCode"], 200)

            self.mock_client.check_permission.assert_called_once()
            user_arg, controller_arg, action_arg = self.mock_client.check_permission.call_args[0]
            self.assertEqual(user_arg.actor_id, self.actor_id)
            self.assertEqual(controller_arg, "knowledgehub")
            self.assertEqual(action_arg, 1)

    async def test_list_collections_permission_denied_403_never_calls_db(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=False)

        with patch("knowledgehub.main.list_collections", new_callable=AsyncMock) as mock_list:
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get(
                    "/api/knowledgehub/collections",
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.assertEqual(resp.status_code, 200)
                body = resp.json()
                self.assertFalse(body["Success"])
                self.assertEqual(body["StatusCode"], 403)
                self.assertEqual(body["Message"], "Bạn không có quyền truy cập")
                self.assertIsNone(body["Data"])

            mock_list.assert_not_called()
            self.mock_session.commit.assert_not_called()

    async def test_list_collections_invalid_paging_returns_400(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=True)

        bad_queries = [
            "?page_index=0",
            "?page_index=-1",
            "?page_index=abc",
            "?page_size=0",
            "?page_size=101",
            "?page_size=xyz",
        ]

        with patch("knowledgehub.main.list_collections", new_callable=AsyncMock) as mock_list:
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                for q in bad_queries:
                    with self.subTest(query=q):
                        resp = await client.get(
                            f"/api/knowledgehub/collections{q}",
                            headers={"Authorization": f"Bearer {token}"},
                        )
                        self.assertEqual(resp.status_code, 200)
                        body = resp.json()
                        self.assertFalse(body["Success"])
                        self.assertEqual(body["StatusCode"], 400)
                        self.assertEqual(body["Message"], "Dữ liệu yêu cầu không hợp lệ")

            mock_list.assert_not_called()
            self.mock_session.commit.assert_not_called()

    async def test_list_collections_beyond_last_page_returns_empty_data(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=True)

        with patch("knowledgehub.main.list_collections", new_callable=AsyncMock) as mock_list:
            mock_list.return_value = ([], 10)  # Total 10 rows in DB, but page 999 has 0 rows
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get(
                    "/api/knowledgehub/collections?page_index=999&page_size=50",
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.assertEqual(resp.status_code, 200)
                body = resp.json()
                self.assertTrue(body["Success"])
                self.assertEqual(body["StatusCode"], 200)

                data = body["Data"]
                self.assertEqual(data["Data"], [])
                self.assertEqual(data["TotalRow"], 10)
                self.assertEqual(data["PageIndex"], 999)
                self.assertEqual(data["PageSize"], 50)

            mock_list.assert_called_once_with(self.mock_session, self.actor_id, 999, 50)
            self.mock_session.commit.assert_not_called()

    async def test_db_outage_returns_envelope_503(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=True)

        with patch("knowledgehub.main.list_collections", new_callable=AsyncMock) as mock_list:
            mock_list.side_effect = OperationalError("SELECT 1", {}, Exception("Database offline"))
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get(
                    "/api/knowledgehub/collections",
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.assertEqual(resp.status_code, 200)
                body = resp.json()
                self.assertFalse(body["Success"])
                self.assertEqual(body["StatusCode"], 503)
                self.assertEqual(body["Message"], "Dịch vụ cơ sở dữ liệu tạm thời không khả dụng")

            self.mock_session.commit.assert_not_called()

    # -------------------------------------------------------------------------
    # Route 2: GET /api/knowledgehub/collections/{id} (VIEW, Action 1)
    # -------------------------------------------------------------------------
    async def test_get_collection_success(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=True)
        col_id = uuid4()
        fake_col = self._make_collection_model(
            col_id=col_id, name="Test Detail", description="Detail Desc"
        )

        with patch("knowledgehub.main.get_collection", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = fake_col
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get(
                    f"/api/knowledgehub/collections/{col_id}",
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.assertEqual(resp.status_code, 200)
                body = resp.json()
                self.assertTrue(body["Success"])
                self.assertEqual(body["StatusCode"], 200)
                data = body["Data"]
                self.assertEqual(data["Id"], str(col_id))
                self.assertEqual(data["Name"], "Test Detail")
                self.assertEqual(data["Description"], "Detail Desc")
                self.assertEqual(data["DocumentCount"], 0)

            mock_get.assert_called_once_with(self.mock_session, col_id, self.actor_id)
            self.mock_session.commit.assert_not_called()

    async def test_get_collection_permission_action_view_bound(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=True)
        col_id = uuid4()

        with patch("knowledgehub.main.get_collection", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = self._make_collection_model(col_id=col_id)
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get(
                    f"/api/knowledgehub/collections/{col_id}?controller=admin&action=999",
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.assertEqual(resp.status_code, 200)

            self.mock_client.check_permission.assert_called_once()
            user_arg, controller_arg, action_arg = self.mock_client.check_permission.call_args[0]
            self.assertEqual(user_arg.actor_id, self.actor_id)
            self.assertEqual(controller_arg, "knowledgehub")
            self.assertEqual(action_arg, 1)

    async def test_get_collection_permission_denied_403_never_calls_db(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=False)
        col_id = uuid4()

        with patch("knowledgehub.main.get_collection", new_callable=AsyncMock) as mock_get:
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get(
                    f"/api/knowledgehub/collections/{col_id}",
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.assertEqual(resp.status_code, 200)
                body = resp.json()
                self.assertFalse(body["Success"])
                self.assertEqual(body["StatusCode"], 403)
                self.assertEqual(body["Message"], "Bạn không có quyền truy cập")

            mock_get.assert_not_called()
            self.mock_session.commit.assert_not_called()

    async def test_get_collection_invalid_uuid_returns_400(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=True)

        with patch("knowledgehub.main.get_collection", new_callable=AsyncMock) as mock_get:
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get(
                    "/api/knowledgehub/collections/not-a-valid-uuid",
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.assertEqual(resp.status_code, 200)
                body = resp.json()
                self.assertFalse(body["Success"])
                self.assertEqual(body["StatusCode"], 400)
                self.assertEqual(body["Message"], "Mã định danh không hợp lệ")

            mock_get.assert_not_called()
            self.mock_session.commit.assert_not_called()

    async def test_get_collection_zero_uuid_returns_400(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=True)
        zero_uuid = "00000000-0000-0000-0000-000000000000"

        with patch("knowledgehub.main.get_collection", new_callable=AsyncMock) as mock_get:
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get(
                    f"/api/knowledgehub/collections/{zero_uuid}",
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.assertEqual(resp.status_code, 200)
                body = resp.json()
                self.assertFalse(body["Success"])
                self.assertEqual(body["StatusCode"], 400)
                self.assertEqual(body["Message"], "Mã định danh không hợp lệ")

            mock_get.assert_not_called()
            self.mock_session.commit.assert_not_called()

    async def test_get_collection_not_found_or_foreign_or_deleted_returns_404(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=True)
        col_id = uuid4()

        with patch("knowledgehub.main.get_collection", new_callable=AsyncMock) as mock_get:
            mock_get.return_value = None
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.get(
                    f"/api/knowledgehub/collections/{col_id}",
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.assertEqual(resp.status_code, 200)
                body = resp.json()
                self.assertFalse(body["Success"])
                self.assertEqual(body["StatusCode"], 404)
                self.assertEqual(body["Message"], "Không tìm thấy tài nguyên")
                self.assertIsNone(body["Data"])

            mock_get.assert_called_once_with(self.mock_session, col_id, self.actor_id)
            self.mock_session.commit.assert_not_called()

    # -------------------------------------------------------------------------
    # Route 3: POST /api/knowledgehub/collections (ADD, Action 2)
    # -------------------------------------------------------------------------
    async def test_create_collection_success_and_commits(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=True)
        col_id = uuid4()
        fake_col = self._make_collection_model(
            col_id=col_id, name="Cloud Architecture", description="AWS & GCP"
        )

        with patch("knowledgehub.main.create_collection", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = fake_col
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/api/knowledgehub/collections",
                    json={"Name": "Cloud Architecture", "Description": "AWS & GCP"},
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.assertEqual(resp.status_code, 200)
                body = resp.json()
                self.assertTrue(body["Success"])
                self.assertEqual(body["StatusCode"], 200)
                data = body["Data"]
                self.assertEqual(data["Id"], str(col_id))
                self.assertEqual(data["Name"], "Cloud Architecture")
                self.assertEqual(data["Description"], "AWS & GCP")
                self.assertEqual(data["DocumentCount"], 0)

            mock_create.assert_called_once()
            args = mock_create.call_args[0]
            self.assertEqual(args[0], self.mock_session)
            self.assertEqual(args[1], self.actor_id)
            self.assertEqual(args[2].Name, "Cloud Architecture")
            self.assertEqual(args[2].Description, "AWS & GCP")
            self.mock_session.commit.assert_awaited_once()

    async def test_create_collection_omitted_description_success(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=True)

        with patch("knowledgehub.main.create_collection", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = self._make_collection_model(description=None)
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/api/knowledgehub/collections",
                    json={"Name": "Clean Code"},
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.assertEqual(resp.status_code, 200)
                body = resp.json()
                self.assertTrue(body["Success"])
                self.assertEqual(body["StatusCode"], 200)

            mock_create.assert_called_once()
            self.assertIsNone(mock_create.call_args[0][2].Description)
            self.mock_session.commit.assert_awaited_once()

    async def test_create_collection_permission_action_add_bound(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=True)

        with patch("knowledgehub.main.create_collection", new_callable=AsyncMock) as mock_create:
            mock_create.return_value = self._make_collection_model()
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/api/knowledgehub/collections?controller=admin&action=999",
                    json={"Name": "Test"},
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.assertEqual(resp.status_code, 200)

            self.mock_client.check_permission.assert_called_once()
            user_arg, controller_arg, action_arg = self.mock_client.check_permission.call_args[0]
            self.assertEqual(user_arg.actor_id, self.actor_id)
            self.assertEqual(controller_arg, "knowledgehub")
            self.assertEqual(action_arg, 2)

    async def test_create_collection_permission_denied_403_never_calls_db(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=False)

        with patch("knowledgehub.main.create_collection", new_callable=AsyncMock) as mock_create:
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.post(
                    "/api/knowledgehub/collections",
                    json={"Name": "Deep Learning"},
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.assertEqual(resp.status_code, 200)
                body = resp.json()
                self.assertFalse(body["Success"])
                self.assertEqual(body["StatusCode"], 403)
                self.assertEqual(body["Message"], "Bạn không có quyền truy cập")

            mock_create.assert_not_called()
            self.mock_session.commit.assert_not_called()

    async def test_create_collection_validation_failure_returns_400(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=True)

        bad_payloads = [
            {"Name": ""},  # empty
            {"Name": "   "},  # whitespace only
            {"Name": "a" * 201},  # >200 chars
            {"Name": "Bad\0Name"},  # NUL in name
            {"Name": "Good", "Description": "Bad\0Desc"},  # NUL in description
            {"Name": "Good", "Description": "d" * 2001},  # >2000 chars
            {"Name": "Good", "Id": str(uuid4())},  # forbidden extra field
            {"Name": "Good", "OwnerId": str(uuid4())},  # forbidden extra field
            {"Name": "Good", "DeletedAt": "2026-11-01T00:00:00Z"},  # forbidden extra field
        ]

        with patch("knowledgehub.main.create_collection", new_callable=AsyncMock) as mock_create:
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                for payload in bad_payloads:
                    with self.subTest(payload=payload):
                        resp = await client.post(
                            "/api/knowledgehub/collections",
                            json=payload,
                            headers={"Authorization": f"Bearer {token}"},
                        )
                        self.assertEqual(resp.status_code, 200)
                        body = resp.json()
                        self.assertFalse(body["Success"])
                        self.assertEqual(body["StatusCode"], 400)
                        self.assertEqual(body["Message"], "Dữ liệu yêu cầu không hợp lệ")

            mock_create.assert_not_called()
            self.mock_session.commit.assert_not_called()

    # -------------------------------------------------------------------------
    # Route 4: PUT /api/knowledgehub/collections/{id} (UPDATE, Action 3)
    # -------------------------------------------------------------------------
    async def test_update_collection_success_and_commits(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=True)
        col_id = uuid4()
        fake_col = self._make_collection_model(
            col_id=col_id, name="Updated Name", description="Updated Desc"
        )

        with patch("knowledgehub.main.update_collection", new_callable=AsyncMock) as mock_update:
            mock_update.return_value = fake_col
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.put(
                    f"/api/knowledgehub/collections/{col_id}",
                    json={"Name": "Updated Name", "Description": "Updated Desc"},
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.assertEqual(resp.status_code, 200)
                body = resp.json()
                self.assertTrue(body["Success"])
                self.assertEqual(body["StatusCode"], 200)
                data = body["Data"]
                self.assertEqual(data["Id"], str(col_id))
                self.assertEqual(data["Name"], "Updated Name")
                self.assertEqual(data["Description"], "Updated Desc")

            mock_update.assert_called_once()
            args = mock_update.call_args[0]
            self.assertEqual(args[0], self.mock_session)
            self.assertEqual(args[1], col_id)
            self.assertEqual(args[2], self.actor_id)
            self.assertEqual(args[3].Name, "Updated Name")
            self.assertEqual(args[3].Description, "Updated Desc")
            self.mock_session.commit.assert_awaited_once()

    async def test_update_collection_omitted_description_clears_it(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=True)
        col_id = uuid4()

        with patch("knowledgehub.main.update_collection", new_callable=AsyncMock) as mock_update:
            mock_update.return_value = self._make_collection_model(
                col_id=col_id, name="Updated Name", description=None
            )
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.put(
                    f"/api/knowledgehub/collections/{col_id}",
                    json={"Name": "Updated Name"},
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.assertEqual(resp.status_code, 200)
                body = resp.json()
                self.assertTrue(body["Success"])
                self.assertEqual(body["StatusCode"], 200)

            mock_update.assert_called_once()
            self.assertIsNone(mock_update.call_args[0][3].Description)
            self.mock_session.commit.assert_awaited_once()

    async def test_update_collection_permission_action_update_bound(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=True)
        col_id = uuid4()

        with patch("knowledgehub.main.update_collection", new_callable=AsyncMock) as mock_update:
            mock_update.return_value = self._make_collection_model(col_id=col_id)
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.put(
                    f"/api/knowledgehub/collections/{col_id}?controller=admin&action=999",
                    json={"Name": "Test"},
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.assertEqual(resp.status_code, 200)

            self.mock_client.check_permission.assert_called_once()
            user_arg, controller_arg, action_arg = self.mock_client.check_permission.call_args[0]
            self.assertEqual(user_arg.actor_id, self.actor_id)
            self.assertEqual(controller_arg, "knowledgehub")
            self.assertEqual(action_arg, 3)

    async def test_update_collection_permission_denied_403_never_calls_db(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=False)
        col_id = uuid4()

        with patch("knowledgehub.main.update_collection", new_callable=AsyncMock) as mock_update:
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.put(
                    f"/api/knowledgehub/collections/{col_id}",
                    json={"Name": "Test"},
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.assertEqual(resp.status_code, 200)
                body = resp.json()
                self.assertFalse(body["Success"])
                self.assertEqual(body["StatusCode"], 403)
                self.assertEqual(body["Message"], "Bạn không có quyền truy cập")

            mock_update.assert_not_called()
            self.mock_session.commit.assert_not_called()

    async def test_update_collection_invalid_uuid_returns_400(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=True)

        with patch("knowledgehub.main.update_collection", new_callable=AsyncMock) as mock_update:
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.put(
                    "/api/knowledgehub/collections/invalid-uuid",
                    json={"Name": "Valid Name"},
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.assertEqual(resp.status_code, 200)
                body = resp.json()
                self.assertFalse(body["Success"])
                self.assertEqual(body["StatusCode"], 400)
                self.assertEqual(body["Message"], "Mã định danh không hợp lệ")

            mock_update.assert_not_called()
            self.mock_session.commit.assert_not_called()

    async def test_update_collection_zero_uuid_returns_400(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=True)
        zero_uuid = "00000000-0000-0000-0000-000000000000"

        with patch("knowledgehub.main.update_collection", new_callable=AsyncMock) as mock_update:
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.put(
                    f"/api/knowledgehub/collections/{zero_uuid}",
                    json={"Name": "Valid Name"},
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.assertEqual(resp.status_code, 200)
                body = resp.json()
                self.assertFalse(body["Success"])
                self.assertEqual(body["StatusCode"], 400)
                self.assertEqual(body["Message"], "Mã định danh không hợp lệ")

            mock_update.assert_not_called()
            self.mock_session.commit.assert_not_called()

    async def test_update_collection_validation_failure_returns_400(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=True)
        col_id = uuid4()

        bad_payloads = [
            {"Name": ""},
            {"Name": "   "},
            {"Name": "Valid", "OwnerId": str(uuid4())},
            {"Name": "Valid", "Id": str(uuid4())},
            {"Name": "Valid", "DeletedAt": "2026-11-01T00:00:00Z"},
        ]

        with patch("knowledgehub.main.update_collection", new_callable=AsyncMock) as mock_update:
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                for payload in bad_payloads:
                    with self.subTest(payload=payload):
                        resp = await client.put(
                            f"/api/knowledgehub/collections/{col_id}",
                            json=payload,
                            headers={"Authorization": f"Bearer {token}"},
                        )
                        self.assertEqual(resp.status_code, 200)
                        body = resp.json()
                        self.assertFalse(body["Success"])
                        self.assertEqual(body["StatusCode"], 400)
                        self.assertEqual(body["Message"], "Dữ liệu yêu cầu không hợp lệ")

            mock_update.assert_not_called()
            self.mock_session.commit.assert_not_called()

    async def test_update_collection_not_found_or_foreign_or_deleted_returns_404(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=True)
        col_id = uuid4()

        with patch("knowledgehub.main.update_collection", new_callable=AsyncMock) as mock_update:
            mock_update.return_value = None
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.put(
                    f"/api/knowledgehub/collections/{col_id}",
                    json={"Name": "New Name"},
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.assertEqual(resp.status_code, 200)
                body = resp.json()
                self.assertFalse(body["Success"])
                self.assertEqual(body["StatusCode"], 404)
                self.assertEqual(body["Message"], "Không tìm thấy tài nguyên")

            mock_update.assert_called_once_with(self.mock_session, col_id, self.actor_id, unittest.mock.ANY)
            self.mock_session.commit.assert_not_called()

    # -------------------------------------------------------------------------
    # Route 5: DELETE /api/knowledgehub/collections/{id} (DELETE, Action 4)
    # -------------------------------------------------------------------------
    async def test_delete_collection_success_and_commits(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=True)
        col_id = uuid4()

        with patch("knowledgehub.main.soft_delete_collection", new_callable=AsyncMock) as mock_delete:
            mock_delete.return_value = True
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.delete(
                    f"/api/knowledgehub/collections/{col_id}",
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.assertEqual(resp.status_code, 200)
                body = resp.json()
                self.assertTrue(body["Success"])
                self.assertEqual(body["StatusCode"], 200)
                self.assertEqual(body["Data"], {"Id": str(col_id)})

            mock_delete.assert_called_once_with(self.mock_session, col_id, self.actor_id)
            self.mock_session.commit.assert_awaited_once()

    async def test_delete_collection_permission_action_delete_bound(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=True)
        col_id = uuid4()

        with patch("knowledgehub.main.soft_delete_collection", new_callable=AsyncMock) as mock_delete:
            mock_delete.return_value = True
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.delete(
                    f"/api/knowledgehub/collections/{col_id}?controller=admin&action=999",
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.assertEqual(resp.status_code, 200)

            self.mock_client.check_permission.assert_called_once()
            user_arg, controller_arg, action_arg = self.mock_client.check_permission.call_args[0]
            self.assertEqual(user_arg.actor_id, self.actor_id)
            self.assertEqual(controller_arg, "knowledgehub")
            self.assertEqual(action_arg, 4)

    async def test_delete_collection_permission_denied_403_never_calls_db(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=False)
        col_id = uuid4()

        with patch("knowledgehub.main.soft_delete_collection", new_callable=AsyncMock) as mock_delete:
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.delete(
                    f"/api/knowledgehub/collections/{col_id}",
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.assertEqual(resp.status_code, 200)
                body = resp.json()
                self.assertFalse(body["Success"])
                self.assertEqual(body["StatusCode"], 403)
                self.assertEqual(body["Message"], "Bạn không có quyền truy cập")

            mock_delete.assert_not_called()
            self.mock_session.commit.assert_not_called()

    async def test_delete_collection_invalid_uuid_returns_400(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=True)

        with patch("knowledgehub.main.soft_delete_collection", new_callable=AsyncMock) as mock_delete:
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.delete(
                    "/api/knowledgehub/collections/not-a-valid-uuid",
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.assertEqual(resp.status_code, 200)
                body = resp.json()
                self.assertFalse(body["Success"])
                self.assertEqual(body["StatusCode"], 400)
                self.assertEqual(body["Message"], "Mã định danh không hợp lệ")

            mock_delete.assert_not_called()
            self.mock_session.commit.assert_not_called()

    async def test_delete_collection_zero_uuid_returns_400(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=True)
        zero_uuid = "00000000-0000-0000-0000-000000000000"

        with patch("knowledgehub.main.soft_delete_collection", new_callable=AsyncMock) as mock_delete:
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.delete(
                    f"/api/knowledgehub/collections/{zero_uuid}",
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.assertEqual(resp.status_code, 200)
                body = resp.json()
                self.assertFalse(body["Success"])
                self.assertEqual(body["StatusCode"], 400)
                self.assertEqual(body["Message"], "Mã định danh không hợp lệ")

            mock_delete.assert_not_called()
            self.mock_session.commit.assert_not_called()

    async def test_delete_collection_not_found_or_foreign_or_already_deleted_returns_404(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=True)
        col_id = uuid4()

        with patch("knowledgehub.main.soft_delete_collection", new_callable=AsyncMock) as mock_delete:
            mock_delete.return_value = False
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                resp = await client.delete(
                    f"/api/knowledgehub/collections/{col_id}",
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.assertEqual(resp.status_code, 200)
                body = resp.json()
                self.assertFalse(body["Success"])
                self.assertEqual(body["StatusCode"], 404)
                self.assertEqual(body["Message"], "Không tìm thấy tài nguyên")

            mock_delete.assert_called_once_with(self.mock_session, col_id, self.actor_id)
            self.mock_session.commit.assert_not_called()

    # -------------------------------------------------------------------------
    # Integrity: Mutation Commits & Read Isolation
    # -------------------------------------------------------------------------
    async def test_read_endpoints_never_commit_session(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=True)
        col_id = uuid4()

        with (
            patch("knowledgehub.main.list_collections", new_callable=AsyncMock) as mock_list,
            patch("knowledgehub.main.get_collection", new_callable=AsyncMock) as mock_get,
        ):
            mock_list.return_value = ([], 0)
            mock_get.return_value = self._make_collection_model(col_id=col_id)
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                # GET list
                resp1 = await client.get(
                    "/api/knowledgehub/collections",
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.assertEqual(resp1.status_code, 200)
                self.mock_session.commit.assert_not_called()

                # GET detail
                resp2 = await client.get(
                    f"/api/knowledgehub/collections/{col_id}",
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.assertEqual(resp2.status_code, 200)
                self.mock_session.commit.assert_not_called()

    async def test_failed_mutations_never_commit_session(self):
        token = self._make_token(self.actor_id)
        self.mock_client.check_permission = AsyncMock(return_value=True)

        with (
            patch("knowledgehub.main.create_collection", new_callable=AsyncMock) as mock_create,
            patch("knowledgehub.main.update_collection", new_callable=AsyncMock) as mock_update,
            patch("knowledgehub.main.soft_delete_collection", new_callable=AsyncMock) as mock_delete,
        ):
            mock_update.return_value = None  # 404
            mock_delete.return_value = False  # 404
            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                # 400 on POST
                await client.post(
                    "/api/knowledgehub/collections",
                    json={"Name": ""},
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.mock_session.commit.assert_not_called()

                # 404 on PUT
                await client.put(
                    f"/api/knowledgehub/collections/{uuid4()}",
                    json={"Name": "Test"},
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.mock_session.commit.assert_not_called()

                # 404 on DELETE
                await client.delete(
                    f"/api/knowledgehub/collections/{uuid4()}",
                    headers={"Authorization": f"Bearer {token}"},
                )
                self.mock_session.commit.assert_not_called()


if __name__ == "__main__":
    unittest.main()
