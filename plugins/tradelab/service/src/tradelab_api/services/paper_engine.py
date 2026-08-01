from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import datetime
from decimal import Decimal
from typing import Protocol

ZERO = Decimal("0")
ONE_HUNDRED = Decimal("100")
BPS_DENOMINATOR = Decimal("10000")
DEFAULT_PAPER_ENGINE_SAFETY_STATUS = "pure_paper_engine_skeleton"


@dataclass(frozen=True)
class PaperEngineCandle:
    candle_id: str
    open_time: datetime
    close_time: datetime
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal


@dataclass(frozen=True)
class PaperEngineInitialPortfolioState:
    cash: Decimal
    quantity: Decimal = ZERO
    average_entry_price: Decimal | None = None
    realized_pnl: Decimal = ZERO
    fees_paid: Decimal = ZERO
    peak_equity: Decimal | None = None
    max_drawdown_pct: Decimal = ZERO


@dataclass(frozen=True)
class PaperEngineAction:
    kind: str
    percent: Decimal | None = None
    quote_amount: Decimal | None = None
    quantity: Decimal | None = None
    metadata: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class PaperEngineSession:
    session_id: str
    status: str
    exchange: str
    symbol: str
    timeframe: str
    dataset_key: str
    start_at: datetime
    end_at: datetime
    starting_cash: Decimal
    candles: list[PaperEngineCandle]
    fee_bps: Decimal = ZERO
    slippage_bps: Decimal = ZERO
    runtime_config: dict[str, object] = field(default_factory=dict)
    strategy_metadata: dict[str, object] = field(default_factory=dict)
    actor: str | None = None
    worker_id: str | None = None
    correlation_id: str | None = None
    request_id: str | None = None
    reason_code: str | None = None
    error_message: str | None = None
    attempt_no: int = 0
    initial_portfolio: PaperEngineInitialPortfolioState | None = None
    execution_start_index: int = 0


@dataclass(frozen=True)
class PaperExecutionContext:
    session_id: str
    exchange: str
    symbol: str
    timeframe: str
    dataset_key: str
    start_at: datetime
    end_at: datetime
    starting_cash: Decimal
    candles: list[PaperEngineCandle]
    max_candles_per_tick: int
    fee_bps: Decimal
    slippage_bps: Decimal
    runtime_config: dict[str, object]
    strategy_metadata: dict[str, object]
    actor: str | None
    worker_id: str
    correlation_id: str | None
    request_id: str | None
    attempt_no: int = 0
    initial_portfolio: PaperEngineInitialPortfolioState | None = None
    execution_start_index: int = 0


@dataclass(frozen=True)
class PaperEngineOrderArtifact:
    session_id: str
    order_key: str
    artifact_key: str
    candle_id: str | None
    action_kind: str
    side: str | None
    order_type: str
    status: str
    quantity: Decimal
    requested_notional: Decimal | None
    reason_code: str | None
    metadata: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class PaperEngineFillArtifact:
    session_id: str
    order_key: str
    artifact_key: str
    source_candle_id: str
    fill_time: datetime
    side: str
    price: Decimal
    quantity: Decimal
    notional: Decimal
    fee_amount: Decimal
    slippage_amount: Decimal
    metadata: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class PaperEnginePositionArtifact:
    session_id: str
    symbol: str
    status: str
    quantity: Decimal
    average_entry_price: Decimal | None
    realized_pnl: Decimal
    unrealized_pnl: Decimal


@dataclass(frozen=True)
class PaperEnginePortfolioSnapshotArtifact:
    session_id: str
    artifact_key: str
    source_candle_id: str | None
    snapshot_at: datetime
    cash_balance: Decimal
    equity: Decimal
    realized_pnl: Decimal
    unrealized_pnl: Decimal
    fees_paid: Decimal
    drawdown_pct: Decimal
    exposure_notional: Decimal
    metadata: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class PaperEngineAuditArtifact:
    session_id: str | None
    artifact_key: str
    action: str
    old_state: str | None
    new_state: str | None
    reason_code: str | None
    metadata: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class PaperEngineArtifacts:
    orders: list[PaperEngineOrderArtifact] = field(default_factory=list)
    fills: list[PaperEngineFillArtifact] = field(default_factory=list)
    positions: list[PaperEnginePositionArtifact] = field(default_factory=list)
    snapshots: list[PaperEnginePortfolioSnapshotArtifact] = field(default_factory=list)
    audits: list[PaperEngineAuditArtifact] = field(default_factory=list)


@dataclass(frozen=True)
class PaperEngineTickResult:
    status: str
    reason_code: str
    safety_status: str
    session_id: str | None = None
    candles_processed: int = 0
    orders_created: int = 0
    fills_created: int = 0
    snapshots_created: int = 0
    starting_cash: Decimal | None = None
    ending_cash: Decimal | None = None
    ending_equity: Decimal | None = None
    error_message: str | None = None
    artifacts: PaperEngineArtifacts = field(default_factory=PaperEngineArtifacts)


class PaperEngineSessionSource(Protocol):
    def has_running_session(self) -> bool: ...
    def claim_next_queued_session(self) -> PaperEngineSession | None: ...
    def mark_terminal(
        self,
        session_id: str,
        status: str,
        reason_code: str,
        error_message: str | None = None,
    ) -> None: ...


class StrategySignalProvider(Protocol):
    def actions_for_candle(
        self,
        context: PaperExecutionContext,
        candle_history: list[PaperEngineCandle],
        candle_index: int,
    ) -> list[PaperEngineAction]: ...


class PaperCancelProvider(Protocol):
    def should_cancel(self, session_id: str) -> bool: ...
    def kill_switch_enabled(self) -> bool: ...


class PaperArtifactWriter(Protocol):
    def write(self, result: PaperEngineTickResult) -> None: ...


class PaperEngineRunner:
    def __init__(
        self,
        *,
        session_source: PaperEngineSessionSource,
        strategy_provider: StrategySignalProvider,
        cancel_provider: PaperCancelProvider,
        artifact_writer: PaperArtifactWriter,
        worker_id: str,
        safety_status: str = DEFAULT_PAPER_ENGINE_SAFETY_STATUS,
    ) -> None:
        self.session_source = session_source
        self.strategy_provider = strategy_provider
        self.cancel_provider = cancel_provider
        self.artifact_writer = artifact_writer
        self.worker_id = worker_id
        self.safety_status = safety_status
        self.core = PaperSimulationCore(
            strategy_provider=strategy_provider,
            cancel_provider=cancel_provider,
            safety_status=safety_status,
        )

    def tick(self, *, max_candles_per_tick: int = 10000) -> PaperEngineTickResult:
        if self.session_source.has_running_session():
            return PaperEngineTickResult(
                status="busy",
                reason_code="paper_engine_already_running",
                safety_status=self.safety_status,
            )

        session = self.session_source.claim_next_queued_session()
        if session is None:
            return PaperEngineTickResult(
                status="idle",
                reason_code="paper_engine_no_queued_session",
                safety_status=self.safety_status,
            )

        context = _context_from_session(session, worker_id=self.worker_id, max_candles_per_tick=max_candles_per_tick)
        prepare_failure, prepare_metadata = _prepare_strategy_provider(self.strategy_provider, context, self.safety_status)
        if prepare_failure is not None:
            result = prepare_failure
        else:
            result = self.core.run(context)
            if prepare_metadata:
                result.artifacts.audits.append(
                    PaperEngineAuditArtifact(
                        session_id=context.session_id,
                        artifact_key=_artifact_key(
                            context,
                            candle_id=None,
                            kind="audit",
                            seq=len(result.artifacts.audits),
                        ),
                        action="paper_strategy_runtime_prepared",
                        old_state=None,
                        new_state=None,
                        reason_code="paper_strategy_runtime_prepared",
                        metadata=prepare_metadata,
                    )
                )
        try:
            self.artifact_writer.write(result)
        except Exception as exc:
            result = replace(
                result,
                status="failed",
                reason_code="paper_engine_artifact_write_failed",
                error_message=_sanitize_error(exc),
            )

        self.session_source.mark_terminal(
            context.session_id,
            result.status,
            result.reason_code,
            result.error_message,
        )
        return result


@dataclass
class _PaperPortfolio:
    cash: Decimal
    quantity: Decimal = ZERO
    average_entry_price: Decimal | None = None
    realized_pnl: Decimal = ZERO
    fees_paid: Decimal = ZERO
    peak_equity: Decimal | None = None
    max_drawdown_pct: Decimal = ZERO

    def equity(self, mark_price: Decimal) -> Decimal:
        return self.cash + self.quantity * mark_price

    def unrealized_pnl(self, mark_price: Decimal) -> Decimal:
        if self.average_entry_price is None:
            return ZERO
        return (mark_price - self.average_entry_price) * self.quantity

    def mark_to_market(self, mark_price: Decimal) -> Decimal:
        equity = self.equity(mark_price)
        if self.peak_equity is None or equity > self.peak_equity:
            self.peak_equity = equity
        if self.peak_equity and self.peak_equity > ZERO:
            drawdown = (self.peak_equity - equity) / self.peak_equity * ONE_HUNDRED
            if drawdown > self.max_drawdown_pct:
                self.max_drawdown_pct = drawdown
        return equity

    def buy(self, *, quantity: Decimal, price: Decimal, fee_amount: Decimal) -> None:
        notional = quantity * price
        old_cost = (self.average_entry_price or ZERO) * self.quantity
        new_quantity = self.quantity + quantity
        self.cash -= notional + fee_amount
        self.fees_paid += fee_amount
        self.quantity = new_quantity
        self.average_entry_price = (old_cost + notional) / new_quantity if new_quantity > ZERO else None

    def sell(self, *, quantity: Decimal, price: Decimal, fee_amount: Decimal) -> None:
        if quantity > self.quantity:
            raise ValueError("Cannot sell more than current position.")
        notional = quantity * price
        entry = self.average_entry_price or ZERO
        self.cash += notional - fee_amount
        self.fees_paid += fee_amount
        self.realized_pnl += (price - entry) * quantity - fee_amount
        self.quantity -= quantity
        if self.quantity <= ZERO:
            self.quantity = ZERO
            self.average_entry_price = None


class PaperSimulationCore:
    def __init__(
        self,
        *,
        strategy_provider: StrategySignalProvider,
        cancel_provider: PaperCancelProvider,
        safety_status: str = DEFAULT_PAPER_ENGINE_SAFETY_STATUS,
    ) -> None:
        self.strategy_provider = strategy_provider
        self.cancel_provider = cancel_provider
        self.safety_status = safety_status

    def run(self, context: PaperExecutionContext) -> PaperEngineTickResult:
        artifacts = PaperEngineArtifacts(
            audits=[
                PaperEngineAuditArtifact(
                    session_id=context.session_id,
                    artifact_key=_artifact_key_for_values(
                        session_id=context.session_id,
                        attempt_no=context.attempt_no,
                        candle_id=None,
                        kind="audit",
                        seq=0,
                    ),
                    action="paper_engine_tick_requested",
                    old_state="queued",
                    new_state="running",
                    reason_code=None,
                    metadata={"workerId": context.worker_id},
                ),
                PaperEngineAuditArtifact(
                    session_id=context.session_id,
                    artifact_key=_artifact_key_for_values(
                        session_id=context.session_id,
                        attempt_no=context.attempt_no,
                        candle_id=None,
                        kind="audit",
                        seq=1,
                    ),
                    action="paper_session_started",
                    old_state="queued",
                    new_state="running",
                    reason_code="paper_session_started",
                    metadata={
                        "datasetKey": context.dataset_key,
                        "runtimeConfig": context.runtime_config,
                        "strategyMetadata": context.strategy_metadata,
                    },
                ),
            ]
        )
        candles = sorted(context.candles, key=lambda candle: candle.open_time)
        if not candles:
            return _result(
                context,
                status="failed",
                reason_code="paper_engine_no_candles",
                safety_status=self.safety_status,
                portfolio=_portfolio_from_context(context),
                candles_processed=0,
                artifacts=_with_audit(
                    artifacts,
                    context.session_id,
                    "paper_session_failed",
                    "running",
                    "failed",
                    "paper_engine_no_candles",
                ),
            )
        if len(candles) > context.max_candles_per_tick:
            return _result(
                context,
                status="failed",
                reason_code="paper_engine_candle_cap_exceeded",
                safety_status=self.safety_status,
                portfolio=_portfolio_from_context(context),
                candles_processed=0,
                artifacts=artifacts,
            )

        portfolio = _portfolio_from_context(context)
        pending: list[tuple[int, PaperEngineOrderArtifact, PaperEngineAction]] = []
        candles_processed = 0

        try:
            for index, candle in enumerate(candles):
                if index < context.execution_start_index:
                    continue
                if self.cancel_provider.kill_switch_enabled():
                    return _result(
                        context,
                        status="cancelled",
                        reason_code="paper_kill_switch_enabled",
                        safety_status=self.safety_status,
                        portfolio=portfolio,
                        candles_processed=candles_processed,
                        artifacts=_with_audit(
                            artifacts,
                            context.session_id,
                            "paper_session_cancelled",
                            "running",
                            "cancelled",
                            "paper_kill_switch_enabled",
                        ),
                        mark_price=candle.close,
                    )
                _fill_pending_for_index(context, index, candle, portfolio, pending, artifacts)
                history = candles[: index + 1]
                for action in self.strategy_provider.actions_for_candle(context, history, index):
                    order_seq = len(artifacts.orders)
                    order_key = f"order-{order_seq}"
                    order = _order_from_action(
                        context,
                        candle,
                        action,
                        portfolio,
                        candles,
                        index,
                        order_key,
                        _artifact_key(context, candle_id=candle.candle_id, kind="order", seq=order_seq),
                    )
                    artifacts.orders.append(order)
                    artifacts.audits.append(
                        PaperEngineAuditArtifact(
                            session_id=context.session_id,
                            artifact_key=_artifact_key(
                                context,
                                candle_id=candle.candle_id,
                                kind="audit",
                                seq=len(artifacts.audits),
                            ),
                            action="paper_order_created" if order.status == "accepted" else "paper_order_rejected",
                            old_state=None,
                            new_state=order.status,
                            reason_code=order.reason_code,
                            metadata={"actionKind": action.kind, "candleId": candle.candle_id},
                        )
                    )
                    if order.status == "accepted":
                        pending.append((index + 1, order, action))

                _append_snapshot(context, candle, portfolio, artifacts, fill_index=None)
                candles_processed += 1
                if self.cancel_provider.should_cancel(context.session_id):
                    return _result(
                        context,
                        status="cancelled",
                        reason_code="paper_session_cancel_requested",
                        safety_status=self.safety_status,
                        portfolio=portfolio,
                        candles_processed=candles_processed,
                        artifacts=_with_audit(
                            artifacts,
                            context.session_id,
                            "paper_session_cancelled",
                            "running",
                            "cancelled",
                            "paper_session_cancel_requested",
                        ),
                        mark_price=candle.close,
                    )
        except Exception as exc:
            return _result(
                context,
                status="failed",
                reason_code="paper_engine_strategy_error",
                safety_status=self.safety_status,
                portfolio=portfolio,
                candles_processed=candles_processed,
                artifacts=_with_audit(
                    artifacts,
                    context.session_id,
                    "paper_session_failed",
                    "running",
                    "failed",
                    "paper_engine_strategy_error",
                ),
                error_message=_sanitize_error(exc),
                mark_price=candles[min(candles_processed, len(candles) - 1)].close if candles else ZERO,
            )

        return _result(
            context,
            status="completed",
            reason_code="paper_engine_completed",
            safety_status=self.safety_status,
            portfolio=portfolio,
            candles_processed=candles_processed,
            artifacts=_with_audit(
                artifacts,
                context.session_id,
                "paper_session_completed",
                "running",
                "completed",
                "paper_engine_completed",
            ),
            mark_price=candles[-1].close if candles else ZERO,
        )


def _portfolio_from_context(context: PaperExecutionContext) -> _PaperPortfolio:
    if context.initial_portfolio is None:
        return _PaperPortfolio(context.starting_cash)
    return _PaperPortfolio(
        cash=context.initial_portfolio.cash,
        quantity=context.initial_portfolio.quantity,
        average_entry_price=context.initial_portfolio.average_entry_price,
        realized_pnl=context.initial_portfolio.realized_pnl,
        fees_paid=context.initial_portfolio.fees_paid,
        peak_equity=context.initial_portfolio.peak_equity,
        max_drawdown_pct=context.initial_portfolio.max_drawdown_pct,
    )

def _prepare_strategy_provider(
    strategy_provider: StrategySignalProvider,
    context: PaperExecutionContext,
    safety_status: str,
) -> tuple[PaperEngineTickResult | None, dict[str, object]]:
    prepare = getattr(strategy_provider, "prepare", None)
    if not callable(prepare):
        return None, {}
    try:
        prepare_result = prepare(context)
        return None, _prepare_metadata(strategy_provider, prepare_result)
    except Exception as exc:
        reason_code = str(getattr(exc, "reason_code", None) or "paper_engine_strategy_error")
        error_message = str(getattr(exc, "error_message", None) or _sanitize_error(exc))
        return _result(
            context,
            status="failed",
            reason_code=reason_code,
            safety_status=safety_status,
            portfolio=_portfolio_from_context(context),
            candles_processed=0,
            artifacts=_with_audit(
                PaperEngineArtifacts(),
                context.session_id,
                "paper_session_failed",
                "running",
                "failed",
                reason_code,
            ),
            error_message=error_message,
            mark_price=ZERO,
        ), {}


def _prepare_metadata(strategy_provider: StrategySignalProvider, prepare_result: object) -> dict[str, object]:
    result_metadata = getattr(prepare_result, "audit_metadata", None)
    if isinstance(result_metadata, dict):
        return dict(result_metadata)
    metadata = getattr(strategy_provider, "audit_metadata", None)
    return dict(metadata) if isinstance(metadata, dict) else {}


def _context_from_session(
    session: PaperEngineSession,
    *,
    worker_id: str,
    max_candles_per_tick: int,
) -> PaperExecutionContext:
    return PaperExecutionContext(
        session_id=session.session_id,
        exchange=session.exchange,
        symbol=session.symbol,
        timeframe=session.timeframe,
        dataset_key=session.dataset_key,
        start_at=session.start_at,
        end_at=session.end_at,
        starting_cash=session.starting_cash,
        candles=sorted(session.candles, key=lambda candle: candle.open_time),
        max_candles_per_tick=max_candles_per_tick,
        fee_bps=session.fee_bps,
        slippage_bps=session.slippage_bps,
        runtime_config=_sanitize_mapping(session.runtime_config),
        strategy_metadata=_sanitize_mapping(session.strategy_metadata),
        actor=session.actor,
        worker_id=worker_id,
        correlation_id=session.correlation_id,
        request_id=session.request_id,
        attempt_no=session.attempt_no,
        initial_portfolio=session.initial_portfolio,
        execution_start_index=session.execution_start_index,
    )


def _order_from_action(
    context: PaperExecutionContext,
    candle: PaperEngineCandle,
    action: PaperEngineAction,
    portfolio: _PaperPortfolio,
    candles: list[PaperEngineCandle],
    index: int,
    order_key: str,
    artifact_key: str,
) -> PaperEngineOrderArtifact:
    if action.kind not in {"buy_market", "sell_market", "close_position"}:
        return _rejected_order(context, candle, action, "paper_order_type_not_supported", order_key, artifact_key)
    if index + 1 >= len(candles):
        return _rejected_order(context, candle, action, "paper_no_next_candle_for_fill", order_key, artifact_key)

    next_open = candles[index + 1].open
    side = "buy" if action.kind == "buy_market" else "sell"
    quantity = _requested_quantity(action, side=side, portfolio=portfolio, price=next_open)
    if quantity <= ZERO:
        return _rejected_order(context, candle, action, "paper_order_quantity_invalid", order_key, artifact_key)

    fill_price = _fill_price(next_open, side=side, slippage_bps=context.slippage_bps)
    notional = quantity * fill_price
    fee = _fee(notional, context.fee_bps)
    if side == "buy" and notional + fee > portfolio.cash:
        return _rejected_order(context, candle, action, "paper_insufficient_cash", order_key, artifact_key)
    if side == "sell" and quantity > portfolio.quantity:
        return _rejected_order(context, candle, action, "paper_insufficient_position", order_key, artifact_key)

    return PaperEngineOrderArtifact(
        session_id=context.session_id,
        order_key=order_key,
        artifact_key=artifact_key,
        candle_id=candle.candle_id,
        action_kind=action.kind,
        side=side,
        order_type="market",
        status="accepted",
        quantity=quantity,
        requested_notional=notional,
        reason_code=None,
        metadata=_sanitize_mapping(action.metadata),
    )


def _rejected_order(
    context: PaperExecutionContext,
    candle: PaperEngineCandle,
    action: PaperEngineAction,
    reason_code: str,
    order_key: str,
    artifact_key: str,
) -> PaperEngineOrderArtifact:
    return PaperEngineOrderArtifact(
        session_id=context.session_id,
        order_key=order_key,
        artifact_key=artifact_key,
        candle_id=candle.candle_id,
        action_kind=action.kind,
        side="buy" if action.kind == "buy_market" else "sell" if action.kind in {"sell_market", "close_position"} else None,
        order_type="market",
        status="rejected",
        quantity=ZERO,
        requested_notional=action.quote_amount,
        reason_code=reason_code,
        metadata=_sanitize_mapping(action.metadata),
    )


def _requested_quantity(
    action: PaperEngineAction,
    *,
    side: str,
    portfolio: _PaperPortfolio,
    price: Decimal,
) -> Decimal:
    if action.kind == "close_position":
        return portfolio.quantity
    if action.quantity is not None:
        return action.quantity
    if action.quote_amount is not None:
        return action.quote_amount / price if price > ZERO else ZERO
    if action.percent is not None:
        if side == "buy":
            return (portfolio.cash * action.percent / ONE_HUNDRED) / price if price > ZERO else ZERO
        return portfolio.quantity * action.percent / ONE_HUNDRED
    return ZERO


def _fill_pending_for_index(
    context: PaperExecutionContext,
    index: int,
    candle: PaperEngineCandle,
    portfolio: _PaperPortfolio,
    pending: list[tuple[int, PaperEngineOrderArtifact, PaperEngineAction]],
    artifacts: PaperEngineArtifacts,
) -> None:
    ready = [item for item in pending if item[0] == index]
    pending[:] = [item for item in pending if item[0] != index]
    for _, order, _ in ready:
        if order.side is None:
            continue
        price = _fill_price(candle.open, side=order.side, slippage_bps=context.slippage_bps)
        quantity = order.quantity
        notional = quantity * price
        fee_amount = _fee(notional, context.fee_bps)
        if order.side == "buy":
            portfolio.buy(quantity=quantity, price=price, fee_amount=fee_amount)
        else:
            portfolio.sell(quantity=quantity, price=price, fee_amount=fee_amount)
        fill = PaperEngineFillArtifact(
            session_id=context.session_id,
            order_key=order.order_key,
            artifact_key=_artifact_key(
                context,
                candle_id=candle.candle_id,
                kind="fill",
                seq=len(artifacts.fills),
            ),
            source_candle_id=candle.candle_id,
            fill_time=candle.open_time,
            side=order.side,
            price=price,
            quantity=quantity,
            notional=notional,
            fee_amount=fee_amount,
            slippage_amount=abs(price - candle.open) * quantity,
            metadata={"sourceCandleId": candle.candle_id, "orderKey": order.order_key},
        )
        artifacts.fills.append(fill)
        artifacts.audits.append(
            PaperEngineAuditArtifact(
                session_id=context.session_id,
                artifact_key=_artifact_key(
                    context,
                    candle_id=candle.candle_id,
                    kind="audit",
                    seq=len(artifacts.audits),
                ),
                action="paper_fill_created",
                old_state=None,
                new_state="filled",
                reason_code="paper_fill_created",
                metadata={"sourceCandleId": candle.candle_id},
            )
        )
        _append_snapshot(context, candle, portfolio, artifacts, fill_index=len(artifacts.fills) - 1)


def _append_snapshot(
    context: PaperExecutionContext,
    candle: PaperEngineCandle,
    portfolio: _PaperPortfolio,
    artifacts: PaperEngineArtifacts,
    *,
    fill_index: int | None,
) -> None:
    equity = portfolio.mark_to_market(candle.close)
    snapshot = PaperEnginePortfolioSnapshotArtifact(
        session_id=context.session_id,
        artifact_key=_artifact_key(
            context,
            candle_id=candle.candle_id,
            kind="snapshot",
            seq=len(artifacts.snapshots),
        ),
        source_candle_id=candle.candle_id,
        snapshot_at=candle.close_time,
        cash_balance=portfolio.cash,
        equity=equity,
        realized_pnl=portfolio.realized_pnl,
        unrealized_pnl=portfolio.unrealized_pnl(candle.close),
        fees_paid=portfolio.fees_paid,
        drawdown_pct=portfolio.max_drawdown_pct,
        exposure_notional=portfolio.quantity * candle.close,
        metadata={"fillIndex": fill_index, "sourceCandleId": candle.candle_id},
    )
    artifacts.snapshots.append(snapshot)
    artifacts.audits.append(
        PaperEngineAuditArtifact(
            session_id=context.session_id,
            artifact_key=_artifact_key(
                context,
                candle_id=candle.candle_id,
                kind="audit",
                seq=len(artifacts.audits),
            ),
            action="paper_portfolio_snapshot_created",
            old_state=None,
            new_state=None,
            reason_code="paper_portfolio_snapshot_created",
            metadata={"sourceCandleId": candle.candle_id, "fillIndex": fill_index},
        )
    )


def _fill_price(open_price: Decimal, *, side: str, slippage_bps: Decimal) -> Decimal:
    multiplier = Decimal("1") + slippage_bps / BPS_DENOMINATOR if side == "buy" else Decimal("1") - slippage_bps / BPS_DENOMINATOR
    return open_price * multiplier


def _fee(notional: Decimal, fee_bps: Decimal) -> Decimal:
    return abs(notional) * fee_bps / BPS_DENOMINATOR


def _result(
    context: PaperExecutionContext,
    *,
    status: str,
    reason_code: str,
    safety_status: str,
    portfolio: _PaperPortfolio,
    candles_processed: int,
    artifacts: PaperEngineArtifacts,
    error_message: str | None = None,
    mark_price: Decimal | None = None,
) -> PaperEngineTickResult:
    price = mark_price if mark_price is not None else ZERO
    position = PaperEnginePositionArtifact(
        session_id=context.session_id,
        symbol=context.symbol,
        status="open" if portfolio.quantity > ZERO else "closed",
        quantity=portfolio.quantity,
        average_entry_price=portfolio.average_entry_price,
        realized_pnl=portfolio.realized_pnl,
        unrealized_pnl=portfolio.unrealized_pnl(price),
    )
    artifacts.positions[:] = [position]
    return PaperEngineTickResult(
        status=status,
        reason_code=reason_code,
        safety_status=safety_status,
        session_id=context.session_id,
        candles_processed=candles_processed,
        orders_created=len(artifacts.orders),
        fills_created=len(artifacts.fills),
        snapshots_created=len(artifacts.snapshots),
        starting_cash=context.starting_cash,
        ending_cash=portfolio.cash,
        ending_equity=portfolio.equity(price),
        error_message=error_message,
        artifacts=artifacts,
    )


def _with_audit(
    artifacts: PaperEngineArtifacts,
    session_id: str,
    action: str,
    old_state: str | None,
    new_state: str | None,
    reason_code: str,
) -> PaperEngineArtifacts:
    artifacts.audits.append(
        PaperEngineAuditArtifact(
            session_id=session_id,
            artifact_key=_artifact_key_for_values(
                session_id=session_id,
                attempt_no=0,
                candle_id=None,
                kind="audit",
                seq=len(artifacts.audits),
            ),
            action=action,
            old_state=old_state,
            new_state=new_state,
            reason_code=reason_code,
            metadata={},
        )
    )
    return artifacts


def _artifact_key(
    context: PaperExecutionContext,
    *,
    candle_id: str | None,
    kind: str,
    seq: int,
) -> str:
    return _artifact_key_for_values(
        session_id=context.session_id,
        attempt_no=context.attempt_no,
        candle_id=candle_id,
        kind=kind,
        seq=seq,
    )

def _artifact_key_for_values(
    *,
    session_id: str,
    attempt_no: int,
    candle_id: str | None,
    kind: str,
    seq: int,
) -> str:
    resolved_candle_id = candle_id or "session"
    return f"paper:{session_id}:attempt:{attempt_no}:candle:{resolved_candle_id}:kind:{kind}:seq:{seq}"

def _sanitize_mapping(value: dict[str, object]) -> dict[str, object]:
    sanitized: dict[str, object] = {}
    for key, nested in value.items():
        if _looks_secret(key):
            sanitized[str(key)] = "[REDACTED]"
        elif isinstance(nested, dict):
            sanitized[str(key)] = _sanitize_mapping({str(k): v for k, v in nested.items()})
        elif isinstance(nested, list):
            sanitized[str(key)] = [_sanitize_value(item) for item in nested]
        else:
            sanitized[str(key)] = _sanitize_value(nested)
    return sanitized


def _sanitize_value(value: object) -> object:
    if isinstance(value, dict):
        return _sanitize_mapping({str(key): nested for key, nested in value.items()})
    if isinstance(value, list):
        return [_sanitize_value(item) for item in value]
    return value


def _sanitize_error(exc: Exception) -> str:
    text = str(exc)
    if "secret" in text.lower() or "token" in text.lower() or "password" in text.lower():
        return "[REDACTED]"
    return text


def _looks_secret(key: object) -> bool:
    normalized = str(key).strip().lower().replace("_", "").replace("-", "")
    return any(marker in normalized for marker in ("secret", "password", "token", "apikey", "privatekey", "passphrase"))
