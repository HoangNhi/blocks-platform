from __future__ import annotations

from tradelab_api.db.ownership import (
    TABLE_REGISTRY,
    PRIVATE_TABLES,
    SHARED_TABLES,
    OPERATOR_ONLY_TABLES,
    CREDENTIAL_ROOT_TABLES,
)
from tradelab_api.db.models import (
    Strategy,
    StrategyGroup,
    Bot,
    BotRun,
    ExchangeConnection,
    TestnetCredentialRef,
    LiveCredentialRef,
    MarketCandle,
    LivePilotControl,
    TenantScopedMixin,
    CredentialRootMixin,
)


def test_registry_has_exact_43_tables() -> None:
    assert len(TABLE_REGISTRY) == 43
    assert len(PRIVATE_TABLES) == 37
    assert len(SHARED_TABLES) == 5
    assert len(OPERATOR_ONLY_TABLES) == 1
    assert len(CREDENTIAL_ROOT_TABLES) == 3


def test_private_models_inherit_tenant_scoped_mixin() -> None:
    assert issubclass(StrategyGroup, TenantScopedMixin)
    assert issubclass(Strategy, TenantScopedMixin)
    assert issubclass(Bot, TenantScopedMixin)
    assert issubclass(BotRun, TenantScopedMixin)
    assert hasattr(Strategy, "workspace_id")
    assert hasattr(Bot, "workspace_id")
    assert hasattr(BotRun, "workspace_id")


def test_credential_root_models_inherit_credential_root_mixin() -> None:
    assert issubclass(ExchangeConnection, CredentialRootMixin)
    assert issubclass(TestnetCredentialRef, CredentialRootMixin)
    assert issubclass(LiveCredentialRef, CredentialRootMixin)
    assert hasattr(ExchangeConnection, "owner_user_id")
    assert hasattr(TestnetCredentialRef, "owner_user_id")
    assert hasattr(LiveCredentialRef, "owner_user_id")


def test_shared_models_do_not_have_workspace_id() -> None:
    assert not hasattr(MarketCandle, "workspace_id")
    assert not hasattr(LivePilotControl, "workspace_id")


def test_strategy_and_group_have_workspace_scoped_slug_unique_constraint() -> None:
    for model in (Strategy, StrategyGroup):
        con_names = [c.name for c in model.__table__.constraints if hasattr(c, "columns")]
        scoped_found = any("workspace" in (name or "") and "slug" in (name or "") for name in con_names)
        assert scoped_found, f"{model.__name__} missing (workspace_id, slug) unique constraint"
