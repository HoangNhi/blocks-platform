from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from time import sleep
from typing import Any

import httpx


@dataclass(slots=True)
class BinanceKline:
    open_time: datetime
    close_time: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    quote_volume: float | None
    trade_count: int | None


class BinanceSpotClient:
    def __init__(
        self,
        *,
        base_url: str = "https://api.binance.com",
        timeout: float = 10.0,
        max_retries: int = 2,
        client: httpx.Client | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.max_retries = max_retries
        self._client = client or httpx.Client(timeout=timeout)

    def get_exchange_info(self) -> dict[str, Any]:
        response = self._request("GET", "/api/v3/exchangeInfo")
        return response.json()

    def get_klines(
        self,
        symbol: str,
        interval: str,
        start_time: datetime,
        end_time: datetime,
        limit: int = 1000,
    ) -> list[dict[str, Any]]:
        response = self._request(
            "GET",
            "/api/v3/klines",
            params={
                "symbol": symbol,
                "interval": interval,
                "startTime": int(start_time.timestamp() * 1000),
                "endTime": int(end_time.timestamp() * 1000),
                "limit": limit,
            },
        )
        rows = response.json()
        return [self._parse_kline_row(row) for row in rows]

    def _request(self, method: str, path: str, params: dict[str, Any] | None = None) -> httpx.Response:
        last_error: Exception | None = None
        for attempt in range(self.max_retries + 1):
            try:
                response = self._client.request(method, f"{self.base_url}{path}", params=params)
                response.raise_for_status()
                return response
            except (httpx.HTTPError, httpx.TimeoutException) as exc:
                last_error = exc
                if attempt == self.max_retries:
                    raise
                sleep(0.05 * (attempt + 1))
        raise RuntimeError("Binance request failed unexpectedly") from last_error

    @staticmethod
    def _parse_kline_row(row: list[Any]) -> dict[str, Any]:
        return {
            "open_time": datetime.fromtimestamp(row[0] / 1000, tz=timezone.utc),
            "open": float(row[1]),
            "high": float(row[2]),
            "low": float(row[3]),
            "close": float(row[4]),
            "volume": float(row[5]),
            "close_time": datetime.fromtimestamp(row[6] / 1000, tz=timezone.utc),
            "quote_volume": float(row[7]) if row[7] is not None else None,
            "trade_count": int(row[8]) if row[8] is not None else None,
            "taker_buy_base_volume": float(row[9]),
            "taker_buy_quote_volume": float(row[10]),
        }

