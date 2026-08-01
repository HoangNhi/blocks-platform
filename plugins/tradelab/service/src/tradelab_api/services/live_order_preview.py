from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from decimal import Decimal
import hashlib
import json
from typing import Any
from uuid import UUID

from tradelab_api.services.credential_redaction import is_secret_like_key, sanitize_credential_payload
from tradelab_api.services.live_credential_repository import LiveCredentialRepository
from tradelab_api.services.live_order_policy import LiveOrderPolicyInput, evaluate_live_order_policy
from tradelab_api.services.live_order_state import build_client_order_id, build_intent_key
from tradelab_api.services.live_order_state_repository import LiveOrderStateRepository

SAFETY_STATUS = "assisted_live_preview_only"
READY_CREDENTIAL_STATUSES = {"stored_live_only", "validated_live_read_only", "fake_live_ready"}


@dataclass(frozen=True)
class LiveOrderPreviewRequestData:
    confirm_preview_only: bool
    idempotency_key: str
    client_action_id: str
    source: str
    actor: str
    strategy_id: UUID
    strategy_version_id: UUID
    source_run_id: UUID | None
    source_signal_package_id: str | None
    credential_ref_id: UUID
    environment: str
    exchange: str
    market_type: str
    symbol: str
    side: str
    order_type: str
    quantity: Decimal | None
    quote_quantity: Decimal | None


@dataclass(frozen=True)
class LiveOrderPreviewResult:
    status: str
    allowed: bool
    reason_code: str
    semantic_status_code: int = 200
    should_commit: bool = False
    intent_id: str | None = None
    preview_id: str | None = None
    client_order_id: str | None = None
    expires_at: datetime | None = None
    order: dict[str, Any] | None = None
    source_context: dict[str, Any] | None = None
    credential_snapshot: dict[str, Any] = field(default_factory=dict)
    risk_snapshot: dict[str, Any] = field(default_factory=dict)
    audit_event_ids: list[str] = field(default_factory=list)
    details: dict[str, Any] = field(default_factory=dict)
    safety_status: str = SAFETY_STATUS


def preview_live_order(
    order_repository: LiveOrderStateRepository,
    credential_repository: LiveCredentialRepository,
    request: LiveOrderPreviewRequestData,
    *,
    live_order_submit_kill_switch_enabled: bool = True,
    connector_mode: str = "fake",
    real_network_enabled: bool = False,
    environment_name: str = "local",
    binance_live_base_url: str = "https://api.binance.com",
    vault_provider_name: str = "disabled",
) -> LiveOrderPreviewResult:
    early_block = _validate_request_shape(request)
    if early_block is not None:
        return early_block

    intent_key = build_intent_key(
        strategy_id=str(request.strategy_id),
        strategy_version_id=str(request.strategy_version_id),
        source_run_id=str(request.source_run_id) if request.source_run_id else None,
        credential_ref_id=str(request.credential_ref_id),
        environment="binance_live",
        symbol=request.symbol,
        side=request.side,
        order_type="market",
        quantity=str(request.quantity) if request.quantity is not None else None,
        quote_quantity=str(request.quote_quantity) if request.quote_quantity is not None else None,
        client_action_id=request.client_action_id,
    )
    existing_intent = order_repository.get_intent_by_key(intent_key)
    if existing_intent is not None:
        replay = order_repository.get_preview_by_idempotency_key(existing_intent.id, request.idempotency_key)
        if replay is not None:
            if replay.preview_key != _preview_key(request):
                return _blocked("live_order_preview_idempotency_conflict", 409)
            return _allowed_from_rows(existing_intent, replay, replay.credential_snapshot or {})

    policy = evaluate_live_order_policy(
        order_repository,
        LiveOrderPolicyInput(action="preview", actor=request.actor, symbol=request.symbol),
        live_order_submit_kill_switch_enabled=live_order_submit_kill_switch_enabled,
        connector_mode=connector_mode,
        real_network_enabled=real_network_enabled,
        environment_name=environment_name,
        binance_live_base_url=binance_live_base_url,
        vault_provider_name=vault_provider_name,
    )
    if not policy.allowed:
        return _blocked(policy.reason_code, 403)

    credential = credential_repository.get_credential_ref(request.credential_ref_id)
    if credential is None or getattr(credential, "is_deleted", False):
        return _blocked("live_order_preview_credential_not_found", 404)

    credential_block = _credential_block_reason(credential)
    credential_snapshot = _credential_snapshot(credential)
    if credential_block is not None:
        return _blocked(credential_block, 400, credential_snapshot=credential_snapshot)

    client_order_id = build_client_order_id(intent_key)
    source_snapshot = _source_snapshot(request)
    risk_snapshot = {"passed": True, "reasonCode": "live_order_risk_gate_passed", "failedGates": []}
    expires_at = datetime.now(UTC) + timedelta(minutes=15)
    intent = existing_intent or order_repository.create_intent(
        intent_key=intent_key,
        strategy_id=request.strategy_id,
        strategy_version_id=request.strategy_version_id,
        source_run_id=request.source_run_id,
        source_signal_package_id=request.source_signal_package_id,
        credential_ref_id=request.credential_ref_id,
        environment="binance_live",
        exchange="binance",
        market_type="spot",
        symbol=request.symbol.upper(),
        side=request.side.lower(),
        order_type="market",
        quantity=request.quantity,
        quote_quantity=request.quote_quantity,
        client_order_id=client_order_id,
        status="draft_previewed",
        status_reason_code="live_order_preview_allowed",
        metadata={"source": request.source, "clientActionId": request.client_action_id},
        actor=request.actor,
    )
    preview = order_repository.create_preview(
        intent_id=intent.id,
        preview_key=_preview_key(request),
        status="allowed",
        reason_code="live_order_preview_allowed",
        symbol=request.symbol.upper(),
        side=request.side.lower(),
        order_type="market",
        quantity=request.quantity,
        quote_quantity=request.quote_quantity,
        estimated_notional=request.quote_quantity or request.quantity,
        estimated_fee=None,
        risk_snapshot=risk_snapshot,
        credential_snapshot=credential_snapshot,
        source_snapshot=source_snapshot,
        expires_at=expires_at,
        metadata={"idempotencyKeyHash": _hash_text(request.idempotency_key)},
        actor=request.actor,
    )
    order_repository.set_latest_preview(intent, preview_id=preview.id, actor=request.actor)
    event = order_repository.add_event(
        intent_id=intent.id,
        preview_id=preview.id,
        event_type="live_order_preview_created",
        from_status=None,
        to_status="draft_previewed",
        reason_code="live_order_preview_allowed",
        idempotency_key=request.idempotency_key,
        client_order_id=intent.client_order_id,
        exchange_order_id=None,
        actor=request.actor,
        metadata={"source": request.source, "clientActionId": request.client_action_id},
    )
    return _result_from_rows(intent, preview, credential_snapshot, [str(event.id)], should_commit=True)


def _validate_request_shape(request: LiveOrderPreviewRequestData) -> LiveOrderPreviewResult | None:
    if not request.confirm_preview_only:
        return _blocked("live_order_preview_confirmation_required", 400)
    if not request.idempotency_key.strip():
        return _blocked("live_order_preview_idempotency_required", 400)
    if len(request.idempotency_key) > 120 or is_secret_like_key(request.idempotency_key):
        return _blocked("live_order_preview_idempotency_invalid", 400)
    if request.environment != "binance_live" or request.exchange != "binance" or request.market_type != "spot":
        return _blocked("live_order_preview_live_route_blocked", 400)
    if request.order_type.lower() != "market" or request.side.lower() not in {"buy", "sell"}:
        return _blocked("live_order_preview_risk_gate_failed", 400)
    if not request.symbol.strip():
        return _blocked("live_order_preview_symbol_not_allowed", 400)
    has_quantity = request.quantity is not None
    has_quote = request.quote_quantity is not None
    if has_quantity == has_quote:
        return _blocked("live_order_preview_quantity_invalid", 400)
    if request.quantity is not None and request.quantity <= 0:
        return _blocked("live_order_preview_quantity_invalid", 400)
    if request.quote_quantity is not None and request.quote_quantity <= 0:
        return _blocked("live_order_preview_quantity_invalid", 400)
    return None


def _credential_block_reason(credential: Any) -> str | None:
    evidence = credential.permission_evidence or {}
    if credential.environment != "binance_live" or credential.exchange != "binance_spot":
        return "live_order_preview_live_route_blocked"
    if credential.status not in READY_CREDENTIAL_STATUSES:
        return "live_order_preview_credential_not_ready"
    if not evidence.get("canTrade"):
        return "live_order_preview_credential_not_ready"
    if evidence.get("canWithdraw") or evidence.get("marginOrFuturesEnabled"):
        return "live_order_preview_unsafe_permissions"
    return None


def _credential_snapshot(credential: Any) -> dict[str, Any]:
    evidence = credential.permission_evidence or {}
    return sanitize_credential_payload(
        {
            "credentialRefId": str(credential.id),
            "status": credential.status,
            "environment": credential.environment,
            "exchange": credential.exchange,
            "canTrade": bool(evidence.get("canTrade")),
            "canWithdraw": bool(evidence.get("canWithdraw")),
            "marginOrFuturesEnabled": bool(evidence.get("marginOrFuturesEnabled")),
        }
    )


def _source_snapshot(request: LiveOrderPreviewRequestData) -> dict[str, Any]:
    return {
        "strategyId": str(request.strategy_id),
        "strategyVersionId": str(request.strategy_version_id),
        "sourceRunId": str(request.source_run_id) if request.source_run_id else None,
        "sourceSignalPackageId": request.source_signal_package_id,
    }


def _preview_key(request: LiveOrderPreviewRequestData) -> str:
    payload = json.dumps(
        {
            "strategyId": str(request.strategy_id),
            "strategyVersionId": str(request.strategy_version_id),
            "credentialRefId": str(request.credential_ref_id),
            "symbol": request.symbol.upper(),
            "side": request.side.lower(),
            "orderType": request.order_type.lower(),
            "quantity": str(request.quantity) if request.quantity is not None else None,
            "quoteQuantity": str(request.quote_quantity) if request.quote_quantity is not None else None,
            "clientActionId": request.client_action_id,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return "preview-" + _hash_text(payload)


def _hash_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _blocked(
    reason_code: str,
    semantic_status_code: int,
    *,
    credential_snapshot: dict[str, Any] | None = None,
) -> LiveOrderPreviewResult:
    return LiveOrderPreviewResult(
        status="blocked",
        allowed=False,
        reason_code=reason_code,
        semantic_status_code=semantic_status_code,
        credential_snapshot=credential_snapshot or {},
        risk_snapshot={"passed": False, "reasonCode": reason_code, "failedGates": [reason_code]},
    )


def _allowed_from_rows(intent: Any, preview: Any, credential_snapshot: dict[str, Any]) -> LiveOrderPreviewResult:
    return _result_from_rows(intent, preview, credential_snapshot, [], should_commit=False, reason_code="live_order_preview_idempotency_replayed")


def _result_from_rows(
    intent: Any,
    preview: Any,
    credential_snapshot: dict[str, Any],
    audit_event_ids: list[str],
    *,
    should_commit: bool,
    reason_code: str | None = None,
) -> LiveOrderPreviewResult:
    return LiveOrderPreviewResult(
        status="previewed",
        allowed=True,
        reason_code=reason_code or preview.reason_code or "live_order_preview_allowed",
        should_commit=should_commit,
        intent_id=str(intent.id),
        preview_id=str(preview.id),
        client_order_id=intent.client_order_id,
        expires_at=preview.expires_at,
        order={
            "environment": intent.environment,
            "exchange": intent.exchange,
            "marketType": intent.market_type,
            "symbol": intent.symbol,
            "side": intent.side,
            "orderType": intent.order_type,
            "quantity": intent.quantity,
            "quoteQuantity": intent.quote_quantity,
            "estimatedNotional": preview.estimated_notional,
            "estimatedFee": preview.estimated_fee,
        },
        source_context={
            "strategyId": str(intent.strategy_id),
            "strategyVersionId": str(intent.strategy_version_id),
            "sourceRunId": str(intent.source_run_id) if intent.source_run_id else None,
            "sourceSignalPackageId": intent.source_signal_package_id,
        },
        credential_snapshot=credential_snapshot,
        risk_snapshot=preview.risk_snapshot or {},
        audit_event_ids=audit_event_ids,
    )
