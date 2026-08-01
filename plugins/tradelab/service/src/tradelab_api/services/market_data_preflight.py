from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from tradelab_api.db.models import MarketDataCoverage

from .market_data_integrity import IntegritySummary, inspect_candles, timeframe_to_timedelta
from .market_data_repository import MarketCandleSourceSummary, MarketDataRepository, build_dataset_key


@dataclass(slots=True)
class CoverageSegmentSummary:
    start_at: datetime
    end_at: datetime
    row_count: int


@dataclass(slots=True)
class CoverageSummary:
    dataset_key: str
    exchange: str
    symbol: str
    timeframe: str
    health_status: str
    earliest_open_time: datetime | None
    latest_open_time: datetime | None
    covered_start_at: datetime | None
    covered_end_at: datetime | None
    segment_count: int
    gap_count: int
    segments: list[CoverageSegmentSummary] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class MissingRange:
    start_at: datetime
    end_at: datetime
    kind: str


@dataclass(slots=True)
class PreflightResult:
    dataset_key: str
    exchange: str
    symbol: str
    timeframe: str
    requested_start_at: datetime
    requested_end_at: datetime
    outcome: str
    action: str | None
    reasons: list[str] = field(default_factory=list)
    coverage: CoverageSummary | None = None
    missing_segments: list[MissingRange] = field(default_factory=list)
    repair_start_at: datetime | None = None
    repair_end_at: datetime | None = None
    active_job_id: str | None = None
    active_job_type: str | None = None
    integrity: IntegritySummary | None = None
    source_blocked: bool = False
    source_summary: list[MarketCandleSourceSummary] = field(default_factory=list)
    provenance_blocked: bool = False
    provenance_reason_code: str | None = None


def build_coverage_summary(
    coverage: MarketDataCoverage | None,
    *,
    repository: MarketDataRepository,
    exchange: str,
    symbol: str,
    timeframe: str,
) -> CoverageSummary:
    dataset_key = build_dataset_key(exchange, symbol, timeframe)
    if coverage is not None:
        segments = repository.list_coverage_segments(coverage_id=coverage.id)
        return CoverageSummary(
            dataset_key=coverage.dataset_key,
            exchange=coverage.exchange,
            symbol=coverage.symbol,
            timeframe=coverage.timeframe,
            health_status=coverage.health_status,
            earliest_open_time=coverage.earliest_open_time,
            latest_open_time=coverage.latest_open_time,
            covered_start_at=coverage.covered_start_at,
            covered_end_at=coverage.covered_end_at,
            segment_count=coverage.segment_count,
            gap_count=coverage.gap_count,
            segments=[
                CoverageSegmentSummary(
                    start_at=segment.start_at,
                    end_at=segment.end_at,
                    row_count=segment.row_count,
                )
                for segment in segments
            ],
            metadata=dict(coverage.metadata_ or {}),
        )

    candles = repository.list_market_candles(exchange=exchange, symbol=symbol, timeframe=timeframe)
    integrity = inspect_candles((serialize_candle(candle) for candle in candles), timeframe=timeframe)
    return CoverageSummary(
        dataset_key=dataset_key,
        exchange=exchange,
        symbol=symbol,
        timeframe=timeframe,
        health_status=integrity.health_status,
        earliest_open_time=integrity.earliest_open_time,
        latest_open_time=integrity.latest_open_time,
        covered_start_at=integrity.earliest_open_time,
        covered_end_at=integrity.latest_open_time,
        segment_count=len(integrity.segments),
        gap_count=integrity.gap_count,
        segments=[
            CoverageSegmentSummary(start_at=segment.start_at, end_at=segment.end_at, row_count=segment.row_count)
            for segment in integrity.segments
        ],
        metadata={},
    )


def build_preflight_result(
    repository: MarketDataRepository,
    *,
    exchange: str,
    symbol: str,
    timeframe: str,
    requested_start_at: datetime,
    requested_end_at: datetime,
    source_available: bool = True,
) -> PreflightResult:
    dataset_key = build_dataset_key(exchange, symbol, timeframe)
    if not source_available:
        return PreflightResult(
            dataset_key=dataset_key,
            exchange=exchange,
            symbol=symbol,
            timeframe=timeframe,
            requested_start_at=requested_start_at,
            requested_end_at=requested_end_at,
            outcome="blocked",
            action=None,
            reasons=["Source data is unavailable."],
            source_blocked=True,
        )

    coverage = repository.get_coverage(dataset_key=dataset_key)
    coverage_summary = build_coverage_summary(
        coverage,
        repository=repository,
        exchange=exchange,
        symbol=symbol,
        timeframe=timeframe,
    )
    source_summary = repository.list_market_candle_source_summary(
        exchange=exchange,
        symbol=symbol,
        timeframe=timeframe,
        start_at=requested_start_at,
        end_at=requested_end_at,
    )
    fixture_sources = [
        item.source
        for item in source_summary
        if item.source.startswith("tradelab-") and item.source.endswith("-smoke-fixture")
    ]
    if exchange.lower() == "binance" and fixture_sources:
        return PreflightResult(
            dataset_key=dataset_key,
            exchange=exchange,
            symbol=symbol,
            timeframe=timeframe,
            requested_start_at=requested_start_at,
            requested_end_at=requested_end_at,
            outcome="blocked",
            action=None,
            reasons=["Dataset contains smoke-fixture candles and cannot be used for Binance research."],
            coverage=coverage_summary,
            source_summary=source_summary,
            provenance_blocked=True,
            provenance_reason_code="dataset_contains_fixture_rows",
        )
    candles = repository.list_market_candles(
        exchange=exchange,
        symbol=symbol,
        timeframe=timeframe,
        start_at=requested_start_at,
        end_at=requested_end_at,
    )
    integrity = inspect_candles((serialize_candle(candle) for candle in candles), timeframe=timeframe)
    missing_segments = _calculate_missing_segments(
        coverage_summary=coverage_summary,
        timeframe=timeframe,
        requested_start_at=requested_start_at,
        requested_end_at=requested_end_at,
    )

    reasons: list[str] = []
    if integrity.health_status == "suspect":
        outcome = "needs_repair"
        reasons.append("Dataset integrity is suspect.")
    elif missing_segments:
        if _has_internal_gap(missing_segments):
            outcome = "needs_repair"
            reasons.append("Internal gap detected inside the requested range.")
        else:
            outcome = "needs_fill"
            reasons.append("Requested range is only missing head or tail coverage.")
    else:
        outcome = "ready"
        reasons.append("Requested range is fully covered.")

    action = None
    repair_start_at = None
    repair_end_at = None
    if outcome == "needs_fill":
        action = "fill"
    elif outcome == "needs_repair":
        action = "repair"
        repair_start_at = requested_start_at
        repair_end_at = requested_end_at

    active_job = None
    if outcome != "ready":
        active_job = repository.find_compatible_active_import_job(
            dataset_key=dataset_key,
            job_type=action or "fill",
            start_at=requested_start_at,
            end_at=requested_end_at,
        )

    return PreflightResult(
        dataset_key=dataset_key,
        exchange=exchange,
        symbol=symbol,
        timeframe=timeframe,
        requested_start_at=requested_start_at,
        requested_end_at=requested_end_at,
        outcome=outcome,
        action=action,
        reasons=reasons + [issue.message for issue in integrity.issues],
        coverage=coverage_summary,
        missing_segments=missing_segments,
        repair_start_at=repair_start_at,
        repair_end_at=repair_end_at,
        active_job_id=str(active_job.id) if active_job is not None else None,
        active_job_type=active_job.job_type if active_job is not None else None,
        integrity=integrity,
        source_summary=source_summary,
    )


def serialize_candle(candle: Any) -> dict[str, Any]:
    return {
        "open_time": candle.open_time,
        "close_time": getattr(candle, "close_time", candle.open_time),
        "open": candle.open,
        "high": candle.high,
        "low": candle.low,
        "close": candle.close,
        "volume": candle.volume,
    }


def _calculate_missing_segments(
    *,
    coverage_summary: CoverageSummary,
    timeframe: str,
    requested_start_at: datetime,
    requested_end_at: datetime,
) -> list[MissingRange]:
    interval = timeframe_to_timedelta(timeframe)
    segments = coverage_summary.segments
    if not segments:
        return [MissingRange(start_at=requested_start_at, end_at=requested_end_at, kind="fill")]

    missing_segments: list[MissingRange] = []
    first = segments[0]
    last = segments[-1]

    if requested_start_at < first.start_at:
        missing_segments.append(
            MissingRange(
                start_at=requested_start_at,
                end_at=min(requested_end_at, first.start_at - interval),
                kind="head",
            )
        )

    for left, right in zip(segments, segments[1:]):
        expected_next = left.end_at + interval
        if right.start_at > expected_next:
            missing_segments.append(
                MissingRange(
                    start_at=expected_next,
                    end_at=right.start_at - interval,
                    kind="internal",
                )
            )

    if requested_end_at > last.end_at:
        missing_segments.append(
            MissingRange(
                start_at=max(requested_start_at, last.end_at + interval),
                end_at=requested_end_at,
                kind="tail",
            )
        )

    return [segment for segment in missing_segments if segment.start_at <= segment.end_at]


def _has_internal_gap(missing_segments: list[MissingRange]) -> bool:
    return any(segment.kind == "internal" for segment in missing_segments)
