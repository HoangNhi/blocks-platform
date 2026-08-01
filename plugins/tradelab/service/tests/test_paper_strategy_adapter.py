from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest

from tradelab_api.services.paper_engine import PaperEngineCandle, PaperExecutionContext
from tradelab_api.services.paper_strategy_adapter import (
    PaperStrategyActionMapper,
    PaperStrategyRuntimeError,
    SubprocessPaperStrategySignalProvider,
    group_runner_actions,
    serialize_paper_candles,
    summarize_strategy_logs,
)
from tradelab_api.services.strategy_runner import StrategyRunnerResult


def _dt(hour: int) -> datetime:
    return datetime(2026, 1, 1, hour, tzinfo=timezone.utc)


def _candle(hour: int, *, price: str = "100") -> PaperEngineCandle:
    return PaperEngineCandle(
        candle_id=str(uuid4()),
        open_time=_dt(hour),
        close_time=_dt(hour) + timedelta(hours=1),
        open=Decimal(price),
        high=Decimal(price) + Decimal("5"),
        low=Decimal(price) - Decimal("5"),
        close=Decimal(price) + Decimal("1"),
        volume=Decimal("10"),
    )


def _context() -> PaperExecutionContext:
    candles = [_candle(0), _candle(1)]
    return PaperExecutionContext(
        session_id=str(uuid4()),
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        dataset_key="binance:BTCUSDT:1h",
        start_at=_dt(0),
        end_at=_dt(1),
        starting_cash=Decimal("1000"),
        candles=candles,
        max_candles_per_tick=10000,
        fee_bps=Decimal("0"),
        slippage_bps=Decimal("0"),
        runtime_config={"feeBps": "0", "slippageBps": "0"},
        strategy_metadata={"strategyVersionId": str(uuid4())},
        actor="pytest",
        worker_id="pytest-worker",
        correlation_id=None,
        request_id=None,
    )


def _source_snapshot() -> SimpleNamespace:
    return SimpleNamespace(
        strategy_id=str(uuid4()),
        strategy_version_id=str(uuid4()),
        version_number=1,
        source_code="def on_candle(ctx):\n    return []\n",
        source_hash="hash",
        validation_status="valid",
    )


def test_serialize_paper_candles_uses_strings_and_iso_times() -> None:
    serialized = serialize_paper_candles([_candle(0, price="123")])

    assert serialized == [
        {
            "open_time": "2026-01-01T00:00:00+00:00",
            "close_time": "2026-01-01T01:00:00+00:00",
            "open": "123",
            "high": "128",
            "low": "118",
            "close": "124",
            "volume": "10",
        }
    ]


def test_group_runner_actions_groups_by_candle_index() -> None:
    grouped = group_runner_actions(
        [
            {"candleIndex": 1, "actions": [{"kind": "buy_market", "percent": 50}]},
            {"candleIndex": 1, "actions": [{"kind": "close_position"}]},
        ]
    )

    assert grouped == {
        1: [
            {"kind": "buy_market", "percent": 50},
            {"kind": "close_position"},
        ]
    }


def test_action_mapper_maps_supported_actions() -> None:
    mapper = PaperStrategyActionMapper()

    buy = mapper.map_action({"kind": "buy_market", "percent": 50})
    buy_quote = mapper.map_action({"kind": "buy_market", "quote_amount": "125.5"})
    sell = mapper.map_action({"kind": "sell_market", "percent": "100"})
    sell_quantity = mapper.map_action({"kind": "sell_market", "base_amount": "0.25"})
    close = mapper.map_action({"kind": "close_position"})

    assert buy is not None and buy.kind == "buy_market" and buy.percent == Decimal("50")
    assert buy_quote is not None and buy_quote.quote_amount == Decimal("125.5")
    assert sell is not None and sell.kind == "sell_market" and sell.percent == Decimal("100")
    assert sell_quantity is not None and sell_quantity.quantity == Decimal("0.25")
    assert close is not None and close.kind == "close_position"


def test_action_mapper_records_unsupported_actions_without_crashing() -> None:
    mapper = PaperStrategyActionMapper()

    mapped = mapper.map_action({"kind": "limit_buy", "price": "100"})

    assert mapped is None
    assert mapper.warnings == [
        {"reasonCode": "paper_strategy_action_unsupported", "kind": "limit_buy", "candleIndex": None}
    ]


def test_summarize_strategy_logs_bounds_and_sanitizes_payload() -> None:
    logs = [
        {"message": "m" * 240, "payload": {"apiSecret": "hidden", "fast": 9}, "symbol": "BTCUSDT"},
        {"message": "second", "payload": {}},
        {"message": "third", "payload": {}},
        {"message": "fourth", "payload": {}},
        {"message": "fifth", "payload": {}},
        {"message": "sixth", "payload": {}},
    ]

    summary = summarize_strategy_logs(logs, warnings=[{"reasonCode": "paper_strategy_action_unsupported"}])

    assert summary["strategyRuntime"] == "subprocess_one_shot"
    assert summary["strategyLogCount"] == 6
    assert len(summary["strategyLogPreview"]) == 5
    assert summary["strategyLogPreview"][0]["message"].endswith("...")
    assert summary["strategyLogPreview"][0]["payload"]["apiSecret"] == "[REDACTED]"
    assert summary["strategyActionWarnings"] == [{"reasonCode": "paper_strategy_action_unsupported"}]


def test_provider_prepare_runs_subprocess_once_and_caches_actions() -> None:
    calls: list[dict[str, object]] = []

    def fake_runner(**kwargs):
        calls.append(kwargs)
        return StrategyRunnerResult(
            success=True,
            returncode=0,
            stdout="{}",
            stderr="",
            payload={
                "status": "ok",
                "actions": [{"candleIndex": 0, "actions": [{"kind": "buy_market", "percent": 50}]}],
                "logs": [{"message": "cross", "payload": {"fast": 9}}],
            },
        )

    provider = SubprocessPaperStrategySignalProvider(
        source_snapshot=_source_snapshot(),
        runner=fake_runner,
    )
    context = _context()

    prepare_result = provider.prepare(context)
    actions = provider.actions_for_candle(context, context.candles[:1], 0)

    assert len(calls) == 1
    assert calls[0]["strategy_source"].startswith("def on_candle")
    assert calls[0]["symbol"] == "BTCUSDT"
    assert calls[0]["timeframe"] == "1h"
    assert calls[0]["config"] == {"feeBps": "0", "slippageBps": "0"}
    assert actions[0].kind == "buy_market"
    assert actions[0].percent == Decimal("50")
    assert prepare_result.audit_metadata["strategyLogCount"] == 1


def test_provider_timeout_raises_controlled_error() -> None:
    def fake_runner(**kwargs):
        return StrategyRunnerResult(
            success=False,
            returncode=-1,
            stdout="",
            stderr="",
            timed_out=True,
            error_message="timeout apiSecret=hidden",
        )

    provider = SubprocessPaperStrategySignalProvider(source_snapshot=_source_snapshot(), runner=fake_runner)

    with pytest.raises(PaperStrategyRuntimeError) as exc_info:
        provider.prepare(_context())

    assert exc_info.value.reason_code == "paper_engine_strategy_timeout"
    assert exc_info.value.error_message == "[REDACTED]"


def test_provider_runner_error_raises_sanitized_controlled_error() -> None:
    def fake_runner(**kwargs):
        return StrategyRunnerResult(
            success=False,
            returncode=1,
            stdout="",
            stderr="{}",
            error_payload={"error": {"type": "RuntimeError", "message": "boom token=hidden"}},
            error_message="boom token=hidden",
        )

    provider = SubprocessPaperStrategySignalProvider(source_snapshot=_source_snapshot(), runner=fake_runner)

    with pytest.raises(PaperStrategyRuntimeError) as exc_info:
        provider.prepare(_context())

    assert exc_info.value.reason_code == "paper_engine_strategy_error"
    assert exc_info.value.error_message == "[REDACTED]"
