from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from uuid import UUID

from sqlalchemy.orm import Session

from tradelab_api.db.models import Bot
from tradelab_api.services.bot_repository import BotRepository
from tradelab_api.services.strategy_repository import StrategyRepository
from tradelab_api.services.strategy_validator import apply_validation_result, validate_strategy_source

BASELINE_GROUP_NAME = "TradeLab Baseline"
BASELINE_GROUP_SLUG = "tradelab-baseline"
BASELINE_STRATEGY_NAME = "TradeLab Baseline SMA 9/21"
BASELINE_STRATEGY_SLUG = "tradelab-baseline-sma-9-21"
BASELINE_BOT_NAME = "TradeLab Baseline SMA 9/21 backtest bot"

BASELINE_METADATA: dict[str, object] = {
    "visibility": "workbench",
    "purpose": "baseline_smoke",
    "isBaseline": True,
}

BASELINE_RUNTIME_CONFIG: dict[str, object] = {
    "exchange": "binance",
    "symbol": "BTCUSDT",
    "timeframe": "1h",
    "startAt": "2026-01-01T00:00:00Z",
    "endAt": "2026-01-07T00:00:00Z",
    "initialEquity": 1000,
    "feeBps": 10,
    "slippageBps": 1,
}

BASELINE_RISK_CONFIG: dict[str, object] = {
    "maxOrderPercent": 25,
    "maxPositionPercent": 100,
    "maxDrawdownPercent": 25,
    "minNotional": 10,
    "stepSize": 0.001,
    "tickSize": 0.01,
}

BASELINE_SOURCE_CODE = """
from tradelab_sdk import StrategyContext


def on_candle(ctx: StrategyContext):
    close = ctx.history["close"]
    if len(close) < 21:
        return None

    fast = ctx.indicators.sma(close, 9)
    slow = ctx.indicators.sma(close, 21)

    if ctx.indicators.crossover(fast, slow):
        return ctx.buy_market(percent=25)

    if ctx.indicators.crossunder(fast, slow):
        return ctx.close_position()
""".strip()


@dataclass(frozen=True)
class BaselineSeedResult:
    group_id: UUID
    strategy_id: UUID
    version_id: UUID
    bot_id: UUID
    tagged_test_group_count: int


def seed_baseline_fixture(session: Session, *, created_by: str = "trade-lab-seed") -> BaselineSeedResult:
    strategy_repository = StrategyRepository(session)
    bot_repository = BotRepository(session)

    tagged_count = _tag_known_test_groups(strategy_repository, created_by=created_by)
    group = _upsert_group(strategy_repository, created_by=created_by)
    strategy = _upsert_strategy(strategy_repository, group_id=group.id, created_by=created_by)
    version = _ensure_current_version(strategy_repository, strategy, created_by=created_by)
    bot = _upsert_bot(
        bot_repository,
        strategy_id=strategy.id,
        version_id=version.id,
        created_by=created_by,
    )

    return BaselineSeedResult(
        group_id=group.id,
        strategy_id=strategy.id,
        version_id=version.id,
        bot_id=bot.id,
        tagged_test_group_count=tagged_count,
    )


def _upsert_group(repository: StrategyRepository, *, created_by: str):
    group = repository.get_strategy_group_by_slug(BASELINE_GROUP_SLUG)
    description = "Functional smoke fixture group for Strategy Lab. It is not a profit claim."
    if group is None:
        return repository.create_strategy_group(
            name=BASELINE_GROUP_NAME,
            slug=BASELINE_GROUP_SLUG,
            description=description,
            metadata_=dict(BASELINE_METADATA),
            created_by=created_by,
        )
    return repository.update_strategy_group(
        group,
        name=BASELINE_GROUP_NAME,
        description=description,
        metadata_={**dict(group.metadata_ or {}), **BASELINE_METADATA},
        updated_by=created_by,
    )


def _upsert_strategy(repository: StrategyRepository, *, group_id: UUID, created_by: str):
    strategy = repository.get_strategy_by_slug(BASELINE_STRATEGY_SLUG)
    description = (
        "Functional SMA 9/21 smoke fixture for validating Strategy Lab preflight, "
        "backtest, history, and benchmark repeat flows. It is not tuned for workflow validation."
    )
    fields = {
        "strategy_group_id": group_id,
        "name": BASELINE_STRATEGY_NAME,
        "description": description,
        "runtime_config": dict(BASELINE_RUNTIME_CONFIG),
        "risk_config": dict(BASELINE_RISK_CONFIG),
        "metadata_": dict(BASELINE_METADATA),
        "status": "active",
    }
    if strategy is None:
        return repository.create_strategy(
            slug=BASELINE_STRATEGY_SLUG,
            created_by=created_by,
            **fields,
        )
    return repository.update_strategy(
        strategy,
        **fields,
        updated_by=created_by,
    )


def _ensure_current_version(repository: StrategyRepository, strategy, *, created_by: str):
    source_hash = sha256(BASELINE_SOURCE_CODE.encode("utf-8")).hexdigest()
    versions = repository.list_strategy_versions(strategy.id)
    matching = next((version for version in versions if version.source_hash == source_hash), None)
    if matching is not None:
        if strategy.current_version_id != matching.id:
            repository.update_strategy(strategy, current_version_id=matching.id, updated_by=created_by)
        return matching

    validation = validate_strategy_source(BASELINE_SOURCE_CODE)
    version = repository.create_strategy_version(
        strategy_id=strategy.id,
        version_number=(versions[0].version_number + 1) if versions else 1,
        source_code=BASELINE_SOURCE_CODE,
        source_hash=source_hash,
        validation_status=validation.validation_status,
        validation_message=validation.message,
        created_by=created_by,
    )
    apply_validation_result(version, validation)
    if validation.is_valid:
        repository.update_strategy(strategy, current_version_id=version.id, updated_by=created_by)
    return version


def _upsert_bot(bot_repository: BotRepository, *, strategy_id: UUID, version_id: UUID, created_by: str):
    bots = (
        bot_repository.session.query(Bot)
        .filter(
            Bot.strategy_id == strategy_id,
            Bot.name == BASELINE_BOT_NAME,
            Bot.mode == "backtest",
            Bot.is_deleted.is_(False),
            Bot.is_active.is_(True),
        )
        .order_by(Bot.created_at.asc(), Bot.id.asc())
        .all()
    )
    bot = bots[0] if bots else None
    for duplicate in bots[1:]:
        bot_repository.update_bot(
            duplicate,
            is_active=False,
            is_deleted=True,
            updated_by=created_by,
        )
    fields = {
        "strategy_version_id": version_id,
        "name": BASELINE_BOT_NAME,
        "mode": "backtest",
        "status": "draft",
        "symbol": "BTCUSDT",
        "timeframe": "1h",
        "runtime_config": {
            "exchange": "binance",
            "symbol": "BTCUSDT",
            "timeframe": "1h",
        },
        "risk_config": {
            "maxOrderPercent": BASELINE_RISK_CONFIG["maxOrderPercent"],
            "maxPositionPercent": BASELINE_RISK_CONFIG["maxPositionPercent"],
            "minNotional": BASELINE_RISK_CONFIG["minNotional"],
            "maxDrawdownPercent": BASELINE_RISK_CONFIG["maxDrawdownPercent"],
        },
        "metadata_": dict(BASELINE_METADATA),
    }
    if bot is None:
        return bot_repository.create_bot(
            strategy_id=strategy_id,
            created_by=created_by,
            **fields,
        )
    return bot_repository.update_bot(
        bot,
        strategy_id=strategy_id,
        **fields,
        updated_by=created_by,
    )


def _tag_known_test_groups(repository: StrategyRepository, *, created_by: str) -> int:
    tagged_count = 0
    for group in repository.list_strategy_groups():
        metadata = dict(group.metadata_ or {})
        if metadata.get("visibility") is not None:
            continue
        is_known_test_group = (
            group.description == "Integration test group"
            or group.slug.startswith("test-group-")
        )
        if not is_known_test_group:
            continue
        repository.update_strategy_group(
            group,
            metadata_={
                **metadata,
                "visibility": "test",
                "purpose": "automated_test_fixture",
            },
            updated_by=created_by,
        )
        tagged_count += 1
    return tagged_count
