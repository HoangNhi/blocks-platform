from __future__ import annotations

from collections.abc import Iterator
import os

from fastapi.testclient import TestClient
import pytest
from sqlalchemy.orm import Session

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://postgres:postgres123secure@localhost:5432/tradelab")

from tradelab_api.db.session import SessionLocal, apply_schema_compatibility, get_engine  # noqa: E402
from tradelab_api.main import app  # noqa: E402

apply_schema_compatibility()

client = TestClient(app)


@pytest.fixture()
def db_session() -> Iterator[Session]:
    connection = get_engine().connect()
    transaction = connection.begin()
    session = SessionLocal(bind=connection)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


def test_list_live_credentials_empty_response() -> None:
    response = client.get("/api/tradelab/live/credentials")
    payload = response.json()
    assert payload["Success"] is True
    assert isinstance(payload["Data"], list)


def test_missing_live_credential_returns_not_found_envelope() -> None:
    response = client.get("/api/tradelab/live/credentials/00000000-0000-0000-0000-000000000001")
    payload = response.json()
    assert payload["Success"] is True
    assert payload["StatusCode"] == 404
    assert payload["Data"]["reasonCode"] == "live_credential_not_found"
