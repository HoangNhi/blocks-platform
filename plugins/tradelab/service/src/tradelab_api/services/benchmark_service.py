from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from tradelab_api.db.models import BenchmarkRunCheck

from .benchmark_fingerprints import (
    build_benchmark_input_fingerprint,
    build_benchmark_result_fingerprint,
    dataset_key_for_run,
)
from .benchmark_repository import BenchmarkRepository
from .run_repository import RunRepository

@dataclass(slots=True)
class BenchmarkService:
    run_repository: RunRepository
    benchmark_repository: BenchmarkRepository

    def start_repeat_benchmark(self, baseline_run_id: UUID, *, created_by: str | None = None) -> BenchmarkRunCheck:
        baseline = self.run_repository.get_bot_run(baseline_run_id)
        if baseline is None:
            raise ValueError("Baseline run not found.")
        if baseline.status != "completed":
            raise ValueError("Baseline run must be completed before benchmark repeat.")
        if not baseline.dataset_context:
            raise ValueError("Baseline run has no dataset context.")

        input_fingerprint = build_benchmark_input_fingerprint(baseline)
        result_fingerprint = self._result_fingerprint(baseline.id)
        repeat = self.run_repository.create_bot_run(
            bot_id=baseline.bot_id,
            strategy_id=baseline.strategy_id,
            strategy_version_id=baseline.strategy_version_id,
            run_type="benchmark_repeat",
            status="queued",
            exchange=baseline.exchange,
            symbol=baseline.symbol,
            timeframe=baseline.timeframe,
            start_at=baseline.start_at,
            end_at=baseline.end_at,
            started_at=None,
            finished_at=None,
            runtime_config=dict(baseline.runtime_config or {}),
            risk_config=dict(baseline.risk_config or {}),
            source_snapshot=dict(baseline.source_snapshot or {}),
            dataset_context=dict(baseline.dataset_context or {}),
            pipeline_context={
                **dict(baseline.pipeline_context or {}),
                "benchmark": {
                    "baselineRunId": str(baseline.id),
                    "inputFingerprint": input_fingerprint,
                },
            },
            pipeline_status="queued",
            data_job_id=None,
            error_message=None,
            created_by=created_by or "trade-lab",
        )
        repeat_input_fingerprint = build_benchmark_input_fingerprint(repeat)
        return self.benchmark_repository.create_check(
            baseline_run_id=baseline.id,
            repeat_run_id=repeat.id,
            strategy_id=baseline.strategy_id,
            strategy_version_id=baseline.strategy_version_id,
            dataset_key=dataset_key_for_run(baseline),
            input_fingerprint=input_fingerprint,
            repeat_input_fingerprint=repeat_input_fingerprint,
            input_match=input_fingerprint == repeat_input_fingerprint,
            result_fingerprint=result_fingerprint,
            repeat_result_fingerprint=None,
            result_match=None,
            tolerance_policy={"mode": "exact"},
            metric_diffs={},
            status="running",
            created_by=created_by or "trade-lab",
        )

    def finalize_for_run(self, repeat_run_id: UUID) -> BenchmarkRunCheck | None:
        check = self.benchmark_repository.get_for_repeat_run(repeat_run_id)
        if check is None:
            return None
        repeat = self.run_repository.get_bot_run(repeat_run_id)
        if repeat is None:
            check.status = "failed"
            check.error_message = "Repeat run not found."
            return check
        if repeat.status != "completed":
            check.status = "failed"
            check.error_message = repeat.error_message or "Repeat run did not complete."
            return check
        repeat_result_fingerprint = self._result_fingerprint(repeat.id)
        check.repeat_input_fingerprint = build_benchmark_input_fingerprint(repeat)
        check.input_match = check.input_fingerprint == check.repeat_input_fingerprint
        check.repeat_result_fingerprint = repeat_result_fingerprint
        check.result_match = check.result_fingerprint == repeat_result_fingerprint
        check.metric_diffs = self._metric_diffs(check.baseline_run_id, repeat.id)
        check.status = "matched" if check.input_match and check.result_match else "mismatched"
        check.error_message = None
        return check

    def _result_fingerprint(self, run_id: UUID) -> str:
        result = self.run_repository.get_bot_run_result(run_id)
        trades = self.run_repository.list_bot_run_trades(run_id)
        return build_benchmark_result_fingerprint(result=result, trades=trades)

    def _metric_diffs(self, baseline_run_id: UUID, repeat_run_id: UUID) -> dict[str, Any]:
        baseline = self.run_repository.get_bot_run_result(baseline_run_id)
        repeat = self.run_repository.get_bot_run_result(repeat_run_id)
        if baseline is None or repeat is None:
            return {}
        keys = ["final_equity", "total_return_pct", "max_drawdown_pct", "total_trades"]
        return {
            key: {
                "baseline": _json_safe_metric_value(getattr(baseline, key, None)),
                "repeat": _json_safe_metric_value(getattr(repeat, key, None)),
                "match": getattr(baseline, key, None) == getattr(repeat, key, None),
            }
            for key in keys
        }

def _json_safe_metric_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return value
