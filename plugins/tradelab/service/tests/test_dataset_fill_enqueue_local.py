from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from tradelab_api.services.dataset_fill_enqueue_local import (
    DatasetFillEnqueueLocalValidationError,
    enqueue_dataset_fill_local,
)


def _dt(hour: int) -> datetime:
    return datetime(2026, 1, 1, hour, tzinfo=timezone.utc)


def _settings(*, enabled: bool = True, environment: str = "local") -> SimpleNamespace:
    return SimpleNamespace(tradelab_local_fill_enabled=enabled, tradelab_environment=environment)


def _missing_range(start_hour: int = 3, end_hour: int = 6) -> dict[str, object]:
    return {"start_at": _dt(start_hour), "end_at": _dt(end_hour), "kind": "tail"}


def _job(status: str, *, source: str = "background_fill_enqueue") -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        dataset_key="binance:BTCUSDT:1h",
        job_type="fill",
        status=status,
        requested_start_at=_dt(0),
        requested_end_at=_dt(6),
        applied_start_at=_dt(0),
        applied_end_at=_dt(6),
        start_at=_dt(0),
        end_at=_dt(6),
        metadata_={
            "source": source,
            "missingRanges": [{"startAt": _dt(3).isoformat(), "endAt": _dt(6).isoformat(), "kind": "tail"}],
        },
        is_active=True,
        is_deleted=False,
    )


class FakeRepository:
    def __init__(self, active_jobs: list[SimpleNamespace] | None = None) -> None:
        self.active_jobs = active_jobs or []
        self.created_jobs: list[dict[str, object]] = []
        self.candles_created: list[object] = []
        self.claims = 0

    def get_coverage(self, *, dataset_key: str):
        return None

    def list_coverage_segments(self, *, coverage_id):
        return []

    def list_market_candle_source_summary(self, **kwargs):
        return []

    def list_market_candles(self, *, exchange: str, symbol: str, timeframe: str, start_at=None, end_at=None):
        candles = [
            SimpleNamespace(
                open_time=_dt(hour),
                close_time=_dt(hour),
                open=1,
                high=1,
                low=1,
                close=1,
                volume=1,
            )
            for hour in (0, 1, 2)
        ]
        if start_at is not None:
            candles = [candle for candle in candles if candle.open_time >= start_at]
        if end_at is not None:
            candles = [candle for candle in candles if candle.open_time <= end_at]
        return candles

    def find_compatible_active_import_job(self, *, dataset_key: str, job_type: str, start_at: datetime, end_at: datetime):
        return None

    def list_active_fill_jobs_for_dataset(self, *, dataset_key: str):
        return [
            job
            for job in self.active_jobs
            if job.dataset_key == dataset_key and job.status in {"queued", "running", "cancel_requested", "stale"}
        ]

    def create_import_job(self, **fields):
        self.created_jobs.append(fields)
        return SimpleNamespace(id=uuid4(), created_at=_dt(0), **fields)

    def create_market_candles(self, candles):
        self.candles_created.extend(candles)
        raise AssertionError("Enqueue must not create market candles.")

    def claim_next_queued_import_job(self, *, worker_id: str):
        self.claims += 1
        raise AssertionError("Enqueue must not claim jobs.")


def _call(repository: FakeRepository, **overrides):
    kwargs = {
        "strategy_id": uuid4(),
        "exchange": "binance",
        "symbol": "BTCUSDT",
        "timeframe": "1h",
        "requested_start_at": _dt(0),
        "requested_end_at": _dt(6),
        "preview_id": "",
        "request_fingerprint": "",
        "missing_ranges": [_missing_range()],
        "confirm_local_fill": True,
        "source": "strategy_lab",
        "settings": _settings(),
        "generated_at": _dt(12),
    }
    kwargs.update(overrides)
    preview = enqueue_dataset_fill_local.preview_builder(
        repository,
        strategy_id=kwargs["strategy_id"],
        exchange=kwargs["exchange"],
        symbol=kwargs["symbol"],
        timeframe=kwargs["timeframe"],
        requested_start_at=kwargs["requested_start_at"],
        requested_end_at=kwargs["requested_end_at"],
        source=kwargs["source"],
        generated_at=kwargs["generated_at"],
    )
    if "preview_id" not in overrides:
        kwargs["preview_id"] = preview.preview_id
    if "request_fingerprint" not in overrides:
        kwargs["request_fingerprint"] = preview.request_fingerprint
    return enqueue_dataset_fill_local(repository, **kwargs)


def test_enqueue_creates_queued_import_job_without_provider_or_candles() -> None:
    repository = FakeRepository()

    result = _call(repository)

    assert result.status == "queued"
    assert result.safety_status == "queued_local_dev"
    assert result.dataset_key == "binance:BTCUSDT:1h"
    assert result.missing_range_count == 1
    assert len(repository.created_jobs) == 1
    fields = repository.created_jobs[0]
    assert fields["job_type"] == "fill"
    assert fields["status"] == "queued"
    assert fields["rows_imported"] == 0
    assert fields["claimed_at"] is None
    assert fields["started_at"] is None
    assert fields["finished_at"] is None
    assert fields["worker_id"] is None
    assert fields["created_by"] == "trade-lab-background-fill-enqueue"
    assert fields["metadata_"]["source"] == "background_fill_enqueue"
    assert fields["metadata_"]["mode"] == "local_dev"
    assert fields["metadata_"]["requestSource"] == "strategy_lab"
    assert fields["metadata_"]["attemptCount"] == 0
    assert repository.candles_created == []
    assert repository.claims == 0


@pytest.mark.parametrize(
    ("settings", "reason_code"),
    [
        (_settings(enabled=False), "dataset_fill_enqueue_local_disabled"),
        (_settings(environment="production"), "dataset_fill_enqueue_environment_not_allowed"),
    ],
)
def test_enqueue_static_guards_do_not_create_job(settings: SimpleNamespace, reason_code: str) -> None:
    repository = FakeRepository()

    with pytest.raises(DatasetFillEnqueueLocalValidationError) as exc:
        _call(repository, settings=settings)

    assert exc.value.reason_code == reason_code
    assert repository.created_jobs == []


def test_enqueue_requires_confirmation() -> None:
    repository = FakeRepository()

    with pytest.raises(DatasetFillEnqueueLocalValidationError) as exc:
        _call(repository, confirm_local_fill=False)

    assert exc.value.reason_code == "dataset_fill_enqueue_confirm_required"
    assert repository.created_jobs == []


def test_enqueue_requires_matching_preview_fingerprint() -> None:
    repository = FakeRepository()

    with pytest.raises(DatasetFillEnqueueLocalValidationError) as exc:
        _call(repository, request_fingerprint="wrong")

    assert exc.value.reason_code == "dataset_fill_enqueue_fingerprint_mismatch"
    assert repository.created_jobs == []


def test_enqueue_requires_missing_ranges_matching_preview() -> None:
    repository = FakeRepository()

    with pytest.raises(DatasetFillEnqueueLocalValidationError) as exc:
        _call(repository, missing_ranges=[])

    assert exc.value.reason_code == "dataset_fill_enqueue_missing_ranges_required"
    assert repository.created_jobs == []


@pytest.mark.parametrize("status", ["queued", "running", "cancel_requested", "stale"])
def test_enqueue_blocks_duplicate_active_job(status: str) -> None:
    repository = FakeRepository(active_jobs=[_job(status)])

    with pytest.raises(DatasetFillEnqueueLocalValidationError) as exc:
        _call(repository)

    assert exc.value.reason_code == "dataset_fill_job_already_active"
    assert exc.value.details["status"] == status
    assert repository.created_jobs == []


@pytest.mark.parametrize("status", ["completed", "failed", "cancelled"])
def test_enqueue_allows_terminal_jobs(status: str) -> None:
    repository = FakeRepository(active_jobs=[_job(status)])

    result = _call(repository)

    assert result.status == "queued"
    assert len(repository.created_jobs) == 1
