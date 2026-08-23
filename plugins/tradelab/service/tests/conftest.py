from __future__ import annotations

import os

import pytest
from sqlalchemy import text
from sqlalchemy.engine import make_url

from tradelab_api.db.models import Base
from tradelab_api.db.session import get_engine
from tradelab_api.core.authorization import FunctionalAuthorizationResult
from tradelab_api.main import app


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


class AllowAllAuthorizationClient:
    async def check(self, *_args: object, **_kwargs: object) -> FunctionalAuthorizationResult:
        return FunctionalAuthorizationResult(True, True, True)


@pytest.fixture(autouse=True)
def allow_legacy_api_tests_to_reach_handlers():
    app.state.system_authorization_client = AllowAllAuthorizationClient()
    yield
    app.state.system_authorization_client = AllowAllAuthorizationClient()
