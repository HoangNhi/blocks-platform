from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import Field

from .common import CamelModel


class PaperKillSwitchStatusResponse(CamelModel):
    enabled: bool
    reason_code: str
    safety_status: str
    source: str
    updated_at: datetime | None = None
    updated_by: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class PaperSessionSchedulerStatusResponse(CamelModel):
    enabled: bool = False
    running: bool = False
    worker_id: str = "tradelab-local-paper-scheduler"
    interval_seconds: float = 60.0
    last_tick_started_at: datetime | None = None
    last_tick_completed_at: datetime | None = None
    last_tick_status: str = "disabled"
    last_skip_reason: str | None = None
    last_reason_code: str | None = None
    last_session_id: str | None = None
    candles_processed: int = 0
    orders_created: int = 0
    fills_created: int = 0
    snapshots_created: int = 0
    consecutive_failure_count: int = 0
    safety_status: str = "read_only_paper_scheduler_visibility"


class PaperRiskPolicyOverrideRequest(CamelModel):
    starting_cash: Decimal | None = None
    max_notional_per_order: Decimal | None = None
    max_position_notional: Decimal | None = None
    max_daily_loss: Decimal | None = None
    max_open_positions: int | None = None
    allowed_symbols: list[str] = Field(default_factory=list)
    allowed_timeframes: list[str] = Field(default_factory=list)


class PaperSessionPreviewRequest(CamelModel):
    bot_id: UUID
    exchange: str = "binance"
    symbol: str
    timeframe: str
    start_at: datetime
    end_at: datetime
    risk_policy_override: PaperRiskPolicyOverrideRequest | None = None
    source: str = "strategy_lab"


class PaperSessionPreviewGateFailureResponse(CamelModel):
    gate: str
    reason_code: str
    message: str
    data: dict[str, Any] = Field(default_factory=dict)


class PaperSessionPreviewBotContextResponse(CamelModel):
    bot_id: str
    mode: str
    status: str
    symbol: str
    timeframe: str


class PaperSessionPreviewStrategyContextResponse(CamelModel):
    strategy_id: str | None = None
    strategy_version_id: str | None = None
    source_valid: bool
    version_locked: bool
    dirty: bool


class PaperSessionPreviewDatasetContextResponse(CamelModel):
    dataset_key: str
    exchange: str
    symbol: str
    timeframe: str
    start_at: datetime
    end_at: datetime
    preflight_outcome: str


class PaperSessionPreviewResponse(CamelModel):
    mode: str
    preview_status: str
    allowed: bool
    reason_code: str
    failed_gates: list[PaperSessionPreviewGateFailureResponse] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    details: dict[str, Any] = Field(default_factory=dict)
    safety_status: str
    bot_context: PaperSessionPreviewBotContextResponse
    strategy_context: PaperSessionPreviewStrategyContextResponse
    dataset_context: PaperSessionPreviewDatasetContextResponse


class PaperSessionStartRequest(CamelModel):
    bot_id: UUID
    exchange: str = "binance"
    symbol: str
    timeframe: str
    start_at: datetime
    end_at: datetime
    starting_cash: Decimal
    idempotency_key: str
    confirm_start: bool
    risk_policy_override: PaperRiskPolicyOverrideRequest | None = None
    preview_fingerprint: str | None = None
    source: str = "strategy_lab"
    actor: str = "local-user"


class PaperSessionStartGateFailureResponse(CamelModel):
    gate: str
    reason_code: str
    message: str
    data: dict[str, Any] = Field(default_factory=dict)


class PaperSessionStartResponse(CamelModel):
    session_id: str | None = None
    status: str
    allowed: bool
    reason_code: str
    safety_status: str
    request_fingerprint: str
    idempotency_key: str
    failed_gates: list[PaperSessionStartGateFailureResponse] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    details: dict[str, Any] = Field(default_factory=dict)
    dataset_context: dict[str, Any] = Field(default_factory=dict)
    gate_context: dict[str, Any] = Field(default_factory=dict)
    audit_event_ids: list[str] = Field(default_factory=list)


class PaperEngineTickLocalRequest(CamelModel):
    confirm_local_paper_engine_tick: bool = False
    max_candles_per_tick: int = 10000
    worker_id: str = "local-paper-engine"

class PaperEngineTickLocalResponse(CamelModel):
    status: str
    reason_code: str
    session_id: str | None = None
    candles_processed: int = 0
    orders_created: int = 0
    fills_created: int = 0
    snapshots_created: int = 0
    safety_status: str
    details: dict[str, Any] = Field(default_factory=dict)

class PaperSessionRunLocalRequest(CamelModel):
    confirm_local_paper_run: bool = False
    max_candles_per_tick: int = 10000
    worker_id: str = "strategy-lab-local-paper-run"

class PaperSessionRunLocalResponse(CamelModel):
    status: str
    reason_code: str
    session_id: str | None = None
    candles_processed: int = 0
    orders_created: int = 0
    fills_created: int = 0
    snapshots_created: int = 0
    safety_status: str
    details: dict[str, Any] = Field(default_factory=dict)


class PaperSessionCancelLocalRequest(CamelModel):
    confirm_local_paper_cancel: bool = False
    reason: str = "user_requested"
    actor: str = "local-user"


class PaperSessionCancelLocalResponse(CamelModel):
    status: str
    reason_code: str
    session_id: str | None = None
    previous_status: str | None = None
    current_status: str | None = None
    cancel_requested_at: datetime | None = None
    safety_status: str
    details: dict[str, Any] = Field(default_factory=dict)


class PaperSessionRetryLocalRequest(CamelModel):
    confirm_local_paper_retry: bool = False
    idempotency_key: str
    reason: str = "user_requested"
    actor: str = "local-user"


class PaperSessionRetryLocalResponse(CamelModel):
    status: str
    reason_code: str
    source_session_id: str | None = None
    retry_session_id: str | None = None
    source_status: str | None = None
    retry_status: str | None = None
    idempotency_key: str | None = None
    safety_status: str
    details: dict[str, Any] = Field(default_factory=dict)


class PaperSessionResumeLocalRequest(CamelModel):
    confirm_local_paper_resume: bool = False
    idempotency_key: str
    reason: str = "user_requested"
    actor: str = "local-user"


class PaperSessionResumeCursorResponse(CamelModel):
    last_processed_candle_id: str
    next_candle_open_time: datetime
    attempt_no: int


class PaperSessionResumeLocalResponse(CamelModel):
    status: str
    reason_code: str
    source_session_id: str | None = None
    resume_session_id: str | None = None
    source_status: str | None = None
    resume_status: str | None = None
    idempotency_key: str | None = None
    resume_cursor: PaperSessionResumeCursorResponse | None = None
    safety_status: str
    details: dict[str, Any] = Field(default_factory=dict)


class PaperSessionResumeReadinessCheckpointResponse(CamelModel):
    last_processed_candle_id: str
    last_processed_candle_open_time: datetime
    next_candle_id: str
    next_candle_open_time: datetime
    cash_balance: Decimal
    equity: Decimal
    realized_pnl: Decimal
    unrealized_pnl: Decimal
    fees_paid: Decimal
    exposure_notional: Decimal
    open_position_quantity: Decimal
    average_entry_price: Decimal | None = None
    pending_orders_count: int

class PaperSessionResumeReadinessResponse(CamelModel):
    session_id: str
    status: str
    reason_code: str
    allowed: bool
    safety_status: str
    checkpoint: PaperSessionResumeReadinessCheckpointResponse | None = None
    checkpoint_source: str = "missing"
    artifact_identity_status: str = "missing"
    resume_mode: str = "same_session"
    attempt_no: int | None = None
    blocking_reasons: list[str] = Field(default_factory=list)
    details: dict[str, Any] = Field(default_factory=dict)

class PaperSessionDetailSessionResponse(CamelModel):
    session_id: str
    bot_id: str
    strategy_id: str
    strategy_version_id: str
    mode: str
    status: str
    exchange: str
    symbol: str
    timeframe: str
    dataset_key: str
    start_at: datetime
    end_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    cancel_requested_at: datetime | None = None
    starting_cash: Decimal
    reason_code: str | None = None
    error_message: str | None = None
    created_at: datetime
    created_by: str | None = None
    updated_at: datetime | None = None
    updated_by: str | None = None


class PaperSessionDetailAuditEventResponse(CamelModel):
    audit_event_id: str
    event_at: datetime
    actor: str | None = None
    action: str
    target_type: str
    target_id: str | None = None
    old_state: str | None = None
    new_state: str | None = None
    reason_code: str | None = None
    correlation_id: str | None = None
    request_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None
    created_by: str | None = None


class PaperSessionDetailArtifactLimitsResponse(CamelModel):
    orders: int
    fills: int
    positions: int
    portfolio_snapshots: int
    audit_events: int

class PaperSessionDetailOrderResponse(CamelModel):
    order_id: str
    side: str
    order_type: str
    status: str
    quantity: Decimal
    requested_price: Decimal | None = None
    requested_notional: Decimal | None = None
    submitted_at: datetime | None = None
    finalized_at: datetime | None = None
    reason_code: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None
    created_by: str | None = None
    updated_at: datetime | None = None
    updated_by: str | None = None

class PaperSessionDetailFillResponse(CamelModel):
    fill_id: str
    paper_order_id: str
    source_candle_id: str | None = None
    fill_time: datetime
    side: str
    price: Decimal
    quantity: Decimal
    notional: Decimal
    fee_amount: Decimal
    fee_asset: str | None = None
    slippage_amount: Decimal
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None
    created_by: str | None = None

class PaperSessionDetailPositionResponse(CamelModel):
    position_id: str
    symbol: str
    side: str
    status: str
    quantity: Decimal
    average_entry_price: Decimal | None = None
    realized_pnl: Decimal
    unrealized_pnl: Decimal
    opened_at: datetime | None = None
    closed_at: datetime | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None
    created_by: str | None = None
    updated_at: datetime | None = None
    updated_by: str | None = None

class PaperSessionDetailPortfolioSnapshotResponse(CamelModel):
    snapshot_id: str
    source_candle_id: str | None = None
    snapshot_at: datetime
    cash_balance: Decimal
    equity: Decimal
    realized_pnl: Decimal
    unrealized_pnl: Decimal
    fees_paid: Decimal
    drawdown_pct: Decimal
    exposure_notional: Decimal
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None
    created_by: str | None = None

class PaperSessionDetailArtifactsResponse(CamelModel):
    orders: list[PaperSessionDetailOrderResponse] = Field(default_factory=list)
    fills: list[PaperSessionDetailFillResponse] = Field(default_factory=list)
    positions: list[PaperSessionDetailPositionResponse] = Field(default_factory=list)
    portfolio_snapshots: list[PaperSessionDetailPortfolioSnapshotResponse] = Field(default_factory=list)
    limits: PaperSessionDetailArtifactLimitsResponse

class PaperSessionDetailResponse(CamelModel):
    session: PaperSessionDetailSessionResponse
    dataset_context: dict[str, Any] = Field(default_factory=dict)
    gate_context: dict[str, Any] = Field(default_factory=dict)
    audit_events: list[PaperSessionDetailAuditEventResponse] = Field(default_factory=list)
    artifacts: PaperSessionDetailArtifactsResponse
    safety_status: str

class PaperSessionObservabilityArtifactCountsResponse(CamelModel):
    orders: int
    fills: int
    positions: int
    portfolio_snapshots: int
    audit_events: int

class PaperSessionObservabilityLatestAuditResponse(CamelModel):
    audit_event_id: str
    event_at: datetime
    action: str
    reason_code: str | None = None
    new_state: str | None = None
    actor: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

class PaperSessionObservabilityGateSummaryResponse(CamelModel):
    failed_gate_count: int
    failed_gate_reasons: list[str] = Field(default_factory=list)
    blocked_reason_code: str | None = None

class PaperSessionObservabilityItemResponse(CamelModel):
    session_id: str
    status: str
    reason_code: str | None = None
    safety_status: str
    strategy_id: str
    strategy_version_id: str
    dataset_key: str
    exchange: str
    symbol: str
    timeframe: str
    start_at: datetime
    end_at: datetime
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    error_message: str | None = None
    artifact_counts: PaperSessionObservabilityArtifactCountsResponse
    latest_audit: PaperSessionObservabilityLatestAuditResponse | None = None
    gate_summary: PaperSessionObservabilityGateSummaryResponse

class PaperSessionObservabilityResponse(CamelModel):
    safety_status: str
    items: list[PaperSessionObservabilityItemResponse] = Field(default_factory=list)
    has_more: bool
