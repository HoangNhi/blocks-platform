from __future__ import annotations

from uuid import UUID

from tradelab_api.services.credential_redaction import sanitize_credential_payload
from tradelab_api.services.live_order_state_repository import LiveOrderStateRepository


def get_live_order_detail(repository: LiveOrderStateRepository, order_id: UUID) -> dict | None:
    intent = repository.get_intent(order_id)
    if intent is None:
        return None
    previews = repository.list_previews_for_intent(intent.id)
    latest_preview = repository.get_preview(intent.latest_preview_id) if intent.latest_preview_id else (previews[0] if previews else None)
    return {
        "safetyStatus": "assisted_live_order_read_only",
        "intent": _intent(intent),
        "latestPreview": _preview(latest_preview) if latest_preview else None,
        "previews": [_preview(row) for row in previews],
        "events": [_event(row) for row in repository.list_events_for_intent(intent.id)],
        "reconciliationAttempts": [_attempt(row) for row in repository.list_reconciliation_attempts_for_intent(intent.id)],
    }


def list_live_orders(
    repository: LiveOrderStateRepository,
    *,
    strategy_id: UUID | None = None,
    strategy_version_id: UUID | None = None,
    source_run_id: UUID | None = None,
    credential_ref_id: UUID | None = None,
    status: str | None = None,
    symbol: str | None = None,
    limit: int = 20,
) -> dict:
    items = []
    for intent in repository.list_intents(
        strategy_id=strategy_id,
        strategy_version_id=strategy_version_id,
        source_run_id=source_run_id,
        credential_ref_id=credential_ref_id,
        status=status,
        symbol=symbol,
        limit=limit,
    ):
        latest_preview = repository.get_preview(intent.latest_preview_id) if intent.latest_preview_id else None
        items.append({"intent": _intent(intent), "latestPreview": _preview(latest_preview) if latest_preview else None})
    return {"safetyStatus": "assisted_live_order_list_read_only", "items": items}


def _intent(row) -> dict:
    return {
        "intentId": str(row.id),
        "intentKey": row.intent_key,
        "status": row.status,
        "reasonCode": row.status_reason_code,
        "clientOrderId": row.client_order_id,
        "environment": row.environment,
        "exchange": row.exchange,
        "marketType": row.market_type,
        "symbol": row.symbol,
        "side": row.side,
        "orderType": row.order_type,
        "quantity": row.quantity,
        "quoteQuantity": row.quote_quantity,
        "strategyId": str(row.strategy_id),
        "strategyVersionId": str(row.strategy_version_id),
        "sourceRunId": str(row.source_run_id) if row.source_run_id else None,
        "credentialRefId": str(row.credential_ref_id),
        "latestPreviewId": str(row.latest_preview_id) if row.latest_preview_id else None,
        "reconciliationRequired": row.reconciliation_required,
        "createdAt": row.created_at,
        "updatedAt": row.updated_at,
    }


def _preview(row) -> dict:
    return {
        "previewId": str(row.id),
        "previewKey": row.preview_key,
        "status": row.status,
        "reasonCode": row.reason_code,
        "symbol": row.symbol,
        "side": row.side,
        "orderType": row.order_type,
        "quantity": row.quantity,
        "quoteQuantity": row.quote_quantity,
        "estimatedNotional": row.estimated_notional,
        "estimatedFee": row.estimated_fee,
        "riskSnapshot": sanitize_credential_payload(row.risk_snapshot or {}),
        "credentialSnapshot": sanitize_credential_payload(row.credential_snapshot or {}),
        "sourceSnapshot": sanitize_credential_payload(row.source_snapshot or {}),
        "expiresAt": row.expires_at,
        "createdAt": row.created_at,
    }


def _event(row) -> dict:
    return {
        "eventId": str(row.id),
        "previewId": str(row.preview_id) if row.preview_id else None,
        "eventType": row.event_type,
        "fromStatus": row.from_status,
        "toStatus": row.to_status,
        "reasonCode": row.reason_code,
        "clientOrderId": row.client_order_id,
        "exchangeOrderId": row.exchange_order_id,
        "actor": row.actor,
        "metadata": sanitize_credential_payload(row.metadata_ or {}),
        "createdAt": row.created_at,
    }


def _attempt(row) -> dict:
    return {
        "attemptId": str(row.id),
        "attemptNo": row.attempt_no,
        "trigger": row.trigger,
        "status": row.status,
        "reasonCode": row.reason_code,
        "exchangeOrderStatus": row.exchange_order_status,
        "fillsSnapshot": sanitize_credential_payload(row.fills_snapshot or {}),
        "metadata": sanitize_credential_payload(row.metadata_ or {}),
        "createdAt": row.created_at,
    }
