from __future__ import annotations

import ast
import json
import sys
import traceback
from dataclasses import asdict, is_dataclass
from datetime import datetime
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


def main() -> int:
    try:
        payload = json.load(sys.stdin)
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

def execute_strategy_payload(payload: dict[str, Any]) -> dict[str, Any]:
    strategy_source = payload.get("strategy_source", "")
    candles = payload.get("candles", [])
    symbol = payload.get("symbol", "")
    timeframe = payload.get("timeframe", "")
    config = payload.get("config", {})
    state = payload.get("state", {})

    validate_strategy_source(strategy_source)
    namespace: dict[str, Any] = {}
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
        # Chuyển đổi open_time sang datetime để HistoryProvider gom nến chính xác
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
