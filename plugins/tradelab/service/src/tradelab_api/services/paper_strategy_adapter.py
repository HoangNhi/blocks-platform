from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from tradelab_api.db.models import StrategyVersion
from tradelab_api.services.paper_engine import PaperEngineAction, PaperEngineCandle, PaperExecutionContext
from tradelab_api.services.strategy_runner import StrategyRunnerResult, run_strategy_subprocess

SECRET_KEY_PARTS = (
    "secret",
    "password",
    "token",
    "apikey",
    "api_key",
    "privatekey",
    "private_key",
    "passphrase",
)
MAX_LOG_PREVIEW_ITEMS = 5
MAX_LOG_MESSAGE_LENGTH = 160

StrategyRunnerCallable = Callable[..., StrategyRunnerResult]


@dataclass(frozen=True)
class PaperStrategySourceSnapshot:
    strategy_id: str
    strategy_version_id: str
    version_number: int
    source_code: str
    source_hash: str
    validation_status: str


@dataclass(frozen=True)
class PaperStrategyPrepareResult:
    audit_metadata: dict[str, Any] = field(default_factory=dict)


class PaperStrategyRuntimeError(Exception):
    def __init__(self, reason_code: str, error_message: str | None = None) -> None:
        super().__init__(error_message or reason_code)
        self.reason_code = reason_code
        self.error_message = error_message or reason_code


class PaperStrategySourceResolver:
    def __init__(self, session: Session) -> None:
        self.session = session

    def resolve_from_context(self, context: PaperExecutionContext) -> PaperStrategySourceSnapshot:
        version_id = _uuid_from_metadata(context.strategy_metadata.get("strategyVersionId"))
        if version_id is None:
            raise PaperStrategyRuntimeError(
                "paper_strategy_source_not_found",
                "Paper strategy version id is missing from session metadata.",
            )
        row = self.session.get(StrategyVersion, version_id)
        if row is None:
            raise PaperStrategyRuntimeError("paper_strategy_source_not_found", "Paper strategy source was not found.")
        if row.is_deleted or not row.is_active:
            raise PaperStrategyRuntimeError("paper_strategy_source_inactive", "Paper strategy source is inactive.")
        return PaperStrategySourceSnapshot(
            strategy_id=str(row.strategy_id),
            strategy_version_id=str(row.id),
            version_number=row.version_number,
            source_code=row.source_code,
            source_hash=row.source_hash,
            validation_status=row.validation_status,
        )


class PaperStrategyActionMapper:
    def __init__(self) -> None:
        self.warnings: list[dict[str, Any]] = []

    def map_action(self, action: dict[str, Any], *, candle_index: int | None = None) -> PaperEngineAction | None:
        kind = str(action.get("kind") or "").strip()
        try:
            if kind == "buy_market":
                return PaperEngineAction(
                    kind="buy_market",
                    percent=_decimal_or_none(action.get("percent")),
                    quote_amount=_decimal_or_none(action.get("quote_amount")),
                    metadata=_sanitize_json(action.get("payload", {})),
                )
            if kind == "sell_market":
                return PaperEngineAction(
                    kind="sell_market",
                    percent=_decimal_or_none(action.get("percent")),
                    quantity=_decimal_or_none(action.get("base_amount")),
                    metadata=_sanitize_json(action.get("payload", {})),
                )
            if kind == "close_position":
                return PaperEngineAction(
                    kind="close_position",
                    metadata=_sanitize_json(action.get("payload", {})),
                )
        except (InvalidOperation, ValueError, TypeError) as exc:
            self.warnings.append(
                {
                    "reasonCode": "paper_strategy_action_mapping_failed",
                    "kind": kind or None,
                    "candleIndex": candle_index,
                    "errorMessage": _sanitize_error(exc),
                }
            )
            return None

        self.warnings.append(
            {
                "reasonCode": "paper_strategy_action_unsupported",
                "kind": kind or None,
                "candleIndex": candle_index,
            }
        )
        return None


class SubprocessPaperStrategySignalProvider:
    def __init__(
        self,
        *,
        source_snapshot: PaperStrategySourceSnapshot | None = None,
        source_resolver: PaperStrategySourceResolver | None = None,
        runner: StrategyRunnerCallable = run_strategy_subprocess,
    ) -> None:
        self.source_snapshot = source_snapshot
        self.source_resolver = source_resolver
        self.runner = runner
        self.actions_by_index: dict[int, list[PaperEngineAction]] = {}
        self.audit_metadata: dict[str, Any] = {}
        self.prepared = False

    def prepare(self, context: PaperExecutionContext) -> PaperStrategyPrepareResult:
        source = self.source_snapshot
        if source is None:
            if self.source_resolver is None:
                raise PaperStrategyRuntimeError(
                    "paper_strategy_source_not_found",
                    "Paper strategy source resolver is not configured.",
                )
            source = self.source_resolver.resolve_from_context(context)

        result = self.runner(
            strategy_source=source.source_code,
            candles=serialize_paper_candles(context.candles),
            symbol=context.symbol,
            timeframe=context.timeframe,
            config=context.runtime_config,
            state={},
            timeout_seconds=None,
        )
        if result.timed_out:
            raise PaperStrategyRuntimeError(
                "paper_engine_strategy_timeout",
                _sanitize_error(result.error_message or "Strategy runner timed out."),
            )
        if not result.success or not isinstance(result.payload, dict):
            raise PaperStrategyRuntimeError(
                "paper_engine_strategy_error",
                _sanitize_runner_error(result),
            )

        raw_grouped = group_runner_actions(result.payload.get("actions", []))
        mapper = PaperStrategyActionMapper()
        mapped: dict[int, list[PaperEngineAction]] = {}
        for candle_index, raw_actions in raw_grouped.items():
            for raw_action in raw_actions:
                action = mapper.map_action(raw_action, candle_index=candle_index)
                if action is not None:
                    mapped.setdefault(candle_index, []).append(action)

        self.actions_by_index = mapped
        self.audit_metadata = summarize_strategy_logs(result.payload.get("logs", []), warnings=mapper.warnings)
        self.audit_metadata["strategyVersionId"] = source.strategy_version_id
        self.audit_metadata["strategyRuntime"] = "subprocess_one_shot"
        self.prepared = True
        return PaperStrategyPrepareResult(audit_metadata=self.audit_metadata)

    def actions_for_candle(
        self,
        context: PaperExecutionContext,
        candle_history: list[PaperEngineCandle],
        candle_index: int,
    ) -> list[PaperEngineAction]:
        if not self.prepared:
            raise PaperStrategyRuntimeError("paper_strategy_not_prepared", "Paper strategy provider was not prepared.")
        return list(self.actions_by_index.get(candle_index, []))


def serialize_paper_candles(candles: list[PaperEngineCandle]) -> list[dict[str, Any]]:
    return [
        {
            "open_time": candle.open_time.isoformat(),
            "close_time": candle.close_time.isoformat(),
            "open": str(candle.open),
            "high": str(candle.high),
            "low": str(candle.low),
            "close": str(candle.close),
            "volume": str(candle.volume),
        }
        for candle in candles
    ]


def group_runner_actions(actions: object) -> dict[int, list[dict[str, Any]]]:
    if not isinstance(actions, list):
        raise PaperStrategyRuntimeError("paper_strategy_payload_invalid", "Runner actions payload must be a list.")
    grouped: dict[int, list[dict[str, Any]]] = {}
    for item in actions:
        if not isinstance(item, dict):
            raise PaperStrategyRuntimeError("paper_strategy_payload_invalid", "Runner action group must be an object.")
        index = int(item.get("candleIndex", 0))
        raw_actions = item.get("actions", [])
        if not isinstance(raw_actions, list):
            raise PaperStrategyRuntimeError("paper_strategy_payload_invalid", "Runner actions item must be a list.")
        for raw_action in raw_actions:
            if isinstance(raw_action, dict):
                grouped.setdefault(index, []).append(raw_action)
            else:
                grouped.setdefault(index, []).append({"kind": None, "payload": {"value": raw_action}})
    return grouped


def summarize_strategy_logs(logs: object, *, warnings: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    items = logs if isinstance(logs, list) else []
    preview: list[dict[str, Any]] = []
    for item in items[:MAX_LOG_PREVIEW_ITEMS]:
        if not isinstance(item, dict):
            continue
        message = str(item.get("message", ""))
        if len(message) > MAX_LOG_MESSAGE_LENGTH:
            message = f"{message[:MAX_LOG_MESSAGE_LENGTH]}..."
        preview.append(
            {
                "message": message,
                "payload": _sanitize_json(item.get("payload", {})),
                "symbol": _sanitize_json(item.get("symbol")),
                "timeframe": _sanitize_json(item.get("timeframe")),
            }
        )
    return {
        "strategyRuntime": "subprocess_one_shot",
        "strategyLogCount": len(items),
        "strategyLogPreview": preview,
        "strategyActionWarnings": _sanitize_json(warnings or []),
    }


def _decimal_or_none(value: object) -> Decimal | None:
    if value is None:
        return None
    return Decimal(str(value))


def _uuid_from_metadata(value: object) -> UUID | None:
    if value is None:
        return None
    try:
        return UUID(str(value))
    except (TypeError, ValueError, AttributeError):
        return None


def _sanitize_runner_error(result: StrategyRunnerResult) -> str:
    if result.error_payload and isinstance(result.error_payload, dict):
        error = result.error_payload.get("error")
        if isinstance(error, dict):
            return _sanitize_error(error.get("message") or result.error_message or "Strategy runner failed.")
    return _sanitize_error(result.error_message or "Strategy runner failed.")


def _sanitize_error(value: object) -> str:
    text = str(value)
    normalized = text.lower().replace("-", "_")
    if any(part in normalized for part in SECRET_KEY_PARTS):
        return "[REDACTED]"
    return text[:400]


def _is_secret_key(key: object) -> bool:
    normalized = str(key).replace("-", "_").lower()
    return any(part in normalized for part in SECRET_KEY_PARTS)


def _sanitize_json(value: object) -> Any:
    if isinstance(value, dict):
        return {
            str(key): "[REDACTED]" if _is_secret_key(key) else _sanitize_json(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_sanitize_json(item) for item in value]
    if isinstance(value, tuple):
        return [_sanitize_json(item) for item in value]
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, str | int | float | bool) or value is None:
        return value
    return str(value)
