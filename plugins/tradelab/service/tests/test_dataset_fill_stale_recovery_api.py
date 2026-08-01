from __future__ import annotations

from fastapi.testclient import TestClient

from tradelab_api.main import app
from tradelab_api.services.dataset_fill_stale_recovery import (
    DatasetFillMarkStaleFailedResult,
    DatasetFillMarkStaleFailedValidationError,
)

client = TestClient(app)


def _result() -> DatasetFillMarkStaleFailedResult:
    return DatasetFillMarkStaleFailedResult(
        job_id="job-1",
        dataset_key="binance:BTCUSDT:1h",
        status="failed",
        reason_code="dataset_fill_stale_marked_failed",
        safety_status="local_dev_recovery_only",
    )


def test_mark_stale_failed_route_returns_success_envelope(monkeypatch) -> None:
    captured: dict[str, object] = {"kwargs": None, "commit": 0}

    def fake_mark(repository, **kwargs):
        captured["kwargs"] = kwargs
        return _result()

    monkeypatch.setattr("tradelab_api.api.exchange.mark_stale_fill_job_failed", fake_mark)
    monkeypatch.setattr("tradelab_api.api.exchange.Session.commit", lambda self: captured.__setitem__("commit", 1))

    response = client.post(
        "/api/tradelab/datasets/fill-jobs/job-1/mark-stale-failed",
        json={"confirmMarkFailed": True, "reason": "stale_worker_heartbeat", "requestedBy": "admin"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["Success"] is True
    assert payload["Data"] == {
        "jobId": "job-1",
        "datasetKey": "binance:BTCUSDT:1h",
        "status": "failed",
        "reasonCode": "dataset_fill_stale_marked_failed",
        "safetyStatus": "local_dev_recovery_only",
    }
    assert payload["Message"] == "Stale background fill job marked failed."
    assert captured["commit"] == 1
    assert captured["kwargs"]["job_id"] == "job-1"
    assert captured["kwargs"]["confirm_mark_failed"] is True
    assert captured["kwargs"]["reason"] == "stale_worker_heartbeat"
    assert captured["kwargs"]["requested_by"] == "admin"


def test_mark_stale_failed_route_returns_reason_code_without_commit(monkeypatch) -> None:
    captured = {"commit": 0}

    def fake_mark(repository, **kwargs):
        raise DatasetFillMarkStaleFailedValidationError(
            "dataset_fill_recovery_not_stale",
            "Stale recovery requires a job with stale status.",
            {"jobId": "job-1", "status": "running", "datasetKey": "binance:BTCUSDT:1h"},
        )

    monkeypatch.setattr("tradelab_api.api.exchange.mark_stale_fill_job_failed", fake_mark)
    monkeypatch.setattr("tradelab_api.api.exchange.Session.commit", lambda self: captured.__setitem__("commit", 1))

    response = client.post(
        "/api/tradelab/datasets/fill-jobs/job-1/mark-stale-failed",
        json={"confirmMarkFailed": True, "reason": "stale_worker_heartbeat"},
    )

    payload = response.json()
    assert payload["Success"] is False
    assert payload["StatusCode"] == 400
    assert payload["Data"] == {
        "reasonCode": "dataset_fill_recovery_not_stale",
        "jobId": "job-1",
        "status": "running",
        "datasetKey": "binance:BTCUSDT:1h",
    }
    assert captured["commit"] == 0


def test_mark_stale_failed_route_requires_explicit_confirm(monkeypatch) -> None:
    captured = {"commit": 0}

    def fake_mark(repository, **kwargs):
        raise DatasetFillMarkStaleFailedValidationError(
            "dataset_fill_recovery_confirm_required",
            "Marking a stale background fill failed requires explicit confirmation.",
        )

    monkeypatch.setattr("tradelab_api.api.exchange.mark_stale_fill_job_failed", fake_mark)
    monkeypatch.setattr("tradelab_api.api.exchange.Session.commit", lambda self: captured.__setitem__("commit", 1))

    response = client.post(
        "/api/tradelab/datasets/fill-jobs/job-1/mark-stale-failed",
        json={"confirmMarkFailed": False, "reason": "stale_worker_heartbeat"},
    )

    payload = response.json()
    assert payload["Success"] is False
    assert payload["Data"] == {"reasonCode": "dataset_fill_recovery_confirm_required"}
    assert captured["commit"] == 0
