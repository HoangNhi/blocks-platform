from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Any

from .indicators import IndicatorSet
from .orders import OrderIntent
from .types import Bar
from .history import HistoryProvider


@dataclass(slots=True)
class StrategyContext:
    symbol: str
    timeframe: str
    now: datetime | None = None
    bar: Bar | None = None
    history: HistoryProvider | dict[str, list[float | int | Decimal]] = field(default_factory=dict)
    config: dict[str, Any] = field(default_factory=dict)
    state: dict[str, Any] = field(default_factory=dict)
    indicators: IndicatorSet = field(default_factory=IndicatorSet)
    logger: Any = None

    @property
    def account(self) -> Any:
        return self.state.get("account_state")

    @property
    def position(self) -> Any:
        return self.state.get("position_state")

    def set_leverage(self, leverage: int) -> None:
        self.state["leverage"] = leverage

    def set_margin_mode(self, mode: str) -> None:
        self.state["margin_mode"] = mode


    def buy_market(
        self,
        percent: float | None = None,
        quote_amount: Decimal | None = None,
    ) -> OrderIntent:
        return OrderIntent(
            kind="buy_market",
            percent=percent,
            quote_amount=quote_amount,
        )

    def sell_market(
        self,
        percent: float | None = None,
        base_amount: Decimal | None = None,
    ) -> OrderIntent:
        return OrderIntent(
            kind="sell_market",
            percent=percent,
            base_amount=base_amount,
        )

    def close_position(self) -> OrderIntent:
        return OrderIntent(kind="close_position")

    def log(self, message: str, **payload: Any) -> dict[str, Any]:
        entry = {
            "message": message,
            "payload": payload,
            "symbol": self.symbol,
            "timeframe": self.timeframe,
        }
        if callable(self.logger):
            self.logger(entry)
        elif hasattr(self.logger, "info"):
            self.logger.info(message, extra={"payload": payload})
        return entry
