from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
from typing import Any
from uuid import UUID

from tradelab_api.services.baseline_seed import BASELINE_RISK_CONFIG, BASELINE_SOURCE_CODE
from tradelab_api.services.market_data_repository import MarketDataRepository, build_dataset_key
from tradelab_api.services.smoke_database_guard import is_smoke_fixture_database_allowed
from tradelab_api.services.strategy_repository import StrategyRepository
from tradelab_api.services.strategy_validator import validate_strategy_source

LOCAL_FILL_SMOKE_FIXTURE_ALLOWED_ENVIRONMENTS = {"local", "dev", "development", "test", "testing"}
LOCAL_FILL_SMOKE_FIXTURE_ACTOR = "tradelab-local-fill-smoke-fixture"
LOCAL_FILL_SMOKE_FIXTURE_SAFETY_STATUS = "local_dev_smoke_fixture_only"
LOCAL_FILL_SMOKE_GROUP_NAME = "TradeLab Smoke Fixtures"
LOCAL_FILL_SMOKE_GROUP_SLUG = "tradelab-smoke-fixtures"
LOCAL_FILL_SMOKE_STRATEGY_NAME = "TradeLab Local Fill Smoke"
LOCAL_FILL_SMOKE_STRATEGY_SLUG = "tradelab-local-fill-smoke"
LOCAL_FILL_SMOKE_EXCHANGE = "binance"
LOCAL_FILL_SMOKE_SYMBOL = "BTCUSDT"
LOCAL_FILL_SMOKE_TIMEFRAME = "1h"
LOCAL_FILL_SMOKE_REQUESTED_START_AT = datetime(2026, 1, 1, 0, tzinfo=timezone.utc)
LOCAL_FILL_SMOKE_REQUESTED_END_AT = datetime(2026, 1, 1, 6, tzinfo=timezone.utc)
LOCAL_FILL_SMOKE_SEEDED_HOURS = (0, 1, 2)


@dataclass(slots=True)
class LocalFillSmokeFixtureValidationError(Exception):
    reason_code: str
    message: str


@dataclass(slots=True)
class LocalFillSmokeFixtureResult:
    strategy_id: UUID
    strategy_slug: str
    strategy_group_id: UUID
    strategy_group_slug: str
    dataset_key: str
    exchange: str
    symbol: str
    timeframe: str
    requested_start_at: datetime
    requested_end_at: datetime
    expected_missing_ranges: list[dict[str, Any]]
    expected_rows_inserted_min: int
    deleted_rows: int
    seeded_rows: int
    safety_status: str


def reset_local_fill_smoke_fixture(
    strategy_repository: StrategyRepository,
    market_repository: MarketDataRepository,
    *,
    settings: object,
    confirm_fixture_reset: bool,
) -> LocalFillSmokeFixtureResult:
    _validate_fixture_guards(settings=settings, confirm_fixture_reset=confirm_fixture_reset)
    strategy_group, strategy = _ensure_smoke_strategy(strategy_repository)
    market_repository.soft_delete_background_fill_enqueue_jobs(
        dataset_key=build_dataset_key(LOCAL_FILL_SMOKE_EXCHANGE, LOCAL_FILL_SMOKE_SYMBOL, LOCAL_FILL_SMOKE_TIMEFRAME),
        updated_by=LOCAL_FILL_SMOKE_FIXTURE_ACTOR,
    )

    deleted_rows = market_repository.delete_market_candles_range(
        exchange=LOCAL_FILL_SMOKE_EXCHANGE,
        symbol=LOCAL_FILL_SMOKE_SYMBOL,
        timeframe=LOCAL_FILL_SMOKE_TIMEFRAME,
        start_at=LOCAL_FILL_SMOKE_REQUESTED_START_AT,
        end_at=LOCAL_FILL_SMOKE_REQUESTED_END_AT,
    )
    seed_rows = [_seed_candle(hour) for hour in LOCAL_FILL_SMOKE_SEEDED_HOURS]
    market_repository.create_market_candles(seed_rows)
    fixture_candles = market_repository.list_market_candles(
        exchange=LOCAL_FILL_SMOKE_EXCHANGE,
        symbol=LOCAL_FILL_SMOKE_SYMBOL,
        timeframe=LOCAL_FILL_SMOKE_TIMEFRAME,
        start_at=LOCAL_FILL_SMOKE_REQUESTED_START_AT,
        end_at=LOCAL_FILL_SMOKE_REQUESTED_END_AT,
    )
    market_repository.refresh_coverage_from_candles(
        exchange=LOCAL_FILL_SMOKE_EXCHANGE,
        symbol=LOCAL_FILL_SMOKE_SYMBOL,
        timeframe=LOCAL_FILL_SMOKE_TIMEFRAME,
        candles=fixture_candles,
        health_status="incomplete",
        metadata={
            "source": LOCAL_FILL_SMOKE_FIXTURE_ACTOR,
            "safetyStatus": LOCAL_FILL_SMOKE_FIXTURE_SAFETY_STATUS,
            "reservedRange": {
                "startAt": LOCAL_FILL_SMOKE_REQUESTED_START_AT.isoformat(),
                "endAt": LOCAL_FILL_SMOKE_REQUESTED_END_AT.isoformat(),
            },
            "seededHours": list(LOCAL_FILL_SMOKE_SEEDED_HOURS),
        },
    )

    return LocalFillSmokeFixtureResult(
        strategy_id=strategy.id,
        strategy_slug=strategy.slug,
        strategy_group_id=strategy_group.id,
        strategy_group_slug=strategy_group.slug,
        dataset_key=build_dataset_key(LOCAL_FILL_SMOKE_EXCHANGE, LOCAL_FILL_SMOKE_SYMBOL, LOCAL_FILL_SMOKE_TIMEFRAME),
        exchange=LOCAL_FILL_SMOKE_EXCHANGE,
        symbol=LOCAL_FILL_SMOKE_SYMBOL,
        timeframe=LOCAL_FILL_SMOKE_TIMEFRAME,
        requested_start_at=LOCAL_FILL_SMOKE_REQUESTED_START_AT,
        requested_end_at=LOCAL_FILL_SMOKE_REQUESTED_END_AT,
        expected_missing_ranges=[
            {"start_at": datetime(2026, 1, 1, 3, tzinfo=timezone.utc), "end_at": LOCAL_FILL_SMOKE_REQUESTED_END_AT, "kind": "tail"}
        ],
        expected_rows_inserted_min=1,
        deleted_rows=deleted_rows,
        seeded_rows=len(seed_rows),
        safety_status=LOCAL_FILL_SMOKE_FIXTURE_SAFETY_STATUS,
    )


def _validate_fixture_guards(*, settings: object, confirm_fixture_reset: bool) -> None:
    if getattr(settings, "tradelab_local_fill_enabled", False) is not True:
        raise LocalFillSmokeFixtureValidationError("local_fill_disabled", "Local dataset fill is disabled.")
    environment = str(getattr(settings, "tradelab_environment", "local")).strip().lower()
    if environment not in LOCAL_FILL_SMOKE_FIXTURE_ALLOWED_ENVIRONMENTS:
        raise LocalFillSmokeFixtureValidationError(
            "local_fill_not_allowed_in_environment",
            "Local fill smoke fixture reset is allowed only in local/dev/test environments.",
        )
    if confirm_fixture_reset is not True:
        raise LocalFillSmokeFixtureValidationError(
            "local_fill_fixture_confirmation_required",
            "Local fill smoke fixture reset requires explicit confirmation.",
        )
    database_url = str(getattr(settings, "database_url", ""))
    if not is_smoke_fixture_database_allowed(database_url=database_url, environment=environment):
        raise LocalFillSmokeFixtureValidationError(
            "smoke_fixture_database_required",
            "Smoke fixture reset requires a dedicated _smoke database.",
        )


def _ensure_smoke_strategy(strategy_repository: StrategyRepository):
    group = strategy_repository.get_any_strategy_group_by_slug(LOCAL_FILL_SMOKE_GROUP_SLUG)
    group_fields = {
        "name": LOCAL_FILL_SMOKE_GROUP_NAME,
        "slug": LOCAL_FILL_SMOKE_GROUP_SLUG,
        "description": "Local/dev smoke fixtures for deterministic TradeLab verification.",
        "metadata_": {
            "visibility": "test",
            "purpose": "local_fill_smoke_fixture",
            "isSmokeFixture": True,
        },
        "created_by": LOCAL_FILL_SMOKE_FIXTURE_ACTOR,
    }
    if group is None:
        group = strategy_repository.create_strategy_group(**group_fields)
    else:
        strategy_repository.update_strategy_group(
            group,
            name=LOCAL_FILL_SMOKE_GROUP_NAME,
            description=group_fields["description"],
            metadata_={**dict(group.metadata_ or {}), **group_fields["metadata_"]},
            is_active=True,
            is_deleted=False,
            updated_by=LOCAL_FILL_SMOKE_FIXTURE_ACTOR,
        )

    strategy = strategy_repository.get_any_strategy_by_slug(LOCAL_FILL_SMOKE_STRATEGY_SLUG)
    runtime_config = {
        "exchange": LOCAL_FILL_SMOKE_EXCHANGE,
        "symbol": LOCAL_FILL_SMOKE_SYMBOL,
        "timeframe": LOCAL_FILL_SMOKE_TIMEFRAME,
        "startAt": LOCAL_FILL_SMOKE_REQUESTED_START_AT.isoformat().replace("+00:00", "Z"),
        "endAt": LOCAL_FILL_SMOKE_REQUESTED_END_AT.isoformat().replace("+00:00", "Z"),
        "initialEquity": 1000,
        "feeBps": 10,
        "slippageBps": 1,
    }
    strategy_fields = {
        "strategy_group_id": group.id,
        "name": LOCAL_FILL_SMOKE_STRATEGY_NAME,
        "slug": LOCAL_FILL_SMOKE_STRATEGY_SLUG,
        "description": "Deterministic local fill smoke strategy. Not a profit claim.",
        "status": "active",
        "runtime_config": runtime_config,
        "risk_config": dict(BASELINE_RISK_CONFIG),
        "metadata_": {
            "visibility": "test",
            "purpose": "local_fill_smoke_fixture",
            "isSmokeFixture": True,
        },
        "created_by": LOCAL_FILL_SMOKE_FIXTURE_ACTOR,
    }
    if strategy is None:
        strategy = strategy_repository.create_strategy(**strategy_fields)
    else:
        strategy_repository.update_strategy(
            strategy,
            strategy_group_id=group.id,
            name=LOCAL_FILL_SMOKE_STRATEGY_NAME,
            description=strategy_fields["description"],
            status="active",
            runtime_config=runtime_config,
            risk_config=dict(BASELINE_RISK_CONFIG),
            metadata_={**dict(strategy.metadata_ or {}), **strategy_fields["metadata_"]},
            is_active=True,
            is_deleted=False,
            updated_by=LOCAL_FILL_SMOKE_FIXTURE_ACTOR,
        )

    if getattr(strategy, "current_version_id", None) is None:
        validation = validate_strategy_source(BASELINE_SOURCE_CODE)
        source_hash = sha256(BASELINE_SOURCE_CODE.encode("utf-8")).hexdigest()
        version = strategy_repository.create_strategy_version(
            strategy_id=strategy.id,
            version_number=1,
            source_code=BASELINE_SOURCE_CODE,
            source_hash=source_hash,
            validation_status=validation.validation_status,
            validation_message=validation.message,
            created_by=LOCAL_FILL_SMOKE_FIXTURE_ACTOR,
        )
        strategy_repository.update_strategy(strategy, current_version_id=version.id, updated_by=LOCAL_FILL_SMOKE_FIXTURE_ACTOR)

    return group, strategy


def _seed_candle(hour: int) -> dict[str, object]:
    timestamp = datetime(2026, 1, 1, hour, tzinfo=timezone.utc)
    return {
        "exchange": LOCAL_FILL_SMOKE_EXCHANGE,
        "symbol": LOCAL_FILL_SMOKE_SYMBOL,
        "timeframe": LOCAL_FILL_SMOKE_TIMEFRAME,
        "open_time": timestamp,
        "close_time": timestamp,
        "open": 100 + hour,
        "high": 101 + hour,
        "low": 99 + hour,
        "close": 100 + hour,
        "volume": 10,
        "quote_volume": 1000 + hour,
        "trade_count": 20 + hour,
        "source": LOCAL_FILL_SMOKE_FIXTURE_ACTOR,
    }
