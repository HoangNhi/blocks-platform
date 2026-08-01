from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from tradelab_api.services.dataset_fill_job_visibility import (
    DatasetFillJobVisibilityValidationError,
    list_dataset_fill_job_visibility,
)


def _dt(hour: int) -> datetime:
    return datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(hours=hour)


def _job(
    *,
    dataset_key: str = "binance:BTCUSDT:1h",
    job_type: str = "fill",
    status: str = "completed",
    created_hour: int = 0,
    rows_imported: int = 4,
    metadata: dict[str, object] | None = None,
) -> SimpleNamespace:
    base_metadata: dict[str, object] = {
        "source": "strategy_lab_local_fill",
        "previewId": f"preview-{created_hour}",
        "requestFingerprint": f"fingerprint-{created_hour}",
        "rowsFetched": 5,
        "rowsInserted": 4,
        "rowsSkippedExisting": 1,
        "attemptCount": 2,
        "heartbeatAt": _dt(created_hour).isoformat(),
        "reasonCode": None,
        "providerStatus": None,
        "safeNested": {"value": "kept"},
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
        finished_at=None if status in {"queued", "running", "cancel_requested", "stale"} else _dt(created_hour + 1),
        worker_id="worker-a",
        start_at=_dt(0),
        end_at=_dt(6),
        status=status,
        rows_imported=rows_imported,
        error_message="provider failed" if status == "failed" else None,
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
        self.mutations: list[str] = []

    def list_fill_visibility_active_jobs(self, *, dataset_key: str, limit: int):
        self.calls.append({"method": "active", "dataset_key": dataset_key, "limit": limit})
        statuses = {"queued", "running", "cancel_requested", "stale"}
        return [
            job
            for job in self.jobs
            if job.dataset_key == dataset_key
            and job.job_type == "fill"
            and job.status in statuses
            and job.is_active is True
            and job.is_deleted is False
        ][:limit]

    def list_fill_visibility_recent_jobs(self, *, dataset_key: str, limit: int):
        self.calls.append({"method": "recent", "dataset_key": dataset_key, "limit": limit})
        statuses = {"completed", "failed", "cancelled", "stale"}
        return [
            job
            for job in self.jobs
            if job.dataset_key == dataset_key
            and job.job_type == "fill"
            and job.status in statuses
            and job.is_active is True
            and job.is_deleted is False
        ][:limit]

    def create_import_job(self, **fields):
        self.mutations.append("create_import_job")
        raise AssertionError("Fill job visibility must not create import jobs.")

    def create_market_candles(self, candles):
        self.mutations.append("create_market_candles")
        raise AssertionError("Fill job visibility must not create candles.")

    def claim_next_queued_import_job(self, *, worker_id: str):
        self.mutations.append("claim_next_queued_import_job")
        raise AssertionError("Fill job visibility must not claim jobs.")


def test_lists_active_and_recent_jobs_for_dataset_key() -> None:
    repository = FakeRepository(
        [
            _job(status="queued", created_hour=0),
            _job(status="running", created_hour=1),
            _job(status="stale", created_hour=2),
            _job(status="completed", created_hour=3),
            _job(
                status="failed",
                created_hour=4,
                rows_imported=0,
                metadata={"reasonCode": "dataset_fill_provider_rate_limited", "providerStatus": "429"},
            ),
            _job(status="cancelled", created_hour=5),
            _job(status="completed", dataset_key="binance:ETHUSDT:1h", created_hour=6),
            _job(status="completed", job_type="repair", created_hour=7),
        ]
    )

    result = list_dataset_fill_job_visibility(repository, dataset_key="binance:BTCUSDT:1h", limit=5)

    assert result.dataset_key == "binance:BTCUSDT:1h"
    assert result.exchange == "binance"
    assert result.symbol == "BTCUSDT"
    assert result.timeframe == "1h"
    assert result.safety_status == "read_only"
    assert [item.status for item in result.active] == ["queued", "running", "stale"]
    assert [item.status for item in result.recent] == ["completed", "failed", "cancelled"]
    assert result.active[0].job_type == "fill"
    assert result.active[0].attempt_count == 2
    assert result.active[0].heartbeat_at == _dt(0).isoformat()
    assert result.recent[1].reason_code == "dataset_fill_provider_rate_limited"
    assert result.recent[1].provider_status == "429"
    assert repository.mutations == []


def test_accepts_exchange_symbol_timeframe_context() -> None:
    repository = FakeRepository([_job(status="completed", created_hour=1)])

    result = list_dataset_fill_job_visibility(
        repository,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
    )

    assert result.dataset_key == "binance:BTCUSDT:1h"
    assert len(result.recent) == 1
    assert repository.calls == [
        {"method": "active", "dataset_key": "binance:BTCUSDT:1h", "limit": 5},
        {"method": "recent", "dataset_key": "binance:BTCUSDT:1h", "limit": 5},
    ]


def test_default_limit_and_clamp_to_maximum() -> None:
    repository = FakeRepository([_job(status="completed", created_hour=hour) for hour in range(25)])

    list_dataset_fill_job_visibility(repository, dataset_key="binance:BTCUSDT:1h")
    list_dataset_fill_job_visibility(repository, dataset_key="binance:BTCUSDT:1h", limit=50)

    assert repository.calls[0]["limit"] == 5
    assert repository.calls[2]["limit"] == 20


def test_sanitizes_secret_like_metadata_recursively() -> None:
    repository = FakeRepository(
        [
            _job(
                status="completed",
                metadata={
                    "apiSecret": "hidden",
                    "token": "hidden",
                    "nested": {
                        "privateKey": "hidden",
                        "safe": "kept",
                        "items": [{"credential": "hidden", "visible": "yes"}],
                    },
                },
            )
        ]
    )

    result = list_dataset_fill_job_visibility(repository, dataset_key="binance:BTCUSDT:1h")

    metadata = result.recent[0].metadata
    assert "apiSecret" not in metadata
    assert "token" not in metadata
    assert "privateKey" not in metadata["nested"]
    assert metadata["nested"]["safe"] == "kept"
    assert "credential" not in metadata["nested"]["items"][0]
    assert metadata["nested"]["items"][0]["visible"] == "yes"


@pytest.mark.parametrize(
    ("kwargs", "reason_code"),
    [
        ({}, "dataset_fill_job_visibility_context_required"),
        ({"dataset_key": "bad-key"}, "dataset_fill_job_visibility_dataset_key_invalid"),
        ({"exchange": "binance", "symbol": "BTCUSDT"}, "dataset_fill_job_visibility_context_required"),
        ({"exchange": "binance", "symbol": "BTCUSDT", "timeframe": "1h", "limit": 0}, "dataset_fill_job_visibility_limit_invalid"),
    ],
)
def test_validation_errors(kwargs: dict[str, object], reason_code: str) -> None:
    repository = FakeRepository([])

    with pytest.raises(DatasetFillJobVisibilityValidationError) as raised:
        list_dataset_fill_job_visibility(repository, **kwargs)

    assert raised.value.reason_code == reason_code
