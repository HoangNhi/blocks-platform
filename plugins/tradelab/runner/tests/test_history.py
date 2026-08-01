# encoding: utf-8
import pytest
from datetime import datetime, timezone
from tradelab_sdk.history import HistoryProvider

def test_history_provider_basic():
    hp = HistoryProvider("1h")
    # Giả lập thêm dữ liệu nến bằng hàm append truyền thống
    hp.append("close", 10.0)
    hp.append("close", 20.0)
    
    assert hp["close"] == [10.0, 20.0]
    # Khi chưa có cơ chế aggregate (do không thể aggregate nếu không có nến đầy đủ OHLCV)
    # hoặc khi timeframe phụ trợ chưa tồn tại dữ liệu
    assert hp.tf("4h") == {"open_time": [], "open": [], "high": [], "low": [], "close": [], "volume": []}

def test_history_provider_lazy_aggregation():
    provider = HistoryProvider(primary_timeframe="1m")
    
    # Giả lập dữ liệu nến 1m đầy đủ
    c1 = {"open_time": datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc), "open": 100.0, "high": 105.0, "low": 98.0, "close": 102.0, "volume": 10.0}
    c2 = {"open_time": datetime(2026, 1, 1, 0, 1, 0, tzinfo=timezone.utc), "open": 102.0, "high": 104.0, "low": 100.0, "close": 103.0, "volume": 15.0}
    c3 = {"open_time": datetime(2026, 1, 1, 0, 5, 0, tzinfo=timezone.utc), "open": 103.0, "high": 110.0, "low": 101.0, "close": 108.0, "volume": 20.0}
    
    provider.append_candle(c1)
    provider.append_candle(c2)
    
    # Yêu cầu khung thời gian phụ trợ 5m
    tf_5m = provider.tf("5m")
    
    assert len(tf_5m["open_time"]) == 1
    assert tf_5m["open_time"][0] == datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    assert tf_5m["open"][0] == 100.0
    assert tf_5m["high"][0] == 105.0
    assert tf_5m["low"][0] == 98.0
    assert tf_5m["close"][0] == 103.0
    assert tf_5m["volume"][0] == 25.0
    
    # Append nến tiếp theo thuộc bucket 5m tiếp theo (00:05:00)
    # Cơ chế cập nhật gia tăng (incremental) sẽ tự kích hoạt cho tf_5m
    provider.append_candle(c3)
    
    tf_5m_updated = provider.tf("5m")
    assert len(tf_5m_updated["open_time"]) == 2
    assert tf_5m_updated["open_time"][1] == datetime(2026, 1, 1, 0, 5, 0, tzinfo=timezone.utc)
    assert tf_5m_updated["open"][1] == 103.0
    assert tf_5m_updated["high"][1] == 110.0
    assert tf_5m_updated["low"][1] == 101.0
    assert tf_5m_updated["close"][1] == 108.0
    assert tf_5m_updated["volume"][1] == 20.0

def test_history_provider_rejects_finer_timeframe_requests():
    provider = HistoryProvider(primary_timeframe="1h")

    with pytest.raises(
        ValueError,
        match="Requested timeframe 30m must be greater than or equal to primary timeframe 1h",
    ):
        provider.tf("30m")

def test_history_provider_rejects_non_multiple_timeframe_requests():
    provider = HistoryProvider(primary_timeframe="45m")

    with pytest.raises(
        ValueError,
        match="Requested timeframe 1h must be an exact multiple of primary timeframe 45m",
    ):
        provider.tf("1h")

def test_history_provider_dictionary_compatibility():
    hp = HistoryProvider("1h")
    hp.append("close", 10.0)
    hp.append("volume", 100.0)

    assert hp.get("close") == [10.0]
    assert hp.get("open") is None
    assert hp.get("open", [1.0]) == [1.0]

    assert set(hp.keys()) == {"close", "volume"}
    assert list(hp.values()) == [[10.0], [100.0]]
    assert dict(hp.items()) == {"close": [10.0], "volume": [100.0]}
