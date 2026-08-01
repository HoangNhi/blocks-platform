from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Literal


@dataclass(slots=True)
class StrategySignal:
    signal_type: Literal["buy", "sell", "hold", "close"]
    strength: Decimal | None = None
    payload: dict[str, Any] = field(default_factory=dict)

