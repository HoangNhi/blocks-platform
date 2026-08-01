from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from hashlib import sha256
from uuid import UUID

from tradelab_api.db.models import (
    Bot,
    MarketCandle,
    PaperAuditEvent,
    PaperFill,
    PaperOrder,
    PaperPortfolioSnapshot,
    PaperPosition,
    PaperResumeCheckpoint,
    PaperSession,
)
from tradelab_api.services.bot_repository import BotRepository
from tradelab_api.services.market_data_repository import MarketDataRepository, build_dataset_key
from tradelab_api.services.smoke_database_guard import is_smoke_fixture_database_allowed
from tradelab_api.services.strategy_repository import StrategyRepository
from tradelab_api.services.strategy_validator import validate_strategy_source

PAPER_RUNTIME_SMOKE_ALLOWED_ENVIRONMENTS = {"local", "dev", "development", "test", "testing"}
PAPER_RUNTIME_SMOKE_ACTOR = "tradelab-paper-runtime-smoke-fixture"
PAPER_RUNTIME_SMOKE_SAFETY_STATUS = "local_dev_paper_runtime_smoke_fixture"
PAPER_RUNTIME_SMOKE_GROUP_NAME = "TradeLab Paper Runtime Smoke Fixtures"
PAPER_RUNTIME_SMOKE_GROUP_SLUG = "tradelab-paper-runtime-smoke-fixtures"
PAPER_RUNTIME_SMOKE_STRATEGY_NAME = "TradeLab Paper Runtime Smoke"
PAPER_RUNTIME_SMOKE_STRATEGY_SLUG = "tradelab-paper-runtime-smoke"
PAPER_RUNTIME_SMOKE_BOT_NAME = "TradeLab Paper Runtime Smoke paper bot"
PAPER_RUNTIME_SMOKE_EXCHANGE = "binance"
PAPER_RUNTIME_SMOKE_SYMBOL = "TPAPERUSDT"
PAPER_RUNTIME_SMOKE_TIMEFRAME = "1h"
PAPER_RUNTIME_SMOKE_START_AT = datetime(2026, 1, 2, 0, tzinfo=timezone.utc)
PAPER_RUNTIME_SMOKE_END_AT = datetime(2026, 1, 2, 5, tzinfo=timezone.utc)
PAPER_RUNTIME_SMOKE_STARTING_CASH = Decimal("1000")
PAPER_RUNTIME_SMOKE_EXPECTED_ORDERS_MIN = 2
PAPER_RUNTIME_SMOKE_EXPECTED_FILLS_MIN = 2
PAPER_RUNTIME_SMOKE_EXPECTED_SNAPSHOTS_MIN = 6
PAPER_RUNTIME_SMOKE_SESSION_STATE_QUEUED = "queued"
PAPER_RUNTIME_SMOKE_SESSION_STATE_CANCELLED_RESUMABLE = "cancelled_resumable"
PAPER_RUNTIME_SMOKE_SESSION_STATES = {
    PAPER_RUNTIME_SMOKE_SESSION_STATE_QUEUED,
    PAPER_RUNTIME_SMOKE_SESSION_STATE_CANCELLED_RESUMABLE,
}
PAPER_RUNTIME_SMOKE_DATASET_KEY = build_dataset_key(
    PAPER_RUNTIME_SMOKE_EXCHANGE,
    PAPER_RUNTIME_SMOKE_SYMBOL,
    PAPER_RUNTIME_SMOKE_TIMEFRAME,
)
PAPER_RUNTIME_SMOKE_SOURCE_CODE = (
    "def on_candle(ctx):\n"
    "    if len(ctx.history.get('close', [])) == 1:\n"
    "        return ctx.buy_market(percent=50)\n"
    "    if len(ctx.history.get('close', [])) == 4:\n"
    "        return ctx.close_position()\n"
    "    return []\n"
)


@dataclass(slots=True)
class PaperRuntimeSmokeFixtureValidationError(Exception):
    reason_code: str
    message: str


@dataclass(slots=True)
class PaperRuntimeSmokeFixtureResult:
    paper_session_id: UUID
    bot_id: UUID
    strategy_id: UUID
    strategy_version_id: UUID
    strategy_slug: str
    strategy_group_id: UUID
    strategy_group_slug: str
    dataset_key: str
    exchange: str
    symbol: str
    timeframe: str
    requested_start_at: datetime
    requested_end_at: datetime
    expected_orders_min: int
    expected_fills_min: int
    expected_snapshots_min: int
    seeded_rows: int
    deleted_fixture_sessions: int
    deleted_fixture_candles: int
    safety_status: str


def reset_paper_runtime_smoke_fixture(
    strategy_repository: StrategyRepository,
    bot_repository: BotRepository,
    market_repository: MarketDataRepository,
    *,
    settings: object,
    confirm_fixture_reset: bool,
    session_state: str = PAPER_RUNTIME_SMOKE_SESSION_STATE_QUEUED,
) -> PaperRuntimeSmokeFixtureResult:
    _validate_fixture_guards(settings=settings, confirm_fixture_reset=confirm_fixture_reset)
    session_state = _validate_session_state(session_state)
    session = strategy_repository.session
    group, strategy, version = _ensure_strategy(strategy_repository)
    bot = _ensure_bot(bot_repository, strategy_id=strategy.id, strategy_version_id=version.id)
    deleted_fixture_sessions = _delete_fixture_paper_sessions(session)
    deleted_fixture_candles = _delete_fixture_candles(session)
    candles = market_repository.create_market_candles([_seed_candle(hour) for hour in range(6)])
    market_repository.refresh_coverage_from_candles(
        exchange=PAPER_RUNTIME_SMOKE_EXCHANGE,
        symbol=PAPER_RUNTIME_SMOKE_SYMBOL,
        timeframe=PAPER_RUNTIME_SMOKE_TIMEFRAME,
        candles=candles,
        health_status="healthy",
        metadata={
            "source": PAPER_RUNTIME_SMOKE_ACTOR,
            "createdBy": PAPER_RUNTIME_SMOKE_ACTOR,
            "safetyStatus": PAPER_RUNTIME_SMOKE_SAFETY_STATUS,
            "reservedRange": {
                "startAt": PAPER_RUNTIME_SMOKE_START_AT.isoformat(),
                "endAt": PAPER_RUNTIME_SMOKE_END_AT.isoformat(),
            },
        },
    )
    paper_session = PaperSession(
        bot_id=bot.id,
        strategy_id=strategy.id,
        strategy_version_id=version.id,
        mode="paper",
        status="queued",
        exchange=PAPER_RUNTIME_SMOKE_EXCHANGE,
        symbol=PAPER_RUNTIME_SMOKE_SYMBOL,
        timeframe=PAPER_RUNTIME_SMOKE_TIMEFRAME,
        dataset_key=PAPER_RUNTIME_SMOKE_DATASET_KEY,
        start_at=PAPER_RUNTIME_SMOKE_START_AT,
        end_at=PAPER_RUNTIME_SMOKE_END_AT,
        starting_cash=PAPER_RUNTIME_SMOKE_STARTING_CASH,
        runtime_config=_runtime_config(),
        risk_config={},
        source_snapshot={
            "strategyId": str(strategy.id),
            "strategyVersionId": str(version.id),
            "sourceHash": version.source_hash,
        },
        dataset_context={
            "datasetKey": PAPER_RUNTIME_SMOKE_DATASET_KEY,
            "fixture": "paper_runtime_smoke",
            "source": PAPER_RUNTIME_SMOKE_ACTOR,
        },
        gate_context={
            "source": PAPER_RUNTIME_SMOKE_ACTOR,
            "safetyStatus": PAPER_RUNTIME_SMOKE_SAFETY_STATUS,
            "expectedOrdersMin": PAPER_RUNTIME_SMOKE_EXPECTED_ORDERS_MIN,
            "expectedFillsMin": PAPER_RUNTIME_SMOKE_EXPECTED_FILLS_MIN,
            "expectedSnapshotsMin": PAPER_RUNTIME_SMOKE_EXPECTED_SNAPSHOTS_MIN,
        },
        reason_code="paper_session_queued",
        created_by=PAPER_RUNTIME_SMOKE_ACTOR,
    )
    session.add(paper_session)
    session.flush()
    if session_state == PAPER_RUNTIME_SMOKE_SESSION_STATE_CANCELLED_RESUMABLE:
        _make_cancelled_resumable_fixture_session(session, paper_session, candles)
    session.refresh(paper_session)
    return PaperRuntimeSmokeFixtureResult(
        paper_session_id=paper_session.id,
        bot_id=bot.id,
        strategy_id=strategy.id,
        strategy_version_id=version.id,
        strategy_slug=strategy.slug,
        strategy_group_id=group.id,
        strategy_group_slug=group.slug,
        dataset_key=PAPER_RUNTIME_SMOKE_DATASET_KEY,
        exchange=PAPER_RUNTIME_SMOKE_EXCHANGE,
        symbol=PAPER_RUNTIME_SMOKE_SYMBOL,
        timeframe=PAPER_RUNTIME_SMOKE_TIMEFRAME,
        requested_start_at=PAPER_RUNTIME_SMOKE_START_AT,
        requested_end_at=PAPER_RUNTIME_SMOKE_END_AT,
        expected_orders_min=PAPER_RUNTIME_SMOKE_EXPECTED_ORDERS_MIN,
        expected_fills_min=PAPER_RUNTIME_SMOKE_EXPECTED_FILLS_MIN,
        expected_snapshots_min=PAPER_RUNTIME_SMOKE_EXPECTED_SNAPSHOTS_MIN,
        seeded_rows=len(candles),
        deleted_fixture_sessions=deleted_fixture_sessions,
        deleted_fixture_candles=deleted_fixture_candles,
        safety_status=PAPER_RUNTIME_SMOKE_SAFETY_STATUS,
    )


def _validate_fixture_guards(*, settings: object, confirm_fixture_reset: bool) -> None:
    if bool(getattr(settings, "tradelab_local_paper_engine_enabled", False)) is not True:
        raise PaperRuntimeSmokeFixtureValidationError(
            "paper_runtime_fixture_not_enabled",
            "Paper runtime smoke fixture reset is disabled.",
        )
    environment = str(getattr(settings, "tradelab_environment", "local") or "local").strip().lower()
    if environment not in PAPER_RUNTIME_SMOKE_ALLOWED_ENVIRONMENTS:
        raise PaperRuntimeSmokeFixtureValidationError(
            "paper_runtime_fixture_environment_not_allowed",
            "Paper runtime smoke fixture reset is allowed only in local/dev/test environments.",
        )
    if confirm_fixture_reset is not True:
        raise PaperRuntimeSmokeFixtureValidationError(
            "paper_runtime_fixture_confirmation_required",
            "Paper runtime smoke fixture reset requires explicit confirmation.",
        )
    database_url = str(getattr(settings, "database_url", ""))
    if not is_smoke_fixture_database_allowed(database_url=database_url, environment=environment):
        raise PaperRuntimeSmokeFixtureValidationError(
            "smoke_fixture_database_required",
            "Smoke fixture reset requires a dedicated _smoke database.",
        )

def _validate_session_state(session_state: str) -> str:
    normalized = str(session_state or PAPER_RUNTIME_SMOKE_SESSION_STATE_QUEUED).strip().lower()
    if normalized not in PAPER_RUNTIME_SMOKE_SESSION_STATES:
        raise PaperRuntimeSmokeFixtureValidationError(
            "paper_runtime_fixture_session_state_invalid",
            "Paper runtime smoke fixture reset session state is invalid.",
        )
    return normalized


def _fixture_metadata() -> dict[str, object]:
    return {
        "visibility": "test",
        "purpose": "paper_runtime_smoke_fixture",
        "isSmokeFixture": True,
    }


def _runtime_config() -> dict[str, object]:
    return {
        "exchange": PAPER_RUNTIME_SMOKE_EXCHANGE,
        "symbol": PAPER_RUNTIME_SMOKE_SYMBOL,
        "timeframe": PAPER_RUNTIME_SMOKE_TIMEFRAME,
        "startAt": PAPER_RUNTIME_SMOKE_START_AT.isoformat().replace("+00:00", "Z"),
        "endAt": PAPER_RUNTIME_SMOKE_END_AT.isoformat().replace("+00:00", "Z"),
        "initialEquity": 1000,
        "feeBps": "0",
        "slippageBps": "0",
    }


def _ensure_strategy(strategy_repository: StrategyRepository):
    group = strategy_repository.get_any_strategy_group_by_slug(PAPER_RUNTIME_SMOKE_GROUP_SLUG)
    group_fields = {
        "name": PAPER_RUNTIME_SMOKE_GROUP_NAME,
        "slug": PAPER_RUNTIME_SMOKE_GROUP_SLUG,
        "description": "Local/dev smoke fixtures for deterministic TradeLab paper runtime verification.",
        "metadata_": _fixture_metadata(),
        "created_by": PAPER_RUNTIME_SMOKE_ACTOR,
    }
    if group is None:
        group = strategy_repository.create_strategy_group(**group_fields)
    else:
        strategy_repository.update_strategy_group(
            group,
            name=PAPER_RUNTIME_SMOKE_GROUP_NAME,
            description=group_fields["description"],
            metadata_={**dict(group.metadata_ or {}), **_fixture_metadata()},
            is_active=True,
            is_deleted=False,
            updated_by=PAPER_RUNTIME_SMOKE_ACTOR,
        )

    strategy = strategy_repository.get_any_strategy_by_slug(PAPER_RUNTIME_SMOKE_STRATEGY_SLUG)
    strategy_fields = {
        "strategy_group_id": group.id,
        "name": PAPER_RUNTIME_SMOKE_STRATEGY_NAME,
        "slug": PAPER_RUNTIME_SMOKE_STRATEGY_SLUG,
        "description": "Deterministic local paper runtime smoke strategy. Not a profit claim.",
        "status": "active",
        "runtime_config": _runtime_config(),
        "risk_config": {},
        "metadata_": _fixture_metadata(),
        "created_by": PAPER_RUNTIME_SMOKE_ACTOR,
    }
    if strategy is None:
        strategy = strategy_repository.create_strategy(**strategy_fields)
    else:
        strategy_repository.update_strategy(
            strategy,
            strategy_group_id=group.id,
            name=PAPER_RUNTIME_SMOKE_STRATEGY_NAME,
            description=strategy_fields["description"],
            status="active",
            runtime_config=_runtime_config(),
            risk_config={},
            metadata_={**dict(strategy.metadata_ or {}), **_fixture_metadata()},
            is_active=True,
            is_deleted=False,
            updated_by=PAPER_RUNTIME_SMOKE_ACTOR,
        )

    validation = validate_strategy_source(PAPER_RUNTIME_SMOKE_SOURCE_CODE)
    if validation.validation_status != "valid":
        raise PaperRuntimeSmokeFixtureValidationError(
            "paper_runtime_fixture_strategy_invalid",
            validation.message or "Paper runtime smoke fixture strategy source is invalid.",
        )
    source_hash = sha256(PAPER_RUNTIME_SMOKE_SOURCE_CODE.encode("utf-8")).hexdigest()
    versions = strategy_repository.list_strategy_versions(strategy.id)
    version = next(
        (
            item
            for item in versions
            if item.source_hash == source_hash and item.is_active is True and item.is_deleted is False
        ),
        None,
    )
    if version is None:
        version_number = max([item.version_number for item in versions], default=0) + 1
        version = strategy_repository.create_strategy_version(
            strategy_id=strategy.id,
            version_number=version_number,
            source_code=PAPER_RUNTIME_SMOKE_SOURCE_CODE,
            source_hash=source_hash,
            validation_status=validation.validation_status,
            validation_message=validation.message,
            created_by=PAPER_RUNTIME_SMOKE_ACTOR,
        )
    strategy_repository.update_strategy(strategy, current_version_id=version.id, updated_by=PAPER_RUNTIME_SMOKE_ACTOR)
    return group, strategy, version


def _ensure_bot(bot_repository: BotRepository, *, strategy_id: UUID, strategy_version_id: UUID) -> Bot:
    bot = (
        bot_repository.session.query(Bot)
        .filter(
            Bot.name == PAPER_RUNTIME_SMOKE_BOT_NAME,
            Bot.mode == "paper",
            Bot.is_active.is_(True),
            Bot.is_deleted.is_(False),
        )
        .one_or_none()
    )
    fields = {
        "strategy_id": strategy_id,
        "strategy_version_id": strategy_version_id,
        "name": PAPER_RUNTIME_SMOKE_BOT_NAME,
        "mode": "paper",
        "status": "draft",
        "symbol": PAPER_RUNTIME_SMOKE_SYMBOL,
        "timeframe": PAPER_RUNTIME_SMOKE_TIMEFRAME,
        "runtime_config": _runtime_config(),
        "risk_config": {},
        "metadata_": _fixture_metadata(),
    }
    if bot is None:
        return bot_repository.create_bot(**fields, created_by=PAPER_RUNTIME_SMOKE_ACTOR)
    return bot_repository.update_bot(
        bot,
        **fields,
        updated_by=PAPER_RUNTIME_SMOKE_ACTOR,
        is_active=True,
        is_deleted=False,
    )


def _make_cancelled_resumable_fixture_session(
    session,
    paper_session: PaperSession,
    candles: list[MarketCandle],
) -> None:
    if len(candles) < 4:
        raise PaperRuntimeSmokeFixtureValidationError(
            "paper_runtime_fixture_candles_missing",
            "Paper runtime smoke fixture reset requires at least four candles for resumable state.",
        )
    now = datetime.now(timezone.utc)
    last_candle = candles[2]
    next_candle = candles[3]
    snapshot = PaperPortfolioSnapshot(
        paper_session_id=paper_session.id,
        source_candle_id=last_candle.id,
        snapshot_at=last_candle.open_time,
        cash_balance=PAPER_RUNTIME_SMOKE_STARTING_CASH,
        equity=PAPER_RUNTIME_SMOKE_STARTING_CASH,
        realized_pnl=Decimal("0"),
        unrealized_pnl=Decimal("0"),
        fees_paid=Decimal("0"),
        drawdown_pct=Decimal("0"),
        exposure_notional=Decimal("0"),
        artifact_key=f"paper:{paper_session.id}:fixture:snapshot:resume-checkpoint",
        metadata_={"source": PAPER_RUNTIME_SMOKE_ACTOR, "fixtureState": "cancelled_resumable"},
        created_by=PAPER_RUNTIME_SMOKE_ACTOR,
    )
    session.add(snapshot)
    session.flush()
    session.add(
        PaperResumeCheckpoint(
            paper_session_id=paper_session.id,
            attempt_no=0,
            last_processed_candle_id=last_candle.id,
            last_processed_candle_open_time=last_candle.open_time,
            last_processed_snapshot_id=snapshot.id,
            next_candle_id=next_candle.id,
            next_candle_open_time=next_candle.open_time,
            cash_balance=PAPER_RUNTIME_SMOKE_STARTING_CASH,
            equity=PAPER_RUNTIME_SMOKE_STARTING_CASH,
            realized_pnl=Decimal("0"),
            unrealized_pnl=Decimal("0"),
            fees_paid=Decimal("0"),
            exposure_notional=Decimal("0"),
            open_position_quantity=Decimal("0"),
            average_entry_price=None,
            peak_equity=PAPER_RUNTIME_SMOKE_STARTING_CASH,
            max_drawdown_pct=Decimal("0"),
            pending_orders_count=0,
            strategy_runtime_state_status="stateless_between_candles",
            checkpoint_source="persisted",
            reason_code="paper_engine_checkpoint_persisted",
            metadata_={"source": PAPER_RUNTIME_SMOKE_ACTOR, "fixtureState": "cancelled_resumable"},
            created_by=PAPER_RUNTIME_SMOKE_ACTOR,
        )
    )
    session.add(
        PaperAuditEvent(
            paper_session_id=paper_session.id,
            event_at=now,
            actor=PAPER_RUNTIME_SMOKE_ACTOR,
            action="paper_session_cancel_requested",
            target_type="paper_session",
            target_id=paper_session.id,
            old_state="running",
            new_state="cancelled",
            reason_code="paper_session_cancel_requested",
            artifact_key=f"paper:{paper_session.id}:fixture:audit:cancel-requested",
            metadata_={"source": PAPER_RUNTIME_SMOKE_ACTOR, "fixtureState": "cancelled_resumable"},
            created_by=PAPER_RUNTIME_SMOKE_ACTOR,
        )
    )
    paper_session.status = "cancelled"
    paper_session.reason_code = "paper_session_cancel_requested"
    paper_session.started_at = now
    paper_session.finished_at = now
    paper_session.updated_at = now
    paper_session.updated_by = PAPER_RUNTIME_SMOKE_ACTOR
    paper_session.gate_context = {
        **dict(paper_session.gate_context or {}),
        "fixtureState": "cancelled_resumable",
    }
    session.flush()


def _fixture_session_ids(session) -> list[UUID]:
    rows = (
        session.query(PaperSession.id)
        .filter(
            PaperSession.created_by == PAPER_RUNTIME_SMOKE_ACTOR,
            PaperSession.dataset_key == PAPER_RUNTIME_SMOKE_DATASET_KEY,
            PaperSession.start_at == PAPER_RUNTIME_SMOKE_START_AT,
            PaperSession.end_at == PAPER_RUNTIME_SMOKE_END_AT,
        )
        .all()
    )
    return [row[0] for row in rows]


def _delete_fixture_paper_sessions(session) -> int:
    session_ids = _fixture_session_ids(session)
    if not session_ids:
        return 0
    session.query(PaperResumeCheckpoint).filter(PaperResumeCheckpoint.paper_session_id.in_(session_ids)).delete(
        synchronize_session=False
    )
    session.query(PaperFill).filter(PaperFill.paper_session_id.in_(session_ids)).delete(synchronize_session=False)
    session.query(PaperOrder).filter(PaperOrder.paper_session_id.in_(session_ids)).delete(synchronize_session=False)
    session.query(PaperPosition).filter(PaperPosition.paper_session_id.in_(session_ids)).delete(
        synchronize_session=False
    )
    session.query(PaperPortfolioSnapshot).filter(
        PaperPortfolioSnapshot.paper_session_id.in_(session_ids)
    ).delete(synchronize_session=False)
    session.query(PaperAuditEvent).filter(PaperAuditEvent.paper_session_id.in_(session_ids)).delete(
        synchronize_session=False
    )
    deleted = session.query(PaperSession).filter(PaperSession.id.in_(session_ids)).delete(synchronize_session=False)
    session.flush()
    return int(deleted)


def _delete_fixture_candles(session) -> int:
    deleted = (
        session.query(MarketCandle)
        .filter(
            MarketCandle.exchange == PAPER_RUNTIME_SMOKE_EXCHANGE,
            MarketCandle.symbol == PAPER_RUNTIME_SMOKE_SYMBOL,
            MarketCandle.timeframe == PAPER_RUNTIME_SMOKE_TIMEFRAME,
            MarketCandle.open_time >= PAPER_RUNTIME_SMOKE_START_AT,
            MarketCandle.open_time <= PAPER_RUNTIME_SMOKE_END_AT,
            MarketCandle.source == PAPER_RUNTIME_SMOKE_ACTOR,
        )
        .delete(synchronize_session=False)
    )
    session.flush()
    return int(deleted)


def _seed_candle(hour: int) -> dict[str, object]:
    timestamp = PAPER_RUNTIME_SMOKE_START_AT + timedelta(hours=hour)
    price = Decimal("100") + Decimal(hour)
    return {
        "exchange": PAPER_RUNTIME_SMOKE_EXCHANGE,
        "symbol": PAPER_RUNTIME_SMOKE_SYMBOL,
        "timeframe": PAPER_RUNTIME_SMOKE_TIMEFRAME,
        "open_time": timestamp,
        "close_time": timestamp + timedelta(hours=1),
        "open": price,
        "high": price + Decimal("1"),
        "low": price - Decimal("1"),
        "close": price,
        "volume": Decimal("10"),
        "quote_volume": price * Decimal("10"),
        "trade_count": 20 + hour,
        "source": PAPER_RUNTIME_SMOKE_ACTOR,
    }
