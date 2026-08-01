from __future__ import annotations

RUNNABLE_EXECUTION_MODES = ("backtest",)
DRAFTABLE_EXECUTION_MODES = ("backtest", "paper")
BLOCKED_EXECUTION_MODES = ("live",)
EXECUTION_MODE_NOT_ENABLED_REASON = "execution_mode_not_enabled"
EXECUTION_MODE_NOT_RUNNABLE_REASON = "execution_mode_not_runnable"


def normalize_execution_mode(mode: str | None) -> str:
    return (mode or "").strip().lower()


def normalize_execution_status(status: str | None) -> str:
    return (status or "").strip().lower()


def is_runnable_execution_mode(mode: str | None) -> bool:
    return normalize_execution_mode(mode) in RUNNABLE_EXECUTION_MODES


def is_draftable_execution_mode(mode: str | None) -> bool:
    return normalize_execution_mode(mode) in DRAFTABLE_EXECUTION_MODES


def can_create_execution_mode(mode: str | None, status: str | None) -> bool:
    normalized_mode = normalize_execution_mode(mode)
    normalized_status = normalize_execution_status(status)
    if normalized_mode == "paper":
        return normalized_status == "draft"
    return normalized_mode in RUNNABLE_EXECUTION_MODES


def build_execution_mode_not_enabled_error(mode: str | None) -> dict[str, object]:
    return {
        "mode": normalize_execution_mode(mode),
        "reasonCode": EXECUTION_MODE_NOT_ENABLED_REASON,
        "allowedModes": list(RUNNABLE_EXECUTION_MODES),
        "draftableModes": list(DRAFTABLE_EXECUTION_MODES),
        "blockedModes": list(BLOCKED_EXECUTION_MODES),
    }


def build_execution_mode_not_runnable_error(mode: str | None) -> dict[str, object]:
    return {
        "mode": normalize_execution_mode(mode),
        "reasonCode": EXECUTION_MODE_NOT_RUNNABLE_REASON,
        "allowedModes": list(RUNNABLE_EXECUTION_MODES),
        "draftableModes": list(DRAFTABLE_EXECUTION_MODES),
    }


def build_execution_mode_error(mode: str | None) -> dict[str, object]:
    return build_execution_mode_not_enabled_error(mode)
