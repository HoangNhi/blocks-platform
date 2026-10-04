from concurrent.futures import Future, ThreadPoolExecutor
from conftest import bind_test_context
from datetime import datetime, timezone
import os
from threading import Barrier, Lock
from uuid import uuid4

import pytest
from sqlalchemy import func, select, text, update

from tradelab_api.core.authorization import FunctionalAuthorizationResult
from tradelab_api.db.models import Bot, BotRun, BacktestResult, Strategy, StrategyVersion
from tradelab_api.db.session import SessionLocal, get_engine
from tradelab_api.services.job_dispatcher import JobDispatcher
from tradelab_api.services.paper_session_repository import PaperSessionRepository
from tradelab_api.services.run_repository import RunRepository


@pytest.fixture
def database():
    if os.getenv("TRADELAB_TEST_DATABASE_RESET", "false").lower() != "true":
        pytest.skip("Requires separately approved disposable PostgreSQL target and reset guard.")
    engine = get_engine()
    assert engine.url.database == "tradelab_test"
    return engine


def seed_owner(session, workspace, owner):
    bind_test_context(session, workspace, owner)
    strategy = Strategy(id=uuid4(), workspace_id=workspace, created_by=str(owner), name="WS01", slug=uuid4().hex, status="draft")
    session.add(strategy)
    session.flush()
    version = StrategyVersion(id=uuid4(), workspace_id=workspace, created_by=str(owner), strategy_id=strategy.id, version_number=1, source_code="def on_candle(ctx): return []", source_hash=uuid4().hex, validation_status="valid")
    session.add(version)
    session.flush()
    bot = Bot(id=uuid4(), workspace_id=workspace, created_by=str(owner), strategy_id=strategy.id, strategy_version_id=version.id, name="WS01", mode="backtest", status="draft", symbol="BTCUSDT", timeframe="1h")
    session.add(bot)
    session.commit()
    return strategy.id, version.id, bot.id


def run_fields(references, *, status="queued"):
    strategy, version, bot = references
    return dict(strategy_id=strategy, strategy_version_id=version, bot_id=bot, run_type="backtest", status=status, exchange="binance", symbol="BTCUSDT", timeframe="1h", start_at=datetime(2026, 1, 1, tzinfo=timezone.utc), end_at=datetime(2026, 1, 2, tzinfo=timezone.utc))


def test_cancellation_wins_against_stale_completion(database):
    workspace, owner = uuid4(), uuid4()
    with SessionLocal(bind=database) as session:
        references = seed_owner(session, workspace, owner)
        run = RunRepository(session, workspace, owner).create_bot_run(**run_fields(references, status="running"))
        session.commit()
        run_id = run.id
    with SessionLocal(bind=database) as computing, SessionLocal(bind=database) as cancelling:
        repository = RunRepository(computing, workspace, owner)
        stale = repository.get_bot_run(run_id)
        cancelling.execute(update(BotRun).where(BotRun.id == run_id).values(status="cancelled", pipeline_status="cancelled"))
        cancelling.commit()
        assert stale.status == "running"
        assert repository.complete_bot_run(stale, status="completed") is None
        computing.commit()
        computing.expire_all()
        assert repository.get_bot_run(run_id).status == "cancelled"
        assert computing.scalar(select(func.count(BacktestResult.id)).where(BacktestResult.bot_run_id == run_id)) == 0


def test_queue_quota_reservation_race_across_workspaces(database):
    owner, first_workspace, second_workspace = uuid4(), uuid4(), uuid4()
    with SessionLocal(bind=database) as session:
        first_refs = seed_owner(session, first_workspace, owner)
        second_refs = seed_owner(session, second_workspace, owner)
        bind_test_context(session, first_workspace, owner)
        for _ in range(19):
            RunRepository(session, first_workspace, owner).create_bot_run(**run_fields(first_refs))
        session.commit()
    barrier = Barrier(2)

    def enqueue(workspace, references):
        with SessionLocal(bind=database) as session:
            bind_test_context(session, workspace, owner)
            barrier.wait(timeout=5)
            try:
                RunRepository(session, workspace, owner).create_bot_run(**run_fields(references))
                session.commit()
                return True
            except ValueError:
                session.rollback()
                return False

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda values: enqueue(*values), [(first_workspace, first_refs), (second_workspace, second_refs)]))
    assert sorted(results) == [False, True]
    with SessionLocal(bind=database) as session:
        assert session.scalar(select(func.count(BotRun.id)).where(BotRun.created_by == str(owner), BotRun.status == "queued")) == 20


def test_paper_collision_is_private_and_create_is_visible(database):
    workspace, first_owner, second_owner = uuid4(), uuid4(), uuid4()
    with SessionLocal(bind=database) as session:
        first_refs = seed_owner(session, workspace, first_owner)
        second_refs = seed_owner(session, workspace, second_owner)
        fields = dict(mode="paper", status="queued", exchange="binance", symbol="BTCUSDT", timeframe="1h", dataset_key="ws01", starting_cash=1000, start_at=datetime(2026, 1, 1, tzinfo=timezone.utc), end_at=datetime(2026, 1, 2, tzinfo=timezone.utc), gate_context={"idempotencyKey": "collision"}, created_by="spoof", workspace_id=uuid4())
        first_repository = PaperSessionRepository(session, workspace, first_owner)
        second_repository = PaperSessionRepository(session, workspace, second_owner)
        bind_test_context(session, workspace, first_owner)
        first = first_repository.create_paper_session(strategy_id=first_refs[0], strategy_version_id=first_refs[1], bot_id=first_refs[2], **fields)
        session.commit()
        assert second_repository.get_paper_session(first.id) is None
        assert second_repository.find_queued_session_by_idempotency_key("collision") is None
        bind_test_context(session, workspace, second_owner)
        second = second_repository.create_paper_session(strategy_id=second_refs[0], strategy_version_id=second_refs[1], bot_id=second_refs[2], **fields)
        session.commit()
        assert second.created_by == str(second_owner)
        assert second_repository.find_queued_session_by_idempotency_key("collision").id == second.id
        assert first_repository.find_queued_session_by_idempotency_key("collision").id == first.id


class Authority:
    _service_authorization_key = "non-secret-test-only"

    def __init__(self, unavailable_owner=None):
        self.unavailable_owner = unavailable_owner
        self.calls = []

    async def check_workload(self, user_id, workspace_id):
        self.calls.append(user_id)
        return FunctionalAuthorizationResult(True, user_id != self.unavailable_owner, True, user_id=user_id, workspace_id=workspace_id)


class RecordingExecutor:
    def __init__(self):
        self.runs = []
        self.lock = Lock()

    def submit(self, function, run_id, workspace, owner):
        with self.lock:
            self.runs.append(run_id)
        return Future()

    def shutdown(self, **kwargs):
        pass


def test_ten_unavailable_jobs_do_not_hide_eleventh_actor(database):
    workspace, first_owner, second_owner = uuid4(), uuid4(), uuid4()
    with SessionLocal(bind=database) as session:
        first_refs = seed_owner(session, workspace, first_owner)
        second_refs = seed_owner(session, workspace, second_owner)
        bind_test_context(session, workspace, first_owner)
        for _ in range(10):
            RunRepository(session, workspace, first_owner).create_bot_run(**run_fields(first_refs))
        bind_test_context(session, workspace, second_owner)
        second = RunRepository(session, workspace, second_owner).create_bot_run(**run_fields(second_refs))
        session.commit()
        second_id = second.id
    authority = Authority(first_owner)
    dispatcher = JobDispatcher(session_factory=lambda: SessionLocal(bind=database), auth_client=authority)
    recorder = RecordingExecutor()
    dispatcher._executor.shutdown()
    dispatcher._executor = recorder
    dispatcher.poll_once()
    assert recorder.runs == [second_id]
    assert authority.calls.count(first_owner) == 1
    dispatcher.poll_once()
    assert authority.calls.count(first_owner) == 1
    dispatcher.stop()


def test_two_pollers_reserve_at_most_two_distinct_runs(database):
    workspace, owner = uuid4(), uuid4()
    with SessionLocal(bind=database) as session:
        references = seed_owner(session, workspace, owner)
        for _ in range(3):
            RunRepository(session, workspace, owner).create_bot_run(**run_fields(references))
        other_owner = uuid4()
        other_refs = seed_owner(session, workspace, other_owner)
        RunRepository(session, workspace, other_owner).create_bot_run(**run_fields(other_refs))
        session.commit()
    recorder = RecordingExecutor()
    dispatchers = [JobDispatcher(session_factory=lambda: SessionLocal(bind=database), auth_client=Authority()) for _ in range(2)]
    for dispatcher in dispatchers:
        dispatcher._executor.shutdown()
        dispatcher._executor = recorder
    with ThreadPoolExecutor(max_workers=2) as executor:
        list(executor.map(lambda dispatcher: dispatcher.poll_once(), dispatchers))
    assert len(recorder.runs) == len(set(recorder.runs)) == 2
    with SessionLocal(bind=database) as session:
        assert session.scalar(select(func.count(BotRun.id)).where(BotRun.status == "running")) == 2
        assert session.scalar(select(func.count(BotRun.id)).where(BotRun.status == "running", BotRun.created_by == str(owner))) == 1
    for dispatcher in dispatchers:
        dispatcher.stop()

def test_invalid_parent_is_failed_before_admission_without_blocking_peer(database):
    workspace, owner, peer = uuid4(), uuid4(), uuid4()
    with SessionLocal(bind=database) as session:
        references = seed_owner(session, workspace, owner)
        peer_refs = seed_owner(session, workspace, peer)
        bind_test_context(session, workspace, owner)
        malformed = RunRepository(session, workspace, owner).create_bot_run(**run_fields(references))
        bind_test_context(session, workspace, peer)
        valid = RunRepository(session, workspace, peer).create_bot_run(**run_fields(peer_refs))
        session.commit()
        malformed.strategy_version_id = peer_refs[1]
        session.commit()
        malformed_id, valid_id = malformed.id, valid.id
    dispatcher = JobDispatcher(session_factory=lambda: SessionLocal(bind=database), auth_client=Authority())
    recorder = RecordingExecutor()
    dispatcher._executor.shutdown()
    dispatcher._executor = recorder
    try:
        dispatcher.poll_once()
        assert recorder.runs == [valid_id]
        with SessionLocal(bind=database) as observer:
            persisted = observer.scalar(select(BotRun).where(BotRun.id == malformed_id))
            assert persisted.status == persisted.pipeline_status == "failed"
            assert persisted.started_at is None
    finally:
        dispatcher.stop()

@pytest.mark.parametrize("same_owner", (False, True))
def test_unverified_running_reservations_still_consume_admission_slots(database, same_owner):
    workspace, owner, other_owner = uuid4(), uuid4(), uuid4()
    with SessionLocal(bind=database) as session:
        references = seed_owner(session, workspace, owner)
        other_refs = seed_owner(session, workspace, other_owner)
        reservation_owner = owner if same_owner else other_owner
        reservation_refs = references if same_owner else other_refs
        bind_test_context(session, workspace, reservation_owner)
        reservations = [RunRepository(session, workspace, reservation_owner).create_bot_run(
            **run_fields(reservation_refs, status="running"),
        ) for _ in range(1 if same_owner else 2)]
        bind_test_context(session, workspace, owner)
        queued = RunRepository(session, workspace, owner).create_bot_run(**run_fields(references))
        session.commit()
        reservation_ids = [row.id for row in reservations]
        session.connection().execute(BotRun.__table__.update().where(
            BotRun.__table__.c.id.in_(reservation_ids),
        ).values(ownership_verified_at=None))
        session.commit()
        queued_id = queued.id
    dispatcher = JobDispatcher(session_factory=lambda: SessionLocal(bind=database), auth_client=Authority())
    recorder = RecordingExecutor()
    dispatcher._executor.shutdown()
    dispatcher._executor = recorder
    try:
        dispatcher.poll_once()
        assert recorder.runs == []
        with SessionLocal(bind=database) as observer:
            assert observer.scalar(select(BotRun.status).where(BotRun.id == queued_id)) == "queued"
    finally:
        dispatcher.stop()

@pytest.mark.parametrize("observe_loss", [False, True])
def test_dispatcher_stop_discards_lost_lock_session(database, observe_loss):
    dispatcher = JobDispatcher(auth_client=Authority())
    connection = database.connect().execution_options(isolation_level="AUTOCOMMIT")
    backend_pid, acquired = connection.execute(text("select pg_backend_pid(), pg_try_advisory_lock(841013)")).one()
    assert acquired
    dispatcher._dispatcher_connection = connection
    dispatcher._dispatcher_backend_pid = backend_pid
    with database.begin() as killer:
        assert killer.execute(text("select pg_terminate_backend(:pid, 5000)"), {"pid": backend_pid}).scalar_one()
    if observe_loss:
        with pytest.raises(Exception):
            dispatcher.poll_once()
        assert dispatcher._stop_event.is_set()
    dispatcher.stop()
    assert connection.closed
    assert dispatcher._dispatcher_connection is None
    assert dispatcher._dispatcher_backend_pid is None
    with database.connect() as successor:
        assert successor.execute(text("select pg_try_advisory_lock(841013)")).scalar_one()
        assert successor.execute(text("select pg_advisory_unlock(841013)")).scalar_one()
