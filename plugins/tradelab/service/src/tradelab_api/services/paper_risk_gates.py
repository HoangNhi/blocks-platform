from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Any

from tradelab_api.services.credential_boundary import find_secret_like_fields

PAPER_RISK_GATE_PASSED_REASON = "paper_risk_gate_passed"

BOT_GATE = "bot"
STRATEGY_GATE = "strategy"
DATASET_GATE = "dataset"
RISK_POLICY_GATE = "risk_policy"
ORDER_PREVIEW_GATE = "order_preview"
SAFETY_GATE = "safety"

LIVE_ROUTE_FIELD_NAMES = {
    "routetolive",
    "liveexecution",
    "exchangeorder",
}


@dataclass(frozen=True)
class PaperBotSnapshot:
    bot_id: str | None
    mode: str
    status: str
    is_active: bool
    is_deleted: bool
    exchange: str
    symbol: str
    timeframe: str


@dataclass(frozen=True)
class PaperStrategySnapshot:
    strategy_id: str | None
    strategy_version_id: str | None
    source_valid: bool
    version_locked: bool
    dirty: bool


@dataclass(frozen=True)
class PaperDatasetGateSnapshot:
    dataset_key: str | None
    exchange: str
    symbol: str
    timeframe: str
    ready: bool
    start_at: datetime | None
    end_at: datetime | None
    reason_code: str | None


@dataclass(frozen=True)
class PaperRiskPolicy:
    starting_cash: Decimal
    max_notional_per_order: Decimal
    max_position_notional: Decimal
    max_daily_loss: Decimal
    max_open_positions: int
    allowed_symbols: tuple[str, ...]
    allowed_timeframes: tuple[str, ...]


@dataclass(frozen=True)
class PaperOrderIntentPreview:
    side: str
    requested_notional: Decimal
    projected_position_notional: Decimal
    projected_open_positions: int


@dataclass(frozen=True)
class PaperRuntimeSafetySnapshot:
    kill_switch_enabled: bool


@dataclass(frozen=True)
class PaperRiskGateInput:
    bot: PaperBotSnapshot
    strategy: PaperStrategySnapshot
    dataset: PaperDatasetGateSnapshot
    risk_policy: PaperRiskPolicy
    order_preview: PaperOrderIntentPreview | None
    runtime_safety: PaperRuntimeSafetySnapshot
    runtime_config: dict[str, object]
    metadata: dict[str, object]
    gate_context: dict[str, object]


@dataclass(frozen=True)
class PaperRiskGateFailure:
    gate: str
    reason_code: str
    message: str
    data: dict[str, object]


@dataclass(frozen=True)
class PaperRiskGateResult:
    allowed: bool
    reason_code: str
    failed_gates: list[PaperRiskGateFailure]
    warnings: list[str]
    details: dict[str, object]


def evaluate_paper_risk_gates(input_: PaperRiskGateInput) -> PaperRiskGateResult:
    failures: list[PaperRiskGateFailure] = []
    failures.extend(_evaluate_bot_gate(input_.bot))
    failures.extend(_evaluate_strategy_gate(input_.strategy))
    failures.extend(_evaluate_dataset_gate(input_.dataset))
    failures.extend(_evaluate_risk_policy_gate(input_.bot, input_.risk_policy))
    failures.extend(_evaluate_order_preview_gate(input_.order_preview, input_.risk_policy))
    failures.extend(
        _evaluate_safety_gate(
            runtime_safety=input_.runtime_safety,
            runtime_config=input_.runtime_config,
            metadata=input_.metadata,
            gate_context=input_.gate_context,
        )
    )

    return PaperRiskGateResult(
        allowed=not failures,
        reason_code=PAPER_RISK_GATE_PASSED_REASON if not failures else failures[0].reason_code,
        failed_gates=failures,
        warnings=[],
        details={
            "checkedGateCount": 6,
            "failedGateCount": len(failures),
        },
    )


def _evaluate_bot_gate(bot: PaperBotSnapshot) -> list[PaperRiskGateFailure]:
    failures: list[PaperRiskGateFailure] = []
    if not _has_text(bot.bot_id):
        failures.append(
            _failure(
                BOT_GATE,
                "paper_bot_missing",
                "Paper bot is required.",
                {"botId": bot.bot_id},
            )
        )

    if _normalize(bot.mode) != "paper" or _normalize(bot.status) != "draft":
        failures.append(
            _failure(
                BOT_GATE,
                "paper_bot_not_draft",
                "Paper bot must be a draft paper bot.",
                {"mode": bot.mode, "status": bot.status},
            )
        )

    if not bot.is_active:
        failures.append(
            _failure(
                BOT_GATE,
                "paper_bot_inactive",
                "Paper bot must be active.",
                {"isActive": bot.is_active},
            )
        )

    if bot.is_deleted:
        failures.append(
            _failure(
                BOT_GATE,
                "paper_bot_deleted",
                "Paper bot must not be deleted.",
                {"isDeleted": bot.is_deleted},
            )
        )

    return failures


def _evaluate_strategy_gate(strategy: PaperStrategySnapshot) -> list[PaperRiskGateFailure]:
    failures: list[PaperRiskGateFailure] = []
    if not _has_text(strategy.strategy_id):
        failures.append(
            _failure(
                STRATEGY_GATE,
                "paper_strategy_missing",
                "Strategy is required.",
                {"strategyId": strategy.strategy_id},
            )
        )

    if not _has_text(strategy.strategy_version_id):
        failures.append(
            _failure(
                STRATEGY_GATE,
                "paper_strategy_version_missing",
                "Strategy version is required.",
                {"strategyVersionId": strategy.strategy_version_id},
            )
        )

    if not strategy.source_valid:
        failures.append(
            _failure(
                STRATEGY_GATE,
                "paper_strategy_source_invalid",
                "Strategy source must be valid.",
                {"sourceValid": strategy.source_valid},
            )
        )

    if not strategy.version_locked:
        failures.append(
            _failure(
                STRATEGY_GATE,
                "paper_strategy_version_not_locked",
                "Strategy version must be locked.",
                {"versionLocked": strategy.version_locked},
            )
        )

    if strategy.dirty:
        failures.append(
            _failure(
                STRATEGY_GATE,
                "paper_strategy_dirty",
                "Strategy must not have dirty state.",
                {"dirty": strategy.dirty},
            )
        )

    return failures


def _evaluate_dataset_gate(dataset: PaperDatasetGateSnapshot) -> list[PaperRiskGateFailure]:
    failures: list[PaperRiskGateFailure] = []
    if not dataset.ready:
        failures.append(
            _failure(
                DATASET_GATE,
                "paper_dataset_not_ready",
                "Dataset must be ready for the requested paper range.",
                {"sourceReasonCode": dataset.reason_code},
            )
        )

    if not _has_text(dataset.dataset_key):
        failures.append(
            _failure(
                DATASET_GATE,
                "paper_dataset_key_missing",
                "Dataset key is required.",
                {"datasetKey": dataset.dataset_key},
            )
        )
    elif _normalize(dataset.dataset_key) != _normalize(_expected_dataset_key(dataset)):
        failures.append(
            _failure(
                DATASET_GATE,
                "paper_dataset_context_mismatch",
                "Dataset key must match exchange, symbol, and timeframe.",
                {
                    "datasetKey": dataset.dataset_key,
                    "expectedDatasetKey": _expected_dataset_key(dataset),
                },
            )
        )

    if dataset.start_at is None or dataset.end_at is None or dataset.end_at < dataset.start_at:
        failures.append(
            _failure(
                DATASET_GATE,
                "paper_requested_range_invalid",
                "Requested paper range must have start_at and end_at with end_at >= start_at.",
                {"startAt": dataset.start_at, "endAt": dataset.end_at},
            )
        )

    return failures


def _evaluate_risk_policy_gate(
    bot: PaperBotSnapshot,
    risk_policy: PaperRiskPolicy,
) -> list[PaperRiskGateFailure]:
    failures: list[PaperRiskGateFailure] = []
    if risk_policy.starting_cash <= Decimal("0"):
        failures.append(
            _failure(
                RISK_POLICY_GATE,
                "paper_starting_cash_invalid",
                "Starting cash must be greater than zero.",
                {"startingCash": risk_policy.starting_cash},
            )
        )

    if risk_policy.max_notional_per_order <= Decimal("0"):
        failures.append(
            _failure(
                RISK_POLICY_GATE,
                "paper_risk_policy_invalid",
                "Max notional per order must be greater than zero.",
                {"field": "maxNotionalPerOrder", "value": risk_policy.max_notional_per_order},
            )
        )

    if risk_policy.max_position_notional <= Decimal("0"):
        failures.append(
            _failure(
                RISK_POLICY_GATE,
                "paper_risk_policy_invalid",
                "Max position notional must be greater than zero.",
                {"field": "maxPositionNotional", "value": risk_policy.max_position_notional},
            )
        )

    if risk_policy.max_daily_loss < Decimal("0"):
        failures.append(
            _failure(
                RISK_POLICY_GATE,
                "paper_risk_policy_invalid",
                "Max daily loss must be zero or greater.",
                {"field": "maxDailyLoss", "value": risk_policy.max_daily_loss},
            )
        )

    if risk_policy.max_open_positions <= 0:
        failures.append(
            _failure(
                RISK_POLICY_GATE,
                "paper_risk_policy_invalid",
                "Max open positions must be greater than zero.",
                {"field": "maxOpenPositions", "value": risk_policy.max_open_positions},
            )
        )

    if risk_policy.allowed_symbols and _normalize(bot.symbol) not in {
        _normalize(symbol) for symbol in risk_policy.allowed_symbols
    }:
        failures.append(
            _failure(
                RISK_POLICY_GATE,
                "paper_symbol_not_allowed",
                "Symbol is not allowed by the paper risk policy.",
                {"symbol": bot.symbol, "allowedSymbols": list(risk_policy.allowed_symbols)},
            )
        )

    if risk_policy.allowed_timeframes and _normalize(bot.timeframe) not in {
        _normalize(timeframe) for timeframe in risk_policy.allowed_timeframes
    }:
        failures.append(
            _failure(
                RISK_POLICY_GATE,
                "paper_timeframe_not_allowed",
                "Timeframe is not allowed by the paper risk policy.",
                {"timeframe": bot.timeframe, "allowedTimeframes": list(risk_policy.allowed_timeframes)},
            )
        )

    return failures


def _evaluate_order_preview_gate(
    order_preview: PaperOrderIntentPreview | None,
    risk_policy: PaperRiskPolicy,
) -> list[PaperRiskGateFailure]:
    if order_preview is None:
        return []

    failures: list[PaperRiskGateFailure] = []
    if _normalize(order_preview.side) not in {"buy", "sell"}:
        failures.append(
            _failure(
                ORDER_PREVIEW_GATE,
                "paper_order_side_invalid",
                "Paper order side must be buy or sell.",
                {"side": order_preview.side},
            )
        )

    if (
        risk_policy.max_notional_per_order > Decimal("0")
        and order_preview.requested_notional > risk_policy.max_notional_per_order
    ):
        failures.append(
            _failure(
                ORDER_PREVIEW_GATE,
                "paper_max_notional_exceeded",
                "Requested notional exceeds max notional per order.",
                {
                    "requestedNotional": order_preview.requested_notional,
                    "maxNotionalPerOrder": risk_policy.max_notional_per_order,
                },
            )
        )

    if (
        risk_policy.max_position_notional > Decimal("0")
        and order_preview.projected_position_notional > risk_policy.max_position_notional
    ):
        failures.append(
            _failure(
                ORDER_PREVIEW_GATE,
                "paper_max_position_exceeded",
                "Projected position notional exceeds max position notional.",
                {
                    "projectedPositionNotional": order_preview.projected_position_notional,
                    "maxPositionNotional": risk_policy.max_position_notional,
                },
            )
        )

    if risk_policy.max_open_positions > 0 and order_preview.projected_open_positions > risk_policy.max_open_positions:
        failures.append(
            _failure(
                ORDER_PREVIEW_GATE,
                "paper_max_open_positions_exceeded",
                "Projected open positions exceeds max open positions.",
                {
                    "projectedOpenPositions": order_preview.projected_open_positions,
                    "maxOpenPositions": risk_policy.max_open_positions,
                },
            )
        )

    return failures


def _evaluate_safety_gate(
    *,
    runtime_safety: PaperRuntimeSafetySnapshot,
    runtime_config: dict[str, object],
    metadata: dict[str, object],
    gate_context: dict[str, object],
) -> list[PaperRiskGateFailure]:
    failures: list[PaperRiskGateFailure] = []
    if runtime_safety.kill_switch_enabled:
        failures.append(
            _failure(
                SAFETY_GATE,
                "paper_kill_switch_enabled",
                "Paper kill switch must be off.",
                {"killSwitchEnabled": runtime_safety.kill_switch_enabled},
            )
        )

    blocked_secret_fields = [
        *find_secret_like_fields(runtime_config, "runtimeConfig"),
        *find_secret_like_fields(metadata, "metadata"),
        *find_secret_like_fields(gate_context, "gateContext"),
    ]
    if blocked_secret_fields:
        failures.append(
            _failure(
                SAFETY_GATE,
                "paper_secret_not_allowed",
                "Paper risk gates must not receive secret-like fields.",
                {"blockedFields": blocked_secret_fields},
            )
        )

    blocked_live_route_fields = [
        *_find_live_route_fields(runtime_config, "runtimeConfig"),
        *_find_live_route_fields(metadata, "metadata"),
        *_find_live_route_fields(gate_context, "gateContext"),
    ]
    if blocked_live_route_fields:
        failures.append(
            _failure(
                SAFETY_GATE,
                "paper_live_route_blocked",
                "Paper risk gates must not receive live route flags.",
                {"blockedFields": blocked_live_route_fields},
            )
        )

    return failures


def _find_live_route_fields(value: Any, path: str = "") -> list[str]:
    if isinstance(value, dict):
        blocked: list[str] = []
        for key, nested_value in value.items():
            key_text = str(key)
            nested_path = f"{path}.{key_text}" if path else key_text
            if _normalize_compact(key_text) in LIVE_ROUTE_FIELD_NAMES:
                blocked.append(nested_path)
                continue
            blocked.extend(_find_live_route_fields(nested_value, nested_path))
        return blocked

    if isinstance(value, list):
        blocked: list[str] = []
        for index, nested_value in enumerate(value):
            nested_path = f"{path}[{index}]" if path else f"[{index}]"
            blocked.extend(_find_live_route_fields(nested_value, nested_path))
        return blocked

    return []


def _expected_dataset_key(dataset: PaperDatasetGateSnapshot) -> str:
    return f"{dataset.exchange}:{dataset.symbol}:{dataset.timeframe}"


def _failure(
    gate: str,
    reason_code: str,
    message: str,
    data: dict[str, object] | None = None,
) -> PaperRiskGateFailure:
    return PaperRiskGateFailure(
        gate=gate,
        reason_code=reason_code,
        message=message,
        data=data or {},
    )


def _has_text(value: str | None) -> bool:
    return bool(value and value.strip())


def _normalize(value: str | None) -> str:
    return (value or "").strip().lower()


def _normalize_compact(value: str | None) -> str:
    return _normalize(value).replace("_", "").replace("-", "")
