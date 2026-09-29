from __future__ import annotations

import os
from uuid import UUID

import pytest
from sqlalchemy import event, text
from sqlalchemy.engine import Engine, make_url

from tradelab_api.db.models import Base
from tradelab_api.db.session import get_engine
from tradelab_api.core.authorization import FunctionalAuthorizationResult
from tradelab_api.main import app


@event.listens_for(Engine, "do_connect")
def require_disposable_database(_dialect, _connection_record, _args, params):
    if os.environ.get("TRADELAB_TEST_DATABASE_RESET", "false").lower() != "true" or params.get("dbname") != "tradelab_test":
        pytest.skip("Database tests require explicitly configured disposable tradelab_test target", allow_module_level=True)

def _truncate_test_database() -> None:
    database_url = make_url(os.environ["DATABASE_URL"])
    if database_url.database != "tradelab_test":
        raise RuntimeError("TRADELAB_TEST_DATABASE_RESET requires the tradelab_test database.")

    engine = get_engine()
    table_names = ", ".join(engine.dialect.identifier_preparer.quote(table.name) for table in Base.metadata.tables.values())
    with engine.begin() as connection:
        connection.execute(text(f"TRUNCATE TABLE {table_names} RESTART IDENTITY CASCADE"))


@pytest.fixture(autouse=True)
def isolate_postgresql_test():
    if os.environ.get("TRADELAB_TEST_DATABASE_RESET", "false").lower() != "true":
        yield
        return

    _truncate_test_database()
    yield


DEFAULT_TEST_WORKSPACE_ID = UUID("00000000-0000-0000-0000-000000000001")
DEFAULT_TEST_USER_ID = UUID("00000000-0000-0000-0000-000000000001")


class AllowAllAuthorizationClient:
    async def check(self, *_args: object, workspace_id: UUID | None = None, **_kwargs: object) -> FunctionalAuthorizationResult:
        ws_id = workspace_id or DEFAULT_TEST_WORKSPACE_ID
        return FunctionalAuthorizationResult(
            allowed=True,
            authority_available=True,
            authenticated=True,
            user_id=DEFAULT_TEST_USER_ID,
            username="test_admin",
            workspace_id=ws_id,
        )


@pytest.fixture(autouse=True)
def allow_legacy_api_tests_to_reach_handlers():
    app.state.system_authorization_client = AllowAllAuthorizationClient()
    yield
    app.state.system_authorization_client = AllowAllAuthorizationClient()
