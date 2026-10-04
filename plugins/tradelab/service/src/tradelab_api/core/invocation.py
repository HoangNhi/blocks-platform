from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from hashlib import sha256
from math import isfinite
from typing import Any


_MAX_LIMITS = {
    "wall_time_seconds": 60,
    "cpu_time_seconds": 30,
    "memory_bytes": 512 * 1024 * 1024,
    "pids": 16,
    "tmpfs_bytes": 16 * 1024 * 1024,
    "output_bytes": 2 * 1024 * 1024,
    "input_bytes": 16 * 1024 * 1024,
    "max_bars": 50_000,
}
_INTEGER_LIMITS = tuple(_MAX_LIMITS.items())
_BAR_FIELDS = frozenset({"open_time", "close_time", "open", "high", "low", "close", "volume"})
_INVOCATION_FIELDS = frozenset(
    {
        "schema_version",
        "strategy_source",
        "source_sha256",
        "bars",
        "symbol",
        "timeframe",
        "config",
        "initial_state",
        "seed",
        "as_of_time",
        "resource_policy",
    }
)


@dataclass(frozen=True, slots=True)
class ResourcePolicyV1:
    wall_time_seconds: int = 60
    cpu_time_seconds: int = 30
    cpu_rate_cores: float = 1.0
    memory_bytes: int = 512 * 1024 * 1024
    pids: int = 16
    tmpfs_bytes: int = 16 * 1024 * 1024
    output_bytes: int = 2 * 1024 * 1024
    input_bytes: int = 16 * 1024 * 1024
    max_bars: int = 50_000

    def __post_init__(self) -> None:
        for name, maximum in _INTEGER_LIMITS:
            value = getattr(self, name)
            if type(value) is not int or value <= 0 or value > maximum:
                raise ValueError(f"{name} must be a positive integer no greater than {maximum}.")
        rate = self.cpu_rate_cores
        if (
            isinstance(rate, bool)
            or not isinstance(rate, (int, float))
            or not isfinite(rate)
            or rate <= 0
            or rate > 1
        ):
            raise ValueError("cpu_rate_cores must be finite, positive, and no greater than 1.")
        object.__setattr__(self, "cpu_rate_cores", float(rate))

    def to_payload(self) -> dict[str, int | float]:
        return {
            "version": 1,
            "wall_time_seconds": self.wall_time_seconds,
            "cpu_time_seconds": self.cpu_time_seconds,
            "cpu_rate_cores": self.cpu_rate_cores,
            "memory_bytes": self.memory_bytes,
            "pids": self.pids,
            "tmpfs_bytes": self.tmpfs_bytes,
            "output_bytes": self.output_bytes,
            "input_bytes": self.input_bytes,
            "max_bars": self.max_bars,
        }

    @classmethod
    def from_payload(cls, payload: Mapping[str, Any]) -> ResourcePolicyV1:
        expected = set(_MAX_LIMITS) | {"version", "cpu_rate_cores"}
        if not isinstance(payload, Mapping) or set(payload) != expected:
            raise ValueError("resource_policy has an invalid v1 schema.")
        if type(payload["version"]) is not int or payload["version"] != 1:
            raise ValueError("resource_policy version must be 1.")
        values = {name: payload[name] for name in expected if name != "version"}
        return cls(**values)


@dataclass(frozen=True, slots=True, init=False)
class StrategyInvocation:
    _canonical_json: bytes

    @property
    def canonical_json(self) -> bytes:
        return self._canonical_json

    @classmethod
    def create(
        cls,
        *,
        strategy_source: str,
        bars: list[Mapping[str, Any]],
        symbol: str,
        timeframe: str,
        config: Mapping[str, Any],
        initial_state: Mapping[str, Any],
        seed: int,
        as_of_time: datetime,
        resource_policy: ResourcePolicyV1,
    ) -> StrategyInvocation:
        if not isinstance(strategy_source, str):
            raise ValueError("strategy_source must be a string.")
        try:
            source_hash = sha256(strategy_source.encode("utf-8")).hexdigest()
        except UnicodeEncodeError as exc:
            raise ValueError("strategy_source must be valid UTF-8.") from exc
        if not isinstance(resource_policy, ResourcePolicyV1):
            raise ValueError("resource_policy must be ResourcePolicyV1.")
        return cls.from_payload(
            {
                "schema_version": 1,
                "strategy_source": strategy_source,
                "source_sha256": source_hash,
                "bars": bars,
                "symbol": symbol,
                "timeframe": timeframe,
                "config": config,
                "initial_state": initial_state,
                "seed": seed,
                "as_of_time": _timestamp_text(as_of_time),
                "resource_policy": resource_policy.to_payload(),
            }
        )

    @classmethod
    def from_payload(cls, payload: Mapping[str, Any]) -> StrategyInvocation:
        if not isinstance(payload, Mapping) or set(payload) != _INVOCATION_FIELDS:
            raise ValueError("StrategyInvocation has an invalid v1 schema.")
        if type(payload["schema_version"]) is not int or payload["schema_version"] != 1:
            raise ValueError("schema_version must be 1.")
        source = payload["strategy_source"]
        source_hash = payload["source_sha256"]
        if not isinstance(source, str) or not source.strip():
            raise ValueError("strategy_source must be a non-empty string.")
        expected_hash = sha256(source.encode("utf-8")).hexdigest()
        if not isinstance(source_hash, str) or source_hash != expected_hash:
            raise ValueError("strategy_source hash mismatch.")
        seed = payload["seed"]
        if type(seed) is not int or seed < 0 or seed > 2**63 - 1:
            raise ValueError("seed must be a non-negative 64-bit integer.")
        symbol = _required_string(payload["symbol"], "symbol")
        timeframe = _required_string(payload["timeframe"], "timeframe")
        as_of_time = _utc_timestamp(payload["as_of_time"], "as_of_time")
        policy_payload = payload["resource_policy"]
        if not isinstance(policy_payload, Mapping):
            raise ValueError("resource_policy must be an object.")
        policy = ResourcePolicyV1.from_payload(policy_payload)
        normalized_bars = _normalize_bars(payload["bars"], as_of_time, policy.max_bars)
        config = _json_value(payload["config"])
        initial_state = _json_value(payload["initial_state"])
        if not isinstance(config, dict) or not isinstance(initial_state, dict):
            raise ValueError("config and initial_state must be JSON objects.")
        normalized = {
            "schema_version": 1,
            "strategy_source": source,
            "source_sha256": expected_hash,
            "bars": normalized_bars,
            "symbol": symbol,
            "timeframe": timeframe,
            "config": config,
            "initial_state": initial_state,
            "seed": seed,
            "as_of_time": _timestamp_text(as_of_time),
            "resource_policy": policy.to_payload(),
        }
        try:
            encoded = json.dumps(
                normalized,
                ensure_ascii=False,
                allow_nan=False,
                sort_keys=True,
                separators=(",", ":"),
            ).encode("utf-8")
        except (TypeError, ValueError, UnicodeEncodeError) as exc:
            raise ValueError("StrategyInvocation is not canonical JSON.") from exc
        if len(encoded) > policy.input_bytes:
            raise ValueError("StrategyInvocation exceeds input_bytes.")
        instance = object.__new__(cls)
        object.__setattr__(instance, "_canonical_json", encoded)
        return instance

    def to_payload(self) -> dict[str, Any]:
        return json.loads(self._canonical_json)


def _required_string(value: Any, name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{name} must be a non-empty string.")
    return value


def _utc_timestamp(value: Any, name: str) -> datetime:
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value[:-1] + "+00:00" if value.endswith("Z") else value)
        except ValueError as exc:
            raise ValueError(f"{name} must be an ISO timestamp.") from exc
    if not isinstance(value, datetime) or value.tzinfo is None or value.utcoffset() is None:
        raise ValueError(f"{name} must be a timezone-aware UTC timestamp.")
    return value.astimezone(timezone.utc)


def _timestamp_text(value: Any) -> str:
    timestamp = _utc_timestamp(value, "timestamp")
    return timestamp.isoformat(timespec="microseconds").replace("+00:00", "Z")


def _decimal_text(value: Any, name: str) -> tuple[str, Decimal]:
    if isinstance(value, bool) or not isinstance(value, (Decimal, int, float, str)):
        raise ValueError(f"{name} must be a finite number.")
    try:
        number = Decimal(str(value))
    except InvalidOperation as exc:
        raise ValueError(f"{name} must be a finite number.") from exc
    if not number.is_finite():
        raise ValueError(f"{name} must be a finite number.")
    integer_digits = max(number.adjusted() + 1, 0) if number else 0
    decimal_places = max(-number.as_tuple().exponent, 0)
    if integer_digits > 16 or decimal_places > 12:
        raise ValueError(f"{name} exceeds MarketCandle Numeric(28, 12) precision.")
    return format(number.normalize(), "f"), number


def _normalize_bars(bars: Any, as_of_time: datetime, maximum: int) -> list[dict[str, str]]:
    if not isinstance(bars, list) or len(bars) > maximum:
        raise ValueError("bars must be a list within max_bars.")
    normalized: list[dict[str, str]] = []
    previous_open: datetime | None = None
    previous_close: datetime | None = None
    for bar in bars:
        if not isinstance(bar, Mapping) or set(bar) != _BAR_FIELDS:
            raise ValueError("bar must contain only UTC timestamps and OHLCV fields.")
        open_time = _utc_timestamp(bar["open_time"], "bar.open_time")
        close_time = _utc_timestamp(bar["close_time"], "bar.close_time")
        if close_time <= open_time or close_time > as_of_time:
            raise ValueError("bar must be closed as of invocation time.")
        if previous_open is not None and (
            open_time <= previous_open or close_time <= previous_close
        ):
            raise ValueError("bars must be in strictly increasing time order.")
        numbers = {
            name: _decimal_text(bar[name], f"bar.{name}")
            for name in ("open", "high", "low", "close", "volume")
        }
        open_value, high_value, low_value, close_value, volume_value = (
            numbers[name][1] for name in ("open", "high", "low", "close", "volume")
        )
        if (
            min(open_value, high_value, low_value, close_value) <= 0
            or volume_value < 0
            or high_value < max(open_value, close_value)
            or low_value > min(open_value, close_value)
            or low_value > high_value
        ):
            raise ValueError("bar OHLCV values are invalid.")
        normalized.append(
            {
                "open_time": _timestamp_text(open_time),
                "close_time": _timestamp_text(close_time),
                **{name: numbers[name][0] for name in ("open", "high", "low", "close", "volume")},
            }
        )
        previous_open, previous_close = open_time, close_time
    return normalized


def _json_value(value: Any) -> Any:
    if value is None or isinstance(value, (str, bool)):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if not isfinite(value):
            raise ValueError("JSON numbers must be finite.")
        return value
    if isinstance(value, Mapping):
        if not all(isinstance(key, str) for key in value):
            raise ValueError("JSON object keys must be strings.")
        return {key: _json_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_value(item) for item in value]
    raise ValueError(f"unsupported JSON value type: {type(value).__name__}.")
