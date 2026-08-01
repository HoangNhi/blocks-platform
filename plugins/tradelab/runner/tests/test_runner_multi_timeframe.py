# encoding: utf-8
import pytest
from datetime import datetime, timezone
from tradelab_sdk.runner import execute_strategy_payload

def test_runner_multi_timeframe():
    candles = [
        {"open_time": "2026-01-01T00:00:00Z", "open": 100, "high": 105, "low": 98, "close": 102, "volume": 10},
        {"open_time": "2026-01-01T00:01:00Z", "open": 102, "high": 104, "low": 100, "close": 103, "volume": 15},
    ]
    
    # Chiến lược ghi lại giá đóng cửa nến 5m
    strategy_source = """
# global recorded_tf_closes
if "recorded_tf_closes" not in globals():
    recorded_tf_closes = []

def on_start(ctx):
    pass

def on_candle(ctx):
    tf_5m = ctx.history.tf("5m")
    if tf_5m and len(tf_5m.get("close", [])) > 0:
        recorded_tf_closes.append(tf_5m["close"][-1])
"""
    
    payload = {
        "strategy_source": strategy_source,
        "symbol": "BTCUSDT",
        "timeframe": "1m",
        "candles": candles,
        "config": {},
        "state": {
            "account_state": {"cash": 1000.0, "realized_pnl": 0.0},
            "market_type": "spot",
        }
    }
    
    # Vì execute_strategy_payload tạo ra local namespace mới và chạy exec,
    # chúng ta có thể truyền vào một biến toàn cục giả thông qua việc thay đổi strategy_source
    # hoặc chúng ta có thể trả kết quả qua logger hoặc qua một action.
    # Để đơn giản và chính xác hơn cho việc test, ta sẽ lưu kết quả vào ctx.logger (ctx.log)
    
    strategy_source_with_log = """
def on_candle(ctx):
    tf_5m = ctx.history.tf("5m")
    if tf_5m and len(tf_5m.get("close", [])) > 0:
        ctx.logger({"close_5m": float(tf_5m["close"][-1])})
"""
    payload["strategy_source"] = strategy_source_with_log
    
    result = execute_strategy_payload(payload)
    
    assert result["status"] == "ok"
    logs = result["logs"]
    assert len(logs) == 2
    # Tại nến 1 (00:00:00), nến 5m có giá close = 102
    assert logs[0]["close_5m"] == 102.0
    # Tại nến 2 (00:01:00), nến 5m cập nhật giá close = 103
    assert logs[1]["close_5m"] == 103.0


def test_runner_multi_timeframe_rejects_non_multiple_aux_request():
    payload = {
        "strategy_source": """
def on_candle(ctx):
    ctx.history.tf("1h")
""",
        "symbol": "BTCUSDT",
        "timeframe": "45m",
        "candles": [
            {
                "open_time": "2026-01-01T00:00:00Z",
                "open": 100,
                "high": 105,
                "low": 98,
                "close": 102,
                "volume": 10,
            }
        ],
        "config": {},
        "state": {"market_type": "usd_m_futures"},
    }

    with pytest.raises(
        ValueError,
        match="Requested timeframe 1h must be an exact multiple of primary timeframe 45m",
    ):
        execute_strategy_payload(payload)
