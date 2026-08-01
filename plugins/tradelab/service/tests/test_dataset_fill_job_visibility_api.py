from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient

from tradelab_api.main import app
from tradelab_api.services.market_data_repository import MarketDataRepository

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


def test_fill_job_visibility_route_returns_success_envelope(monkeypatch) -> None:
    from tradelab_api.services.dataset_fill_job_visibility import (
        DatasetFillJobVisibilityItem,
        DatasetFillJobVisibilityRange,
        DatasetFillJobVisibilityResult,
    )

    captured = {"kwargs": None}

    def fake_list(repository, **kwargs):
        captured["kwargs"] = kwargs
        return DatasetFillJobVisibilityResult(
            dataset_key="binance:BTCUSDT:1h",
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            safety_status="read_only",
            active=[
                DatasetFillJobVisibilityItem(
                    job_id="job-active",
                    dataset_key="binance:BTCUSDT:1h",
                    job_type="fill",
                    status="running",
                    requested_range=DatasetFillJobVisibilityRange(start_at=_dt(0), end_at=_dt(6)),
                    applied_range=DatasetFillJobVisibilityRange(start_at=_dt(1), end_at=_dt(2)),
                    rows_imported=2,
                    rows_fetched=3,
                    rows_inserted=2,
                    rows_skipped_existing=1,
                    reason_code=None,
                    provider_status=None,
                    attempt_count=1,
                    worker_id="worker-a",
                    created_at=_dt(0),
                    started_at=_dt(0),
                    finished_at=None,
                    heartbeat_at="2026-01-01T00:00:00+00:00",
                    metadata={"source": "strategy_lab_local_fill"},
                )
            ],
            recent=[],
        )

    monkeypatch.setattr("tradelab_api.api.exchange.list_dataset_fill_job_visibility", fake_list)

    data = assert_success_envelope(
        client.get(
            "/api/tradelab/datasets/fill-job-visibility",
            params={"datasetKey": "binance:BTCUSDT:1h", "limit": 5},
        )
    )

    assert captured["kwargs"] == {
        "exchange": None,
        "symbol": None,
        "timeframe": None,
        "dataset_key": "binance:BTCUSDT:1h",
        "limit": 5,
    }
    assert data["datasetKey"] == "binance:BTCUSDT:1h"
    assert data["safetyStatus"] == "read_only"
    assert data["active"][0]["jobId"] == "job-active"
    assert data["active"][0]["heartbeatAt"] == "2026-01-01T00:00:00+00:00"
    assert data["recent"] == []


def test_fill_job_visibility_route_returns_validation_reason(monkeypatch) -> None:
    from tradelab_api.services.dataset_fill_job_visibility import DatasetFillJobVisibilityValidationError

    def fake_list(repository, **kwargs):
        raise DatasetFillJobVisibilityValidationError(
            "dataset_fill_job_visibility_context_required",
            "Dataset context is required for fill job visibility.",
        )

    monkeypatch.setattr("tradelab_api.api.exchange.list_dataset_fill_job_visibility", fake_list)

    data = assert_error_envelope(client.get("/api/tradelab/datasets/fill-job-visibility"), 400)

    assert data == {"reasonCode": "dataset_fill_job_visibility_context_required"}


def test_fill_job_visibility_route_is_read_only(monkeypatch) -> None:
    from tradelab_api.services.dataset_fill_job_visibility import DatasetFillJobVisibilityResult

    calls = {"create_job": 0, "create_candles": 0, "claim": 0, "commit": 0}

    def fake_list(repository, **kwargs):
        return DatasetFillJobVisibilityResult(
            dataset_key="binance:BTCUSDT:1h",
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            safety_status="read_only",
            active=[],
            recent=[],
        )

    def fail_create_import_job(self, **fields):
        calls["create_job"] += 1
        raise AssertionError("Fill job visibility route must not create jobs.")

    def fail_create_market_candles(self, candles):
        calls["create_candles"] += 1
        raise AssertionError("Fill job visibility route must not create candles.")

    def fail_claim_next_queued_import_job(self, *, worker_id: str):
        calls["claim"] += 1
        raise AssertionError("Fill job visibility route must not claim jobs.")

    monkeypatch.setattr("tradelab_api.api.exchange.list_dataset_fill_job_visibility", fake_list)
    monkeypatch.setattr(MarketDataRepository, "create_import_job", fail_create_import_job)
    monkeypatch.setattr(MarketDataRepository, "create_market_candles", fail_create_market_candles)
    monkeypatch.setattr(MarketDataRepository, "claim_next_queued_import_job", fail_claim_next_queued_import_job)
    monkeypatch.setattr("tradelab_api.api.exchange.Session.commit", lambda self: calls.__setitem__("commit", calls["commit"] + 1))

    data = assert_success_envelope(
        client.get(
            "/api/tradelab/datasets/fill-job-visibility",
            params={"exchange": "binance", "symbol": "BTCUSDT", "timeframe": "1h"},
        )
    )

    assert data["datasetKey"] == "binance:BTCUSDT:1h"
    assert calls == {"create_job": 0, "create_candles": 0, "claim": 0, "commit": 0}
