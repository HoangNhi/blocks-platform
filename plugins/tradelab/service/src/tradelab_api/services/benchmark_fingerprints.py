from __future__ import annotations

import hashlib
import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any

def canonical_json(value: Any) -> str:
    return json.dumps(_normalize(value), sort_keys=True, separators=(",", ":"), ensure_ascii=False)

def sha256_fingerprint(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()

def build_benchmark_input_payload(run: Any) -> dict[str, Any]:
    source_snapshot = dict(getattr(run, "source_snapshot", {}) or {})
    return {
        "strategyVersionId": str(getattr(run, "strategy_version_id")),
        "sourceHash": source_snapshot.get("sourceHash") or source_snapshot.get("source_hash"),
        "runtimeConfig": getattr(run, "runtime_config", {}) or {},
        "riskConfig": getattr(run, "risk_config", {}) or {},
        "exchange": getattr(run, "exchange"),
        "symbol": getattr(run, "symbol"),
        "timeframe": getattr(run, "timeframe"),
        "startAt": getattr(run, "start_at"),
        "endAt": getattr(run, "end_at"),
        "datasetKey": dataset_key_for_run(run),
        "coverage": _coverage_snapshot(getattr(run, "dataset_context", {}) or {}),
    }

def build_benchmark_input_fingerprint(run: Any) -> str:
    return sha256_fingerprint(build_benchmark_input_payload(run))

def build_benchmark_result_payload(*, result: Any | None, trades: list[Any]) -> dict[str, Any]:
    if result is None:
        return {"status": "missing_result", "metrics": {}, "trades": []}
    metrics = dict(getattr(result, "metrics", {}) or {})
    return {
        "status": "completed",
        "totalTrades": getattr(result, "total_trades", metrics.get("totalTrades", metrics.get("total_trades", 0))),
        "finalEquity": getattr(result, "final_equity", None),
        "totalReturnPct": getattr(result, "total_return_pct", None),
        "maxDrawdownPct": getattr(result, "max_drawdown_pct", None),
        "metrics": metrics,
        "trades": [_trade_signature(trade) for trade in trades],
    }

def build_benchmark_result_fingerprint(*, result: Any | None, trades: list[Any]) -> str:
    return sha256_fingerprint(build_benchmark_result_payload(result=result, trades=trades))

def dataset_key_for_run(run: Any) -> str:
    dataset_context = getattr(run, "dataset_context", {}) or {}
    return (
        dataset_context.get("datasetKey")
        or dataset_context.get("dataset_key")
        or f"{getattr(run, 'exchange')}:{getattr(run, 'symbol')}:{getattr(run, 'timeframe')}"
    )

def _coverage_snapshot(dataset_context: dict[str, Any]) -> dict[str, Any]:
    coverage = dataset_context.get("coverage") or {}
    return {
        "coveredStartAt": coverage.get("coveredStartAt") or coverage.get("covered_start_at"),
        "coveredEndAt": coverage.get("coveredEndAt") or coverage.get("covered_end_at"),
        "segmentCount": coverage.get("segmentCount") if coverage.get("segmentCount") is not None else coverage.get("segment_count", 0),
        "gapCount": coverage.get("gapCount") if coverage.get("gapCount") is not None else coverage.get("gap_count", 0),
        "healthStatus": coverage.get("healthStatus") or coverage.get("health_status"),
    }

def _trade_signature(trade: Any) -> dict[str, Any]:
    return {
        "entryTime": getattr(trade, "entry_time", None),
        "exitTime": getattr(trade, "exit_time", None),
        "side": getattr(trade, "side", None),
        "quantity": getattr(trade, "quantity", None),
        "entryPrice": getattr(trade, "entry_price", None),
        "exitPrice": getattr(trade, "exit_price", None),
        "pnl": getattr(trade, "pnl", None),
    }

def _normalize(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, dict):
        return {str(key): _normalize(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_normalize(item) for item in value]
    return value
