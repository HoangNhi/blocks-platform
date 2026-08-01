# encoding: utf-8
from typing import Dict, List, Any
from datetime import datetime, timezone

class HistoryProvider:
    def __init__(self, primary_timeframe: str):
        self.primary_timeframe = primary_timeframe
        self._data: Dict[str, List[Any]] = {}
        self._aux: Dict[str, Dict[str, List[Any]]] = {}

    def __getitem__(self, key: str) -> List[Any]:
        return self._data.get(key, [])
        
    def __setitem__(self, key: str, value: List[Any]):
        self._data[key] = value

    def get(self, key: str, default: Any = None) -> Any:
        return self._data.get(key, default)

    def keys(self):
        return self._data.keys()

    def values(self):
        return self._data.values()

    def items(self):
        return self._data.items()

    def append(self, key: str, value: Any):
        if key not in self._data:
            self._data[key] = []
        self._data[key].append(value)

    def _parse_timeframe_to_seconds(self, tf: str) -> int:
        if not tf: return 0
        unit = tf[-1].lower()
        try:
            value = int(tf[:-1])
        except ValueError:
            return 0
        
        if unit == 's': return value
        if unit == 'm': return value * 60
        if unit == 'h': return value * 3600
        if unit == 'd': return value * 86400
        if unit == 'w': return value * 86400 * 7
        return 0

    def append_candle(self, candle: dict[str, Any]):
        for key, value in candle.items():
            if key not in self._data:
                self._data[key] = []
            self._data[key].append(value)
            
        if not self._aux:
            return
            
        open_time = candle.get("open_time")
        if not open_time or not isinstance(open_time, datetime):
            return
            
        open_time_ts = open_time.timestamp()
        
        for aux_tf, aux_data in self._aux.items():
            aux_seconds = self._parse_timeframe_to_seconds(aux_tf)
            if aux_seconds == 0: continue
            
            boundary_start = (open_time_ts // aux_seconds) * aux_seconds
            
            if not aux_data["open_time"] or aux_data["open_time"][-1].timestamp() != boundary_start:
                aux_data["open_time"].append(datetime.fromtimestamp(boundary_start, tz=open_time.tzinfo))
                aux_data["open"].append(candle.get("open", 0.0))
                aux_data["high"].append(candle.get("high", 0.0))
                aux_data["low"].append(candle.get("low", 0.0))
                aux_data["close"].append(candle.get("close", 0.0))
                aux_data["volume"].append(candle.get("volume", 0.0))
            else:
                aux_data["high"][-1] = max(aux_data["high"][-1], candle.get("high", 0.0))
                aux_data["low"][-1] = min(aux_data["low"][-1], candle.get("low", 0.0))
                aux_data["close"][-1] = candle.get("close", 0.0)
                aux_data["volume"][-1] += candle.get("volume", 0.0)

    def _validate_requested_timeframe(self, timeframe: str) -> int:
        primary_seconds = self._parse_timeframe_to_seconds(self.primary_timeframe)
        requested_seconds = self._parse_timeframe_to_seconds(timeframe)
        if requested_seconds == 0:
            raise ValueError(f"Unsupported timeframe {timeframe}")
        if primary_seconds == 0:
            raise ValueError(f"Unsupported primary timeframe {self.primary_timeframe}")
        if requested_seconds < primary_seconds:
            raise ValueError(
                f"Requested timeframe {timeframe} must be greater than or equal to primary timeframe {self.primary_timeframe}"
            )
        if requested_seconds % primary_seconds != 0:
            raise ValueError(
                f"Requested timeframe {timeframe} must be an exact multiple of primary timeframe {self.primary_timeframe}"
            )
        return requested_seconds

    def tf(self, timeframe: str) -> Dict[str, List[Any]]:
        """Truy cập dữ liệu khung thời gian phụ trợ, tự động gom nến theo cơ chế Lazy Aggregation."""
        if timeframe in self._aux:
            return self._aux[timeframe]
            
        aux_data: Dict[str, List[Any]] = {
            "open_time": [], "open": [], "high": [], "low": [], "close": [], "volume": []
        }
        
        aux_seconds = self._validate_requested_timeframe(timeframe)
        if not self._data.get("open_time"):
            self._aux[timeframe] = aux_data
            return aux_data
            
        for i in range(len(self._data["open_time"])):
            ot = self._data["open_time"][i]
            if not isinstance(ot, datetime): continue
            
            ot_ts = ot.timestamp()
            boundary = (ot_ts // aux_seconds) * aux_seconds
            
            c_open = self._data.get("open", [])[i] if i < len(self._data.get("open", [])) else 0.0
            c_high = self._data.get("high", [])[i] if i < len(self._data.get("high", [])) else 0.0
            c_low = self._data.get("low", [])[i] if i < len(self._data.get("low", [])) else 0.0
            c_close = self._data.get("close", [])[i] if i < len(self._data.get("close", [])) else 0.0
            c_vol = self._data.get("volume", [])[i] if i < len(self._data.get("volume", [])) else 0.0
            
            if not aux_data["open_time"] or aux_data["open_time"][-1].timestamp() != boundary:
                aux_data["open_time"].append(datetime.fromtimestamp(boundary, tz=ot.tzinfo))
                aux_data["open"].append(c_open)
                aux_data["high"].append(c_high)
                aux_data["low"].append(c_low)
                aux_data["close"].append(c_close)
                aux_data["volume"].append(c_vol)
            else:
                aux_data["high"][-1] = max(aux_data["high"][-1], c_high)
                aux_data["low"][-1] = min(aux_data["low"][-1], c_low)
                aux_data["close"][-1] = c_close
                aux_data["volume"][-1] += c_vol
                
        self._aux[timeframe] = aux_data
        return aux_data
