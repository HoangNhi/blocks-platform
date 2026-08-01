from __future__ import annotations

TESTNET_ORDER_EVENT_TYPES: tuple[str, ...] = (
    "testnet_order_preview_created",
    "testnet_order_preview_blocked",
    "testnet_order_confirmation_recorded",
    "testnet_order_submit_planned",
    "testnet_order_submit_attempted",
    "testnet_order_submit_accepted",
    "testnet_order_submit_rejected",
    "testnet_order_submit_unknown_recorded",
    "testnet_order_submit_blocked",
    "testnet_order_cancel_requested",
    "testnet_order_cancel_accepted",
    "testnet_order_cancel_rejected",
    "testnet_order_cancel_unknown_recorded",
    "testnet_order_cancel_blocked",
    "testnet_order_unknown_recorded",
    "testnet_order_reconciliation_required",
    "testnet_order_reconciliation_attempt_recorded",
    "testnet_order_reconcile_started",
    "testnet_order_reconcile_completed",
    "testnet_order_reconcile_not_found",
    "testnet_order_reconcile_ambiguous",
    "testnet_order_reconcile_mismatch",
    "testnet_order_reconcile_blocked",
    "testnet_order_journal_projection_planned",
)


def testnet_order_event_type_check_constraint_sql() -> str:
    allowed = ", ".join(f"'{event_type}'" for event_type in TESTNET_ORDER_EVENT_TYPES)
    return f"event_type IN ({allowed})"
