from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from decimal import Decimal

ZERO = Decimal("0")
FUNDING_RATE = Decimal("0.0001")
MAINTENANCE_MARGIN_RATE = Decimal("0.004")


@dataclass(slots=True)
class FuturesPositionState:
    symbol: str
    side: str
    quantity: Decimal
    entry_price: Decimal
    leverage: int
    opened_at: datetime
    margin_mode: str = "CROSS"
    status: str = "OPEN"
    close_price: Decimal | None = None
    realized_pnl: Decimal = ZERO
    funding_fee_paid: Decimal = ZERO
    max_notional: Decimal = ZERO
    max_margin_used: Decimal = ZERO
    peak_leverage_used: Decimal = ZERO
    maintenance_margin: Decimal = ZERO
    liquidation_price: Decimal | None = None
    unrealized_pnl: Decimal = ZERO

    def update_mark(self, mark_price: Decimal) -> None:
        if self.side == "LONG":
            self.unrealized_pnl = (mark_price - self.entry_price) * self.quantity
        else:
            self.unrealized_pnl = (self.entry_price - mark_price) * self.quantity
        notional = self.quantity * mark_price
        self.max_notional = max(self.max_notional, notional)
        self.maintenance_margin = notional * MAINTENANCE_MARGIN_RATE
        initial_margin = (self.quantity * self.entry_price) / Decimal(str(self.leverage))
        self.max_margin_used = max(self.max_margin_used, initial_margin)
        self.peak_leverage_used = max(self.peak_leverage_used, Decimal(str(self.leverage)))
        if self.side == "LONG":
            self.liquidation_price = self.entry_price * (
                Decimal("1") - (Decimal("1") / Decimal(str(self.leverage))) + MAINTENANCE_MARGIN_RATE
            )
        else:
            self.liquidation_price = self.entry_price * (
                Decimal("1") + (Decimal("1") / Decimal(str(self.leverage))) - MAINTENANCE_MARGIN_RATE
            )


@dataclass(slots=True)
class FuturesPortfolioState:
    initial_equity: Decimal
    symbol: str
    default_leverage: int
    margin_balance: Decimal = field(init=False)
    positions: dict[str, FuturesPositionState] = field(default_factory=dict)
    funding_events: list[dict[str, object]] = field(default_factory=list)
    liquidation_events: list[dict[str, object]] = field(default_factory=list)
    closed_positions: list[FuturesPositionState] = field(default_factory=list)
    last_funding_time: datetime | None = None
    total_funding_fee_paid: Decimal = ZERO
    total_funding_fee_received: Decimal = ZERO
    liquidation_count: int = 0
    peak_margin_usage_pct: Decimal = ZERO
    peak_maintenance_margin_pct: Decimal = ZERO
    leverage_samples: list[Decimal] = field(default_factory=list)
    trade_outcomes: list[tuple[str, Decimal]] = field(default_factory=list)
    peak_equity: Decimal = field(init=False)
    max_drawdown_pct: Decimal = ZERO

    def __post_init__(self) -> None:
        self.margin_balance = self.initial_equity
        self.peak_equity = self.initial_equity

    def open_long(self, *, quantity: Decimal, price: Decimal, opened_at: datetime, leverage: int | None = None) -> None:
        self.positions[self.symbol] = FuturesPositionState(
            symbol=self.symbol,
            side="LONG",
            quantity=quantity,
            entry_price=price,
            leverage=leverage or self.default_leverage,
            opened_at=opened_at,
        )

    def open_short(self, *, quantity: Decimal, price: Decimal, opened_at: datetime, leverage: int | None = None) -> None:
        self.positions[self.symbol] = FuturesPositionState(
            symbol=self.symbol,
            side="SHORT",
            quantity=quantity,
            entry_price=price,
            leverage=leverage or self.default_leverage,
            opened_at=opened_at,
        )

    def update_mark_price(self, mark_price: Decimal) -> None:
        position = self.positions.get(self.symbol)
        if position is None:
            self._record_equity(self.portfolio_equity())
            return
        position.close_price = mark_price
        position.update_mark(mark_price)
        equity = self.portfolio_equity()
        self._record_equity(equity)
        if equity > ZERO:
            self.peak_margin_usage_pct = max(
                self.peak_margin_usage_pct,
                (position.max_margin_used / equity) * Decimal("100"),
            )
            self.peak_maintenance_margin_pct = max(
                self.peak_maintenance_margin_pct,
                (position.maintenance_margin / equity) * Decimal("100"),
            )
        elif position.maintenance_margin > ZERO:
            self.peak_margin_usage_pct = max(self.peak_margin_usage_pct, Decimal("100"))
            self.peak_maintenance_margin_pct = max(self.peak_maintenance_margin_pct, Decimal("100"))
        self.leverage_samples.append(position.peak_leverage_used)

    def close_active(self, *, price: Decimal, closed_at: datetime) -> None:
        position = self.positions[self.symbol]
        position.update_mark(price)
        position.close_price = price
        position.status = "CLOSED"
        realized_pnl = position.unrealized_pnl
        position.realized_pnl += realized_pnl
        position.unrealized_pnl = ZERO
        self.margin_balance += realized_pnl
        self.trade_outcomes.append((position.side, realized_pnl))
        self.closed_positions.append(position)
        del self.positions[self.symbol]
        self._record_equity(self.portfolio_equity())

    def portfolio_equity(self) -> Decimal:
        return self.margin_balance + sum(position.unrealized_pnl for position in self.positions.values())

    def apply_funding_until(self, funding_time: datetime) -> None:
        if not self.positions:
            return
        if self.last_funding_time is None:
            earliest_open_time = min(position.opened_at for position in self.positions.values())
            self.last_funding_time = earliest_open_time.replace(hour=(earliest_open_time.hour // 8) * 8, minute=0, second=0, microsecond=0)
        next_boundary = self.last_funding_time + timedelta(hours=8)
        while next_boundary <= funding_time:
            for position in self.positions.values():
                fee = position.quantity * (position.close_price or position.entry_price) * FUNDING_RATE
                if position.side == "LONG":
                    self.margin_balance -= fee
                    self.total_funding_fee_paid += fee
                    position.funding_fee_paid += fee
                    amount = -fee
                else:
                    self.margin_balance += fee
                    self.total_funding_fee_received += fee
                    position.funding_fee_paid -= fee
                    amount = fee
                self.funding_events.append(
                    {"timestamp": next_boundary.isoformat(), "symbol": position.symbol, "amount": float(amount)}
                )
            self.last_funding_time = next_boundary
            next_boundary = self.last_funding_time + timedelta(hours=8)

    def evaluate_cross_margin_liquidation(self, *, at_time: datetime) -> dict[str, object] | None:
        if not self.positions:
            return None
        total_maintenance = sum(position.maintenance_margin for position in self.positions.values())
        if self.portfolio_equity() > total_maintenance:
            return None
        self.liquidation_count += 1
        position = self.positions[self.symbol]
        position.status = "LIQUIDATED"
        position.close_price = position.entry_price + position.unrealized_pnl / position.quantity
        self.trade_outcomes.append((position.side, position.unrealized_pnl))
        self.closed_positions.append(position)
        del self.positions[self.symbol]
        self._record_equity(self.portfolio_equity())
        event = {
            "timestamp": at_time.isoformat(),
            "symbol": position.symbol,
            "reason": "LIQUIDATION_CROSS_MARGIN",
            "price": float(position.close_price),
        }
        self.liquidation_events.append(event)
        return event

    def _record_equity(self, equity: Decimal) -> None:
        self.peak_equity = max(self.peak_equity, equity)
        if self.peak_equity <= ZERO:
            return
        drawdown_pct = (self.peak_equity - equity) / self.peak_equity * Decimal("100")
        self.max_drawdown_pct = max(self.max_drawdown_pct, drawdown_pct)

    def build_research_summary(self) -> dict[str, float | int | None]:
        avg_leverage = None
        if self.leverage_samples:
            avg_leverage = float(sum(self.leverage_samples) / Decimal(len(self.leverage_samples)))
        long_outcomes = [pnl for side, pnl in self.trade_outcomes if side == "LONG"]
        short_outcomes = [pnl for side, pnl in self.trade_outcomes if side == "SHORT"]
        long_win_rate = None
        if long_outcomes:
            long_win_rate = float(sum(Decimal("1") for pnl in long_outcomes if pnl > ZERO) / Decimal(len(long_outcomes)) * Decimal("100"))
        short_win_rate = None
        if short_outcomes:
            short_win_rate = float(sum(Decimal("1") for pnl in short_outcomes if pnl > ZERO) / Decimal(len(short_outcomes)) * Decimal("100"))
        return {
            "totalFundingFeePaid": float(self.total_funding_fee_paid),
            "totalFundingFeeReceived": float(self.total_funding_fee_received),
            "liquidationCount": self.liquidation_count,
            "longTrades": len(long_outcomes),
            "shortTrades": len(short_outcomes),
            "longWinRate": long_win_rate,
            "shortWinRate": short_win_rate,
            "avgLeverageUsed": avg_leverage,
            "maxMarginUsagePct": float(self.peak_margin_usage_pct),
            "maxMaintenanceMarginPct": float(self.peak_maintenance_margin_pct),
        }
