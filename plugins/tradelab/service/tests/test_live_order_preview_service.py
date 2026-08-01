from __future__ import annotations

from collections.abc import Iterator
from decimal import Decimal
import os
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://postgres:postgres123secure@localhost:5432/tradelab")

from tradelab_api.db.models import Strategy, StrategyGroup, StrategyVersion  # noqa: E402
from tradelab_api.db.session import SessionLocal, apply_schema_compatibility, get_engine  # noqa: E402
from tradelab_api.services.live_credential_repository import LiveCredentialRepository as CredentialRepository  # noqa: E402
from tradelab_api.services.live_order_preview import LiveOrderPreviewRequestData, preview_live_order  # noqa: E402
from tradelab_api.services.live_order_state_repository import LiveOrderStateRepository as OrderStateRepository  # noqa: E402

apply_schema_compatibility()


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


def _strategy(session: Session):
    suffix = uuid4().hex
    group = StrategyGroup(name="Live Group", slug=f"live-group-{suffix}", metadata_={}, created_by="admin")
    session.add(group)
    session.flush()
    strategy = Strategy(strategy_group_id=group.id, name="Live Strategy", slug=f"live-strategy-{suffix}", status="active", runtime_config={}, risk_config={}, metadata_={}, created_by="admin")
    session.add(strategy)
    session.flush()
    version = StrategyVersion(strategy_id=strategy.id, version_number=1, source_code="def on_bar(ctx): return []", source_hash=f"hash-{suffix}", validation_status="valid", created_by="admin")
    session.add(version)
    session.flush()
    return strategy, version


def _credential(session: Session, *, status: str = "validated_live_read_only", can_withdraw: bool = False):
    return CredentialRepository(session).create_credential_ref(
        exchange="binance_spot",
        environment="binance_live",
        label="Preview credential",
        status=status,
        vault_provider="local_dev_encrypted",
        vault_secret_ref=f"local-dev://phase20/{uuid4()}",
        api_key_fingerprint="fingerprint",
        permission_evidence={"canTrade": True, "canWithdraw": can_withdraw},
        metadata={"apiSecret": "SECRET"},
        actor="admin",
    )


def _request(session: Session, **overrides) -> LiveOrderPreviewRequestData:
    strategy, version = _strategy(session)
    credential_ref_id = overrides.pop("credential_ref_id", None) or _credential(session).id
    values = dict(
        confirm_preview_only=True,
        idempotency_key="preview-key-1",
        client_action_id="action-1",
        source="strategy_lab",
        actor="admin",
        strategy_id=strategy.id,
        strategy_version_id=version.id,
        source_run_id=None,
        source_signal_package_id=None,
        credential_ref_id=credential_ref_id,
        environment="binance_live",
        exchange="binance",
        market_type="spot",
        symbol="BTCUSDT",
        side="buy",
        order_type="market",
        quantity=None,
        quote_quantity=Decimal("25"),
    )
    values.update(overrides)
    return LiveOrderPreviewRequestData(**values)


def test_allowed_preview_persists_intent_preview_and_event(db_session: Session) -> None:
    result = preview_live_order(OrderStateRepository(db_session), CredentialRepository(db_session), _request(db_session), live_order_submit_kill_switch_enabled=False)

    assert result.allowed is True
    assert result.status == "previewed"
    assert result.reason_code == "live_order_preview_allowed"
    assert result.intent_id is not None
    assert result.preview_id is not None
    assert result.client_order_id.startswith("tl-live-")
    assert len(result.client_order_id) <= 36
    assert result.audit_event_ids
    assert result.should_commit is True


def test_preview_blocks_without_confirmation(db_session: Session) -> None:
    result = preview_live_order(OrderStateRepository(db_session), CredentialRepository(db_session), _request(db_session, confirm_preview_only=False), live_order_submit_kill_switch_enabled=False)
    assert result.allowed is False
    assert result.reason_code == "live_order_preview_confirmation_required"


def test_preview_blocks_live_environment_mismatch(db_session: Session) -> None:
    result = preview_live_order(OrderStateRepository(db_session), CredentialRepository(db_session), _request(db_session, environment="binance_testnet"), live_order_submit_kill_switch_enabled=False)
    assert result.allowed is False
    assert result.reason_code == "live_order_preview_live_route_blocked"


def test_preview_blocks_invalid_quantity(db_session: Session) -> None:
    result = preview_live_order(OrderStateRepository(db_session), CredentialRepository(db_session), _request(db_session, quantity=Decimal("1"), quote_quantity=Decimal("25")), live_order_submit_kill_switch_enabled=False)
    assert result.allowed is False
    assert result.reason_code == "live_order_preview_quantity_invalid"


def test_preview_replays_same_idempotency_key(db_session: Session) -> None:
    request = _request(db_session)
    first = preview_live_order(OrderStateRepository(db_session), CredentialRepository(db_session), request, live_order_submit_kill_switch_enabled=False)
    second = preview_live_order(OrderStateRepository(db_session), CredentialRepository(db_session), request, live_order_submit_kill_switch_enabled=False)
    assert second.allowed is True
    assert second.preview_id == first.preview_id
    assert second.reason_code == "live_order_preview_idempotency_replayed"


def test_preview_blocks_unsafe_credential(db_session: Session) -> None:
    strategy, version = _strategy(db_session)
    credential = _credential(db_session, status="unsafe_permissions", can_withdraw=True)
    request = _request(db_session, strategy_id=strategy.id, strategy_version_id=version.id, credential_ref_id=credential.id)
    result = preview_live_order(OrderStateRepository(db_session), CredentialRepository(db_session), request, live_order_submit_kill_switch_enabled=False)
    assert result.allowed is False
    assert result.reason_code == "live_order_preview_credential_not_ready"
