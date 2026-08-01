from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

from tradelab_api.services.market_data_preflight import build_preflight_result
from tradelab_api.services.market_data_repository import build_dataset_key


def _candle(hour: int, *, close: float | None = None, source: str = "binance") -> dict[str, object]:
    timestamp = datetime(2026, 1, 1, hour, tzinfo=timezone.utc)
    return {
        "open_time": timestamp,
        "close_time": timestamp,
        "open": 100 + hour,
        "high": 101 + hour,
        "low": 99 + hour,
        "close": 100 + hour if close is None else close,
        "volume": 10,
        "source": source,
    }


def _segment(coverage_id, start_hour: int, end_hour: int, index: int = 0) -> SimpleNamespace:  # noqa: ANN001
    return SimpleNamespace(
        coverage_id=coverage_id,
        segment_index=index,
        start_at=datetime(2026, 1, 1, start_hour, tzinfo=timezone.utc),
        end_at=datetime(2026, 1, 1, end_hour, tzinfo=timezone.utc),
        row_count=end_hour - start_hour + 1,
    )


class FakeMarketDataRepository:
    def __init__(self, *, candles: list[dict[str, object]], coverage: object | None = None, segments: list[object] | None = None, active_job: object | None = None) -> None:
        self.candles = candles
        self.coverage = coverage
        self.segments = segments or []
        self.active_job = active_job

    def get_coverage(self, *, dataset_key: str):  # noqa: ANN001
        return self.coverage if self.coverage and getattr(self.coverage, "dataset_key", None) == dataset_key else None

    def list_coverage_segments(self, *, coverage_id):  # noqa: ANN001
        return [
            segment
            for segment in self.segments
            if str(getattr(segment, "coverage_id", None)) == str(coverage_id)
        ]

    def list_market_candles(self, **kwargs):  # noqa: ANN001
        start_at = kwargs.get("start_at")
        end_at = kwargs.get("end_at")
        rows = self.candles
        if start_at is not None:
            rows = [row for row in rows if row["open_time"] >= start_at]
        if end_at is not None:
            rows = [row for row in rows if row["open_time"] <= end_at]
        return [SimpleNamespace(**row) for row in rows]

    def list_market_candle_source_summary(self, *, exchange: str, symbol: str, timeframe: str, start_at, end_at):  # noqa: ANN001
        from collections import Counter
        rows = [
            row for row in self.candles
            if row["open_time"] >= start_at and row["open_time"] <= end_at
        ]
        counts: Counter[str] = Counter()
        for row in rows:
            counts[row.get("source", "unknown")] += 1
        from tradelab_api.services.market_data_repository import MarketCandleSourceSummary
        return [MarketCandleSourceSummary(source=s, row_count=c) for s, c in sorted(counts.items())]

    def find_compatible_active_import_job(self, **kwargs):  # noqa: ANN001
        return self.active_job


def test_preflight_ready_when_range_is_fully_covered() -> None:
    coverage_id = uuid4()
    coverage = SimpleNamespace(
        id=coverage_id,
        dataset_key=build_dataset_key("binance", "BTCUSDT", "1h"),
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        health_status="healthy",
        earliest_open_time=datetime(2026, 1, 1, 0, tzinfo=timezone.utc),
        latest_open_time=datetime(2026, 1, 1, 2, tzinfo=timezone.utc),
        covered_start_at=datetime(2026, 1, 1, 0, tzinfo=timezone.utc),
        covered_end_at=datetime(2026, 1, 1, 2, tzinfo=timezone.utc),
        segment_count=1,
        gap_count=0,
        metadata_={},
    )
    repository = FakeMarketDataRepository(
        candles=[_candle(0), _candle(1), _candle(2)],
        coverage=coverage,
        segments=[_segment(coverage_id, 0, 2)],
    )

    result = build_preflight_result(
        repository,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        requested_start_at=datetime(2026, 1, 1, 0, tzinfo=timezone.utc),
        requested_end_at=datetime(2026, 1, 1, 2, tzinfo=timezone.utc),
    )

    assert result.outcome == "ready"
    assert result.action is None
    assert result.missing_segments == []


def test_preflight_marks_head_gap_as_fill() -> None:
    coverage_id = uuid4()
    coverage = SimpleNamespace(
        id=coverage_id,
        dataset_key=build_dataset_key("binance", "BTCUSDT", "1h"),
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        health_status="healthy",
        earliest_open_time=datetime(2026, 1, 1, 1, tzinfo=timezone.utc),
        latest_open_time=datetime(2026, 1, 1, 3, tzinfo=timezone.utc),
        covered_start_at=datetime(2026, 1, 1, 1, tzinfo=timezone.utc),
        covered_end_at=datetime(2026, 1, 1, 3, tzinfo=timezone.utc),
        segment_count=1,
        gap_count=0,
        metadata_={},
    )
    repository = FakeMarketDataRepository(
        candles=[_candle(1), _candle(2), _candle(3)],
        coverage=coverage,
        segments=[_segment(coverage_id, 1, 3)],
    )

    result = build_preflight_result(
        repository,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        requested_start_at=datetime(2026, 1, 1, 0, tzinfo=timezone.utc),
        requested_end_at=datetime(2026, 1, 1, 3, tzinfo=timezone.utc),
    )

    assert result.outcome == "needs_fill"
    assert result.action == "fill"
    assert result.missing_segments[0].kind == "head"


def test_preflight_marks_tail_gap_as_fill() -> None:
    coverage_id = uuid4()
    coverage = SimpleNamespace(
        id=coverage_id,
        dataset_key=build_dataset_key("binance", "BTCUSDT", "1h"),
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        health_status="healthy",
        earliest_open_time=datetime(2026, 1, 1, 0, tzinfo=timezone.utc),
        latest_open_time=datetime(2026, 1, 1, 2, tzinfo=timezone.utc),
        covered_start_at=datetime(2026, 1, 1, 0, tzinfo=timezone.utc),
        covered_end_at=datetime(2026, 1, 1, 2, tzinfo=timezone.utc),
        segment_count=1,
        gap_count=0,
        metadata_={},
    )
    repository = FakeMarketDataRepository(
        candles=[_candle(0), _candle(1), _candle(2)],
        coverage=coverage,
        segments=[_segment(coverage_id, 0, 2)],
    )

    result = build_preflight_result(
        repository,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        requested_start_at=datetime(2026, 1, 1, 0, tzinfo=timezone.utc),
        requested_end_at=datetime(2026, 1, 1, 3, tzinfo=timezone.utc),
    )

    assert result.outcome == "needs_fill"
    assert result.action == "fill"
    assert result.missing_segments[0].kind == "tail"


def test_preflight_marks_internal_gap_for_repair() -> None:
    coverage_id = uuid4()
    coverage = SimpleNamespace(
        id=coverage_id,
        dataset_key=build_dataset_key("binance", "BTCUSDT", "1h"),
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        health_status="incomplete",
        earliest_open_time=datetime(2026, 1, 1, 0, tzinfo=timezone.utc),
        latest_open_time=datetime(2026, 1, 1, 3, tzinfo=timezone.utc),
        covered_start_at=datetime(2026, 1, 1, 0, tzinfo=timezone.utc),
        covered_end_at=datetime(2026, 1, 1, 3, tzinfo=timezone.utc),
        segment_count=2,
        gap_count=1,
        metadata_={},
    )
    repository = FakeMarketDataRepository(
        candles=[_candle(0), _candle(2), _candle(3)],
        coverage=coverage,
        segments=[_segment(coverage_id, 0, 0, 0), _segment(coverage_id, 2, 3, 1)],
    )

    result = build_preflight_result(
        repository,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        requested_start_at=datetime(2026, 1, 1, 0, tzinfo=timezone.utc),
        requested_end_at=datetime(2026, 1, 1, 3, tzinfo=timezone.utc),
    )

    assert result.outcome == "needs_repair"
    assert result.action == "repair"
    assert any(segment.kind == "internal" for segment in result.missing_segments)


def test_preflight_marks_conflicting_dataset_as_repair() -> None:
    repository = FakeMarketDataRepository(
        candles=[
            _candle(0),
            _candle(0, close=111.0),
        ],
    )

    result = build_preflight_result(
        repository,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        requested_start_at=datetime(2026, 1, 1, 0, tzinfo=timezone.utc),
        requested_end_at=datetime(2026, 1, 1, 0, tzinfo=timezone.utc),
    )

    assert result.outcome == "needs_repair"
    assert any("integrity" in reason.lower() for reason in result.reasons)


def test_preflight_blocks_when_source_unavailable() -> None:
    repository = FakeMarketDataRepository(candles=[])

    result = build_preflight_result(
        repository,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        requested_start_at=datetime(2026, 1, 1, 0, tzinfo=timezone.utc),
        requested_end_at=datetime(2026, 1, 1, 0, tzinfo=timezone.utc),
        source_available=False,
    )

    assert result.outcome == "blocked"
    assert result.source_blocked is True


def test_preflight_reuses_active_covering_job_when_needed() -> None:
    coverage_id = uuid4()
    active_job = SimpleNamespace(id=uuid4(), job_type="repair")
    coverage = SimpleNamespace(
        id=coverage_id,
        dataset_key=build_dataset_key("binance", "BTCUSDT", "1h"),
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        health_status="healthy",
        earliest_open_time=datetime(2026, 1, 1, 1, tzinfo=timezone.utc),
        latest_open_time=datetime(2026, 1, 1, 2, tzinfo=timezone.utc),
        covered_start_at=datetime(2026, 1, 1, 1, tzinfo=timezone.utc),
        covered_end_at=datetime(2026, 1, 1, 2, tzinfo=timezone.utc),
        segment_count=1,
        gap_count=0,
        metadata_={},
    )
    repository = FakeMarketDataRepository(
        candles=[_candle(1), _candle(2)],
        coverage=coverage,
        segments=[_segment(coverage_id, 1, 2)],
        active_job=active_job,
    )

    result = build_preflight_result(
        repository,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        requested_start_at=datetime(2026, 1, 1, 0, tzinfo=timezone.utc),
        requested_end_at=datetime(2026, 1, 1, 3, tzinfo=timezone.utc),
    )

    assert result.active_job_id == str(active_job.id)
    assert result.active_job_type == "repair"


def test_preflight_blocks_fixture_source_rows_for_binance() -> None:
    repository = FakeMarketDataRepository(
        candles=[
            _candle(0, source="tradelab-local-fill-smoke-fixture"),
            _candle(1, source="tradelab-local-fill-smoke-fixture"),
            _candle(2, source="tradelab-local-fill-smoke-fixture"),
        ],
    )

    result = build_preflight_result(
        repository,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        requested_start_at=datetime(2026, 1, 1, 0, tzinfo=timezone.utc),
        requested_end_at=datetime(2026, 1, 1, 2, tzinfo=timezone.utc),
    )

    assert result.outcome == "blocked"
    assert result.provenance_blocked is True
    assert result.provenance_reason_code == "dataset_contains_fixture_rows"
    assert result.source_blocked is False
    assert [(item.source, item.row_count) for item in result.source_summary] == [
        ("tradelab-local-fill-smoke-fixture", 3),
    ]


def test_preflight_ready_with_only_binance_rows() -> None:
    repository = FakeMarketDataRepository(
        candles=[_candle(0), _candle(1), _candle(2)],
    )

    result = build_preflight_result(
        repository,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        requested_start_at=datetime(2026, 1, 1, 0, tzinfo=timezone.utc),
        requested_end_at=datetime(2026, 1, 1, 2, tzinfo=timezone.utc),
    )

    assert result.provenance_blocked is False
    assert result.provenance_reason_code is None
