from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import Field

from .common import CamelModel


class LiveOrderPreviewRequest(CamelModel):
    confirm_preview_only: bool = False
    idempotency_key: str
    client_action_id: str
    source: str = "strategy_lab"
    actor: str = "local-user"
    strategy_id: UUID
    strategy_version_id: UUID
    source_run_id: UUID | None = None
    source_signal_package_id: str | None = None
    credential_ref_id: UUID
    environment: str = "binance_live"
    exchange: str = "binance"
    market_type: str = "spot"
    symbol: str
    side: str
    order_type: str = "market"
    quantity: Decimal | None = None
    quote_quantity: Decimal | None = None


class LiveOrderOrderSnapshotResponse(CamelModel):
    environment: str
    exchange: str
    market_type: str
    symbol: str
    side: str
    order_type: str
    quantity: Decimal | None = None
    quote_quantity: Decimal | None = None
    estimated_notional: Decimal | None = None
    estimated_fee: Decimal | None = None


class LiveOrderSourceContextResponse(CamelModel):
    strategy_id: str
    strategy_version_id: str
    source_run_id: str | None = None
    source_signal_package_id: str | None = None


class LiveOrderPreviewResultResponse(CamelModel):
    status: str
    allowed: bool
    reason_code: str
    safety_status: str
    intent_id: str | None = None
    preview_id: str | None = None
    client_order_id: str | None = None
    expires_at: datetime | None = None
    order: LiveOrderOrderSnapshotResponse | None = None
    source_context: LiveOrderSourceContextResponse | None = None
    credential_snapshot: dict[str, Any] = Field(default_factory=dict)
    risk_snapshot: dict[str, Any] = Field(default_factory=dict)
    audit_event_ids: list[str] = Field(default_factory=list)
    details: dict[str, Any] = Field(default_factory=dict)


class LiveOrderPreviewResponse(CamelModel):
    preview_id: str
    preview_key: str
    status: str
    reason_code: str | None = None
    symbol: str
    side: str
    order_type: str
    quantity: Decimal | None = None
    quote_quantity: Decimal | None = None
    estimated_notional: Decimal | None = None
    estimated_fee: Decimal | None = None
    risk_snapshot: dict[str, Any] = Field(default_factory=dict)
    credential_snapshot: dict[str, Any] = Field(default_factory=dict)
    source_snapshot: dict[str, Any] = Field(default_factory=dict)
    expires_at: datetime | None = None
    created_at: datetime | None = None


class LiveOrderEventResponse(CamelModel):
    event_id: str
    preview_id: str | None = None
    event_type: str
    from_status: str | None = None
    to_status: str | None = None
    reason_code: str | None = None
    client_order_id: str | None = None
    exchange_order_id: str | None = None
    actor: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None


class LiveReconciliationAttemptResponse(CamelModel):
    attempt_id: str
    attempt_no: int
    trigger: str
    status: str
    reason_code: str | None = None
    exchange_order_status: str | None = None
    fills_snapshot: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None


class LiveOrderIntentSummaryResponse(CamelModel):
    intent_id: str
    intent_key: str
    status: str
    reason_code: str | None = None
    client_order_id: str
    environment: str
    exchange: str
    market_type: str
    symbol: str
    side: str
    order_type: str
    quantity: Decimal | None = None
    quote_quantity: Decimal | None = None
    strategy_id: str
    strategy_version_id: str
    source_run_id: str | None = None
    credential_ref_id: str
    latest_preview_id: str | None = None
    reconciliation_required: bool
    created_at: datetime | None = None
    updated_at: datetime | None = None


class LiveOrderDetailResponse(CamelModel):
    safety_status: str = "assisted_live_order_read_only"
    intent: LiveOrderIntentSummaryResponse
    latest_preview: LiveOrderPreviewResponse | None = None
    previews: list[LiveOrderPreviewResponse] = Field(default_factory=list)
    events: list[LiveOrderEventResponse] = Field(default_factory=list)
    reconciliation_attempts: list[LiveReconciliationAttemptResponse] = Field(default_factory=list)


class LiveOrderListItemResponse(CamelModel):
    intent: LiveOrderIntentSummaryResponse
    latest_preview: LiveOrderPreviewResponse | None = None


class LiveOrderListResponse(CamelModel):
    safety_status: str = "assisted_live_order_list_read_only"
    items: list[LiveOrderListItemResponse] = Field(default_factory=list)


class LiveOrderConfirmSubmitRequest(CamelModel):
    confirm_live_order: bool = False
    idempotency_key: str
    actor: str = "local-user"


class LiveOrderConfirmSubmitResponse(CamelModel):
    status: str
    reason_code: str
    safety_status: str
    semantic_status_code: int = 200
    should_commit: bool = False
    intent_id: str | None = None
    preview_id: str | None = None
    client_order_id: str | None = None
    exchange_order_id: str | None = None
    intent_status: str | None = None
    submit_snapshot: dict[str, Any] = Field(default_factory=dict)
    audit_event_ids: list[str] = Field(default_factory=list)
    details: dict[str, Any] = Field(default_factory=dict)


class LiveOrderCancelRequest(CamelModel):
    confirm_live_cancel: bool = False
    idempotency_key: str
    reason: str = "user_requested"
    actor: str = "local-user"


class LiveOrderCancelResponse(CamelModel):
    status: str
    reason_code: str
    safety_status: str
    semantic_status_code: int = 200
    should_commit: bool = False
    intent_id: str | None = None
    client_order_id: str | None = None
    exchange_order_id: str | None = None
    intent_status: str | None = None
    cancel_snapshot: dict[str, Any] = Field(default_factory=dict)
    audit_event_ids: list[str] = Field(default_factory=list)
    details: dict[str, Any] = Field(default_factory=dict)


class LiveOrderReconcileRequest(CamelModel):
    confirm_live_reconcile: bool = False
    trigger: str = "manual"
    actor: str = "local-user"


class LiveOrderReconcileResponse(CamelModel):
    status: str
    reason_code: str
    safety_status: str
    semantic_status_code: int = 200
    should_commit: bool = False
    intent_id: str | None = None
    client_order_id: str | None = None
    exchange_order_id: str | None = None
    intent_status: str | None = None
    reconciliation_attempt_id: str | None = None
    reconcile_snapshot: dict[str, Any] = Field(default_factory=dict)
    audit_event_ids: list[str] = Field(default_factory=list)
    details: dict[str, Any] = Field(default_factory=dict)


class LiveOrderJournalProjectionRequest(CamelModel):
    confirm_live_journal_projection: bool = False
    source: str = "strategy_lab"
    actor: str = "local-user"


class LiveOrderJournalProjectionResponse(CamelModel):
    status: str
    reason_code: str
    safety_status: str
    semantic_status_code: int = 200
    should_commit: bool = False
    intent_id: str | None = None
    journal_entry_id: str | None = None
    client_order_id: str | None = None
    intent_status: str | None = None
    audit_event_ids: list[str] = Field(default_factory=list)
    details: dict[str, Any] = Field(default_factory=dict)


class LiveProofWindowStatusResponse(CamelModel):
    proof_window_status: str
    reason_code: str
    opened_at: datetime | None = None
    opened_by: str | None = None
    expires_at: datetime | None = None
    remaining_intent_budget: int
    proof_window_reason: str | None = None
    closed_at: datetime | None = None
    closed_by: str | None = None
    closed_reason: str | None = None
    active_intent_id: str | None = None
    hard_stop_status: str | None = None
    hard_stop_reason_code: str | None = None
    safety_status: str
    runtime_gate: dict[str, Any] = Field(default_factory=dict)
    details: dict[str, Any] = Field(default_factory=dict)


class LiveProofWindowOpenRequest(CamelModel):
    confirm_open: bool = False
    actor: str = "local-user"
    reason: str
    ttl_seconds: int
    intent_budget: int = 1


class LiveProofWindowCloseRequest(CamelModel):
    confirm_close: bool = False
    actor: str = "local-user"
    reason: str
