from __future__ import annotations

import ast
import builtins
import hashlib
import json
import math
import random
import sys
import traceback
from dataclasses import asdict, is_dataclass
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

from tradelab_sdk.context import StrategyContext
from tradelab_sdk.orders import OrderIntent
from tradelab_sdk.signals import StrategySignal
from tradelab_sdk.types import Bar, MarketType, PositionSide
from tradelab_sdk.portfolio_spot import SpotPortfolioState
from tradelab_sdk.futures_portfolio import FuturesPortfolioState, FuturesPosition
from dataclasses import dataclass

@dataclass
class SDKOrder:
    symbol: str
    type: str
    side: str
    size: float
    price: float

class SDKRunner:
    def __init__(self, market_type: MarketType = MarketType.SPOT, symbol: str | None = None):
        self.market_type = market_type
        self.symbol = symbol
        if market_type == MarketType.USD_M_FUTURES:
            self.portfolio = FuturesPortfolioState(initial_usdt=10000.0)
        else:
            self.portfolio = SpotPortfolioState(initial_usdt=10000.0)
        self.orders: list[SDKOrder] = []

    def _resolve_symbol(self, current_candle: dict[str, Any]) -> str:
        symbol = str(current_candle.get("symbol") or self.symbol or "").strip()
        if self.market_type == MarketType.USD_M_FUTURES and not symbol:
            raise ValueError("Futures tick requires an explicit symbol.")
        return symbol or "BTCUSDT"

    def tick(self, current_candle: dict[str, Any]):
        # 1. Cập nhật mark price
        close_px = float(current_candle.get("close", 0.0))
        symbol = self._resolve_symbol(current_candle)
        self.portfolio.update_mark_price(symbol, close_px)
        
        # 2. Đánh giá thanh lý (evaluate liquidations)
        from decimal import Decimal
        
        open_time_val = current_candle.get("open_time")
        parsed_open_time = None
        if open_time_val:
            try:
                parsed_open_time = parse_time(open_time_val)
            except Exception:
                pass

        bar = Bar(
            open_time=parsed_open_time, 
            open=Decimal(0), 
            high=Decimal(current_candle.get("high", 0.0)), 
            low=Decimal(current_candle.get("low", 0.0)), 
            close=Decimal(close_px), 
            volume=Decimal(0)
        )

        
        liquidations = self.portfolio.evaluate_liquidations(symbol, bar)
        for liq in liquidations:
            self.orders.append(SDKOrder(
                symbol=liq["symbol"],
                type="LIQUIDATION",
                side="SELL" if liq["side"] == PositionSide.LONG else "BUY",
                size=liq["quantity"],
                price=liq["price"]
            ))



BLOCKED_IMPORTS = {
    "aiohttp",
    "ftplib",
    "httpx",
    "os",
    "pathlib",
    "requests",
    "shutil",
    "socket",
    "subprocess",
    "sys",
    "telnetlib",
    "urllib",
    "urllib3",
    "websocket",
}


ALLOWED_ROOT_MODULES = frozenset({
    "math",
    "decimal",
    "datetime",
    "json",
    "numpy",
    "pandas",
    "tradelab_sdk",
    "dataclasses",
    "typing",
    "collections",
    "numbers",
    "itertools",
    "functools",
    "enum",
    "abc",
    "copy",
    "re",
    "_decimal",
})

_original_import = (
    __builtins__["__import__"]
    if isinstance(__builtins__, dict)
    else getattr(__builtins__, "__import__")
)


def _sandboxed_import(name, globals=None, locals=None, fromlist=(), level=0):
    root_mod = name.split(".")[0]
    if root_mod not in ALLOWED_ROOT_MODULES:
        raise ImportError(f"Prohibited import: module {name!r} is not in the strategy allowlist.")
    return _original_import(name, globals, locals, fromlist, level)


def _sandboxed_open(*args, **kwargs):
    raise PermissionError("Direct filesystem I/O via open() is prohibited in strategy sandbox.")


def main() -> int:
    try:
        encoded = sys.stdin.buffer.read(16 * 1024 * 1024 + 1)
        if len(encoded) > 16 * 1024 * 1024:
            raise RunnerError(error_type="ValidationError", message="Strategy input exceeds its byte limit.")
        payload = json.loads(encoded, object_pairs_hook=_unique_json_object)
        if not isinstance(payload, dict) or "schema_version" not in payload:
            raise RunnerError(error_type="ValidationError", message="Runner requires StrategyInvocation v1.")
        result = execute_strategy_payload(payload)
        json.dump(result, sys.stdout, ensure_ascii=False)
        sys.stdout.write("\n")
        return 0
    except RunnerError as exc:
        json.dump(exc.to_payload(), sys.stderr, ensure_ascii=False)
        sys.stderr.write("\n")
        return 1
    except Exception as exc:  # pragma: no cover - defensive catch for unexpected failures
        payload = {
            "status": "error",
            "error": {
                "type": type(exc).__name__,
                "message": str(exc),
                "traceback": traceback.format_exc(),
            },
        }
        json.dump(payload, sys.stderr, ensure_ascii=False)
        sys.stderr.write("\n")
        return 1


from tradelab_sdk.history import HistoryProvider

def _unique_json_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise RunnerError(error_type="ValidationError", message="Duplicate JSON key.")
        result[key] = value
    return result


def _validate_invocation(payload: dict[str, Any]) -> None:
    try:
        fields = {"schema_version", "strategy_source", "source_sha256", "bars", "symbol", "timeframe", "config", "initial_state", "seed", "as_of_time", "resource_policy"}
        if set(payload) != fields or type(payload["schema_version"]) is not int:
            raise ValueError("Invalid invocation schema.")
        seed = payload["seed"]
        if type(seed) is not int or not 0 <= seed <= 2**63 - 1:
            raise ValueError("Invalid seed.")
        limits = {"wall_time_seconds": 60, "cpu_time_seconds": 30, "memory_bytes": 512 * 1024 * 1024, "pids": 16, "tmpfs_bytes": 16 * 1024 * 1024, "output_bytes": 2 * 1024 * 1024, "input_bytes": 16 * 1024 * 1024, "max_bars": 50_000}
        policy = payload["resource_policy"]
        if not isinstance(policy, dict) or set(policy) != set(limits) | {"version", "cpu_rate_cores"} or type(policy["version"]) is not int or policy["version"] != 1:
            raise ValueError("Invalid resource policy schema.")
        for name, maximum in limits.items():
            value = policy[name]
            if type(value) is not int or not 0 < value <= maximum:
                raise ValueError("Invalid resource policy limit.")
        rate = policy["cpu_rate_cores"]
        if type(rate) not in (int, float) or not math.isfinite(rate) or not 0 < rate <= 1:
            raise ValueError("Invalid CPU rate.")
        for name in ("symbol", "timeframe", "strategy_source"):
            if not isinstance(payload[name], str) or not payload[name].strip():
                raise ValueError("Invalid invocation string.")
        if not isinstance(payload["config"], dict) or not isinstance(payload["initial_state"], dict):
            raise ValueError("Config and state must be JSON objects.")
        encoded = json.dumps(payload, ensure_ascii=False, allow_nan=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        if len(encoded) > policy["input_bytes"]:
            raise ValueError("Strategy input exceeds its byte limit.")
        as_of = parse_time(payload["as_of_time"])
        if as_of.tzinfo is None or as_of.utcoffset() != timedelta(0):
            raise ValueError("as_of_time must be UTC.")
        bars = payload["bars"]
        if not isinstance(bars, list) or len(bars) > policy["max_bars"]:
            raise ValueError("Invalid bars.")
        previous = None
        for bar in bars:
            if not isinstance(bar, dict) or set(bar) != {"open_time", "close_time", "open", "high", "low", "close", "volume"}:
                raise ValueError("Invalid bar schema.")
            opened, closed = parse_time(bar["open_time"]), parse_time(bar["close_time"])
            if opened.tzinfo is None or closed.tzinfo is None or opened.utcoffset() != timedelta(0) or closed.utcoffset() != timedelta(0) or closed < opened or closed > as_of or (previous is not None and opened <= previous):
                raise ValueError("Invalid bar time or temporal cutoff.")
            previous = opened
            numbers = {name: Decimal(str(bar[name])) for name in ("open", "high", "low", "close", "volume")}
            if not all(value.is_finite() for value in numbers.values()) or any(numbers[name] <= 0 for name in ("open", "high", "low", "close")) or numbers["volume"] < 0 or numbers["low"] > min(numbers["open"], numbers["close"]) or numbers["high"] < max(numbers["open"], numbers["close"]):
                raise ValueError("Invalid bar values.")
    except (ValueError, TypeError, KeyError, ArithmeticError) as exc:
        raise RunnerError(error_type="ValidationError", message=str(exc)) from exc


def execute_strategy_payload(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise RunnerError(error_type="ValidationError", message="Strategy payload must be an object.")
    strategy_source = payload.get("strategy_source", "")
    schema_version = payload.get("schema_version")
    if schema_version is not None:
        if schema_version != 1:
            raise RunnerError(
                error_type="ValidationError",
                message=f"Unsupported schema_version: {schema_version}",
            )
        if not isinstance(strategy_source, str):
            raise RunnerError(error_type="ValidationError", message="strategy_source must be a string.")
        source_sha256 = payload.get("source_sha256")
        expected_hash = hashlib.sha256(strategy_source.encode("utf-8")).hexdigest()
        if source_sha256 != expected_hash:
            raise RunnerError(
                error_type="ValidationError",
                message="strategy_source hash mismatch.",
            )

    if schema_version is not None:
        _validate_invocation(payload)
        random.seed(payload["seed"])

    candles = payload.get("bars") or payload.get("candles") or []
    symbol = payload.get("symbol", "")
    timeframe = payload.get("timeframe", "")
    config = payload.get("config", {})
    state = payload.get("initial_state") or payload.get("state") or {}

    validate_strategy_source(strategy_source)

    # Pre-import allowed modules so their internal C/private imports are cached before hooking
    import decimal, math, datetime, json  # noqa: F401
    try:
        import numpy
        if schema_version is not None:
            numpy.random.seed(payload["seed"] % 2**32)
    except ImportError:
        pass
    try:
        import pandas  # noqa: F401
    except ImportError:
        pass

    original_open = builtins.open
    original_import = builtins.__import__

    safe_builtins = (
        dict(__builtins__)
        if isinstance(__builtins__, dict)
        else vars(__builtins__).copy()
    )
    for dangerous in ("eval", "exec", "compile"):
        safe_builtins.pop(dangerous, None)
    safe_builtins["open"] = _sandboxed_open
    safe_builtins["__import__"] = _sandboxed_import
    namespace: dict[str, Any] = {"__builtins__": safe_builtins}

    builtins.open = _sandboxed_open
    builtins.__import__ = _sandboxed_import
    try:
        compiled = compile(strategy_source, "<strategy>", "exec")
        exec(compiled, namespace, namespace)

        on_candle = namespace.get("on_candle")
        if not callable(on_candle):
            raise RunnerError(
                error_type="ValidationError",
                message="Missing required function on_candle(ctx).",
            )

        history_provider = HistoryProvider(primary_timeframe=timeframe)
        logs: list[dict[str, Any]] = []
        actions: list[dict[str, Any]] = []

        for index, candle in enumerate(candles):
            parsed_candle = dict(candle)
            if "open_time" in parsed_candle and isinstance(parsed_candle["open_time"], str):
                parsed_candle["open_time"] = parse_time(parsed_candle["open_time"])
            if "close_time" in parsed_candle and isinstance(parsed_candle["close_time"], str):
                parsed_candle["close_time"] = parse_time(parsed_candle["close_time"])

            history_provider.append_candle(parsed_candle)
            bar = build_bar(candle)
            context = StrategyContext(
                symbol=symbol,
                timeframe=timeframe,
                now=parse_time(candle.get("close_time") or candle.get("open_time")),
                bar=bar,
                history=history_provider,
                config=config,
                state=state,
                logger=logs.append,
            )
            outcome = on_candle(context)
            normalized = normalize_actions(outcome)
            if normalized:
                actions.append({"candleIndex": index, "actions": normalized})

        return {
            "status": "ok",
            "symbol": symbol,
            "timeframe": timeframe,
            "candlesProcessed": len(candles),
            "actions": actions,
            "logs": logs,
        }
    finally:
        builtins.open = original_open
        builtins.__import__ = original_import


def validate_strategy_source(source: str) -> None:
    try:
        compile(source, "<strategy>", "exec")
    except SyntaxError as exc:
        raise RunnerError(
            error_type="SyntaxError",
            message=format_syntax_error(exc),
            line=exc.lineno,
            column=exc.offset,
        ) from exc
    tree = ast.parse(source, filename="<strategy>")
    blocked = find_blocked_imports(tree)
    if blocked:
        item = blocked[0]
        raise RunnerError(
            error_type="ImportError",
            message=f"Blocked import: {item['module']}",
            line=item.get("line"),
            column=item.get("column"),
            details={"blockedImports": [entry["module"] for entry in blocked]},
        )
    function = find_on_candle(tree)
    if function is None:
        raise RunnerError(
            error_type="ValidationError",
            message="Missing required function on_candle(ctx).",
        )
    if not has_on_candle_signature(function):
        raise RunnerError(
            error_type="ValidationError",
            message="on_candle(ctx) must accept exactly one positional argument named ctx.",
            line=function.lineno,
            column=function.col_offset + 1,
        )


def format_syntax_error(exc: SyntaxError) -> str:
    location = ""
    if exc.lineno is not None:
        location = f"line {exc.lineno}"
        if exc.offset is not None:
            location += f", column {exc.offset}"
    return f"Syntax error: {exc.msg}" + (f" at {location}" if location else "")


def find_blocked_imports(tree: ast.AST) -> list[dict[str, Any]]:
    blocked: list[dict[str, Any]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                module = alias.name.split(".", 1)[0]
                if module in BLOCKED_IMPORTS:
                    blocked.append({"module": module, "line": node.lineno, "column": node.col_offset + 1})
        elif isinstance(node, ast.ImportFrom) and node.module is not None:
            module = node.module.split(".", 1)[0]
            if module in BLOCKED_IMPORTS:
                blocked.append({"module": module, "line": node.lineno, "column": node.col_offset + 1})
    return blocked


def find_on_candle(tree: ast.AST) -> ast.FunctionDef | None:
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == "on_candle":
            return node
    return None


def has_on_candle_signature(function: ast.FunctionDef) -> bool:
    args = function.args
    return (
        len(args.posonlyargs) == 0
        and len(args.args) == 1
        and args.args[0].arg == "ctx"
        and args.vararg is None
        and len(args.kwonlyargs) == 0
        and args.kwarg is None
        and len(args.defaults) == 0
    )


def build_bar(candle: dict[str, Any]) -> Bar:
    return Bar(
        open_time=parse_time(candle.get("open_time")),
        open=to_decimal(candle.get("open")),
        high=to_decimal(candle.get("high")),
        low=to_decimal(candle.get("low")),
        close=to_decimal(candle.get("close")),
        volume=to_decimal(candle.get("volume")),
    )


def parse_time(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    raise RunnerError(error_type="ValidationError", message=f"Unsupported time value: {value!r}")


def to_decimal(value: Any) -> Decimal:
    return Decimal(str(value))


def normalize_actions(outcome: Any) -> list[dict[str, Any]]:
    if outcome is None:
        return []
    if isinstance(outcome, (OrderIntent, StrategySignal)):
        return [to_payload(outcome)]
    if isinstance(outcome, dict):
        return [outcome]
    if isinstance(outcome, (list, tuple)):
        return [to_payload(item) for item in outcome]
    return [to_payload(outcome)]


def to_payload(item: Any) -> dict[str, Any]:
    if is_dataclass(item):
        return asdict(item)
    if isinstance(item, dict):
        return item
    return {"value": item}


class RunnerError(Exception):
    def __init__(
        self,
        *,
        error_type: str,
        message: str,
        line: int | None = None,
        column: int | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.error_type = error_type
        self.message = message
        self.line = line
        self.column = column
        self.details = details or {}

    def to_payload(self) -> dict[str, Any]:
        payload = {
            "status": "error",
            "error": {
                "type": self.error_type,
                "message": self.message,
            },
        }
        if self.line is not None:
            payload["error"]["line"] = self.line
        if self.column is not None:
            payload["error"]["column"] = self.column
        if self.details:
            payload["error"]["details"] = self.details
        return payload


if __name__ == "__main__":  # pragma: no cover - CLI entrypoint
    raise SystemExit(main())
