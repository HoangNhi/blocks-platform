from __future__ import annotations

import subprocess
from pathlib import Path

from tradelab_api.services.strategy_runner import run_strategy_subprocess


FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "sma_9_21_long_only_strategy.py"


def _candles() -> list[dict[str, object]]:
    return [
        {"open_time": "2026-01-01T00:00:00Z", "open": 1, "high": 1, "low": 1, "close": 1, "volume": 10},
        {"open_time": "2026-01-01T01:00:00Z", "open": 2, "high": 2, "low": 2, "close": 2, "volume": 10},
        {"open_time": "2026-01-01T02:00:00Z", "open": 3, "high": 3, "low": 3, "close": 3, "volume": 10},
        {"open_time": "2026-01-01T03:00:00Z", "open": 4, "high": 4, "low": 4, "close": 4, "volume": 10},
        {"open_time": "2026-01-01T04:00:00Z", "open": 5, "high": 5, "low": 5, "close": 5, "volume": 10},
        {"open_time": "2026-01-01T05:00:00Z", "open": 6, "high": 6, "low": 6, "close": 6, "volume": 10},
        {"open_time": "2026-01-01T06:00:00Z", "open": 7, "high": 7, "low": 7, "close": 7, "volume": 10},
        {"open_time": "2026-01-01T07:00:00Z", "open": 8, "high": 8, "low": 8, "close": 8, "volume": 10},
        {"open_time": "2026-01-01T08:00:00Z", "open": 9, "high": 9, "low": 9, "close": 9, "volume": 10},
        {"open_time": "2026-01-01T09:00:00Z", "open": 10, "high": 10, "low": 10, "close": 10, "volume": 10},
        {"open_time": "2026-01-01T10:00:00Z", "open": 11, "high": 11, "low": 11, "close": 11, "volume": 10},
        {"open_time": "2026-01-01T11:00:00Z", "open": 12, "high": 12, "low": 12, "close": 12, "volume": 10},
        {"open_time": "2026-01-01T12:00:00Z", "open": 13, "high": 13, "low": 13, "close": 13, "volume": 10},
        {"open_time": "2026-01-01T13:00:00Z", "open": 14, "high": 14, "low": 14, "close": 14, "volume": 10},
        {"open_time": "2026-01-01T14:00:00Z", "open": 15, "high": 15, "low": 15, "close": 15, "volume": 10},
        {"open_time": "2026-01-01T15:00:00Z", "open": 16, "high": 16, "low": 16, "close": 16, "volume": 10},
        {"open_time": "2026-01-01T16:00:00Z", "open": 17, "high": 17, "low": 17, "close": 17, "volume": 10},
        {"open_time": "2026-01-01T17:00:00Z", "open": 18, "high": 18, "low": 18, "close": 18, "volume": 10},
        {"open_time": "2026-01-01T18:00:00Z", "open": 19, "high": 19, "low": 19, "close": 19, "volume": 10},
        {"open_time": "2026-01-01T19:00:00Z", "open": 20, "high": 20, "low": 20, "close": 20, "volume": 10},
        {"open_time": "2026-01-01T20:00:00Z", "open": 19, "high": 19, "low": 19, "close": 19, "volume": 10},
        {"open_time": "2026-01-01T21:00:00Z", "open": 18, "high": 18, "low": 18, "close": 18, "volume": 10},
        {"open_time": "2026-01-01T22:00:00Z", "open": 17, "high": 17, "low": 17, "close": 17, "volume": 10},
        {"open_time": "2026-01-01T23:00:00Z", "open": 16, "high": 16, "low": 16, "close": 16, "volume": 10},
        {"open_time": "2026-01-02T00:00:00Z", "open": 15, "high": 15, "low": 15, "close": 15, "volume": 10},
        {"open_time": "2026-01-02T01:00:00Z", "open": 14, "high": 14, "low": 14, "close": 14, "volume": 10},
        {"open_time": "2026-01-02T02:00:00Z", "open": 13, "high": 13, "low": 13, "close": 13, "volume": 10},
        {"open_time": "2026-01-02T03:00:00Z", "open": 12, "high": 12, "low": 12, "close": 12, "volume": 10},
        {"open_time": "2026-01-02T04:00:00Z", "open": 11, "high": 11, "low": 11, "close": 11, "volume": 10},
        {"open_time": "2026-01-02T05:00:00Z", "open": 10, "high": 10, "low": 10, "close": 10, "volume": 10},
        {"open_time": "2026-01-02T06:00:00Z", "open": 9, "high": 9, "low": 9, "close": 9, "volume": 10},
        {"open_time": "2026-01-02T07:00:00Z", "open": 8, "high": 8, "low": 8, "close": 8, "volume": 10},
        {"open_time": "2026-01-02T08:00:00Z", "open": 7, "high": 7, "low": 7, "close": 7, "volume": 10},
        {"open_time": "2026-01-02T09:00:00Z", "open": 6, "high": 6, "low": 6, "close": 6, "volume": 10},
    ]


def test_valid_strategy_runs_in_subprocess() -> None:
    result = run_strategy_subprocess(
        strategy_source=FIXTURE_PATH.read_text(encoding="utf-8"),
        candles=_candles(),
        symbol="BTC/USDT",
        timeframe="1h",
    )

    assert result.success is True
    assert result.payload is not None
    assert result.payload["status"] == "ok"
    assert result.payload["candlesProcessed"] == len(_candles())


def test_runtime_exception_surfaces_as_failed_run() -> None:
    result = run_strategy_subprocess(
        strategy_source="def on_candle(ctx):\n    raise RuntimeError('boom')\n",
        candles=_candles()[:1],
        symbol="BTC/USDT",
        timeframe="1h",
    )

    assert result.success is False
    assert "boom" in (result.error_message or "")


def test_timeout_surfaces_as_failed_run(monkeypatch) -> None:
    from tradelab_api.services import strategy_runner as module

    def fake_run(*args, **kwargs):  # noqa: ANN001
        raise subprocess.TimeoutExpired(cmd=kwargs.get("args") or args[0], timeout=1)

    monkeypatch.setattr(module.subprocess, "run", fake_run)

    result = module.run_strategy_subprocess(
        strategy_source=FIXTURE_PATH.read_text(encoding="utf-8"),
        candles=_candles()[:1],
        symbol="BTC/USDT",
        timeframe="1h",
        timeout_seconds=1,
    )

    assert result.success is False
    assert result.timed_out is True

def test_os_error_surfaces_as_non_timeout_failed_run(monkeypatch, tmp_path: Path) -> None:
    from tradelab_api.services import strategy_runner as module

    missing_root = tmp_path / "missing-runner"

    def fake_run(*args, **kwargs):  # noqa: ANN001
        raise FileNotFoundError(2, "No such file or directory", str(missing_root))

    monkeypatch.setattr(module.subprocess, "run", fake_run)
    result = module.run_strategy_subprocess(
        strategy_source="def on_candle(ctx):\n    return []\n",
        candles=_candles()[:1],
        symbol="BTC/USDT",
        timeframe="1h",
        cwd=missing_root,
    )

    assert result.success is False
    assert result.timed_out is False
    assert result.returncode == -1
    assert "missing-runner" in (result.error_message or "")


def test_network_adjacent_imports_are_blocked() -> None:
    result = run_strategy_subprocess(
        strategy_source="import urllib.request\n\ndef on_candle(ctx):\n    return []\n",
        candles=_candles()[:1],
        symbol="BTC/USDT",
        timeframe="1h",
    )

    assert result.success is False
    assert result.error_payload is not None
    assert result.error_payload["error"]["type"] == "ImportError"
    assert "urllib" in result.error_payload["error"]["details"]["blockedImports"]
