from __future__ import annotations

import os

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://postgres:postgres123secure@localhost:5432/tradelab",
)

from uuid import uuid4

from tradelab_api.core.config import Settings
from tradelab_api.db.models import Bot, StrategyGroup
from tradelab_api.db.session import SessionLocal, get_engine
from tradelab_api.services.baseline_seed import (
    BASELINE_GROUP_SLUG,
    BASELINE_RISK_CONFIG,
    BASELINE_RUNTIME_CONFIG,
    BASELINE_SOURCE_CODE,
    BASELINE_STRATEGY_SLUG,
    seed_baseline_fixture,
)
from tradelab_api.services.bot_repository import BotRepository
from tradelab_api.services.strategy_repository import StrategyRepository


def test_baseline_order_size_does_not_exceed_max_order_percent() -> None:
    assert "ctx.buy_market(percent=25)" in BASELINE_SOURCE_CODE
    assert BASELINE_RISK_CONFIG["maxOrderPercent"] == 25


def test_seed_baseline_fixture_creates_valid_functional_entities() -> None:
    with SessionLocal(bind=get_engine()) as session:
        result = seed_baseline_fixture(session, created_by="pytest")
        session.commit()

        repository = StrategyRepository(session)
        bot_repository = BotRepository(session)
        group = repository.get_strategy_group_by_slug(BASELINE_GROUP_SLUG)
        strategy = repository.get_strategy_by_slug(BASELINE_STRATEGY_SLUG)
        versions = repository.list_strategy_versions(strategy.id)
        bot = bot_repository.get_backtest_bot_for_strategy(
            strategy.id,
            name="TradeLab Baseline SMA 9/21 backtest bot",
        )

        assert group is not None
        assert strategy is not None
        assert bot is not None
        assert str(result.group_id) == str(group.id)
        assert str(result.strategy_id) == str(strategy.id)
        assert str(result.version_id) == str(strategy.current_version_id)
        assert str(result.bot_id) == str(bot.id)
        assert group.name == "TradeLab Baseline"
        assert group.slug == BASELINE_GROUP_SLUG
        assert group.metadata_["visibility"] == "workbench"
        assert group.metadata_["purpose"] == "baseline_smoke"
        assert group.metadata_["isBaseline"] is True
        assert strategy.runtime_config == BASELINE_RUNTIME_CONFIG
        assert strategy.risk_config == BASELINE_RISK_CONFIG
        assert strategy.metadata_["visibility"] == "workbench"
        assert strategy.metadata_["purpose"] == "baseline_smoke"
        assert strategy.metadata_["isBaseline"] is True
        assert versions[0].validation_status == "valid"
        assert "profit" not in (strategy.description or "").lower()


def test_seed_baseline_fixture_is_idempotent_and_repairs_config() -> None:
    with SessionLocal(bind=get_engine()) as session:
        first = seed_baseline_fixture(session, created_by="pytest")
        session.commit()

        repository = StrategyRepository(session)
        strategy = repository.get_strategy_by_slug(BASELINE_STRATEGY_SLUG)
        assert strategy is not None
        repository.update_strategy(
            strategy,
            runtime_config={},
            risk_config={},
            metadata_={"visibility": "workbench"},
        )
        session.commit()
        version_count_before_second_seed = len(repository.list_strategy_versions(strategy.id))

        second = seed_baseline_fixture(session, created_by="pytest")
        session.commit()

        group_rows = [group for group in repository.list_strategy_groups() if group.slug == BASELINE_GROUP_SLUG]
        strategy_rows = [item for item in repository.list_strategies() if item.slug == BASELINE_STRATEGY_SLUG]
        repaired = repository.get_strategy_by_slug(BASELINE_STRATEGY_SLUG)
        versions = repository.list_strategy_versions(repaired.id)

        assert first.group_id == second.group_id
        assert first.strategy_id == second.strategy_id
        assert len(group_rows) == 1
        assert len(strategy_rows) == 1
        assert repaired.runtime_config == BASELINE_RUNTIME_CONFIG
        assert repaired.risk_config == BASELINE_RISK_CONFIG
        assert repaired.metadata_["purpose"] == "baseline_smoke"
        assert len(versions) == version_count_before_second_seed


def test_seed_baseline_fixture_marks_known_integration_test_groups_without_deleting() -> None:
    suffix = uuid4().hex[:8]
    with SessionLocal(bind=get_engine()) as session:
        session.add(
            StrategyGroup(
                name=f"Group {suffix}",
                slug=f"group-{suffix}",
                description="Integration test group",
                metadata_={},
                created_by="pytest",
            )
        )
        session.commit()

        seed_baseline_fixture(session, created_by="pytest")
        session.commit()

        repository = StrategyRepository(session)
        tagged = repository.get_strategy_group_by_slug(f"group-{suffix}")
        assert tagged is not None
        assert tagged.is_deleted is False
        assert tagged.is_active is True
        assert tagged.metadata_["visibility"] == "test"
        assert tagged.metadata_["purpose"] == "automated_test_fixture"


def test_startup_seed_setting_defaults_to_disabled(monkeypatch) -> None:
    monkeypatch.delenv("SEED_BASELINE_ON_STARTUP", raising=False)
    monkeypatch.delenv("SEED_BASELINE_CREATED_BY", raising=False)
    settings = Settings()
    assert settings.seed_baseline_on_startup is False
    assert settings.seed_baseline_created_by == "trade-lab-startup"

def test_background_fill_scheduler_settings_default_to_disabled(monkeypatch) -> None:
    monkeypatch.delenv("TRADELAB_BACKGROUND_FILL_SCHEDULER_ENABLED", raising=False)
    monkeypatch.delenv("TRADELAB_BACKGROUND_FILL_SCHEDULER_INTERVAL_SECONDS", raising=False)
    monkeypatch.delenv("TRADELAB_BACKGROUND_FILL_SCHEDULER_WORKER_ID", raising=False)
    monkeypatch.delenv("TRADELAB_BACKGROUND_FILL_SCHEDULER_ERROR_BACKOFF_SECONDS", raising=False)

    settings = Settings()

    assert settings.tradelab_background_fill_scheduler_enabled is False
    assert settings.tradelab_background_fill_scheduler_interval_seconds == 60.0
    assert settings.tradelab_background_fill_scheduler_worker_id == "trade-lab-local-scheduler"
    assert settings.tradelab_background_fill_scheduler_error_backoff_seconds == 60.0

def test_paper_scheduler_settings_default_to_disabled(monkeypatch) -> None:
    monkeypatch.delenv("TRADELAB_PAPER_SCHEDULER_ENABLED", raising=False)
    monkeypatch.delenv("TRADELAB_PAPER_SCHEDULER_INTERVAL_SECONDS", raising=False)
    monkeypatch.delenv("TRADELAB_PAPER_SCHEDULER_WORKER_ID", raising=False)
    monkeypatch.delenv("TRADELAB_PAPER_SCHEDULER_ERROR_BACKOFF_SECONDS", raising=False)

    settings = Settings()

    assert settings.tradelab_paper_scheduler_enabled is False
    assert settings.tradelab_paper_scheduler_interval_seconds == 60.0
    assert settings.tradelab_paper_scheduler_worker_id == "tradelab-local-paper-scheduler"
    assert settings.tradelab_paper_scheduler_error_backoff_seconds == 60.0

def test_startup_seed_rolls_back_and_reraises(monkeypatch) -> None:
    import tradelab_api.main as main_module

    class FakeSession:
        rolled_back = False
        committed = False

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, traceback):
            return False

        def rollback(self):
            self.rolled_back = True

        def commit(self):
            self.committed = True

    fake_session = FakeSession()

    monkeypatch.setenv("SEED_BASELINE_ON_STARTUP", "true")
    monkeypatch.setattr(main_module, "SessionLocal", lambda bind=None: fake_session)
    monkeypatch.setattr(main_module, "get_engine", lambda: object())

    def fail_seed(session, created_by):
        raise RuntimeError(f"seed failed for {created_by}")

    monkeypatch.setattr(main_module, "seed_baseline_fixture", fail_seed)

    try:
        main_module.seed_startup_baseline_if_enabled()
    except RuntimeError as exc:
        assert "seed failed for trade-lab-startup" in str(exc)
    else:
        raise AssertionError("Expected seed failure.")

    assert fake_session.rolled_back is True
    assert fake_session.committed is False

def test_seed_baseline_fixture_repairs_duplicate_active_baseline_bots() -> None:
    with SessionLocal(bind=get_engine()) as session:
        first = seed_baseline_fixture(session, created_by="pytest")
        session.commit()

        duplicate = Bot(
            strategy_id=first.strategy_id,
            strategy_version_id=first.version_id,
            name="TradeLab Baseline SMA 9/21 backtest bot",
            mode="backtest",
            status="draft",
            symbol="BTCUSDT",
            timeframe="1h",
            runtime_config={},
            risk_config={},
            metadata_={"visibility": "workbench", "purpose": "duplicate_fixture"},
            created_by="pytest",
        )
        session.add(duplicate)
        session.commit()
        duplicate_id = duplicate.id

        second = seed_baseline_fixture(session, created_by="pytest")
        session.commit()

        active_bots = (
            session.query(Bot)
            .filter(
                Bot.strategy_id == first.strategy_id,
                Bot.name == "TradeLab Baseline SMA 9/21 backtest bot",
                Bot.mode == "backtest",
                Bot.is_active.is_(True),
                Bot.is_deleted.is_(False),
            )
            .all()
        )
        duplicate_after = session.get(Bot, duplicate_id)
        canonical = active_bots[0]

        assert second.bot_id == first.bot_id
        assert len(active_bots) == 1
        assert canonical.metadata_["visibility"] == "workbench"
        assert canonical.metadata_["purpose"] == "baseline_smoke"
        assert canonical.metadata_["isBaseline"] is True
        assert duplicate_after is not None
        assert duplicate_after.is_active is False
        assert duplicate_after.is_deleted is True

def test_seed_baseline_fixture_marks_slugged_test_groups_without_deleting() -> None:
    suffix = uuid4().hex[:8]
    with SessionLocal(bind=get_engine()) as session:
        session.add(
            StrategyGroup(
                name=f"Slug Test Group {suffix}",
                slug=f"test-group-{suffix}",
                description="Generated by automated test",
                metadata_={},
                created_by="pytest",
            )
        )
        session.commit()

        seed_baseline_fixture(session, created_by="pytest")
        session.commit()

        repository = StrategyRepository(session)
        tagged = repository.get_strategy_group_by_slug(f"test-group-{suffix}")
        assert tagged is not None
        assert tagged.is_deleted is False
        assert tagged.is_active is True
        assert tagged.metadata_["visibility"] == "test"
        assert tagged.metadata_["purpose"] == "automated_test_fixture"

def test_seed_baseline_fixture_does_not_tag_user_groups_without_test_markers() -> None:
    suffix = uuid4().hex[:8]
    with SessionLocal(bind=get_engine()) as session:
        session.add(
            StrategyGroup(
                name=f"User Group {suffix}",
                slug=f"user-group-{suffix}",
                description="User research group",
                metadata_={},
                created_by="pytest",
            )
        )
        session.commit()

        seed_baseline_fixture(session, created_by="pytest")
        session.commit()

        repository = StrategyRepository(session)
        group = repository.get_strategy_group_by_slug(f"user-group-{suffix}")
        assert group is not None
        assert group.is_deleted is False
        assert group.is_active is True
        assert "visibility" not in group.metadata_
        assert "purpose" not in group.metadata_
