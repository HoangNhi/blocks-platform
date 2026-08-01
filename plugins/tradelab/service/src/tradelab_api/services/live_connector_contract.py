from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from enum import Enum
from typing import Protocol


class LiveOrderState(str, Enum):
    PLANNED = "planned"
    PREVIEWED = "previewed"
    USER_CONFIRMED = "user_confirmed"
    SUBMITTING = "submitting"
    SUBMITTED = "submitted"
    REJECTED = "rejected"
    UNKNOWN = "unknown"
    CANCEL_REQUESTED = "cancel_requested"
    CANCELLED = "cancelled"
    PARTIALLY_FILLED = "partially_filled"
    FILLED = "filled"
    RECONCILIATION_REQUIRED = "reconciliation_required"
    RECONCILED = "reconciled"
    JOURNAL_PROJECTED = "journal_projected"


class ConnectorOutcome(str, Enum):
    PREVIEWED = "previewed"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    UNKNOWN = "unknown"
    CANCELLED = "cancelled"
    PARTIALLY_FILLED = "partially_filled"
    FILLED = "filled"
    RECONCILIATION_REQUIRED = "reconciliation_required"


@dataclass(frozen=True)
class ConnectorEnvironmentFingerprint:
    exchange: str
    environment: str
    base_url_host: str
    endpoint_fingerprint: str


@dataclass(frozen=True)
class ConnectorOrderRequest:
    symbol: str
    side: str
    order_type: str
    quantity: Decimal | None
    quote_quantity: Decimal | None
    client_order_id: str
    metadata: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class ConnectorOrderSnapshot:
    state: LiveOrderState
    client_order_id: str
    exchange_order_id: str | None = None
    symbol: str | None = None
    executed_quantity: Decimal = Decimal("0")
    cumulative_quote_quantity: Decimal = Decimal("0")
    reason_code: str | None = None
    metadata: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class ConnectorOrderPreviewResult:
    outcome: ConnectorOutcome
    reason_code: str
    environment: ConnectorEnvironmentFingerprint
    metadata: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class ConnectorSubmitResult:
    outcome: ConnectorOutcome
    reason_code: str
    snapshot: ConnectorOrderSnapshot | None = None
    metadata: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class ConnectorCancelResult:
    outcome: ConnectorOutcome
    reason_code: str
    snapshot: ConnectorOrderSnapshot | None = None
    metadata: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class ConnectorReconciliationResult:
    outcome: ConnectorOutcome
    reason_code: str
    snapshot: ConnectorOrderSnapshot | None = None
    metadata: dict[str, object] = field(default_factory=dict)


class BinanceLiveConnector(Protocol):
    def get_environment(self) -> ConnectorEnvironmentFingerprint: ...
    def build_client_order_id(self, order_intent_fingerprint: str) -> str: ...
    def preview_order(self, order_request: ConnectorOrderRequest) -> ConnectorOrderPreviewResult: ...
    def submit_order(self, order_request: ConnectorOrderRequest) -> ConnectorSubmitResult: ...
    def cancel_order(self, order_request: ConnectorOrderRequest) -> ConnectorCancelResult: ...
    def get_order(self, client_order_id: str) -> ConnectorOrderSnapshot | None: ...
    def reconcile(self, order_request: ConnectorOrderRequest) -> ConnectorReconciliationResult: ...
