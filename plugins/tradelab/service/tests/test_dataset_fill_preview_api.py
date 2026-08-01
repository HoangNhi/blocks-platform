from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

from fastapi.testclient import TestClient

from tradelab_api.main import app
from tradelab_api.services.market_data_repository import MarketDataRepository, build_dataset_key

client = TestClient(app)


def _dt(hour: int) -> datetime:
    return datetime(2026, 1, 1, hour, tzinfo=timezone.utc)


def _candle(hour: int) -> SimpleNamespace:
    timestamp = _dt(hour)
    return SimpleNamespace(
        open_time=timestamp,
        close_time=timestamp,
        open=100 + hour,
        high=101 + hour,
        low=99 + hour,
        close=100 + hour,
        volume=10,
    )


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


def test_fill_preview_route_returns_preview_envelope_without_mutation(monkeypatch) -> None:
    calls = {"commits": 0, "jobs": 0}
    coverage_id = uuid4()
    coverage = SimpleNamespace(
        id=coverage_id,
        dataset_key=build_dataset_key("binance", "BTCUSDT", "1h"),
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        health_status="healthy",
        earliest_open_time=_dt(0),
        latest_open_time=_dt(2),
        covered_start_at=_dt(0),
        covered_end_at=_dt(2),
        segment_count=1,
        gap_count=0,
        metadata_={},
    )
    segment = SimpleNamespace(coverage_id=coverage_id, segment_index=0, start_at=_dt(0), end_at=_dt(2), row_count=3)

    monkeypatch.setattr(MarketDataRepository, "get_coverage", lambda self, *, dataset_key: coverage)
    monkeypatch.setattr(MarketDataRepository, "list_coverage_segments", lambda self, *, coverage_id: [segment])
    monkeypatch.setattr(MarketDataRepository, "list_market_candles", lambda self, **kwargs: [_candle(0), _candle(1), _candle(2)])
    monkeypatch.setattr(MarketDataRepository, "find_compatible_active_import_job", lambda self, **kwargs: None)

    def fail_create_import_job(self, **fields):
        calls["jobs"] += 1
        raise AssertionError("Preview must not create import jobs.")

    monkeypatch.setattr(MarketDataRepository, "create_import_job", fail_create_import_job)

    response = client.post(
        "/api/tradelab/datasets/fill-preview",
        json={
            "strategyId": str(uuid4()),
            "exchange": "binance",
            "symbol": "BTCUSDT",
            "timeframe": "1h",
            "requestedStartAt": _dt(0).isoformat(),
            "requestedEndAt": _dt(2).isoformat(),
            "source": "strategy_lab",
        },
    )

    data = assert_success_envelope(response)
    assert data["datasetKey"] == "binance:BTCUSDT:1h"
    assert data["requestedRange"] == {
        "startAt": "2026-01-01T00:00:00Z",
        "endAt": "2026-01-01T02:00:00Z",
    }
    assert data["coverageStatus"] == "covered"
    assert data["estimatedRows"] == 0
    assert data["blockedReasons"] == []
    assert data["safetyStatus"] == "preview_only"
    assert calls == {"commits": 0, "jobs": 0}


def test_fill_preview_route_returns_machine_readable_validation_reason() -> None:
    response = client.post(
        "/api/tradelab/datasets/fill-preview",
        json={
            "strategyId": str(uuid4()),
            "exchange": "binance",
            "symbol": "BTCUSDT",
            "timeframe": "1h",
            "requestedStartAt": _dt(2).isoformat(),
            "requestedEndAt": _dt(2).isoformat(),
            "source": "strategy_lab",
        },
    )

    data = assert_error_envelope(response, 400)
    assert data == {"reasonCode": "dataset_fill_preview_invalid_range"}
