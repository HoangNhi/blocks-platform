from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal, InvalidOperation
from uuid import UUID

from tradelab_api.services.market_data_preflight import build_preflight_result
from tradelab_api.services.paper_risk_gates import (
    PaperBotSnapshot,
    PaperDatasetGateSnapshot,
    PaperRiskGateFailure,
    PaperRiskGateInput,
    PaperRiskPolicy,
    PaperRuntimeSafetySnapshot,
    PaperStrategySnapshot,
    evaluate_paper_risk_gates,
)
from tradelab_api.services.paper_kill_switch import PaperKillSwitchStatus

READ_ONLY_PREVIEW_SAFETY_STATUS = "read_only_preview"

DEFAULT_STARTING_CASH = Decimal("10000")
DEFAULT_MAX_NOTIONAL_PER_ORDER = Decimal("500")
DEFAULT_MAX_POSITION_NOTIONAL = Decimal("1500")
DEFAULT_MAX_DAILY_LOSS = Decimal("250")
DEFAULT_MAX_OPEN_POSITIONS = 3


class PaperSessionPreviewValidationError(Exception):
    def __init__(self, status_code: int, reason_code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.reason_code = reason_code
        self.message = message


@dataclass(frozen=True)
class PaperSessionPreviewGateFailure:
    gate: str
    reason_code: str
    message: str
    data: dict[str, object]


@dataclass(frozen=True)
class PaperSessionPreviewBotContext:
    bot_id: str
    mode: str
    status: str
    symbol: str
    timeframe: str


@dataclass(frozen=True)
class PaperSessionPreviewStrategyContext:
    strategy_id: str | None
    strategy_version_id: str | None
    source_valid: bool
    version_locked: bool
    dirty: bool


@dataclass(frozen=True)
class PaperSessionPreviewDatasetContext:
    dataset_key: str
    exchange: str
    symbol: str
    timeframe: str
    start_at: datetime
    end_at: datetime
    preflight_outcome: str


@dataclass(frozen=True)
class PaperSessionPreviewResult:
    mode: str
    preview_status: str
    allowed: bool
    reason_code: str
    failed_gates: list[PaperSessionPreviewGateFailure]
    warnings: list[str]
    details: dict[str, object]
    safety_status: str
    bot_context: PaperSessionPreviewBotContext
    strategy_context: PaperSessionPreviewStrategyContext
    dataset_context: PaperSessionPreviewDatasetContext


def build_paper_session_preview(
    bot_repository: object,
    strategy_repository: object,
    market_repository: object,
    *,
    bot_id: UUID,
    exchange: str,
    symbol: str,
    timeframe: str,
    start_at: datetime,
    end_at: datetime,
    risk_policy_override: dict[str, object] | None = None,
    source: str = "strategy_lab",
    kill_switch_status: PaperKillSwitchStatus | None = None,
) -> PaperSessionPreviewResult:
    _validate_range(start_at=start_at, end_at=end_at)
    bot = bot_repository.get_bot(bot_id)
    if bot is None:
        raise PaperSessionPreviewValidationError(404, "paper_bot_not_found", "Paper bot not found.")

    strategy_version_id = getattr(bot, "strategy_version_id", None)
    strategy_version = (
        strategy_repository.get_strategy_version(strategy_version_id)
        if strategy_version_id is not None
        else None
    )
    preflight = build_preflight_result(
        market_repository,
        exchange=exchange,
        symbol=symbol,
        timeframe=timeframe,
        requested_start_at=start_at,
        requested_end_at=end_at,
    )

    bot_snapshot = PaperBotSnapshot(
        bot_id=str(getattr(bot, "id", "")) if getattr(bot, "id", None) is not None else None,
        mode=str(getattr(bot, "mode", "")),
        status=str(getattr(bot, "status", "")),
        is_active=bool(getattr(bot, "is_active", False)),
        is_deleted=bool(getattr(bot, "is_deleted", False)),
        exchange=exchange,
        symbol=symbol,
        timeframe=timeframe,
    )
    strategy_snapshot = PaperStrategySnapshot(
        strategy_id=str(getattr(bot, "strategy_id", "")) if getattr(bot, "strategy_id", None) is not None else None,
        strategy_version_id=str(strategy_version_id) if strategy_version_id is not None else None,
        source_valid=_is_valid_strategy_version(strategy_version),
        version_locked=strategy_version_id is not None,
        dirty=False,
    )
    dataset_snapshot = PaperDatasetGateSnapshot(
        dataset_key=str(preflight.dataset_key) if getattr(preflight, "dataset_key", None) is not None else None,
        exchange=str(preflight.exchange),
        symbol=str(preflight.symbol),
        timeframe=str(preflight.timeframe),
        ready=str(preflight.outcome) == "ready",
        start_at=start_at,
        end_at=end_at,
        reason_code=None if str(preflight.outcome) == "ready" else str(preflight.outcome),
    )

    runtime_config = dict(getattr(bot, "runtime_config", None) or {})
    metadata = dict(getattr(bot, "metadata_", None) or {})
    risk_config = dict(getattr(bot, "risk_config", None) or {})
    risk_policy = _build_risk_policy(
        risk_config=risk_config,
        runtime_config=runtime_config,
        override=risk_policy_override or {},
    )
    resolved_kill_switch = kill_switch_status or PaperKillSwitchStatus(
        enabled=False,
        reason_code="paper_kill_switch_status_read",
        details={"environment": "unknown", "localDevOnly": True},
    )
    kill_switch_details = {
        "enabled": resolved_kill_switch.enabled,
        "reasonCode": resolved_kill_switch.reason_code,
        "source": resolved_kill_switch.source,
        "details": resolved_kill_switch.details,
    }

    gate_result = evaluate_paper_risk_gates(
        PaperRiskGateInput(
            bot=bot_snapshot,
            strategy=strategy_snapshot,
            dataset=dataset_snapshot,
            risk_policy=risk_policy,
            order_preview=None,
            runtime_safety=PaperRuntimeSafetySnapshot(kill_switch_enabled=resolved_kill_switch.enabled),
            runtime_config=runtime_config,
            metadata=metadata,
            gate_context={
                "source": source,
                "datasetKey": dataset_snapshot.dataset_key,
                "requestedRange": {
                    "startAt": start_at.isoformat(),
                    "endAt": end_at.isoformat(),
                },
                "readOnly": True,
                "killSwitch": kill_switch_details,
            },
        )
    )

    return PaperSessionPreviewResult(
        mode="paper",
        preview_status="allowed" if gate_result.allowed else "blocked",
        allowed=gate_result.allowed,
        reason_code=gate_result.reason_code,
        failed_gates=[_serialize_failure(failure) for failure in gate_result.failed_gates],
        warnings=list(gate_result.warnings),
        details={**dict(gate_result.details), "killSwitch": kill_switch_details},
        safety_status=READ_ONLY_PREVIEW_SAFETY_STATUS,
        bot_context=PaperSessionPreviewBotContext(
            bot_id=str(getattr(bot, "id", "")),
            mode=str(getattr(bot, "mode", "")),
            status=str(getattr(bot, "status", "")),
            symbol=str(getattr(bot, "symbol", "")),
            timeframe=str(getattr(bot, "timeframe", "")),
        ),
        strategy_context=PaperSessionPreviewStrategyContext(
            strategy_id=str(getattr(bot, "strategy_id", "")) if getattr(bot, "strategy_id", None) is not None else None,
            strategy_version_id=str(strategy_version_id) if strategy_version_id is not None else None,
            source_valid=_is_valid_strategy_version(strategy_version),
            version_locked=strategy_version_id is not None,
            dirty=False,
        ),
        dataset_context=PaperSessionPreviewDatasetContext(
            dataset_key=str(preflight.dataset_key),
            exchange=str(preflight.exchange),
            symbol=str(preflight.symbol),
            timeframe=str(preflight.timeframe),
            start_at=start_at,
            end_at=end_at,
            preflight_outcome=str(preflight.outcome),
        ),
    )


def _validate_range(*, start_at: datetime, end_at: datetime) -> None:
    if end_at < start_at:
        raise PaperSessionPreviewValidationError(
            400,
            "paper_preview_range_invalid",
            "Paper session preview range must start before it ends.",
        )


def _is_valid_strategy_version(strategy_version: object | None) -> bool:
    if strategy_version is None:
        return False
    return str(getattr(strategy_version, "validation_status", "")).strip().lower() == "valid"


def _build_risk_policy(
    *,
    risk_config: dict[str, object],
    runtime_config: dict[str, object],
    override: dict[str, object],
) -> PaperRiskPolicy:
    merged = {**risk_config, **override}
    starting_cash = _decimal_from(
        merged,
        "startingCash",
        "starting_cash",
        fallback=_decimal_from(runtime_config, "initialEquity", "initial_equity", fallback=DEFAULT_STARTING_CASH),
    )
    max_notional_per_order = _decimal_from(
        merged,
        "maxNotionalPerOrder",
        "max_notional_per_order",
        fallback=_percent_or_default(
            starting_cash,
            _optional_decimal_from(merged, "maxOrderPercent", "max_order_percent"),
            DEFAULT_MAX_NOTIONAL_PER_ORDER,
        ),
    )
    max_position_notional = _decimal_from(
        merged,
        "maxPositionNotional",
        "max_position_notional",
        fallback=_percent_or_default(
            starting_cash,
            _optional_decimal_from(merged, "maxPositionPercent", "max_position_percent"),
            DEFAULT_MAX_POSITION_NOTIONAL,
        ),
    )
    max_daily_loss = _decimal_from(
        merged,
        "maxDailyLoss",
        "max_daily_loss",
        fallback=_percent_or_default(
            starting_cash,
            _optional_decimal_from(merged, "maxDrawdownPercent", "max_drawdown_percent"),
            DEFAULT_MAX_DAILY_LOSS,
        ),
    )
    return PaperRiskPolicy(
        starting_cash=starting_cash,
        max_notional_per_order=max_notional_per_order,
        max_position_notional=max_position_notional,
        max_daily_loss=max_daily_loss,
        max_open_positions=_int_from(
            merged,
            "maxOpenPositions",
            "max_open_positions",
            fallback=DEFAULT_MAX_OPEN_POSITIONS,
        ),
        allowed_symbols=_string_tuple_from(merged, "allowedSymbols", "allowed_symbols"),
        allowed_timeframes=_string_tuple_from(merged, "allowedTimeframes", "allowed_timeframes"),
    )


def _decimal_from(data: dict[str, object], *keys: str, fallback: Decimal | None) -> Decimal:
    for key in keys:
        if key in data:
            try:
                return Decimal(str(data[key]))
            except (InvalidOperation, ValueError):
                return Decimal("0")
    return fallback if fallback is not None else Decimal("0")


def _optional_decimal_from(data: dict[str, object], *keys: str) -> Decimal | None:
    for key in keys:
        if key in data:
            try:
                return Decimal(str(data[key]))
            except (InvalidOperation, ValueError):
                return Decimal("0")
    return None


def _int_from(data: dict[str, object], *keys: str, fallback: int) -> int:
    for key in keys:
        if key in data:
            try:
                return int(str(data[key]))
            except ValueError:
                return 0
    return fallback


def _percent_or_default(base: Decimal, percent: Decimal | None, fallback: Decimal) -> Decimal:
    if percent is None:
        return fallback
    return base * percent / Decimal("100")


def _string_tuple_from(data: dict[str, object], *keys: str) -> tuple[str, ...]:
    for key in keys:
        if key not in data:
            continue
        value = data[key]
        if isinstance(value, str):
            return (value,)
        if isinstance(value, (list, tuple)):
            return tuple(str(item) for item in value if str(item).strip())
    return ()


def _serialize_failure(failure: PaperRiskGateFailure) -> PaperSessionPreviewGateFailure:
    return PaperSessionPreviewGateFailure(
        gate=failure.gate,
        reason_code=failure.reason_code,
        message=failure.message,
        data=dict(failure.data),
    )
