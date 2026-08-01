from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal

from tradelab_api.services.backtest.futures import FuturesPortfolioState


def test_futures_portfolio_applies_multi_boundary_funding_cashflow() -> None:
    portfolio = FuturesPortfolioState(
        initial_equity=Decimal("1000"),
        symbol="BTCUSDT",
        default_leverage=10,
    )
    portfolio.open_long(
        quantity=Decimal("1"),
        price=Decimal("100"),
        opened_at=datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
    )
    portfolio.update_mark_price(Decimal("100"))

    portfolio.apply_funding_until(datetime(2026, 1, 1, 16, 0, tzinfo=timezone.utc))

    assert portfolio.total_funding_fee_paid == Decimal("0.02")
    assert portfolio.margin_balance == Decimal("999.98")
    assert portfolio.positions["BTCUSDT"].funding_fee_paid == Decimal("0.02")


def test_futures_portfolio_triggers_cross_liquidation_when_equity_below_maintenance() -> None:
    portfolio = FuturesPortfolioState(
        initial_equity=Decimal("100"),
        symbol="BTCUSDT",
        default_leverage=50,
    )
    portfolio.open_long(
        quantity=Decimal("50"),
        price=Decimal("100"),
        opened_at=datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
    )
    portfolio.update_mark_price(Decimal("1"))

    liquidation = portfolio.evaluate_cross_margin_liquidation(
        at_time=datetime(2026, 1, 1, 1, 0, tzinfo=timezone.utc)
    )

    assert liquidation is not None
    assert liquidation["reason"] == "LIQUIDATION_CROSS_MARGIN"
    assert portfolio.liquidation_count == 1
    assert portfolio.closed_positions[0].status == "LIQUIDATED"


def test_futures_portfolio_tracks_margin_and_leverage_pressure() -> None:
    portfolio = FuturesPortfolioState(
        initial_equity=Decimal("1000"),
        symbol="BTCUSDT",
        default_leverage=5,
    )
    portfolio.open_short(
        quantity=Decimal("2"),
        price=Decimal("100"),
        opened_at=datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
    )
    portfolio.update_mark_price(Decimal("105"))

    summary = portfolio.build_research_summary()

    assert summary["avgLeverageUsed"] == 5.0
    assert summary["maxMarginUsagePct"] > 0
    assert summary["maxMaintenanceMarginPct"] > 0


def test_futures_portfolio_close_removes_active_position_from_equity_tracking() -> None:
    portfolio = FuturesPortfolioState(
        initial_equity=Decimal("1000"),
        symbol="BTCUSDT",
        default_leverage=10,
    )
    portfolio.open_long(
        quantity=Decimal("1"),
        price=Decimal("100"),
        opened_at=datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
    )
    portfolio.update_mark_price(Decimal("110"))

    portfolio.close_active(
        price=Decimal("110"),
        closed_at=datetime(2026, 1, 1, 1, 0, tzinfo=timezone.utc),
    )

    assert portfolio.margin_balance == Decimal("1010")
    assert portfolio.portfolio_equity() == Decimal("1010")
    assert portfolio.positions == {}
    assert portfolio.closed_positions[0].status == "CLOSED"

    portfolio.update_mark_price(Decimal("120"))

    assert portfolio.portfolio_equity() == Decimal("1010")
