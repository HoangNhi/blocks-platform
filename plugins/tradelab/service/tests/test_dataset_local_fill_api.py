from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

from fastapi.testclient import TestClient

from tradelab_api.main import app
from tradelab_api.services.dataset_local_fill import (
    DatasetLocalFillRange,
    DatasetLocalFillRangeResult,
    DatasetLocalFillResult,
)
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


def _body() -> dict[str, object]:
    return {
        "strategyId": str(uuid4()),
        "exchange": "binance",
        "symbol": "BTCUSDT",
        "timeframe": "1h",
        "requestedStartAt": _dt(0).isoformat(),
        "requestedEndAt": _dt(2).isoformat(),
        "previewId": "preview-1",
        "requestFingerprint": "fingerprint-1",
        "confirmLocalFill": True,
        "source": "strategy_lab",
    }


def test_fill_local_route_returns_success_envelope(monkeypatch) -> None:
    commits = {"count": 0}
    captured = {"settings": None, "client_base_url": None}

    def fake_get_settings():
        return SimpleNamespace(
            binance_base_url="https://binance.test",
            tradelab_environment="local",
            tradelab_local_fill_enabled=True,
            default_worker_identity="trade-lab-test",
        )

    class FakeBinanceClient:
        def __init__(self, *, base_url: str):
            captured["client_base_url"] = base_url

    def fake_execute(repository, client_arg, **kwargs):
        captured["settings"] = kwargs["settings"]
        return DatasetLocalFillResult(
            job_id=str(uuid4()),
            dataset_key="binance:BTCUSDT:1h",
            status="completed",
            safety_status="local_dev_fill_only",
            requested_range=DatasetLocalFillRange(start_at=_dt(0), end_at=_dt(2)),
            ranges_filled=[
                DatasetLocalFillRangeResult(
                    start_at=_dt(0),
                    end_at=_dt(0),
                    kind="head",
                    rows_fetched=1,
                    rows_inserted=1,
                    rows_skipped_existing=0,
                )
            ],
            rows_fetched=1,
            rows_inserted=1,
            rows_skipped_existing=0,
            blocked_reasons=[],
            preview_id="preview-1",
            request_fingerprint="fingerprint-1",
        )

    monkeypatch.setattr("tradelab_api.api.exchange.get_settings", fake_get_settings)
    monkeypatch.setattr("tradelab_api.api.exchange.BinanceSpotClient", FakeBinanceClient)
    monkeypatch.setattr("tradelab_api.api.exchange.execute_dataset_local_fill", fake_execute)
    monkeypatch.setattr("tradelab_api.api.exchange.Session.commit", lambda self: commits.__setitem__("count", commits["count"] + 1))

    data = assert_success_envelope(client.post("/api/tradelab/datasets/fill-local", json=_body()))

    assert data["datasetKey"] == "binance:BTCUSDT:1h"
    assert data["status"] == "completed"
    assert data["safetyStatus"] == "local_dev_fill_only"
    assert data["rowsFetched"] == 1
    assert data["rowsInserted"] == 1
    assert data["rowsSkippedExisting"] == 0
    assert data["rangesFilled"][0]["kind"] == "head"
    assert captured["client_base_url"] == "https://binance.test"
    assert captured["settings"].tradelab_local_fill_enabled is True
    assert commits["count"] == 1


def test_fill_local_route_returns_machine_readable_reason(monkeypatch) -> None:
    from tradelab_api.services.dataset_local_fill import DatasetLocalFillValidationError

    calls = {"client": 0, "jobs": 0}

    class FakeBinanceClient:
        def __init__(self, *, base_url: str):
            calls["client"] += 1

    def fake_execute(repository, client_arg, **kwargs):
        raise DatasetLocalFillValidationError("local_fill_disabled", "Local dataset fill is disabled.")

    def fail_create_import_job(self, **fields):
        calls["jobs"] += 1
        raise AssertionError("Guarded fill must not create jobs.")

    monkeypatch.setattr("tradelab_api.api.exchange.BinanceSpotClient", FakeBinanceClient)
    monkeypatch.setattr("tradelab_api.api.exchange.execute_dataset_local_fill", fake_execute)
    monkeypatch.setattr(MarketDataRepository, "create_import_job", fail_create_import_job)

    data = assert_error_envelope(client.post("/api/tradelab/datasets/fill-local", json=_body()), 400)

    assert data == {"reasonCode": "local_fill_disabled"}
    assert calls["jobs"] == 0

def test_fill_local_route_returns_provider_status_and_commits_failed_audit(monkeypatch) -> None:
    from tradelab_api.services.dataset_local_fill import DatasetLocalFillValidationError

    commits = {"count": 0}

    class FakeBinanceClient:
        def __init__(self, *, base_url: str):
            pass

    def fake_execute(repository, client_arg, **kwargs):
        raise DatasetLocalFillValidationError(
            "dataset_fill_provider_rate_limited",
            "Binance public klines rate limit was reached.",
            should_commit=True,
            provider_status="429",
        )

    monkeypatch.setattr("tradelab_api.api.exchange.BinanceSpotClient", FakeBinanceClient)
    monkeypatch.setattr("tradelab_api.api.exchange.execute_dataset_local_fill", fake_execute)
    monkeypatch.setattr("tradelab_api.api.exchange.Session.commit", lambda self: commits.__setitem__("count", commits["count"] + 1))

    data = assert_error_envelope(client.post("/api/tradelab/datasets/fill-local", json=_body()), 400)

    assert data == {
        "reasonCode": "dataset_fill_provider_rate_limited",
        "providerStatus": "429",
    }
    assert commits["count"] == 1

def test_local_fill_audit_route_returns_success_envelope(monkeypatch) -> None:
    from tradelab_api.services.dataset_local_fill_audit import (
        DatasetLocalFillAuditItem,
        DatasetLocalFillAuditRange,
        DatasetLocalFillAuditResult,
    )

    captured = {"repository": None, "kwargs": None}

    def fake_list(repository, **kwargs):
        captured["repository"] = repository
        captured["kwargs"] = kwargs
        return DatasetLocalFillAuditResult(
            dataset_key="binance:BTCUSDT:1h",
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            safety_status="read_only",
            items=[
                DatasetLocalFillAuditItem(
                    job_id="job-1",
                    status="failed",
                    created_at=_dt(0),
                    finished_at=_dt(1),
                    requested_range=DatasetLocalFillAuditRange(start_at=_dt(0), end_at=_dt(2)),
                    applied_range=DatasetLocalFillAuditRange(start_at=None, end_at=None),
                    rows_imported=0,
                    rows_fetched=0,
                    rows_inserted=0,
                    rows_skipped_existing=0,
                    error_message="Binance public klines request failed.",
                    reason_code="dataset_fill_provider_rate_limited",
                    provider_status="429",
                    preview_id="preview-1",
                    request_fingerprint="fingerprint-1",
                    missing_ranges=[],
                    range_results=[],
                )
            ],
        )

    monkeypatch.setattr("tradelab_api.api.exchange.list_dataset_local_fill_audit", fake_list)

    data = assert_success_envelope(
        client.get(
            "/api/tradelab/datasets/local-fill-audit",
            params={"exchange": "binance", "symbol": "BTCUSDT", "timeframe": "1h", "limit": 5},
        )
    )

    assert captured["kwargs"] == {
        "exchange": "binance",
        "symbol": "BTCUSDT",
        "timeframe": "1h",
        "dataset_key": None,
        "limit": 5,
    }
    assert data["datasetKey"] == "binance:BTCUSDT:1h"
    assert data["safetyStatus"] == "read_only"
    assert data["items"][0]["status"] == "failed"
    assert data["items"][0]["reasonCode"] == "dataset_fill_provider_rate_limited"
    assert data["items"][0]["providerStatus"] == "429"

def test_local_fill_audit_route_returns_validation_reason(monkeypatch) -> None:
    from tradelab_api.services.dataset_local_fill_audit import DatasetLocalFillAuditValidationError

    def fake_list(repository, **kwargs):
        raise DatasetLocalFillAuditValidationError(
            "dataset_context_required",
            "Exchange, symbol, and timeframe are required for local fill audit.",
        )

    monkeypatch.setattr("tradelab_api.api.exchange.list_dataset_local_fill_audit", fake_list)

    data = assert_error_envelope(client.get("/api/tradelab/datasets/local-fill-audit"), 400)

    assert data == {"reasonCode": "dataset_context_required"}

def test_local_fill_audit_route_is_read_only(monkeypatch) -> None:
    from tradelab_api.services.dataset_local_fill_audit import DatasetLocalFillAuditResult

    calls = {"create_job": 0, "create_candles": 0, "commit": 0}

    def fake_list(repository, **kwargs):
        return DatasetLocalFillAuditResult(
            dataset_key="binance:BTCUSDT:1h",
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            safety_status="read_only",
            items=[],
        )

    def fail_create_import_job(self, **fields):
        calls["create_job"] += 1
        raise AssertionError("Audit route must not create jobs.")

    monkeypatch.setattr("tradelab_api.api.exchange.list_dataset_local_fill_audit", fake_list)
    def fail_create_market_candles(self, candles):
        calls["create_candles"] += 1
        raise AssertionError("Audit route must not create candles.")

    monkeypatch.setattr(MarketDataRepository, "create_import_job", fail_create_import_job)
    monkeypatch.setattr(MarketDataRepository, "create_market_candles", fail_create_market_candles)
    monkeypatch.setattr("tradelab_api.api.exchange.Session.commit", lambda self: calls.__setitem__("commit", calls["commit"] + 1))

    data = assert_success_envelope(
        client.get(
            "/api/tradelab/datasets/local-fill-audit",
            params={"datasetKey": "binance:BTCUSDT:1h"},
        )
    )

    assert data["datasetKey"] == "binance:BTCUSDT:1h"
    assert calls == {"create_job": 0, "create_candles": 0, "commit": 0}
