from __future__ import annotations

from fastapi.testclient import TestClient

from tradelab_api.main import app
from tradelab_api.services.dataset_fill_cancel import (
    DatasetFillCancelResult,
    DatasetFillCancelValidationError,
)

client = TestClient(app)


def _result() -> DatasetFillCancelResult:
    return DatasetFillCancelResult(
        job_id="job-1",
        dataset_key="binance:BTCUSDT:1h",
        status="cancel_requested",
        reason_code="dataset_fill_cancel_requested",
        safety_status="local_dev_cancel_only",
    )


def test_cancel_fill_job_route_returns_success_envelope(monkeypatch) -> None:
    captured: dict[str, object] = {"kwargs": None, "commit": 0}

    def fake_cancel(repository, **kwargs):
        captured["kwargs"] = kwargs
        return _result()

    monkeypatch.setattr("tradelab_api.api.exchange.mark_fill_job_cancel_requested", fake_cancel)
    monkeypatch.setattr("tradelab_api.api.exchange.Session.commit", lambda self: captured.__setitem__("commit", 1))

    response = client.post(
        "/api/tradelab/datasets/fill-jobs/job-1/cancel",
        json={"confirmCancel": True, "reason": "user_requested", "requestedBy": "admin"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["Success"] is True
    assert payload["Data"] == {
        "jobId": "job-1",
        "datasetKey": "binance:BTCUSDT:1h",
        "status": "cancel_requested",
        "reasonCode": "dataset_fill_cancel_requested",
        "safetyStatus": "local_dev_cancel_only",
    }
    assert payload["Message"] == "Background fill cancel requested."
    assert captured["commit"] == 1
    assert captured["kwargs"]["job_id"] == "job-1"
    assert captured["kwargs"]["confirm_cancel"] is True
    assert captured["kwargs"]["reason"] == "user_requested"
    assert captured["kwargs"]["requested_by"] == "admin"


def test_cancel_fill_job_route_returns_reason_code_without_commit(monkeypatch) -> None:
    captured = {"commit": 0}

    def fake_cancel(repository, **kwargs):
        raise DatasetFillCancelValidationError(
            "dataset_fill_cancel_not_running",
            "Cancel requires a running background fill job.",
            {"jobId": "job-1", "status": "queued", "datasetKey": "binance:BTCUSDT:1h"},
        )

    monkeypatch.setattr("tradelab_api.api.exchange.mark_fill_job_cancel_requested", fake_cancel)
    monkeypatch.setattr("tradelab_api.api.exchange.Session.commit", lambda self: captured.__setitem__("commit", 1))

    response = client.post(
        "/api/tradelab/datasets/fill-jobs/job-1/cancel",
        json={"confirmCancel": True, "reason": "user_requested"},
    )

    payload = response.json()
    assert payload["Success"] is False
    assert payload["StatusCode"] == 400
    assert payload["Data"] == {
        "reasonCode": "dataset_fill_cancel_not_running",
        "jobId": "job-1",
        "status": "queued",
        "datasetKey": "binance:BTCUSDT:1h",
    }
    assert captured["commit"] == 0


def test_cancel_fill_job_route_requires_explicit_confirm(monkeypatch) -> None:
    captured = {"commit": 0}

    def fake_cancel(repository, **kwargs):
        raise DatasetFillCancelValidationError(
            "dataset_fill_cancel_confirm_required",
            "Cancelling a background fill job requires explicit confirmation.",
        )

    monkeypatch.setattr("tradelab_api.api.exchange.mark_fill_job_cancel_requested", fake_cancel)
    monkeypatch.setattr("tradelab_api.api.exchange.Session.commit", lambda self: captured.__setitem__("commit", 1))

    response = client.post(
        "/api/tradelab/datasets/fill-jobs/job-1/cancel",
        json={"confirmCancel": False, "reason": "user_requested"},
    )

    payload = response.json()
    assert payload["Success"] is False
    assert payload["Data"] == {"reasonCode": "dataset_fill_cancel_confirm_required"}
    assert captured["commit"] == 0
