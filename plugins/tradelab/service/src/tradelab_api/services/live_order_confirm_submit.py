from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
import time
from typing import Any
from uuid import UUID

import httpx

from tradelab_api.services.credential_redaction import is_secret_like_key, sanitize_credential_payload
from tradelab_api.services.fake_binance_live_connector import FakeBinanceLiveConnector
from tradelab_api.services.live_credential_repository import LiveCredentialRepository
from tradelab_api.services.live_credential_vault import (
    PHASE_20_LIVE_ORDER_SUBMIT_PURPOSE,
    CredentialVaultProvider,
    LiveCredentialReadRequestData,
    read_live_credential_secret_for_internal_purpose,
)
from tradelab_api.services.live_connector_contract import ConnectorOrderRequest, LiveOrderState
from tradelab_api.services.live_order_preview import READY_CREDENTIAL_STATUSES
from tradelab_api.services.live_order_state_repository import LiveOrderStateRepository
from tradelab_api.services.live_proof_window import LiveProofWindowRuntimeGate, proof_window_allows_real_submit
from tradelab_api.services.real_binance_spot_live_connector import RealBinanceSpotLiveConnector, RealBinanceSpotLiveConnectorError

SAFETY_STATUS = "assisted_live_confirm_submit_fake_only"
REAL_SAFETY_STATUS = "assisted_live_real_submit_live_only"


@dataclass(frozen=True)
class LiveOrderConfirmSubmitRequestData:
    preview_id: UUID
    confirm_live_order: bool
    idempotency_key: str
    actor: str
    live_order_submit_kill_switch_enabled: bool = True
    connector_mode: str = "fake"
    real_network_enabled: bool = False
    environment_name: str = "local"
    binance_live_base_url: str = "https://api.binance.com"
    vault_provider_name: str = "disabled"
    recv_window_ms: int = 5000
    timeout_seconds: float = 5.0
    request_time_ms: int | None = None


@dataclass(frozen=True)
class LiveOrderConfirmSubmitResult:
    status: str
    reason_code: str
    semantic_status_code: int = 200
    should_commit: bool = False
    intent_id: str | None = None
    preview_id: str | None = None
    client_order_id: str | None = None
    exchange_order_id: str | None = None
    intent_status: str | None = None
    submit_snapshot: dict[str, Any] = field(default_factory=dict)
    audit_event_ids: list[str] = field(default_factory=list)
    details: dict[str, Any] = field(default_factory=dict)
    safety_status: str = SAFETY_STATUS


def confirm_submit_live_order(
    order_repository: LiveOrderStateRepository,
    credential_repository: LiveCredentialRepository,
    request: LiveOrderConfirmSubmitRequestData,
    *,
    vault_provider: CredentialVaultProvider | None = None,
    http_client: httpx.Client | None = None,
) -> LiveOrderConfirmSubmitResult:
    shape_block = _validate_request_shape(request)
    if shape_block is not None:
        return shape_block

    preview, intent = order_repository.get_preview_with_intent(request.preview_id)
    if preview is None or intent is None:
        return _blocked("live_order_submit_preview_not_found", 404, safety_status=_safety_status_for_request(request))

    scoped_idempotency_key = _scoped_idempotency_key(request)
    replay_event = order_repository.get_latest_submit_event_by_idempotency_key(intent.id, scoped_idempotency_key)
    if replay_event is not None and replay_event.event_type != "live_order_submit_attempted":
        return _result_from_intent(
            intent,
            preview_id=preview.id,
            reason_code="live_order_submit_idempotency_replayed",
            status=_status_from_intent(intent.status),
            audit_event_ids=[],
            should_commit=False,
            safety_status=_safety_status_for_request(request),
        )

    if intent.status in {"unknown", "reconciliation_required"}:
        return _blocked("live_order_requires_reconciliation_before_submit", 409, intent=intent, preview_id=preview.id, safety_status=_safety_status_for_request(request))
    if preview.status != "allowed" or intent.status != "draft_previewed":
        return _blocked("live_order_submit_state_not_allowed", 409, intent=intent, preview_id=preview.id)
    if preview.expires_at is not None and preview.expires_at <= datetime.now(UTC):
        return _blocked("live_order_submit_preview_expired", 409, intent=intent, preview_id=preview.id)
    if intent.environment != "binance_live" or intent.exchange != "binance" or intent.market_type != "spot" or intent.order_type != "market":
        return _blocked("live_order_submit_state_not_allowed", 409, intent=intent, preview_id=preview.id)

    credential = credential_repository.get_credential_ref(intent.credential_ref_id)
    credential_block = _credential_block_reason(credential)
    if credential_block is not None:
        return _blocked(credential_block, 403, intent=intent, preview_id=preview.id)

    if request.live_order_submit_kill_switch_enabled:
        event = order_repository.add_event(
            intent_id=intent.id,
            preview_id=preview.id,
            event_type="live_order_submit_blocked",
            from_status=intent.status,
            to_status=intent.status,
            reason_code="live_order_submit_kill_switch_enabled",
            idempotency_key=scoped_idempotency_key,
            client_order_id=intent.client_order_id,
            exchange_order_id=intent.exchange_order_id,
            actor=request.actor,
            metadata={"killSwitchEnabled": True},
        )
        return _blocked(
            "live_order_submit_kill_switch_enabled",
            403,
            intent=intent,
            preview_id=preview.id,
            audit_event_ids=[str(event.id)],
            should_commit=True,
            safety_status=_safety_status_for_request(request),
        )

    real_gate = _real_mode_gate_block(request)
    if real_gate is not None:
        reason_code, status_code = real_gate
        event = order_repository.add_event(
            intent_id=intent.id,
            preview_id=preview.id,
            event_type="live_order_submit_blocked",
            from_status=intent.status,
            to_status=intent.status,
            reason_code=reason_code,
            idempotency_key=scoped_idempotency_key,
            client_order_id=intent.client_order_id,
            exchange_order_id=intent.exchange_order_id,
            actor=request.actor,
            metadata={"connectorMode": request.connector_mode, "networkEnabled": request.real_network_enabled},
            )
        return _blocked(reason_code, status_code, intent=intent, preview_id=preview.id, audit_event_ids=[str(event.id)], should_commit=True, safety_status=_safety_status_for_request(request))

    if request.connector_mode.lower().strip() == "real":
        proof_window_block = proof_window_allows_real_submit(
            order_repository,
            runtime_gate=LiveProofWindowRuntimeGate(
                kill_switch_enabled=request.live_order_submit_kill_switch_enabled,
                connector_mode=request.connector_mode,
                real_network_enabled=request.real_network_enabled,
                environment_name=request.environment_name,
                binance_live_base_url=request.binance_live_base_url,
                vault_provider_name=request.vault_provider_name,
            ),
            current_intent_id=intent.id,
            actor=request.actor,
        )
        if proof_window_block is not None:
            event = order_repository.add_event(
                intent_id=intent.id,
                preview_id=preview.id,
                event_type="live_order_submit_blocked",
                from_status=intent.status,
                to_status=intent.status,
                reason_code=proof_window_block.reason_code,
                idempotency_key=scoped_idempotency_key,
                client_order_id=intent.client_order_id,
                exchange_order_id=intent.exchange_order_id,
                actor=request.actor,
                metadata=proof_window_block.details,
            )
            return _blocked(
                proof_window_block.reason_code,
                proof_window_block.semantic_status_code,
                intent=intent,
                preview_id=preview.id,
                audit_event_ids=[str(event.id)],
                should_commit=True,
                safety_status=_safety_status_for_request(request),
            )

    confirmation = order_repository.add_event(
        intent_id=intent.id,
        preview_id=preview.id,
        event_type="live_order_confirmation_recorded",
        from_status=intent.status,
        to_status="confirmed",
        reason_code="live_order_confirmation_recorded",
        idempotency_key=scoped_idempotency_key,
        client_order_id=intent.client_order_id,
        exchange_order_id=intent.exchange_order_id,
        actor=request.actor,
        metadata={"previewId": str(preview.id)},
    )
    order_repository.update_intent_status(
        intent,
        status="confirmed",
        reason_code="live_order_confirmation_recorded",
        reconciliation_required=False,
        actor=request.actor,
    )
    attempted = order_repository.add_event(
        intent_id=intent.id,
        preview_id=preview.id,
        event_type="live_order_submit_attempted",
        from_status="confirmed",
        to_status="submitting",
        reason_code="live_order_submit_attempted",
        idempotency_key=scoped_idempotency_key,
        client_order_id=intent.client_order_id,
        exchange_order_id=intent.exchange_order_id,
        actor=request.actor,
        metadata={"connectorMode": request.connector_mode.lower().strip()},
    )
    order_repository.update_intent_status(
        intent,
        status="submitting",
        reason_code="live_order_submit_attempted",
        reconciliation_required=False,
        actor=request.actor,
    )

    order_request = ConnectorOrderRequest(
        symbol=intent.symbol,
        side=intent.side,
        order_type=intent.order_type,
        quantity=intent.quantity,
        quote_quantity=intent.quote_quantity,
        client_order_id=intent.client_order_id,
        metadata={"intentId": str(intent.id), "previewId": str(preview.id)},
    )
    safety_status = _safety_status_for_request(request)
    vault_audit_event_ids: list[str] = []
    if request.connector_mode.lower().strip() == "real":
        if vault_provider is None:
            return _blocked("live_order_submit_vault_provider_not_supported", 403, intent=intent, preview_id=preview.id, safety_status=safety_status)
        read = read_live_credential_secret_for_internal_purpose(
            credential_repository,
            vault_provider,
            request=LiveCredentialReadRequestData(
                credential_ref_id=intent.credential_ref_id,
                purpose=PHASE_20_LIVE_ORDER_SUBMIT_PURPOSE,
                actor=request.actor,
                request_id=f"{intent.id}:{preview.id}",
            ),
        )
        vault_audit_event_ids = read.audit_event_ids
        if read.status != "allowed" or read.payload is None:
            return _blocked(
                "live_order_submit_vault_read_blocked",
                read.semantic_status_code,
                intent=intent,
                preview_id=preview.id,
                audit_event_ids=vault_audit_event_ids,
                should_commit=True,
                safety_status=safety_status,
            )
        try:
            connector = RealBinanceSpotLiveConnector(
                base_url=request.binance_live_base_url,
                timeout_seconds=request.timeout_seconds,
                http_client=http_client,
            )
        except RealBinanceSpotLiveConnectorError as exc:
            return _blocked(exc.reason_code, 403, intent=intent, preview_id=preview.id, safety_status=safety_status)
        submit = connector.submit_order(
            order_request,
            api_key=read.payload["apiKey"],
            api_secret=read.payload["apiSecret"],
            recv_window_ms=request.recv_window_ms,
            request_time_ms=request.request_time_ms or int(time.time() * 1000),
        )
    else:
        connector = FakeBinanceLiveConnector(scenario=_scenario_from_idempotency_key(request.idempotency_key))
        submit = connector.submit_order(order_request)
    snapshot = submit.snapshot
    if snapshot is None or snapshot.state == LiveOrderState.UNKNOWN:
        unknown_reason = submit.reason_code if request.connector_mode.lower().strip() == "real" else "live_order_submit_fake_unknown_state"
        order_repository.update_intent_status(
            intent,
            status="unknown",
            reason_code=unknown_reason,
            reconciliation_required=True,
            actor=request.actor,
        )
        final_event_type = "live_order_submit_unknown_recorded"
        result_status = "unknown"
        result_reason = unknown_reason
        exchange_status = "unknown"
        exchange_order_id = snapshot.exchange_order_id if snapshot is not None else None
    elif snapshot.state == LiveOrderState.REJECTED:
        rejected_reason = submit.reason_code if request.connector_mode.lower().strip() == "real" else "live_order_submit_fake_rejected"
        order_repository.update_intent_status(
            intent,
            status="rejected",
            reason_code=rejected_reason,
            reconciliation_required=False,
            actor=request.actor,
        )
        final_event_type = "live_order_submit_rejected"
        result_status = "rejected"
        result_reason = rejected_reason
        exchange_status = "rejected"
        exchange_order_id = snapshot.exchange_order_id
    else:
        final_status = "partially_filled" if snapshot.state == LiveOrderState.PARTIALLY_FILLED else "submitted"
        accepted_reason = submit.reason_code if request.connector_mode.lower().strip() == "real" else "live_order_submit_fake_accepted"
        order_repository.update_intent_status(
            intent,
            status=final_status,
            reason_code=accepted_reason,
            reconciliation_required=False,
            actor=request.actor,
        )
        final_event_type = "live_order_submit_accepted"
        result_status = final_status
        result_reason = accepted_reason
        exchange_status = final_status
        exchange_order_id = snapshot.exchange_order_id

    order_repository.update_intent_exchange_snapshot(
        intent,
        exchange_order_id=exchange_order_id,
        exchange_order_status=exchange_status,
        metadata={
            "connectorMode": request.connector_mode.lower().strip(),
            "connectorMetadata": sanitize_credential_payload(submit.metadata),
            "vaultAuditEventIds": vault_audit_event_ids,
        },
        actor=request.actor,
    )
    if request.connector_mode.lower().strip() == "real":
        order_repository.consume_proof_window(
            actor=request.actor,
            active_intent_id=intent.id,
            reason="accepted_live_submit_consumed",
        )
    completed = order_repository.add_event(
        intent_id=intent.id,
        preview_id=preview.id,
        event_type=final_event_type,
        from_status="submitting",
        to_status=intent.status,
        reason_code=result_reason,
        idempotency_key=scoped_idempotency_key,
        client_order_id=intent.client_order_id,
        exchange_order_id=intent.exchange_order_id,
        actor=request.actor,
        metadata={
            "connectorMode": request.connector_mode.lower().strip(),
            "snapshot": _snapshot_dict(snapshot),
            "connectorMetadata": sanitize_credential_payload(submit.metadata),
            "vaultAuditEventIds": vault_audit_event_ids,
        },
    )
    return _result_from_intent(
        intent,
        preview_id=preview.id,
        reason_code=result_reason,
        status=result_status,
        audit_event_ids=[str(confirmation.id), str(attempted.id), str(completed.id)],
        should_commit=True,
        snapshot=_snapshot_dict(snapshot),
        safety_status=safety_status,
    )


def _validate_request_shape(request: LiveOrderConfirmSubmitRequestData) -> LiveOrderConfirmSubmitResult | None:
    if not request.confirm_live_order:
        return _blocked("live_order_submit_confirmation_required", 400)
    if not request.idempotency_key.strip():
        return _blocked("live_order_submit_idempotency_required", 400)
    if len(request.idempotency_key) > 120 or is_secret_like_key(request.idempotency_key):
        return _blocked("live_order_submit_idempotency_invalid", 400)
    return None


def _real_mode_gate_block(request: LiveOrderConfirmSubmitRequestData) -> tuple[str, int] | None:
    mode = request.connector_mode.lower().strip()
    if mode not in {"fake", "real"}:
        return "live_order_submit_connector_mode_invalid", 400
    if mode == "fake":
        return None
    if not request.real_network_enabled:
        return "live_order_submit_real_network_not_enabled", 403
    if request.environment_name not in {"local", "development", "test"}:
        return "live_order_submit_environment_not_allowed", 403
    if request.binance_live_base_url.rstrip("/") != "https://api.binance.com":
        return "live_order_submit_base_url_not_allowed", 403
    if request.vault_provider_name != "local_dev_encrypted":
        return "live_order_submit_vault_provider_not_supported", 403
    return None


def _safety_status_for_request(request: LiveOrderConfirmSubmitRequestData) -> str:
    return REAL_SAFETY_STATUS if request.connector_mode.lower().strip() == "real" else SAFETY_STATUS


def _credential_block_reason(credential: Any) -> str | None:
    if credential is None or getattr(credential, "is_deleted", False) or not getattr(credential, "is_active", True):
        return "live_order_submit_credential_not_ready"
    evidence = credential.permission_evidence or {}
    if credential.environment != "binance_live" or credential.exchange != "binance_spot":
        return "live_order_submit_credential_not_ready"
    if credential.status not in READY_CREDENTIAL_STATUSES or not evidence.get("canTrade"):
        return "live_order_submit_credential_not_ready"
    if evidence.get("canWithdraw") or evidence.get("marginOrFuturesEnabled"):
        return "live_order_submit_unsafe_permissions"
    return None


def _scoped_idempotency_key(request: LiveOrderConfirmSubmitRequestData) -> str:
    return f"live-order-confirm-submit:{request.preview_id}:{request.idempotency_key}"


def _scenario_from_idempotency_key(value: str) -> str:
    if value in {"rejected", "timeout_unknown", "partial_fill"}:
        return value
    return "accepted"


def _status_from_intent(status: str) -> str:
    if status in {"submitted", "partially_filled", "rejected", "unknown"}:
        return status
    return "blocked"


def _snapshot_dict(snapshot: Any) -> dict[str, Any]:
    if snapshot is None:
        return {}
    return sanitize_credential_payload(
        {
            "state": snapshot.state.value if hasattr(snapshot.state, "value") else str(snapshot.state),
            "exchangeOrderStatus": snapshot.state.value if hasattr(snapshot.state, "value") else str(snapshot.state),
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
    preview_id: UUID | None = None,
    audit_event_ids: list[str] | None = None,
    should_commit: bool = False,
    safety_status: str = SAFETY_STATUS,
) -> LiveOrderConfirmSubmitResult:
    return LiveOrderConfirmSubmitResult(
        status="blocked",
        reason_code=reason_code,
        semantic_status_code=semantic_status_code,
        should_commit=should_commit,
        intent_id=str(intent.id) if intent is not None else None,
        preview_id=str(preview_id) if preview_id is not None else None,
        client_order_id=getattr(intent, "client_order_id", None),
        exchange_order_id=getattr(intent, "exchange_order_id", None),
        intent_status=getattr(intent, "status", None),
        audit_event_ids=audit_event_ids or [],
        safety_status=safety_status,
    )


def _result_from_intent(
    intent: Any,
    *,
    preview_id: UUID,
    reason_code: str,
    status: str,
    audit_event_ids: list[str],
    should_commit: bool,
    snapshot: dict[str, Any] | None = None,
    safety_status: str = SAFETY_STATUS,
) -> LiveOrderConfirmSubmitResult:
    return LiveOrderConfirmSubmitResult(
        status=status,
        reason_code=reason_code,
        should_commit=should_commit,
        intent_id=str(intent.id),
        preview_id=str(preview_id),
        client_order_id=intent.client_order_id,
        exchange_order_id=intent.exchange_order_id,
        intent_status=intent.status,
        submit_snapshot=snapshot or {},
        audit_event_ids=audit_event_ids,
        safety_status=safety_status,
    )
