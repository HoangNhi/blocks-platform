from __future__ import annotations

import hashlib
from decimal import Decimal

from tradelab_api.services.live_connector_contract import (
    ConnectorCancelResult,
    ConnectorEnvironmentFingerprint,
    ConnectorOrderPreviewResult,
    ConnectorOrderRequest,
    ConnectorOrderSnapshot,
    ConnectorOutcome,
    ConnectorReconciliationResult,
    ConnectorSubmitResult,
    LiveOrderState,
)

FAKE_LIVE_ENVIRONMENT = ConnectorEnvironmentFingerprint(
    exchange="binance_spot",
    environment="binance_live",
    base_url_host="fake.live.binance.local",
    endpoint_fingerprint="binance_spot_live_fake_no_network",
)


class FakeBinanceLiveConnector:
    def __init__(self, *, scenario: str = "accepted") -> None:
        self.scenario = scenario
        self.orders: dict[str, ConnectorOrderSnapshot] = {}

    def get_environment(self) -> ConnectorEnvironmentFingerprint:
        return FAKE_LIVE_ENVIRONMENT

    def build_client_order_id(self, order_intent_fingerprint: str) -> str:
        digest = hashlib.sha256(order_intent_fingerprint.encode("utf-8")).hexdigest()[:24]
        return f"tl-live-{digest}"

    def preview_order(self, order_request: ConnectorOrderRequest) -> ConnectorOrderPreviewResult:
        return ConnectorOrderPreviewResult(
            outcome=ConnectorOutcome.PREVIEWED,
            reason_code="live_connector_fake_preview_created",
            environment=self.get_environment(),
            metadata={"scenario": self.scenario, "symbol": order_request.symbol},
        )

    def submit_order(self, order_request: ConnectorOrderRequest) -> ConnectorSubmitResult:
        if self.scenario == "rejected":
            snapshot = self._snapshot(
                order_request,
                state=LiveOrderState.REJECTED,
                reason_code="live_order_submit_fake_rejected",
                metadata={"rejectReason": "fake_insufficient_balance"},
            )
            self.orders[order_request.client_order_id] = snapshot
            return ConnectorSubmitResult(
                outcome=ConnectorOutcome.REJECTED,
                reason_code="live_order_submit_fake_rejected",
                snapshot=snapshot,
                metadata={"scenario": self.scenario},
            )

        if self.scenario == "timeout_unknown":
            accepted = self._snapshot(
                order_request,
                state=LiveOrderState.SUBMITTED,
                reason_code="live_order_submit_fake_accepted",
            )
            self.orders[order_request.client_order_id] = accepted
            return ConnectorSubmitResult(
                outcome=ConnectorOutcome.UNKNOWN,
                reason_code="live_order_submit_fake_unknown_state",
                snapshot=self._snapshot(
                    order_request,
                    state=LiveOrderState.UNKNOWN,
                    reason_code="live_order_submit_fake_unknown_state",
                ),
                metadata={"scenario": self.scenario},
            )

        state = LiveOrderState.PARTIALLY_FILLED if self.scenario == "partial_fill" else LiveOrderState.SUBMITTED
        snapshot = self._snapshot(
            order_request,
            state=state,
            reason_code="live_order_submit_fake_accepted",
            executed_quantity=Decimal("0.005") if state == LiveOrderState.PARTIALLY_FILLED else Decimal("0"),
            metadata={"scenario": self.scenario},
        )
        self.orders[order_request.client_order_id] = snapshot
        return ConnectorSubmitResult(
            outcome=ConnectorOutcome.ACCEPTED,
            reason_code="live_order_submit_fake_accepted",
            snapshot=snapshot,
            metadata={"scenario": self.scenario},
        )

    def cancel_order(self, order_request: ConnectorOrderRequest) -> ConnectorCancelResult:
        if self.scenario == "cancel_fill_race":
            snapshot = self._snapshot(
                order_request,
                state=LiveOrderState.RECONCILIATION_REQUIRED,
                reason_code="live_order_cancel_fake_reconciliation_required",
                executed_quantity=Decimal("0.01"),
                metadata={"fillRaceDetected": True},
            )
            self.orders[order_request.client_order_id] = snapshot
            return ConnectorCancelResult(
                outcome=ConnectorOutcome.RECONCILIATION_REQUIRED,
                reason_code="live_order_cancel_fake_reconciliation_required",
                snapshot=snapshot,
                metadata={"scenario": self.scenario},
            )

        snapshot = self._snapshot(
            order_request,
            state=LiveOrderState.CANCELLED,
            reason_code="live_order_cancel_fake_accepted",
        )
        self.orders[order_request.client_order_id] = snapshot
        return ConnectorCancelResult(
            outcome=ConnectorOutcome.CANCELLED,
            reason_code="live_order_cancel_fake_accepted",
            snapshot=snapshot,
            metadata={"scenario": self.scenario},
        )

    def get_order(self, client_order_id: str) -> ConnectorOrderSnapshot | None:
        return self.orders.get(client_order_id)

    def reconcile(self, order_request: ConnectorOrderRequest) -> ConnectorReconciliationResult:
        snapshot = self.orders.get(order_request.client_order_id)
        if snapshot is None:
            snapshot = self._snapshot(
                order_request,
                state=LiveOrderState.RECONCILIATION_REQUIRED,
                reason_code="live_order_reconciliation_required",
            )
        outcome = ConnectorOutcome.ACCEPTED if snapshot.state == LiveOrderState.SUBMITTED else ConnectorOutcome.RECONCILIATION_REQUIRED
        if snapshot.state == LiveOrderState.CANCELLED:
            outcome = ConnectorOutcome.CANCELLED
        if snapshot.state == LiveOrderState.FILLED:
            outcome = ConnectorOutcome.FILLED
        return ConnectorReconciliationResult(
            outcome=outcome,
            reason_code="live_order_reconciled" if outcome != ConnectorOutcome.RECONCILIATION_REQUIRED else "live_order_reconciliation_required",
            snapshot=snapshot,
            metadata={"scenario": self.scenario},
        )

    def _snapshot(
        self,
        order_request: ConnectorOrderRequest,
        *,
        state: LiveOrderState,
        reason_code: str,
        executed_quantity: Decimal = Decimal("0"),
        metadata: dict[str, object] | None = None,
    ) -> ConnectorOrderSnapshot:
        return ConnectorOrderSnapshot(
            state=state,
            client_order_id=order_request.client_order_id,
            exchange_order_id=f"fake-exchange-{order_request.client_order_id}",
            symbol=order_request.symbol,
            executed_quantity=executed_quantity,
            cumulative_quote_quantity=Decimal("0"),
            reason_code=reason_code,
            metadata=metadata or {},
        )
