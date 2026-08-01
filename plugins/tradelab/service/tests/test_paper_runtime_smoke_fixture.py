from __future__ import annotations

import os
from collections.abc import Iterator
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://postgres:postgres123secure@localhost:5432/tradelab",
)

from tradelab_api.api import exchange as exchange_api  # noqa: E402
from tradelab_api.db.models import (  # noqa: E402
    Base,
    Bot,
    MarketCandle,
    PaperPortfolioSnapshot,
    PaperResumeCheckpoint,
    PaperSession,
    Strategy,
    StrategyGroup,
    StrategyVersion,
)
from tradelab_api.db.session import SessionLocal, get_engine  # noqa: E402
from tradelab_api.main import app  # noqa: E402
from tradelab_api.services.bot_repository import BotRepository  # noqa: E402
from tradelab_api.services.market_data_repository import MarketDataRepository  # noqa: E402
from tradelab_api.services.paper_session_run_local import (  # noqa: E402
    PaperSessionRunLocalRequestData,
    execute_local_paper_session_run,
)
from tradelab_api.services.paper_session_scheduler import PaperSessionScheduler  # noqa: E402
from tradelab_api.services.paper_kill_switch import PaperKillSwitchStatus  # noqa: E402
from tradelab_api.services.paper_session_resume_local import (  # noqa: E402
    PaperSessionResumeLocalRequestData,
    execute_local_paper_session_resume,
)
from tradelab_api.services.paper_runtime_smoke_fixture import (  # noqa: E402
    PAPER_RUNTIME_SMOKE_ACTOR,
    PAPER_RUNTIME_SMOKE_DATASET_KEY,
    PAPER_RUNTIME_SMOKE_END_AT,
    PAPER_RUNTIME_SMOKE_EXPECTED_FILLS_MIN,
    PAPER_RUNTIME_SMOKE_EXPECTED_ORDERS_MIN,
    PAPER_RUNTIME_SMOKE_EXPECTED_SNAPSHOTS_MIN,
    PAPER_RUNTIME_SMOKE_GROUP_SLUG,
    PAPER_RUNTIME_SMOKE_SAFETY_STATUS,
    PAPER_RUNTIME_SMOKE_SOURCE_CODE,
    PAPER_RUNTIME_SMOKE_START_AT,
    PAPER_RUNTIME_SMOKE_STRATEGY_SLUG,
    PAPER_RUNTIME_SMOKE_SYMBOL,
    PaperRuntimeSmokeFixtureValidationError,
    reset_paper_runtime_smoke_fixture,
)
from tradelab_api.services.paper_session_repository import PaperSessionRepository  # noqa: E402
from tradelab_api.services.paper_session_resume_readiness import build_paper_session_resume_readiness  # noqa: E402
from tradelab_api.services.strategy_repository import StrategyRepository  # noqa: E402
from tradelab_api.services.strategy_validator import validate_strategy_source  # noqa: E402

Base.metadata.create_all(bind=get_engine())


def _settings(*, enabled: bool = True, environment: str = "local", database_url: str = "postgresql+psycopg://user:password@localhost:5432/tradelab_smoke") -> SimpleNamespace:
    return SimpleNamespace(
        tradelab_local_paper_engine_enabled=enabled,
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


def _repositories(session: Session):
    return (
        StrategyRepository(session),
        BotRepository(session),
        MarketDataRepository(session),
    )


def _reset(
    session: Session,
    *,
    enabled: bool = True,
    environment: str = "local",
    confirm: bool = True,
    session_state: str = "queued",
):
    strategies, bots, market = _repositories(session)
    return reset_paper_runtime_smoke_fixture(
        strategies,
        bots,
        market,
        settings=_settings(enabled=enabled, environment=environment),
        confirm_fixture_reset=confirm,
        session_state=session_state,
    )


def _non_fixture_candle(session: Session) -> MarketCandle:
    symbol = f"NONFIX{uuid4().hex[:8].upper()}USDT"
    row = MarketCandle(
        exchange="binance",
        symbol=symbol,
        timeframe="1h",
        open_time=PAPER_RUNTIME_SMOKE_START_AT,
        close_time=PAPER_RUNTIME_SMOKE_START_AT + timedelta(hours=1),
        open=100,
        high=101,
        low=99,
        close=100,
        volume=10,
        source="pytest-non-fixture",
    )
    session.add(row)
    session.flush()
    return row


def test_reset_blocks_when_local_paper_engine_disabled(db_session: Session) -> None:
    before_count = db_session.query(PaperSession).filter(PaperSession.created_by == PAPER_RUNTIME_SMOKE_ACTOR).count()

    with pytest.raises(PaperRuntimeSmokeFixtureValidationError) as error:
        _reset(db_session, enabled=False)

    assert error.value.reason_code == "paper_runtime_fixture_not_enabled"
    assert db_session.query(PaperSession).filter(PaperSession.created_by == PAPER_RUNTIME_SMOKE_ACTOR).count() == before_count


def test_reset_blocks_in_production_environment(db_session: Session) -> None:
    before_count = db_session.query(PaperSession).filter(PaperSession.created_by == PAPER_RUNTIME_SMOKE_ACTOR).count()

    with pytest.raises(PaperRuntimeSmokeFixtureValidationError) as error:
        _reset(db_session, environment="production")

    assert error.value.reason_code == "paper_runtime_fixture_environment_not_allowed"
    assert db_session.query(PaperSession).filter(PaperSession.created_by == PAPER_RUNTIME_SMOKE_ACTOR).count() == before_count


def test_reset_requires_explicit_confirmation(db_session: Session) -> None:
    before_count = db_session.query(PaperSession).filter(PaperSession.created_by == PAPER_RUNTIME_SMOKE_ACTOR).count()

    with pytest.raises(PaperRuntimeSmokeFixtureValidationError) as error:
        _reset(db_session, confirm=False)

    assert error.value.reason_code == "paper_runtime_fixture_confirmation_required"
    assert db_session.query(PaperSession).filter(PaperSession.created_by == PAPER_RUNTIME_SMOKE_ACTOR).count() == before_count


def test_fixture_strategy_source_validates() -> None:
    validation = validate_strategy_source(PAPER_RUNTIME_SMOKE_SOURCE_CODE)

    assert validation.validation_status == "valid"
    assert validation.message is None


def test_reset_creates_strategy_bot_candles_and_queued_session(db_session: Session) -> None:
    result = _reset(db_session)
    db_session.flush()

    session = db_session.get(PaperSession, result.paper_session_id)
    bot = db_session.get(Bot, result.bot_id)
    version = db_session.get(StrategyVersion, result.strategy_version_id)
    candles = (
        db_session.query(MarketCandle)
        .filter(
            MarketCandle.symbol == PAPER_RUNTIME_SMOKE_SYMBOL,
            MarketCandle.open_time >= PAPER_RUNTIME_SMOKE_START_AT,
            MarketCandle.open_time <= PAPER_RUNTIME_SMOKE_END_AT,
            MarketCandle.source == PAPER_RUNTIME_SMOKE_ACTOR,
        )
        .order_by(MarketCandle.open_time.asc())
        .all()
    )

    assert result.safety_status == PAPER_RUNTIME_SMOKE_SAFETY_STATUS
    assert result.dataset_key == PAPER_RUNTIME_SMOKE_DATASET_KEY
    assert result.expected_orders_min == PAPER_RUNTIME_SMOKE_EXPECTED_ORDERS_MIN
    assert result.expected_fills_min == PAPER_RUNTIME_SMOKE_EXPECTED_FILLS_MIN
    assert result.expected_snapshots_min == PAPER_RUNTIME_SMOKE_EXPECTED_SNAPSHOTS_MIN
    assert result.seeded_rows == 6
    assert session is not None
    assert session.status == "queued"
    assert session.mode == "paper"
    assert session.dataset_key == PAPER_RUNTIME_SMOKE_DATASET_KEY
    assert session.created_by == PAPER_RUNTIME_SMOKE_ACTOR
    assert session.source_snapshot["strategyVersionId"] == str(result.strategy_version_id)
    assert session.gate_context["source"] == PAPER_RUNTIME_SMOKE_ACTOR
    assert bot is not None
    assert bot.mode == "paper"
    assert bot.status == "draft"
    assert version is not None
    assert version.validation_status == "valid"
    assert len(candles) == 6


def test_reset_is_idempotent_and_keeps_one_queued_fixture_session(db_session: Session) -> None:
    first = _reset(db_session)
    db_session.flush()
    second = _reset(db_session)
    db_session.flush()

    fixture_sessions = (
        db_session.query(PaperSession)
        .filter(
            PaperSession.created_by == PAPER_RUNTIME_SMOKE_ACTOR,
            PaperSession.dataset_key == PAPER_RUNTIME_SMOKE_DATASET_KEY,
        )
        .all()
    )
    fixture_candles = (
        db_session.query(MarketCandle)
        .filter(
            MarketCandle.symbol == PAPER_RUNTIME_SMOKE_SYMBOL,
            MarketCandle.source == PAPER_RUNTIME_SMOKE_ACTOR,
            MarketCandle.open_time >= PAPER_RUNTIME_SMOKE_START_AT,
            MarketCandle.open_time <= PAPER_RUNTIME_SMOKE_END_AT,
        )
        .all()
    )

    assert first.paper_session_id != second.paper_session_id
    assert second.deleted_fixture_sessions == 1
    assert len(fixture_sessions) == 1
    assert fixture_sessions[0].id == second.paper_session_id
    assert fixture_sessions[0].status == "queued"
    assert len(fixture_candles) == 6


def test_reset_can_create_cancelled_resumable_fixture_session(db_session: Session) -> None:
    result = _reset(db_session, session_state="cancelled_resumable")
    db_session.flush()

    session = db_session.get(PaperSession, result.paper_session_id)
    readiness = build_paper_session_resume_readiness(
        PaperSessionRepository(db_session),
        session_id=result.paper_session_id,
    )

    assert session is not None
    assert session.status == "cancelled"
    assert session.reason_code == "paper_session_cancel_requested"
    assert readiness.allowed is True
    assert readiness.reason_code == "paper_local_resume_readiness_ready"
    assert readiness.checkpoint_source == "persisted"
    assert readiness.artifact_identity_status == "ready"


def test_cancelled_resumable_fixture_session_can_resume_locally(db_session: Session) -> None:
    result = _reset(db_session, session_state="cancelled_resumable")

    resume = execute_local_paper_session_resume(
        PaperSessionRepository(db_session),
        settings=_settings(),
        session_id=result.paper_session_id,
        request=PaperSessionResumeLocalRequestData(
            confirm_local_paper_resume=True,
            idempotency_key="pytest-resume-fixture-1",
            reason="user_requested",
            actor="pytest-paper-runtime-smoke",
        ),
        kill_switch_status=PaperKillSwitchStatus(
            enabled=False,
            reason_code="paper_kill_switch_disabled",
            safety_status="local_dev_paper_kill_switch",
            source="pytest",
        ),
        readiness_builder=build_paper_session_resume_readiness,
    )
    db_session.flush()

    session = db_session.get(PaperSession, result.paper_session_id)
    assert resume.status == "queued"
    assert resume.reason_code == "paper_local_resume_queued"
    assert resume.resume_session_id == str(result.paper_session_id)
    assert session is not None
    assert session.status == "queued"
    assert session.reason_code == "paper_local_resume_queued"


def test_reset_restores_soft_deleted_strategy_fixture_rows(db_session: Session) -> None:
    group = db_session.query(StrategyGroup).filter(StrategyGroup.slug == PAPER_RUNTIME_SMOKE_GROUP_SLUG).one_or_none()
    if group is None:
        group = StrategyGroup(
            name="deleted smoke group",
            slug=PAPER_RUNTIME_SMOKE_GROUP_SLUG,
            created_by=PAPER_RUNTIME_SMOKE_ACTOR,
        )
        db_session.add(group)
        db_session.flush()
    group.is_active = False
    group.is_deleted = True
    db_session.flush()
    strategy = db_session.query(Strategy).filter(Strategy.slug == PAPER_RUNTIME_SMOKE_STRATEGY_SLUG).one_or_none()
    if strategy is None:
        strategy = Strategy(
            strategy_group_id=group.id,
            name="deleted smoke strategy",
            slug=PAPER_RUNTIME_SMOKE_STRATEGY_SLUG,
            status="draft",
            created_by=PAPER_RUNTIME_SMOKE_ACTOR,
        )
        db_session.add(strategy)
        db_session.flush()
    strategy.strategy_group_id = group.id
    strategy.is_active = False
    strategy.is_deleted = True
    db_session.flush()

    result = _reset(db_session)
    db_session.flush()
    db_session.refresh(group)
    db_session.refresh(strategy)

    assert result.strategy_group_id == group.id
    assert result.strategy_id == strategy.id
    assert group.is_active is True
    assert group.is_deleted is False
    assert strategy.is_active is True
    assert strategy.is_deleted is False
    assert strategy.strategy_group_id == group.id


def test_reset_does_not_touch_non_fixture_rows(db_session: Session) -> None:
    non_fixture = _non_fixture_candle(db_session)

    result = _reset(db_session)
    db_session.flush()
    db_session.refresh(non_fixture)

    assert result.paper_session_id is not None
    assert non_fixture.source == "pytest-non-fixture"
    assert non_fixture.symbol != PAPER_RUNTIME_SMOKE_SYMBOL


def test_fixture_session_runs_through_paper_engine_and_persists_artifacts(db_session: Session) -> None:
    fixture = _reset(db_session)
    result = execute_local_paper_session_run(
        db_session,
        settings=_settings(),
        session_id=fixture.paper_session_id,
        request=PaperSessionRunLocalRequestData(
            confirm_local_paper_run=True,
            worker_id="pytest-paper-runtime-smoke",
        ),
    )
    db_session.flush()
    session = db_session.get(PaperSession, fixture.paper_session_id)

    assert result.status == "completed"
    assert result.session_id == str(fixture.paper_session_id)
    assert result.orders_created >= PAPER_RUNTIME_SMOKE_EXPECTED_ORDERS_MIN
    assert result.fills_created >= PAPER_RUNTIME_SMOKE_EXPECTED_FILLS_MIN
    assert result.snapshots_created >= PAPER_RUNTIME_SMOKE_EXPECTED_SNAPSHOTS_MIN
    assert session is not None
    assert session.status == "completed"
    assert session.reason_code == "paper_engine_completed"
    assert len(session.orders) >= PAPER_RUNTIME_SMOKE_EXPECTED_ORDERS_MIN
    assert len(session.fills) >= PAPER_RUNTIME_SMOKE_EXPECTED_FILLS_MIN
    assert len(session.portfolio_snapshots) >= PAPER_RUNTIME_SMOKE_EXPECTED_SNAPSHOTS_MIN
    assert any(event.action == "paper_strategy_runtime_prepared" for event in session.audit_events)


def test_paper_scheduler_processes_explicit_queued_fixture_session(db_session: Session) -> None:
    result = _reset(db_session)
    fixture_session = db_session.get(PaperSession, result.paper_session_id)
    assert fixture_session is not None
    fixture_session.created_at = datetime(2000, 1, 1, tzinfo=timezone.utc)
    db_session.flush()

    scheduler = PaperSessionScheduler(
        settings_factory=lambda: SimpleNamespace(
            tradelab_paper_scheduler_enabled=True,
            tradelab_paper_scheduler_interval_seconds=60.0,
            tradelab_paper_scheduler_worker_id="tradelab-local-paper-scheduler-test",
            tradelab_paper_scheduler_error_backoff_seconds=60.0,
            tradelab_local_paper_engine_enabled=True,
            tradelab_local_paper_kill_switch_enabled=False,
            tradelab_environment="local",
        ),
        session_factory=lambda: SessionLocal(bind=db_session.connection()),
    )

    state = scheduler.tick_once(now=PAPER_RUNTIME_SMOKE_START_AT)
    db_session.expire_all()
    session = db_session.get(PaperSession, result.paper_session_id)

    assert state.last_tick_status == "processed"
    assert state.last_session_id == str(result.paper_session_id)
    assert state.candles_processed >= 1
    assert state.orders_created >= PAPER_RUNTIME_SMOKE_EXPECTED_ORDERS_MIN
    assert state.fills_created >= PAPER_RUNTIME_SMOKE_EXPECTED_FILLS_MIN
    assert state.snapshots_created >= PAPER_RUNTIME_SMOKE_EXPECTED_SNAPSHOTS_MIN
    assert state.last_reason_code == "paper_engine_completed"
    assert session is not None
    assert session.status == "completed"
    assert session.reason_code == "paper_engine_completed"

def test_reset_deletes_existing_resume_checkpoint_before_artifacts(db_session: Session) -> None:
    fixture = _reset(db_session)
    candle = (
        db_session.query(MarketCandle)
        .filter(
            MarketCandle.symbol == PAPER_RUNTIME_SMOKE_SYMBOL,
            MarketCandle.source == PAPER_RUNTIME_SMOKE_ACTOR,
            MarketCandle.open_time == PAPER_RUNTIME_SMOKE_START_AT,
        )
        .one()
    )
    snapshot = PaperPortfolioSnapshot(
        paper_session_id=fixture.paper_session_id,
        source_candle_id=candle.id,
        snapshot_at=PAPER_RUNTIME_SMOKE_START_AT,
        cash_balance=1000,
        equity=1000,
        realized_pnl=0,
        unrealized_pnl=0,
        fees_paid=0,
        drawdown_pct=0,
        exposure_notional=0,
        artifact_key="fixture-checkpoint-snapshot",
        created_by=PAPER_RUNTIME_SMOKE_ACTOR,
    )
    db_session.add(snapshot)
    db_session.flush()
    checkpoint = PaperResumeCheckpoint(
        paper_session_id=fixture.paper_session_id,
        attempt_no=0,
        last_processed_candle_id=candle.id,
        last_processed_candle_open_time=candle.open_time,
        last_processed_snapshot_id=snapshot.id,
        next_candle_id=candle.id,
        next_candle_open_time=candle.open_time,
        cash_balance=1000,
        equity=1000,
        realized_pnl=0,
        unrealized_pnl=0,
        fees_paid=0,
        exposure_notional=0,
        open_position_quantity=0,
        average_entry_price=None,
        peak_equity=1000,
        max_drawdown_pct=0,
        pending_orders_count=0,
        strategy_runtime_state_status="stateless_between_candles",
        checkpoint_source="persisted",
        reason_code="paper_engine_checkpoint_persisted",
        created_by=PAPER_RUNTIME_SMOKE_ACTOR,
    )
    db_session.add(checkpoint)
    db_session.flush()
    assert (
        db_session.query(PaperResumeCheckpoint)
        .filter(PaperResumeCheckpoint.paper_session_id == fixture.paper_session_id)
        .count()
        == 1
    )

    reset_result = _reset(db_session)
    db_session.flush()

    assert reset_result.deleted_fixture_sessions == 1
    assert (
        db_session.query(PaperResumeCheckpoint)
        .filter(PaperResumeCheckpoint.paper_session_id == fixture.paper_session_id)
        .count()
        == 0
    )
    assert db_session.get(PaperSession, reset_result.paper_session_id).status == "queued"


def test_api_route_commits_on_success(monkeypatch) -> None:
    from fastapi.testclient import TestClient

    class FakeSession:
        def __init__(self) -> None:
            self.commits = 0
            self.rollbacks = 0

        def commit(self) -> None:
            self.commits += 1

        def rollback(self) -> None:
            self.rollbacks += 1

        def close(self) -> None:
            pass

    fake_session = FakeSession()

    def fake_reset(strategy_repository, bot_repository, market_repository, *, settings, confirm_fixture_reset, session_state):
        assert session_state == "queued"
        return SimpleNamespace(
            paper_session_id=uuid4(),
            bot_id=uuid4(),
            strategy_id=uuid4(),
            strategy_version_id=uuid4(),
            strategy_slug="tradelab-paper-runtime-smoke",
            strategy_group_id=uuid4(),
            strategy_group_slug="tradelab-paper-runtime-smoke-fixtures",
            dataset_key=PAPER_RUNTIME_SMOKE_DATASET_KEY,
            exchange="binance",
            symbol=PAPER_RUNTIME_SMOKE_SYMBOL,
            timeframe="1h",
            requested_start_at=PAPER_RUNTIME_SMOKE_START_AT,
            requested_end_at=PAPER_RUNTIME_SMOKE_END_AT,
            expected_orders_min=2,
            expected_fills_min=2,
            expected_snapshots_min=6,
            seeded_rows=6,
            deleted_fixture_sessions=0,
            deleted_fixture_candles=0,
            safety_status=PAPER_RUNTIME_SMOKE_SAFETY_STATUS,
        )

    monkeypatch.setattr("tradelab_api.api.exchange.reset_paper_runtime_smoke_fixture", fake_reset)
    app.dependency_overrides[exchange_api.get_db_session] = lambda: fake_session
    try:
        response = TestClient(app).post(
            "/api/tradelab/smoke/paper-runtime-fixture/reset",
            json={"confirmFixtureReset": True},
        )
    finally:
        app.dependency_overrides.pop(exchange_api.get_db_session, None)

    payload = response.json()
    assert response.status_code == 200
    assert payload["Success"] is True
    assert payload["StatusCode"] == 200
    assert payload["Data"]["safetyStatus"] == PAPER_RUNTIME_SMOKE_SAFETY_STATUS
    assert fake_session.commits == 1
    assert fake_session.rollbacks == 0


def test_api_route_does_not_commit_on_guard_failure(monkeypatch) -> None:
    from fastapi.testclient import TestClient

    class FakeSession:
        def __init__(self) -> None:
            self.commits = 0

        def commit(self) -> None:
            self.commits += 1

        def close(self) -> None:
            pass

    fake_session = FakeSession()

    def fake_reset(strategy_repository, bot_repository, market_repository, *, settings, confirm_fixture_reset, session_state):
        raise PaperRuntimeSmokeFixtureValidationError(
            "paper_runtime_fixture_confirmation_required",
            "Paper runtime smoke fixture reset requires explicit confirmation.",
        )

    monkeypatch.setattr("tradelab_api.api.exchange.reset_paper_runtime_smoke_fixture", fake_reset)
    app.dependency_overrides[exchange_api.get_db_session] = lambda: fake_session
    try:
        response = TestClient(app).post(
            "/api/tradelab/smoke/paper-runtime-fixture/reset",
            json={"confirmFixtureReset": False},
        )
    finally:
        app.dependency_overrides.pop(exchange_api.get_db_session, None)

    payload = response.json()
    assert response.status_code == 200
    assert payload["Success"] is False
    assert payload["StatusCode"] == 400
    assert payload["Data"]["reasonCode"] == "paper_runtime_fixture_confirmation_required"
    assert fake_session.commits == 0


def test_reset_blocks_when_canonical_postgresql_url(db_session: Session) -> None:
    before_count = db_session.query(PaperSession).filter(PaperSession.created_by == PAPER_RUNTIME_SMOKE_ACTOR).count()

    with pytest.raises(PaperRuntimeSmokeFixtureValidationError) as error:
        strategies, bots, market = _repositories(db_session)
        reset_paper_runtime_smoke_fixture(
            strategies,
            bots,
            market,
            settings=_settings(database_url="postgresql+psycopg://user:password@localhost:5432/tradelab"),
            confirm_fixture_reset=True,
        )

    assert error.value.reason_code == "smoke_fixture_database_required"
    assert db_session.query(PaperSession).filter(PaperSession.created_by == PAPER_RUNTIME_SMOKE_ACTOR).count() == before_count


def test_reset_allows_smoke_postgresql_url(db_session: Session) -> None:
    result = strategies, bots, market = _repositories(db_session)
    result = reset_paper_runtime_smoke_fixture(
        strategies,
        bots,
        market,
        settings=_settings(database_url="postgresql+psycopg://user:password@localhost:5432/tradelab_smoke"),
        confirm_fixture_reset=True,
    )

    assert result.safety_status == PAPER_RUNTIME_SMOKE_SAFETY_STATUS


def test_reset_blocks_sqlite_in_local_environment(db_session: Session) -> None:
    with pytest.raises(PaperRuntimeSmokeFixtureValidationError) as error:
        strategies, bots, market = _repositories(db_session)
        reset_paper_runtime_smoke_fixture(
            strategies,
            bots,
            market,
            settings=_settings(database_url="sqlite:///:memory:", environment="local"),
            confirm_fixture_reset=True,
        )

    assert error.value.reason_code == "smoke_fixture_database_required"
