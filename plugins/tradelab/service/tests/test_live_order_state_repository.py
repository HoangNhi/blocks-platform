from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from decimal import Decimal
import os
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://postgres:postgres123secure@localhost:5432/tradelab")

from tradelab_api.db.models import Base, LivePilotControl, Strategy, StrategyGroup, StrategyVersion  # noqa: E402
from tradelab_api.db.session import SessionLocal, apply_schema_compatibility, get_engine  # noqa: E402
from tradelab_api.services.live_credential_repository import LiveCredentialRepository as CredentialRepository  # noqa: E402
from tradelab_api.services.live_order_state import build_client_order_id, build_intent_key  # noqa: E402
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


def _strategy_context(session: Session) -> tuple[Strategy, StrategyVersion]:
    suffix = datetime.now(UTC).strftime("%Y%m%d%H%M%S%f")
    group = StrategyGroup(name="Live Group", slug=f"live-group-{suffix}", description=None, metadata_={}, created_by="admin")
    session.add(group)
    session.flush()
    strategy = Strategy(strategy_group_id=group.id, name="Live Strategy", slug=f"live-strategy-{suffix}", description=None, status="active", runtime_config={}, risk_config={}, metadata_={}, created_by="admin")
    session.add(strategy)
    session.flush()
    version = StrategyVersion(strategy_id=strategy.id, version_number=1, source_code="def on_bar(ctx): return []", source_hash="hash-live", validation_status="valid", validation_message=None, created_by="admin")
    session.add(version)
    session.flush()
    strategy.current_version_id = version.id
    session.flush()
    return strategy, version


def _credential_id(session: Session):
    credential = CredentialRepository(session).create_credential_ref(
        exchange="binance_spot",
        environment="binance_live",
        label="Live credential",
        status="validated_live_read_only",
        vault_provider="local_dev_encrypted",
        vault_secret_ref="local-dev://phase20/credential-1",
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
        environment="binance_live",
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
        "environment": "binance_live",
        "exchange": "binance",
        "market_type": "spot",
        "symbol": "BTCUSDT",
        "side": "buy",
        "order_type": "market",
        "quantity": Decimal("0.01"),
        "quote_quantity": None,
        "client_order_id": build_client_order_id(intent_key),
        "status": "draft_previewed",
        "status_reason_code": "live_order_preview_created",
        "metadata": {"clientOrderId": build_client_order_id(intent_key), "apiSecret": "SECRET-WAS-HERE"},
        "actor": "admin",
    }


def test_repository_persists_intent_preview_event_and_reconciliation_with_redaction(db_session: Session) -> None:
    repository = OrderStateRepository(db_session)
    intent = repository.create_intent(**_intent_payload(db_session))
    preview = repository.create_preview(
        intent_id=intent.id,
        preview_key="preview-key-1",
        status="allowed",
        reason_code="live_order_preview_created",
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
        event_type="live_order_preview_created",
        from_status=None,
        to_status="draft_previewed",
        reason_code="live_order_preview_created",
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
        reason_code="live_order_reconciliation_attempt_recorded",
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
    assert attempt.fills_snapshot["apiSecret"] == "[REDACTED]"
    assert len(intent.client_order_id) <= 36
    assert repository.get_intent(intent.id) == intent
    assert repository.get_intent_by_key(intent.intent_key) == intent
    assert repository.get_intent_by_client_order_id(intent.client_order_id) == intent


def test_live_order_state_tables_do_not_contain_plain_secret_columns() -> None:
    forbidden = {"api_key", "api_secret", "secret", "password", "passphrase", "private_key", "token"}
    for table_name in {
        "live_order_intent",
        "live_order_preview",
        "live_order_event",
        "live_reconciliation_attempt",
    }:
        assert forbidden.isdisjoint(set(Base.metadata.tables[table_name].columns.keys()))


def test_repository_tracks_proof_window_default_open_consume_and_close(db_session: Session) -> None:
    db_session.query(LivePilotControl).filter(
        LivePilotControl.exchange == "binance",
        LivePilotControl.environment == "binance_live",
        LivePilotControl.is_active.is_(True),
        LivePilotControl.is_deleted.is_(False),
    ).delete(synchronize_session=False)
    db_session.flush()

    repository = OrderStateRepository(db_session)

    pilot = repository.get_or_create_pilot_control()
    assert pilot.proof_window_status == "closed"
    assert pilot.proof_window_remaining_intent_budget == 0

    opened = repository.open_proof_window(
        actor="phase20-operator",
        reason="phase20_one_fill_proof",
        ttl_seconds=120,
        intent_budget=1,
    )
    assert opened.proof_window_status == "open"
    assert opened.proof_window_remaining_intent_budget == 1
    assert opened.proof_window_reason == "phase20_one_fill_proof"
    assert opened.proof_window_expires_at is not None

    consumed = repository.consume_proof_window(
        actor="phase20-operator",
        active_intent_id=uuid4(),
        reason="accepted_live_submit_consumed",
    )
    assert consumed.proof_window_status == "consumed"
    assert consumed.proof_window_remaining_intent_budget == 0
    assert consumed.active_intent_id is not None

    closed = repository.close_proof_window(
        actor="phase20-operator",
        reason="rollback_safe_close",
    )
    assert closed.proof_window_status == "closed"
    assert closed.proof_window_remaining_intent_budget == 0
    assert closed.proof_window_closed_by == "phase20-operator"


def test_repository_detects_unknown_and_reconciliation_debt_for_proof_window(db_session: Session) -> None:
    repository = OrderStateRepository(db_session)
    intent = repository.create_intent(**_intent_payload(db_session))
    repository.update_intent_status(
        intent,
        status="unknown",
        reason_code="live_order_submit_unknown_recorded",
        reconciliation_required=True,
        actor="admin",
    )

    assert repository.has_unresolved_proof_window_debt() is True
