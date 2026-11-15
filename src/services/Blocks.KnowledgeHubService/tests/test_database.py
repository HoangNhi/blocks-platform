import asyncio
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI, Request

from knowledgehub.database import (
    check_db_health,
    create_db_engine,
    create_session_factory,
    get_db_session,
)
from knowledgehub.main import lifespan


class TestDatabase(unittest.IsolatedAsyncioTestCase):
    def test_create_engine_and_factory(self):
        engine = create_db_engine("postgresql+asyncpg://dev:secret@localhost:5432/knowledgehub")
        self.assertIsNotNone(engine)
        factory = create_session_factory(engine)
        self.assertIsNotNone(factory)

    async def test_check_db_health_none_engine(self):
        result = await check_db_health(None)
        self.assertFalse(result)

    async def test_check_db_health_success(self):
        mock_engine = MagicMock()
        mock_conn = AsyncMock()
        mock_engine.connect.return_value.__aenter__.return_value = mock_conn

        result = await check_db_health(mock_engine, timeout=1.0)
        self.assertTrue(result)
        mock_conn.execute.assert_awaited_once()

    async def test_check_db_health_failure(self):
        mock_engine = MagicMock()
        mock_engine.connect.side_effect = RuntimeError("DB connection refused")

        result = await check_db_health(mock_engine, timeout=1.0)
        self.assertFalse(result)

    async def test_check_db_health_timeout(self):
        mock_engine = MagicMock()

        async def _hang():
            await asyncio.sleep(0.5)

        mock_conn = AsyncMock()
        mock_conn.execute = AsyncMock(side_effect=_hang)
        mock_engine.connect.return_value.__aenter__.return_value = mock_conn

        # Probe timeout 0.05s while execute takes 0.5s
        result = await check_db_health(mock_engine, timeout=0.05)
        self.assertFalse(result)

    async def test_get_db_session_success(self):
        mock_session = AsyncMock()
        mock_factory = MagicMock(return_value=mock_session)
        mock_session.__aenter__.return_value = mock_session

        mock_request = MagicMock(spec=Request)
        mock_request.app.state.db_session_factory = mock_factory

        gen = get_db_session(mock_request)
        session = await anext(gen)
        self.assertEqual(session, mock_session)

        # Normal completion (no exception)
        with self.assertRaises(StopAsyncIteration):
            await anext(gen)

        mock_session.rollback.assert_not_awaited()

    async def test_get_db_session_rollback_on_exception(self):
        mock_session = AsyncMock()
        mock_factory = MagicMock(return_value=mock_session)
        mock_session.__aenter__.return_value = mock_session

        mock_request = MagicMock(spec=Request)
        mock_request.app.state.db_session_factory = mock_factory

        gen = get_db_session(mock_request)
        session = await anext(gen)
        self.assertEqual(session, mock_session)

        with self.assertRaises(RuntimeError):
            await gen.athrow(RuntimeError("Transaction failed"))

        mock_session.rollback.assert_awaited_once()

    async def test_get_db_session_rollback_on_cancellation(self):
        mock_session = AsyncMock()
        mock_factory = MagicMock(return_value=mock_session)
        mock_session.__aenter__.return_value = mock_session

        mock_request = MagicMock(spec=Request)
        mock_request.app.state.db_session_factory = mock_factory

        gen = get_db_session(mock_request)
        session = await anext(gen)
        self.assertEqual(session, mock_session)

        with self.assertRaises(asyncio.CancelledError):
            await gen.athrow(asyncio.CancelledError())

        mock_session.rollback.assert_awaited_once()

    def test_session_factory_produces_independent_sessions(self):
        engine = create_db_engine("postgresql+asyncpg://dev:secret@localhost:5432/knowledgehub")
        factory = create_session_factory(engine)
        session1 = factory()
        session2 = factory()
        self.assertIsNot(session1, session2)

    async def test_lifespan_cleans_up_both_resources(self):
        test_app = FastAPI()

        mock_client = AsyncMock()
        mock_engine = AsyncMock()

        with (
            patch("knowledgehub.main.get_settings") as mock_settings,
            patch("knowledgehub.main.PermissionClient", return_value=mock_client),
            patch("knowledgehub.main.create_db_engine", return_value=mock_engine),
            patch("knowledgehub.main.create_session_factory", return_value=MagicMock()),
        ):
            mock_settings.return_value.database_url.get_secret_value.return_value = (
                "postgresql+asyncpg://dev:secret@localhost:5432/knowledgehub"
            )

            async with lifespan(test_app):
                self.assertEqual(test_app.state.permission_client, mock_client)
                self.assertEqual(test_app.state.db_engine, mock_engine)

            mock_client.close.assert_awaited_once()
            mock_engine.dispose.assert_awaited_once()
            self.assertIsNone(test_app.state.permission_client)
            self.assertIsNone(test_app.state.db_engine)
            self.assertIsNone(test_app.state.db_session_factory)
