from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from decimal import Decimal
import os
from uuid import UUID, uuid4

from cryptography.fernet import Fernet
import httpx
import pytest
from sqlalchemy.orm import Session

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://postgres:postgres123secure@localhost:5432/tradelab")

from tradelab_api.db.models import Strategy, StrategyGroup, StrategyVersion  # noqa: E402
from tradelab_api.db.session import SessionLocal, apply_schema_compatibility, get_engine  # noqa: E402
from tradelab_api.services.live_credential_repository import LiveCredentialRepository as CredentialRepository  # noqa: E402
from tradelab_api.services.live_credential_vault import LocalDevEncryptedCredentialVaultProvider, LiveCredentialSecretRequestData  # noqa: E402
from tradelab_api.services.live_order_confirm_submit import LiveOrderConfirmSubmitRequestData, confirm_submit_live_order  # noqa: E402
from tradelab_api.services.live_order_preview import LiveOrderPreviewRequestData, preview_live_order  # noqa: E402
from tradelab_api.services.live_order_state_repository import LiveOrderStateRepository as OrderStateRepository  # noqa: E402

apply_schema_compatibility()


class RecordingTransport(httpx.BaseTransport):
    def __init__(self, response: httpx.Response) -> None:
        self.response = response
        self.requests: list[httpx.Request] = []

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return self.response


def _local_dev_provider() -> LocalDevEncryptedCredentialVaultProvider:
    return LocalDevEncryptedCredentialVaultProvider(encryption_key=Fernet.generate_key().decode("ascii"))


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
    suffix = datetime.now(UTC).strftime("%Y%m%d%H%M%S%f")
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


def _credential(session: Session, *, status: str = "validated_live_read_only", can_trade: bool = True, can_withdraw: bool = False):
    return CredentialRepository(session).create_credential_ref(
        exchange="binance_spot",
        environment="binance_live",
        label="Submit credential",
        status=status,
        vault_provider="local_dev_encrypted",
        vault_secret_ref=f"local-dev://phase20/{uuid4()}",
        api_key_fingerprint="fingerprint",
        permission_evidence={"canTrade": can_trade, "canWithdraw": can_withdraw, "marginOrFuturesEnabled": False},
        metadata={"apiSecret": "SECRET"},
        actor="admin",
    )


def _real_credential(session: Session):
    provider = _local_dev_provider()
    write = provider.create_secret(
        label="submit",
        actor="admin",
        idempotency_key=f"secret-{uuid4()}",
        secret=LiveCredentialSecretRequestData(api_key="api-key-1", api_secret="api-secret-1"),
    )
    repository = CredentialRepository(session)
    credential = repository.create_credential_ref(
        exchange="binance_spot",
        environment="binance_live",
        label="Submit credential",
        status="validated_live_read_only",
        vault_provider="local_dev_encrypted",
        vault_secret_ref=write.vault_secret_ref,
        api_key_fingerprint=write.api_key_fingerprint,
        permission_evidence={"canTrade": True, "canWithdraw": False, "marginOrFuturesEnabled": False},
        metadata={"apiSecret": "SECRET"},
        actor="admin",
    )
    repository.create_secret_row(
        credential_ref_id=credential.id,
        vault_secret_ref=write.vault_secret_ref,
        encrypted_payload=write.metadata["encryptedPayload"],
        encryption_key_fingerprint=write.metadata["encryptionKeyFingerprint"],
        actor="admin",
    )
    return credential, provider


def _preview(session: Session, *, credential_id: UUID | None = None):
    strategy, version = _strategy(session)
    credential_ref_id = credential_id or _credential(session).id
    result = preview_live_order(
        OrderStateRepository(session),
        CredentialRepository(session),
        LiveOrderPreviewRequestData(
            confirm_preview_only=True,
            idempotency_key=f"preview-key-{uuid4()}",
            client_action_id=f"action-{uuid4()}",
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
        ),
        live_order_submit_kill_switch_enabled=False,
    )
    assert result.preview_id is not None
    preview = OrderStateRepository(session).get_preview(UUID(result.preview_id))
    assert preview is not None
    preview.expires_at = datetime.now(UTC) + timedelta(minutes=15)
    session.flush()
    return UUID(result.preview_id), UUID(result.intent_id)


def _preview_real(session: Session, *, credential_id: UUID):
    strategy, version = _strategy(session)
    result = preview_live_order(
        OrderStateRepository(session),
        CredentialRepository(session),
        LiveOrderPreviewRequestData(
            confirm_preview_only=True,
            idempotency_key=f"preview-key-{uuid4()}",
            client_action_id=f"action-{uuid4()}",
            source="strategy_lab",
            actor="admin",
            strategy_id=strategy.id,
            strategy_version_id=version.id,
            source_run_id=None,
            source_signal_package_id=None,
            credential_ref_id=credential_id,
            environment="binance_live",
            exchange="binance",
            market_type="spot",
            symbol="BTCUSDT",
            side="buy",
            order_type="market",
            quantity=None,
            quote_quantity=Decimal("25"),
        ),
        live_order_submit_kill_switch_enabled=False,
        connector_mode="real",
        real_network_enabled=True,
        environment_name="local",
        binance_live_base_url="https://api.binance.com",
        vault_provider_name="local_dev_encrypted",
    )
    assert result.preview_id is not None
    preview = OrderStateRepository(session).get_preview(UUID(result.preview_id))
    assert preview is not None
    preview.expires_at = datetime.now(UTC) + timedelta(minutes=15)
    session.flush()
    return UUID(result.preview_id), UUID(result.intent_id)


def _submit(session: Session, preview_id: UUID, **overrides):
    values = dict(
        preview_id=preview_id,
        confirm_live_order=True,
        idempotency_key="submit-key-1",
        actor="admin",
        live_order_submit_kill_switch_enabled=False,
    )
    values.update(overrides)
    return confirm_submit_live_order(
        OrderStateRepository(session),
        CredentialRepository(session),
        LiveOrderConfirmSubmitRequestData(**values),
    )


def test_confirm_submit_blocks_without_confirmation(db_session: Session) -> None:
    preview_id, _ = _preview(db_session)
    result = _submit(db_session, preview_id, confirm_live_order=False)
    assert result.status == "blocked"
    assert result.reason_code == "live_order_submit_confirmation_required"


def test_confirm_submit_blocks_secret_like_idempotency(db_session: Session) -> None:
    preview_id, _ = _preview(db_session)
    result = _submit(db_session, preview_id, idempotency_key="api" + "Secret=placeholder")
    assert result.status == "blocked"
    assert result.reason_code == "live_order_submit_idempotency_invalid"


def test_confirm_submit_blocks_expired_preview(db_session: Session) -> None:
    preview_id, _ = _preview(db_session)
    preview = OrderStateRepository(db_session).get_preview(preview_id)
    assert preview is not None
    preview.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    db_session.flush()
    result = _submit(db_session, preview_id)
    assert result.status == "blocked"
    assert result.reason_code == "live_order_submit_preview_expired"


def test_confirm_submit_blocks_unsafe_credential(db_session: Session) -> None:
    credential = _credential(db_session)
    preview_id, _ = _preview(db_session, credential_id=credential.id)
    credential.status = "unsafe_permissions"
    credential.permission_evidence = {"canTrade": True, "canWithdraw": True}
    db_session.flush()
    result = _submit(db_session, preview_id)
    assert result.status == "blocked"
    assert result.reason_code == "live_order_submit_credential_not_ready"


def test_confirm_submit_kill_switch_blocks_before_submit(db_session: Session) -> None:
    preview_id, _ = _preview(db_session)
    result = confirm_submit_live_order(
        OrderStateRepository(db_session),
        CredentialRepository(db_session),
        LiveOrderConfirmSubmitRequestData(
            preview_id=preview_id,
            confirm_live_order=True,
            idempotency_key="submit-key-1",
            actor="admin",
            live_order_submit_kill_switch_enabled=True,
        ),
    )

    assert result.status == "blocked"
    assert result.reason_code == "live_order_submit_kill_switch_enabled"
    assert result.should_commit is True


def test_confirm_submit_persists_fake_submitted_state(db_session: Session) -> None:
    preview_id, intent_id = _preview(db_session)
    result = _submit(db_session, preview_id)
    intent = OrderStateRepository(db_session).get_intent(intent_id)
    events = OrderStateRepository(db_session).list_events_for_intent(intent_id)

    assert result.status == "submitted"
    assert result.reason_code == "live_order_submit_fake_accepted"
    assert result.intent_status == "submitted"
    assert result.exchange_order_id is not None
    assert intent is not None
    assert intent.status == "submitted"
    assert [event.event_type for event in events][-3:] == [
        "live_order_confirmation_recorded",
        "live_order_submit_attempted",
        "live_order_submit_accepted",
    ]


def test_confirm_submit_replays_without_new_events(db_session: Session) -> None:
    preview_id, intent_id = _preview(db_session)
    first = _submit(db_session, preview_id)
    first_event_count = len(OrderStateRepository(db_session).list_events_for_intent(intent_id))
    second = _submit(db_session, preview_id)
    second_event_count = len(OrderStateRepository(db_session).list_events_for_intent(intent_id))

    assert second.status == first.status
    assert second.exchange_order_id == first.exchange_order_id
    assert second.reason_code == "live_order_submit_idempotency_replayed"
    assert second.should_commit is False
    assert second_event_count == first_event_count


def test_confirm_submit_unknown_blocks_later_submit(db_session: Session) -> None:
    preview_id, intent_id = _preview(db_session)
    result = _submit(db_session, preview_id, idempotency_key="timeout_unknown")
    blocked = _submit(db_session, preview_id, idempotency_key="submit-key-2")
    intent = OrderStateRepository(db_session).get_intent(intent_id)

    assert result.status == "unknown"
    assert result.reason_code == "live_order_submit_fake_unknown_state"
    assert intent is not None
    assert intent.status == "unknown"
    assert intent.reconciliation_required is True
    assert blocked.status == "blocked"
    assert blocked.reason_code == "live_order_requires_reconciliation_before_submit"


def test_confirm_submit_fake_rejected_maps_to_rejected(db_session: Session) -> None:
    preview_id, intent_id = _preview(db_session)
    result = _submit(db_session, preview_id, idempotency_key="rejected")
    intent = OrderStateRepository(db_session).get_intent(intent_id)

    assert result.status == "rejected"
    assert result.reason_code == "live_order_submit_fake_rejected"
    assert intent is not None
    assert intent.status == "rejected"


def test_confirm_submit_real_mode_blocks_when_proof_window_is_closed(db_session: Session) -> None:
    preview_id, _ = _preview(db_session)
    result = confirm_submit_live_order(
        OrderStateRepository(db_session),
        CredentialRepository(db_session),
        LiveOrderConfirmSubmitRequestData(
            preview_id=preview_id,
            confirm_live_order=True,
            idempotency_key="submit-key-real-closed",
            actor="admin",
            live_order_submit_kill_switch_enabled=False,
            connector_mode="real",
            real_network_enabled=True,
            environment_name="local",
            binance_live_base_url="https://api.binance.com",
            vault_provider_name="local_dev_encrypted",
        ),
        vault_provider=_local_dev_provider(),
        http_client=httpx.Client(transport=RecordingTransport(httpx.Response(200, json={}))),
    )

    assert result.status == "blocked"
    assert result.reason_code == "live_order_proof_window_closed"


def test_confirm_submit_real_mode_consumes_budget_after_accept(db_session: Session) -> None:
    credential, provider = _real_credential(db_session)
    repository = OrderStateRepository(db_session)
    repository.open_proof_window(
        actor="phase20-operator",
        reason="phase20_one_fill_proof",
        ttl_seconds=120,
        intent_budget=1,
    )
    preview_id, intent_id = _preview_real(db_session, credential_id=credential.id)
    transport = RecordingTransport(
        httpx.Response(
            200,
            json={
                "symbol": "BTCUSDT",
                "status": "NEW",
                "orderId": 123456789,
                "clientOrderId": "test-client-id",
                "executedQty": "0.00000000",
                "cummulativeQuoteQty": "0.00000000",
            },
        )
    )

    result = confirm_submit_live_order(
        repository,
        CredentialRepository(db_session),
        LiveOrderConfirmSubmitRequestData(
            preview_id=preview_id,
            confirm_live_order=True,
            idempotency_key="submit-key-real-1",
            actor="admin",
            live_order_submit_kill_switch_enabled=False,
            connector_mode="real",
            real_network_enabled=True,
            environment_name="local",
            binance_live_base_url="https://api.binance.com",
            vault_provider_name="local_dev_encrypted",
        ),
        vault_provider=provider,
        http_client=httpx.Client(transport=transport),
    )

    pilot = repository.get_or_create_pilot_control()
    intent = repository.get_intent(intent_id)

    assert result.status == "submitted"
    assert result.reason_code == "live_order_submit_binance_accepted"
    assert pilot.proof_window_status == "consumed"
    assert pilot.proof_window_remaining_intent_budget == 0
    assert str(pilot.active_intent_id) == str(intent_id)
    assert intent is not None
    assert intent.status == "submitted"
