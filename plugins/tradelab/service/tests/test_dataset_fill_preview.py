from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from tradelab_api.services.dataset_fill_preview import (
    DatasetFillPreviewValidationError,
    build_dataset_fill_preview,
)
from tradelab_api.services.market_data_repository import build_dataset_key


def _dt(hour: int) -> datetime:
    return datetime(2026, 1, 1, hour, tzinfo=timezone.utc)


def _candle(hour: int) -> dict[str, object]:
    timestamp = _dt(hour)
    return {
        "open_time": timestamp,
        "close_time": timestamp,
        "open": 100 + hour,
        "high": 101 + hour,
        "low": 99 + hour,
        "close": 100 + hour,
        "volume": 10,
    }


def _coverage(*, coverage_id, start_hour: int, end_hour: int, segment_count: int = 1, gap_count: int = 0):
    return SimpleNamespace(
        id=coverage_id,
        dataset_key=build_dataset_key("binance", "BTCUSDT", "1h"),
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        health_status="healthy" if gap_count == 0 else "incomplete",
        earliest_open_time=_dt(start_hour),
        latest_open_time=_dt(end_hour),
        covered_start_at=_dt(start_hour),
        covered_end_at=_dt(end_hour),
        segment_count=segment_count,
        gap_count=gap_count,
        metadata_={"source": "preview-test"},
    )


def _segment(coverage_id, start_hour: int, end_hour: int, index: int = 0):
    return SimpleNamespace(
        coverage_id=coverage_id,
        segment_index=index,
        start_at=_dt(start_hour),
        end_at=_dt(end_hour),
        row_count=end_hour - start_hour + 1,
    )


class FakeMarketDataRepository:
    def __init__(
        self,
        *,
        candles: list[dict[str, object]],
        coverage: object | None = None,
        segments: list[object] | None = None,
        active_job: object | None = None,
    ) -> None:
        self.candles = candles
        self.coverage = coverage
        self.segments = segments or []
        self.active_job = active_job
        self.created_import_jobs = 0
        self.created_market_candles = 0

    def get_coverage(self, *, dataset_key: str):
        return self.coverage if self.coverage and getattr(self.coverage, "dataset_key", None) == dataset_key else None

    def list_coverage_segments(self, *, coverage_id):
        return [segment for segment in self.segments if str(segment.coverage_id) == str(coverage_id)]

    def list_market_candle_source_summary(self, **kwargs):
        return []

    def list_market_candles(self, **kwargs):
        start_at = kwargs.get("start_at")
        end_at = kwargs.get("end_at")
        rows = self.candles
        if start_at is not None:
            rows = [row for row in rows if row["open_time"] >= start_at]
        if end_at is not None:
            rows = [row for row in rows if row["open_time"] <= end_at]
        return [SimpleNamespace(**row) for row in rows]

    def find_compatible_active_import_job(self, **kwargs):
        return self.active_job

    def create_import_job(self, **fields):
        self.created_import_jobs += 1
        raise AssertionError("Preview must not create import jobs.")

    def create_market_candles(self, candles):
        self.created_market_candles += 1
        raise AssertionError("Preview must not create market candles.")


def test_preview_returns_covered_summary_without_mutation() -> None:
    coverage_id = uuid4()
    repository = FakeMarketDataRepository(
        candles=[_candle(0), _candle(1), _candle(2)],
        coverage=_coverage(coverage_id=coverage_id, start_hour=0, end_hour=2),
        segments=[_segment(coverage_id, 0, 2)],
    )

    preview = build_dataset_fill_preview(
        repository,
        strategy_id=uuid4(),
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        requested_start_at=_dt(0),
        requested_end_at=_dt(2),
        source="strategy_lab",
        generated_at=_dt(10),
    )

    assert preview.dataset_key == "binance:BTCUSDT:1h"
    assert preview.coverage_status == "covered"
    assert preview.gap_count == 0
    assert preview.estimated_rows == 0
    assert preview.blocked_reasons == []
    assert preview.safety_status == "preview_only"
    assert len(preview.preview_id) == 64
    assert len(preview.request_fingerprint) == 64
    assert repository.created_import_jobs == 0
    assert repository.created_market_candles == 0


def test_preview_estimates_missing_tail_rows() -> None:
    coverage_id = uuid4()
    repository = FakeMarketDataRepository(
        candles=[_candle(0), _candle(1), _candle(2)],
        coverage=_coverage(coverage_id=coverage_id, start_hour=0, end_hour=2),
        segments=[_segment(coverage_id, 0, 2)],
    )

    preview = build_dataset_fill_preview(
        repository,
        strategy_id=uuid4(),
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        requested_start_at=_dt(0),
        requested_end_at=_dt(4),
        source="strategy_lab",
        generated_at=_dt(10),
    )

    assert preview.coverage_status == "partial"
    assert preview.gap_count == 1
    assert preview.estimated_rows == 2
    assert preview.missing_ranges[0]["kind"] == "tail"


def test_preview_marks_fully_missing_dataset() -> None:
    repository = FakeMarketDataRepository(candles=[])

    preview = build_dataset_fill_preview(
        repository,
        strategy_id=uuid4(),
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        requested_start_at=_dt(0),
        requested_end_at=_dt(2),
        source="strategy_lab",
        generated_at=_dt(10),
    )

    assert preview.coverage_status == "missing"
    assert preview.gap_count == 1
    assert preview.estimated_rows == 3
    assert preview.missing_ranges == [{"start_at": _dt(0), "end_at": _dt(2), "kind": "fill"}]


def test_preview_reports_active_job_as_blocked_reason() -> None:
    coverage_id = uuid4()
    active_job = SimpleNamespace(id=uuid4(), job_type="fill")
    repository = FakeMarketDataRepository(
        candles=[_candle(1), _candle(2)],
        coverage=_coverage(coverage_id=coverage_id, start_hour=1, end_hour=2),
        segments=[_segment(coverage_id, 1, 2)],
        active_job=active_job,
    )

    preview = build_dataset_fill_preview(
        repository,
        strategy_id=uuid4(),
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        requested_start_at=_dt(0),
        requested_end_at=_dt(2),
        source="strategy_lab",
        generated_at=_dt(10),
    )

    assert preview.blocked_reasons == ["active_job_exists"]
    assert preview.active_job_id == str(active_job.id)
    assert preview.active_job_type == "fill"


def test_preview_rejects_missing_and_invalid_ranges() -> None:
    repository = FakeMarketDataRepository(candles=[])

    with pytest.raises(DatasetFillPreviewValidationError) as missing_error:
        build_dataset_fill_preview(
            repository,
            strategy_id=uuid4(),
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            requested_start_at=None,
            requested_end_at=_dt(2),
            source="strategy_lab",
            generated_at=_dt(10),
        )
    assert missing_error.value.reason_code == "dataset_fill_preview_missing_range"

    with pytest.raises(DatasetFillPreviewValidationError) as invalid_error:
        build_dataset_fill_preview(
            repository,
            strategy_id=uuid4(),
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            requested_start_at=_dt(2),
            requested_end_at=_dt(2),
            source="strategy_lab",
            generated_at=_dt(10),
        )
    assert invalid_error.value.reason_code == "dataset_fill_preview_invalid_range"


def test_preview_rejects_unsupported_timeframe() -> None:
    repository = FakeMarketDataRepository(candles=[])

    with pytest.raises(DatasetFillPreviewValidationError) as error:
        build_dataset_fill_preview(
            repository,
            strategy_id=uuid4(),
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="weird",
            requested_start_at=_dt(0),
            requested_end_at=_dt(2),
            source="strategy_lab",
            generated_at=_dt(10),
        )

    assert error.value.reason_code == "dataset_fill_preview_unsupported_timeframe"


def test_preview_fingerprint_is_deterministic() -> None:
    coverage_id = uuid4()
    repository = FakeMarketDataRepository(
        candles=[_candle(0), _candle(1), _candle(2)],
        coverage=_coverage(coverage_id=coverage_id, start_hour=0, end_hour=2),
        segments=[_segment(coverage_id, 0, 2)],
    )
    request = dict(
        strategy_id=uuid4(),
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        requested_start_at=_dt(0),
        requested_end_at=_dt(2),
        source="strategy_lab",
        generated_at=_dt(10),
    )

    first = build_dataset_fill_preview(repository, **request)
    second = build_dataset_fill_preview(repository, **request)

    assert second.request_fingerprint == first.request_fingerprint
    assert second.preview_id == first.preview_id
