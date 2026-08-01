# encoding: utf-8
import pytest

from tradelab_sdk.runner import SDKRunner
from tradelab_sdk.types import MarketType
from tradelab_sdk.futures_portfolio import FuturesPosition, PositionSide

def test_runner_futures_liquidation():
    runner = SDKRunner(market_type=MarketType.USD_M_FUTURES)
    # inject a long position
    pos = FuturesPosition("BTCUSDT", PositionSide.LONG, 1.0, 50000.0, leverage=50)
    runner.portfolio.positions["BTCUSDT"] = pos
    
    # Gửi một nến giảm sâu gây cháy Cross Margin (Equity = 0 <= TMM = 160)
    candle = {"symbol": "BTCUSDT", "open_time": "2026-01-01T00:00:00Z", "open": 50000, "high": 50000, "low": 40000, "close": 40000, "volume": 1}
    runner.tick(candle)
    
    assert len(runner.portfolio.positions) == 0 # Đã bị thanh lý
    assert len(runner.orders) == 1
    assert runner.orders[0].type == "LIQUIDATION"

def test_runner_futures_tick_uses_explicit_candle_symbol():
    runner = SDKRunner(market_type=MarketType.USD_M_FUTURES, symbol="ETHUSDT")
    runner.portfolio.positions["ETHUSDT"] = FuturesPosition(
        "ETHUSDT",
        PositionSide.LONG,
        10.0,
        2000.0,
        leverage=50,
    )

    runner.tick(
        {
            "symbol": "ETHUSDT",
            "open_time": "2026-01-01T00:00:00Z",
            "open": 2000,
            "high": 2000,
            "low": 1000,
            "close": 1000,
            "volume": 1,
        }
    )

    assert "ETHUSDT" not in runner.portfolio.positions
    assert runner.orders[0].symbol == "ETHUSDT"


def test_runner_futures_tick_requires_symbol():
    runner = SDKRunner(market_type=MarketType.USD_M_FUTURES)

    with pytest.raises(ValueError, match="Futures tick requires an explicit symbol"):
        runner.tick(
            {
                "open_time": "2026-01-01T00:00:00Z",
                "open": 50000,
                "high": 50000,
                "low": 40000,
                "close": 40000,
                "volume": 1,
            }
        )
