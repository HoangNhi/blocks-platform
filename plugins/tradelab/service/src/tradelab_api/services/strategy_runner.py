from __future__ import annotations

import json
import subprocess
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from collections.abc import Callable
from datetime import datetime, timezone
from time import monotonic
from uuid import uuid4
import re

from tradelab_api.core.config import get_settings
from tradelab_api.core.invocation import ResourcePolicyV1, StrategyInvocation
from tradelab_api.services.market_data_integrity import timeframe_to_timedelta

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
    sandbox_termination_confirmed: bool = True


def resolve_runner_root(*, cwd: Path | None = None) -> Path:
    if cwd is not None:
        return cwd
    configured_root = get_settings().tradelab_runner_root
    if configured_root:
        return Path(configured_root)
    return Path(__file__).resolve().parents[4] / "runner"




def verify_strategy_executor() -> str:
    image = get_settings().tradelab_runner_image
    if not image or not re.fullmatch(r"(?:[a-zA-Z0-9._:/-]+@)?sha256:[a-f0-9]{64}", image):
        raise RuntimeError("A pinned runner-only image is required; native host execution is disabled.")
    try:
        info_result = subprocess.run(["docker", "info", "--format", "{{json .}}"], capture_output=True, text=True, check=True, timeout=5)
        info = json.loads(info_result.stdout)
        if info.get("OSType") != "linux" or not all(info.get(name) is True for name in ("MemoryLimit", "SwapLimit", "CpuCfsQuota", "PidsLimit")):
            raise RuntimeError("Linux executor resource isolation is unavailable.")
        inspection = subprocess.run(["docker", "image", "inspect", image], capture_output=True, text=True, check=True, timeout=5)
        image_info = json.loads(inspection.stdout)[0]
        config = image_info["Config"]
        if config.get("Labels", {}).get("tradelab.executor") != "runner-v1" or config.get("User") != "65534:65534" or config.get("Entrypoint") != ["python", "-m", "tradelab_sdk.runner"]:
            raise RuntimeError("Executor image does not match the runner-only contract.")
    except (OSError, subprocess.SubprocessError, ValueError, KeyError, IndexError) as exc:
        raise RuntimeError("Strategy executor verification failed.") from exc
    return image


def _supervisor_reason(supervisor: Callable[[], str | None], *, timeout: float = 2) -> str | None:
    result: list[str | None] = []

    def check() -> None:
        try:
            result.append(supervisor())
        except Exception:
            result.append("Execution authority check unavailable.")

    thread = threading.Thread(target=check, daemon=True)
    thread.start()
    thread.join(timeout=timeout)
    if thread.is_alive() or not result:
        return "Execution authority check unavailable."
    return result[0]


def _terminate_sandbox(name: str, token: str) -> bool:
    try:
        inspection = subprocess.run(
            ["docker", "inspect", "--format", '{{.Id}} {{index .Config.Labels "tradelab.invocation"}}', name],
            capture_output=True, text=True, timeout=2,
        )
        if inspection.returncode:
            return "no such" in inspection.stderr.lower()
        identity = inspection.stdout.strip().split()
        if len(identity) != 2 or identity[1] != token:
            return False
        container_id = identity[0]
        subprocess.run(["docker", "rm", "--force", container_id], capture_output=True, text=True, timeout=5)
        remaining = subprocess.run(["docker", "inspect", container_id], capture_output=True, text=True, timeout=2)
        return bool(remaining.returncode and "no such" in remaining.stderr.lower())
    except (OSError, subprocess.SubprocessError):
        return False


def run_strategy_subprocess(
    *,
    invocation: StrategyInvocation | None = None,
    strategy_source: str | None = None,
    candles: list[dict[str, Any]] | None = None,
    symbol: str | None = None,
    timeframe: str | None = None,
    config: dict[str, Any] | None = None,
    state: dict[str, Any] | None = None,
    timeout_seconds: int | None = None,
    cwd: Path | None = None,
    supervisor: Callable[[], str | None] | None = None,
    sandbox_name: str | None = None,
) -> StrategyRunnerResult:
    try:
        if invocation is None:
            invocation = StrategyInvocation.create(
                strategy_source=strategy_source or "",
                bars=[{**bar, "close_time": bar.get("close_time") or (datetime.fromisoformat(str(bar["open_time"]).replace("Z", "+00:00")) + timeframe_to_timedelta(timeframe or "")).isoformat()} for bar in (candles or [])],
                symbol=symbol or "",
                timeframe=timeframe or "",
                config=config or {},
                initial_state=state or {},
                seed=0,
                as_of_time=datetime.now(timezone.utc),
                resource_policy=ResourcePolicyV1(wall_time_seconds=min(timeout_seconds or get_settings().strategy_timeout_seconds, 60)),
            )
        profile = (resolve_runner_root(cwd=cwd) / "seccomp.json").resolve(strict=True)
        image = verify_strategy_executor()
    except (ValueError, OSError, RuntimeError) as exc:
        return StrategyRunnerResult(False, -1, "", "", error_message=str(exc))
    policy = invocation.to_payload()["resource_policy"]
    name = sandbox_name or "tradelab-run-" + uuid4().hex
    if not re.fullmatch(r"tradelab-run-[a-f0-9]{32}(?:-[a-f0-9]{32})?", name):
        return StrategyRunnerResult(False, -1, "", "", error_message="Invalid trusted sandbox identity.")
    token = uuid4().hex
    command = [
        "docker", "create", "--name", name, "--label", "tradelab.executor=invocation-v1",
        "--label", "tradelab.invocation=" + token,
        "--pull", "never", "--interactive", "--read-only", "--network", "none",
        "--user", "65534:65534", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
        "--security-opt", "seccomp=" + str(profile), "--pids-limit", str(policy["pids"]),
        "--memory", str(policy["memory_bytes"]), "--memory-swap", str(policy["memory_bytes"]),
        "--cpus", str(policy["cpu_rate_cores"]),
        "--ulimit", f"cpu={policy['cpu_time_seconds']}:{policy['cpu_time_seconds']}",
        "--ulimit", "nofile=64:64", "--ulimit", "core=0:0",
        "--tmpfs", f"/tmp:rw,noexec,nosuid,nodev,size={policy['tmpfs_bytes']}",
    ]
    for variable in ("HTTP_PROXY", "HTTPS_PROXY", "FTP_PROXY", "NO_PROXY", "ALL_PROXY"):
        command.extend(("--env", variable + "=", "--env", variable.lower() + "="))
    command.append(image)
    if supervisor is not None:
        reason = _supervisor_reason(supervisor)
        if reason is not None:
            return StrategyRunnerResult(False, -1, "", "", error_message=reason)
    try:
        creation = subprocess.run(command, capture_output=True, text=True, timeout=5)
        container_id = creation.stdout.strip()
        if creation.returncode or not re.fullmatch(r"[a-f0-9]{64}", container_id):
            raise RuntimeError("Sandbox creation failed.")
        process = subprocess.Popen(["docker", "start", "--attach", "--interactive", container_id], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, close_fds=True)
    except (OSError, subprocess.SubprocessError, RuntimeError) as exc:
        confirmed = _terminate_sandbox(name, token)
        return StrategyRunnerResult(False, -1, "", "", error_message=str(exc), sandbox_termination_confirmed=confirmed)
    output: list[list[bytes]] = [[], []]
    output_size = 0
    output_exceeded = threading.Event()
    lock = threading.Lock()

    def collect(stream, chunks) -> None:
        nonlocal output_size
        try:
            while chunk := stream.read1(65536):
                with lock:
                    output_size += len(chunk)
                    if output_size > policy["output_bytes"]:
                        output_exceeded.set()
                        return
                    chunks.append(chunk)
        finally:
            stream.close()

    def write_input() -> None:
        try:
            process.stdin.write(invocation.canonical_json)
        except (OSError, BrokenPipeError):
            pass
        finally:
            process.stdin.close()

    threads = [threading.Thread(target=write_input, daemon=True)] + [threading.Thread(target=collect, args=(stream, chunks), daemon=True) for stream, chunks in zip((process.stdout, process.stderr), output)]
    for thread in threads:
        thread.start()
    deadline = monotonic() + policy["wall_time_seconds"]
    next_check = monotonic() + 4
    reason = None
    timed_out = False
    try:
        while process.poll() is None:
            if output_exceeded.is_set():
                reason = "Strategy output exceeded its byte limit."
                break
            if monotonic() >= deadline:
                reason, timed_out = "Strategy execution timed out.", True
                break
            if supervisor is not None and monotonic() >= next_check:
                next_check = monotonic() + 4
                reason = _supervisor_reason(supervisor)
                if reason is not None:
                    break
            threading.Event().wait(0.05)
    finally:
        termination_confirmed = _terminate_sandbox(name, token)
        if not termination_confirmed:
            reason = "Sandbox termination could not be confirmed."
        if process.poll() is None:
            process.kill()
        process.wait(timeout=5)
        for thread in threads:
            thread.join(timeout=2)
    stdout, stderr = (b"".join(chunks).decode("utf-8", errors="replace") for chunks in output)
    if output_exceeded.is_set():
        reason = "Strategy output exceeded its byte limit." + (" " + reason if reason else "")
    if reason is not None:
        return StrategyRunnerResult(False, -1, stdout, stderr, error_message=reason, timed_out=timed_out, sandbox_termination_confirmed=termination_confirmed)
    result = _parse_completed_process(subprocess.CompletedProcess(command, process.returncode, stdout, stderr))
    if result.success:
        try:
            _validate_runner_output(result.payload, invocation)
        except (ValueError, TypeError) as exc:
            return StrategyRunnerResult(False, -1, stdout, stderr, error_message=str(exc))
    return result


def _validate_runner_output(payload: dict[str, Any], invocation: StrategyInvocation) -> None:
    request = invocation.to_payload()
    if not isinstance(payload, dict) or set(payload) != {"status", "symbol", "timeframe", "candlesProcessed", "actions", "logs"}:
        raise ValueError("Invalid runner output schema.")
    processed = payload["candlesProcessed"]
    if payload["status"] != "ok" or payload["symbol"] != request["symbol"] or payload["timeframe"] != request["timeframe"] or type(processed) is not int or processed != len(request["bars"]):
        raise ValueError("Runner output does not match its invocation.")
    if not isinstance(payload["actions"], list) or not isinstance(payload["logs"], list) or not all(isinstance(log, dict) for log in payload["logs"]):
        raise ValueError("Runner actions and logs must be lists of objects.")
    for group in payload["actions"]:
        if not isinstance(group, dict) or set(group) != {"candleIndex", "actions"} or type(group["candleIndex"]) is not int or not 0 <= group["candleIndex"] < processed or not isinstance(group["actions"], list) or not all(isinstance(action, dict) for action in group["actions"]):
            raise ValueError("Invalid runner action index or schema.")
    encoded = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode("utf-8")
    if len(encoded) > request["resource_policy"]["output_bytes"]:
        raise ValueError("Runner output exceeds its byte limit.")

def _parse_completed_process(completed: subprocess.CompletedProcess) -> StrategyRunnerResult:
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
