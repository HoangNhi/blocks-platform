from __future__ import annotations

from tradelab_api.services.testnet_order_state import (
    TestnetOrderStateError,
    build_client_order_id,
    build_intent_key,
    ensure_same_intent_submit_allowed,
    hash_idempotency_key,
    transition_order_status,
)

def test_build_intent_key_is_stable_for_same_payload() -> None:
    first = build_intent_key(
        strategy_id="strategy-1",
        strategy_version_id="version-1",
        source_run_id="run-1",
        credential_ref_id="credential-1",
        environment="binance_testnet",
        symbol="BTCUSDT",
        side="buy",
        order_type="market",
        quantity="0.010000000000",
        quote_quantity=None,
        client_action_id="preview-click-1",
    )
    second = build_intent_key(
        strategy_id="strategy-1",
        strategy_version_id="version-1",
        source_run_id="run-1",
        credential_ref_id="credential-1",
        environment="binance_testnet",
        symbol="BTCUSDT",
        side="buy",
        order_type="market",
        quantity="0.010000000000",
        quote_quantity=None,
        client_action_id="preview-click-1",
    )

    assert first == second
    assert first.startswith("intent-")

def test_build_client_order_id_is_stable_and_testnet_scoped() -> None:
    intent_key = "intent-" + "a" * 64

    first = build_client_order_id(intent_key)
    second = build_client_order_id(intent_key)

    assert first == second
    assert first.startswith("tltn-")
    assert len(first) <= 36

def test_idempotency_hash_redacts_raw_key_shape() -> None:
    digest = hash_idempotency_key("testnet-order-confirm:click-1")

    assert len(digest) == 64
    assert "click-1" not in digest

def test_valid_transitions_pass() -> None:
    assert transition_order_status("draft_previewed", "confirmed") == "confirmed"
    assert transition_order_status("confirmed", "submitting") == "submitting"
    assert transition_order_status("submitting", "unknown") == "unknown"
    assert transition_order_status("unknown", "reconciliation_required") == "reconciliation_required"
    assert transition_order_status("reconciliation_required", "reconciled") == "reconciled"

def test_phase_19_4_cancel_reconcile_transitions_are_valid() -> None:
    assert transition_order_status("submitted", "cancel_requested") == "cancel_requested"
    assert transition_order_status("partially_filled", "cancel_requested") == "cancel_requested"
    assert transition_order_status("cancel_requested", "cancelled") == "cancelled"
    assert transition_order_status("cancel_requested", "reconciliation_required") == "reconciliation_required"
    assert transition_order_status("unknown", "reconciliation_required") == "reconciliation_required"
    assert transition_order_status("reconciliation_required", "submitted") == "submitted"
    assert transition_order_status("reconciliation_required", "cancelled") == "cancelled"

def test_invalid_transition_raises_reason_code() -> None:
    try:
        transition_order_status("filled", "submitting")
    except TestnetOrderStateError as exc:
        assert exc.reason_code == "testnet_order_invalid_state_transition"
        assert exc.from_status == "filled"
        assert exc.to_status == "submitting"
    else:
        raise AssertionError("expected invalid transition")

def test_unknown_and_reconciliation_required_block_same_intent_submit() -> None:
    for status in {"unknown", "reconciliation_required"}:
        try:
            ensure_same_intent_submit_allowed(status)
        except TestnetOrderStateError as exc:
            assert exc.reason_code == "testnet_order_requires_reconciliation_before_submit"
        else:
            raise AssertionError("expected submit block")

def test_confirmed_allows_same_intent_submit_attempt() -> None:
    assert ensure_same_intent_submit_allowed("confirmed") is None

def test_phase_19_1_state_modules_do_not_import_network_or_api_boundaries() -> None:
    import inspect

    import tradelab_api.services.testnet_order_state as state
    import tradelab_api.services.testnet_order_state_repository as repository

    combined_source = inspect.getsource(state) + inspect.getsource(repository)

    forbidden = [
        "FastAPI",
        "APIRouter",
        "Depends",
        "httpx",
        "requests",
        "aiohttp",
        "binance.client",
        "/api/v3/order",
        "/api/v3/order/test",
        "confirm-submit",
        "testnet/reconcile",
    ]
    for token in forbidden:
        assert token not in combined_source
