from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from decimal import Decimal
import os

import pytest
from sqlalchemy.orm import Session

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://postgres:postgres123secure@localhost:5432/tradelab")

from tradelab_api.db.models import Base, Strategy, StrategyGroup, StrategyVersion  # noqa: E402
from tradelab_api.db.session import SessionLocal, apply_schema_compatibility, get_engine  # noqa: E402
from tradelab_api.services.testnet_credential_repository import (  # noqa: E402
    TestnetCredentialRepository as CredentialRepository,
)
from tradelab_api.services.testnet_order_state import build_client_order_id, build_intent_key  # noqa: E402
from tradelab_api.services.testnet_order_state_repository import (  # noqa: E402
    TestnetOrderStateRepository as OrderStateRepository,
)

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

def _strategy_context(session: Session) -> tuple[Strategy, StrategyVersion]:
    suffix = datetime.now(UTC).strftime("%Y%m%d%H%M%S%f")
    group = StrategyGroup(
        name="Phase 19.1 Group",
        slug=f"phase-19-1-group-{suffix}",
        description=None,
        metadata_={},
        created_by="admin",
    )
    session.add(group)
    session.flush()
    strategy = Strategy(
        strategy_group_id=group.id,
        name="Phase 19.1 Strategy",
        slug=f"phase-19-1-strategy-{suffix}",
        description=None,
        status="active",
        runtime_config={},
        risk_config={},
        metadata_={},
        created_by="admin",
    )
    session.add(strategy)
    session.flush()
    version = StrategyVersion(
        strategy_id=strategy.id,
        version_number=1,
        source_code="def on_bar(ctx): return []",
        source_hash="hash-phase-19-1",
        validation_status="valid",
        validation_message=None,
        created_by="admin",
    )
    session.add(version)
    session.flush()
    strategy.current_version_id = version.id
    session.flush()
    return strategy, version

def _credential_id(session: Session):
    credential = CredentialRepository(session).create_credential_ref(
        exchange="binance_spot",
        environment="binance_testnet",
        label="Phase 19.1 credential",
        status="stored_testnet_only",
        vault_provider="local_dev_encrypted",
        vault_secret_ref="local-dev://phase19/credential-1",
        api_key_fingerprint="fingerprint-1",
        permission_evidence={"canTrade": True, "canWithdraw": False},
        metadata={"safe": "yes"},
        actor="admin",
    )
    return credential.id

def _intent_payload(session: Session) -> dict[str, object]:
    strategy, version = _strategy_context(session)
    credential_ref_id = _credential_id(session)
    intent_key = build_intent_key(
        strategy_id=str(strategy.id),
        strategy_version_id=str(version.id),
        source_run_id=None,
        credential_ref_id=str(credential_ref_id),
        environment="binance_testnet",
        symbol="BTCUSDT",
        side="buy",
        order_type="market",
        quantity="0.010000000000",
        quote_quantity=None,
        client_action_id="preview-click-1",
    )
    return {
        "intent_key": intent_key,
        "strategy_id": strategy.id,
        "strategy_version_id": version.id,
        "source_run_id": None,
        "source_signal_package_id": None,
        "credential_ref_id": credential_ref_id,
        "environment": "binance_testnet",
        "exchange": "binance",
        "market_type": "spot",
        "symbol": "BTCUSDT",
        "side": "buy",
        "order_type": "market",
        "quantity": Decimal("0.01"),
        "quote_quantity": None,
        "client_order_id": build_client_order_id(intent_key),
        "status": "draft_previewed",
        "status_reason_code": "testnet_order_preview_created",
        "metadata": {"clientOrderId": build_client_order_id(intent_key), "apiSecret": "SECRET-WAS-HERE"},
        "actor": "admin",
    }

def test_repository_persists_intent_preview_event_and_reconciliation_with_redaction(
    db_session: Session,
) -> None:
    repository = OrderStateRepository(db_session)
    intent = repository.create_intent(**_intent_payload(db_session))
    preview = repository.create_preview(
        intent_id=intent.id,
        preview_key="preview-key-1",
        status="allowed",
        reason_code="testnet_order_preview_created",
        symbol="BTCUSDT",
        side="buy",
        order_type="market",
        quantity=Decimal("0.01"),
        quote_quantity=None,
        estimated_notional=Decimal("500.00"),
        estimated_fee=Decimal("0.50"),
        risk_snapshot={"maxNotional": "1000"},
        credential_snapshot={"apiKey": "KEY-WAS-HERE", "canTrade": True},
        source_snapshot={"sourceRunId": None},
        expires_at=datetime.now(UTC) + timedelta(minutes=5),
        metadata={"signature": "SIGNATURE-WAS-HERE"},
        actor="admin",
    )
    repository.set_latest_preview(intent, preview_id=preview.id, actor="admin")
    event = repository.add_event(
        intent_id=intent.id,
        preview_id=preview.id,
        event_type="testnet_order_preview_created",
        from_status=None,
        to_status="draft_previewed",
        reason_code="testnet_order_preview_created",
        idempotency_key="preview-click-1",
        client_order_id=intent.client_order_id,
        exchange_order_id=None,
        actor="admin",
        metadata={"token": "TOKEN-WAS-HERE", "clientOrderId": intent.client_order_id},
    )
    attempt = repository.add_reconciliation_attempt(
        intent_id=intent.id,
        attempt_no=0,
        trigger="manual",
        status="started",
        reason_code="testnet_order_reconciliation_attempt_recorded",
        exchange_order_status=None,
        fills_snapshot={"apiSecret": "SECRET-WAS-HERE"},
        metadata={"safe": "yes"},
        actor="admin",
    )

    db_session.flush()
    db_session.refresh(intent)
    db_session.refresh(preview)
    db_session.refresh(event)
    db_session.refresh(attempt)

    assert intent.metadata_["apiSecret"] == "[REDACTED]"
    assert preview.credential_snapshot["apiKey"] == "[REDACTED]"
    assert preview.metadata_["signature"] == "[REDACTED]"
    assert event.metadata_["token"] == "[REDACTED]"
    assert event.idempotency_key_hash is not None
    assert event.idempotency_key_hash != "preview-click-1"
    assert attempt.fills_snapshot["apiSecret"] == "[REDACTED]"
    assert repository.get_intent(intent.id) == intent
    assert repository.get_intent_by_key(intent.intent_key) == intent
    assert repository.get_intent_by_client_order_id(intent.client_order_id) == intent

def test_repository_updates_status_and_blocks_soft_deleted_reads(db_session: Session) -> None:
    repository = OrderStateRepository(db_session)
    intent = repository.create_intent(**_intent_payload(db_session))

    repository.update_intent_status(
        intent,
        status="unknown",
        reason_code="testnet_order_submit_unknown_state",
        reconciliation_required=True,
        actor="admin",
    )
    repository.soft_delete_intent(intent, actor="admin")
    db_session.flush()

    assert intent.status == "unknown"
    assert intent.reconciliation_required is True
    assert intent.unknown_since is not None
    assert repository.get_intent(intent.id) is None
    assert repository.get_intent(intent.id, active_only=False) == intent

def test_order_state_tables_do_not_contain_plain_secret_columns() -> None:
    forbidden = {"api_key", "api_secret", "secret", "password", "passphrase", "private_key", "token"}
    for table_name in {
        "testnet_order_intent",
        "testnet_order_preview",
        "testnet_order_event",
        "testnet_reconciliation_attempt",
    }:
        assert forbidden.isdisjoint(set(Base.metadata.tables[table_name].columns.keys()))

def test_repository_records_unknown_state_and_reconciliation_event(db_session: Session) -> None:
    repository = OrderStateRepository(db_session)
    intent = repository.create_intent(**_intent_payload(db_session))

    repository.update_intent_status(
        intent,
        status="unknown",
        reason_code="testnet_order_submit_unknown_state",
        reconciliation_required=True,
        actor="admin",
    )
    event = repository.add_event(
        intent_id=intent.id,
        preview_id=None,
        event_type="testnet_order_unknown_recorded",
        from_status="submitting",
        to_status="unknown",
        reason_code="testnet_order_submit_unknown_state",
        idempotency_key="confirm-click-1",
        client_order_id=intent.client_order_id,
        exchange_order_id=None,
        actor="admin",
        metadata={"signedUrl": "https://testnet.binance.vision/api/v3/order?signature=SECRET"},
    )
    db_session.flush()
    db_session.refresh(intent)
    db_session.refresh(event)

    assert intent.status == "unknown"
    assert intent.reconciliation_required is True
    assert event.event_type == "testnet_order_unknown_recorded"
    assert event.metadata_["signedUrl"] == "[REDACTED]"

def test_repository_supports_confirm_submit_events_and_exchange_updates(db_session: Session) -> None:
    repository = OrderStateRepository(db_session)
    intent = repository.create_intent(**_intent_payload(db_session))
    preview = repository.create_preview(
        intent_id=intent.id,
        preview_key="preview-submit-key-1",
        status="allowed",
        reason_code="testnet_order_preview_allowed",
        symbol="BTCUSDT",
        side="buy",
        order_type="market",
        quantity=Decimal("0.01"),
        quote_quantity=None,
        estimated_notional=Decimal("500.00"),
        estimated_fee=None,
        risk_snapshot={"passed": True},
        credential_snapshot={"canTrade": True},
        source_snapshot={"sourceRunId": None},
        expires_at=datetime.now(UTC) + timedelta(minutes=5),
        metadata={},
        actor="admin",
    )
    repository.set_latest_preview(intent, preview_id=preview.id, actor="admin")

    loaded_preview, loaded_intent = repository.get_preview_with_intent(preview.id)
    assert loaded_preview == preview
    assert loaded_intent == intent

    repository.update_intent_status(
        intent,
        status="submitting",
        reason_code="testnet_order_submit_attempted",
        reconciliation_required=False,
        actor="admin",
    )
    updated = repository.update_intent_exchange_snapshot(
        intent,
        exchange_order_id="fake-exchange-1",
        exchange_order_status="submitted",
        metadata={"signedUrl": "https://testnet.binance.vision/api/v3/order?signature=SECRET"},
        actor="admin",
    )
    event = repository.add_event(
        intent_id=intent.id,
        preview_id=preview.id,
        event_type="testnet_order_submit_attempted",
        from_status="confirmed",
        to_status="submitting",
        reason_code="testnet_order_submit_attempted",
        idempotency_key="testnet-order-confirm-submit:preview-submit-key-1",
        client_order_id=intent.client_order_id,
        exchange_order_id=None,
        actor="admin",
        metadata={"safe": "yes"},
    )
    replay_event = repository.get_latest_submit_event_by_idempotency_key(
        intent.id,
        "testnet-order-confirm-submit:preview-submit-key-1",
    )

    db_session.flush()
    db_session.refresh(updated)
    db_session.refresh(event)

    assert updated.exchange_order_id == "fake-exchange-1"
    assert updated.exchange_order_status == "submitted"
    assert updated.metadata_["signedUrl"] == "[REDACTED]"
    assert event.event_type == "testnet_order_submit_attempted"
    assert replay_event == event


def test_repository_supports_cancel_events_and_idempotency_replay(db_session: Session) -> None:
    repository = OrderStateRepository(db_session)
    intent = repository.create_intent(**_intent_payload(db_session))

    requested = repository.add_event(
        intent_id=intent.id,
        preview_id=None,
        event_type="testnet_order_cancel_requested",
        from_status="submitted",
        to_status="cancel_requested",
        reason_code="testnet_order_cancel_requested",
        idempotency_key="testnet-order-cancel:intent-1:cancel-click-1",
        client_order_id=intent.client_order_id,
        exchange_order_id="exchange-1",
        actor="admin",
        metadata={"signature": "SECRET-WAS-HERE"},
    )
    accepted = repository.add_event(
        intent_id=intent.id,
        preview_id=None,
        event_type="testnet_order_cancel_accepted",
        from_status="cancel_requested",
        to_status="cancelled",
        reason_code="testnet_order_cancel_binance_accepted",
        idempotency_key="testnet-order-cancel:intent-1:cancel-click-1",
        client_order_id=intent.client_order_id,
        exchange_order_id="exchange-1",
        actor="admin",
        metadata={"safe": "yes"},
    )

    replay = repository.get_latest_cancel_event_by_idempotency_key(
        intent.id,
        "testnet-order-cancel:intent-1:cancel-click-1",
    )

    db_session.flush()
    db_session.refresh(requested)
    db_session.refresh(accepted)

    assert requested.metadata_["signature"] == "[REDACTED]"
    assert replay == accepted


def test_repository_returns_next_reconciliation_attempt_no(db_session: Session) -> None:
    repository = OrderStateRepository(db_session)
    intent = repository.create_intent(**_intent_payload(db_session))

    assert repository.get_next_reconciliation_attempt_no(intent.id) == 0

    repository.add_reconciliation_attempt(
        intent_id=intent.id,
        attempt_no=0,
        trigger="manual",
        status="started",
        reason_code="testnet_order_reconcile_started",
        exchange_order_status=None,
        fills_snapshot={},
        metadata={},
        actor="admin",
    )
    repository.add_reconciliation_attempt(
        intent_id=intent.id,
        attempt_no=1,
        trigger="cancel_race",
        status="ambiguous",
        reason_code="testnet_order_reconcile_binance_ambiguous",
        exchange_order_status=None,
        fills_snapshot={},
        metadata={},
        actor="admin",
    )

    assert repository.get_next_reconciliation_attempt_no(intent.id) == 2
