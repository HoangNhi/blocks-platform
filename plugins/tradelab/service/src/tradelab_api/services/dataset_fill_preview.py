from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import hashlib
import json
from typing import Any
from uuid import UUID

from .market_data_integrity import timeframe_to_timedelta
from .market_data_preflight import MissingRange, build_preflight_result
from .market_data_repository import MarketDataRepository


@dataclass(slots=True)
class DatasetFillPreviewValidationError(Exception):
    reason_code: str
    message: str


@dataclass(slots=True)
class DatasetFillPreviewRange:
    start_at: datetime
    end_at: datetime


@dataclass(slots=True)
class DatasetFillPreview:
    preview_id: str
    generated_at: datetime
    request_fingerprint: str
    dataset_key: str
    exchange: str
    symbol: str
    timeframe: str
    requested_range: DatasetFillPreviewRange
    coverage_status: str
    gap_count: int
    estimated_rows: int
    blocked_reasons: list[str] = field(default_factory=list)
    safety_status: str = "preview_only"
    missing_ranges: list[dict[str, Any]] = field(default_factory=list)
    active_job_id: str | None = None
    active_job_type: str | None = None


def build_dataset_fill_preview(
    repository: MarketDataRepository,
    *,
    strategy_id: UUID,
    exchange: str,
    symbol: str,
    timeframe: str,
    requested_start_at: datetime | None,
    requested_end_at: datetime | None,
    source: str = "strategy_lab",
    generated_at: datetime | None = None,
) -> DatasetFillPreview:
    if requested_start_at is None or requested_end_at is None:
        raise DatasetFillPreviewValidationError(
            "dataset_fill_preview_missing_range",
            "Dataset fill preview requires requestedStartAt and requestedEndAt.",
        )
    if requested_start_at >= requested_end_at:
        raise DatasetFillPreviewValidationError(
            "dataset_fill_preview_invalid_range",
            "Dataset fill preview range must start before it ends.",
        )
    try:
        interval = timeframe_to_timedelta(timeframe)
    except ValueError as exc:
        raise DatasetFillPreviewValidationError(
            "dataset_fill_preview_unsupported_timeframe",
            f"Unsupported timeframe for dataset fill preview: {timeframe}.",
        ) from exc

    preflight = build_preflight_result(
        repository,
        exchange=exchange,
        symbol=symbol,
        timeframe=timeframe,
        requested_start_at=requested_start_at,
        requested_end_at=requested_end_at,
        source_available=True,
    )
    missing_ranges = [_serialize_missing_range(segment) for segment in preflight.missing_segments]
    interval_seconds = int(interval.total_seconds())
    estimated_rows = sum(_estimate_rows(segment, interval_seconds=interval_seconds) for segment in preflight.missing_segments)
    coverage_status = _coverage_status(preflight.missing_segments, preflight.coverage)
    blocked_reasons = ["active_job_exists"] if preflight.active_job_id else []
    generated = generated_at or datetime.now(timezone.utc)
    request_fingerprint = _fingerprint(
        {
            "strategyId": str(strategy_id),
            "exchange": exchange,
            "symbol": symbol,
            "timeframe": timeframe,
            "requestedStartAt": requested_start_at.isoformat(),
            "requestedEndAt": requested_end_at.isoformat(),
            "source": source,
        }
    )
    preview_id = _fingerprint(
        {
            "kind": "dataset_fill_preview",
            "requestFingerprint": request_fingerprint,
            "coverageStatus": coverage_status,
            "gapCount": len(missing_ranges),
            "estimatedRows": estimated_rows,
            "missingRanges": [
                {
                    "startAt": item["start_at"].isoformat(),
                    "endAt": item["end_at"].isoformat(),
                    "kind": item["kind"],
                }
                for item in missing_ranges
            ],
            "activeJobId": preflight.active_job_id,
            "activeJobType": preflight.active_job_type,
        }
    )

    return DatasetFillPreview(
        preview_id=preview_id,
        generated_at=generated,
        request_fingerprint=request_fingerprint,
        dataset_key=preflight.dataset_key,
        exchange=preflight.exchange,
        symbol=preflight.symbol,
        timeframe=preflight.timeframe,
        requested_range=DatasetFillPreviewRange(start_at=requested_start_at, end_at=requested_end_at),
        coverage_status=coverage_status,
        gap_count=len(missing_ranges),
        estimated_rows=estimated_rows,
        blocked_reasons=blocked_reasons,
        missing_ranges=missing_ranges,
        active_job_id=preflight.active_job_id,
        active_job_type=preflight.active_job_type,
    )


def _serialize_missing_range(segment: MissingRange) -> dict[str, Any]:
    return {"start_at": segment.start_at, "end_at": segment.end_at, "kind": segment.kind}


def _estimate_rows(segment: MissingRange, *, interval_seconds: int) -> int:
    if interval_seconds <= 0:
        return 0
    seconds = int((segment.end_at - segment.start_at).total_seconds())
    return max((seconds // interval_seconds) + 1, 0)


def _coverage_status(missing_segments: list[MissingRange], coverage: object | None) -> str:
    if not missing_segments:
        return "covered"
    if coverage is None:
        return "missing"
    has_window = bool(getattr(coverage, "earliest_open_time", None) or getattr(coverage, "latest_open_time", None))
    if not has_window:
        return "missing"
    if any(segment.kind == "fill" for segment in missing_segments):
        return "missing"
    return "partial"


def _fingerprint(payload: dict[str, Any]) -> str:
    text = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()
