from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import re
from typing import Any, Iterable


@dataclass(slots=True)
class IntegrityIssue:
    code: str
    message: str
    open_time: datetime | None = None
    details: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class IntegritySegment:
    start_at: datetime
    end_at: datetime
    row_count: int


@dataclass(slots=True)
class IntegritySummary:
    health_status: str
    issues: list[IntegrityIssue]
    segments: list[IntegritySegment]
    earliest_open_time: datetime | None
    latest_open_time: datetime | None
    gap_count: int


def timeframe_to_timedelta(timeframe: str) -> timedelta:
    match = re.fullmatch(r"(\d+)([mhdw])", timeframe.strip().lower())
    if match is None:
        raise ValueError(f"Unsupported timeframe: {timeframe}")
    value = int(match.group(1))
    unit = match.group(2)
    if unit == "m":
        return timedelta(minutes=value)
    if unit == "h":
        return timedelta(hours=value)
    if unit == "d":
        return timedelta(days=value)
    return timedelta(weeks=value)


def inspect_candles(
    candles: Iterable[dict[str, Any]],
    *,
    timeframe: str,
    assume_complete: bool = False,
) -> IntegritySummary:
    interval = timeframe_to_timedelta(timeframe)
    rows = [_normalize_candle(row) for row in candles]
    rows.sort(key=lambda item: item["open_time"])
    issues: list[IntegrityIssue] = []
    segments: list[IntegritySegment] = []

    if not rows:
        return IntegritySummary(
            health_status="incomplete",
            issues=[],
            segments=[],
            earliest_open_time=None,
            latest_open_time=None,
            gap_count=0,
        )

    previous = rows[0]
    current_segment_start = previous["open_time"]
    current_segment_count = 1
    seen_open_times: dict[datetime, dict[str, Any]] = {previous["open_time"]: previous}
    _inspect_row(previous, issues, interval)

    for row in rows[1:]:
        open_time = row["open_time"]
        if open_time in seen_open_times:
            previous_row = seen_open_times[open_time]
            if _candle_signature(previous_row) != _candle_signature(row):
                issues.append(
                    IntegrityIssue(
                        code="duplicate_conflict",
                        message="Candles with the same open time have conflicting OHLCV values.",
                        open_time=open_time,
                        details={"existing": _candle_signature(previous_row), "incoming": _candle_signature(row)},
                    )
                )
            else:
                issues.append(
                    IntegrityIssue(
                        code="duplicate",
                        message="Duplicate candle detected for canonical key.",
                        open_time=open_time,
                    )
                )
            continue

        seen_open_times[open_time] = row
        gap = open_time - previous["open_time"]
        if gap != interval:
            segments.append(
                IntegritySegment(
                    start_at=current_segment_start,
                    end_at=previous["open_time"],
                    row_count=current_segment_count,
                )
            )
            current_segment_start = open_time
            current_segment_count = 1
            expected_next = previous["open_time"] + interval
            if open_time > expected_next:
                issues.append(
                    IntegrityIssue(
                        code="internal_gap",
                        message="Internal gap detected inside an otherwise covered dataset.",
                        open_time=expected_next,
                        details={"gapStart": expected_next.isoformat(), "gapEnd": (open_time - interval).isoformat()},
                    )
                )
        else:
            current_segment_count += 1

        _inspect_row(row, issues, interval)

        previous = row

    segments.append(
        IntegritySegment(
            start_at=current_segment_start,
            end_at=previous["open_time"],
            row_count=current_segment_count,
        )
    )

    gap_count = max(len(segments) - 1, 0)
    severe_issue_codes = {"duplicate_conflict", "grid_misalignment", "impossible_ohlcv", "negative_volume"}
    if issues and any(issue.code in severe_issue_codes for issue in issues):
        health_status = "suspect"
    elif issues and assume_complete:
        health_status = "suspect"
    elif issues:
        health_status = "incomplete"
    elif gap_count > 0:
        health_status = "incomplete"
    else:
        health_status = "healthy"

    return IntegritySummary(
        health_status=health_status,
        issues=issues,
        segments=segments,
        earliest_open_time=rows[0]["open_time"],
        latest_open_time=rows[-1]["open_time"],
        gap_count=gap_count,
    )


def _normalize_candle(row: dict[str, Any]) -> dict[str, Any]:
    open_time = _parse_datetime(row["open_time"])
    return {
        "open_time": open_time,
        "close_time": _parse_datetime(row.get("close_time") or row["open_time"]),
        "open": _to_decimal(row["open"]),
        "high": _to_decimal(row["high"]),
        "low": _to_decimal(row["low"]),
        "close": _to_decimal(row["close"]),
        "volume": _to_decimal(row["volume"]),
    }


def _parse_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def _to_decimal(value: Any) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _inspect_row(row: dict[str, Any], issues: list[IntegrityIssue], interval: timedelta) -> None:
    open_time = row["open_time"]
    if _is_misaligned(open_time, interval):
        issues.append(
            IntegrityIssue(
                code="grid_misalignment",
                message="Candle open time is not aligned to the timeframe grid.",
                open_time=open_time,
            )
        )

    if _is_impossible_candle(row):
        issues.append(
            IntegrityIssue(
                code="impossible_ohlcv",
                message="Candle OHLCV relationships are impossible.",
                open_time=open_time,
            )
        )

    if row["volume"] < 0:
        issues.append(
            IntegrityIssue(
                code="negative_volume",
                message="Candle volume cannot be negative.",
                open_time=open_time,
            )
        )


def _is_misaligned(open_time: datetime, interval: timedelta) -> bool:
    epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
    elapsed = open_time.astimezone(timezone.utc) - epoch
    interval_seconds = int(interval.total_seconds())
    if interval_seconds <= 0:
        return False
    return int(elapsed.total_seconds()) % interval_seconds != 0


def _is_impossible_candle(row: dict[str, Any]) -> bool:
    high = row["high"]
    low = row["low"]
    open_price = row["open"]
    close = row["close"]
    return high < max(open_price, close) or low > min(open_price, close) or high < low


def _candle_signature(row: dict[str, Any]) -> tuple[Any, ...]:
    return (row["open"], row["high"], row["low"], row["close"], row["volume"], row["close_time"])
