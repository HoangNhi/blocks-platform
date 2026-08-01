from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient

from tradelab_api.main import app
from tradelab_api.services.dataset_fill_enqueue_local import (
    DatasetFillEnqueueLocalResult,
    DatasetFillEnqueueLocalValidationError,
    DatasetFillEnqueueRange,
)
from tradelab_api.services.market_data_repository import MarketDataRepository

client = TestClient(app)


def _payload() -> dict[str, object]:
    return {
        "strategyId": "11111111-1111-1111-1111-111111111111",
        "exchange": "binance",
        "symbol": "BTCUSDT",
        "timeframe": "1h",
        "requestedStartAt": "2026-01-01T00:00:00Z",
        "requestedEndAt": "2026-01-01T06:00:00Z",
        "previewId": "preview-1",
        "requestFingerprint": "fingerprint-1",
        "missingRanges": [{"startAt": "2026-01-01T03:00:00Z", "endAt": "2026-01-01T06:00:00Z", "kind": "tail"}],
        "confirmLocalFill": True,
        "source": "strategy_lab",
    }


def _result() -> DatasetFillEnqueueLocalResult:
    return DatasetFillEnqueueLocalResult(
        job_id="job-1",
        dataset_key="binance:BTCUSDT:1h",
        status="queued",
        safety_status="queued_local_dev",
        requested_range=DatasetFillEnqueueRange(
            start_at=datetime(2026, 1, 1, 0, tzinfo=timezone.utc),
            end_at=datetime(2026, 1, 1, 6, tzinfo=timezone.utc),
        ),
        missing_range_count=1,
        preview_id="preview-1",
        request_fingerprint="fingerprint-1",
    )


def test_enqueue_route_returns_success_envelope(monkeypatch) -> None:
    captured: dict[str, object] = {"kwargs": None, "commit": 0}

    def fake_enqueue(repository, **kwargs):
        captured["kwargs"] = kwargs
        return _result()

    monkeypatch.setattr("tradelab_api.api.exchange.enqueue_dataset_fill_local", fake_enqueue)
    monkeypatch.setattr("tradelab_api.api.exchange.Session.commit", lambda self: captured.__setitem__("commit", 1))

    response = client.post("/api/tradelab/datasets/fill-enqueue-local", json=_payload())

    assert response.status_code == 200
    payload = response.json()
    assert payload["Success"] is True
    assert payload["Data"]["jobId"] == "job-1"
    assert payload["Data"]["status"] == "queued"
    assert payload["Data"]["safetyStatus"] == "queued_local_dev"
    assert payload["Message"] == "Background fill job queued."
    assert captured["commit"] == 1
    assert captured["kwargs"]["strategy_id"].hex == "11111111111111111111111111111111"
    assert captured["kwargs"]["confirm_local_fill"] is True


def test_enqueue_route_returns_reason_code(monkeypatch) -> None:
    captured = {"commit": 0}

    def fake_enqueue(repository, **kwargs):
        raise DatasetFillEnqueueLocalValidationError(
            "dataset_fill_job_already_active",
            "A background fill job is already active for this dataset range.",
            {"jobId": "job-active", "status": "queued", "datasetKey": "binance:BTCUSDT:1h"},
        )

    monkeypatch.setattr("tradelab_api.api.exchange.enqueue_dataset_fill_local", fake_enqueue)
    monkeypatch.setattr("tradelab_api.api.exchange.Session.commit", lambda self: captured.__setitem__("commit", 1))

    response = client.post("/api/tradelab/datasets/fill-enqueue-local", json=_payload())

    payload = response.json()
    assert payload["Success"] is False
    assert payload["StatusCode"] == 400
    assert payload["Data"] == {
        "reasonCode": "dataset_fill_job_already_active",
        "jobId": "job-active",
        "status": "queued",
        "datasetKey": "binance:BTCUSDT:1h",
    }
    assert captured["commit"] == 0


def test_enqueue_route_does_not_call_provider_candles_or_claim(monkeypatch) -> None:
    calls = {"candles": 0, "claim": 0}

    def fake_enqueue(repository, **kwargs):
        return _result()

    def fail_create_market_candles(self, candles):
        calls["candles"] += 1
        raise AssertionError("Enqueue route must not create market candles.")

    def fail_claim(self, *, worker_id: str):
        calls["claim"] += 1
        raise AssertionError("Enqueue route must not claim jobs.")

    monkeypatch.setattr("tradelab_api.api.exchange.enqueue_dataset_fill_local", fake_enqueue)
    monkeypatch.setattr(MarketDataRepository, "create_market_candles", fail_create_market_candles)
    monkeypatch.setattr(MarketDataRepository, "claim_next_queued_import_job", fail_claim)

    response = client.post("/api/tradelab/datasets/fill-enqueue-local", json=_payload())

    assert response.json()["Success"] is True
    assert calls == {"candles": 0, "claim": 0}
