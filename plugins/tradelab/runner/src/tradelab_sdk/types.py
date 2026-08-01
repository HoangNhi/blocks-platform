from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import TypeAlias


Number: TypeAlias = float | int | Decimal
SeriesValue: TypeAlias = float | None


@dataclass(slots=True)
class Bar:
    open_time: datetime | None
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal


from enum import Enum

class MarketType(str, Enum):
    SPOT = "spot"
    USD_M_FUTURES = "usd_m_futures"

class PositionSide(str, Enum):
    LONG = "long"
    SHORT = "short"

class MarginMode(str, Enum):
    ISOLATED = "ISOLATED"
    CROSS = "CROSS"

class OrderKind(str, Enum):
    BUY_MARKET = "buy_market"
    SELL_MARKET = "sell_market"
    CLOSE_POSITION = "close_position"
    LIQUIDATION = "liquidation"



