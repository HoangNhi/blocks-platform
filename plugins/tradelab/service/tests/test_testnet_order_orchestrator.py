from __future__ import annotations

from decimal import Decimal

from tradelab_api.services.fake_binance_testnet_connector import FakeBinanceTestnetConnector
from tradelab_api.services.testnet_connector_contract import TestnetOrderState as OrderState
from tradelab_api.services.testnet_order_orchestrator import (
    CredentialReadinessSummary,
    KillSwitchSnapshot,
    RiskGateSnapshot,
    TestnetOrderOrchestrator as OrderOrchestrator,
    TestnetOrderPreviewInput as OrderPreviewInput,
)


def _credential(**overrides) -> CredentialReadinessSummary:
    values = {
        "exchange": "binance_spot",
        "environment": "binance_testnet",
        "credential_status": "validated_testnet_read_only",
        "can_trade": True,
        "can_withdraw": False,
    }
    values.update(overrides)
    return CredentialReadinessSummary(**values)


def _preview_input(**overrides) -> OrderPreviewInput:
    values = {
        "source_run_id": "run-1",
        "strategy_id": "strategy-1",
        "strategy_version_id": "version-1",
        "symbol": "BTCUSDT",
        "side": "buy",
        "order_type": "market",
        "quantity": Decimal("0.01"),
        "quote_quantity": None,
        "actor": "admin",
    }
    values.update(overrides)
    return OrderPreviewInput(**values)


def _orchestrator(scenario: str = "accepted") -> OrderOrchestrator:
    return OrderOrchestrator(connector=FakeBinanceTestnetConnector(scenario=scenario))


def test_preview_creates_local_preview_without_submit() -> None:
    orchestrator = _orchestrator()

    result = orchestrator.build_preview(
        _preview_input(),
        credential=_credential(),
        risk=RiskGateSnapshot(passed=True),
        kill_switch=KillSwitchSnapshot(enabled=False),
    )

    assert result.status == "previewed"
    assert result.reason_code == "testnet_connector_fake_preview_created"
    assert result.preview is not None
    assert result.preview.state == OrderState.PREVIEWED
    assert result.intent is None
    assert result.events[-1].action == "testnet_order_preview_created"


def test_confirm_requires_explicit_confirmation() -> None:
    orchestrator = _orchestrator()
    preview = orchestrator.build_preview(
        _preview_input(),
        credential=_credential(),
        risk=RiskGateSnapshot(passed=True),
        kill_switch=KillSwitchSnapshot(enabled=False),
    ).preview
    assert preview is not None

    result = orchestrator.confirm_intent(
        preview,
        confirm_testnet_order=False,
        idempotency_key="confirm-1",
        actor="admin",
    )

    assert result.status == "blocked"
    assert result.reason_code == "testnet_order_confirmation_required"
    assert result.intent is None


def test_confirm_idempotency_replay_and_conflict() -> None:
    orchestrator = _orchestrator()
    first_preview = orchestrator.build_preview(
        _preview_input(quantity=Decimal("0.01")),
        credential=_credential(),
        risk=RiskGateSnapshot(passed=True),
        kill_switch=KillSwitchSnapshot(enabled=False),
    ).preview
    second_preview = orchestrator.build_preview(
        _preview_input(quantity=Decimal("0.02")),
        credential=_credential(),
        risk=RiskGateSnapshot(passed=True),
        kill_switch=KillSwitchSnapshot(enabled=False),
    ).preview
    assert first_preview is not None
    assert second_preview is not None

    first = orchestrator.confirm_intent(
        first_preview,
        confirm_testnet_order=True,
        idempotency_key="confirm-1",
        actor="admin",
    )
    replay = orchestrator.confirm_intent(
        first_preview,
        confirm_testnet_order=True,
        idempotency_key="confirm-1",
        actor="admin",
    )
    conflict = orchestrator.confirm_intent(
        second_preview,
        confirm_testnet_order=True,
        idempotency_key="confirm-1",
        actor="admin",
    )

    assert first.status == "confirmed"
    assert first.intent is not None
    assert first.intent.state == OrderState.USER_CONFIRMED
    assert first.intent.client_order_id.startswith("tl-testnet-")
    assert replay.status == "confirmed"
    assert replay.reason_code == "testnet_order_idempotency_replayed"
    assert replay.intent == first.intent
    assert conflict.status == "blocked"
    assert conflict.reason_code == "testnet_order_idempotency_conflict"

def _confirmed_intent(orchestrator: OrderOrchestrator):
    preview = orchestrator.build_preview(
        _preview_input(),
        credential=_credential(),
        risk=RiskGateSnapshot(passed=True),
        kill_switch=KillSwitchSnapshot(enabled=False),
    ).preview
    assert preview is not None
    confirmed = orchestrator.confirm_intent(
        preview,
        confirm_testnet_order=True,
        idempotency_key="confirm-submit-1",
        actor="admin",
    )
    assert confirmed.intent is not None
    return confirmed.intent


def test_submit_moves_user_confirmed_intent_to_submitted() -> None:
    orchestrator = _orchestrator("accepted")
    intent = _confirmed_intent(orchestrator)

    result = orchestrator.submit_intent(intent, kill_switch=KillSwitchSnapshot(enabled=False))

    assert result.status == "submitted"
    assert result.reason_code == "testnet_order_submit_accepted"
    assert result.intent is not None
    assert result.intent.state == OrderState.SUBMITTED
    assert result.intent.exchange_order_id == "fake-exchange-" + intent.client_order_id
    assert [event.action for event in result.events] == [
        "testnet_order_submit_attempted",
        "testnet_order_submit_accepted",
    ]


def test_unknown_submit_blocks_second_submit_until_reconcile() -> None:
    orchestrator = _orchestrator("timeout_unknown")
    intent = _confirmed_intent(orchestrator)
    unknown = orchestrator.submit_intent(intent, kill_switch=KillSwitchSnapshot(enabled=False))
    assert unknown.intent is not None

    blocked = orchestrator.submit_intent(unknown.intent, kill_switch=KillSwitchSnapshot(enabled=False))
    reconciled = orchestrator.reconcile_intent(unknown.intent)

    assert unknown.status == "unknown"
    assert blocked.status == "blocked"
    assert blocked.reason_code == "testnet_order_unknown_requires_reconciliation"
    assert reconciled.status == "reconciled"
    assert reconciled.intent is not None
    assert reconciled.intent.reconciled is True
    assert reconciled.intent.state == OrderState.SUBMITTED


def test_kill_switch_blocks_submit_but_allows_cancel_and_reconcile() -> None:
    submit_orchestrator = _orchestrator("accepted")
    intent = _confirmed_intent(submit_orchestrator)

    blocked_submit = submit_orchestrator.submit_intent(
        intent,
        kill_switch=KillSwitchSnapshot(enabled=True),
    )
    assert blocked_submit.status == "blocked"
    assert blocked_submit.reason_code == "testnet_kill_switch_enabled"

    cancel_orchestrator = _orchestrator("accepted")
    submitted = cancel_orchestrator.submit_intent(
        _confirmed_intent(cancel_orchestrator),
        kill_switch=KillSwitchSnapshot(enabled=False),
    )
    assert submitted.intent is not None
    cancel = cancel_orchestrator.cancel_intent(
        submitted.intent,
        kill_switch=KillSwitchSnapshot(enabled=True),
    )
    assert cancel.status == "cancelled"
    assert cancel.reason_code == "testnet_order_cancel_accepted"

    unknown_orchestrator = _orchestrator("timeout_unknown")
    unknown = unknown_orchestrator.submit_intent(
        _confirmed_intent(unknown_orchestrator),
        kill_switch=KillSwitchSnapshot(enabled=False),
    )
    assert unknown.intent is not None
    reconcile = unknown_orchestrator.reconcile_intent(
        unknown.intent,
        kill_switch=KillSwitchSnapshot(enabled=True),
    )
    assert reconcile.status == "reconciled"


def test_cancel_fill_race_returns_reconciliation_required() -> None:
    orchestrator = _orchestrator("cancel_fill_race")
    submitted = orchestrator.submit_intent(
        _confirmed_intent(orchestrator),
        kill_switch=KillSwitchSnapshot(enabled=False),
    )
    assert submitted.intent is not None

    cancel = orchestrator.cancel_intent(submitted.intent, kill_switch=KillSwitchSnapshot(enabled=False))

    assert cancel.status == "reconciliation_required"
    assert cancel.reason_code == "testnet_order_cancel_reconciliation_required"
    assert cancel.intent is not None
    assert cancel.intent.state == OrderState.RECONCILIATION_REQUIRED


def test_live_environment_and_unsafe_credentials_block_preview() -> None:
    live_result = _orchestrator().build_preview(
        _preview_input(),
        credential=_credential(environment="binance_live"),
        risk=RiskGateSnapshot(passed=True),
        kill_switch=KillSwitchSnapshot(enabled=False),
    )
    unsafe_result = _orchestrator().build_preview(
        _preview_input(),
        credential=_credential(credential_status="unsafe_permissions", can_withdraw=True),
        risk=RiskGateSnapshot(passed=True),
        kill_switch=KillSwitchSnapshot(enabled=False),
    )

    assert live_result.status == "blocked"
    assert live_result.reason_code == "testnet_live_route_blocked"
    assert unsafe_result.status == "blocked"
    assert unsafe_result.reason_code == "testnet_credentials_not_approved"


def test_audit_metadata_redacts_secret_like_fields() -> None:
    event = _orchestrator().audit_event_for_test(
        action="testnet_order_submit_attempted",
        reason_code="testnet_order_submit_accepted",
        metadata={
            "apiSecret": "super-secret",
            "nested": {"signature": "abc"},
            "clientOrderId": "safe-id",
        },
    )

    assert event.metadata["apiSecret"] == "[REDACTED]"
    assert event.metadata["nested"] == {"signature": "[REDACTED]"}
    assert event.metadata["clientOrderId"] == "safe-id"

def test_fake_connector_and_orchestrator_do_not_import_runtime_boundaries() -> None:
    import inspect

    import tradelab_api.services.fake_binance_testnet_connector as fake_connector
    import tradelab_api.services.testnet_order_orchestrator as orchestrator

    combined_source = inspect.getsource(fake_connector) + inspect.getsource(orchestrator)

    forbidden = [
        "FastAPI",
        "APIRouter",
        "Depends",
        "Session",
        "sqlalchemy",
        "httpx",
        "requests",
        "aiohttp",
        "binance.client",
    ]
    for token in forbidden:
        assert token not in combined_source
