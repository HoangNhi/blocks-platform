# encoding: utf-8
from .portfolio_base import BasePosition, BasePortfolioState
from .types import PositionSide, Bar
from typing import Dict, Any, List
from datetime import datetime, timedelta

class FuturesPosition(BasePosition):
    def __init__(self, symbol: str, side: PositionSide, quantity: float, entry_price: float, leverage: int, margin_mode: str = "CROSS"):
        super().__init__(symbol, side, quantity, entry_price)
        self.leverage = leverage
        self.margin_mode = margin_mode
        self.initial_margin = (quantity * entry_price) / leverage
        self.maintenance_margin_rate = 0.004
        self.funding_fee_accrued = 0.0

    def maintenance_margin(self, mark_price: float) -> float:
        return self.quantity * mark_price * self.maintenance_margin_rate

class FuturesPortfolioState(BasePortfolioState):
    def __init__(self, initial_usdt: float):
        super().__init__(initial_usdt)
        self.funding_fee_rate = 0.0001
        self.last_funding_time: datetime | None = None
        self.funding_events: List[Dict[str, Any]] = []
        self.mark_prices: Dict[str, float] = {}

    def update_mark_price(self, symbol: str, current_price: float) -> None:
        self.mark_prices[symbol] = current_price
        if symbol in self.positions:
            pos = self.positions[symbol]
            if pos.side == PositionSide.LONG:
                pos.unrealized_pnl = (current_price - pos.entry_price) * pos.quantity
            else:
                pos.unrealized_pnl = (pos.entry_price - current_price) * pos.quantity

    def mark_price_for(self, symbol: str) -> float:
        if symbol in self.mark_prices:
            return self.mark_prices[symbol]
        if symbol in self.positions:
            return self.positions[symbol].entry_price
        raise KeyError(f"Unknown futures symbol {symbol}")

    def portfolio_equity(self) -> float:
        return self.margin_balance + sum(pos.unrealized_pnl for pos in self.positions.values())

    def total_maintenance_margin(self) -> float:
        return sum(
            pos.maintenance_margin(self.mark_price_for(symbol))
            for symbol, pos in self.positions.items()
        )

    def _funding_boundary_for(self, open_time: datetime) -> datetime:
        funding_hour = (open_time.hour // 8) * 8
        return open_time.replace(hour=funding_hour, minute=0, second=0, microsecond=0)

    def _apply_funding_until(self, current_funding_time: datetime) -> None:
        if self.last_funding_time is None:
            self.last_funding_time = current_funding_time
            return

        next_funding_time = self.last_funding_time + timedelta(hours=8)
        while next_funding_time <= current_funding_time:
            for symbol, pos in self.positions.items():
                mark_price = self.mark_price_for(symbol)
                notional = pos.quantity * mark_price
                fee = notional * self.funding_fee_rate
                cash_flow = -fee if pos.side == PositionSide.LONG else fee
                self.margin_balance += cash_flow
                pos.funding_fee_accrued += cash_flow
                self.funding_events.append(
                    {
                        "timestamp": next_funding_time.isoformat(),
                        "symbol": symbol,
                        "amount": cash_flow,
                        "side": pos.side,
                    }
                )
            self.last_funding_time = next_funding_time
            next_funding_time = self.last_funding_time + timedelta(hours=8)

    def evaluate_liquidations(self, symbol: str, candle: Bar) -> List[Dict[str, Any]]:
        if self.liquidated:
            return []

        if candle.open_time is not None:
            current_funding_time = self._funding_boundary_for(candle.open_time)
            self._apply_funding_until(current_funding_time)

        total_equity = self.portfolio_equity()
        total_maintenance_margin = self.total_maintenance_margin()

        liquidations: List[Dict[str, Any]] = []
        if total_equity <= total_maintenance_margin and self.positions:
            self.liquidated = True
            for liquidation_symbol, pos in list(self.positions.items()):
                liquidations.append(
                    {
                        "symbol": liquidation_symbol,
                        "side": pos.side,
                        "quantity": pos.quantity,
                        "price": self.mark_price_for(liquidation_symbol),
                        "reason": "LIQUIDATION_CROSS_MARGIN",
                    }
                )
            self.positions.clear()

        return liquidations
