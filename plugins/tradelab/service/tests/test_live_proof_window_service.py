from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from uuid import uuid4

from tradelab_api.services.live_proof_window import (
    LiveProofWindowCloseRequestData,
    LiveProofWindowOpenRequestData,
    LiveProofWindowRuntimeGate,
    close_live_proof_window,
    get_live_proof_window_status,
    open_live_proof_window,
    proof_window_allows_real_submit,
)


class MemoryProofWindowRepository:
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
        self.has_debt = False

    def get_or_create_pilot_control(self):
        return self.pilot

    def count_active_non_terminal_live_intents(self, *, exclude_intent_id=None) -> int:
        return self.active_intents

    def has_unresolved_proof_window_debt(self) -> bool:
        return self.has_debt

    def expire_proof_window_if_needed(self, *, actor: str):
        if (
            self.pilot.proof_window_status == "open"
            and self.pilot.proof_window_expires_at is not None
            and self.pilot.proof_window_expires_at <= datetime.now(UTC)
        ):
            self.pilot.proof_window_status = "expired"
            self.pilot.proof_window_remaining_intent_budget = 0
            self.pilot.proof_window_closed_at = datetime.now(UTC)
            self.pilot.proof_window_closed_by = actor
            self.pilot.proof_window_closed_reason = "proof_window_ttl_expired"
        return self.pilot

    def open_proof_window(self, *, actor: str, reason: str, ttl_seconds: int, intent_budget: int):
        now = datetime.now(UTC)
        self.pilot.proof_window_status = "open"
        self.pilot.proof_window_opened_at = now
        self.pilot.proof_window_opened_by = actor
        self.pilot.proof_window_expires_at = now + timedelta(seconds=ttl_seconds)
        self.pilot.proof_window_remaining_intent_budget = intent_budget
        self.pilot.proof_window_reason = reason
        self.pilot.proof_window_closed_at = None
        self.pilot.proof_window_closed_by = None
        self.pilot.proof_window_closed_reason = None
        return self.pilot

    def close_proof_window(self, *, actor: str, reason: str):
        self.pilot.proof_window_status = "closed"
        self.pilot.proof_window_remaining_intent_budget = 0
        self.pilot.proof_window_closed_at = datetime.now(UTC)
        self.pilot.proof_window_closed_by = actor
        self.pilot.proof_window_closed_reason = reason
        return self.pilot


def _runtime_gate(*, kill_switch_enabled: bool = False) -> LiveProofWindowRuntimeGate:
    return LiveProofWindowRuntimeGate(
        kill_switch_enabled=kill_switch_enabled,
        connector_mode="real",
        real_network_enabled=True,
        environment_name="local",
        binance_live_base_url="https://api.binance.com",
        vault_provider_name="local_dev_encrypted",
    )


def test_open_live_proof_window_blocks_when_runtime_gate_is_invalid() -> None:
    repository = MemoryProofWindowRepository()

    result = open_live_proof_window(
        repository,
        LiveProofWindowOpenRequestData(
            confirm_open=True,
            actor="phase20-operator",
            reason="phase20_one_fill_proof",
            ttl_seconds=120,
            intent_budget=1,
        ),
        runtime_gate=_runtime_gate(kill_switch_enabled=True),
    )

    assert result.status == "blocked"
    assert result.reason_code == "live_order_submit_kill_switch_enabled"


def test_open_live_proof_window_opens_and_status_reflects_window() -> None:
    repository = MemoryProofWindowRepository()

    result = open_live_proof_window(
        repository,
        LiveProofWindowOpenRequestData(
            confirm_open=True,
            actor="phase20-operator",
            reason="phase20_one_fill_proof",
            ttl_seconds=120,
            intent_budget=1,
        ),
        runtime_gate=_runtime_gate(),
    )
    status = get_live_proof_window_status(repository, runtime_gate=_runtime_gate())

    assert result.status == "open"
    assert result.should_commit is True
    assert result.proof_window_status == "open"
    assert result.remaining_intent_budget == 1
    assert status.proof_window_status == "open"
    assert status.remaining_intent_budget == 1
    assert status.proof_window_reason == "phase20_one_fill_proof"


def test_close_live_proof_window_closes_open_window() -> None:
    repository = MemoryProofWindowRepository()
    repository.open_proof_window(
        actor="phase20-operator",
        reason="phase20_one_fill_proof",
        ttl_seconds=120,
        intent_budget=1,
    )

    result = close_live_proof_window(
        repository,
        LiveProofWindowCloseRequestData(
            confirm_close=True,
            actor="phase20-operator",
            reason="rollback_safe_close",
        ),
        runtime_gate=_runtime_gate(),
    )

    assert result.status == "closed"
    assert result.should_commit is True
    assert result.proof_window_status == "closed"
    assert result.remaining_intent_budget == 0
    assert repository.pilot.proof_window_closed_reason == "rollback_safe_close"


def test_proof_window_allows_real_submit_blocks_when_window_is_closed() -> None:
    repository = MemoryProofWindowRepository()

    result = proof_window_allows_real_submit(
        repository,
        runtime_gate=_runtime_gate(),
        current_intent_id=uuid4(),
        actor="admin",
    )

    assert result is not None
    assert result.reason_code == "live_order_proof_window_closed"

