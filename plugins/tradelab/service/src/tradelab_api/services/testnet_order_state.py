from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass

ORDER_STATUS_TRANSITIONS: dict[str, set[str]] = {
    "draft_previewed": {"confirmed", "preview_blocked"},
    "preview_blocked": set(),
    "confirmed": {"submitting"},
    "submitting": {"submitted", "partially_filled", "filled", "rejected", "unknown"},
    "submitted": {"partially_filled", "filled", "cancel_requested", "reconciliation_required"},
    "partially_filled": {"filled", "cancel_requested", "reconciliation_required"},
    "filled": {"journal_projected"},
    "cancel_requested": {"cancelled", "filled", "partially_filled", "reconciliation_required", "unknown"},
    "cancelled": {"reconciled", "journal_projected"},
    "rejected": {"reconciled"},
    "unknown": {"reconciliation_required", "reconciled"},
    "reconciliation_required": {"reconciled", "submitted", "partially_filled", "filled", "cancelled", "rejected"},
    "reconciled": {"journal_projected"},
    "journal_projected": set(),
}

SUBMIT_BLOCKED_STATUSES = {"unknown", "reconciliation_required"}

@dataclass(frozen=True)
class TestnetOrderStateError(Exception):
    __test__ = False

    reason_code: str
    from_status: str
    to_status: str | None = None

def transition_order_status(from_status: str, to_status: str) -> str:
    allowed = ORDER_STATUS_TRANSITIONS.get(from_status)
    if allowed is None or to_status not in allowed:
        raise TestnetOrderStateError(
            reason_code="testnet_order_invalid_state_transition",
            from_status=from_status,
            to_status=to_status,
        )
    return to_status

def ensure_same_intent_submit_allowed(status: str) -> None:
    if status in SUBMIT_BLOCKED_STATUSES:
        raise TestnetOrderStateError(
            reason_code="testnet_order_requires_reconciliation_before_submit",
            from_status=status,
        )

def build_intent_key(
    *,
    strategy_id: str,
    strategy_version_id: str,
    source_run_id: str | None,
    credential_ref_id: str,
    environment: str,
    symbol: str,
    side: str,
    order_type: str,
    quantity: str | None,
    quote_quantity: str | None,
    client_action_id: str,
) -> str:
    payload = {
        "strategyId": strategy_id,
        "strategyVersionId": strategy_version_id,
        "sourceRunId": source_run_id,
        "credentialRefId": credential_ref_id,
        "environment": environment,
        "symbol": symbol.upper(),
        "side": side.lower(),
        "orderType": order_type.lower(),
        "quantity": quantity,
        "quoteQuantity": quote_quantity,
        "clientActionId": client_action_id,
    }
    return "intent-" + _hash_payload(payload)

def build_client_order_id(intent_key: str) -> str:
    digest = hashlib.sha256(intent_key.encode("utf-8")).hexdigest()
    return "tltn-" + digest[:31]

def hash_idempotency_key(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()

def _hash_payload(value: dict[str, object]) -> str:
    payload = json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()
