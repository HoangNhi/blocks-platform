# encoding: utf-8
import pytest
from tradelab_sdk.types import PositionSide
from tradelab_sdk.portfolio_spot import SpotPortfolioState, SpotPosition
from tradelab_sdk.futures_portfolio import FuturesPortfolioState, FuturesPosition

def test_spot_portfolio():
    portfolio = SpotPortfolioState(100.0)
    pos = SpotPosition("BTCUSDT", PositionSide.LONG, 0.001, 50000.0)
    portfolio.positions["BTCUSDT"] = pos
    portfolio.update_mark_price("BTCUSDT", 51000.0)
    assert pos.unrealized_pnl == 1.0 # 0.001 * 1000
    
def test_futures_portfolio_isolated():
    portfolio = FuturesPortfolioState(100.0)
    pos = FuturesPosition("BTCUSDT", PositionSide.SHORT, 0.001, 50000.0, leverage=10, margin_mode="ISOLATED")
    portfolio.positions["BTCUSDT"] = pos
    portfolio.update_mark_price("BTCUSDT", 49000.0)
    assert pos.unrealized_pnl == 1.0 # (50000 - 49000) * 0.001
