from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal, ROUND_DOWN, ROUND_HALF_UP
from typing import Any

from tradelab_api.services.backtest.portfolio import PortfolioState


ZERO = Decimal("0")


def decimalize(value: Any | None) -> Decimal | None:
    if value is None or value == "":
        return None
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def quantize_to_step(value: Decimal, step: Decimal | None, *, rounding: str) -> Decimal:
    if step is None or step <= ZERO:
        return value
    return (value / step).to_integral_value(rounding=rounding) * step


def apply_slippage(price: Decimal, *, side: str, slippage_bps: Decimal) -> Decimal:
    if slippage_bps <= ZERO:
        return price
    factor = slippage_bps / Decimal("10000")
    if side == "buy":
        return price * (Decimal("1") + factor)
    return price * (Decimal("1") - factor)


@dataclass(slots=True)
class RiskConfig:
    max_order_percent: Decimal | None = None
    max_position_percent: Decimal | None = None
    min_notional: Decimal | None = None
    step_size: Decimal | None = None
    tick_size: Decimal | None = None
    fee_bps: Decimal = ZERO
    slippage_bps: Decimal = ZERO
    max_drawdown_percent: Decimal | None = None

    @classmethod
    def from_mapping(cls, mapping: dict[str, Any] | None) -> "RiskConfig":
        mapping = mapping or {}
        return cls(
            max_order_percent=decimalize(mapping.get("max_order_percent")),
            max_position_percent=decimalize(mapping.get("max_position_percent")),
            min_notional=decimalize(mapping.get("min_notional")),
            step_size=decimalize(mapping.get("step_size")),
            tick_size=decimalize(mapping.get("tick_size")),
            fee_bps=decimalize(mapping.get("fee_bps")) or ZERO,
            slippage_bps=decimalize(mapping.get("slippage_bps")) or ZERO,
            max_drawdown_percent=decimalize(mapping.get("max_drawdown_percent")),
        )


@dataclass(slots=True)
class RiskDecision:
    accepted: bool
    side: str
    requested_qty: Decimal | None = None
    requested_notional: Decimal | None = None
    fill_qty: Decimal | None = None
    fill_price: Decimal | None = None
    fill_notional: Decimal | None = None
    fee_amount: Decimal | None = None
    reject_reason: str | None = None
    payload: dict[str, Any] = field(default_factory=dict)


class RiskGuard:
    def __init__(self, config: RiskConfig) -> None:
        self.config = config

    @classmethod
    def from_mapping(cls, mapping: dict[str, Any] | None) -> "RiskGuard":
        return cls(RiskConfig.from_mapping(mapping))

    def evaluate(
        self,
        *,
        kind: str,
        portfolio: PortfolioState,
        current_equity: Decimal,
        next_open_price: Decimal,
        percent: float | None = None,
        quote_amount: Decimal | None = None,
        base_amount: Decimal | None = None,
    ) -> RiskDecision:
        if self._drawdown_exceeded(portfolio):
            return RiskDecision(
                accepted=False,
                side=self._side_for_kind(kind),
                reject_reason="Max drawdown limit exceeded.",
            )

        side = self._side_for_kind(kind)
        requested_notional, requested_qty = self._requested_amount(
            side=side,
            current_equity=current_equity,
            next_open_price=next_open_price,
            percent=percent,
            quote_amount=quote_amount,
            base_amount=base_amount,
            portfolio=portfolio,
        )
        if requested_notional is None or requested_qty is None:
            return RiskDecision(
                accepted=False,
                side=side,
                reject_reason="Strategy did not request a valid quantity.",
            )

        if self.config.max_order_percent is not None and current_equity > ZERO:
            order_percent = requested_notional / current_equity * Decimal("100")
            if order_percent > self.config.max_order_percent:
                return RiskDecision(
                    accepted=False,
                    side=side,
                    requested_qty=requested_qty,
                    requested_notional=requested_notional,
                    reject_reason="Order exceeds max percent per order.",
                )

        fill_price = apply_slippage(next_open_price, side=side, slippage_bps=self.config.slippage_bps)
        fill_price = quantize_to_step(fill_price, self.config.tick_size, rounding=ROUND_HALF_UP)
        fill_qty = quantize_to_step(requested_qty, self.config.step_size, rounding=ROUND_DOWN)
        if fill_qty <= ZERO:
            return RiskDecision(
                accepted=False,
                side=side,
                requested_qty=requested_qty,
                requested_notional=requested_notional,
                reject_reason="Order rounded down to zero quantity.",
            )

        fill_notional = fill_qty * fill_price
        if self.config.min_notional is not None and fill_notional < self.config.min_notional:
            return RiskDecision(
                accepted=False,
                side=side,
                requested_qty=requested_qty,
                requested_notional=requested_notional,
                fill_qty=fill_qty,
                fill_price=fill_price,
                fill_notional=fill_notional,
                reject_reason="Order notional is below the minimum notional.",
            )

        fee_amount = fill_notional * (self.config.fee_bps / Decimal("10000"))

        if side == "buy":
            total_cost = fill_notional + fee_amount
            if total_cost > portfolio.quote_balance:
                return RiskDecision(
                    accepted=False,
                    side=side,
                    requested_qty=requested_qty,
                    requested_notional=requested_notional,
                    fill_qty=fill_qty,
                    fill_price=fill_price,
                    fill_notional=fill_notional,
                    fee_amount=fee_amount,
                    reject_reason="Insufficient quote balance.",
                )
            if self.config.max_position_percent is not None and current_equity > ZERO:
                projected_position_value = (portfolio.base_balance * fill_price) + fill_notional
                projected_percent = projected_position_value / current_equity * Decimal("100")
                if projected_percent > self.config.max_position_percent:
                    return RiskDecision(
                        accepted=False,
                        side=side,
                        requested_qty=requested_qty,
                        requested_notional=requested_notional,
                        fill_qty=fill_qty,
                        fill_price=fill_price,
                        fill_notional=fill_notional,
                        fee_amount=fee_amount,
                        reject_reason="Order exceeds max position percent.",
                    )
        else:
            if fill_qty > portfolio.base_balance:
                return RiskDecision(
                    accepted=False,
                    side=side,
                    requested_qty=requested_qty,
                    requested_notional=requested_notional,
                    fill_qty=fill_qty,
                    fill_price=fill_price,
                    fill_notional=fill_notional,
                    fee_amount=fee_amount,
                    reject_reason="Insufficient base balance.",
                )

        return RiskDecision(
            accepted=True,
            side=side,
            requested_qty=requested_qty,
            requested_notional=requested_notional,
            fill_qty=fill_qty,
            fill_price=fill_price,
            fill_notional=fill_notional,
            fee_amount=fee_amount,
            payload={
                "kind": kind,
                "side": side,
                "fee_bps": str(self.config.fee_bps),
                "slippage_bps": str(self.config.slippage_bps),
            },
        )

    def _drawdown_exceeded(self, portfolio: PortfolioState) -> bool:
        if self.config.max_drawdown_percent is None:
            return False
        return portfolio.max_drawdown_pct > self.config.max_drawdown_percent

    def _side_for_kind(self, kind: str) -> str:
        if kind in {"buy_market"}:
            return "buy"
        if kind in {"sell_market", "close_position"}:
            return "sell"
        return "buy"

    def _requested_amount(
        self,
        *,
        side: str,
        current_equity: Decimal,
        next_open_price: Decimal,
        percent: float | None,
        quote_amount: Decimal | None,
        base_amount: Decimal | None,
        portfolio: PortfolioState,
    ) -> tuple[Decimal | None, Decimal | None]:
        if side == "buy":
            if quote_amount is not None:
                requested_notional = decimalize(quote_amount)
            else:
                pct = Decimal(str(percent)) if percent is not None else Decimal("100")
                requested_notional = current_equity * pct / Decimal("100")
            if requested_notional is None:
                return None, None
            if self.config.fee_bps > ZERO or self.config.slippage_bps > ZERO:
                execution_cost_factor = (Decimal("1") + (self.config.slippage_bps / Decimal("10000"))) * (
                    Decimal("1") + (self.config.fee_bps / Decimal("10000"))
                )
                if execution_cost_factor > ZERO:
                    requested_notional = requested_notional / execution_cost_factor
            requested_qty = requested_notional / next_open_price
            return requested_notional, requested_qty

        if base_amount is not None:
            requested_qty = decimalize(base_amount)
        else:
            pct = Decimal(str(percent)) if percent is not None else Decimal("100")
            requested_qty = portfolio.base_balance * pct / Decimal("100")
        if requested_qty is None:
            return None, None
        requested_notional = requested_qty * next_open_price
        return requested_notional, requested_qty
