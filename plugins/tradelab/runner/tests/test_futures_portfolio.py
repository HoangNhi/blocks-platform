# encoding: utf-8
import pytest
from tradelab_sdk.futures_portfolio import FuturesPortfolioState, FuturesPosition
from tradelab_sdk.types import PositionSide, Bar
from datetime import datetime
from decimal import Decimal

def test_futures_portfolio_initialization():
    portfolio = FuturesPortfolioState(initial_usdt=1000.0)
    assert portfolio.margin_balance == 1000.0
    assert len(portfolio.positions) == 0

def test_futures_portfolio_unrealized_pnl():
    portfolio = FuturesPortfolioState(initial_usdt=1000.0)
    pos = FuturesPosition(
        symbol="BTCUSDT",
        side=PositionSide.LONG,
        quantity=1.0,
        entry_price=50000.0,
        leverage=10
    )
    portfolio.positions["BTCUSDT"] = pos

    portfolio.update_mark_price("BTCUSDT", 51000.0)
    assert pos.unrealized_pnl == 1000.0  # (51000.0 - 50000.0) * 1.0

    # Short position
    pos_short = FuturesPosition(
        symbol="ETHUSDT",
        side=PositionSide.SHORT,
        quantity=10.0,
        entry_price=2000.0,
        leverage=10
    )
    portfolio.positions["ETHUSDT"] = pos_short
    portfolio.update_mark_price("ETHUSDT", 1900.0)
    assert pos_short.unrealized_pnl == 1000.0  # (2000.0 - 1900.0) * 10.0

def test_futures_portfolio_cross_liquidation():
    from tradelab_sdk.futures_portfolio import FuturesPortfolioState, FuturesPosition
    from tradelab_sdk.types import PositionSide, Bar
    from datetime import datetime
    from decimal import Decimal

    portfolio = FuturesPortfolioState(initial_usdt=1000.0)
    pos = FuturesPosition(
        symbol="BTCUSDT",
        side=PositionSide.LONG,
        quantity=1.0,
        entry_price=50000.0,
        leverage=50
    )
    portfolio.positions["BTCUSDT"] = pos

    # Đảm bảo không còn thuộc tính liquidation_price cố định
    assert not hasattr(pos, "liquidation_price")

    # Giá giảm chưa tới mức thanh lý chéo (Equity = 500 > TMM = 198)
    candle_safe = Bar(
        open_time=datetime(2026, 1, 1, 1, 0),
        open=Decimal("49500"),
        high=Decimal("49500"),
        low=Decimal("49500"),
        close=Decimal("49500"),
        volume=Decimal("10"),
    )
    portfolio.update_mark_price("BTCUSDT", 49500.0)
    liqs = portfolio.evaluate_liquidations("BTCUSDT", candle_safe)
    assert len(liqs) == 0
    assert "BTCUSDT" in portfolio.positions

    # Giá giảm quá mức thanh lý chéo (Equity = 100 < TMM = 196.4) -> Cháy chéo!
    candle_liq = Bar(
        open_time=datetime(2026, 1, 1, 2, 0),
        open=Decimal("49100"),
        high=Decimal("49100"),
        low=Decimal("49100"),
        close=Decimal("49100"),
        volume=Decimal("10"),
    )
    portfolio.update_mark_price("BTCUSDT", 49100.0)
    liqs = portfolio.evaluate_liquidations("BTCUSDT", candle_liq)

    assert len(liqs) == 1
    assert liqs[0]["symbol"] == "BTCUSDT"
    assert liqs[0]["reason"] == "LIQUIDATION_CROSS_MARGIN"
    assert "BTCUSDT" not in portfolio.positions
    assert portfolio.liquidated is True


def test_futures_portfolio_funding_fee():
    from tradelab_sdk.futures_portfolio import FuturesPortfolioState, FuturesPosition
    from tradelab_sdk.types import PositionSide, Bar
    from datetime import datetime
    from decimal import Decimal

    portfolio = FuturesPortfolioState(initial_usdt=1000.0)
    pos = FuturesPosition(
        symbol="BTCUSDT",
        side=PositionSide.LONG,
        quantity=1.0,
        entry_price=50000.0,
        leverage=10
    )
    portfolio.positions["BTCUSDT"] = pos

    # Nến lúc 07:00 (chưa qua mốc 08:00), last_funding_time được khởi tạo làm mốc 00:00
    candle1 = Bar(open_time=datetime(2026, 1, 1, 7, 0), open=Decimal("50000"), high=Decimal("50000"), low=Decimal("50000"), close=Decimal("50000"), volume=Decimal("10"))
    portfolio.update_mark_price("BTCUSDT", 50000.0)
    liqs = portfolio.evaluate_liquidations("BTCUSDT", candle1)
    
    assert len(portfolio.funding_events) == 0
    assert portfolio.margin_balance == 1000.0

    # Nến lúc 08:05 (đã qua mốc 08:00), kích hoạt phí funding
    # Phí = 1.0 * 50000 * 0.0001 = 5.0. LONG trả phí -> balance giảm xuống 995.0
    candle2 = Bar(open_time=datetime(2026, 1, 1, 8, 5), open=Decimal("50000"), high=Decimal("50000"), low=Decimal("50000"), close=Decimal("50000"), volume=Decimal("10"))
    portfolio.update_mark_price("BTCUSDT", 50000.0)
    liqs2 = portfolio.evaluate_liquidations("BTCUSDT", candle2)
    
    assert len(portfolio.funding_events) == 1
    assert portfolio.margin_balance == 995.0
    assert pos.funding_fee_accrued == -5.0


def test_futures_portfolio_tracks_latest_mark_prices():
    portfolio = FuturesPortfolioState(initial_usdt=1000.0)
    btc = FuturesPosition("BTCUSDT", PositionSide.LONG, 1.0, 50000.0, leverage=50)
    eth = FuturesPosition("ETHUSDT", PositionSide.SHORT, 10.0, 2000.0, leverage=20)
    portfolio.positions["BTCUSDT"] = btc
    portfolio.positions["ETHUSDT"] = eth

    portfolio.update_mark_price("BTCUSDT", 49500.0)
    portfolio.update_mark_price("ETHUSDT", 1900.0)

    assert portfolio.mark_price_for("BTCUSDT") == 49500.0
    assert portfolio.mark_price_for("ETHUSDT") == 1900.0


def test_futures_portfolio_exposes_cross_margin_helpers():
    portfolio = FuturesPortfolioState(initial_usdt=1000.0)
    btc = FuturesPosition("BTCUSDT", PositionSide.LONG, 1.0, 50000.0, leverage=50)
    eth = FuturesPosition("ETHUSDT", PositionSide.SHORT, 10.0, 2000.0, leverage=20)
    portfolio.positions["BTCUSDT"] = btc
    portfolio.positions["ETHUSDT"] = eth

    portfolio.update_mark_price("BTCUSDT", 49500.0)
    portfolio.update_mark_price("ETHUSDT", 1900.0)

    assert portfolio.portfolio_equity() == 1500.0
    assert portfolio.total_maintenance_margin() == 274.0

def test_futures_portfolio_applies_all_elapsed_funding_boundaries():
    portfolio = FuturesPortfolioState(initial_usdt=1000.0)
    position = FuturesPosition(
        symbol="BTCUSDT",
        side=PositionSide.LONG,
        quantity=1.0,
        entry_price=50000.0,
        leverage=10,
    )
    portfolio.positions["BTCUSDT"] = position

    portfolio.update_mark_price("BTCUSDT", 50000.0)
    portfolio.evaluate_liquidations(
        "BTCUSDT",
        Bar(
            open_time=datetime(2026, 1, 1, 7, 0),
            open=Decimal("50000"),
            high=Decimal("50000"),
            low=Decimal("50000"),
            close=Decimal("50000"),
            volume=Decimal("1"),
        ),
    )
    portfolio.update_mark_price("BTCUSDT", 50000.0)
    portfolio.evaluate_liquidations(
        "BTCUSDT",
        Bar(
            open_time=datetime(2026, 1, 2, 7, 0),
            open=Decimal("50000"),
            high=Decimal("50000"),
            low=Decimal("50000"),
            close=Decimal("50000"),
            volume=Decimal("1"),
        ),
    )

    assert len(portfolio.funding_events) == 3
    assert portfolio.margin_balance == 985.0


def test_futures_portfolio_cross_liquidates_using_all_latest_marks():
    portfolio = FuturesPortfolioState(initial_usdt=1000.0)
    btc = FuturesPosition("BTCUSDT", PositionSide.LONG, 1.0, 50000.0, leverage=50)
    eth = FuturesPosition("ETHUSDT", PositionSide.LONG, 10.0, 2000.0, leverage=50)
    portfolio.positions["BTCUSDT"] = btc
    portfolio.positions["ETHUSDT"] = eth

    portfolio.update_mark_price("BTCUSDT", 40000.0)
    portfolio.update_mark_price("ETHUSDT", 1000.0)

    liquidations = portfolio.evaluate_liquidations(
        "ETHUSDT",
        Bar(
            open_time=datetime(2026, 1, 1, 2, 0),
            open=Decimal("1000"),
            high=Decimal("1000"),
            low=Decimal("1000"),
            close=Decimal("1000"),
            volume=Decimal("1"),
        ),
    )

    assert portfolio.liquidated is True
    assert {item["symbol"] for item in liquidations} == {"BTCUSDT", "ETHUSDT"}
