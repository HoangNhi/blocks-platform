from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from sqlalchemy import select
from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

from tradelab_api.api import bots as bots_api
from tradelab_api.api import exchange as exchange_api
from tradelab_api.core.security import SecurityActor
from tradelab_api.db.models import Bot, BotRun, Strategy, StrategyVersion
from tradelab_api.services.bot_repository import BotRepository
from tradelab_api.services.run_repository import RunRepository
from tradelab_api.services.strategy_repository import StrategyRepository

WORKSPACE_ID = UUID("11111111-1111-1111-1111-111111111111")
OWNER_A = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
OWNER_B = UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")


class RecordingSession:
    def __init__(self, results=()) -> None:
        self.statement = None
        self.objects = []
        self.results = list(results)
        self.result = None

    def execute(self, statement):
        self.statement = statement
        self.result = self.results.pop(0) if self.results else None
        return self

    def add(self, obj) -> None:
        self.objects.append(obj)

    def flush(self) -> None:
        pass

    def refresh(self, obj) -> None:
        pass

    def scalar(self, statement):
        self.statement = statement
        return 0

    def scalars(self):
        return self

    def all(self):
        return []

    def scalar_one_or_none(self):
        return self.result


def owned_strategy(strategy_id=UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")) -> Strategy:
    return Strategy(
        id=strategy_id,
        workspace_id=WORKSPACE_ID,
        created_by=str(OWNER_A),
        name="Private strategy",
        slug="private-strategy",
        status="draft",
    )


def owned_version(strategy_id=UUID("cccccccc-cccc-cccc-cccc-cccccccccccc")) -> StrategyVersion:
    return StrategyVersion(
        id=UUID("dddddddd-dddd-dddd-dddd-dddddddddddd"),
        workspace_id=WORKSPACE_ID,
        created_by=str(OWNER_A),
        strategy_id=strategy_id,
        version_number=1,
        source_code="def on_candle(ctx): return None",
        source_hash="a" * 64,
        validation_status="passed",
    )


def run_fields(strategy_id, version_id, *, bot_id=None):
    return {
        "strategy_id": strategy_id,
        "strategy_version_id": version_id,
        "bot_id": bot_id,
        "run_type": "backtest",
        "status": "queued",
        "exchange": "binance",
        "symbol": "BTCUSDT",
        "timeframe": "1h",
        "start_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
        "end_at": datetime(2026, 1, 2, tzinfo=timezone.utc),
        "created_by": "trade-lab",
    }


@pytest.mark.parametrize(
    "repository,model",
    [
        (StrategyRepository, Strategy),
        (BotRepository, Bot),
        (RunRepository, BotRun),
    ],
)
def test_private_repository_reads_filter_owner_and_workspace(repository, model) -> None:
    session = RecordingSession()
    repo = repository(session, WORKSPACE_ID, OWNER_A)

    compiled = repo._base_select().compile(dialect=postgresql.dialect())
    sql = str(compiled)
    params = {str(value) for value in compiled.params.values()}

    assert "workspace_id" in sql
    assert "created_by" in sql
    assert str(OWNER_A) in params
    assert str(OWNER_B) not in params


def test_strategy_create_uses_trusted_owner_not_supplied_creator() -> None:
    session = RecordingSession()
    repo = StrategyRepository(session, WORKSPACE_ID, OWNER_A)

    strategy = repo.create_strategy(
        name="Private strategy",
        slug="private-strategy",
        status="draft",
        created_by=str(OWNER_B),
    )

    assert strategy.created_by == str(OWNER_A)
    assert strategy.workspace_id == WORKSPACE_ID


@pytest.mark.parametrize("repository", [StrategyRepository, BotRepository, RunRepository])
def test_private_repository_constructor_requires_owner(repository) -> None:
    with pytest.raises(ValueError, match="owner_user_id"):
        repository(RecordingSession(), WORKSPACE_ID, None)


def test_bot_create_rejects_strategy_not_owned_by_owner() -> None:
    repo = BotRepository(RecordingSession(), WORKSPACE_ID, OWNER_A)

    with pytest.raises(PermissionError, match="strategy"):
        repo.create_bot(
            strategy_id=uuid4(),
            name="Private bot",
            mode="backtest",
            status="draft",
            symbol="BTCUSDT",
            timeframe="1h",
            created_by=str(OWNER_B),
        )


def test_bot_create_accepts_owned_strategy_and_stamps_actor() -> None:
    strategy = owned_strategy()
    repo = BotRepository(RecordingSession([strategy]), WORKSPACE_ID, OWNER_A)

    bot = repo.create_bot(
        strategy_id=strategy.id,
        name="Private bot",
        mode="backtest",
        status="draft",
        symbol="BTCUSDT",
        timeframe="1h",
        created_by=str(OWNER_B),
    )

    assert bot.created_by == str(OWNER_A)
    assert bot.workspace_id == WORKSPACE_ID


def test_bot_create_rejects_version_from_another_strategy() -> None:
    strategy = owned_strategy()
    version = owned_version(uuid4())
    repo = BotRepository(RecordingSession([strategy, version]), WORKSPACE_ID, OWNER_A)

    with pytest.raises(PermissionError, match="version"):
        repo.create_bot(
            strategy_id=strategy.id,
            strategy_version_id=version.id,
            name="Private bot",
            mode="backtest",
            status="draft",
            symbol="BTCUSDT",
            timeframe="1h",
        )


def test_bot_create_rejects_unowned_exchange_connection() -> None:
    strategy = owned_strategy()
    repo = BotRepository(RecordingSession([strategy, None]), WORKSPACE_ID, OWNER_A)

    with pytest.raises(PermissionError, match="exchange connection"):
        repo.create_bot(
            strategy_id=strategy.id,
            exchange_connection_id=uuid4(),
            name="Private bot",
            mode="backtest",
            status="draft",
            symbol="BTCUSDT",
            timeframe="1h",
        )


def test_run_create_rejects_strategy_not_owned_by_owner() -> None:
    repo = RunRepository(RecordingSession(), WORKSPACE_ID, OWNER_A)

    with pytest.raises(PermissionError, match="strategy"):
        repo.create_bot_run(**run_fields(uuid4(), uuid4()))


def test_botless_run_accepts_owned_strategy_version_and_stamps_actor() -> None:
    strategy = owned_strategy()
    version = owned_version(strategy.id)
    repo = RunRepository(RecordingSession([strategy, version]), WORKSPACE_ID, OWNER_A)

    run = repo.create_bot_run(**run_fields(strategy.id, version.id))

    assert run.bot_id is None
    assert run.created_by == str(OWNER_A)
    assert run.workspace_id == WORKSPACE_ID


def test_run_rejects_version_from_another_strategy() -> None:
    strategy = owned_strategy()
    version = owned_version(uuid4())
    repo = RunRepository(RecordingSession([strategy, version]), WORKSPACE_ID, OWNER_A)

    with pytest.raises(PermissionError, match="version"):
        repo.create_bot_run(**run_fields(strategy.id, version.id))


def test_run_rejects_missing_non_null_bot() -> None:
    strategy = owned_strategy()
    version = owned_version(strategy.id)
    repo = RunRepository(RecordingSession([strategy, version, None]), WORKSPACE_ID, OWNER_A)

    with pytest.raises(PermissionError, match="bot"):
        repo.create_bot_run(**run_fields(strategy.id, version.id, bot_id=uuid4()))


def test_run_rejects_bot_linked_to_another_strategy() -> None:
    strategy = owned_strategy()
    version = owned_version(strategy.id)
    bot = Bot(
        id=uuid4(),
        workspace_id=WORKSPACE_ID,
        created_by=str(OWNER_A),
        strategy_id=uuid4(),
        name="Foreign bot",
        mode="backtest",
        status="draft",
        symbol="BTCUSDT",
        timeframe="1h",
    )
    repo = RunRepository(RecordingSession([strategy, version, bot]), WORKSPACE_ID, OWNER_A)

    with pytest.raises(PermissionError, match="bot"):
        repo.create_bot_run(**run_fields(strategy.id, version.id, bot_id=bot.id))


def test_run_completion_rejects_another_owner() -> None:
    run = BotRun(
        id=uuid4(),
        workspace_id=WORKSPACE_ID,
        created_by=str(OWNER_B),
        status="running",
        pipeline_status="running",
        pipeline_context={},
    )
    repo = RunRepository(RecordingSession(), WORKSPACE_ID, OWNER_A)

    with pytest.raises(PermissionError, match="owner"):
        repo.complete_bot_run(run, status="completed")


def test_run_data_link_rejects_another_owner() -> None:
    run = BotRun(
        id=uuid4(),
        workspace_id=WORKSPACE_ID,
        created_by=str(OWNER_B),
        status="queued",
        pipeline_status="queued",
        pipeline_context={},
    )
    job = SimpleNamespace(
        id=uuid4(),
        status="completed",
        job_type="fill",
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
    )
    repo = RunRepository(RecordingSession(), WORKSPACE_ID, OWNER_A)

    with pytest.raises(PermissionError, match="owner"):
        repo.link_data_job(run, job)


def test_strategy_update_rejects_foreign_group() -> None:
    repo = StrategyRepository(RecordingSession([None]), WORKSPACE_ID, OWNER_A)

    with pytest.raises(PermissionError, match="group"):
        repo.update_strategy(owned_strategy(), strategy_group_id=uuid4())


def test_strategy_update_rejects_foreign_current_version() -> None:
    repo = StrategyRepository(RecordingSession([None]), WORKSPACE_ID, OWNER_A)

    with pytest.raises(PermissionError, match="version"):
        repo.update_strategy(owned_strategy(), current_version_id=uuid4())


def test_list_benchmark_checks_hides_unowned_run(monkeypatch) -> None:
    class OwnerRunRepository:
        def __init__(self, _session, workspace_id, owner_user_id) -> None:
            assert workspace_id == WORKSPACE_ID
            assert owner_user_id == OWNER_A

        def get_bot_run(self, _run_id):
            return None

    class EmptyBenchmarkRepository:
        def __init__(self, _session) -> None:
            pass

        def get_latest_for_run(self, _run_id):
            return None

    monkeypatch.setattr(bots_api, "RunRepository", OwnerRunRepository)
    monkeypatch.setattr(bots_api, "BenchmarkRepository", EmptyBenchmarkRepository)

    with pytest.raises(HTTPException) as error:
        bots_api.list_benchmark_checks(
            uuid4(), object(), SecurityActor(user_id=OWNER_A, workspace_id=WORKSPACE_ID)
        )

    assert error.value.status_code == 404


def test_market_data_import_job_uses_authenticated_actor(monkeypatch) -> None:
    captured = {}

    def fake_import(_repository, _client, **fields):
        captured.update(fields)
        return SimpleNamespace(job=None, rows_imported=0, error_message=None)

    monkeypatch.setattr(exchange_api, "import_candles", fake_import)
    request = SimpleNamespace(
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        start_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        end_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
    )
    session = SimpleNamespace(commit=lambda: None)

    exchange_api.create_market_data_import_job(
        request, session, actor=SecurityActor(user_id=OWNER_A, workspace_id=WORKSPACE_ID)
    )

    assert captured["created_by"] == str(OWNER_A)


def test_paper_smoke_bot_lookup_filters_workspace_and_owner() -> None:
    from tradelab_api.services.paper_runtime_smoke_fixture import _ensure_bot

    class Query:
        filters = []

        def filter(self, *criteria):
            self.filters.extend(criteria)
            return self

        def one_or_none(self):
            return None

    class Repository:
        workspace_id = WORKSPACE_ID
        owner_user_id = OWNER_A

        def __init__(self) -> None:
            self.query = Query()
            self.session = SimpleNamespace(query=lambda _model: self.query)
            self.created_fields = None

        def create_bot(self, **fields):
            self.created_fields = fields
            return SimpleNamespace(**fields)

    repository = Repository()
    _ensure_bot(repository, strategy_id=uuid4(), strategy_version_id=uuid4())

    compiled = select(Bot).where(*repository.query.filters).compile(dialect=postgresql.dialect())
    params = {str(value) for value in compiled.params.values()}

    assert "workspace_id" in str(compiled)
    assert "created_by" in str(compiled)
    assert str(WORKSPACE_ID) in params
    assert str(OWNER_A) in params
    assert repository.created_fields["created_by"] == str(OWNER_A)


def test_local_fill_smoke_strategy_uses_repository_owner() -> None:
    from tradelab_api.services.local_fill_smoke_fixture import _ensure_smoke_strategy

    class Repository:
        owner_user_id = OWNER_A

        def __init__(self) -> None:
            self.group = None
            self.strategy = None
            self.version = None

        def get_any_strategy_group_by_slug(self, _slug):
            return self.group

        def create_strategy_group(self, **fields):
            self.group = SimpleNamespace(id=uuid4(), **fields)
            return self.group

        def get_any_strategy_by_slug(self, _slug):
            return self.strategy

        def create_strategy(self, **fields):
            self.strategy = SimpleNamespace(id=uuid4(), current_version_id=None, **fields)
            return self.strategy

        def list_strategy_versions(self, _strategy_id):
            return []

        def create_strategy_version(self, **fields):
            self.version = SimpleNamespace(id=uuid4(), **fields)
            return self.version

        def update_strategy(self, strategy, **fields):
            for key, value in fields.items():
                setattr(strategy, key, value)
            return strategy

    repository = Repository()
    _ensure_smoke_strategy(repository)

    assert repository.group.created_by == str(OWNER_A)
    assert repository.strategy.created_by == str(OWNER_A)
    assert repository.version.created_by == str(OWNER_A)
    assert repository.strategy.updated_by == str(OWNER_A)


def test_live_order_repository_filters_workspace_and_owner() -> None:
    from tradelab_api.services.live_order_state_repository import LiveOrderStateRepository

    class FilteringSession:
        def __init__(self):
            self.statement = None

        def scalars(self, stmt):
            self.statement = stmt
            return self

        def first(self):
            return None

        def all(self):
            return []

    s = FilteringSession()
    repo = LiveOrderStateRepository(s, workspace_id=WORKSPACE_ID, owner_user_id=OWNER_A)
    repo.get_intent(uuid4())

    compiled = str(s.statement.compile(dialect=postgresql.dialect()))
    assert "live_order_intent.workspace_id" in compiled
    assert "live_credential_ref.owner_user_id" in compiled

    repo.list_intents()
    compiled_list = str(s.statement.compile(dialect=postgresql.dialect()))
    assert "live_order_intent.workspace_id" in compiled_list
    assert "live_credential_ref.owner_user_id" in compiled_list


def test_testnet_order_repository_filters_workspace_and_owner() -> None:
    from tradelab_api.services.testnet_order_state_repository import TestnetOrderStateRepository

    class FilteringSession:
        def __init__(self):
            self.statement = None

        def scalars(self, stmt):
            self.statement = stmt
            return self

        def first(self):
            return None

        def all(self):
            return []

    s = FilteringSession()
    repo = TestnetOrderStateRepository(s, workspace_id=WORKSPACE_ID, owner_user_id=OWNER_A)
    repo.get_intent(uuid4())

    compiled = str(s.statement.compile(dialect=postgresql.dialect()))
    assert "testnet_order_intent.workspace_id" in compiled
    assert "testnet_credential_ref.owner_user_id" in compiled

    repo.list_intents()
    compiled_list = str(s.statement.compile(dialect=postgresql.dialect()))
    assert "testnet_order_intent.workspace_id" in compiled_list
    assert "testnet_credential_ref.owner_user_id" in compiled_list


def test_paper_session_repository_filters_workspace_and_owner() -> None:
    from tradelab_api.services.paper_session_repository import PaperSessionRepository

    class FilteringSession:
        def __init__(self):
            self.statement = None

        def scalars(self, stmt):
            self.statement = stmt
            return self

        def all(self):
            return []

    s = FilteringSession()
    repo = PaperSessionRepository(s, workspace_id=WORKSPACE_ID, owner_user_id=OWNER_A)
    repo.list_paper_sessions(strategy_id=None, strategy_version_id=None, dataset_key=None, status=None, limit=10)

    compiled = str(s.statement.compile(dialect=postgresql.dialect()))
    assert "paper_session.workspace_id" in compiled
    assert "paper_session.created_by" in compiled


@pytest.mark.asyncio
async def test_authorize_request_attaches_trusted_execution_context():
    from test_workspace_security import build_request
    from tradelab_api.core.authorization import FunctionalAuthorizationResult, authorize_request
    from tradelab_api.core.context import ExecutionContext

    class MockAuthClient:
        async def check(self, *args, **kwargs):
            return FunctionalAuthorizationResult(True, True, True, user_id=OWNER_A, username="alice", workspace_id=WORKSPACE_ID)

    req = build_request(path="/api/tradelab/strategies", method="GET", workspace_id=str(WORKSPACE_ID))
    res = await authorize_request(req, MockAuthClient())
    assert res is None
    ctx = getattr(req.state, "execution_context", None)
    assert isinstance(ctx, ExecutionContext)
    assert ctx.workspace_id == WORKSPACE_ID
    assert ctx.actor_user_id == OWNER_A
    assert ctx.permission_key == "tradelab.strategies"
    assert ctx.action.value == "view"
    assert ctx.authority_deadline_monotonic > 0
