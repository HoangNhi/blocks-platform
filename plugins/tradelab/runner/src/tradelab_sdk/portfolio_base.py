# encoding: utf-8
from abc import ABC, abstractmethod
from typing import Dict, Any, List
from .types import PositionSide, Bar

class BasePosition(ABC):
    symbol: str
    side: PositionSide
    entry_price: float
    quantity: float
    unrealized_pnl: float

    def __init__(self, symbol: str, side: PositionSide, quantity: float, entry_price: float):
        self.symbol = symbol
        self.side = side
        self.quantity = quantity
        self.entry_price = entry_price
        self.unrealized_pnl = 0.0

class BasePortfolioState(ABC):
    margin_balance: float
    positions: Dict[str, BasePosition]
    liquidated: bool

    def __init__(self, initial_usdt: float):
        self.margin_balance = initial_usdt
        self.positions = {}
        self.liquidated = False

    @abstractmethod
    def update_mark_price(self, symbol: str, current_price: float) -> None:
        pass

    @abstractmethod
    def evaluate_liquidations(self, symbol: str, candle: Bar) -> List[Dict[str, Any]]:
        pass
