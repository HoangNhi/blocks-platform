from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from tradelab_api.core.config import get_settings
from tradelab_api.db.models import ExchangeSymbol, MarketCandle, MarketDataImportJob
from tradelab_api.services.exchange_repository import ExchangeRepository
from tradelab_api.services.exchanges.binance_spot import BinanceSpotClient
from tradelab_api.services.market_data_integrity import inspect_candles, timeframe_to_timedelta
from tradelab_api.services.market_data_preflight import build_preflight_result
from tradelab_api.services.market_data_repository import MarketDataRepository, build_dataset_key


@dataclass(slots=True)
class MarketDataImportResult:
    job: MarketDataImportJob | None
    rows_imported: int
    candles: list[MarketCandle] = field(default_factory=list)
    coverage: Any | None = None
    error_message: str | None = None


def parse_binance_symbol_metadata(symbol_info: dict[str, Any]) -> dict[str, Any]:
    price_filter = next(
        (item for item in symbol_info.get("filters", []) if item.get("filterType") == "PRICE_FILTER"),
        {},
    )
    lot_size = next(
        (item for item in symbol_info.get("filters", []) if item.get("filterType") == "LOT_SIZE"),
        {},
    )
    min_notional_filter = next(
        (
            item
            for item in symbol_info.get("filters", [])
            if item.get("filterType") in {"MIN_NOTIONAL", "NOTIONAL"}
        ),
        {},
    )
    return {
        "exchange": "binance",
        "symbol": symbol_info["symbol"],
        "base_asset": symbol_info["baseAsset"],
        "quote_asset": symbol_info["quoteAsset"],
        "status": symbol_info.get("status", "UNKNOWN"),
        "tick_size": to_float_or_none(price_filter.get("tickSize")),
        "step_size": to_float_or_none(lot_size.get("stepSize")),
        "min_qty": to_float_or_none(lot_size.get("minQty")),
        "min_notional": to_float_or_none(
            min_notional_filter.get("minNotional") or min_notional_filter.get("notional")
        ),
        "metadata": symbol_info,
    }


def sync_binance_symbols(
    repository: ExchangeRepository,
    client: BinanceSpotClient,
) -> list[ExchangeSymbol]:
    exchange_info = client.get_exchange_info()
    synced: list[ExchangeSymbol] = []
    for symbol_info in exchange_info.get("symbols", []):
        if symbol_info.get("status") != "TRADING":
            continue
        if not symbol_info.get("isSpotTradingAllowed", True):
            continue
        synced.append(repository.upsert_exchange_symbol(**parse_binance_symbol_metadata(symbol_info)))
    return synced


def import_candles(
    repository: MarketDataRepository,
    client: BinanceSpotClient,
    *,
    exchange: str,
    symbol: str,
    timeframe: str,
    start_at: datetime,
    end_at: datetime,
) -> MarketDataImportResult:
    dataset_key = build_dataset_key(exchange, symbol, timeframe)
    job = repository.create_import_job(
        dataset_key=dataset_key,
        job_type="fill",
        exchange=exchange,
        symbol=symbol,
        timeframe=timeframe,
        requested_start_at=start_at,
        requested_end_at=end_at,
        applied_start_at=start_at,
        applied_end_at=end_at,
        start_at=start_at,
        end_at=end_at,
        status="running",
        rows_imported=0,
        error_message=None,
        metadata_={},
        created_by="trade-lab",
    )
    try:
        remote_candles = _fetch_remote_candles(
            client,
            symbol=symbol,
            timeframe=timeframe,
            start_at=start_at,
            end_at=end_at,
        )
        existing_candles = repository.list_market_candles(
            exchange=exchange,
            symbol=symbol,
            timeframe=timeframe,
            start_at=start_at,
            end_at=end_at,
        )
        existing_keys = {candle.open_time for candle in existing_candles}
        missing_rows = [
            {
                "exchange": exchange,
                "symbol": symbol,
                "timeframe": timeframe,
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
            for row in remote_candles
            if row["open_time"] not in existing_keys
        ]
        inserted = repository.create_market_candles(missing_rows) if missing_rows else []
        coverage = None
        refresh_coverage = getattr(repository, "refresh_coverage_from_candles", None)
        if callable(refresh_coverage):
            dataset_candles = repository.list_market_candles(
                exchange=exchange,
                symbol=symbol,
                timeframe=timeframe,
            )
            coverage = refresh_coverage(
                exchange=exchange,
                symbol=symbol,
                timeframe=timeframe,
                candles=dataset_candles,
                health_status=inspect_candles(
                    (
                        {
                            "open_time": candle.open_time,
                            "close_time": candle.close_time,
                            "open": candle.open,
                            "high": candle.high,
                            "low": candle.low,
                            "close": candle.close,
                            "volume": candle.volume,
                        }
                        for candle in dataset_candles
                    ),
                    timeframe=timeframe,
                ).health_status,
                metadata={"createdBy": "trade-lab"},
            )
        repository.update(
            job,
            status="completed",
            rows_imported=len(inserted),
            error_message=None,
            applied_start_at=start_at,
            applied_end_at=end_at,
        )
        return MarketDataImportResult(job=job, rows_imported=len(inserted), candles=inserted, coverage=coverage)
    except Exception as exc:  # pragma: no cover - defensive path for import failure
        repository.update(job, status="failed", error_message=str(exc))
        return MarketDataImportResult(job=job, rows_imported=0, error_message=str(exc))


def execute_import_job(
    *,
    market_repository: MarketDataRepository,
    import_job: MarketDataImportJob,
    client: BinanceSpotClient | None = None,
) -> MarketDataImportResult:
    active_client = client or BinanceSpotClient()
    applied_start_at = import_job.applied_start_at or import_job.requested_start_at or import_job.start_at
    applied_end_at = import_job.applied_end_at or import_job.requested_end_at or import_job.end_at
    import_job.started_at = import_job.started_at or datetime.now(timezone.utc)
    import_job.claimed_at = import_job.claimed_at or import_job.started_at
    import_job.worker_id = import_job.worker_id or get_settings().default_worker_identity
    missing_ranges = [
        (datetime.fromisoformat(item["startAt"].replace("Z", "+00:00")), datetime.fromisoformat(item["endAt"].replace("Z", "+00:00")))
        for item in (import_job.metadata_ or {}).get("missingRanges", [])
        if isinstance(item, dict) and item.get("startAt") and item.get("endAt")
    ]
    remote_candles: list[dict[str, Any]] = []
    if import_job.job_type == "fill" and missing_ranges:
        for range_start, range_end in missing_ranges:
            fetched = _fetch_remote_candles(
                active_client,
                symbol=import_job.symbol,
                timeframe=import_job.timeframe,
                start_at=range_start,
                end_at=range_end,
            )
            integrity = inspect_candles(fetched, timeframe=import_job.timeframe, assume_complete=True)
            if integrity.health_status != "healthy":
                error_message = "Fill import did not resolve a healthy segment."
                market_repository.complete_import_job(
                    import_job,
                    applied_start_at=applied_start_at,
                    applied_end_at=applied_end_at,
                    rows_imported=0,
                    status="failed",
                    error_message=error_message,
                )
                return MarketDataImportResult(job=import_job, rows_imported=0, error_message=error_message)
            remote_candles.extend(fetched)
    else:
        remote_candles = _fetch_remote_candles(
            active_client,
            symbol=import_job.symbol,
            timeframe=import_job.timeframe,
            start_at=applied_start_at,
            end_at=applied_end_at,
        )
        integrity = inspect_candles(remote_candles, timeframe=import_job.timeframe, assume_complete=True)
        if import_job.job_type == "repair" and integrity.health_status != "healthy":
            error_message = "Repair import did not resolve dataset integrity."
            market_repository.complete_import_job(
                import_job,
                applied_start_at=applied_start_at,
                applied_end_at=applied_end_at,
                rows_imported=0,
                status="failed",
                error_message=error_message,
            )
            return MarketDataImportResult(job=import_job, rows_imported=0, error_message=error_message)
        if integrity.health_status == "suspect":
            error_message = "Imported candles failed integrity validation."
            market_repository.complete_import_job(
                import_job,
                applied_start_at=applied_start_at,
                applied_end_at=applied_end_at,
                rows_imported=0,
                status="failed",
                error_message=error_message,
            )
            return MarketDataImportResult(job=import_job, rows_imported=0, error_message=error_message)

    candle_rows = _to_market_candle_rows(
        remote_candles,
        exchange=import_job.exchange,
        symbol=import_job.symbol,
        timeframe=import_job.timeframe,
    )
    if import_job.job_type == "repair":
        applied = market_repository.replace_market_candles(
            exchange=import_job.exchange,
            symbol=import_job.symbol,
            timeframe=import_job.timeframe,
            start_at=applied_start_at,
            end_at=applied_end_at,
            candles=candle_rows,
        )
    else:
        existing = market_repository.list_market_candles(
            exchange=import_job.exchange,
            symbol=import_job.symbol,
            timeframe=import_job.timeframe,
            start_at=applied_start_at,
            end_at=applied_end_at,
        )
        existing_keys = {candle.open_time for candle in existing}
        applied = market_repository.create_market_candles(
            [row for row in candle_rows if row["open_time"] not in existing_keys]
        )

    # Coverage metadata needs to reflect the whole dataset, not just the applied window.
    dataset_candles = market_repository.list_market_candles(
        exchange=import_job.exchange,
        symbol=import_job.symbol,
        timeframe=import_job.timeframe,
    )
    coverage_health = inspect_candles(
        [
            {
                "open_time": candle.open_time,
                "close_time": candle.close_time,
                "open": candle.open,
                "high": candle.high,
                "low": candle.low,
                "close": candle.close,
                "volume": candle.volume,
            }
            for candle in dataset_candles
        ],
        timeframe=import_job.timeframe,
        assume_complete=False,
    ).health_status
    coverage = market_repository.refresh_coverage_from_candles(
        exchange=import_job.exchange,
        symbol=import_job.symbol,
        timeframe=import_job.timeframe,
        candles=dataset_candles,
        health_status=coverage_health,
        metadata={"jobType": import_job.job_type},
    )
    market_repository.complete_import_job(
        import_job,
        applied_start_at=applied_start_at,
        applied_end_at=applied_end_at,
        rows_imported=len(applied),
        status="completed",
    )
    return MarketDataImportResult(job=import_job, rows_imported=len(applied), candles=applied, coverage=coverage)


def summarize_preflight(
    repository: MarketDataRepository,
    *,
    exchange: str,
    symbol: str,
    timeframe: str,
    start_at: datetime,
    end_at: datetime,
    source_available: bool = True,
):
    return build_preflight_result(
        repository,
        exchange=exchange,
        symbol=symbol,
        timeframe=timeframe,
        requested_start_at=start_at,
        requested_end_at=end_at,
        source_available=source_available,
    )


def _fetch_remote_candles(
    client: BinanceSpotClient,
    *,
    symbol: str,
    timeframe: str,
    start_at: datetime,
    end_at: datetime,
) -> list[dict[str, Any]]:
    interval = timeframe_to_timedelta(timeframe)
    limit = get_settings().max_candles_per_import_batch
    cursor = start_at
    rows: list[dict[str, Any]] = []
    while cursor <= end_at:
        page = client.get_klines(symbol=symbol, interval=timeframe, start_time=cursor, end_time=end_at, limit=limit)
        if not page:
            break
        rows.extend(page)
        last_open_time = page[-1]["open_time"]
        next_cursor = last_open_time + interval
        if next_cursor <= cursor:
            break
        cursor = next_cursor
    return rows


def _to_market_candle_rows(
    candles: list[dict[str, Any]],
    *,
    exchange: str,
    symbol: str,
    timeframe: str,
) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for row in candles:
        rows.append(
            {
                "exchange": exchange,
                "symbol": symbol,
                "timeframe": timeframe,
                "open_time": row["open_time"],
                "close_time": row["close_time"],
                "open": row["open"],
                "high": row["high"],
                "low": row["low"],
                "close": row["close"],
                "volume": row["volume"],
                "quote_volume": row.get("quote_volume"),
                "trade_count": row.get("trade_count"),
                "source": "binance",
            }
        )
    return rows


def to_float_or_none(value: Any) -> float | None:
    if value is None:
        return None
    return float(value)
