from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import Field

from .common import CamelModel


class ImportJobResponse(CamelModel):
    id: UUID
    exchange: str
    symbol: str
    timeframe: str
    start_at: datetime
    end_at: datetime
    status: str
    rows_imported: int
    error_message: str | None = None
    metadata: dict[str, Any] = Field(validation_alias="metadata_", serialization_alias="metadata")
    created_at: datetime
    created_by: str | None = None
    updated_at: datetime | None = None
    updated_by: str | None = None
    is_active: bool
    is_deleted: bool


class MarketCandleResponse(CamelModel):
    id: UUID
    exchange: str
    symbol: str
    timeframe: str
    open_time: datetime
    close_time: datetime
    open: Any
    high: Any
    low: Any
    close: Any
    volume: Any
    quote_volume: Any | None = None
    trade_count: int | None = None
    source: str
    created_at: datetime


class MarketDataCoverageSegmentResponse(CamelModel):
    id: UUID
    coverage_id: UUID
    segment_index: int
    start_at: datetime
    end_at: datetime
    row_count: int
    metadata: dict[str, Any] = Field(validation_alias="metadata_", serialization_alias="metadata")
    created_at: datetime
    created_by: str | None = None
    updated_at: datetime | None = None
    updated_by: str | None = None
    is_active: bool
    is_deleted: bool


class MarketDataCoverageResponse(CamelModel):
    id: UUID
    dataset_key: str
    exchange: str
    symbol: str
    timeframe: str
    health_status: str
    earliest_open_time: datetime | None = None
    latest_open_time: datetime | None = None
    covered_start_at: datetime | None = None
    covered_end_at: datetime | None = None
    segment_count: int
    gap_count: int
    last_checked_at: datetime | None = None
    metadata: dict[str, Any] = Field(validation_alias="metadata_", serialization_alias="metadata")
    created_at: datetime
    created_by: str | None = None
    updated_at: datetime | None = None
    updated_by: str | None = None
    is_active: bool
    is_deleted: bool
    segments: list[MarketDataCoverageSegmentResponse] = []


class MarketDataJobSummary(CamelModel):
    id: UUID
    import_job_id: UUID | None = None
    bot_run_id: UUID | None = None
    dataset_key: str | None = None
    job_type: str | None = None
    status: str
    created_at: datetime
    created_by: str | None = None
    updated_at: datetime | None = None
    updated_by: str | None = None
    is_active: bool
    is_deleted: bool
    metadata: dict[str, Any] = Field(validation_alias="metadata_", serialization_alias="metadata")


class MarketDataPreflightResponse(CamelModel):
    dataset_key: str
    exchange: str
    symbol: str
    timeframe: str
    requested_start_at: datetime
    requested_end_at: datetime
    outcome: str
    action: str | None = None
    reasons: list[str] = []
    coverage: MarketDataCoverageResponse | None = None
    missing_segments: list[dict[str, Any]] = []
    repair_start_at: datetime | None = None
    repair_end_at: datetime | None = None
    active_job_id: str | None = None
    active_job_type: str | None = None
    source_blocked: bool = False

class DatasetFillPreviewRequest(CamelModel):
    strategy_id: UUID
    exchange: str = "binance"
    symbol: str
    timeframe: str
    requested_start_at: datetime | None = None
    requested_end_at: datetime | None = None
    source: str = "strategy_lab"

class DatasetFillPreviewRangeResponse(CamelModel):
    start_at: datetime
    end_at: datetime

class DatasetFillPreviewResponse(CamelModel):
    preview_id: str
    generated_at: datetime
    request_fingerprint: str
    dataset_key: str
    exchange: str
    symbol: str
    timeframe: str
    requested_range: DatasetFillPreviewRangeResponse
    coverage_status: str
    gap_count: int
    estimated_rows: int
    blocked_reasons: list[str] = []
    safety_status: str
    missing_ranges: list[dict[str, Any]] = []
    active_job_id: str | None = None
    active_job_type: str | None = None

class DatasetLocalFillRequest(CamelModel):
    strategy_id: UUID
    exchange: str = "binance"
    symbol: str
    timeframe: str
    requested_start_at: datetime
    requested_end_at: datetime
    preview_id: str
    request_fingerprint: str
    confirm_local_fill: bool = False
    source: str = "strategy_lab"

class DatasetFillEnqueueLocalMissingRangeRequest(CamelModel):
    start_at: datetime
    end_at: datetime
    kind: str = "missing"

class DatasetFillEnqueueLocalRequest(CamelModel):
    strategy_id: UUID
    exchange: str = "binance"
    symbol: str
    timeframe: str
    requested_start_at: datetime
    requested_end_at: datetime
    preview_id: str
    request_fingerprint: str
    missing_ranges: list[DatasetFillEnqueueLocalMissingRangeRequest] = []
    confirm_local_fill: bool = False
    source: str = "strategy_lab"

class DatasetFillEnqueueLocalRangeResponse(CamelModel):
    start_at: datetime
    end_at: datetime

class DatasetFillEnqueueLocalResponse(CamelModel):
    job_id: str
    dataset_key: str
    status: str
    safety_status: str
    requested_range: DatasetFillEnqueueLocalRangeResponse
    missing_range_count: int
    preview_id: str
    request_fingerprint: str

class DatasetLocalFillRangeResponse(CamelModel):
    start_at: datetime
    end_at: datetime
    kind: str
    rows_fetched: int
    rows_inserted: int
    rows_skipped_existing: int

class DatasetLocalFillRequestedRangeResponse(CamelModel):
    start_at: datetime
    end_at: datetime

class DatasetLocalFillResponse(CamelModel):
    job_id: str
    dataset_key: str
    status: str
    safety_status: str
    requested_range: DatasetLocalFillRequestedRangeResponse
    ranges_filled: list[DatasetLocalFillRangeResponse]
    rows_fetched: int
    rows_inserted: int
    rows_skipped_existing: int
    blocked_reasons: list[str] = []
    preview_id: str
    request_fingerprint: str

class DatasetLocalFillAuditRangeResponse(CamelModel):
    start_at: datetime | None = None
    end_at: datetime | None = None
    kind: str | None = None
    metadata: dict[str, Any] = {}

class DatasetLocalFillAuditRangeResultResponse(CamelModel):
    start_at: datetime | None = None
    end_at: datetime | None = None
    kind: str | None = None
    rows_fetched: int = 0
    rows_inserted: int = 0
    rows_skipped_existing: int = 0
    metadata: dict[str, Any] = {}

class DatasetLocalFillAuditItemResponse(CamelModel):
    job_id: str
    status: str
    created_at: datetime
    finished_at: datetime | None = None
    requested_range: DatasetLocalFillAuditRangeResponse
    applied_range: DatasetLocalFillAuditRangeResponse
    rows_imported: int
    rows_fetched: int
    rows_inserted: int
    rows_skipped_existing: int
    error_message: str | None = None
    reason_code: str | None = None
    provider_status: str | None = None
    preview_id: str | None = None
    request_fingerprint: str | None = None
    missing_ranges: list[dict[str, Any]] = []
    range_results: list[dict[str, Any]] = []

class DatasetLocalFillAuditResponse(CamelModel):
    dataset_key: str
    exchange: str
    symbol: str
    timeframe: str
    safety_status: str
    items: list[DatasetLocalFillAuditItemResponse] = []

class DatasetFillJobVisibilityRangeResponse(CamelModel):
    start_at: datetime | None = None
    end_at: datetime | None = None

class DatasetFillJobVisibilityItemResponse(CamelModel):
    job_id: str
    dataset_key: str
    job_type: str
    status: str
    requested_range: DatasetFillJobVisibilityRangeResponse
    applied_range: DatasetFillJobVisibilityRangeResponse
    rows_imported: int = 0
    rows_fetched: int = 0
    rows_inserted: int = 0
    rows_skipped_existing: int = 0
    reason_code: str | None = None
    provider_status: str | None = None
    attempt_count: int = 1
    worker_id: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    heartbeat_at: str | None = None
    metadata: dict[str, Any] = {}

class DatasetFillJobVisibilityResponse(CamelModel):
    dataset_key: str
    exchange: str
    symbol: str
    timeframe: str
    safety_status: str
    active: list[DatasetFillJobVisibilityItemResponse] = []
    recent: list[DatasetFillJobVisibilityItemResponse] = []

class DatasetFillWorkerTickRequest(CamelModel):
    confirm_local_worker_tick: bool = False
    worker_id: str | None = None

class DatasetFillMarkStaleFailedRequest(CamelModel):
    confirm_mark_failed: bool = False
    reason: str = "stale_worker_heartbeat"
    requested_by: str | None = None

class DatasetFillCancelRequest(CamelModel):
    confirm_cancel: bool = False
    reason: str = "user_requested"
    requested_by: str | None = None

class DatasetFillMarkStaleFailedResponse(CamelModel):
    job_id: str
    dataset_key: str
    status: str
    reason_code: str
    safety_status: str

class DatasetFillCancelResponse(CamelModel):
    job_id: str
    dataset_key: str
    status: str
    reason_code: str
    safety_status: str

class DatasetFillWorkerTickResponse(CamelModel):
    processed: bool
    job_id: str | None = None
    dataset_key: str | None = None
    status: str
    safety_status: str
    rows_fetched: int = 0
    rows_inserted: int = 0
    rows_skipped_existing: int = 0
    stale_jobs_marked: int = 0
    reason_code: str | None = None
    provider_status: str | None = None
    attempt_count: int = 0
    max_attempts: int = 3
    retry_exhausted: bool = False

class DatasetFillSchedulerStatusResponse(CamelModel):
    enabled: bool = False
    running: bool = False
    worker_id: str = "trade-lab-local-scheduler"
    interval_seconds: float = 60.0
    last_tick_started_at: datetime | None = None
    last_tick_completed_at: datetime | None = None
    last_tick_status: str = "disabled"
    last_skip_reason: str | None = None
    last_reason_code: str | None = None
    last_job_id: str | None = None
    last_dataset_key: str | None = None
    stale_jobs_marked: int = 0
    consecutive_failure_count: int = 0
    safety_status: str = "read_only_scheduler_visibility"

class LocalFillSmokeFixtureResetRequest(CamelModel):
    confirm_fixture_reset: bool = False

class LocalFillSmokeFixtureRangeResponse(CamelModel):
    start_at: datetime
    end_at: datetime
    kind: str

class LocalFillSmokeFixtureResetResponse(CamelModel):
    strategy_id: UUID
    strategy_slug: str
    strategy_group_id: UUID
    strategy_group_slug: str
    dataset_key: str
    exchange: str
    symbol: str
    timeframe: str
    requested_start_at: datetime
    requested_end_at: datetime
    expected_missing_ranges: list[LocalFillSmokeFixtureRangeResponse]
    expected_rows_inserted_min: int
    deleted_rows: int
    seeded_rows: int
    safety_status: str

class PaperRuntimeSmokeFixtureResetRequest(CamelModel):
    confirm_fixture_reset: bool = False
    session_state: str = "queued"

class PaperRuntimeSmokeFixtureResetResponse(CamelModel):
    paper_session_id: UUID
    bot_id: UUID
    strategy_id: UUID
    strategy_version_id: UUID
    strategy_slug: str
    strategy_group_id: UUID
    strategy_group_slug: str
    dataset_key: str
    exchange: str
    symbol: str
    timeframe: str
    requested_start_at: datetime
    requested_end_at: datetime
    expected_orders_min: int
    expected_fills_min: int
    expected_snapshots_min: int
    seeded_rows: int
    deleted_fixture_sessions: int
    deleted_fixture_candles: int
    safety_status: str
