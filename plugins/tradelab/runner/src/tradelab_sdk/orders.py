from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Literal


@dataclass(slots=True)
class OrderIntent:
    kind: Literal["buy_market", "sell_market", "close_position"]
    percent: float | None = None
    quote_amount: Decimal | None = None
    base_amount: Decimal | None = None
    payload: dict[str, Any] = field(default_factory=dict)

