# encoding: utf-8
from .portfolio_base import BasePosition, BasePortfolioState
from .types import PositionSide, Bar
from typing import Dict, Any, List

class SpotPosition(BasePosition):
    pass

class SpotPortfolioState(BasePortfolioState):
    def update_mark_price(self, symbol: str, current_price: float) -> None:
        if symbol in self.positions:
            pos = self.positions[symbol]
            # Spot chỉ hỗ trợ LONG
            pos.unrealized_pnl = (current_price - pos.entry_price) * pos.quantity

    def evaluate_liquidations(self, symbol: str, candle: Bar) -> List[Dict[str, Any]]:
        return [] # Spot không bị thanh lý
