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
from tradelab_api.services.testnet_credential_repository import TestnetCredentialRepository as CredentialRepository  # noqa: E402
from tradelab_api.services.testnet_credential_vault import (  # noqa: E402
    LocalDevEncryptedCredentialVaultProvider,
    TestnetCredentialCreateRequestData,
    TestnetCredentialSecretRequestData,
    create_testnet_credential,
)
from tradelab_api.services.testnet_order_confirm_submit import (  # noqa: E402
    TestnetOrderConfirmSubmitRequestData,
    confirm_submit_testnet_order,
)
from tradelab_api.services.testnet_order_preview import (  # noqa: E402
    TestnetOrderPreviewRequestData,
    preview_testnet_order,
)
from tradelab_api.services.testnet_order_state_repository import TestnetOrderStateRepository as OrderStateRepository  # noqa: E402

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
    group = StrategyGroup(name="Phase 19.3A Group", slug=f"phase-19-3a-group-{suffix}", metadata_={}, created_by="admin")
    session.add(group)
    session.flush()
    strategy = Strategy(strategy_group_id=group.id, name="Phase 19.3A Strategy", slug=f"phase-19-3a-strategy-{suffix}", status="active", runtime_config={}, risk_config={}, metadata_={}, created_by="admin")
    session.add(strategy)
    session.flush()
    version = StrategyVersion(strategy_id=strategy.id, version_number=1, source_code="def on_bar(ctx): return []", source_hash=f"hash-{suffix}", validation_status="valid", created_by="admin")
    session.add(version)
    session.flush()
    return strategy, version


def _credential(session: Session, *, status: str = "stored_testnet_only", can_trade: bool = True, can_withdraw: bool = False, margin: bool = False):
    return CredentialRepository(session).create_credential_ref(
        exchange="binance_spot",
        environment="binance_testnet",
        label="Submit credential",
        status=status,
        vault_provider="local_dev_encrypted",
        vault_secret_ref=f"local-dev://phase19/{uuid4()}",
        api_key_fingerprint="fingerprint",
        permission_evidence={"canTrade": can_trade, "canWithdraw": can_withdraw, "marginOrFuturesEnabled": margin},
        metadata={"apiSecret": "SECRET"},
        actor="admin",
    )


def _preview(session: Session, *, expires_at_offset_minutes: int = 15, credential_id: UUID | None = None):
    strategy, version = _strategy(session)
    credential_ref_id = credential_id or _credential(session).id
    result = preview_testnet_order(
        OrderStateRepository(session),
        CredentialRepository(session),
        TestnetOrderPreviewRequestData(
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
            environment="binance_testnet",
            exchange="binance",
            market_type="spot",
            symbol="BTCUSDT",
            side="buy",
            order_type="market",
            quantity=None,
            quote_quantity=Decimal("25"),
        ),
    )
    assert result.preview_id is not None
    preview = OrderStateRepository(session).get_preview(UUID(result.preview_id))
    assert preview is not None
    preview.expires_at = datetime.now(UTC) + timedelta(minutes=expires_at_offset_minutes)
    session.flush()
    return UUID(result.preview_id), UUID(result.intent_id)


def _submit(session: Session, preview_id: UUID, **overrides):
    values = dict(
        preview_id=preview_id,
        confirm_testnet_order=True,
        idempotency_key="submit-key-1",
        actor="admin",
        submit_kill_switch_enabled=False,
    )
    values.update(overrides)
    return confirm_submit_testnet_order(
        OrderStateRepository(session),
        CredentialRepository(session),
        TestnetOrderConfirmSubmitRequestData(**values),
    )


def test_confirm_submit_blocks_without_confirmation(db_session: Session) -> None:
    preview_id, _ = _preview(db_session)
    result = _submit(db_session, preview_id, confirm_testnet_order=False)
    assert result.status == "blocked"
    assert result.reason_code == "testnet_order_submit_confirmation_required"
    assert result.should_commit is False


def test_confirm_submit_blocks_secret_like_idempotency(db_session: Session) -> None:
    preview_id, _ = _preview(db_session)
    result = _submit(db_session, preview_id, idempotency_key="api" + "Secret=placeholder")
    assert result.status == "blocked"
    assert result.reason_code == "testnet_order_submit_idempotency_invalid"


def test_confirm_submit_blocks_expired_preview(db_session: Session) -> None:
    preview_id, _ = _preview(db_session, expires_at_offset_minutes=-1)
    result = _submit(db_session, preview_id)
    assert result.status == "blocked"
    assert result.reason_code == "testnet_order_submit_preview_expired"


def test_confirm_submit_blocks_unsafe_credential(db_session: Session) -> None:
    credential = _credential(db_session)
    preview_id, _ = _preview(db_session, credential_id=credential.id)
    credential.status = "validated_testnet_read_only"
    credential.permission_evidence = {"canTrade": True, "canWithdraw": True, "marginOrFuturesEnabled": True}
    db_session.flush()
    result = _submit(db_session, preview_id)
    assert result.status == "blocked"
    assert result.reason_code == "testnet_order_submit_unsafe_permissions"


def test_confirm_submit_allows_validated_spot_testnet_credential_with_withdraw_flag(db_session: Session) -> None:
    credential = _credential(db_session, status="validated_testnet_read_only", can_trade=True, can_withdraw=True, margin=False)
    preview_id, _ = _preview(db_session, credential_id=credential.id)
    result = _submit(db_session, preview_id)
    assert result.status == "submitted"
    assert result.reason_code == "testnet_order_submit_fake_accepted"


def test_confirm_submit_kill_switch_blocks_before_submit(db_session: Session) -> None:
    preview_id, _ = _preview(db_session)
    result = _submit(db_session, preview_id, submit_kill_switch_enabled=True)
    assert result.status == "blocked"
    assert result.reason_code == "testnet_order_submit_kill_switch_enabled"
    assert result.should_commit is True


def test_confirm_submit_persists_fake_submitted_state(db_session: Session) -> None:
    preview_id, intent_id = _preview(db_session)
    result = _submit(db_session, preview_id)
    intent = OrderStateRepository(db_session).get_intent(intent_id)
    events = OrderStateRepository(db_session).list_events_for_intent(intent_id)

    assert result.status == "submitted"
    assert result.reason_code == "testnet_order_submit_fake_accepted"
    assert result.intent_status == "submitted"
    assert result.exchange_order_id is not None
    assert result.should_commit is True
    assert intent is not None
    assert intent.status == "submitted"
    assert intent.exchange_order_id == result.exchange_order_id
    assert [event.event_type for event in events][-3:] == [
        "testnet_order_confirmation_recorded",
        "testnet_order_submit_attempted",
        "testnet_order_submit_accepted",
    ]


def test_confirm_submit_replays_without_new_events(db_session: Session) -> None:
    preview_id, intent_id = _preview(db_session)
    first = _submit(db_session, preview_id)
    first_event_count = len(OrderStateRepository(db_session).list_events_for_intent(intent_id))
    second = _submit(db_session, preview_id)
    second_event_count = len(OrderStateRepository(db_session).list_events_for_intent(intent_id))

    assert second.status == first.status
    assert second.exchange_order_id == first.exchange_order_id
    assert second.reason_code == "testnet_order_submit_idempotency_replayed"
    assert second.should_commit is False
    assert second_event_count == first_event_count


def test_confirm_submit_unknown_blocks_later_submit(db_session: Session) -> None:
    preview_id, intent_id = _preview(db_session)
    result = _submit(db_session, preview_id, idempotency_key="timeout_unknown")
    blocked = _submit(db_session, preview_id, idempotency_key="submit-key-2")
    intent = OrderStateRepository(db_session).get_intent(intent_id)

    assert result.status == "unknown"
    assert result.reason_code == "testnet_order_submit_unknown_state"
    assert intent is not None
    assert intent.status == "unknown"
    assert intent.unknown_since is not None
    assert intent.reconciliation_required is True
    assert blocked.status == "blocked"
    assert blocked.reason_code == "testnet_order_requires_reconciliation_before_submit"


def test_confirm_submit_fake_rejected_maps_to_rejected(db_session: Session) -> None:
    preview_id, intent_id = _preview(db_session)
    result = _submit(db_session, preview_id, idempotency_key="rejected")
    intent = OrderStateRepository(db_session).get_intent(intent_id)

    assert result.status == "rejected"
    assert result.reason_code == "testnet_order_submit_fake_rejected"
    assert intent is not None
    assert intent.status == "rejected"


def test_confirm_submit_real_mode_network_disabled_blocks_before_vault_read(db_session: Session) -> None:
    preview_id, _ = _preview(db_session)
    provider = _local_dev_provider()
    transport = RecordingTransport(httpx.Response(200, json={"orderId": 1}))
    result = confirm_submit_testnet_order(
        OrderStateRepository(db_session),
        CredentialRepository(db_session),
        TestnetOrderConfirmSubmitRequestData(
            preview_id=preview_id,
            confirm_testnet_order=True,
            idempotency_key="real-submit-1",
            actor="admin",
            submit_kill_switch_enabled=False,
            connector_mode="real",
            real_network_enabled=False,
            environment_name="local",
            binance_testnet_base_url="https://testnet.binance.vision",
            vault_provider_name="local_dev_encrypted",
            request_time_ms=1700000000000,
        ),
        vault_provider=provider,
        http_client=httpx.Client(transport=transport),
    )
    assert result.status == "blocked"
    assert result.reason_code == "testnet_order_submit_real_network_not_enabled"
    assert transport.requests == []


def test_confirm_submit_real_mode_blocks_unsupported_environment(db_session: Session) -> None:
    preview_id, _ = _preview(db_session)
    result = _submit(
        db_session,
        preview_id,
        connector_mode="real",
        real_network_enabled=True,
        environment_name="production",
        vault_provider_name="local_dev_encrypted",
    )
    assert result.status == "blocked"
    assert result.reason_code == "testnet_order_submit_environment_not_allowed"


def test_confirm_submit_real_mode_blocks_live_base_url(db_session: Session) -> None:
    preview_id, _ = _preview(db_session)
    result = _submit(
        db_session,
        preview_id,
        connector_mode="real",
        real_network_enabled=True,
        environment_name="local",
        binance_testnet_base_url="https://api.binance.com",
        vault_provider_name="local_dev_encrypted",
    )
    assert result.status == "blocked"
    assert result.reason_code == "testnet_order_submit_base_url_not_allowed"


def test_confirm_submit_real_mode_blocks_fake_vault_provider(db_session: Session) -> None:
    preview_id, _ = _preview(db_session)
    result = _submit(
        db_session,
        preview_id,
        connector_mode="real",
        real_network_enabled=True,
        environment_name="local",
        vault_provider_name="fake",
    )
    assert result.status == "blocked"
    assert result.reason_code == "testnet_order_submit_vault_provider_not_supported"


def _encrypted_submit_credential(session: Session, provider: LocalDevEncryptedCredentialVaultProvider):
    repository = CredentialRepository(session)
    created = create_testnet_credential(
        repository,
        provider,
        request=TestnetCredentialCreateRequestData(
            label="Real submit credential",
            confirm_create=True,
            idempotency_key=f"credential-{uuid4()}",
            actor="admin",
            secret=TestnetCredentialSecretRequestData(api_key="TESTNET-KEY", api_secret="TESTNET-SECRET"),
        ),
    )
    credential = repository.get_credential_ref(UUID(created.credential_ref_id))
    assert credential is not None
    credential.status = "validated_testnet_read_only"
    credential.permission_evidence = {"canTrade": True, "canWithdraw": False, "marginOrFuturesEnabled": False}
    session.flush()
    return credential


def _submit_real(session: Session, preview_id: UUID, provider: LocalDevEncryptedCredentialVaultProvider, transport: httpx.BaseTransport, **overrides):
    values = dict(
        preview_id=preview_id,
        confirm_testnet_order=True,
        idempotency_key="real-submit-1",
        actor="admin",
        submit_kill_switch_enabled=False,
        connector_mode="real",
        real_network_enabled=True,
        environment_name="local",
        binance_testnet_base_url="https://testnet.binance.vision",
        vault_provider_name="local_dev_encrypted",
        recv_window_ms=5000,
        timeout_seconds=5.0,
        request_time_ms=1700000000000,
    )
    values.update(overrides)
    return confirm_submit_testnet_order(
        OrderStateRepository(session),
        CredentialRepository(session),
        TestnetOrderConfirmSubmitRequestData(**values),
        vault_provider=provider,
        http_client=httpx.Client(transport=transport),
    )


def test_confirm_submit_real_success_persists_submitted_state(db_session: Session) -> None:
    provider = _local_dev_provider()
    credential = _encrypted_submit_credential(db_session, provider)
    preview_id, intent_id = _preview(db_session, credential_id=credential.id)
    transport = RecordingTransport(httpx.Response(200, json={"orderId": 98765, "clientOrderId": "tltn-client", "status": "NEW", "executedQty": "0", "cummulativeQuoteQty": "0"}))

    result = _submit_real(db_session, preview_id, provider, transport)
    intent = OrderStateRepository(db_session).get_intent(intent_id)
    events = OrderStateRepository(db_session).list_events_for_intent(intent_id)

    assert result.status == "submitted"
    assert result.reason_code == "testnet_order_submit_binance_accepted"
    assert result.safety_status == "assisted_testnet_real_submit_testnet_only"
    assert result.exchange_order_id == "98765"
    assert intent is not None
    assert intent.status == "submitted"
    assert intent.exchange_order_id == "98765"
    assert transport.requests and len(transport.requests) == 1
    assert "TESTNET-SECRET" not in str([event.metadata_ for event in events])
    assert any(event.event_type == "testnet_order_submit_accepted" for event in events)


def test_confirm_submit_real_timeout_persists_unknown_and_blocks_new_submit(db_session: Session) -> None:
    provider = _local_dev_provider()
    credential = _encrypted_submit_credential(db_session, provider)
    preview_id, intent_id = _preview(db_session, credential_id=credential.id)

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("timeout SECRET", request=request)

    result = _submit_real(db_session, preview_id, provider, httpx.MockTransport(handler))
    blocked = _submit_real(db_session, preview_id, provider, RecordingTransport(httpx.Response(200, json={"orderId": 1})), idempotency_key="real-submit-2")
    intent = OrderStateRepository(db_session).get_intent(intent_id)

    assert result.status == "unknown"
    assert result.reason_code == "testnet_order_submit_binance_timeout_unknown"
    assert intent is not None
    assert intent.reconciliation_required is True
    assert blocked.status == "blocked"
    assert blocked.reason_code == "testnet_order_requires_reconciliation_before_submit"


def test_confirm_submit_real_rejected_persists_rejected_state(db_session: Session) -> None:
    provider = _local_dev_provider()
    credential = _encrypted_submit_credential(db_session, provider)
    preview_id, intent_id = _preview(db_session, credential_id=credential.id)
    transport = RecordingTransport(httpx.Response(400, json={"code": -1013, "msg": "Filter failure"}))

    result = _submit_real(db_session, preview_id, provider, transport)
    intent = OrderStateRepository(db_session).get_intent(intent_id)

    assert result.status == "rejected"
    assert result.reason_code == "testnet_order_submit_binance_rejected"
    assert intent is not None
    assert intent.status == "rejected"


def test_confirm_submit_real_replay_does_not_read_vault_or_call_network_again(db_session: Session) -> None:
    provider = _local_dev_provider()
    credential = _encrypted_submit_credential(db_session, provider)
    preview_id, _ = _preview(db_session, credential_id=credential.id)
    first_transport = RecordingTransport(httpx.Response(200, json={"orderId": 98765, "clientOrderId": "tltn-client", "status": "NEW", "executedQty": "0", "cummulativeQuoteQty": "0"}))
    second_transport = RecordingTransport(httpx.Response(200, json={"orderId": 11111}))

    first = _submit_real(db_session, preview_id, provider, first_transport)
    second = _submit_real(db_session, preview_id, provider, second_transport)

    assert first.status == "submitted"
    assert second.reason_code == "testnet_order_submit_idempotency_replayed"
    assert second.exchange_order_id == "98765"
    assert len(first_transport.requests) == 1
    assert second_transport.requests == []
