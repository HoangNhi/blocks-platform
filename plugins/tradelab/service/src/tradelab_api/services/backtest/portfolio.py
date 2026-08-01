from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal


ZERO = Decimal("0")


@dataclass(slots=True)
class PortfolioState:
    quote_balance: Decimal
    base_balance: Decimal = ZERO
    realized_pnl: Decimal = ZERO
    fees_paid: Decimal = ZERO
    average_entry_price: Decimal | None = None
    peak_equity: Decimal | None = None
    max_drawdown_pct: Decimal = ZERO

    def equity(self, mark_price: Decimal) -> Decimal:
        return self.quote_balance + (self.base_balance * mark_price)

    def mark_to_market(self, mark_price: Decimal) -> Decimal:
        equity = self.equity(mark_price)
        if self.peak_equity is None or equity > self.peak_equity:
            self.peak_equity = equity
        if self.peak_equity and self.peak_equity > ZERO:
            drawdown = (self.peak_equity - equity) / self.peak_equity * Decimal("100")
            if drawdown > self.max_drawdown_pct:
                self.max_drawdown_pct = drawdown
        return equity

    def buy(self, *, quantity: Decimal, price: Decimal, fee_amount: Decimal) -> None:
        notional = quantity * price
        previous_cost_basis = ZERO
        if self.average_entry_price is not None and self.base_balance > ZERO:
            previous_cost_basis = self.average_entry_price * self.base_balance
        new_base_balance = self.base_balance + quantity
        self.base_balance = new_base_balance
        self.quote_balance -= notional + fee_amount
        self.fees_paid += fee_amount
        total_cost_basis = previous_cost_basis + notional
        self.average_entry_price = total_cost_basis / new_base_balance if new_base_balance > ZERO else None

    def sell(self, *, quantity: Decimal, price: Decimal, fee_amount: Decimal) -> None:
        notional = quantity * price
        if quantity > self.base_balance:
            raise ValueError("Cannot sell more base asset than is available.")
        avg_entry_price = self.average_entry_price or ZERO
        self.quote_balance += notional - fee_amount
        self.fees_paid += fee_amount
        self.realized_pnl += (price - avg_entry_price) * quantity - fee_amount
        self.base_balance -= quantity
        if self.base_balance <= ZERO:
            self.base_balance = ZERO
            self.average_entry_price = None
