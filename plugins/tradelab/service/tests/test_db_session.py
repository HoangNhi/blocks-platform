from __future__ import annotations

import pytest
from sqlalchemy.engine import URL
from sqlalchemy.exc import SQLAlchemyError

import tradelab_api.db.session as session_module
from tradelab_api.db.testnet_order_event_types import (
    TESTNET_ORDER_EVENT_TYPES,
    testnet_order_event_type_check_constraint_sql as build_testnet_order_event_type_check_constraint_sql,
)


def test_database_connect_timeout_uses_default_when_env_missing(monkeypatch) -> None:
    monkeypatch.delenv("TRADELAB_DB_CONNECT_TIMEOUT_SECONDS", raising=False)

    assert session_module.database_connect_timeout_seconds() == 5


def test_database_connect_timeout_uses_positive_integer_env(monkeypatch) -> None:
    monkeypatch.setenv("TRADELAB_DB_CONNECT_TIMEOUT_SECONDS", "9")

    assert session_module.database_connect_timeout_seconds() == 9


def test_database_connect_timeout_ignores_invalid_env(monkeypatch) -> None:
    monkeypatch.setenv("TRADELAB_DB_CONNECT_TIMEOUT_SECONDS", "not-a-number")

    assert session_module.database_connect_timeout_seconds() == 5


def test_database_connect_timeout_ignores_non_positive_env(monkeypatch) -> None:
    monkeypatch.setenv("TRADELAB_DB_CONNECT_TIMEOUT_SECONDS", "0")
    assert session_module.database_connect_timeout_seconds() == 5

    monkeypatch.setenv("TRADELAB_DB_CONNECT_TIMEOUT_SECONDS", "-1")
    assert session_module.database_connect_timeout_seconds() == 5


def test_postgres_connect_args_include_connect_timeout(monkeypatch) -> None:
    monkeypatch.setenv("TRADELAB_DB_CONNECT_TIMEOUT_SECONDS", "7")
    url = URL.create("postgresql+psycopg", username="postgres", password="secret", host="localhost", database="tradelab")

    assert session_module.database_connect_args(url) == {"connect_timeout": 7}


def test_non_postgres_connect_args_are_empty(monkeypatch) -> None:
    monkeypatch.setenv("TRADELAB_DB_CONNECT_TIMEOUT_SECONDS", "7")
    url = URL.create("sqlite", database=":memory:")

    assert session_module.database_connect_args(url) == {}


@pytest.mark.parametrize("database_url", [
    "postgres://postgres:secret@localhost:5432/tradelab",
    "postgresql://postgres:secret@localhost:5432/tradelab",
])
def test_normalize_database_url_uses_installed_psycopg_driver(database_url: str) -> None:
    assert session_module.normalize_database_url(database_url).drivername == "postgresql+psycopg"

def test_verify_database_connection_hides_database_password() -> None:
    class FailingEngine:
        url = URL.create(
            "postgresql+psycopg",
            username="postgres",
            password="secret",
            host="localhost",
            database="tradelab",
        )

        def connect(self):
            raise SQLAlchemyError("connection failed")

    with pytest.raises(RuntimeError) as exc_info:
        session_module.verify_database_connection(FailingEngine())  # type: ignore[arg-type]

    message = str(exc_info.value)
    assert "secret" not in message
    assert "postgres:***@" in message


def test_testnet_order_event_constraint_sql_matches_runtime_and_historical_events() -> None:
    assert len(TESTNET_ORDER_EVENT_TYPES) == len(set(TESTNET_ORDER_EVENT_TYPES))

    expected_event_types = {
        "testnet_order_submit_attempted",
        "testnet_order_submit_accepted",
        "testnet_order_submit_blocked",
        "testnet_order_cancel_requested",
        "testnet_order_cancel_accepted",
        "testnet_order_reconcile_started",
        "testnet_order_reconcile_completed",
        "testnet_order_reconcile_ambiguous",
        "testnet_order_reconcile_mismatch",
    }

    assert expected_event_types <= set(TESTNET_ORDER_EVENT_TYPES)

    constraint_sql = build_testnet_order_event_type_check_constraint_sql()
    for event_type in expected_event_types:
        assert f"'{event_type}'" in constraint_sql
