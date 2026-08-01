from __future__ import annotations

import os
from collections.abc import Iterator
from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://postgres:postgres123secure@localhost:5432/tradelab",
)

from tradelab_api.db.models import Base, Strategy, StrategyGroup  # noqa: E402
from tradelab_api.db.session import SessionLocal, get_engine  # noqa: E402
from tradelab_api.services.local_fill_smoke_fixture import (  # noqa: E402
    LOCAL_FILL_SMOKE_FIXTURE_ACTOR,
    LOCAL_FILL_SMOKE_FIXTURE_SAFETY_STATUS,
    LOCAL_FILL_SMOKE_GROUP_SLUG,
    LOCAL_FILL_SMOKE_REQUESTED_END_AT,
    LOCAL_FILL_SMOKE_REQUESTED_START_AT,
    LOCAL_FILL_SMOKE_STRATEGY_SLUG,
    LocalFillSmokeFixtureValidationError,
    reset_local_fill_smoke_fixture,
)
from tradelab_api.services.market_data_repository import MarketDataRepository, build_dataset_key  # noqa: E402
from tradelab_api.services.strategy_repository import StrategyRepository  # noqa: E402

Base.metadata.create_all(bind=get_engine())


def _dt(hour: int) -> datetime:
    return datetime(2026, 1, 1, hour, tzinfo=timezone.utc)


def _settings(*, enabled: bool = True, environment: str = "local", database_url: str = "postgresql+psycopg://user:password@localhost:5432/tradelab_smoke") -> SimpleNamespace:
    return SimpleNamespace(
        tradelab_local_fill_enabled=enabled,
        tradelab_environment=environment,
        database_url=database_url,
    )


@pytest.fixture()
def db_session() -> Iterator[Session]:
    connection = get_engine().connect()
    transaction = connection.begin()
    session = SessionLocal(bind=connection)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


def _candle(hour: int, *, symbol: str = "BTCUSDT") -> dict[str, object]:
    timestamp = _dt(hour)
    return {
        "exchange": "binance",
        "symbol": symbol,
        "timeframe": "1h",
        "open_time": timestamp,
        "close_time": timestamp,
        "open": 100 + hour,
        "high": 101 + hour,
        "low": 99 + hour,
        "close": 100 + hour,
        "volume": 10,
        "quote_volume": 1000 + hour,
        "trade_count": 20 + hour,
        "source": "binance",
    }


class FakeStrategyRepository:
    def __init__(self) -> None:
        self.groups_by_slug: dict[str, SimpleNamespace] = {}
        self.strategies_by_slug: dict[str, SimpleNamespace] = {}
        self.versions: list[SimpleNamespace] = []
        self.updated_strategies: list[SimpleNamespace] = []

    def get_strategy_group_by_slug(self, slug: str):
        group = self.groups_by_slug.get(slug)
        if group is None:
            return None
        if getattr(group, "is_active", True) is not True or getattr(group, "is_deleted", False) is not False:
            return None
        return group

    def get_any_strategy_group_by_slug(self, slug: str):
        return self.groups_by_slug.get(slug)

    def create_strategy_group(self, **fields):
        if fields["slug"] in self.groups_by_slug:
            raise AssertionError(f"duplicate strategy group slug: {fields['slug']}")
        group = SimpleNamespace(id=uuid4(), is_active=True, is_deleted=False, **fields)
        self.groups_by_slug[group.slug] = group
        return group

    def update_strategy_group(self, group, **fields):
        for key, value in fields.items():
            setattr(group, key, value)
        return group

    def get_strategy_by_slug(self, slug: str):
        strategy = self.strategies_by_slug.get(slug)
        if strategy is None:
            return None
        if getattr(strategy, "is_active", True) is not True or getattr(strategy, "is_deleted", False) is not False:
            return None
        return strategy

    def get_any_strategy_by_slug(self, slug: str):
        return self.strategies_by_slug.get(slug)

    def create_strategy(self, **fields):
        if fields["slug"] in self.strategies_by_slug:
            raise AssertionError(f"duplicate strategy slug: {fields['slug']}")
        strategy = SimpleNamespace(id=uuid4(), current_version_id=None, is_active=True, is_deleted=False, **fields)
        self.strategies_by_slug[strategy.slug] = strategy
        return strategy

    def update_strategy(self, strategy, **fields):
        for key, value in fields.items():
            setattr(strategy, key, value)
        self.updated_strategies.append(strategy)
        return strategy

    def create_strategy_version(self, **fields):
        version = SimpleNamespace(id=uuid4(), **fields)
        self.versions.append(version)
        return version


class FakeMarketDataRepository:
    def __init__(self, candles: list[dict[str, object]] | None = None) -> None:
        self.candles = list(candles or [])
        self.deleted_ranges: list[dict[str, object]] = []
        self.created_rows: list[dict[str, object]] = []
        self.coverage_refreshes: list[dict[str, object]] = []
        self.soft_deleted_background_jobs: list[dict[str, object]] = []

    def delete_market_candles_range(self, **kwargs):
        self.deleted_ranges.append(kwargs)
        before = len(self.candles)
        self.candles = [
            row
            for row in self.candles
            if not (
                row["exchange"] == kwargs["exchange"]
                and row["symbol"] == kwargs["symbol"]
                and row["timeframe"] == kwargs["timeframe"]
                and kwargs["start_at"] <= row["open_time"] <= kwargs["end_at"]
            )
        ]
        return before - len(self.candles)

    def create_market_candles(self, candles):
        self.created_rows.extend(candles)
        self.candles.extend(candles)
        return [SimpleNamespace(id=uuid4(), **row) for row in candles]

    def soft_delete_background_fill_enqueue_jobs(self, **kwargs):
        self.soft_deleted_background_jobs.append(kwargs)
        return 0

    def list_market_candles(self, **kwargs):
        rows = list(self.candles)
        if kwargs.get("exchange") is not None:
            rows = [row for row in rows if row["exchange"] == kwargs["exchange"]]
        if kwargs.get("symbol") is not None:
            rows = [row for row in rows if row["symbol"] == kwargs["symbol"]]
        if kwargs.get("timeframe") is not None:
            rows = [row for row in rows if row["timeframe"] == kwargs["timeframe"]]
        if kwargs.get("start_at") is not None:
            rows = [row for row in rows if row["open_time"] >= kwargs["start_at"]]
        if kwargs.get("end_at") is not None:
            rows = [row for row in rows if row["open_time"] <= kwargs["end_at"]]
        return [SimpleNamespace(**row) for row in sorted(rows, key=lambda row: row["open_time"])]

    def refresh_coverage_from_candles(self, **kwargs):
        self.coverage_refreshes.append(kwargs)
        return SimpleNamespace(
            id=uuid4(),
            dataset_key=build_dataset_key(kwargs["exchange"], kwargs["symbol"], kwargs["timeframe"]),
        )


def test_reset_blocks_when_local_fill_disabled() -> None:
    strategies = FakeStrategyRepository()
    market = FakeMarketDataRepository([_candle(0)])

    with pytest.raises(LocalFillSmokeFixtureValidationError) as error:
        reset_local_fill_smoke_fixture(
            strategies,
            market,
            settings=_settings(enabled=False),
            confirm_fixture_reset=True,
        )

    assert error.value.reason_code == "local_fill_disabled"
    assert market.deleted_ranges == []
    assert market.created_rows == []


def test_reset_blocks_in_production_environment() -> None:
    strategies = FakeStrategyRepository()
    market = FakeMarketDataRepository([_candle(0)])

    with pytest.raises(LocalFillSmokeFixtureValidationError) as error:
        reset_local_fill_smoke_fixture(
            strategies,
            market,
            settings=_settings(environment="production"),
            confirm_fixture_reset=True,
        )

    assert error.value.reason_code == "local_fill_not_allowed_in_environment"
    assert market.deleted_ranges == []


def test_reset_requires_explicit_confirmation() -> None:
    strategies = FakeStrategyRepository()
    market = FakeMarketDataRepository([_candle(0)])

    with pytest.raises(LocalFillSmokeFixtureValidationError) as error:
        reset_local_fill_smoke_fixture(
            strategies,
            market,
            settings=_settings(),
            confirm_fixture_reset=False,
        )

    assert error.value.reason_code == "local_fill_fixture_confirmation_required"
    assert market.deleted_ranges == []


def test_reset_creates_smoke_strategy_and_reserved_missing_tail() -> None:
    strategies = FakeStrategyRepository()
    market = FakeMarketDataRepository([_candle(0), _candle(1), _candle(2), _candle(9), _candle(0, symbol="ETHUSDT")])

    result = reset_local_fill_smoke_fixture(
        strategies,
        market,
        settings=_settings(),
        confirm_fixture_reset=True,
    )

    assert result.strategy_slug == LOCAL_FILL_SMOKE_STRATEGY_SLUG
    assert result.strategy_group_slug == LOCAL_FILL_SMOKE_GROUP_SLUG
    assert result.dataset_key == "binance:BTCUSDT:1h"
    assert result.requested_start_at == LOCAL_FILL_SMOKE_REQUESTED_START_AT
    assert result.requested_end_at == LOCAL_FILL_SMOKE_REQUESTED_END_AT
    assert result.expected_missing_ranges == [{"start_at": _dt(3), "end_at": _dt(6), "kind": "tail"}]
    assert result.expected_rows_inserted_min == 1
    assert result.safety_status == LOCAL_FILL_SMOKE_FIXTURE_SAFETY_STATUS
    assert [row["open_time"] for row in market.created_rows] == [_dt(0), _dt(1), _dt(2)]
    assert any(row["symbol"] == "ETHUSDT" for row in market.candles)
    assert any(row["open_time"] == _dt(9) for row in market.candles)
    assert market.deleted_ranges == [
        {
            "exchange": "binance",
            "symbol": "BTCUSDT",
            "timeframe": "1h",
            "start_at": _dt(0),
            "end_at": _dt(6),
        }
    ]
    assert market.coverage_refreshes[0]["metadata"]["source"] == LOCAL_FILL_SMOKE_FIXTURE_ACTOR


def test_reset_is_idempotent_for_reserved_range() -> None:
    strategies = FakeStrategyRepository()
    market = FakeMarketDataRepository([_candle(0), _candle(1), _candle(2)])

    first = reset_local_fill_smoke_fixture(
        strategies,
        market,
        settings=_settings(),
        confirm_fixture_reset=True,
    )
    second = reset_local_fill_smoke_fixture(
        strategies,
        market,
        settings=_settings(),
        confirm_fixture_reset=True,
    )

    fixture_rows = [
        row
        for row in market.candles
        if row["exchange"] == "binance" and row["symbol"] == "BTCUSDT" and row["timeframe"] == "1h" and _dt(0) <= row["open_time"] <= _dt(6)
    ]
    assert first.dataset_key == second.dataset_key
    assert [row["open_time"] for row in fixture_rows] == [_dt(0), _dt(1), _dt(2)]
    assert len(strategies.versions) == 1


def test_reset_reactivates_soft_deleted_fixture_rows(db_session: Session) -> None:
    group = (
        db_session.query(StrategyGroup)
        .filter(StrategyGroup.slug == LOCAL_FILL_SMOKE_GROUP_SLUG)
        .one_or_none()
    )
    if group is None:
        group = StrategyGroup(
            name="Deleted smoke fixtures",
            slug=LOCAL_FILL_SMOKE_GROUP_SLUG,
            description="Deleted fixture row.",
            metadata_={"visibility": "test"},
            created_by=LOCAL_FILL_SMOKE_FIXTURE_ACTOR,
        )
        db_session.add(group)
        db_session.flush()
    group.is_active = False
    group.is_deleted = True

    strategy = (
        db_session.query(Strategy)
        .filter(Strategy.slug == LOCAL_FILL_SMOKE_STRATEGY_SLUG)
        .one_or_none()
    )
    if strategy is None:
        strategy = Strategy(
            strategy_group_id=group.id,
            name="Deleted local fill smoke",
            slug=LOCAL_FILL_SMOKE_STRATEGY_SLUG,
            description="Deleted fixture strategy.",
            status="active",
            runtime_config={},
            risk_config={},
            metadata_={"visibility": "test"},
            created_by=LOCAL_FILL_SMOKE_FIXTURE_ACTOR,
        )
        db_session.add(strategy)
        db_session.flush()
    strategy.strategy_group_id = group.id
    strategy.is_active = False
    strategy.is_deleted = True
    db_session.flush()

    result = reset_local_fill_smoke_fixture(
        StrategyRepository(db_session),
        MarketDataRepository(db_session),
        settings=_settings(),
        confirm_fixture_reset=True,
    )
    db_session.flush()
    db_session.refresh(group)
    db_session.refresh(strategy)

    assert result.strategy_group_id == group.id
    assert result.strategy_id == strategy.id
    assert group.is_active is True
    assert group.is_deleted is False
    assert strategy.is_active is True
    assert strategy.is_deleted is False


def test_reset_blocks_when_canonical_postgresql_url() -> None:
    strategies = FakeStrategyRepository()
    market = FakeMarketDataRepository()

    with pytest.raises(LocalFillSmokeFixtureValidationError) as error:
        reset_local_fill_smoke_fixture(
            strategies,
            market,
            settings=_settings(database_url="postgresql+psycopg://user:password@localhost:5432/tradelab"),
            confirm_fixture_reset=True,
        )

    assert error.value.reason_code == "smoke_fixture_database_required"
    assert market.deleted_ranges == []
    assert market.created_rows == []


def test_reset_allows_smoke_postgresql_url() -> None:
    strategies = FakeStrategyRepository()
    market = FakeMarketDataRepository()

    result = reset_local_fill_smoke_fixture(
        strategies,
        market,
        settings=_settings(database_url="postgresql+psycopg://user:password@localhost:5432/tradelab_smoke"),
        confirm_fixture_reset=True,
    )

    assert result.safety_status == LOCAL_FILL_SMOKE_FIXTURE_SAFETY_STATUS


def test_reset_allows_sqlite_in_testing_environment() -> None:
    strategies = FakeStrategyRepository()
    market = FakeMarketDataRepository()

    result = reset_local_fill_smoke_fixture(
        strategies,
        market,
        settings=_settings(database_url="sqlite:///:memory:", environment="testing"),
        confirm_fixture_reset=True,
    )

    assert result.safety_status == LOCAL_FILL_SMOKE_FIXTURE_SAFETY_STATUS


def test_reset_blocks_sqlite_in_local_environment() -> None:
    strategies = FakeStrategyRepository()
    market = FakeMarketDataRepository()

    with pytest.raises(LocalFillSmokeFixtureValidationError) as error:
        reset_local_fill_smoke_fixture(
            strategies,
            market,
            settings=_settings(database_url="sqlite:///:memory:", environment="local"),
            confirm_fixture_reset=True,
        )

    assert error.value.reason_code == "smoke_fixture_database_required"
