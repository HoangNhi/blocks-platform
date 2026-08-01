from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from tradelab_api.services.live_order_state_repository import LiveOrderStateRepository


@dataclass(frozen=True)
class LiveProofWindowRuntimeGate:
    kill_switch_enabled: bool
    connector_mode: str
    real_network_enabled: bool
    environment_name: str
    binance_live_base_url: str
    vault_provider_name: str


@dataclass(frozen=True)
class LiveProofWindowOpenRequestData:
    confirm_open: bool
    actor: str
    reason: str
    ttl_seconds: int
    intent_budget: int


@dataclass(frozen=True)
class LiveProofWindowCloseRequestData:
    confirm_close: bool
    actor: str
    reason: str


@dataclass(frozen=True)
class LiveProofWindowResult:
    status: str
    reason_code: str
    semantic_status_code: int = 200
    should_commit: bool = False
    safety_status: str = "assisted_live_proof_window_controls_only"
    proof_window_status: str | None = None
    opened_at: datetime | None = None
    opened_by: str | None = None
    expires_at: datetime | None = None
    remaining_intent_budget: int = 0
    proof_window_reason: str | None = None
    closed_at: datetime | None = None
    closed_by: str | None = None
    closed_reason: str | None = None
    active_intent_id: str | None = None
    hard_stop_status: str | None = None
    hard_stop_reason_code: str | None = None
    runtime_gate: dict[str, Any] = field(default_factory=dict)
    details: dict[str, Any] = field(default_factory=dict)


def evaluate_live_runtime_gate(runtime_gate: LiveProofWindowRuntimeGate) -> tuple[bool, str]:
    if runtime_gate.kill_switch_enabled:
        return False, "live_order_submit_kill_switch_enabled"
    if runtime_gate.connector_mode != "real":
        return False, "live_order_submit_connector_mode_not_real"
    if not runtime_gate.real_network_enabled:
        return False, "live_order_submit_real_network_not_enabled"
    if runtime_gate.environment_name not in {"local", "development", "test"}:
        return False, "live_order_submit_environment_not_allowed"
    if runtime_gate.binance_live_base_url.rstrip("/") != "https://api.binance.com":
        return False, "live_order_submit_base_url_not_allowed"
    if runtime_gate.vault_provider_name != "local_dev_encrypted":
        return False, "live_order_submit_vault_provider_not_supported"
    return True, "live_proof_window_runtime_gate_ready"


def get_live_proof_window_status(
    repository: LiveOrderStateRepository,
    *,
    runtime_gate: LiveProofWindowRuntimeGate,
) -> LiveProofWindowResult:
    pilot = repository.get_or_create_pilot_control()
    if getattr(pilot, "proof_window_status", None) == "open":
        pilot = repository.expire_proof_window_if_needed(actor="system")
    gate_allowed, gate_reason = evaluate_live_runtime_gate(runtime_gate)
    return _result_from_pilot(
        pilot,
        status="reported",
        reason_code="live_proof_window_status_read",
        runtime_gate=_runtime_gate_payload(runtime_gate, gate_allowed, gate_reason),
        details={"runtimeGateAllowed": gate_allowed, "runtimeGateReasonCode": gate_reason},
    )


def open_live_proof_window(
    repository: LiveOrderStateRepository,
    request: LiveProofWindowOpenRequestData,
    *,
    runtime_gate: LiveProofWindowRuntimeGate,
) -> LiveProofWindowResult:
    if not request.confirm_open:
        return _blocked(
            reason_code="live_proof_window_confirmation_required",
            semantic_status_code=400,
            runtime_gate=runtime_gate,
        )
    if request.intent_budget != 1:
        return _blocked(
            reason_code="live_proof_window_intent_budget_invalid",
            semantic_status_code=400,
            runtime_gate=runtime_gate,
        )
    if request.ttl_seconds <= 0:
        return _blocked(
            reason_code="live_proof_window_ttl_invalid",
            semantic_status_code=400,
            runtime_gate=runtime_gate,
        )
    gate_allowed, gate_reason = evaluate_live_runtime_gate(runtime_gate)
    if not gate_allowed:
        return _blocked(reason_code=gate_reason, semantic_status_code=403, runtime_gate=runtime_gate)

    pilot = repository.expire_proof_window_if_needed(actor=request.actor)
    if repository.has_unresolved_proof_window_debt():
        return _blocked(
            reason_code="live_order_proof_window_unresolved_debt_present",
            semantic_status_code=409,
            pilot=pilot,
            runtime_gate=runtime_gate,
        )
    if getattr(pilot, "status", None) == "hard_stop":
        return _blocked(
            reason_code="live_pilot_hard_stop_active",
            semantic_status_code=409,
            pilot=pilot,
            runtime_gate=runtime_gate,
        )
    if repository.count_active_non_terminal_live_intents() > 0:
        return _blocked(
            reason_code="live_pilot_single_active_intent_required",
            semantic_status_code=409,
            pilot=pilot,
            runtime_gate=runtime_gate,
        )
    if getattr(pilot, "proof_window_status", "closed") == "open":
        return _blocked(
            reason_code="live_proof_window_already_open",
            semantic_status_code=409,
            pilot=pilot,
            runtime_gate=runtime_gate,
        )

    opened = repository.open_proof_window(
        actor=request.actor,
        reason=request.reason,
        ttl_seconds=request.ttl_seconds,
        intent_budget=request.intent_budget,
    )
    return _result_from_pilot(
        opened,
        status="open",
        reason_code="live_proof_window_opened",
        should_commit=True,
        runtime_gate=_runtime_gate_payload(runtime_gate, gate_allowed, gate_reason),
        details={"operatorReason": request.reason, "intentBudget": request.intent_budget, "ttlSeconds": request.ttl_seconds},
    )


def close_live_proof_window(
    repository: LiveOrderStateRepository,
    request: LiveProofWindowCloseRequestData,
    *,
    runtime_gate: LiveProofWindowRuntimeGate,
) -> LiveProofWindowResult:
    if not request.confirm_close:
        return _blocked(
            reason_code="live_proof_window_confirmation_required",
            semantic_status_code=400,
            runtime_gate=runtime_gate,
        )
    if runtime_gate.environment_name not in {"local", "development", "test"}:
        return _blocked(
            reason_code="live_proof_window_environment_not_allowed",
            semantic_status_code=403,
            runtime_gate=runtime_gate,
        )
    if not request.reason.strip():
        return _blocked(
            reason_code="live_proof_window_reason_required",
            semantic_status_code=400,
            runtime_gate=runtime_gate,
        )

    closed = repository.close_proof_window(actor=request.actor, reason=request.reason)
    return _result_from_pilot(
        closed,
        status="closed",
        reason_code="live_proof_window_closed",
        should_commit=True,
        runtime_gate=_runtime_gate_payload(runtime_gate, True, "live_proof_window_environment_allowed"),
        details={"operatorReason": request.reason},
    )


def proof_window_allows_real_submit(
    repository: LiveOrderStateRepository,
    *,
    runtime_gate: LiveProofWindowRuntimeGate,
    current_intent_id: UUID,
    actor: str,
) -> LiveProofWindowResult | None:
    gate_allowed, gate_reason = evaluate_live_runtime_gate(runtime_gate)
    if not gate_allowed:
        return _blocked(reason_code=gate_reason, semantic_status_code=403, runtime_gate=runtime_gate)

    pilot = repository.expire_proof_window_if_needed(actor=actor)
    if repository.has_unresolved_proof_window_debt():
        return _blocked(
            reason_code="live_order_proof_window_unresolved_debt_present",
            semantic_status_code=409,
            pilot=pilot,
            runtime_gate=runtime_gate,
        )
    if getattr(pilot, "status", None) == "hard_stop":
        return _blocked(
            reason_code="live_pilot_hard_stop_active",
            semantic_status_code=409,
            pilot=pilot,
            runtime_gate=runtime_gate,
        )
    if getattr(pilot, "proof_window_status", "closed") == "expired":
        return _blocked(
            reason_code="live_order_proof_window_expired",
            semantic_status_code=409,
            pilot=pilot,
            runtime_gate=runtime_gate,
        )
    if getattr(pilot, "proof_window_status", "closed") != "open":
        return _blocked(
            reason_code="live_order_proof_window_closed",
            semantic_status_code=409,
            pilot=pilot,
            runtime_gate=runtime_gate,
        )
    if getattr(pilot, "proof_window_expires_at", None) is not None and pilot.proof_window_expires_at <= datetime.now(UTC):
        return _blocked(
            reason_code="live_order_proof_window_expired",
            semantic_status_code=409,
            pilot=pilot,
            runtime_gate=runtime_gate,
        )
    if getattr(pilot, "proof_window_remaining_intent_budget", 0) <= 0:
        return _blocked(
            reason_code="live_order_proof_window_budget_consumed",
            semantic_status_code=409,
            pilot=pilot,
            runtime_gate=runtime_gate,
        )
    if repository.count_active_non_terminal_live_intents(exclude_intent_id=current_intent_id) > 0:
        return _blocked(
            reason_code="live_pilot_single_active_intent_required",
            semantic_status_code=409,
            pilot=pilot,
            runtime_gate=runtime_gate,
        )
    return None


def _runtime_gate_payload(
    runtime_gate: LiveProofWindowRuntimeGate,
    allowed: bool,
    reason_code: str,
) -> dict[str, Any]:
    return {
        "allowed": allowed,
        "reasonCode": reason_code,
        "killSwitchEnabled": runtime_gate.kill_switch_enabled,
        "connectorMode": runtime_gate.connector_mode,
        "realNetworkEnabled": runtime_gate.real_network_enabled,
        "environmentName": runtime_gate.environment_name,
        "binanceLiveBaseUrl": runtime_gate.binance_live_base_url,
        "vaultProviderName": runtime_gate.vault_provider_name,
    }


def _result_from_pilot(
    pilot: Any,
    *,
    status: str,
    reason_code: str,
    runtime_gate: dict[str, Any],
    should_commit: bool = False,
    details: dict[str, Any] | None = None,
) -> LiveProofWindowResult:
    return LiveProofWindowResult(
        status=status,
        reason_code=reason_code,
        should_commit=should_commit,
        proof_window_status=getattr(pilot, "proof_window_status", None),
        opened_at=getattr(pilot, "proof_window_opened_at", None),
        opened_by=getattr(pilot, "proof_window_opened_by", None),
        expires_at=getattr(pilot, "proof_window_expires_at", None),
        remaining_intent_budget=int(getattr(pilot, "proof_window_remaining_intent_budget", 0) or 0),
        proof_window_reason=getattr(pilot, "proof_window_reason", None),
        closed_at=getattr(pilot, "proof_window_closed_at", None),
        closed_by=getattr(pilot, "proof_window_closed_by", None),
        closed_reason=getattr(pilot, "proof_window_closed_reason", None),
        active_intent_id=str(getattr(pilot, "active_intent_id", None)) if getattr(pilot, "active_intent_id", None) else None,
        hard_stop_status=getattr(pilot, "status", None),
        hard_stop_reason_code=getattr(pilot, "hard_stop_reason_code", None),
        runtime_gate=runtime_gate,
        details=details or {},
    )


def _blocked(
    *,
    reason_code: str,
    semantic_status_code: int,
    runtime_gate: LiveProofWindowRuntimeGate,
    pilot: Any | None = None,
) -> LiveProofWindowResult:
    pilot_row = pilot or type(
        "Pilot",
        (),
        {
            "status": "ready",
            "hard_stop_reason_code": None,
            "active_intent_id": None,
            "proof_window_status": "closed",
            "proof_window_opened_at": None,
            "proof_window_opened_by": None,
            "proof_window_expires_at": None,
            "proof_window_remaining_intent_budget": 0,
            "proof_window_reason": None,
            "proof_window_closed_at": None,
            "proof_window_closed_by": None,
            "proof_window_closed_reason": None,
        },
    )()
    return LiveProofWindowResult(
        status="blocked",
        reason_code=reason_code,
        semantic_status_code=semantic_status_code,
        proof_window_status=getattr(pilot_row, "proof_window_status", None),
        opened_at=getattr(pilot_row, "proof_window_opened_at", None),
        opened_by=getattr(pilot_row, "proof_window_opened_by", None),
        expires_at=getattr(pilot_row, "proof_window_expires_at", None),
        remaining_intent_budget=int(getattr(pilot_row, "proof_window_remaining_intent_budget", 0) or 0),
        proof_window_reason=getattr(pilot_row, "proof_window_reason", None),
        closed_at=getattr(pilot_row, "proof_window_closed_at", None),
        closed_by=getattr(pilot_row, "proof_window_closed_by", None),
        closed_reason=getattr(pilot_row, "proof_window_closed_reason", None),
        active_intent_id=str(getattr(pilot_row, "active_intent_id", None)) if getattr(pilot_row, "active_intent_id", None) else None,
        hard_stop_status=getattr(pilot_row, "status", None),
        hard_stop_reason_code=getattr(pilot_row, "hard_stop_reason_code", None),
        runtime_gate=_runtime_gate_payload(runtime_gate, False, reason_code),
        details={"reasonCode": reason_code},
    )
