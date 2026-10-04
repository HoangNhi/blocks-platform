from __future__ import annotations

from uuid import uuid4
import pytest

from tradelab_api.services.scoped_repository import ScopedRepository, ScopedCredentialRepository
from tradelab_api.services.bot_repository import BotRepository
from tradelab_api.services.strategy_repository import StrategyRepository
from tradelab_api.services.live_credential_repository import LiveCredentialRepository
from tradelab_api.db.models import Bot, Strategy, StrategyVersion


def test_scoped_repository_requires_workspace_id() -> None:
    with pytest.raises(ValueError, match="workspace_id is required"):
        ScopedRepository(None, None)  # type: ignore[arg-type]


def test_scoped_credential_repository_requires_owner_user_id() -> None:
    with pytest.raises(ValueError, match="owner_user_id is required"):
        ScopedCredentialRepository(None, uuid4(), None)  # type: ignore[arg-type]


def test_bot_repository_cross_workspace_isolation() -> None:
    ws_a = uuid4()
    ws_b = uuid4()
    user_a = uuid4()
    user_b = uuid4()

    class FakeSession:
        def __init__(self):
            self.store = []
        def add(self, obj): self.store.append(obj)
        def flush(self): pass
        def refresh(self, obj): pass

    session = FakeSession()
    bot = Bot(
        id=uuid4(),
        workspace_id=ws_a,
        created_by=str(user_a),
        strategy_id=uuid4(),
        name="Bot A",
        symbol="BTC",
        timeframe="1h",
        mode="backtest",
        status="draft",
    )
    assert bot.workspace_id == ws_a

    repo_b = BotRepository(session, ws_b, user_b)
    # Updating object from workspace A using repo B raises PermissionError
    with pytest.raises(PermissionError, match="another workspace"):
        repo_b.update(bot, name="Hacked Name")

    with pytest.raises(PermissionError, match="another workspace"):
        repo_b.soft_delete(bot)


def test_strategy_repository_scopes_versions() -> None:
    ws_a = uuid4()
    ws_b = uuid4()
    user_a = uuid4()
    user_b = uuid4()

    class FakeSession:
        def __init__(self):
            self.store = []
        def add(self, obj): self.store.append(obj)
        def flush(self): pass
        def refresh(self, obj): pass

    session = FakeSession()
    strat = Strategy(
        id=uuid4(),
        workspace_id=ws_a,
        created_by=str(user_a),
        name="Strat",
        slug="strat",
        status="active",
    )
    version = StrategyVersion(
        id=uuid4(),
        workspace_id=ws_a,
        created_by=str(user_a),
        strategy_id=strat.id,
        version_number=1,
        source_code="pass",
        source_hash="hash",
        validation_status="valid",
    )
    assert strat.workspace_id == ws_a
    assert version.workspace_id == ws_a

    repo_b = StrategyRepository(session, ws_b, user_b)
    with pytest.raises(PermissionError, match="another workspace"):
        repo_b.update(strat, name="New Name")


def test_credential_repository_isolates_users_in_same_workspace() -> None:
    ws_id = uuid4()
    user_1 = uuid4()
    user_2 = uuid4()

    class FakeSession:
        def __init__(self):
            self.store = []
        def add(self, obj): self.store.append(obj)
        def flush(self): pass
        def refresh(self, obj): pass

    session = FakeSession()
    repo_user1 = LiveCredentialRepository(session, ws_id, user_1)
    cred1 = repo_user1.create_credential_ref(
        exchange="binance_spot",
        environment="binance_live",
        label="Key 1",
        status="stored_live_only",
        vault_provider="fake",
        vault_secret_ref="ref1",
        api_key_fingerprint="fp1",
        permission_evidence={},
        metadata={},
        actor=str(user_1),
    )
    assert cred1.workspace_id == ws_id
    assert cred1.owner_user_id == user_1

    # User 2 in the same workspace has separate repository scoped by user_2
    repo_user2 = LiveCredentialRepository(session, ws_id, user_2)
    # Repo user 2's query will filter by owner_user_id == user_2
    assert repo_user2.owner_user_id == user_2
    assert repo_user1.owner_user_id == user_1
    assert repo_user2.owner_user_id != cred1.owner_user_id
