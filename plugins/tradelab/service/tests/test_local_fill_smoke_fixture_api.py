from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

from fastapi.testclient import TestClient

from tradelab_api.main import app
from tradelab_api.services.local_fill_smoke_fixture import (
    LOCAL_FILL_SMOKE_FIXTURE_SAFETY_STATUS,
    LocalFillSmokeFixtureResult,
    LocalFillSmokeFixtureValidationError,
)

client = TestClient(app)


def _dt(hour: int) -> datetime:
    return datetime(2026, 1, 1, hour, tzinfo=timezone.utc)


def assert_success_envelope(response, semantic_status: int = 200) -> dict[str, object]:
    assert response.status_code == 200
    payload = response.json()
    assert payload["Success"] is True
    assert payload["StatusCode"] == semantic_status
    assert payload["Message"] is None
    return payload["Data"]


def assert_error_envelope(response, semantic_status: int) -> dict[str, object]:
    assert response.status_code == 200
    payload = response.json()
    assert payload["Success"] is False
    assert payload["StatusCode"] == semantic_status
    return payload["Data"]


def test_reset_local_fill_fixture_route_returns_success_envelope(monkeypatch) -> None:
    commits = {"count": 0}
    captured = {"confirm": None, "settings": None}

    def fake_get_settings():
        return SimpleNamespace(tradelab_environment="local", tradelab_local_fill_enabled=True)

    def fake_reset(strategy_repository, market_repository, **kwargs):
        captured["confirm"] = kwargs["confirm_fixture_reset"]
        captured["settings"] = kwargs["settings"]
        return LocalFillSmokeFixtureResult(
            strategy_id=uuid4(),
            strategy_slug="tradelab-local-fill-smoke",
            strategy_group_id=uuid4(),
            strategy_group_slug="tradelab-smoke-fixtures",
            dataset_key="binance:BTCUSDT:1h",
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            requested_start_at=_dt(0),
            requested_end_at=_dt(6),
            expected_missing_ranges=[{"start_at": _dt(3), "end_at": _dt(6), "kind": "tail"}],
            expected_rows_inserted_min=1,
            deleted_rows=4,
            seeded_rows=3,
            safety_status=LOCAL_FILL_SMOKE_FIXTURE_SAFETY_STATUS,
        )

    monkeypatch.setattr("tradelab_api.api.exchange.get_settings", fake_get_settings)
    monkeypatch.setattr("tradelab_api.api.exchange.reset_local_fill_smoke_fixture", fake_reset)
    monkeypatch.setattr("tradelab_api.api.exchange.Session.commit", lambda self: commits.__setitem__("count", commits["count"] + 1))

    data = assert_success_envelope(
        client.post("/api/tradelab/smoke/local-fill-fixture/reset", json={"confirmFixtureReset": True})
    )

    assert captured["confirm"] is True
    assert captured["settings"].tradelab_local_fill_enabled is True
    assert data["datasetKey"] == "binance:BTCUSDT:1h"
    assert data["strategySlug"] == "tradelab-local-fill-smoke"
    assert data["strategyGroupSlug"] == "tradelab-smoke-fixtures"
    assert data["expectedRowsInsertedMin"] == 1
    assert data["expectedMissingRanges"][0]["kind"] == "tail"
    assert data["safetyStatus"] == LOCAL_FILL_SMOKE_FIXTURE_SAFETY_STATUS
    assert commits["count"] == 1


def test_reset_local_fill_fixture_route_returns_machine_readable_reason(monkeypatch) -> None:
    commits = {"count": 0}

    def fake_reset(strategy_repository, market_repository, **kwargs):
        raise LocalFillSmokeFixtureValidationError(
            "local_fill_fixture_confirmation_required",
            "Local fill smoke fixture reset requires explicit confirmation.",
        )

    monkeypatch.setattr("tradelab_api.api.exchange.reset_local_fill_smoke_fixture", fake_reset)
    monkeypatch.setattr("tradelab_api.api.exchange.Session.commit", lambda self: commits.__setitem__("count", commits["count"] + 1))

    data = assert_error_envelope(client.post("/api/tradelab/smoke/local-fill-fixture/reset", json={}), 400)

    assert data == {"reasonCode": "local_fill_fixture_confirmation_required"}
    assert commits["count"] == 0
