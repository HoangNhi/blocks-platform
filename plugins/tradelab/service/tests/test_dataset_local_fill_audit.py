from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from tradelab_api.services.dataset_local_fill_audit import (
    DatasetLocalFillAuditValidationError,
    list_dataset_local_fill_audit,
)

def _dt(hour: int) -> datetime:
    return datetime(2026, 1, 1, hour, tzinfo=timezone.utc)

def _job(
    *,
    dataset_key: str = "binance:BTCUSDT:1h",
    job_type: str = "fill",
    status: str = "completed",
    source: str = "strategy_lab_local_fill",
    created_hour: int = 0,
    rows_imported: int = 2,
    metadata: dict[str, object] | None = None,
) -> SimpleNamespace:
    base_metadata: dict[str, object] = {
        "source": source,
        "previewId": f"preview-{created_hour}",
        "requestFingerprint": f"fingerprint-{created_hour}",
        "rowsFetched": 3,
        "rowsInserted": 2,
        "rowsSkippedExisting": 1,
        "safetyStatus": "local_dev_fill_only",
        "missingRanges": [{"startAt": _dt(0), "endAt": _dt(1), "kind": "tail"}],
        "rangeResults": [
            {
                "startAt": _dt(0),
                "endAt": _dt(1),
                "kind": "tail",
                "rowsFetched": 3,
                "rowsInserted": 2,
                "rowsSkippedExisting": 1,
            }
        ],
    }
    if metadata:
        base_metadata.update(metadata)
    return SimpleNamespace(
        id=uuid4(),
        coverage_id=None,
        dataset_key=dataset_key,
        job_type=job_type,
        exchange=dataset_key.split(":")[0],
        symbol=dataset_key.split(":")[1],
        timeframe=dataset_key.split(":")[2],
        requested_start_at=_dt(0),
        requested_end_at=_dt(6),
        applied_start_at=_dt(1),
        applied_end_at=_dt(6),
        claimed_at=None,
        started_at=_dt(created_hour),
        finished_at=_dt(created_hour + 1),
        worker_id="test-worker",
        start_at=_dt(0),
        end_at=_dt(6),
        status=status,
        rows_imported=rows_imported,
        error_message="Binance public klines request failed." if status == "failed" else None,
        metadata_=base_metadata,
        created_at=_dt(created_hour),
        created_by="codex",
        updated_at=None,
        updated_by=None,
        is_active=True,
        is_deleted=False,
    )

class FakeRepository:
    def __init__(self, jobs: list[SimpleNamespace]) -> None:
        self.jobs = jobs
        self.calls: list[dict[str, object]] = []
        self.created_jobs = 0
        self.created_candles = 0

    def list_local_fill_audit_jobs(self, *, dataset_key: str, limit: int):
        self.calls.append({"dataset_key": dataset_key, "limit": limit})
        return [
            job
            for job in self.jobs
            if job.dataset_key == dataset_key
            and job.job_type == "fill"
            and job.is_active is True
            and job.is_deleted is False
            and (job.metadata_ or {}).get("source") == "strategy_lab_local_fill"
        ][:limit]

    def create_import_job(self, **fields):
        self.created_jobs += 1
        raise AssertionError("Local fill audit must not create import jobs.")

    def create_market_candles(self, candles):
        self.created_candles += 1
        raise AssertionError("Local fill audit must not create candles.")

def test_lists_latest_local_fill_attempts_for_dataset_context() -> None:
    jobs = [_job(created_hour=hour) for hour in range(7)]
    repository = FakeRepository(list(reversed(jobs)))

    result = list_dataset_local_fill_audit(
        repository,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        limit=5,
    )

    assert result.dataset_key == "binance:BTCUSDT:1h"
    assert result.exchange == "binance"
    assert result.symbol == "BTCUSDT"
    assert result.timeframe == "1h"
    assert result.safety_status == "read_only"
    assert len(result.items) == 5
    assert [item.preview_id for item in result.items] == ["preview-6", "preview-5", "preview-4", "preview-3", "preview-2"]
    assert repository.calls == [{"dataset_key": "binance:BTCUSDT:1h", "limit": 5}]
    assert repository.created_jobs == 0
    assert repository.created_candles == 0

def test_accepts_dataset_key_shortcut() -> None:
    repository = FakeRepository([_job(created_hour=1)])

    result = list_dataset_local_fill_audit(repository, dataset_key="binance:BTCUSDT:1h")

    assert result.dataset_key == "binance:BTCUSDT:1h"
    assert result.exchange == "binance"
    assert result.symbol == "BTCUSDT"
    assert result.timeframe == "1h"
    assert len(result.items) == 1

def test_filters_out_non_local_fill_jobs() -> None:
    repository = FakeRepository(
        [
            _job(created_hour=4, source="strategy_lab_local_fill"),
            _job(created_hour=3, source="manual_import"),
            _job(created_hour=2, job_type="repair"),
            _job(created_hour=1, dataset_key="binance:ETHUSDT:1h"),
        ]
    )

    result = list_dataset_local_fill_audit(
        repository,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
    )

    assert len(result.items) == 1
    assert result.items[0].preview_id == "preview-4"

def test_serializes_failure_reason_provider_status_and_trace_metadata() -> None:
    repository = FakeRepository(
        [
            _job(
                status="failed",
                rows_imported=0,
                metadata={
                    "reasonCode": "dataset_fill_provider_rate_limited",
                    "providerStatus": "429",
                    "rowsFetched": 0,
                    "rowsInserted": 0,
                    "rowsSkippedExisting": 0,
                },
            )
        ]
    )

    result = list_dataset_local_fill_audit(
        repository,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
    )

    item = result.items[0]
    assert item.status == "failed"
    assert item.rows_imported == 0
    assert item.rows_fetched == 0
    assert item.rows_inserted == 0
    assert item.rows_skipped_existing == 0
    assert item.error_message == "Binance public klines request failed."
    assert item.reason_code == "dataset_fill_provider_rate_limited"
    assert item.provider_status == "429"
    assert item.preview_id == "preview-0"
    assert item.request_fingerprint == "fingerprint-0"
    assert item.missing_ranges
    assert item.range_results

def test_sanitizes_secret_like_metadata_from_nested_ranges() -> None:
    repository = FakeRepository(
        [
            _job(
                metadata={
                    "missingRanges": [
                        {
                            "startAt": _dt(0),
                            "endAt": _dt(1),
                            "kind": "tail",
                            "apiSecret": "hidden",
                            "nested": {"token": "hidden", "safe": "kept"},
                        }
                    ],
                    "rangeResults": [{"secret": "hidden", "rowsInserted": 1}],
                },
            )
        ]
    )

    result = list_dataset_local_fill_audit(repository, dataset_key="binance:BTCUSDT:1h")

    assert "apiSecret" not in result.items[0].missing_ranges[0]
    assert "token" not in result.items[0].missing_ranges[0]["nested"]
    assert result.items[0].missing_ranges[0]["nested"]["safe"] == "kept"
    assert "secret" not in result.items[0].range_results[0]

@pytest.mark.parametrize(
    ("kwargs", "reason_code"),
    [
        ({}, "dataset_context_required"),
        ({"dataset_key": "bad-key"}, "dataset_context_invalid"),
        ({"exchange": "binance", "symbol": "BTCUSDT"}, "dataset_context_required"),
        ({"exchange": "binance", "symbol": "BTCUSDT", "timeframe": "1h", "limit": 0}, "local_fill_audit_limit_invalid"),
        ({"exchange": "binance", "symbol": "BTCUSDT", "timeframe": "1h", "limit": 11}, "local_fill_audit_limit_invalid"),
    ],
)
def test_validation_errors(kwargs: dict[str, object], reason_code: str) -> None:
    repository = FakeRepository([])

    with pytest.raises(DatasetLocalFillAuditValidationError) as raised:
        list_dataset_local_fill_audit(repository, **kwargs)

    assert raised.value.reason_code == reason_code
