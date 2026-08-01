from __future__ import annotations

from tradelab_api.services.execution_modes import (
    BLOCKED_EXECUTION_MODES,
    DRAFTABLE_EXECUTION_MODES,
    EXECUTION_MODE_NOT_ENABLED_REASON,
    EXECUTION_MODE_NOT_RUNNABLE_REASON,
    RUNNABLE_EXECUTION_MODES,
    build_execution_mode_not_enabled_error,
    build_execution_mode_not_runnable_error,
    can_create_execution_mode,
    is_draftable_execution_mode,
    is_runnable_execution_mode,
    normalize_execution_mode,
    normalize_execution_status,
)


def test_execution_mode_policy_exposes_backtest_as_only_runnable_mode() -> None:
    assert RUNNABLE_EXECUTION_MODES == ("backtest",)
    assert DRAFTABLE_EXECUTION_MODES == ("backtest", "paper")
    assert BLOCKED_EXECUTION_MODES == ("live",)
    assert EXECUTION_MODE_NOT_ENABLED_REASON == "execution_mode_not_enabled"
    assert EXECUTION_MODE_NOT_RUNNABLE_REASON == "execution_mode_not_runnable"


def test_execution_mode_policy_normalizes_input() -> None:
    assert normalize_execution_mode(" BackTest ") == "backtest"
    assert normalize_execution_mode(" PAPER ") == "paper"
    assert normalize_execution_mode(None) == ""
    assert normalize_execution_status(" Draft ") == "draft"
    assert normalize_execution_status(None) == ""


def test_execution_mode_policy_allows_backtest_and_paper_drafts_to_be_created() -> None:
    assert can_create_execution_mode("backtest", "draft") is True
    assert can_create_execution_mode("paper", "draft") is True
    assert can_create_execution_mode("paper", "active") is False
    assert can_create_execution_mode("live", "draft") is False
    assert can_create_execution_mode("sandbox", "draft") is False


def test_execution_mode_policy_allows_only_backtest_runtime() -> None:
    assert is_runnable_execution_mode("backtest") is True
    assert is_runnable_execution_mode("paper") is False
    assert is_runnable_execution_mode("live") is False
    assert is_runnable_execution_mode("sandbox") is False
    assert is_draftable_execution_mode("paper") is True
    assert is_draftable_execution_mode("live") is False


def test_not_enabled_error_payload_is_machine_readable() -> None:
    assert build_execution_mode_not_enabled_error("paper") == {
        "mode": "paper",
        "reasonCode": "execution_mode_not_enabled",
        "allowedModes": ["backtest"],
        "draftableModes": ["backtest", "paper"],
        "blockedModes": ["live"],
    }


def test_not_runnable_error_payload_is_machine_readable() -> None:
    assert build_execution_mode_not_runnable_error("paper") == {
        "mode": "paper",
        "reasonCode": "execution_mode_not_runnable",
        "allowedModes": ["backtest"],
        "draftableModes": ["backtest", "paper"],
    }
