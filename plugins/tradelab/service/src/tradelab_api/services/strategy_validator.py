from __future__ import annotations

import ast
from dataclasses import dataclass, field
from typing import Literal


BLOCKED_IMPORTS = {
    "httpx",
    "os",
    "pathlib",
    "requests",
    "shutil",
    "socket",
    "subprocess",
    "sys",
}

SAFE_IMPORTS = {
    "datetime",
    "decimal",
    "math",
    "statistics",
    "tradelab_sdk",
    "typing",
}


@dataclass(slots=True)
class StrategyValidationResult:
    is_valid: bool
    validation_status: Literal["valid", "invalid"]
    message: str | None = None
    line: int | None = None
    column: int | None = None
    blocked_imports: list[str] = field(default_factory=list)


def validate_strategy_source(source: str) -> StrategyValidationResult:
    try:
        compile(source, "<strategy>", "exec")
    except SyntaxError as exc:
        return StrategyValidationResult(
            is_valid=False,
            validation_status="invalid",
            message=format_syntax_error(exc),
            line=exc.lineno,
            column=exc.offset,
        )

    try:
        tree = ast.parse(source, filename="<strategy>")
    except SyntaxError as exc:
        return StrategyValidationResult(
            is_valid=False,
            validation_status="invalid",
            message=format_syntax_error(exc),
            line=exc.lineno,
            column=exc.offset,
        )

    blocked_imports = find_blocked_imports(tree)
    if blocked_imports:
        first_import = blocked_imports[0]
        return StrategyValidationResult(
            is_valid=False,
            validation_status="invalid",
            message=f"Blocked import: {first_import.module}",
            line=first_import.line,
            column=first_import.column,
            blocked_imports=[item.module for item in blocked_imports],
        )

    on_candle = find_on_candle(tree)
    if on_candle is None:
        return StrategyValidationResult(
            is_valid=False,
            validation_status="invalid",
            message="Missing required function on_candle(ctx).",
        )

    if not has_on_candle_signature(on_candle):
        return StrategyValidationResult(
            is_valid=False,
            validation_status="invalid",
            message="on_candle(ctx) must accept exactly one positional argument named ctx.",
            line=on_candle.lineno,
            column=on_candle.col_offset + 1,
        )

    return StrategyValidationResult(is_valid=True, validation_status="valid")


def apply_validation_result(strategy_version: object, result: StrategyValidationResult) -> None:
    setattr(strategy_version, "validation_status", result.validation_status)
    setattr(strategy_version, "validation_message", result.message)


@dataclass(slots=True)
class _BlockedImport:
    module: str
    line: int | None
    column: int | None


def format_syntax_error(exc: SyntaxError) -> str:
    location = ""
    if exc.lineno is not None:
        location = f"line {exc.lineno}"
        if exc.offset is not None:
            location += f", column {exc.offset}"
    return f"Syntax error: {exc.msg}" + (f" at {location}" if location else "")


def find_blocked_imports(tree: ast.AST) -> list[_BlockedImport]:
    blocked: list[_BlockedImport] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                module = alias.name.split(".", 1)[0]
                if module in BLOCKED_IMPORTS:
                    blocked.append(_BlockedImport(module=module, line=node.lineno, column=node.col_offset + 1))
        elif isinstance(node, ast.ImportFrom):
            if node.module is None:
                continue
            module = node.module.split(".", 1)[0]
            if module in BLOCKED_IMPORTS:
                blocked.append(_BlockedImport(module=module, line=node.lineno, column=node.col_offset + 1))
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

