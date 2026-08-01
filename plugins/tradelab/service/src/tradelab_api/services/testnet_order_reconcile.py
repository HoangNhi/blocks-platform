from __future__ import annotations

from dataclasses import dataclass, field
import time
from typing import Any
from uuid import UUID

import httpx

from tradelab_api.services.credential_redaction import sanitize_credential_payload
from tradelab_api.services.fake_binance_testnet_connector import FakeBinanceTestnetConnector
from tradelab_api.services.real_binance_spot_testnet_connector import RealBinanceSpotTestnetConnector, RealBinanceSpotTestnetConnectorError
from tradelab_api.services.testnet_connector_contract import ConnectorOrderRequest, TestnetOrderState
from tradelab_api.services.testnet_credential_repository import TestnetCredentialRepository
from tradelab_api.services.testnet_credential_vault import (
    PHASE_19_4_RECONCILE_PURPOSE,
    CredentialVaultProvider,
    TestnetCredentialReadRequestData,
    read_testnet_credential_secret_for_internal_purpose,
)
from tradelab_api.services.testnet_order_confirm_submit import READY_CREDENTIAL_STATUSES
from tradelab_api.services.testnet_order_state_repository import TestnetOrderStateRepository

SAFETY_STATUS = "assisted_testnet_reconcile_testnet_only"
ALLOWED_RECONCILE_STATUSES = {"submitted", "partially_filled", "unknown", "reconciliation_required", "cancel_requested"}
ALLOWED_TRIGGERS = {"manual", "cancel_race", "unknown_recovery", "operator_review"}


@dataclass(frozen=True)
class TestnetOrderReconcileRequestData:
    order_id: UUID
    confirm_testnet_reconcile: bool
    trigger: str = "manual"
    actor: str = "local-user"
    submit_kill_switch_enabled: bool = True
    connector_mode: str = "fake"
    real_network_enabled: bool = False
    environment_name: str = "local"
    binance_testnet_base_url: str = "https://testnet.binance.vision"
    vault_provider_name: str = "fake"
    recv_window_ms: int = 5000
    timeout_seconds: float = 5.0
    request_time_ms: int | None = None


@dataclass(frozen=True)
class TestnetOrderReconcileResult:
    status: str
    reason_code: str
    safety_status: str = SAFETY_STATUS
    semantic_status_code: int = 200
    should_commit: bool = False
    intent_id: str | None = None
    client_order_id: str | None = None
    exchange_order_id: str | None = None
    intent_status: str | None = None
    reconciliation_attempt_id: str | None = None
    reconcile_snapshot: dict[str, Any] = field(default_factory=dict)
    audit_event_ids: list[str] = field(default_factory=list)
    details: dict[str, Any] = field(default_factory=dict)


def reconcile_testnet_order(
    order_repository: TestnetOrderStateRepository,
    credential_repository: TestnetCredentialRepository,
    request: TestnetOrderReconcileRequestData,
    *,
    vault_provider: CredentialVaultProvider | None = None,
    http_client: httpx.Client | None = None,
) -> TestnetOrderReconcileResult:
    shape_block = _validate_request_shape(request)
    if shape_block is not None:
        return shape_block

    intent = order_repository.get_intent(request.order_id)
    if intent is None:
        return _blocked("testnet_order_reconcile_order_not_found", 404)
    if not _intent_shape_allowed(intent) or intent.status not in ALLOWED_RECONCILE_STATUSES:
        return _blocked("testnet_order_reconcile_state_not_allowed", 409, intent=intent)

    credential = credential_repository.get_credential_ref(intent.credential_ref_id)
    credential_block = _credential_block_reason(credential)
    if credential_block is not None:
        return _blocked(credential_block, 403, intent=intent)

    real_gate = _real_mode_gate_block(request)
    if real_gate is not None:
        reason_code, status_code = real_gate
        event = order_repository.add_event(
            intent_id=intent.id,
            preview_id=None,
            event_type="testnet_order_reconcile_blocked",
            from_status=intent.status,
            to_status=intent.status,
            reason_code=reason_code,
            idempotency_key=None,
            client_order_id=intent.client_order_id,
            exchange_order_id=intent.exchange_order_id,
            actor=request.actor,
            metadata={"connectorMode": request.connector_mode, "networkEnabled": request.real_network_enabled},
        )
        return _blocked(reason_code, status_code, intent=intent, audit_event_ids=[str(event.id)], should_commit=True)

    started = order_repository.add_event(
        intent_id=intent.id,
        preview_id=None,
        event_type="testnet_order_reconcile_started",
        from_status=intent.status,
        to_status=intent.status,
        reason_code="testnet_order_reconcile_started",
        idempotency_key=None,
        client_order_id=intent.client_order_id,
        exchange_order_id=intent.exchange_order_id,
        actor=request.actor,
        metadata={"trigger": request.trigger, "killSwitchEnabled": request.submit_kill_switch_enabled},
    )
    attempt = order_repository.add_reconciliation_attempt(
        intent_id=intent.id,
        attempt_no=order_repository.get_next_reconciliation_attempt_no(intent.id),
        trigger=request.trigger,
        status="started",
        reason_code="testnet_order_reconcile_started",
        exchange_order_status=None,
        fills_snapshot={},
        metadata={"startedEventId": str(started.id)},
        actor=request.actor,
    )

    order_request = _order_request_from_intent(intent)
    vault_audit_event_ids: list[str] = []
    mode = request.connector_mode.lower().strip()
    if mode == "real":
        if vault_provider is None:
            return _blocked("testnet_order_reconcile_vault_provider_not_supported", 403, intent=intent)
        read = read_testnet_credential_secret_for_internal_purpose(
            credential_repository,
            vault_provider,
            request=TestnetCredentialReadRequestData(
                credential_ref_id=intent.credential_ref_id,
                purpose=PHASE_19_4_RECONCILE_PURPOSE,
                actor=request.actor,
                request_id=f"{intent.id}:reconcile:{attempt.attempt_no}",
            ),
        )
        vault_audit_event_ids = read.audit_event_ids
        if read.status != "allowed" or read.payload is None:
            return _blocked(
                "testnet_order_reconcile_vault_read_blocked",
                read.semantic_status_code,
                intent=intent,
                reconciliation_attempt_id=str(attempt.id),
                audit_event_ids=vault_audit_event_ids,
                should_commit=True,
            )
        try:
            connector = RealBinanceSpotTestnetConnector(
                base_url=request.binance_testnet_base_url,
                timeout_seconds=request.timeout_seconds,
                http_client=http_client,
            )
        except RealBinanceSpotTestnetConnectorError:
            return _blocked("testnet_order_reconcile_base_url_not_allowed", 403, intent=intent)
        result = connector.reconcile_order(
            order_request,
            api_key=read.payload["apiKey"],
            api_secret=read.payload["apiSecret"],
            recv_window_ms=request.recv_window_ms,
            request_time_ms=request.request_time_ms or int(time.time() * 1000),
        )
    else:
        result = FakeBinanceTestnetConnector(scenario="accepted").reconcile(order_request)

    snapshot = result.snapshot
    final_status, reconciliation_required, event_type, attempt_status = _map_reconcile_snapshot(snapshot)
    order_repository.update_intent_status(
        intent,
        status=final_status,
        reason_code=result.reason_code,
        reconciliation_required=reconciliation_required,
        actor=request.actor,
    )
    order_repository.update_intent_exchange_snapshot(
        intent,
        exchange_order_id=snapshot.exchange_order_id if snapshot is not None else intent.exchange_order_id,
        exchange_order_status=final_status,
        metadata={
            "connectorMode": mode,
            "connectorMetadata": sanitize_credential_payload(result.metadata),
            "vaultAuditEventIds": vault_audit_event_ids,
        },
        actor=request.actor,
    )
    exchange_status = _exchange_status(snapshot, final_status)
    attempt.status = attempt_status
    attempt.reason_code = result.reason_code
    attempt.exchange_order_status = exchange_status
    attempt.fills_snapshot = sanitize_credential_payload(_snapshot_dict(snapshot))
    attempt.metadata_ = sanitize_credential_payload({"connectorMode": mode, "vaultAuditEventIds": vault_audit_event_ids})
    completed = order_repository.add_event(
        intent_id=intent.id,
        preview_id=None,
        event_type=event_type,
        from_status=started.from_status,
        to_status=intent.status,
        reason_code=result.reason_code,
        idempotency_key=None,
        client_order_id=intent.client_order_id,
        exchange_order_id=intent.exchange_order_id,
        actor=request.actor,
        metadata={
            "trigger": request.trigger,
            "attemptId": str(attempt.id),
            "snapshot": _snapshot_dict(snapshot),
            "connectorMetadata": sanitize_credential_payload(result.metadata),
            "vaultAuditEventIds": vault_audit_event_ids,
        },
    )
    return _result_from_intent(
        intent,
        status=final_status,
        reason_code=result.reason_code,
        should_commit=True,
        reconciliation_attempt_id=str(attempt.id),
        audit_event_ids=[str(started.id), str(completed.id)],
        snapshot=_snapshot_dict(snapshot),
    )


def _validate_request_shape(request: TestnetOrderReconcileRequestData) -> TestnetOrderReconcileResult | None:
    if not request.confirm_testnet_reconcile:
        return _blocked("testnet_order_reconcile_confirmation_required", 400)
    if request.trigger not in ALLOWED_TRIGGERS:
        return _blocked("testnet_order_reconcile_trigger_invalid", 400)
    return None


def _real_mode_gate_block(request: TestnetOrderReconcileRequestData) -> tuple[str, int] | None:
    mode = request.connector_mode.lower().strip()
    if mode not in {"fake", "real"}:
        return "testnet_order_reconcile_connector_mode_invalid", 400
    if mode == "fake":
        return None
    if not request.real_network_enabled:
        return "testnet_order_reconcile_real_network_not_enabled", 403
    if request.environment_name not in {"local", "development", "test"}:
        return "testnet_order_reconcile_environment_not_allowed", 403
    if request.binance_testnet_base_url.rstrip("/") != "https://testnet.binance.vision":
        return "testnet_order_reconcile_base_url_not_allowed", 403
    if request.vault_provider_name != "local_dev_encrypted":
        return "testnet_order_reconcile_vault_provider_not_supported", 403
    return None


def _credential_block_reason(credential: Any) -> str | None:
    if credential is None or getattr(credential, "is_deleted", False) or not getattr(credential, "is_active", True):
        return "testnet_order_reconcile_credential_not_ready"
    evidence = credential.permission_evidence or {}
    if credential.environment != "binance_testnet" or credential.exchange != "binance_spot":
        return "testnet_order_reconcile_credential_not_ready"
    if credential.status not in READY_CREDENTIAL_STATUSES or not evidence.get("canTrade"):
        return "testnet_order_reconcile_credential_not_ready"
    if evidence.get("marginOrFuturesEnabled"):
        return "testnet_order_reconcile_unsafe_permissions"
    return None


def _intent_shape_allowed(intent: Any) -> bool:
    return intent.environment == "binance_testnet" and intent.exchange == "binance" and intent.market_type == "spot"


def _order_request_from_intent(intent: Any) -> ConnectorOrderRequest:
    return ConnectorOrderRequest(
        symbol=intent.symbol,
        side=intent.side,
        order_type=intent.order_type,
        quantity=intent.quantity,
        quote_quantity=intent.quote_quantity,
        client_order_id=intent.client_order_id,
        metadata={"intentId": str(intent.id)},
    )


def _map_reconcile_snapshot(snapshot: Any) -> tuple[str, bool, str, str]:
    if snapshot is None or snapshot.state == TestnetOrderState.RECONCILIATION_REQUIRED:
        return "reconciliation_required", True, "testnet_order_reconcile_ambiguous", "ambiguous"
    if snapshot.state == TestnetOrderState.UNKNOWN:
        return "reconciliation_required", True, "testnet_order_reconcile_ambiguous", "ambiguous"
    if snapshot.state == TestnetOrderState.CANCELLED:
        return "cancelled", False, "testnet_order_reconcile_completed", "matched"
    if snapshot.state == TestnetOrderState.FILLED:
        return "filled", False, "testnet_order_reconcile_completed", "matched"
    if snapshot.state == TestnetOrderState.PARTIALLY_FILLED:
        return "partially_filled", False, "testnet_order_reconcile_completed", "matched"
    if snapshot.state == TestnetOrderState.REJECTED:
        return "rejected", False, "testnet_order_reconcile_completed", "matched"
    return "submitted", False, "testnet_order_reconcile_completed", "matched"


def _exchange_status(snapshot: Any, fallback: str) -> str:
    if snapshot is None:
        return fallback
    metadata = snapshot.metadata or {}
    return str(metadata.get("exchangeOrderStatus") or fallback)


def _snapshot_dict(snapshot: Any) -> dict[str, Any]:
    if snapshot is None:
        return {}
    return sanitize_credential_payload(
        {
            "state": snapshot.state.value if hasattr(snapshot.state, "value") else str(snapshot.state),
            "exchangeOrderStatus": _exchange_status(snapshot, snapshot.state.value if hasattr(snapshot.state, "value") else str(snapshot.state)),
            "exchangeOrderId": snapshot.exchange_order_id,
            "executedQuantity": str(snapshot.executed_quantity),
            "cumulativeQuoteQuantity": str(snapshot.cumulative_quote_quantity),
            "reasonCode": snapshot.reason_code,
            "metadata": snapshot.metadata,
        }
    )


def _blocked(
    reason_code: str,
    semantic_status_code: int,
    *,
    intent: Any | None = None,
    reconciliation_attempt_id: str | None = None,
    audit_event_ids: list[str] | None = None,
    should_commit: bool = False,
) -> TestnetOrderReconcileResult:
    return TestnetOrderReconcileResult(
        status="blocked",
        reason_code=reason_code,
        semantic_status_code=semantic_status_code,
        should_commit=should_commit,
        intent_id=str(intent.id) if intent is not None else None,
        client_order_id=getattr(intent, "client_order_id", None),
        exchange_order_id=getattr(intent, "exchange_order_id", None),
        intent_status=getattr(intent, "status", None),
        reconciliation_attempt_id=reconciliation_attempt_id,
        audit_event_ids=audit_event_ids or [],
    )


def _result_from_intent(
    intent: Any,
    *,
    status: str,
    reason_code: str,
    should_commit: bool,
    reconciliation_attempt_id: str,
    audit_event_ids: list[str],
    snapshot: dict[str, Any] | None = None,
) -> TestnetOrderReconcileResult:
    return TestnetOrderReconcileResult(
        status=status,
        reason_code=reason_code,
        should_commit=should_commit,
        intent_id=str(intent.id),
        client_order_id=intent.client_order_id,
        exchange_order_id=intent.exchange_order_id,
        intent_status=intent.status,
        reconciliation_attempt_id=reconciliation_attempt_id,
        reconcile_snapshot=snapshot or {},
        audit_event_ids=audit_event_ids,
    )
