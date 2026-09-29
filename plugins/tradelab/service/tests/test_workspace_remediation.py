from uuid import uuid4

import pytest
from sqlalchemy.orm import make_transient_to_detached

from tradelab_api.core.authorization import authorize_request
from tradelab_api.db.models import Bot, StrategyGroup
from tradelab_api.services.bot_repository import BotRepository
from tradelab_api.services.strategy_repository import StrategyRepository
from test_workspace_security import build_request, MockAuthorityClient
from tradelab_api.core.authorization import FunctionalAuthorizationResult


class RecordingSession:
    def __init__(self):
        self.calls = []

    def add(self, obj):
        self.calls.append("add")

    def flush(self):
        self.calls.append("flush")

    def refresh(self, obj):
        self.calls.append("refresh")


@pytest.mark.asyncio
@pytest.mark.parametrize("path,method", [("live/safety/status", "GET"), ("live/safety/reopen", "POST")])
async def test_tenant_cannot_access_instance_safety(path, method):
    workspace_id = uuid4()
    authority = MockAuthorityClient(FunctionalAuthorizationResult(True, True, True, uuid4(), "tenant", workspace_id))
    response = await authorize_request(build_request(path="/api/tradelab/" + path, method=method, workspace_id=str(workspace_id)), authority)
    assert response is not None
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_authority_attribute_cannot_bypass_authentication():
    authority = MockAuthorityClient(FunctionalAuthorizationResult(True, True, True))
    authority.is_allow_all = True
    response = await authorize_request(build_request(authorization=None), authority)
    assert response is not None
    assert response.status_code == 401


@pytest.mark.parametrize("operation", ["update", "soft_delete"])
def test_legacy_objects_cannot_be_mutated(operation):
    session = RecordingSession()
    repository = BotRepository(session, uuid4())
    legacy = Bot(workspace_id=None)
    with pytest.raises(PermissionError):
        getattr(repository, operation)(legacy)
    assert legacy.workspace_id is None
    assert session.calls == []


def test_detached_legacy_object_cannot_be_created():
    session = RecordingSession()
    legacy = Bot(id=uuid4(), workspace_id=None)
    make_transient_to_detached(legacy)
    with pytest.raises(PermissionError):
        BotRepository(session, uuid4()).create(legacy)
    assert session.calls == []
    assert legacy.workspace_id is None


def test_legacy_group_cannot_be_adopted():
    session = RecordingSession()
    group = StrategyGroup(workspace_id=None)
    with pytest.raises(PermissionError):
        StrategyRepository(session, uuid4()).update_strategy_group(group, name="adopted")
    assert group.workspace_id is None
    assert session.calls == []


@pytest.mark.parametrize("repository_name", ["LiveCredentialRepository", "TestnetCredentialRepository"])
def test_credentials_require_explicit_owner_scope(repository_name):
    from tradelab_api.services.live_credential_repository import LiveCredentialRepository
    from tradelab_api.services.testnet_credential_repository import TestnetCredentialRepository

    repository_type = {"LiveCredentialRepository": LiveCredentialRepository, "TestnetCredentialRepository": TestnetCredentialRepository}[repository_name]
    with pytest.raises((TypeError, ValueError)):
        repository_type(RecordingSession())
    with pytest.raises(ValueError):
        repository_type(RecordingSession(), uuid4(), None)


@pytest.mark.parametrize("model_name", ["Bot", "LiveCredentialRef"])
def test_private_models_have_no_fabricated_owner_defaults(model_name):
    from tradelab_api.db import models

    table = getattr(models, model_name).__table__
    assert table.c.workspace_id.default is None
    if "owner_user_id" in table.c:
        assert table.c.owner_user_id.default is None


def test_regular_startup_does_not_apply_ownership_migration():
    import inspect
    from tradelab_api.db.session import apply_schema_compatibility

    assert "migrate_ownership_schema" not in inspect.getsource(apply_schema_compatibility)


@pytest.mark.parametrize("module_name,prefix", [("live_credentials", "LiveCredential"), ("testnet_credentials", "TestnetCredential")])
def test_credential_body_cannot_spoof_actor(module_name, prefix):
    import importlib
    from pydantic import ValidationError

    request_type = getattr(importlib.import_module("tradelab_api.schemas." + module_name), prefix + "CreateRequest")
    with pytest.raises(ValidationError, match="governed by server security context"):
        request_type(label="test", idempotencyKey="test", actor="other-user")


@pytest.mark.parametrize("operation", ["start", "poll_once"])
def test_dispatcher_is_disabled_without_workload_authority(operation):
    from tradelab_api.services.job_dispatcher import JobDispatcher

    def forbidden_session():
        pytest.fail("Disabled worker must not open database or mutate queue")

    with pytest.raises(RuntimeError, match="workspace_authority_recheck_unavailable"):
        getattr(JobDispatcher(session_factory=forbidden_session), operation)()


def test_paper_scheduler_cannot_be_enabled_without_workload_authority():
    from types import SimpleNamespace
    from tradelab_api.services.paper_session_scheduler import PaperSessionScheduler

    settings = SimpleNamespace(tradelab_paper_scheduler_enabled=True, tradelab_local_paper_engine_enabled=True, tradelab_environment="local")
    scheduler = PaperSessionScheduler(settings_factory=lambda: settings)
    assert scheduler._guard_reason(settings) == "workspace_authority_recheck_unavailable"


@pytest.mark.parametrize("repository_type", [BotRepository, StrategyRepository])
def test_private_repository_never_fabricates_workspace(repository_type):
    with pytest.raises(TypeError):
        repository_type(RecordingSession())


def test_run_repository_never_fabricates_workspace():
    from tradelab_api.services.run_repository import RunRepository

    with pytest.raises(TypeError):
        RunRepository(RecordingSession())


@pytest.mark.parametrize("prefix", ["Live", "Testnet"])
def test_secret_queries_require_credential_owner(prefix):
    import importlib

    captured = []
    class Session:
        def scalars(self, statement):
            captured.append(str(statement))
            return self
        def first(self):
            return None
        def all(self):
            return []

    repository_type = getattr(importlib.import_module("tradelab_api.services." + prefix.lower() + "_credential_repository"), prefix + "CredentialRepository")
    repository = repository_type(Session(), uuid4(), uuid4())
    repository.get_active_secret_by_ref("opaque-reference")
    repository.deactivate_secret_rows(credential_ref_id=uuid4(), actor=str(uuid4()))
    for statement in captured:
        assert prefix.lower() + "_credential_ref.owner_user_id" in statement
        assert "JOIN" in statement


@pytest.mark.parametrize("enabled,database", [("false", "tradelab_test"), ("true", "tradelab"), ("true", None)])
def test_database_guard_blocks_non_disposable_targets(monkeypatch, enabled, database):
    from conftest import require_disposable_database

    monkeypatch.setenv("TRADELAB_TEST_DATABASE_RESET", enabled)
    with pytest.raises(pytest.skip.Exception):
        require_disposable_database(None, None, [], {"dbname": database})


def test_database_guard_accepts_explicit_disposable_target(monkeypatch):
    from conftest import require_disposable_database

    monkeypatch.setenv("TRADELAB_TEST_DATABASE_RESET", "true")
    require_disposable_database(None, None, [], {"dbname": "tradelab_test"})


@pytest.mark.parametrize("field", ["created_by", "createdBy", "workspace_id", "workspaceId", "ownerUserId", "actor"])
def test_exchange_connection_request_rejects_owner_spoof(field):
    from pydantic import ValidationError
    from tradelab_api.api.exchange import ExchangeConnectionCreateRequest

    with pytest.raises(ValidationError, match="governed by server security context"):
        ExchangeConnectionCreateRequest.model_validate({"exchange": "binance", "name": "account", field: str(uuid4())})


def test_bot_cannot_attach_an_inaccessible_exchange_connection(monkeypatch):
    import json
    from types import SimpleNamespace
    from tradelab_api.api import bots
    from tradelab_api.core.security import SecurityActor

    actor = SecurityActor(user_id=uuid4(), workspace_id=uuid4())
    strategy_id = uuid4()
    monkeypatch.setattr(bots.StrategyRepository, "get_strategy", lambda self, identifier: SimpleNamespace(id=strategy_id))
    monkeypatch.setattr(bots.BotRepository, "create_bot", lambda *args, **kwargs: pytest.fail("Foreign connection must be rejected before creating bot"))

    class Session:
        def execute(self, statement):
            return self
        def scalar_one_or_none(self):
            return None

    request = bots.BotCreateRequest(strategy_id=strategy_id, name="test", symbol="BTCUSDT", timeframe="1h", exchange_connection_id=uuid4())
    response = bots.create_bot(request, actor=actor, session=Session())
    assert json.loads(response.body)["StatusCode"] == 404
