from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field, replace
from decimal import Decimal

from tradelab_api.services.credential_redaction import is_secret_like_key, sanitize_credential_payload
from tradelab_api.services.testnet_connector_contract import (
    BinanceTestnetConnector,
    ConnectorOrderRequest,
    ConnectorOrderSnapshot,
    TestnetOrderState,
)


ALLOWED_TESTNET_CREDENTIAL_STATUSES = {"validated_testnet_read_only", "fake_testnet_ready"}


@dataclass(frozen=True)
class CredentialReadinessSummary:
    exchange: str
    environment: str
    credential_status: str
    can_trade: bool = False
    can_withdraw: bool = False


@dataclass(frozen=True)
class KillSwitchSnapshot:
    enabled: bool
    reason_code: str = "testnet_kill_switch_status_read"


@dataclass(frozen=True)
class RiskGateSnapshot:
    passed: bool
    reason_code: str = "testnet_order_risk_gate_passed"


@dataclass(frozen=True)
class TestnetOrderPreviewInput:
    source_run_id: str
    strategy_id: str
    strategy_version_id: str
    symbol: str
    side: str
    order_type: str
    quantity: Decimal | None
    quote_quantity: Decimal | None
    actor: str


@dataclass(frozen=True)
class TestnetOrderAuditEvent:
    action: str
    old_state: str | None
    new_state: str | None
    reason_code: str
    metadata: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class TestnetOrderPreviewDraft:
    preview_id: str
    state: TestnetOrderState
    request: ConnectorOrderRequest
    request_fingerprint: str
    environment_fingerprint: str
    actor: str
    credential: CredentialReadinessSummary
    risk: RiskGateSnapshot
    kill_switch: KillSwitchSnapshot


@dataclass(frozen=True)
class TestnetOrderIntent:
    intent_id: str
    preview_id: str
    state: TestnetOrderState
    request: ConnectorOrderRequest
    request_fingerprint: str
    environment_fingerprint: str
    client_order_id: str
    actor: str
    exchange_order_id: str | None = None
    reconciled: bool = False


@dataclass(frozen=True)
class TestnetOrderOperationResult:
    status: str
    reason_code: str
    preview: TestnetOrderPreviewDraft | None = None
    intent: TestnetOrderIntent | None = None
    snapshot: ConnectorOrderSnapshot | None = None
    events: list[TestnetOrderAuditEvent] = field(default_factory=list)


class TestnetOrderOrchestrator:
    def __init__(self, *, connector: BinanceTestnetConnector) -> None:
        self.connector = connector
        self._idempotency: dict[str, tuple[str, TestnetOrderIntent]] = {}

    def build_preview(self, preview_input: TestnetOrderPreviewInput, *, credential: CredentialReadinessSummary, risk: RiskGateSnapshot, kill_switch: KillSwitchSnapshot) -> TestnetOrderOperationResult:
        guard = self._preview_guard(credential=credential, risk=risk, kill_switch=kill_switch)
        if guard is not None:
            return guard
        environment = self.connector.get_environment()
        environment_hash = _fingerprint({"exchange": environment.exchange, "environment": environment.environment, "baseUrlHost": environment.base_url_host, "endpointFingerprint": environment.endpoint_fingerprint})
        request_hash = _fingerprint({"sourceRunId": preview_input.source_run_id, "strategyId": preview_input.strategy_id, "strategyVersionId": preview_input.strategy_version_id, "symbol": preview_input.symbol, "side": preview_input.side, "orderType": preview_input.order_type, "quantity": str(preview_input.quantity) if preview_input.quantity is not None else None, "quoteQuantity": str(preview_input.quote_quantity) if preview_input.quote_quantity is not None else None, "environmentHash": environment_hash})
        client_order_id = self.connector.build_client_order_id(request_hash)
        request = ConnectorOrderRequest(symbol=preview_input.symbol, side=preview_input.side, order_type=preview_input.order_type, quantity=preview_input.quantity, quote_quantity=preview_input.quote_quantity, client_order_id=client_order_id)
        connector_preview = self.connector.preview_order(request)
        preview = TestnetOrderPreviewDraft(preview_id=f"preview-{request_hash[:16]}", state=TestnetOrderState.PREVIEWED, request=request, request_fingerprint=request_hash, environment_fingerprint=environment_hash, actor=preview_input.actor, credential=credential, risk=risk, kill_switch=kill_switch)
        event = _event("testnet_order_preview_created", None, preview.state, connector_preview.reason_code, {"clientOrderId": client_order_id, "environment": environment.environment})
        return TestnetOrderOperationResult(status="previewed", reason_code=connector_preview.reason_code, preview=preview, events=[event])

    def confirm_intent(self, preview: TestnetOrderPreviewDraft, *, confirm_testnet_order: bool, idempotency_key: str, actor: str) -> TestnetOrderOperationResult:
        key_error = _validate_idempotency_key(idempotency_key)
        if key_error is not None:
            return TestnetOrderOperationResult(status="blocked", reason_code=key_error)
        if not confirm_testnet_order:
            return TestnetOrderOperationResult(status="blocked", reason_code="testnet_order_confirmation_required")
        scoped_key = f"testnet-order-confirm:{idempotency_key}"
        existing = self._idempotency.get(scoped_key)
        if existing is not None:
            existing_fingerprint, existing_intent = existing
            if existing_fingerprint != preview.request_fingerprint:
                return TestnetOrderOperationResult(status="blocked", reason_code="testnet_order_idempotency_conflict")
            return TestnetOrderOperationResult(status="confirmed", reason_code="testnet_order_idempotency_replayed", intent=existing_intent)
        intent = TestnetOrderIntent(intent_id=f"intent-{preview.request_fingerprint[:16]}", preview_id=preview.preview_id, state=TestnetOrderState.USER_CONFIRMED, request=preview.request, request_fingerprint=preview.request_fingerprint, environment_fingerprint=preview.environment_fingerprint, client_order_id=preview.request.client_order_id, actor=actor)
        self._idempotency[scoped_key] = (preview.request_fingerprint, intent)
        event = _event("testnet_order_confirmed_by_user", preview.state, intent.state, "testnet_order_client_order_id_generated", {"clientOrderId": intent.client_order_id, "idempotencyKeyHash": _hash_text(scoped_key)})
        return TestnetOrderOperationResult(status="confirmed", reason_code="testnet_order_client_order_id_generated", intent=intent, events=[event])

    def submit_intent(self, intent: TestnetOrderIntent, *, kill_switch: KillSwitchSnapshot) -> TestnetOrderOperationResult:
        if intent.state == TestnetOrderState.UNKNOWN and not intent.reconciled:
            return TestnetOrderOperationResult(status="blocked", reason_code="testnet_order_unknown_requires_reconciliation")
        if intent.state != TestnetOrderState.USER_CONFIRMED:
            return TestnetOrderOperationResult(status="blocked", reason_code="testnet_order_confirmation_required")
        if kill_switch.enabled:
            return TestnetOrderOperationResult(status="blocked", reason_code="testnet_kill_switch_enabled", events=[_event("testnet_order_blocked_by_kill_switch", intent.state, intent.state, "testnet_kill_switch_enabled")])
        submitting = replace(intent, state=TestnetOrderState.SUBMITTING)
        attempted = _event("testnet_order_submit_attempted", intent.state, submitting.state, "testnet_order_submit_attempted", {"clientOrderId": intent.client_order_id})
        submit = self.connector.submit_order(submitting.request)
        if submit.snapshot is None:
            return TestnetOrderOperationResult(status="unknown", reason_code="testnet_order_submit_unknown_state", intent=replace(submitting, state=TestnetOrderState.UNKNOWN), events=[attempted])
        updated = replace(submitting, state=submit.snapshot.state, exchange_order_id=submit.snapshot.exchange_order_id, reconciled=False)
        action = "testnet_order_submit_unknown"
        status = "unknown"
        if submit.snapshot.state in {TestnetOrderState.SUBMITTED, TestnetOrderState.PARTIALLY_FILLED}:
            action = "testnet_order_submit_accepted"
            status = "submitted"
        elif submit.snapshot.state == TestnetOrderState.REJECTED:
            action = "testnet_order_submit_rejected"
            status = "rejected"
        completed = _event(action, submitting.state, submit.snapshot.state, submit.reason_code, {"clientOrderId": intent.client_order_id, "exchangeOrderId": updated.exchange_order_id})
        return TestnetOrderOperationResult(status=status, reason_code=submit.reason_code, intent=updated, snapshot=submit.snapshot, events=[attempted, completed])

    def cancel_intent(self, intent: TestnetOrderIntent, *, kill_switch: KillSwitchSnapshot) -> TestnetOrderOperationResult:
        allowed_states = {TestnetOrderState.SUBMITTED, TestnetOrderState.PARTIALLY_FILLED, TestnetOrderState.UNKNOWN}
        if intent.state not in allowed_states:
            return TestnetOrderOperationResult(status="blocked", reason_code="testnet_order_cancel_not_allowed")
        requested = replace(intent, state=TestnetOrderState.CANCEL_REQUESTED)
        started = _event("testnet_order_cancel_requested", intent.state, requested.state, "testnet_order_cancel_requested", {"clientOrderId": intent.client_order_id, "killSwitchEnabled": kill_switch.enabled})
        cancel = self.connector.cancel_order(requested.request)
        if cancel.snapshot is None:
            return TestnetOrderOperationResult(status="unknown", reason_code="testnet_order_submit_unknown_state", intent=replace(requested, state=TestnetOrderState.UNKNOWN), events=[started])
        updated = replace(requested, state=cancel.snapshot.state, exchange_order_id=cancel.snapshot.exchange_order_id)
        if cancel.snapshot.state == TestnetOrderState.CANCELLED:
            return TestnetOrderOperationResult(status="cancelled", reason_code=cancel.reason_code, intent=updated, snapshot=cancel.snapshot, events=[started, _event("testnet_order_cancel_accepted", requested.state, updated.state, cancel.reason_code, {"clientOrderId": intent.client_order_id})])
        return TestnetOrderOperationResult(status="reconciliation_required", reason_code=cancel.reason_code, intent=updated, snapshot=cancel.snapshot, events=[started, _event("testnet_order_reconcile_mismatch", requested.state, updated.state, cancel.reason_code, {"clientOrderId": intent.client_order_id})])

    def reconcile_intent(self, intent: TestnetOrderIntent, *, kill_switch: KillSwitchSnapshot | None = None) -> TestnetOrderOperationResult:
        started = _event("testnet_order_reconcile_started", intent.state, intent.state, "testnet_order_reconcile_started", {"clientOrderId": intent.client_order_id, "killSwitchEnabled": bool(kill_switch.enabled) if kill_switch is not None else False})
        reconcile = self.connector.reconcile(intent.request)
        if reconcile.snapshot is None:
            return TestnetOrderOperationResult(status="reconciliation_required", reason_code="testnet_order_reconciliation_required", intent=replace(intent, state=TestnetOrderState.RECONCILIATION_REQUIRED), events=[started])
        updated = replace(intent, state=reconcile.snapshot.state, exchange_order_id=reconcile.snapshot.exchange_order_id, reconciled=True)
        status = "reconciled" if updated.state != TestnetOrderState.RECONCILIATION_REQUIRED else "reconciliation_required"
        return TestnetOrderOperationResult(status=status, reason_code=reconcile.reason_code, intent=updated, snapshot=reconcile.snapshot, events=[started, _event("testnet_order_reconcile_completed", intent.state, updated.state, reconcile.reason_code, {"clientOrderId": intent.client_order_id})])

    def audit_event_for_test(self, *, action: str, reason_code: str, metadata: dict[str, object]) -> TestnetOrderAuditEvent:
        return _event(action, None, None, reason_code, metadata)

    def _preview_guard(self, *, credential: CredentialReadinessSummary, risk: RiskGateSnapshot, kill_switch: KillSwitchSnapshot) -> TestnetOrderOperationResult | None:
        environment = self.connector.get_environment()
        if environment.environment != "binance_testnet" or credential.environment != "binance_testnet":
            return _blocked("testnet_live_route_blocked", "testnet_order_blocked_live_environment")
        credential_not_ready = credential.exchange != "binance_spot" or credential.credential_status not in ALLOWED_TESTNET_CREDENTIAL_STATUSES or not credential.can_trade or credential.can_withdraw
        if credential_not_ready:
            return _blocked("testnet_credentials_not_approved", "testnet_order_preview_blocked")
        if not risk.passed:
            return _blocked(risk.reason_code, "testnet_order_preview_blocked")
        if kill_switch.enabled:
            return _blocked("testnet_kill_switch_enabled", "testnet_order_blocked_by_kill_switch")
        return None


def _validate_idempotency_key(value: str) -> str | None:
    if not value.strip():
        return "testnet_order_idempotency_required"
    if len(value) > 120 or is_secret_like_key(value):
        return "testnet_order_idempotency_invalid"
    return None


def _fingerprint(value: dict[str, object]) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)
    return _hash_text(payload)


def _hash_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _event(action: str, old_state: TestnetOrderState | None, new_state: TestnetOrderState | None, reason_code: str, metadata: dict[str, object] | None = None) -> TestnetOrderAuditEvent:
    return TestnetOrderAuditEvent(action=action, old_state=old_state.value if old_state is not None else None, new_state=new_state.value if new_state is not None else None, reason_code=reason_code, metadata=sanitize_credential_payload(metadata or {}))


def _blocked(reason_code: str, action: str) -> TestnetOrderOperationResult:
    return TestnetOrderOperationResult(status="blocked", reason_code=reason_code, events=[_event(action, None, None, reason_code)])
