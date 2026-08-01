from __future__ import annotations

from tradelab_api.services.market_data_integrity import inspect_candles


def _candle(open_time: str, *, open_price: float = 100.0, high: float = 105.0, low: float = 95.0, close: float = 100.0, volume: float = 10.0) -> dict[str, object]:
    return {
        "open_time": open_time,
        "close_time": open_time,
        "open": open_price,
        "high": high,
        "low": low,
        "close": close,
        "volume": volume,
    }


def test_contiguous_dataset_is_healthy() -> None:
    summary = inspect_candles(
        [
            _candle("2026-01-01T00:00:00Z"),
            _candle("2026-01-01T01:00:00Z"),
            _candle("2026-01-01T02:00:00Z"),
        ],
        timeframe="1h",
    )

    assert summary.health_status == "healthy"
    assert summary.gap_count == 0
    assert len(summary.segments) == 1


def test_duplicate_conflict_marks_dataset_suspect() -> None:
    summary = inspect_candles(
        [
            _candle("2026-01-01T00:00:00Z"),
            _candle("2026-01-01T00:00:00Z", close=110.0),
        ],
        timeframe="1h",
    )

    assert summary.health_status == "suspect"
    assert any(issue.code == "duplicate_conflict" for issue in summary.issues)


def test_grid_misalignment_marks_dataset_suspect() -> None:
    summary = inspect_candles(
        [
            _candle("2026-01-01T00:30:00Z"),
            _candle("2026-01-01T01:30:00Z"),
        ],
        timeframe="1h",
    )

    assert summary.health_status == "suspect"
    assert any(issue.code == "grid_misalignment" for issue in summary.issues)


def test_internal_gap_marks_dataset_incomplete() -> None:
    summary = inspect_candles(
        [
            _candle("2026-01-01T00:00:00Z"),
            _candle("2026-01-01T02:00:00Z"),
        ],
        timeframe="1h",
    )

    assert summary.health_status == "incomplete"
    assert summary.gap_count == 1
    assert len(summary.segments) == 2


def test_negative_volume_marks_dataset_suspect() -> None:
    summary = inspect_candles(
        [
            _candle("2026-01-01T00:00:00Z", volume=-1.0),
        ],
        timeframe="1h",
    )

    assert summary.health_status == "suspect"
    assert any(issue.code == "negative_volume" for issue in summary.issues)
