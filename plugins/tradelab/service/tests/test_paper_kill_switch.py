from __future__ import annotations

from types import SimpleNamespace

from tradelab_api.services.paper_kill_switch import (
    READ_ONLY_PAPER_KILL_SWITCH_STATUS,
    build_paper_kill_switch_status,
)

def _settings(*, enabled: bool, environment: str = "local") -> SimpleNamespace:
    return SimpleNamespace(
        tradelab_local_paper_kill_switch_enabled=enabled,
        tradelab_environment=environment,
    )

def test_status_reads_disabled_config_state() -> None:
    status = build_paper_kill_switch_status(_settings(enabled=False))

    assert status.enabled is False
    assert status.reason_code == "paper_kill_switch_status_read"
    assert status.safety_status == READ_ONLY_PAPER_KILL_SWITCH_STATUS
    assert status.source == "config"
    assert status.updated_at is None
    assert status.updated_by is None
    assert status.details == {"environment": "local", "localDevOnly": True}

def test_status_reads_enabled_config_state() -> None:
    status = build_paper_kill_switch_status(_settings(enabled=True, environment="dev"))

    assert status.enabled is True
    assert status.reason_code == "paper_kill_switch_enabled"
    assert status.details == {"environment": "dev", "localDevOnly": True}

def test_status_is_blocked_safe_outside_local_dev_test() -> None:
    status = build_paper_kill_switch_status(_settings(enabled=False, environment="production"))

    assert status.enabled is True
    assert status.reason_code == "paper_kill_switch_environment_not_allowed"
    assert status.details == {"environment": "production", "localDevOnly": False}
