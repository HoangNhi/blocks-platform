from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from tradelab_api.services.live_order_state_repository import LiveOrderStateRepository
from tradelab_api.services.live_proof_window import LiveProofWindowRuntimeGate, evaluate_live_runtime_gate

LIVE_ORDER_SAFETY_STATUS = "assisted_live_pilot_controls_only"


@dataclass(frozen=True)
class LiveOrderPolicyInput:
    action: str
    actor: str
    symbol: str | None = None
    preview_id: str | None = None


@dataclass(frozen=True)
class LiveOrderPolicyResult:
    allowed: bool
    reason_code: str
    safety_status: str = LIVE_ORDER_SAFETY_STATUS
    details: dict[str, Any] | None = None


def evaluate_live_order_policy(
    repository: LiveOrderStateRepository,
    policy_input: LiveOrderPolicyInput,
    *,
    live_order_submit_kill_switch_enabled: bool = True,
    connector_mode: str = "fake",
    real_network_enabled: bool = False,
    environment_name: str = "local",
    binance_live_base_url: str = "https://api.binance.com",
    vault_provider_name: str = "disabled",
) -> LiveOrderPolicyResult:
    pilot = repository.get_or_create_pilot_control()
    action = policy_input.action
    if action in {"preview", "submit"} and live_order_submit_kill_switch_enabled:
        return LiveOrderPolicyResult(False, "live_order_submit_kill_switch_enabled")
    if getattr(pilot, "status", None) == "hard_stop" and action in {"preview", "submit"}:
        return LiveOrderPolicyResult(False, "live_pilot_hard_stop_active")
    runtime_gate = LiveProofWindowRuntimeGate(
        kill_switch_enabled=live_order_submit_kill_switch_enabled,
        connector_mode=connector_mode,
        real_network_enabled=real_network_enabled,
        environment_name=environment_name,
        binance_live_base_url=binance_live_base_url,
        vault_provider_name=vault_provider_name,
    )
    is_real_gate_open, _gate_reason = evaluate_live_runtime_gate(runtime_gate)
    if action in {"preview", "submit"} and is_real_gate_open:
        if getattr(pilot, "proof_window_status", "closed") != "open":
            return LiveOrderPolicyResult(False, "live_order_proof_window_closed")
        if getattr(pilot, "proof_window_expires_at", None) is not None and pilot.proof_window_expires_at <= datetime.now(UTC):
            return LiveOrderPolicyResult(False, "live_order_proof_window_expired")
        if getattr(pilot, "proof_window_remaining_intent_budget", 0) <= 0:
            return LiveOrderPolicyResult(False, "live_order_proof_window_budget_consumed")
    if action == "preview" and repository.count_active_non_terminal_live_intents() > 0:
        return LiveOrderPolicyResult(False, "live_pilot_single_active_intent_required")
    return LiveOrderPolicyResult(True, "live_order_policy_allowed")


def reopen_live_pilot(repository: LiveOrderStateRepository, *, actor: str, confirm_reopen: bool) -> object:
    return repository.reopen_after_hard_stop(actor=actor, confirm_reopen=confirm_reopen)
