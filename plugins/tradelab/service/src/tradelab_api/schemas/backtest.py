from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import Field

from .common import CamelModel


class BotRunResponse(CamelModel):
    id: UUID
    bot_id: UUID | None = None
    strategy_id: UUID
    strategy_version_id: UUID
    run_type: str
    status: str
    exchange: str
    symbol: str
    timeframe: str
    start_at: datetime
    end_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    runtime_config: dict[str, Any]
    risk_config: dict[str, Any]
    error_message: str | None = None
    created_at: datetime
    created_by: str | None = None


class BacktestResultResponse(CamelModel):
    id: UUID
    bot_run_id: UUID
    initial_equity: Decimal
    final_equity: Decimal
    total_return_pct: Decimal
    max_drawdown_pct: Decimal
    profit_factor: Decimal | None = None
    win_rate_pct: Decimal | None = None
    total_trades: int
    metrics: dict[str, Any]
    equity_curve: list[dict[str, Any]]
    created_at: datetime


class BotRunSnapshotResponse(CamelModel):
    source_snapshot: dict[str, Any]
    dataset_context: dict[str, Any]
    pipeline_context: dict[str, Any]


class BotRunHistoryEntryResponse(CamelModel):
    id: UUID
    strategy_id: UUID
    strategy_version_id: UUID
    run_type: str
    status: str
    exchange: str
    symbol: str
    timeframe: str
    start_at: datetime
    end_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    pipeline_status: str
    data_job_id: UUID | None = None
    error_message: str | None = None
    created_at: datetime
    created_by: str | None = None


class BotRunPipelineResponse(CamelModel):
    run: BotRunHistoryEntryResponse
    preflight: dict[str, Any] | None = None
    data_job: dict[str, Any] | None = None
    backtest_job: dict[str, Any] | None = None
    status: str
    message: str | None = None


class ChartMarkerResponse(CamelModel):
    id: UUID
    timestamp: datetime
    kind: str
    side: str | None = None
    price: Decimal | None = None
    quantity: Decimal | None = None
    trade_order_id: UUID | None = None
    strategy_signal_id: UUID | None = None
    message: str | None = None
    payload: dict[str, Any]


class TradeDetailResponse(CamelModel):
    marker: ChartMarkerResponse
    order: dict[str, Any] | None = None
    signal: dict[str, Any] | None = None
    logs: list[dict[str, Any]] = []


class RunChartResponse(CamelModel):
    candles: list[dict[str, Any]]
    markers: list[ChartMarkerResponse]
    equity_curve: list[dict[str, Any]]
    selected_trade: TradeDetailResponse | None = None


class TradeAnalysisDatasetContextResponse(CamelModel):
    dataset_key: str
    exchange: str
    symbol: str
    timeframe: str
    requested_start_at: datetime | None = None
    requested_end_at: datetime | None = None
    source_hash: str | None = None
    strategy_version_id: UUID | None = None
    coverage: dict[str, Any] | None = None


class TradeAnalysisAnalyzedTradeResponse(CamelModel):
    id: UUID
    entry_order_id: UUID
    exit_order_id: UUID | None = None
    entry_time: datetime
    exit_time: datetime | None = None
    side: str
    status: str
    entry_price: Decimal | None = None
    exit_price: Decimal | None = None
    quantity: Decimal | None = None
    pnl: Decimal | None = None
    pnl_pct: Decimal | None = None
    duration_seconds: int | None = None
    entry_signal_id: UUID | None = None
    exit_signal_id: UUID | None = None
    entry_reason: str | None = None
    exit_reason: str | None = None


class TradeAnalysisSummaryResponse(CamelModel):
    total_trades: int
    closed_trades: int
    open_trades: int
    winning_trades: int
    losing_trades: int
    break_even_trades: int
    realized_pnl: Decimal
    average_pnl: Decimal | None = None
    average_pnl_pct: Decimal | None = None
    average_duration_seconds: int | None = None
    win_rate_pct: Decimal | None = None
    profit_factor: Decimal | None = None


class FuturesResearchSummaryResponse(CamelModel):
    total_funding_fee_paid: float = 0.0
    total_funding_fee_received: float = 0.0
    liquidation_count: int = 0
    long_trades: int = 0
    short_trades: int = 0
    long_win_rate: float | None = None
    short_win_rate: float | None = None
    avg_leverage_used: float | None = None
    max_margin_usage_pct: float | None = None
    max_maintenance_margin_pct: float | None = None


class BacktestPositionResponse(CamelModel):
    id: UUID
    run_id: UUID
    symbol: str
    side: str
    size: float
    leverage: int
    entry_price: float
    close_price: float | None = None
    liquidation_price: float | None = None
    margin_mode: str | None = None
    maintenance_margin: float | None = None
    funding_fee_paid: float = 0.0
    max_notional: float | None = None
    max_margin_used: float | None = None
    peak_leverage_used: float | None = None
    realized_pnl: float = 0.0
    status: str


class TradeAnalysisResponse(CamelModel):
    run: BotRunHistoryEntryResponse
    result: BacktestResultResponse | None = None
    snapshot: BotRunSnapshotResponse
    runtime_config: dict[str, Any]
    risk_config: dict[str, Any]
    dataset_context: TradeAnalysisDatasetContextResponse
    trade_summary: TradeAnalysisSummaryResponse
    trades: list[TradeAnalysisAnalyzedTradeResponse]
    positions: list[BacktestPositionResponse] = []
    total_funding_fee_paid: float = 0.0
    futures_summary: FuturesResearchSummaryResponse | None = None


class TradeExecutionDetailResponse(CamelModel):
    trade: TradeAnalysisAnalyzedTradeResponse
    entry_order: dict[str, Any] | None = None
    exit_order: dict[str, Any] | None = None
    entry_signal: dict[str, Any] | None = None
    exit_signal: dict[str, Any] | None = None
    logs: list[dict[str, Any]]


class ManualSignalPackageRequest(CamelModel):
    confirm_manual_signal_only: bool
    source: str = "strategy_lab"


class ManualSignalPackageResponse(CamelModel):
    signal_package_id: str
    source_run_id: UUID
    strategy_id: UUID
    strategy_version_id: UUID
    strategy_name: str
    exchange: str
    symbol: str
    timeframe: str
    dataset_key: str | None = None
    run_start_at: datetime
    run_end_at: datetime
    generated_at: datetime
    action: str
    entry_rule: str
    stop_rule: str
    take_profit_rule: str | None = None
    exit_rule: str
    position_sizing_rule: str
    max_risk_per_trade: str | None = None
    invalidation_rule: str
    manual_execution_notes: list[str]
    limitations: list[str]
    warnings: list[str]
    source_metrics: dict[str, Any]
    source_trade_summary: dict[str, Any]
    dataset_evidence: dict[str, Any]
    risk_evidence: dict[str, Any]
    robustness_evidence_status: str
    live_readiness_status: str
    safety_status: str
    markdown: str


class ResearchRobustnessGateRequest(CamelModel):
    confirm_research_only: bool
    source: str = "strategy_lab"


class ResearchRobustnessGateResponse(CamelModel):
    robustness_gate_id: str
    source_run_id: UUID
    strategy_id: UUID
    strategy_version_id: UUID
    strategy_name: str
    exchange: str
    symbol: str
    timeframe: str
    dataset_key: str | None = None
    generated_at: datetime
    candidate_label: str
    live_readiness_status: str
    safety_status: str
    gates: dict[str, Any]
    warnings: list[str]
    limitations: list[str]
    source_metrics: dict[str, Any]
    source_trade_summary: dict[str, Any]

class ExecutionJournalFillRequest(CamelModel):
    fill_role: str
    side: str
    fill_time: datetime | None = None
    price: Decimal
    quantity: Decimal
    fee: Decimal | None = None
    fee_asset: str | None = None
    notes: str | None = None

class ExecutionJournalEntryRequest(CamelModel):
    confirm_manual_entry_only: bool
    source: str = "strategy_lab"
    side: str
    planned_snapshot: dict[str, Any] = Field(default_factory=dict)
    discipline_status: str = "not_recorded"
    notes: str | None = None
    fills: list[ExecutionJournalFillRequest]

class ExecutionJournalFillResponse(CamelModel):
    fill_id: UUID | None = None
    fill_role: str
    side: str
    fill_time: datetime | None = None
    price: Decimal
    quantity: Decimal
    fee: Decimal | None = None
    fee_asset: str | None = None
    notes: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

class ExecutionJournalEntryResponse(CamelModel):
    entry_id: UUID
    source_run_id: UUID
    strategy_id: UUID | None = None
    strategy_version_id: UUID | None = None
    symbol: str
    timeframe: str
    side: str
    planned_snapshot: dict[str, Any]
    comparison_summary: dict[str, Any]
    outcome_status: str
    discipline_status: str
    safety_status: str
    live_readiness_status: str
    notes: str | None = None
    fills: list[ExecutionJournalFillResponse]
    created_at: datetime | None = None
    updated_at: datetime | None = None
