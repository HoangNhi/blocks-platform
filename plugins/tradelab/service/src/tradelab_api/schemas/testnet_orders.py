from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import Field

from .common import CamelModel

class TestnetOrderPreviewRequest(CamelModel):
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
    environment: str = "binance_testnet"
    exchange: str = "binance"
    market_type: str = "spot"
    symbol: str
    side: str
    order_type: str = "market"
    quantity: Decimal | None = None
    quote_quantity: Decimal | None = None

class TestnetOrderOrderSnapshotResponse(CamelModel):
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

class TestnetOrderSourceContextResponse(CamelModel):
    strategy_id: str
    strategy_version_id: str
    source_run_id: str | None = None
    source_signal_package_id: str | None = None

class TestnetOrderPreviewResultResponse(CamelModel):
    status: str
    allowed: bool
    reason_code: str
    safety_status: str
    intent_id: str | None = None
    preview_id: str | None = None
    client_order_id: str | None = None
    expires_at: datetime | None = None
    order: TestnetOrderOrderSnapshotResponse | None = None
    source_context: TestnetOrderSourceContextResponse | None = None
    credential_snapshot: dict[str, Any] = Field(default_factory=dict)
    risk_snapshot: dict[str, Any] = Field(default_factory=dict)
    audit_event_ids: list[str] = Field(default_factory=list)
    details: dict[str, Any] = Field(default_factory=dict)

class TestnetOrderPreviewResponse(CamelModel):
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

class TestnetOrderEventResponse(CamelModel):
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

class TestnetReconciliationAttemptResponse(CamelModel):
    attempt_id: str
    attempt_no: int
    trigger: str
    status: str
    reason_code: str | None = None
    exchange_order_status: str | None = None
    fills_snapshot: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime | None = None

class TestnetOrderIntentSummaryResponse(CamelModel):
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

class TestnetOrderDetailResponse(CamelModel):
    safety_status: str = "assisted_testnet_order_read_only"
    intent: TestnetOrderIntentSummaryResponse
    latest_preview: TestnetOrderPreviewResponse | None = None
    previews: list[TestnetOrderPreviewResponse] = Field(default_factory=list)
    events: list[TestnetOrderEventResponse] = Field(default_factory=list)
    reconciliation_attempts: list[TestnetReconciliationAttemptResponse] = Field(default_factory=list)

class TestnetOrderListItemResponse(CamelModel):
    intent: TestnetOrderIntentSummaryResponse
    latest_preview: TestnetOrderPreviewResponse | None = None

class TestnetOrderListResponse(CamelModel):
    safety_status: str = "assisted_testnet_order_list_read_only"
    items: list[TestnetOrderListItemResponse] = Field(default_factory=list)

class TestnetOrderConfirmSubmitRequest(CamelModel):
    confirm_testnet_order: bool = False
    idempotency_key: str
    actor: str = "local-user"

class TestnetOrderConfirmSubmitResponse(CamelModel):
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


class TestnetOrderCancelRequest(CamelModel):
    confirm_testnet_cancel: bool = False
    idempotency_key: str
    reason: str = "user_requested"
    actor: str = "local-user"


class TestnetOrderCancelResponse(CamelModel):
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

class TestnetOrderReconcileRequest(CamelModel):
    order_id: UUID
    confirm_testnet_reconcile: bool = False
    trigger: str = "manual"
    actor: str = "local-user"

class TestnetOrderReconcileResponse(CamelModel):
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

class TestnetOrderJournalProjectionRequest(CamelModel):
    confirm_testnet_journal_projection: bool = False
    source: str = "strategy_lab"
    actor: str = "local-user"

class TestnetOrderJournalProjectionResponse(CamelModel):
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
