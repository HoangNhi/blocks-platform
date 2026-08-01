from __future__ import annotations

from fastapi.testclient import TestClient

from tradelab_api.main import app
from tradelab_api.services.dataset_fill_worker_tick import (
    DatasetFillWorkerTickResult,
    DatasetFillWorkerTickValidationError,
)

client = TestClient(app)


def _result(*, processed: bool = True, status: str = "completed") -> DatasetFillWorkerTickResult:
    return DatasetFillWorkerTickResult(
        processed=processed,
        job_id="job-1" if processed else None,
        dataset_key="binance:BTCUSDT:1h" if processed else None,
        status=status,
        safety_status="local_dev_worker_tick",
        rows_fetched=4 if processed else 0,
        rows_inserted=4 if processed else 0,
        rows_skipped_existing=0,
        stale_jobs_marked=0,
        reason_code=None,
        provider_status=None,
        attempt_count=1 if processed else 0,
        max_attempts=3,
        retry_exhausted=False,
    )


def test_worker_tick_route_returns_success_envelope(monkeypatch) -> None:
    captured: dict[str, object] = {"kwargs": None, "commit": 0}

    def fake_tick(repository, client, **kwargs):
        captured["kwargs"] = kwargs
        return _result()

    monkeypatch.setattr("tradelab_api.api.exchange.tick_dataset_fill_worker", fake_tick)
    monkeypatch.setattr("tradelab_api.api.exchange.Session.commit", lambda self: captured.__setitem__("commit", 1))

    response = client.post(
        "/api/tradelab/datasets/fill-jobs/worker-tick",
        json={"confirmLocalWorkerTick": True, "workerId": "worker-api"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["Success"] is True
    assert payload["Data"]["processed"] is True
    assert payload["Data"]["jobId"] == "job-1"
    assert payload["Data"]["status"] == "completed"
    assert payload["Data"]["safetyStatus"] == "local_dev_worker_tick"
    assert payload["Data"]["rowsInserted"] == 4
    assert payload["Message"] == "Background fill worker tick completed."
    assert captured["commit"] == 1
    assert captured["kwargs"]["confirm_local_worker_tick"] is True
    assert captured["kwargs"]["worker_id"] == "worker-api"


def test_worker_tick_route_returns_idle_success(monkeypatch) -> None:
    monkeypatch.setattr("tradelab_api.api.exchange.tick_dataset_fill_worker", lambda repository, client, **kwargs: _result(processed=False, status="idle"))

    response = client.post(
        "/api/tradelab/datasets/fill-jobs/worker-tick",
        json={"confirmLocalWorkerTick": True},
    )

    payload = response.json()
    assert payload["Success"] is True
    assert payload["Data"]["processed"] is False
    assert payload["Data"]["status"] == "idle"
    assert payload["Message"] == "No queued background fill job."


def test_worker_tick_route_returns_reason_code_without_commit(monkeypatch) -> None:
    captured = {"commit": 0}

    def fake_tick(repository, client, **kwargs):
        raise DatasetFillWorkerTickValidationError(
            "dataset_fill_worker_confirm_required",
            "Local background fill worker tick requires explicit confirmation.",
        )

    monkeypatch.setattr("tradelab_api.api.exchange.tick_dataset_fill_worker", fake_tick)
    monkeypatch.setattr("tradelab_api.api.exchange.Session.commit", lambda self: captured.__setitem__("commit", 1))

    response = client.post(
        "/api/tradelab/datasets/fill-jobs/worker-tick",
        json={"confirmLocalWorkerTick": False},
    )

    payload = response.json()
    assert payload["Success"] is False
    assert payload["StatusCode"] == 400
    assert payload["Data"] == {"reasonCode": "dataset_fill_worker_confirm_required"}
    assert captured["commit"] == 0

def test_worker_tick_route_returns_retry_metadata(monkeypatch) -> None:
    def fake_tick(repository, client, **kwargs):
        return DatasetFillWorkerTickResult(
            processed=True,
            job_id="job-1",
            dataset_key="binance:BTCUSDT:1h",
            status="running",
            safety_status="local_dev_worker_tick",
            rows_fetched=0,
            rows_inserted=0,
            rows_skipped_existing=0,
            stale_jobs_marked=0,
            reason_code="dataset_fill_provider_rate_limited",
            provider_status="429",
            attempt_count=1,
            max_attempts=3,
            retry_exhausted=False,
        )

    monkeypatch.setattr("tradelab_api.api.exchange.tick_dataset_fill_worker", fake_tick)

    response = client.post(
        "/api/tradelab/datasets/fill-jobs/worker-tick",
        json={"confirmLocalWorkerTick": True, "workerId": "worker-api"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["Success"] is True
    assert payload["Data"]["status"] == "running"
    assert payload["Data"]["reasonCode"] == "dataset_fill_provider_rate_limited"
    assert payload["Data"]["providerStatus"] == "429"
    assert payload["Data"]["attemptCount"] == 1
    assert payload["Data"]["maxAttempts"] == 3
    assert payload["Data"]["retryExhausted"] is False
    assert payload["Message"] == "Background fill worker tick scheduled retry."


def test_worker_tick_route_returns_cancelled_metadata(monkeypatch) -> None:
    def fake_tick(repository, client, **kwargs):
        return DatasetFillWorkerTickResult(
            processed=True,
            job_id="job-1",
            dataset_key="binance:BTCUSDT:1h",
            status="cancelled",
            safety_status="local_dev_cancel_only",
            rows_fetched=4,
            rows_inserted=2,
            rows_skipped_existing=2,
            stale_jobs_marked=0,
            reason_code="dataset_fill_cancelled",
            provider_status=None,
            attempt_count=1,
            max_attempts=3,
            retry_exhausted=False,
        )

    monkeypatch.setattr("tradelab_api.api.exchange.tick_dataset_fill_worker", fake_tick)

    response = client.post(
        "/api/tradelab/datasets/fill-jobs/worker-tick",
        json={"confirmLocalWorkerTick": True, "workerId": "worker-api"},
    )

    payload = response.json()
    assert payload["Success"] is True
    assert payload["Data"]["status"] == "cancelled"
    assert payload["Data"]["reasonCode"] == "dataset_fill_cancelled"
    assert payload["Data"]["safetyStatus"] == "local_dev_cancel_only"
    assert payload["Message"] == "Background fill worker tick cancelled job."
