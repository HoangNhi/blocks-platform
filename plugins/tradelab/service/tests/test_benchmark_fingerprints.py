from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

from tradelab_api.services.benchmark_fingerprints import (
    build_benchmark_input_fingerprint,
    build_benchmark_result_fingerprint,
    canonical_json,
)

def test_canonical_json_sorts_keys_and_normalizes_decimal() -> None:
    assert canonical_json({"b": Decimal("2.0"), "a": {"z": 1, "y": None}}) == '{"a":{"y":null,"z":1},"b":"2.0"}'

def test_input_fingerprint_ignores_run_id_and_captured_at() -> None:
    strategy_version_id = uuid4()
    run_a = SimpleNamespace(
        id=uuid4(),
        strategy_version_id=strategy_version_id,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        start_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        end_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
        runtime_config={"feeBps": 1, "nested": {"b": 2, "a": 1}},
        risk_config={"maxOrderPercent": 25},
        source_snapshot={"sourceHash": "abc", "capturedAt": "2026-01-01T01:00:00Z"},
        dataset_context={
            "datasetKey": "binance:BTCUSDT:1h",
            "coverage": {
                "coveredStartAt": "2026-01-01T00:00:00Z",
                "coveredEndAt": "2026-01-02T00:00:00Z",
                "segmentCount": 1,
                "gapCount": 0,
                "healthStatus": "healthy",
            },
        },
    )
    run_b = SimpleNamespace(
        **{
            **run_a.__dict__,
            "id": uuid4(),
            "source_snapshot": {"sourceHash": "abc", "capturedAt": "2026-01-01T02:00:00Z"},
        }
    )

    assert build_benchmark_input_fingerprint(run_a) == build_benchmark_input_fingerprint(run_b)

def test_result_fingerprint_uses_metrics_and_trade_summary() -> None:
    result = SimpleNamespace(
        total_trades=2,
        final_equity=Decimal("1010.50"),
        total_return_pct=Decimal("1.05"),
        max_drawdown_pct=Decimal("0.25"),
        metrics={"closedTrades": 2, "realizedPnl": 10.5},
    )
    trades = [
        SimpleNamespace(
            entry_time=datetime(2026, 1, 1, tzinfo=timezone.utc),
            exit_time=datetime(2026, 1, 1, 3, tzinfo=timezone.utc),
            side="buy",
            quantity=Decimal("0.1"),
            entry_price=Decimal("100"),
            exit_price=Decimal("110"),
            pnl=Decimal("1.0"),
        )
    ]

    assert build_benchmark_result_fingerprint(result=result, trades=trades)
