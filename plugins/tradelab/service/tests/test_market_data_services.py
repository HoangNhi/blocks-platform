from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import httpx

from tradelab_api.services.exchanges.binance_spot import BinanceSpotClient
from tradelab_api.services.market_data_service import (
    execute_import_job,
    import_candles,
    parse_binance_symbol_metadata,
    sync_binance_symbols,
)
from tradelab_api.services.market_data_repository import MarketDataRepository


def test_symbol_filter_parsing() -> None:
    symbol = parse_binance_symbol_metadata(
        {
            "symbol": "BTCUSDT",
            "baseAsset": "BTC",
            "quoteAsset": "USDT",
            "status": "TRADING",
            "isSpotTradingAllowed": True,
            "filters": [
                {"filterType": "PRICE_FILTER", "tickSize": "0.10"},
                {"filterType": "LOT_SIZE", "stepSize": "0.001", "minQty": "0.001"},
                {"filterType": "MIN_NOTIONAL", "minNotional": "5.0"},
            ],
        }
    )

    assert symbol["exchange"] == "binance"
    assert symbol["tick_size"] == 0.1
    assert symbol["step_size"] == 0.001
    assert symbol["min_qty"] == 0.001
    assert symbol["min_notional"] == 5.0


def test_binance_client_parses_exchange_info_and_klines() -> None:
    transport = httpx.MockTransport(_binance_mock_handler)
    client = BinanceSpotClient(client=httpx.Client(transport=transport, base_url="https://api.binance.com"))

    info = client.get_exchange_info()
    klines = client.get_klines(
        symbol="BTCUSDT",
        interval="1h",
        start_time=datetime(2026, 1, 1, tzinfo=timezone.utc),
        end_time=datetime(2026, 1, 2, tzinfo=timezone.utc),
    )

    assert info["symbols"][0]["symbol"] == "BTCUSDT"
    assert klines[0]["open"] == 1.0
    assert klines[0]["trade_count"] == 10


def test_idempotent_candle_upsert_and_failed_job_records_error() -> None:
    repository = FakeMarketDataRepository()
    client = FakeKlineClient()

    first = import_candles(
        repository,
        client,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        start_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        end_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
    )
    second = import_candles(
        repository,
        client,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        start_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        end_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
    )

    assert first.rows_imported == 1
    assert second.rows_imported == 0
    assert repository.jobs[-1]["status"] == "completed"

    failing_repository = FakeMarketDataRepository()
    failing_client = FailingKlineClient()
    failed = import_candles(
        failing_repository,
        failing_client,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        start_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        end_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
    )

    assert failed.rows_imported == 0
    assert failed.error_message == "boom"
    assert failing_repository.jobs[-1]["status"] == "failed"


def test_import_candles_paginates_until_the_requested_end() -> None:
    repository = FakeMarketDataRepository()
    client = PaginatedKlineClient()

    result = import_candles(
        repository,
        client,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        start_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        end_at=datetime(2026, 2, 20, tzinfo=timezone.utc),
    )

    assert result.rows_imported == 1005
    assert len(repository.candles) == 1005
    assert client.call_count == 3


def test_symbol_sync_uses_repository_upsert() -> None:
    repository = FakeExchangeRepository()
    synced = sync_binance_symbols(repository, FakeExchangeInfoClient())

    assert len(synced) == 1
    assert repository.symbols[0]["symbol"] == "BTCUSDT"


def test_execute_import_job_refreshes_coverage_from_full_dataset() -> None:
    repository = ExecuteImportRepository(
        existing_candles=[
            _market_candle_row(0),
            _market_candle_row(4),
        ]
    )
    import_job = SimpleNamespace(
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        job_type="fill",
        requested_start_at=datetime(2026, 1, 1, 0, tzinfo=timezone.utc),
        requested_end_at=datetime(2026, 1, 1, 4, tzinfo=timezone.utc),
        applied_start_at=datetime(2026, 1, 1, 1, tzinfo=timezone.utc),
        applied_end_at=datetime(2026, 1, 1, 3, tzinfo=timezone.utc),
        start_at=datetime(2026, 1, 1, 0, tzinfo=timezone.utc),
        end_at=datetime(2026, 1, 1, 4, tzinfo=timezone.utc),
        metadata_={
            "missingRanges": [
                {
                    "startAt": "2026-01-01T01:00:00+00:00",
                    "endAt": "2026-01-01T03:00:00+00:00",
                }
            ]
        },
        started_at=None,
        claimed_at=None,
        worker_id=None,
        status="queued",
    )

    result = execute_import_job(
        market_repository=repository,
        import_job=import_job,
        client=RangeKlineClient([_kline_row(1), _kline_row(2), _kline_row(3)]),
    )

    assert result.rows_imported == 3
    assert repository.coverage_refresh_hours == [0, 1, 2, 3, 4]


def test_refresh_coverage_from_candles_preserves_segments_and_gap_count() -> None:
    repository = CoverageRefreshRepository()

    coverage = MarketDataRepository.refresh_coverage_from_candles(
        repository,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        candles=[
            SimpleNamespace(**_market_candle_row(0)),
            SimpleNamespace(**_market_candle_row(1)),
            SimpleNamespace(**_market_candle_row(3)),
        ],
        health_status="healthy",
        metadata={"createdBy": "codex"},
    )

    assert coverage.id == "coverage-1"
    assert repository.coverage_fields["earliest_open_time"] == datetime(2026, 1, 1, 0, tzinfo=timezone.utc)
    assert repository.coverage_fields["latest_open_time"] == datetime(2026, 1, 1, 3, tzinfo=timezone.utc)
    assert repository.coverage_fields["segment_count"] == 2
    assert repository.coverage_fields["gap_count"] == 1
    assert repository.coverage_fields["health_status"] == "incomplete"
    assert repository.segment_rows == [
        {
            "segment_index": 0,
            "start_at": datetime(2026, 1, 1, 0, tzinfo=timezone.utc),
            "end_at": datetime(2026, 1, 1, 1, tzinfo=timezone.utc),
            "row_count": 2,
            "metadata_": {"source": "refresh_coverage_from_candles"},
            "created_by": "codex",
        },
        {
            "segment_index": 1,
            "start_at": datetime(2026, 1, 1, 3, tzinfo=timezone.utc),
            "end_at": datetime(2026, 1, 1, 3, tzinfo=timezone.utc),
            "row_count": 1,
            "metadata_": {"source": "refresh_coverage_from_candles"},
            "created_by": "codex",
        },
    ]


def _binance_mock_handler(request: httpx.Request) -> httpx.Response:
    if request.url.path.endswith("/exchangeInfo"):
        return httpx.Response(200, json=_exchange_info_payload())
    if request.url.path.endswith("/klines"):
        return httpx.Response(200, json=_klines_payload())
    return httpx.Response(404, json={})


def _exchange_info_payload() -> dict[str, object]:
    return {
        "symbols": [
            {
                "symbol": "BTCUSDT",
                "baseAsset": "BTC",
                "quoteAsset": "USDT",
                "status": "TRADING",
                "isSpotTradingAllowed": True,
                "filters": [
                    {"filterType": "PRICE_FILTER", "tickSize": "0.10"},
                    {"filterType": "LOT_SIZE", "stepSize": "0.001", "minQty": "0.001"},
                    {"filterType": "MIN_NOTIONAL", "minNotional": "5.0"},
                ],
            }
        ]
    }


def _klines_payload() -> list[list[object]]:
    return [
        [1735689600000, "1", "2", "0.5", "1.5", "10", 1735693200000, "15", 10, "5", "7.5", "0"],
    ]


class FakeMarketDataRepository:
    def __init__(self) -> None:
        self.candles: list[dict[str, object]] = []
        self.jobs: list[dict[str, object]] = []

    def create_import_job(self, **fields: object):  # noqa: ANN001
        self.jobs.append(dict(fields))
        return SimpleNamespace(**self.jobs[-1])

    def list_market_candles(self, **fields: object):  # noqa: ANN001
        return [
            type("Candle", (), {"open_time": candle["open_time"]})()
            for candle in self.candles
            if candle["exchange"] == fields.get("exchange")
            and candle["symbol"] == fields.get("symbol")
            and candle["timeframe"] == fields.get("timeframe")
        ]

    def create_market_candles(self, candles: list[dict[str, object]]):  # noqa: ANN001
        self.candles.extend(candles)
        return [
            SimpleNamespace(**candle)
            for candle in candles
        ]

    def update(self, obj: object, **fields: object):  # noqa: ANN001
        obj.__dict__.update(fields)  # type: ignore[attr-defined]
        self.jobs.append(obj.__dict__)
        return obj


class FakeKlineClient:
    def __init__(self) -> None:
        self.calls = 0

    def get_klines(self, **_: object):  # noqa: ANN001
        self.calls += 1
        if self.calls > 1:
            return []
        return [
            {
                "open_time": datetime(2026, 1, 1, tzinfo=timezone.utc),
                "close_time": datetime(2026, 1, 1, 1, tzinfo=timezone.utc),
                "open": 1.0,
                "high": 2.0,
                "low": 0.5,
                "close": 1.5,
                "volume": 10.0,
                "quote_volume": 15.0,
                "trade_count": 10,
            }
        ]


class FailingKlineClient:
    def get_klines(self, **_: object):  # noqa: ANN001
        raise RuntimeError("boom")


class PaginatedKlineClient:
    def __init__(self) -> None:
        self.call_count = 0

    def get_klines(self, **fields: object):  # noqa: ANN001
        self.call_count += 1
        start_time = fields["start_time"]
        if self.call_count == 1:
            return [_paginated_row(index) for index in range(1000)]
        if self.call_count == 2 and start_time == datetime(2026, 2, 11, 16, tzinfo=timezone.utc):
            return [_paginated_row(index) for index in range(1000, 1005)]
        return []


class FakeExchangeRepository:
    def __init__(self) -> None:
        self.symbols: list[dict[str, object]] = []

    def upsert_exchange_symbol(self, **fields: object):  # noqa: ANN001
        self.symbols.append(dict(fields))
        return SimpleNamespace(**self.symbols[-1])


class FakeExchangeInfoClient:
    def get_exchange_info(self) -> dict[str, object]:
        return _exchange_info_payload()


class ExecuteImportRepository:
    def __init__(self, *, existing_candles: list[dict[str, object]]) -> None:
        self.candles = list(existing_candles)
        self.coverage_refresh_hours: list[int] = []

    def list_market_candles(self, **fields: object):  # noqa: ANN001
        rows = self.candles
        if fields.get("exchange") is not None:
            rows = [row for row in rows if row["exchange"] == fields["exchange"]]
        if fields.get("symbol") is not None:
            rows = [row for row in rows if row["symbol"] == fields["symbol"]]
        if fields.get("timeframe") is not None:
            rows = [row for row in rows if row["timeframe"] == fields["timeframe"]]
        if fields.get("start_at") is not None:
            rows = [row for row in rows if row["open_time"] >= fields["start_at"]]
        if fields.get("end_at") is not None:
            rows = [row for row in rows if row["open_time"] <= fields["end_at"]]
        return [SimpleNamespace(**row) for row in rows]

    def create_market_candles(self, candles: list[dict[str, object]]):  # noqa: ANN001
        self.candles.extend(candles)
        self.candles.sort(key=lambda row: row["open_time"])
        return [SimpleNamespace(**candle) for candle in candles]

    def replace_market_candles(self, **fields: object):  # noqa: ANN001
        start_at = fields["start_at"]
        end_at = fields["end_at"]
        self.candles = [
            candle
            for candle in self.candles
            if not (
                candle["exchange"] == fields["exchange"]
                and candle["symbol"] == fields["symbol"]
                and candle["timeframe"] == fields["timeframe"]
                and start_at <= candle["open_time"] <= end_at
            )
        ]
        return self.create_market_candles(fields["candles"])

    def refresh_coverage_from_candles(self, **fields: object):  # noqa: ANN001
        candles = fields["candles"]
        self.coverage_refresh_hours = [candle.open_time.hour for candle in candles]
        return SimpleNamespace(id="coverage-1")

    def complete_import_job(self, job, **fields: object):  # noqa: ANN001
        job.__dict__.update(fields)  # type: ignore[attr-defined]
        return job


class CoverageRefreshRepository:
    def __init__(self) -> None:
        self.coverage_fields: dict[str, object] = {}
        self.segment_rows: list[dict[str, object]] = []

    def create_or_update_coverage(self, **fields: object):  # noqa: ANN001
        self.coverage_fields = dict(fields)
        return SimpleNamespace(id="coverage-1")

    def replace_coverage_segments(self, *, coverage_id: str, segments: list[dict[str, object]]):  # noqa: ANN001
        self.segment_rows = list(segments)
        return [SimpleNamespace(coverage_id=coverage_id, **segment) for segment in segments]


class RangeKlineClient:
    def __init__(self, rows: list[dict[str, object]]) -> None:
        self.rows = rows

    def get_klines(self, **fields: object):  # noqa: ANN001
        start_at = fields["start_time"]
        end_at = fields["end_time"]
        limit = fields.get("limit")
        rows = [
            row
            for row in self.rows
            if start_at <= row["open_time"] <= end_at
        ]
        if isinstance(limit, int):
            return rows[:limit]
        return rows


def _kline_row(hour: int) -> dict[str, object]:
    timestamp = datetime(2026, 1, 1, hour, tzinfo=timezone.utc)
    return {
        "open_time": timestamp,
        "close_time": timestamp,
        "open": 1.0 + hour,
        "high": 2.0 + hour,
        "low": 0.5 + hour,
        "close": 1.5 + hour,
        "volume": 10.0 + hour,
        "quote_volume": 15.0 + hour,
        "trade_count": 10 + hour,
    }


def _market_candle_row(hour: int) -> dict[str, object]:
    row = _kline_row(hour)
    return {
        "exchange": "binance",
        "symbol": "BTCUSDT",
        "timeframe": "1h",
        "open_time": row["open_time"],
        "close_time": row["close_time"],
        "open": row["open"],
        "high": row["high"],
        "low": row["low"],
        "close": row["close"],
        "volume": row["volume"],
        "quote_volume": row["quote_volume"],
        "trade_count": row["trade_count"],
        "source": "binance",
    }


def _paginated_row(index: int) -> dict[str, object]:
    timestamp = datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(hours=index)
    return {
        "open_time": timestamp,
        "close_time": timestamp + timedelta(hours=1),
        "open": 1.0 + index,
        "high": 2.0 + index,
        "low": 0.5 + index,
        "close": 1.5 + index,
        "volume": 10.0 + index,
        "quote_volume": 15.0 + index,
        "trade_count": 10 + index,
    }
