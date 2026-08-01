from __future__ import annotations

import json
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

from tradelab_api.db.models import BenchmarkRunCheck
from tradelab_api.services.benchmark_repository import BenchmarkRepository
from tradelab_api.services.benchmark_service import BenchmarkService

class FakeSession:
    def __init__(self) -> None:
        self.items: list[BenchmarkRunCheck] = []

    def add(self, item) -> None:  # noqa: ANN001
        self.items.append(item)

    def flush(self) -> None:
        return None

    def refresh(self, item) -> None:  # noqa: ANN001
        return None

    def query(self, model):  # noqa: ANN001
        return FakeQuery(self.items)

class FakeQuery:
    def __init__(self, items: list[BenchmarkRunCheck]) -> None:
        self.items = items

    def filter(self, *args):  # noqa: ANN002
        return self

    def order_by(self, *args):  # noqa: ANN002
        return self

    def first(self):
        return self.items[0] if self.items else None

    def all(self):
        return self.items

class FakeRunRepository:
    def __init__(self) -> None:
        self.created_fields: dict[str, object] | None = None
        self.baseline = SimpleNamespace(
            id=uuid4(),
            bot_id=uuid4(),
            strategy_id=uuid4(),
            strategy_version_id=uuid4(),
            run_type="backtest",
            status="completed",
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            start_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            end_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
            runtime_config={"initialEquity": 1000},
            risk_config={"maxOrderPercent": 25},
            source_snapshot={"sourceHash": "abc"},
            dataset_context={
                "datasetKey": "binance:BTCUSDT:1h",
                "coverage": {"healthStatus": "healthy", "segmentCount": 1, "gapCount": 0},
            },
            pipeline_context={"preflight": {"outcome": "ready"}},
            pipeline_status="completed",
            data_job_id=None,
            error_message=None,
        )
        self.repeat = None

    def get_bot_run(self, run_id):  # noqa: ANN001
        if self.repeat is not None and run_id == self.repeat.id:
            return self.repeat
        return self.baseline if run_id == self.baseline.id else None

    def create_bot_run(self, **fields):  # noqa: ANN001
        self.created_fields = fields
        self.repeat = SimpleNamespace(id=uuid4(), **fields)
        return self.repeat

    def get_bot_run_result(self, run_id):  # noqa: ANN001
        return SimpleNamespace(
            total_trades=0,
            final_equity=Decimal("1000.00"),
            total_return_pct=Decimal("0.00"),
            max_drawdown_pct=Decimal("0.00"),
            metrics={},
        )

    def list_bot_run_trades(self, run_id):  # noqa: ANN001
        return []

def test_create_benchmark_check_sets_core_fields() -> None:
    session = FakeSession()
    repository = BenchmarkRepository(session)
    baseline_run_id = uuid4()
    strategy_id = uuid4()
    version_id = uuid4()

    check = repository.create_check(
        baseline_run_id=baseline_run_id,
        strategy_id=strategy_id,
        strategy_version_id=version_id,
        dataset_key="binance:BTCUSDT:1h",
        input_fingerprint="input-a",
        result_fingerprint="result-a",
        tolerance_policy={"mode": "exact"},
        created_by="trade-lab",
    )

    assert check in session.items
    assert check.baseline_run_id == baseline_run_id
    assert check.strategy_id == strategy_id
    assert check.strategy_version_id == version_id
    assert check.dataset_key == "binance:BTCUSDT:1h"
    assert check.input_fingerprint == "input-a"
    assert check.result_fingerprint == "result-a"
    assert check.tolerance_policy == {"mode": "exact"}
    assert check.status == "pending"
    assert check.created_by == "trade-lab"

def test_start_repeat_benchmark_creates_repeat_run_and_check() -> None:
    run_repository = FakeRunRepository()
    benchmark_repository = BenchmarkRepository(FakeSession())
    service = BenchmarkService(run_repository=run_repository, benchmark_repository=benchmark_repository)

    check = service.start_repeat_benchmark(run_repository.baseline.id, created_by="trade-lab")

    assert run_repository.created_fields is not None
    assert run_repository.created_fields["run_type"] == "benchmark_repeat"
    assert run_repository.created_fields["status"] == "queued"
    assert run_repository.created_fields["pipeline_status"] == "queued"
    assert run_repository.created_fields["runtime_config"] == run_repository.baseline.runtime_config
    assert check.baseline_run_id == run_repository.baseline.id
    assert check.repeat_run_id is not None
    assert check.status == "running"

def test_finalize_for_run_marks_matching_repeat() -> None:
    run_repository = FakeRunRepository()
    benchmark_repository = BenchmarkRepository(FakeSession())
    service = BenchmarkService(run_repository=run_repository, benchmark_repository=benchmark_repository)
    check = service.start_repeat_benchmark(run_repository.baseline.id, created_by="trade-lab")
    assert run_repository.repeat is not None
    run_repository.repeat.status = "completed"

    finalized = service.finalize_for_run(run_repository.repeat.id)

    assert finalized is check
    assert finalized.input_match is True
    assert finalized.result_match is True
    assert finalized.status == "matched"
    json.dumps(finalized.metric_diffs)
    assert finalized.metric_diffs["final_equity"]["baseline"] == "1000.00"
