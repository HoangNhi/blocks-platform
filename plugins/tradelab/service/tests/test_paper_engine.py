from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from tradelab_api.services.paper_engine import (
    PaperEngineAction,
    PaperEngineCandle,
    PaperEngineInitialPortfolioState,
    PaperEngineRunner,
    PaperEngineSession,
    PaperExecutionContext,
    PaperSimulationCore,
)


def _dt(hour: int) -> datetime:
    return datetime(2026, 1, 1, hour, tzinfo=timezone.utc)


def _candles(count: int = 4) -> list[PaperEngineCandle]:
    prices = [Decimal("100"), Decimal("110"), Decimal("120"), Decimal("60"), Decimal("70")]
    candles: list[PaperEngineCandle] = []
    for index in range(count):
        open_time = _dt(index)
        close_time = open_time + timedelta(hours=1)
        price = prices[index]
        candles.append(
            PaperEngineCandle(
                candle_id=f"candle-{index}",
                open_time=open_time,
                close_time=close_time,
                open=price,
                high=price + Decimal("5"),
                low=price - Decimal("5"),
                close=price,
                volume=Decimal("10"),
            )
        )
    return candles


def _session(
    *,
    status: str = "queued",
    candles: list[PaperEngineCandle] | None = None,
    starting_cash: Decimal = Decimal("1000"),
    fee_bps: Decimal = Decimal("0"),
    slippage_bps: Decimal = Decimal("0"),
    runtime_config: dict[str, object] | None = None,
) -> PaperEngineSession:
    return PaperEngineSession(
        session_id="paper-session-1",
        status=status,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        dataset_key="binance:BTCUSDT:1h",
        start_at=_dt(0),
        end_at=_dt(4),
        starting_cash=starting_cash,
        candles=candles if candles is not None else _candles(),
        fee_bps=fee_bps,
        slippage_bps=slippage_bps,
        runtime_config=runtime_config or {},
        strategy_metadata={},
        actor="unit-test",
        correlation_id="correlation-1",
        request_id="request-1",
    )


class FakeSessionSource:
    def __init__(self, sessions: list[PaperEngineSession]) -> None:
        self.sessions = sessions
        self.transitions: list[tuple[str, str]] = []

    def has_running_session(self) -> bool:
        return any(session.status == "running" for session in self.sessions)

    def claim_next_queued_session(self) -> PaperEngineSession | None:
        for index, session in enumerate(self.sessions):
            if session.status == "queued":
                claimed = replace(session, status="running")
                self.sessions[index] = claimed
                self.transitions.append((session.status, "running"))
                return claimed
        return None

    def mark_terminal(
        self,
        session_id: str,
        status: str,
        reason_code: str,
        error_message: str | None = None,
    ) -> None:
        for index, session in enumerate(self.sessions):
            if session.session_id == session_id:
                self.sessions[index] = replace(
                    session,
                    status=status,
                    reason_code=reason_code,
                    error_message=error_message,
                )
                self.transitions.append(("running", status))
                return
        raise AssertionError(f"Unknown session {session_id}")


class FakeStrategyProvider:
    def __init__(
        self,
        actions_by_index: dict[int, list[PaperEngineAction]] | None = None,
        error_at_index: int | None = None,
    ) -> None:
        self.actions_by_index = actions_by_index or {}
        self.error_at_index = error_at_index
        self.history_lengths: list[int] = []

    def actions_for_candle(self, context, candle_history, candle_index):
        self.history_lengths.append(len(candle_history))
        if self.error_at_index == candle_index:
            raise RuntimeError("strategy failed with apiSecret=super-secret-value")
        return self.actions_by_index.get(candle_index, [])


class FakeCancelProvider:
    def __init__(self, *, cancel_after_checks: int | None = None, kill_switch: bool = False) -> None:
        self.cancel_after_checks = cancel_after_checks
        self.kill_switch = kill_switch
        self.checks = 0

    def should_cancel(self, session_id: str) -> bool:
        self.checks += 1
        return self.cancel_after_checks is not None and self.checks > self.cancel_after_checks

    def kill_switch_enabled(self) -> bool:
        return self.kill_switch


class FakeArtifactWriter:
    def __init__(self, *, fail: bool = False) -> None:
        self.fail = fail
        self.results = []

    def write(self, result):
        if self.fail:
            raise RuntimeError("writer failed")
        self.results.append(result)


def test_paper_engine_core_resumes_from_initial_portfolio_and_attempt_number() -> None:
    provider = FakeStrategyProvider({})
    cancel_provider = FakeCancelProvider()
    core = PaperSimulationCore(
        strategy_provider=provider,
        cancel_provider=cancel_provider,
        safety_status="test-safety",
    )
    context = PaperExecutionContext(
        session_id="11111111-1111-1111-1111-111111111111",
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        dataset_key="binance:BTCUSDT:1h",
        start_at=_dt(0),
        end_at=_dt(4),
        starting_cash=Decimal("10000"),
        candles=[_candles(3)[2]],
        max_candles_per_tick=10000,
        fee_bps=Decimal("0"),
        slippage_bps=Decimal("0"),
        runtime_config={},
        strategy_metadata={},
        actor="pytest",
        worker_id="pytest-worker",
        correlation_id=None,
        request_id=None,
        attempt_no=1,
        initial_portfolio=PaperEngineInitialPortfolioState(
            cash=Decimal("9000"),
            quantity=Decimal("0.5"),
            average_entry_price=Decimal("100"),
            realized_pnl=Decimal("10"),
            fees_paid=Decimal("1"),
            peak_equity=Decimal("10050"),
            max_drawdown_pct=Decimal("0.5"),
        ),
        execution_start_index=0,
    )

    result = core.run(context)

    assert result.status == "completed"
    assert result.candles_processed == 1
    assert result.ending_cash == Decimal("9000")
    assert result.ending_equity == Decimal("9060.0")
    assert result.artifacts.positions[0].quantity == Decimal("0.5")
    assert result.artifacts.positions[0].average_entry_price == Decimal("100")
    assert result.artifacts.positions[0].realized_pnl == Decimal("10")
    assert all(":attempt:1:" in artifact.artifact_key for artifact in result.artifacts.snapshots)


def _runner(
    sessions: list[PaperEngineSession],
    strategy_provider: FakeStrategyProvider | None = None,
    cancel_provider: FakeCancelProvider | None = None,
    writer: FakeArtifactWriter | None = None,
) -> tuple[PaperEngineRunner, FakeSessionSource, FakeArtifactWriter]:
    source = FakeSessionSource(sessions)
    artifact_writer = writer or FakeArtifactWriter()
    runner = PaperEngineRunner(
        session_source=source,
        strategy_provider=strategy_provider or FakeStrategyProvider(),
        cancel_provider=cancel_provider or FakeCancelProvider(),
        artifact_writer=artifact_writer,
        worker_id="unit-worker",
    )
    return runner, source, artifact_writer


def test_tick_returns_idle_when_no_queued_session() -> None:
    runner, source, writer = _runner([])

    result = runner.tick()

    assert result.status == "idle"
    assert result.reason_code == "paper_engine_no_queued_session"
    assert result.session_id is None
    assert result.orders_created == 0
    assert result.fills_created == 0
    assert writer.results == []
    assert source.transitions == []


def test_tick_returns_busy_when_running_session_exists() -> None:
    runner, source, writer = _runner([_session(status="running")])

    result = runner.tick()

    assert result.status == "busy"
    assert result.reason_code == "paper_engine_already_running"
    assert result.session_id is None
    assert writer.results == []
    assert source.transitions == []


def test_happy_path_buy_and_sell_completes_with_next_candle_open_fills() -> None:
    strategy = FakeStrategyProvider(
        {
            0: [PaperEngineAction(kind="buy_market", quote_amount=Decimal("500"))],
            1: [PaperEngineAction(kind="sell_market", percent=Decimal("100"))],
        }
    )
    runner, source, writer = _runner([_session()], strategy)

    result = runner.tick()

    assert result.status == "completed"
    assert result.reason_code == "paper_engine_completed"
    assert [transition[1] for transition in source.transitions] == ["running", "completed"]
    assert strategy.history_lengths[:2] == [1, 2]
    assert len(result.artifacts.orders) == 2
    assert len(result.artifacts.fills) == 2
    assert [order.order_key for order in result.artifacts.orders] == ["order-0", "order-1"]
    assert [fill.order_key for fill in result.artifacts.fills] == ["order-0", "order-1"]
    assert result.artifacts.fills[0].price == Decimal("110")
    assert result.artifacts.fills[1].price == Decimal("120")
    assert len(result.artifacts.snapshots) == len(_candles()) + len(result.artifacts.fills)
    assert writer.results == [result]


def test_engine_emits_attempt_aware_artifact_keys() -> None:
    session = _session(starting_cash=Decimal("1000"))
    provider = FakeStrategyProvider(
        actions_by_index={0: [PaperEngineAction(kind="buy_market", quote_amount=Decimal("100"))]}
    )
    runner, source, writer = _runner([session], provider)

    result = runner.tick()

    order = result.artifacts.orders[0]
    snapshot = result.artifacts.snapshots[0]
    audit = result.artifacts.audits[0]

    assert source.transitions[-1] == ("running", "completed")
    assert writer.results == [result]
    assert order.artifact_key == (
        f"paper:{session.session_id}:attempt:0:candle:{order.candle_id}:kind:order:seq:0"
    )
    assert snapshot.artifact_key == (
        f"paper:{session.session_id}:attempt:0:candle:{snapshot.source_candle_id}:kind:snapshot:seq:0"
    )
    assert audit.artifact_key == f"paper:{session.session_id}:attempt:0:candle:session:kind:audit:seq:0"


def test_fee_and_slippage_change_fill_price_fee_and_equity() -> None:
    strategy = FakeStrategyProvider({0: [PaperEngineAction(kind="buy_market", quote_amount=Decimal("500"))]})
    runner, _, _ = _runner(
        [
            _session(
                candles=_candles(2),
                fee_bps=Decimal("100"),
                slippage_bps=Decimal("100"),
            )
        ],
        strategy,
    )

    result = runner.tick()

    fill = result.artifacts.fills[0]
    assert fill.price == Decimal("111.10")
    assert fill.fee_amount > Decimal("0")
    assert result.ending_equity < Decimal("1000")


def test_insufficient_cash_rejects_order_without_fill() -> None:
    strategy = FakeStrategyProvider({0: [PaperEngineAction(kind="buy_market", quote_amount=Decimal("2000"))]})
    runner, _, _ = _runner([_session(starting_cash=Decimal("100"))], strategy)

    result = runner.tick()

    assert result.status == "completed"
    assert result.artifacts.orders[0].status == "rejected"
    assert result.artifacts.orders[0].reason_code == "paper_insufficient_cash"
    assert result.artifacts.fills == []


def test_insufficient_position_rejects_sell_without_fill() -> None:
    strategy = FakeStrategyProvider({0: [PaperEngineAction(kind="sell_market", quantity=Decimal("1"))]})
    runner, _, _ = _runner([_session()], strategy)

    result = runner.tick()

    assert result.artifacts.orders[0].status == "rejected"
    assert result.artifacts.orders[0].reason_code == "paper_insufficient_position"
    assert result.artifacts.fills == []


def test_unsupported_action_rejects_order_with_machine_readable_reason() -> None:
    strategy = FakeStrategyProvider({0: [PaperEngineAction(kind="limit_buy", quote_amount=Decimal("100"))]})
    runner, _, _ = _runner([_session()], strategy)

    result = runner.tick()

    assert result.artifacts.orders[0].status == "rejected"
    assert result.artifacts.orders[0].reason_code == "paper_order_type_not_supported"
    assert result.artifacts.orders[0].order_key == "order-0"


def test_missing_next_candle_rejects_order_without_fill() -> None:
    strategy = FakeStrategyProvider({0: [PaperEngineAction(kind="buy_market", quote_amount=Decimal("100"))]})
    runner, _, _ = _runner([_session(candles=_candles(1))], strategy)

    result = runner.tick()

    assert result.artifacts.orders[0].status == "rejected"
    assert result.artifacts.orders[0].reason_code == "paper_no_next_candle_for_fill"
    assert result.artifacts.fills == []


def test_candle_cap_exceeded_fails_before_artifacts() -> None:
    runner, source, writer = _runner([_session(candles=_candles(4))])

    result = runner.tick(max_candles_per_tick=2)

    assert result.status == "failed"
    assert result.reason_code == "paper_engine_candle_cap_exceeded"
    assert result.artifacts.orders == []
    assert result.artifacts.fills == []
    assert result.artifacts.snapshots == []
    assert writer.results == [result]
    assert source.transitions[-1] == ("running", "failed")


def test_strategy_provider_error_fails_and_sanitizes_error_message() -> None:
    strategy = FakeStrategyProvider(
        {0: [PaperEngineAction(kind="buy_market", quote_amount=Decimal("100"))]},
        error_at_index=1,
    )
    runner, _, _ = _runner([_session(runtime_config={"apiSecret": "super-secret-value"})], strategy)

    result = runner.tick()

    assert result.status == "failed"
    assert result.reason_code == "paper_engine_strategy_error"
    assert "super-secret-value" not in repr(result)
    assert "apiSecret" in repr(result)
    assert "[REDACTED]" in repr(result)
    assert len(result.artifacts.orders) == 1


def test_cancel_checkpoint_cancels_and_keeps_partial_artifacts() -> None:
    strategy = FakeStrategyProvider({0: [PaperEngineAction(kind="buy_market", quote_amount=Decimal("100"))]})
    runner, source, _ = _runner([_session()], strategy, FakeCancelProvider(cancel_after_checks=1))

    result = runner.tick()

    assert result.status == "cancelled"
    assert result.reason_code == "paper_session_cancel_requested"
    assert len(result.artifacts.orders) == 1
    assert len(result.artifacts.snapshots) >= 1
    assert source.transitions[-1] == ("running", "cancelled")


def test_kill_switch_cancels_before_simulation() -> None:
    strategy = FakeStrategyProvider({0: [PaperEngineAction(kind="buy_market", quote_amount=Decimal("100"))]})
    runner, _, _ = _runner([_session()], strategy, FakeCancelProvider(kill_switch=True))

    result = runner.tick()

    assert result.status == "cancelled"
    assert result.reason_code == "paper_kill_switch_enabled"
    assert result.artifacts.orders == []
    assert result.artifacts.fills == []


def test_artifact_writer_error_fails_with_machine_readable_reason() -> None:
    strategy = FakeStrategyProvider({0: [PaperEngineAction(kind="buy_market", quote_amount=Decimal("100"))]})
    runner, _, writer = _runner([_session()], strategy, writer=FakeArtifactWriter(fail=True))

    result = runner.tick()

    assert result.status == "failed"
    assert result.reason_code == "paper_engine_artifact_write_failed"
    assert writer.results == []

def test_empty_candle_session_fails_with_machine_readable_reason() -> None:
    runner, source, writer = _runner([_session(candles=[])])

    result = runner.tick()

    assert result.status == "failed"
    assert result.reason_code == "paper_engine_no_candles"
    assert result.candles_processed == 0
    assert result.artifacts.orders == []
    assert result.artifacts.fills == []
    assert result.artifacts.snapshots == []
    assert writer.results == [result]
    assert source.transitions[-1] == ("running", "failed")

def test_runner_can_override_safety_status_for_local_tick() -> None:
    source = FakeSessionSource([_session(candles=_candles(1))])
    writer = FakeArtifactWriter()
    runner = PaperEngineRunner(
        session_source=source,
        strategy_provider=FakeStrategyProvider(),
        cancel_provider=FakeCancelProvider(),
        artifact_writer=writer,
        worker_id="local-worker",
        safety_status="local_dev_paper_engine_tick",
    )

    result = runner.tick()

    assert result.status == "completed"
    assert result.reason_code == "paper_engine_completed"
    assert result.safety_status == "local_dev_paper_engine_tick"
    assert writer.results == [result]

class PreparingStrategyProvider:
    def __init__(self, actions_by_index=None, audit_metadata=None, error=None):
        self.actions_by_index = actions_by_index or {}
        self.audit_metadata = audit_metadata or {"strategyRuntime": "subprocess_one_shot", "strategyLogCount": 1}
        self.error = error
        self.prepare_calls = 0

    def prepare(self, context):
        self.prepare_calls += 1
        if self.error is not None:
            raise self.error
        from tradelab_api.services.paper_strategy_adapter import PaperStrategyPrepareResult

        return PaperStrategyPrepareResult(audit_metadata=self.audit_metadata)

    def actions_for_candle(self, context, candle_history, candle_index):
        return self.actions_by_index.get(candle_index, [])

def test_runner_calls_strategy_provider_prepare_before_core_run() -> None:
    session = _session(candles=_candles(3))
    provider = PreparingStrategyProvider(actions_by_index={0: [PaperEngineAction(kind="buy_market", percent=Decimal("50"))]})
    writer = FakeArtifactWriter()
    runner, source, writer = _runner(
        [session],
        strategy_provider=provider,
        cancel_provider=FakeCancelProvider(),
        writer=writer,
    )

    result = runner.tick(max_candles_per_tick=10000)

    assert provider.prepare_calls == 1
    assert result.status == "completed"
    assert any(audit.action == "paper_strategy_runtime_prepared" for audit in result.artifacts.audits)
    prepared_audit = [audit for audit in result.artifacts.audits if audit.action == "paper_strategy_runtime_prepared"][0]
    assert prepared_audit.metadata["strategyRuntime"] == "subprocess_one_shot"
    assert writer.results[0].orders_created == 1

def test_runner_prepare_error_fails_session_before_writer() -> None:
    from tradelab_api.services.paper_strategy_adapter import PaperStrategyRuntimeError

    session = _session(candles=_candles(3))
    provider = PreparingStrategyProvider(error=PaperStrategyRuntimeError("paper_engine_strategy_timeout", "timeout"))
    writer = FakeArtifactWriter()
    runner, source, writer = _runner(
        [session],
        strategy_provider=provider,
        cancel_provider=FakeCancelProvider(),
        writer=writer,
    )

    result = runner.tick(max_candles_per_tick=10000)

    assert result.status == "failed"
    assert result.reason_code == "paper_engine_strategy_timeout"
    assert result.error_message == "timeout"
    assert result.candles_processed == 0
    assert writer.results[0].status == "failed"
    assert source.sessions[0].status == "failed"
    assert source.sessions[0].reason_code == "paper_engine_strategy_timeout"
    assert source.sessions[0].error_message == "timeout"
