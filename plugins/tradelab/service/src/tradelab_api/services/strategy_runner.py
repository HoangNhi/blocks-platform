from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from tradelab_api.core.config import get_settings


@dataclass(slots=True)
class StrategyRunnerResult:
    success: bool
    returncode: int
    stdout: str
    stderr: str
    payload: dict[str, Any] | None = None
    error_payload: dict[str, Any] | None = None
    error_message: str | None = None
    timed_out: bool = False


def resolve_runner_root(*, cwd: Path | None = None) -> Path:
    if cwd is not None:
        return cwd
    configured_root = get_settings().tradelab_runner_root
    if configured_root:
        return Path(configured_root)
    return Path(__file__).resolve().parents[4] / "runner"


def build_runner_environment(*, pythonpath: str | None = None) -> dict[str, str]:
    keys = ("PATH", "SYSTEMROOT", "TEMP", "TMP")
    env = {key: os.environ[key] for key in keys if key in os.environ}
    env["PYTHONIOENCODING"] = "utf-8"
    if pythonpath:
        env["PYTHONPATH"] = pythonpath
    return env


def build_runner_command() -> list[str]:
    return [get_settings().runner_python_path, "-m", "tradelab_sdk.runner"]


def build_runner_payload(
    *,
    strategy_source: str,
    candles: list[dict[str, Any]],
    symbol: str,
    timeframe: str,
    config: dict[str, Any] | None = None,
    state: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "strategy_source": strategy_source,
        "candles": candles,
        "symbol": symbol,
        "timeframe": timeframe,
        "config": config or {},
        "state": state or {},
    }


def run_strategy_subprocess(
    *,
    strategy_source: str,
    candles: list[dict[str, Any]],
    symbol: str,
    timeframe: str,
    config: dict[str, Any] | None = None,
    state: dict[str, Any] | None = None,
    timeout_seconds: int | None = None,
    cwd: Path | None = None,
) -> StrategyRunnerResult:
    runner_root = resolve_runner_root(cwd=cwd)
    runner_src = runner_root / "src"
    try:
        completed = subprocess.run(
            build_runner_command(),
            input=json.dumps(
                build_runner_payload(
                    strategy_source=strategy_source,
                    candles=candles,
                    symbol=symbol,
                    timeframe=timeframe,
                    config=config,
                    state=state,
                ),
                ensure_ascii=False,
            ),
            capture_output=True,
            cwd=str(runner_root),
            env=build_runner_environment(pythonpath=str(runner_src)),
            timeout=timeout_seconds or get_settings().strategy_timeout_seconds,
            text=True,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        return StrategyRunnerResult(
            success=False,
            returncode=-1,
            stdout="",
            stderr="",
            error_message=str(exc),
            timed_out=True,
        )
    except OSError as exc:
        return StrategyRunnerResult(
            success=False,
            returncode=-1,
            stdout="",
            stderr="",
            error_message=str(exc),
            timed_out=False,
        )

    payload: dict[str, Any] | None = None
    if completed.stdout.strip():
        try:
            payload = json.loads(completed.stdout)
        except json.JSONDecodeError:
            payload = None

    error_payload: dict[str, Any] | None = None
    if completed.stderr.strip():
        try:
            error_payload = json.loads(completed.stderr)
        except json.JSONDecodeError:
            error_payload = None

    if completed.returncode == 0:
        return StrategyRunnerResult(
            success=True,
            returncode=completed.returncode,
            stdout=completed.stdout,
            stderr=completed.stderr,
            payload=payload,
            error_payload=error_payload,
        )

    error_message = completed.stderr.strip() or completed.stdout.strip() or "Strategy runner failed."
    if error_payload and isinstance(error_payload, dict):
        error_message = error_payload.get("error", {}).get("message", error_message)
    elif payload and isinstance(payload, dict):
        error_message = payload.get("error", {}).get("message", error_message)
    return StrategyRunnerResult(
        success=False,
        returncode=completed.returncode,
        stdout=completed.stdout,
        stderr=completed.stderr,
        payload=payload,
        error_payload=error_payload,
        error_message=error_message,
    )
