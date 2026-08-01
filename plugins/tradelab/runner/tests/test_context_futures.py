# encoding: utf-8
import pytest
from tradelab_sdk.context import StrategyContext
from tradelab_sdk.history import HistoryProvider

def test_strategy_context_extensions():
    ctx = StrategyContext(symbol="BTCUSDT", timeframe="1h")
    # Giả lập thiết lập HistoryProvider
    ctx.history = HistoryProvider("1h")
    
    # Kiểm tra cài đặt leverage
    ctx.set_leverage(5)
    assert ctx.state.get("leverage") == 5
    
    # Kiểm tra cài đặt margin mode
    ctx.set_margin_mode("ISOLATED")
    assert ctx.state.get("margin_mode") == "ISOLATED"
    
    # Kiểm tra đọc tài khoản (account properties)
    assert ctx.account is None
    assert ctx.position is None
