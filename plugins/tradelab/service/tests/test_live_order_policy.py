from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

from tradelab_api.services.live_order_policy import LiveOrderPolicyInput, evaluate_live_order_policy, reopen_live_pilot


class MemoryPolicyRepository:
    def __init__(self) -> None:
        self.pilot = SimpleNamespace(
            status="ready",
            hard_stop_reason_code=None,
            active_intent_id=None,
            reopened_at=None,
            reopened_by=None,
            proof_window_status="closed",
            proof_window_opened_at=None,
            proof_window_opened_by=None,
            proof_window_expires_at=None,
            proof_window_remaining_intent_budget=0,
            proof_window_reason=None,
            proof_window_closed_at=None,
            proof_window_closed_by=None,
            proof_window_closed_reason=None,
        )
        self.active_intents = 0

    def get_or_create_pilot_control(self):
        return self.pilot

    def count_active_non_terminal_live_intents(self) -> int:
        return self.active_intents

    def reopen_after_hard_stop(self, *, actor: str, confirm_reopen: bool):
        if confirm_reopen:
            self.pilot.status = "ready"
            self.pilot.hard_stop_reason_code = None
            self.pilot.reopened_by = actor
        return self.pilot

    def activate_hard_stop(self, *, reason_code: str, active_intent_id, actor: str):
        self.pilot.status = "hard_stop"
        self.pilot.hard_stop_reason_code = reason_code
        self.pilot.active_intent_id = active_intent_id
        return self.pilot


def test_live_policy_blocks_new_preview_when_hard_stop_active() -> None:
    repository = MemoryPolicyRepository()
    repository.activate_hard_stop(reason_code="live_order_unknown_requires_reconciliation", active_intent_id=uuid4(), actor="local-user")

    result = evaluate_live_order_policy(repository, LiveOrderPolicyInput(action="preview", actor="local-user", symbol="BTCUSDT"), live_order_submit_kill_switch_enabled=False)

    assert result.allowed is False
    assert result.reason_code == "live_pilot_hard_stop_active"


def test_live_policy_blocks_preview_when_kill_switch_enabled() -> None:
    repository = MemoryPolicyRepository()

    result = evaluate_live_order_policy(repository, LiveOrderPolicyInput(action="preview", actor="local-user", symbol="BTCUSDT"))

    assert result.allowed is False
    assert result.reason_code == "live_order_submit_kill_switch_enabled"


def test_live_policy_requires_single_active_intent_for_preview() -> None:
    repository = MemoryPolicyRepository()
    repository.active_intents = 1

    result = evaluate_live_order_policy(repository, LiveOrderPolicyInput(action="preview", actor="local-user", symbol="BTCUSDT"), live_order_submit_kill_switch_enabled=False)

    assert result.allowed is False
    assert result.reason_code == "live_pilot_single_active_intent_required"


def test_live_policy_blocks_preview_when_real_mode_requires_closed_proof_window() -> None:
    repository = MemoryPolicyRepository()

    result = evaluate_live_order_policy(
        repository,
        LiveOrderPolicyInput(action="preview", actor="local-user", symbol="BTCUSDT"),
        live_order_submit_kill_switch_enabled=False,
        connector_mode="real",
        real_network_enabled=True,
        environment_name="local",
        binance_live_base_url="https://api.binance.com",
        vault_provider_name="local_dev_encrypted",
    )

    assert result.allowed is False
    assert result.reason_code == "live_order_proof_window_closed"


def test_live_pilot_reopen_after_hard_stop() -> None:
    repository = MemoryPolicyRepository()
    repository.activate_hard_stop(reason_code="live_order_unknown_requires_reconciliation", active_intent_id=uuid4(), actor="local-user")

    result = reopen_live_pilot(repository, actor="local-user", confirm_reopen=True)

    assert result.status == "ready"
