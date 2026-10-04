from datetime import datetime, timezone
from time import monotonic
from uuid import UUID

import pytest
from sqlalchemy import func, select, text, update
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import make_transient_to_detached

from tradelab_api.core.authorization import FunctionalPermissionAction
from tradelab_api.core.context import ExecutionContext
from tradelab_api.db import models
from tradelab_api.db.session import SessionLocal
from tradelab_api.db.session import get_engine
from tradelab_api.db.ownership_provenance import bind_execution_context
from tradelab_api.services.job_dispatcher import JobDispatcher
from tradelab_api.services.strategy_repository import StrategyRepository

ROOT_NAMES = (
    "StrategyGroup", "Strategy", "StrategyVersion", "Bot", "BotRun",
    "ExchangeConnection", "TestnetCredentialRef", "LiveCredentialRef",
    "TestnetOrderPreview", "TestnetOrderIntent", "LiveOrderPreview", "LiveOrderIntent",
    "ManualTradeJournalEntry", "PaperSession",
)
ACTOR = UUID("00000000-0000-0000-0000-000000000001")
WORKSPACE = UUID("00000000-0000-0000-0000-000000000002")
VERIFIED_AT = datetime(2026, 10, 2, tzinfo=timezone.utc)

def context(*, deadline=None):
    return ExecutionContext(
        workspace_id=WORKSPACE, actor_user_id=ACTOR,
        permission_key="tradelab.strategies", action=FunctionalPermissionAction.ADD,
        resource_type="strategy", resource_id=None, run_id=None,
        correlation_id="provenance-test", authority_verified_at=VERIFIED_AT,
        authority_deadline_monotonic=monotonic() + 7 if deadline is None else deadline,
    )

def root_row(name="Strategy"):
    model = getattr(models, name)
    fields = {"id": ACTOR, "workspace_id": WORKSPACE, "created_by": str(ACTOR)}
    if hasattr(model, "owner_user_id"):
        fields["owner_user_id"] = ACTOR
    return model(**fields)

def before_flush(session):
    session.dispatch.before_flush(session, None, None)

@pytest.mark.parametrize("name", ROOT_NAMES)
def test_proof_column_has_no_client_or_database_default(name):
    column = getattr(models, name).__table__.c.get("ownership_verified_at")
    assert column is not None, f"{name} lacks independent ownership provenance"
    assert column.nullable and column.default is None and column.server_default is None

@pytest.mark.parametrize("name", ROOT_NAMES)
def test_trusted_creation_stamps_exact_verified_authority(name):
    with SessionLocal() as session:
        session.info["execution_context"] = context()
        row = root_row(name)
        session.add(row)
        before_flush(session)
        assert getattr(row, "ownership_verified_at", None) == VERIFIED_AT

@pytest.mark.parametrize("name", ROOT_NAMES)
def test_no_context_does_not_adopt_canonical_legacy(name):
    with SessionLocal() as session:
        row = root_row(name)
        session.add(row)
        before_flush(session)
        assert getattr(row, "ownership_verified_at", None) is None

@pytest.mark.parametrize("case", ("stale", "wrong-owner", "wrong-workspace", "spoof-proof"))
def test_invalid_creation_cannot_get_proof(case):
    with SessionLocal() as session:
        session.info["execution_context"] = context(deadline=monotonic() - 1) if case == "stale" else context()
        row = root_row()
        if case == "wrong-owner":
            row.created_by = str(WORKSPACE)
        elif case == "wrong-workspace":
            row.workspace_id = ACTOR
        elif case == "spoof-proof":
            row.ownership_verified_at = VERIFIED_AT
        session.add(row)
        with pytest.raises(PermissionError):
            before_flush(session)

@pytest.mark.parametrize("field", ("workspace_id", "created_by", "ownership_verified_at"))
def test_persisted_identity_and_proof_immutable(field):
    row = root_row()
    row.ownership_verified_at = VERIFIED_AT
    make_transient_to_detached(row)
    with SessionLocal() as session:
        session.add(row)
        setattr(row, field, None)
        with pytest.raises(PermissionError):
            before_flush(session)

@pytest.mark.parametrize("resource", ("run", "paper"))
def test_postgresql_historical_version_survives_owned_bot_version_update(resource):
    from conftest import bind_test_context
    from test_ws01_database_closeout import run_fields, seed_owner
    from tradelab_api.services.bot_repository import BotRepository
    from tradelab_api.services.paper_session_repository import PaperSessionRepository
    from tradelab_api.services.run_repository import RunRepository
    from uuid import uuid4

    engine = get_engine()
    assert engine.url.database == "tradelab_test"
    workspace, owner = uuid4(), uuid4()
    with SessionLocal(bind=engine) as session:
        references = seed_owner(session, workspace, owner)
        bind_test_context(session, workspace, owner)
        if resource == "run":
            repository = RunRepository(session, workspace, owner)
            row = repository.create_bot_run(**run_fields(references, status="completed"))
        else:
            repository = PaperSessionRepository(session, workspace, owner)
            row = repository.create_paper_session(
                strategy_id=references[0], strategy_version_id=references[1], bot_id=references[2],
                mode="paper", status="completed", exchange="binance", symbol="BTCUSDT", timeframe="1h",
                dataset_key="ws01", starting_cash=1000, start_at=VERIFIED_AT, end_at=VERIFIED_AT,
            )
        row_id = row.id
        session.commit()
        version = StrategyRepository(session, workspace, owner).create_strategy_version(
            strategy_id=references[0], version_number=2, source_code="def on_candle(ctx): return []",
            source_hash="new-version", validation_status="valid",
        )
        bot_repository = BotRepository(session, workspace, owner)
        bot_repository.update_bot(bot_repository.get_bot(references[2]), strategy_version_id=version.id)
        session.commit()
    with SessionLocal(bind=engine) as observer:
        if resource == "run":
            current = RunRepository(observer, workspace, owner).get_bot_run(row_id)
        else:
            current = PaperSessionRepository(observer, workspace, owner).get_paper_session(row_id)
        assert current is not None
        assert current.strategy_version_id == references[1]

def test_canonical_legacy_run_quarantined():
    dispatcher = object.__new__(JobDispatcher)
    assert dispatcher._is_quarantined(root_row("BotRun"))

class QueryCaptured(Exception):
    pass

def capture_statement(session, statement):
    from sqlalchemy import event

    captured = []
    def capture(state):
        captured.append(str(state.statement.compile(dialect=postgresql.dialect())))
        raise QueryCaptured

    event.listen(session, "do_orm_execute", capture)
    with pytest.raises(QueryCaptured):
        session.execute(statement)
    return captured[0]

def test_provenance_applies_to_select_join_and_subquery():
    with SessionLocal() as session:
        statement = select(models.StrategyVersion).join(
            models.Strategy, models.Strategy.id == models.StrategyVersion.strategy_id,
        ).where(
            models.StrategyVersion.strategy_id.in_(select(models.Strategy.id))
        )
        sql = capture_statement(session, statement)
    assert "strategy.ownership_verified_at IS NOT NULL" in sql
    assert "strategy_version.ownership_verified_at IS NOT NULL" in sql

def test_bulk_status_update_requires_proof():
    with SessionLocal() as session:
        sql = capture_statement(session, update(models.BotRun).values(status="failed"))
    assert "bot_run.ownership_verified_at IS NOT NULL" in sql

def test_bulk_proof_forgery_rejected():
    with SessionLocal() as session, pytest.raises(PermissionError):
        session.execute(update(models.BotRun).values(ownership_verified_at=VERIFIED_AT))

def test_unverified_attached_object_cannot_be_mutated():
    row = root_row()
    row.ownership_verified_at = None
    make_transient_to_detached(row)
    with SessionLocal() as session:
        session.add(row)
        row.name = "attempted adoption"
        with pytest.raises(PermissionError):
            before_flush(session)

@pytest.mark.parametrize("provider", ("live", "testnet"))
def test_cached_preview_cannot_bypass_provenance(provider, monkeypatch):
    if provider == "live":
        from tradelab_api.services.live_order_state_repository import LiveOrderStateRepository as Repository
        row = root_row("LiveOrderPreview")
    else:
        from tradelab_api.services.testnet_order_state_repository import TestnetOrderStateRepository as Repository
        row = root_row("TestnetOrderPreview")
    row.ownership_verified_at = None
    make_transient_to_detached(row)
    with SessionLocal() as session:
        session.add(row)
        repository = Repository(session, WORKSPACE, ACTOR)
        monkeypatch.setattr(repository, "get_preview_with_intent", lambda _id: (None, None))
        assert repository.get_preview(row.id) is None

def test_postgresql_migration_retains_canonical_legacy_quarantine():
    from tradelab_api.tools.ownership_provenance_migration import (
        PROVENANCE_TABLES, migrate_ownership_provenance, verify_ownership_provenance_schema,
    )

    engine = get_engine()
    assert engine.url.database == "tradelab_test"
    with engine.begin() as connection:
        for table_name in PROVENANCE_TABLES:
            connection.execute(text(f"ALTER TABLE {table_name} DROP COLUMN ownership_verified_at"))
        connection.execute(text(
            "INSERT INTO strategy (id, workspace_id, created_by, name, slug, status, created_at) "
            "VALUES (:id, :workspace, :owner, 'Legacy', 'legacy-proof', 'draft', '2026-01-01')"
        ), {"id": ACTOR, "workspace": WORKSPACE, "owner": str(ACTOR)})
        with pytest.raises(RuntimeError, match="migration required"):
            verify_ownership_provenance_schema(connection)
        migrate_ownership_provenance(connection)
        migrate_ownership_provenance(connection)
        assert connection.scalar(text("SELECT ownership_verified_at FROM strategy WHERE id=:id"), {"id": ACTOR}) is None
    with SessionLocal(bind=engine) as session:
        repository = StrategyRepository(session, WORKSPACE, ACTOR)
        assert repository.list_strategies() == []
        assert repository.get_strategy(ACTOR) is None
        legacy = session.execute(models.Strategy.__table__.select()).first()
        assert legacy.created_by == str(ACTOR) and legacy.ownership_verified_at is None
        bind_execution_context(session, context())
        trusted = repository.create_strategy(name="Trusted", slug="trusted-proof", status="draft")
        version = repository.create_strategy_version(
            strategy_id=trusted.id, version_number=1, source_code="def on_candle(ctx): return []",
            source_hash="proof-test", validation_status="valid",
        )
        session.commit()
        assert repository.get_strategy(trusted.id).ownership_verified_at == VERIFIED_AT
        assert repository.get_strategy_version(version.id).ownership_verified_at == VERIFIED_AT
        assert [row.id for row in repository.list_strategies()] == [trusted.id]

def test_postgresql_success_result_failure_rolls_back_completion():
    from conftest import bind_test_context
    from test_ws01_database_closeout import run_fields, seed_owner
    from tradelab_api.services.run_repository import RunRepository
    from sqlalchemy import event
    from types import SimpleNamespace
    from uuid import uuid4
    from tradelab_api.services.backtest.engine import persist_backtest_execution

    engine = get_engine()
    assert engine.url.database == "tradelab_test"
    workspace, owner = uuid4(), uuid4()
    with SessionLocal(bind=engine) as session:
        bind_test_context(session, workspace, owner)
        references = seed_owner(session, workspace, owner)
        run = RunRepository(session, workspace, owner).create_bot_run(**run_fields(references, status="running"), pipeline_status="running")
        session.commit()
        run_id = run.id

    def fail_result_write(_connection, _cursor, statement, _parameters, _context, _executemany):
        if statement.startswith("INSERT INTO backtest_result"):
            raise RuntimeError("synthetic result-write failure")

    with SessionLocal(bind=engine) as completing:
        repository = RunRepository(completing, workspace, owner)
        current = repository.get_bot_run(run_id)
        completed = repository.complete_bot_run(current, status="completed")
        assert completed is not None
        execution = SimpleNamespace(
            bot_run=completed, result=models.BacktestResult(bot_run_id=run_id),
            signals=[], order_intents=[], trade_orders=[], logs=[], positions=[],
        )
        persist_backtest_execution(completing, execution)
        event.listen(engine, "before_cursor_execute", fail_result_write)
        try:
            with pytest.raises(RuntimeError, match="synthetic result-write failure"):
                completing.flush()
            completing.rollback()
        finally:
            event.remove(engine, "before_cursor_execute", fail_result_write)
    with SessionLocal(bind=engine) as observer:
        persisted = RunRepository(observer, workspace, owner).get_bot_run(run_id)
        assert persisted.status == persisted.pipeline_status == "running"
        assert persisted.finished_at is None
        assert observer.scalar(select(func.count(models.BacktestResult.id)).where(models.BacktestResult.bot_run_id == run_id)) == 0

@pytest.mark.parametrize("resource", ("bot", "run"))
@pytest.mark.parametrize("mismatch", ("peer-version", "foreign-workspace", "unverified-version"))
def test_postgresql_private_root_read_quarantines_invalid_parent(resource, mismatch):
    from conftest import bind_test_context
    from test_ws01_database_closeout import run_fields, seed_owner
    from tradelab_api.services.bot_repository import BotRepository
    from tradelab_api.services.run_repository import RunRepository
    from uuid import uuid4

    engine = get_engine()
    assert engine.url.database == "tradelab_test"
    workspace, owner = uuid4(), uuid4()
    with SessionLocal(bind=engine) as session:
        references = seed_owner(session, workspace, owner)
        foreign_refs = seed_owner(
            session, uuid4() if mismatch == "foreign-workspace" else workspace,
            owner if mismatch == "foreign-workspace" else uuid4(),
        )
        bind_test_context(session, workspace, owner)
        if resource == "bot":
            repository = BotRepository(session, workspace, owner)
            row = repository.get_bot(references[2])
        else:
            repository = RunRepository(session, workspace, owner)
            row = repository.create_bot_run(**run_fields(references))
        row_id = row.id
        session.commit()
        assert repository.get_by_id(row_id, active_only=False) is not None
        if mismatch == "unverified-version":
            session.connection().execute(models.StrategyVersion.__table__.update().where(
                models.StrategyVersion.__table__.c.id == references[1],
            ).values(ownership_verified_at=None))
        else:
            row.strategy_version_id = foreign_refs[1]
        session.commit()
    with SessionLocal(bind=engine) as observer:
        repository = BotRepository(observer, workspace, owner) if resource == "bot" else RunRepository(observer, workspace, owner)
        assert repository.get_by_id(row_id, active_only=False) is None
        assert all(row.id != row_id for row in repository.list_all(active_only=False))

@pytest.mark.parametrize("mismatch", ("peer-version", "foreign-workspace", "unverified-version"))
def test_postgresql_paper_read_quarantines_invalid_parent(mismatch):
    from conftest import bind_test_context
    from test_ws01_database_closeout import seed_owner
    from tradelab_api.services.paper_session_repository import PaperSessionRepository
    from uuid import uuid4

    engine = get_engine()
    assert engine.url.database == "tradelab_test"
    workspace, owner = uuid4(), uuid4()
    with SessionLocal(bind=engine) as session:
        references = seed_owner(session, workspace, owner)
        foreign_refs = seed_owner(session, uuid4() if mismatch == "foreign-workspace" else workspace, uuid4())
        bind_test_context(session, workspace, owner)
        repository = PaperSessionRepository(session, workspace, owner)
        row = repository.create_paper_session(
            strategy_id=references[0], strategy_version_id=references[1], bot_id=references[2],
            mode="paper", status="queued", exchange="binance", symbol="BTCUSDT", timeframe="1h",
            dataset_key="ws01", starting_cash=1000, start_at=VERIFIED_AT, end_at=VERIFIED_AT,
        )
        session.commit()
        row_id = row.id
        assert repository.get_paper_session(row_id) is row
        if mismatch == "unverified-version":
            session.connection().execute(models.StrategyVersion.__table__.update().where(
                models.StrategyVersion.__table__.c.id == references[1],
            ).values(ownership_verified_at=None))
        else:
            row.strategy_version_id = foreign_refs[1]
        session.commit()
        assert repository.get_paper_session(row_id) is None
        assert repository.get_paper_session_for_update(row_id) is None
        assert repository.list_paper_sessions(
            strategy_id=None, strategy_version_id=None, dataset_key=None, status=None, limit=100,
        ) == []

@pytest.mark.parametrize("resource", ("strategy", "version", "bot", "run", "paper"))
@pytest.mark.parametrize("mismatch", ("peer-group", "unverified-group"))
def test_postgresql_private_graph_rejects_invalid_group_ancestor(resource, mismatch):
    from conftest import bind_test_context
    from test_ws01_database_closeout import run_fields, seed_owner
    from tradelab_api.services.bot_repository import BotRepository
    from tradelab_api.services.paper_session_repository import PaperSessionRepository
    from tradelab_api.services.run_repository import RunRepository
    from uuid import uuid4

    engine = get_engine()
    assert engine.url.database == "tradelab_test"
    workspace, owner, peer = uuid4(), uuid4(), uuid4()
    with SessionLocal(bind=engine) as session:
        references = seed_owner(session, workspace, owner)
        bind_test_context(session, workspace, peer if mismatch == "peer-group" else owner)
        group = StrategyRepository(session, workspace, peer if mismatch == "peer-group" else owner).create_strategy_group(
            name="Ancestor", slug=uuid4().hex,
        )
        session.commit()
        bind_test_context(session, workspace, owner)
        strategy_repository = StrategyRepository(session, workspace, owner)
        run_repository = RunRepository(session, workspace, owner)
        paper_repository = PaperSessionRepository(session, workspace, owner)
        run = run_repository.create_bot_run(**run_fields(references))
        paper = paper_repository.create_paper_session(
            strategy_id=references[0], strategy_version_id=references[1], bot_id=references[2],
            mode="paper", status="queued", exchange="binance", symbol="BTCUSDT", timeframe="1h",
            dataset_key="ws01", starting_cash=1000, start_at=VERIFIED_AT, end_at=VERIFIED_AT,
        )
        session.commit()
        readers = {
            "strategy": lambda: strategy_repository.get_strategy(references[0]),
            "version": lambda: strategy_repository.get_strategy_version(references[1]),
            "bot": lambda: BotRepository(session, workspace, owner).get_bot(references[2]),
            "run": lambda: run_repository.get_bot_run(run.id),
            "paper": lambda: paper_repository.get_paper_session(paper.id),
        }
        assert readers[resource]() is not None
        session.get(models.Strategy, references[0]).strategy_group_id = group.id
        if mismatch == "unverified-group":
            session.connection().execute(models.StrategyGroup.__table__.update().where(
                models.StrategyGroup.__table__.c.id == group.id,
            ).values(ownership_verified_at=None))
        session.commit()
        assert readers[resource]() is None

def test_postgresql_paper_descendants_require_parent_workspace_stamp():
    from test_ws01_database_closeout import seed_owner
    from tradelab_api.services.paper_session_repository import PaperSessionRepository
    from uuid import uuid4

    engine = get_engine()
    assert engine.url.database == "tradelab_test"
    workspace, owner = uuid4(), uuid4()
    with SessionLocal(bind=engine) as session:
        references = seed_owner(session, workspace, owner)
        repository = PaperSessionRepository(session, workspace, owner)
        paper = repository.create_paper_session(
            strategy_id=references[0], strategy_version_id=references[1], bot_id=references[2],
            mode="paper", status="queued", exchange="binance", symbol="BTCUSDT", timeframe="1h",
            dataset_key="ws01", starting_cash=1000, start_at=VERIFIED_AT, end_at=VERIFIED_AT,
        )
        session.add_all([models.PaperOrder(
            paper_session_id=paper.id, workspace_id=stamp, created_by=str(owner),
            side="buy", order_type="market", status="accepted", quantity=1,
        ) for stamp in (workspace, uuid4())])
        session.commit()
        assert len(repository.list_orders_for_session(paper.id, limit=100)) == 1
        assert repository.count_orders_for_session(paper.id) == 1
        assert len(repository.list_pending_orders_for_session(paper.id)) == 1

@pytest.mark.parametrize("mismatch", ("child-workspace", "entry-version", "run-parent"))
def test_postgresql_journal_requires_exact_authorized_graph(mismatch):
    from test_ws01_database_closeout import run_fields, seed_owner
    from tradelab_api.services.execution_journal_repository import ExecutionJournalRepository
    from tradelab_api.services.run_repository import RunRepository
    from uuid import uuid4

    engine = get_engine()
    assert engine.url.database == "tradelab_test"
    workspace, owner = uuid4(), uuid4()
    with SessionLocal(bind=engine) as session:
        references = seed_owner(session, workspace, owner)
        run = RunRepository(session, workspace, owner).create_bot_run(**run_fields(references))
        repository = ExecutionJournalRepository(session, workspace, owner)
        entry = repository.create_entry(
            source_run_id=run.id, strategy_id=references[0], strategy_version_id=references[1],
            symbol="BTCUSDT", timeframe="1h", side="long", planned_snapshot={}, comparison_summary={},
            outcome_status="open", discipline_status="followed_plan", safety_status="manual_execution_journal_only",
            notes=None, fills=[dict(fill_role="entry", side="buy", price=1, quantity=1)], created_by=str(owner),
        )
        session.commit()
        entry_id, run_id = entry.id, run.id
        assert len(repository.get_entry(entry_id).fills) == 1
        if mismatch == "child-workspace":
            entry.fills[0].workspace_id = uuid4()
        else:
            peer_refs = seed_owner(session, workspace, uuid4())
            if mismatch == "entry-version":
                entry.strategy_version_id = peer_refs[1]
            else:
                run.strategy_version_id = peer_refs[1]
        session.commit()
        if mismatch == "child-workspace":
            assert repository.get_entry(entry_id).fills == []
        else:
            assert repository.get_entry(entry_id) is None
            assert repository.list_entries_for_run(run_id) == []

@pytest.mark.parametrize("environment", ("testnet", "live"))
@pytest.mark.parametrize("mismatch", ("unverified-version", "peer-version", "event-workspace"))
def test_postgresql_order_lists_and_events_require_authorized_graph(environment, mismatch):
    from importlib import import_module
    from conftest import DEFAULT_TEST_USER_ID, DEFAULT_TEST_WORKSPACE_ID, bind_test_context
    from test_ws01_database_closeout import seed_owner
    from uuid import uuid4

    fixtures = import_module("test_" + environment + "_order_state_repository")
    engine = get_engine()
    assert engine.url.database == "tradelab_test"
    with SessionLocal(bind=engine) as session:
        bind_test_context(session, DEFAULT_TEST_WORKSPACE_ID, DEFAULT_TEST_USER_ID)
        repository = fixtures.OrderStateRepository(session, DEFAULT_TEST_WORKSPACE_ID, DEFAULT_TEST_USER_ID)
        intent = repository.create_intent(**fixtures._intent_payload(session))
        event = repository.add_event(
            intent_id=intent.id, preview_id=None, event_type=environment + "_order_preview_created", from_status=None, to_status=None,
            reason_code=None, idempotency_key=None, client_order_id=None, exchange_order_id=None,
            actor=str(DEFAULT_TEST_USER_ID), metadata={},
        )
        session.commit()
        intent_id = intent.id
        assert [row.id for row in repository.list_intents()] == [intent_id]
        if mismatch == "unverified-version":
            session.connection().execute(models.StrategyVersion.__table__.update().where(
                models.StrategyVersion.__table__.c.id == intent.strategy_version_id,
            ).values(ownership_verified_at=None))
        elif mismatch == "peer-version":
            references = seed_owner(session, DEFAULT_TEST_WORKSPACE_ID, uuid4())
            intent.strategy_version_id = references[1]
        else:
            event.workspace_id = uuid4()
        session.commit()
        if mismatch == "event-workspace":
            assert repository.list_events_for_intent(intent_id) == []
        else:
            assert repository.get_intent(intent_id) is None
            assert repository.list_intents() == []


@pytest.mark.parametrize("environment", ("testnet", "live"))
@pytest.mark.parametrize("mismatch", ("preview-workspace", "event-preview", "latest-preview", "idempotency-preview"))
def test_postgresql_preview_requires_exact_owned_intent(environment, mismatch):
    from importlib import import_module
    from conftest import DEFAULT_TEST_USER_ID, DEFAULT_TEST_WORKSPACE_ID, bind_test_context
    from uuid import uuid4

    fixtures = import_module("test_" + environment + "_order_state_repository")
    engine = get_engine()
    assert engine.url.database == "tradelab_test"
    with SessionLocal(bind=engine) as session:
        bind_test_context(session, DEFAULT_TEST_WORKSPACE_ID, DEFAULT_TEST_USER_ID)
        repository = fixtures.OrderStateRepository(session, DEFAULT_TEST_WORKSPACE_ID, DEFAULT_TEST_USER_ID)
        intent = repository.create_intent(**fixtures._intent_payload(session))
        other = repository.create_intent(**fixtures._intent_payload(session))
        previews = [repository.create_preview(
            intent_id=parent.id, preview_key=uuid4().hex, status="allowed", reason_code=None,
            symbol=parent.symbol, side="buy", order_type="market", quantity=1, quote_quantity=None,
            estimated_notional=100, estimated_fee=0, risk_snapshot={}, credential_snapshot={},
            source_snapshot={}, expires_at=VERIFIED_AT, metadata={}, actor=str(DEFAULT_TEST_USER_ID),
        ) for parent in (intent, other)]
        session.commit()
        preview, other_preview = previews
        assert repository.get_preview(preview.id) is preview
        if mismatch == "preview-workspace":
            table = type(preview).__table__
            session.connection().execute(table.update().where(table.c.id == preview.id).values(workspace_id=uuid4()))
            session.commit()
            assert repository.get_preview(preview.id) is None
            assert repository.list_previews_for_intent(intent.id) == []
        elif mismatch == "latest-preview":
            with pytest.raises(PermissionError):
                repository.set_latest_preview(intent, preview_id=other_preview.id, actor=str(DEFAULT_TEST_USER_ID))
            assert intent.latest_preview_id is None
        else:
            arguments = dict(
                intent_id=intent.id, preview_id=preview.id, event_type=environment + "_order_preview_created",
                from_status=None, to_status=None, reason_code=None, idempotency_key="graph-preview-key",
                client_order_id=None, exchange_order_id=None, actor=str(DEFAULT_TEST_USER_ID), metadata={},
            )
            if mismatch == "event-preview":
                arguments["preview_id"] = other_preview.id
                with pytest.raises(PermissionError):
                    repository.add_event(**arguments)
                assert repository.list_events_for_intent(intent.id) == []
            else:
                event = repository.add_event(**arguments)
                session.commit()
                assert repository.get_preview_by_idempotency_key(intent.id, "graph-preview-key").id == preview.id
                event.preview_id = other_preview.id
                session.commit()
                assert repository.get_preview_by_idempotency_key(intent.id, "graph-preview-key") is None


@pytest.mark.parametrize("environment", ("testnet", "live"))
def test_postgresql_cached_projection_run_cannot_bypass_quarantine(environment):
    from importlib import import_module
    from test_ws01_database_closeout import run_fields, seed_owner
    from tradelab_api.services.run_repository import RunRepository
    from uuid import uuid4

    engine = get_engine()
    assert engine.url.database == "tradelab_test"
    with SessionLocal(bind=engine) as session:
        workspace, owner = uuid4(), uuid4()
        references = seed_owner(session, workspace, owner)
        run = RunRepository(session, workspace, owner).create_bot_run(**run_fields(references))
        session.commit()
        repository = import_module("tradelab_api.services." + environment + "_order_journal_projection").SqlAlchemyRunRepository(session)
        assert repository.get_run(run.id) is run
        session.connection().execute(models.BotRun.__table__.update().where(
            models.BotRun.__table__.c.id == run.id,
        ).values(ownership_verified_at=None))
        session.commit()
        assert repository.get_run(run.id) is None


@pytest.mark.parametrize("mismatch", ("bot-connection", "fill-order"))
def test_postgresql_paper_graph_checks_connection_and_fill_parent(mismatch):
    from conftest import bind_test_context
    from test_ws01_database_closeout import seed_owner
    from tradelab_api.services.paper_session_repository import PaperSessionRepository
    from uuid import uuid4

    engine = get_engine()
    assert engine.url.database == "tradelab_test"
    workspace, owner, peer = uuid4(), uuid4(), uuid4()
    with SessionLocal(bind=engine) as session:
        references = seed_owner(session, workspace, owner)
        repository = PaperSessionRepository(session, workspace, owner)
        fields = dict(
            strategy_id=references[0], strategy_version_id=references[1], bot_id=references[2],
            mode="paper", status="queued", exchange="binance", symbol="BTCUSDT", timeframe="1h",
            dataset_key="ws01", starting_cash=1000, start_at=VERIFIED_AT, end_at=VERIFIED_AT,
        )
        paper = repository.create_paper_session(**fields)
        other = repository.create_paper_session(**fields)
        order = models.PaperOrder(paper_session_id=paper.id, workspace_id=workspace, side="buy", order_type="market", status="filled", quantity=1)
        session.add(order)
        session.flush()
        fill = models.PaperFill(paper_session_id=paper.id, paper_order_id=order.id, workspace_id=workspace, fill_time=VERIFIED_AT, side="buy", price=1, quantity=1, notional=1)
        session.add(fill)
        session.commit()
        assert repository.count_fills_for_session(paper.id) == 1
        if mismatch == "bot-connection":
            bind_test_context(session, workspace, peer)
            connection = models.ExchangeConnection(workspace_id=workspace, owner_user_id=peer, created_by=str(peer), exchange="binance", name="Peer", status="draft")
            session.add(connection)
            session.flush()
            session.get(models.Bot, references[2]).exchange_connection_id = connection.id
            session.commit()
            assert repository.get_paper_session(paper.id) is None
        else:
            order.paper_session_id = other.id
            session.commit()
        assert repository.list_fills_for_session(paper.id, limit=100) == []
        assert repository.count_fills_for_session(paper.id) == 0
