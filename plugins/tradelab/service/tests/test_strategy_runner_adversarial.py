from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import sys

_runner_src = Path(__file__).resolve().parents[2] / "runner" / "src"
if str(_runner_src) not in sys.path:
    sys.path.insert(0, str(_runner_src))

from tradelab_api.core.invocation import ResourcePolicyV1, StrategyInvocation  # noqa: E402
from tradelab_api.services.strategy_runner import run_strategy_subprocess  # noqa: E402


def _make_invocation(source: str, **policy_overrides) -> StrategyInvocation:
    policy_kwargs = {
        "wall_time_seconds": 10,
        "cpu_time_seconds": 5,
        "cpu_rate_cores": 1.0,
        "memory_bytes": 512 * 1024 * 1024,
        "pids": 16,
        "tmpfs_bytes": 16 * 1024 * 1024,
        "output_bytes": 2 * 1024 * 1024,
        "input_bytes": 16 * 1024 * 1024,
        "max_bars": 50_000,
    }
    policy_kwargs.update(policy_overrides)
    policy = ResourcePolicyV1(**policy_kwargs)

    return StrategyInvocation.create(
        strategy_source=source,
        bars=[
            {
                "open_time": "2026-01-01T00:00:00Z",
                "close_time": "2026-01-01T01:00:00Z",
                "open": "1.0",
                "high": "2.0",
                "low": "0.5",
                "close": "1.5",
                "volume": "100.0",
            }
        ],
        symbol="EURUSD",
        timeframe="1h",
        config={},
        initial_state={},
        seed=42,
        as_of_time=datetime(2026, 1, 1, 2, 0, 0, tzinfo=timezone.utc),
        resource_policy=policy,
    )


def test_positive_strategy_runs_successfully():
    source = """
def on_candle(ctx):
    ctx.log("bar_received", close=str(ctx.bar.close))
    return []
"""
    inv = _make_invocation(source)
    res = run_strategy_subprocess(invocation=inv)

    assert res.success is True
    assert res.payload is not None
    assert res.payload["status"] == "ok"
    assert res.payload["candlesProcessed"] == 1


def test_adversarial_static_import_socket_is_blocked():
    source = """
import socket
def on_candle(ctx):
    return []
"""
    inv = _make_invocation(source)
    res = run_strategy_subprocess(invocation=inv)

    assert res.success is False
    assert "socket" in (res.error_message or "").lower() or "import" in (res.error_message or "").lower()


def test_adversarial_dynamic_import_is_blocked():
    source = """
def on_candle(ctx):
    mod = __import__('socket')
    return []
"""
    inv = _make_invocation(source)
    res = run_strategy_subprocess(invocation=inv)

    assert res.success is False
    assert "prohibited" in (res.error_message or "").lower() or "import" in (res.error_message or "").lower()


def test_adversarial_direct_open_is_blocked():
    source = """
def on_candle(ctx):
    with open('test_file.txt', 'w') as f:
        f.write('data')
    return []
"""
    inv = _make_invocation(source)
    res = run_strategy_subprocess(invocation=inv)

    assert res.success is False
    assert "prohibited" in (res.error_message or "").lower() or "open" in (res.error_message or "").lower()


def test_adversarial_output_cap_exceeded_terminates_run():
    # Attempt printing large output when limit is 128KB
    source = """
def on_candle(ctx):
    print("A" * (256 * 1024))
    return []
"""
    inv = _make_invocation(source, output_bytes=128 * 1024)
    res = run_strategy_subprocess(invocation=inv)

    assert res.success is False
    assert "output" in (res.error_message or "").lower() or "exceeded" in (res.error_message or "").lower()


def test_adversarial_timeout_cleans_up():
    source = """
def on_candle(ctx):
    while True:
        pass
"""
    inv = _make_invocation(source, wall_time_seconds=1)
    res = run_strategy_subprocess(invocation=inv)

    assert res.success is False
    assert res.timed_out is True


def test_adversarial_allowed_module_builtin_open_cannot_bypass_sandbox():
    source = """
import decimal
def on_candle(ctx):
    b = getattr(decimal, '__builtins__')
    o = b['open'] if isinstance(b, dict) else getattr(b, 'open')
    o('forbidden.txt', 'w')
    return []
"""
    inv = _make_invocation(source)
    res = run_strategy_subprocess(invocation=inv)
    assert res.success is False
    assert "prohibited" in (res.error_message or "").lower() or "open" in (res.error_message or "").lower()


def test_adversarial_allowed_module_builtin_import_cannot_bypass_sandbox():
    source = """
import decimal
def on_candle(ctx):
    b = getattr(decimal, '__builtins__')
    imp = b['__import__'] if isinstance(b, dict) else getattr(b, '__import__')
    mod = imp('socket')
    return []
"""
    inv = _make_invocation(source)
    res = run_strategy_subprocess(invocation=inv)
    assert res.success is False
    assert "prohibited" in (res.error_message or "").lower() or "import" in (res.error_message or "").lower()


def test_runner_rejects_tampered_source_hash():
    import pytest
    from tradelab_sdk.runner import execute_strategy_payload, RunnerError

    inv = _make_invocation("def on_candle(ctx): pass\n")
    payload = inv.to_payload()
    payload["source_sha256"] = "0" * 64
    with pytest.raises(RunnerError, match="hash mismatch"):
        execute_strategy_payload(payload)


def test_runner_rejects_unsupported_schema_version():
    import pytest
    from tradelab_sdk.runner import execute_strategy_payload, RunnerError

    inv = _make_invocation("def on_candle(ctx): pass\n")
    payload = inv.to_payload()
    payload["schema_version"] = 99
    with pytest.raises(RunnerError, match="Unsupported schema_version"):
        execute_strategy_payload(payload)


def test_original_import_escape_cannot_create_socket_or_fork():
    source = """
def on_candle(ctx):
    original = __import__.__globals__["_original_import"]
    os_module = original("os")
    original("builtins").__import__ = original
    socket_module = original("socket")
    failures = 0
    for operation in (os_module.fork, socket_module.socket):
        try:
            operation()
        except PermissionError:
            failures += 1
    assert failures == 2
    return []
"""
    result = run_strategy_subprocess(invocation=_make_invocation(source))
    assert result.success, result.error_message


def test_original_io_escape_cannot_write_root_or_read_backend():
    source = """
def on_candle(ctx):
    original = __import__.__globals__["_original_import"]
    io_module = original("io")
    failures = 0
    for path, mode in (("/runner/escape.txt", "w"), ("/app/src/tradelab_api/core/config.py", "r"), ("/var/run/docker.sock", "r")):
        try:
            io_module.open(path, mode)
        except OSError:
            failures += 1
    assert failures == 3
    return []
"""
    result = run_strategy_subprocess(invocation=_make_invocation(source))
    assert result.success, result.error_message


def test_container_environment_has_no_backend_authority(monkeypatch):
    monkeypatch.setenv("SYSTEM_SERVICE_AUTHORIZATION_KEY", "non-secret-canary")
    monkeypatch.setenv("DATABASE_PASSWORD", "non-secret-canary")
    source = """
def on_candle(ctx):
    original = __import__.__globals__["_original_import"]
    environment = original("os").environ
    assert "SYSTEM_SERVICE_AUTHORIZATION_KEY" not in environment
    assert "DATABASE_PASSWORD" not in environment
    for key in ("HTTP_PROXY", "HTTPS_PROXY", "FTP_PROXY", "NO_PROXY", "ALL_PROXY"):
        assert environment.get(key, "") == ""
        assert environment.get(key.lower(), "") == ""
    return []
"""
    result = run_strategy_subprocess(invocation=_make_invocation(source))
    assert result.success, result.error_message


def test_scratch_space_has_aggregate_cap():
    source = """
def on_candle(ctx):
    original = __import__.__globals__["_original_import"]
    io_module = original("io")
    try:
        with io_module.open("/tmp/exhaust", "wb") as stream:
            for _ in range(18):
                stream.write(b"A" * (1024 * 1024))
    except OSError as error:
        assert error.errno == 28
        return []
    raise AssertionError("Scratch space was not bounded")
"""
    result = run_strategy_subprocess(invocation=_make_invocation(source))
    assert result.success, result.error_message


def test_memory_cap_terminates_untrusted_process():
    invocation = _make_invocation("def on_candle(ctx):\n    value = bytearray(700 * 1024 * 1024)\n    return []\n")
    result = run_strategy_subprocess(invocation=invocation)
    assert not result.success
    assert result.returncode == 137


def test_cpu_budget_is_enforced():
    invocation = _make_invocation("def on_candle(ctx):\n    while True: pass\n", cpu_time_seconds=1)
    result = run_strategy_subprocess(invocation=invocation)
    assert not result.success
    assert result.returncode == 137
    assert not result.timed_out


def test_revocation_supervisor_terminates_within_seven_seconds():
    from time import monotonic

    checks = []

    def supervise():
        checks.append(monotonic())
        return None if len(checks) == 1 else "Authority revoked."

    invocation = _make_invocation("def on_candle(ctx):\n    while True: pass\n", cpu_time_seconds=30)
    result = run_strategy_subprocess(invocation=invocation, supervisor=supervise)
    elapsed = monotonic() - checks[0]
    print(f"revocation_to_termination_seconds={elapsed:.6f}")
    assert not result.success
    assert result.error_message == "Authority revoked."
    assert elapsed < 7
    assert len(checks) == 2


def test_native_symlink_creation_is_blocked():
    source = '''
def on_candle(ctx):
    original = __import__.__globals__["_original_import"]
    try:
        original("os").symlink("/runner/escape.txt", "/tmp/escape")
    except PermissionError as error:
        assert error.errno == 1
        return []
    raise AssertionError("Native symlink creation was not blocked")
'''
    result = run_strategy_subprocess(invocation=_make_invocation(source))
    assert result.success, result.error_message


def test_native_binary_stdout_and_stderr_share_output_cap():
    source = '''
def on_candle(ctx):
    original = __import__.__globals__["_original_import"]
    os_module = original("os")
    for descriptor in (1, 2):
        for index in range(16):
            os_module.write(descriptor, bytes([255]) * 8192)
    return []
'''
    result = run_strategy_subprocess(invocation=_make_invocation(source, output_bytes=192 * 1024))
    assert not result.success
    assert "output" in result.error_message.lower()
