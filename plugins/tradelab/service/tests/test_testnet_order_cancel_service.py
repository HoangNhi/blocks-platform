from __future__ import annotations

from collections.abc import Iterator
import os

import httpx
import pytest
from sqlalchemy.orm import Session

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://postgres:postgres123secure@localhost:5432/tradelab")

from tradelab_api.db.session import SessionLocal, apply_schema_compatibility, get_engine  # noqa: E402
from tradelab_api.services.testnet_credential_repository import TestnetCredentialRepository as CredentialRepository  # noqa: E402
from tradelab_api.services.testnet_order_cancel import TestnetOrderCancelRequestData, cancel_testnet_order  # noqa: E402
from tradelab_api.services.testnet_order_state_repository import TestnetOrderStateRepository as OrderStateRepository  # noqa: E402

from test_testnet_order_confirm_submit_service import (  # noqa: E402
    RecordingTransport,
    _encrypted_submit_credential,
    _local_dev_provider,
    _preview,
    _submit,
)

apply_schema_compatibility()


class CountingVaultProvider:
    read_count = 0


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


def _submitted_context(
    session: Session,
    *,
    status: str = "submitted",
    local_dev_secret: bool = False,
    reconciliation_required: bool = False,
):
    provider = _local_dev_provider()
    credential = _encrypted_submit_credential(session, provider) if local_dev_secret else None
    preview_id, intent_id = _preview(session, credential_id=credential.id if credential is not None else None)
    submit = _submit(session, preview_id, submit_kill_switch_enabled=False)
    assert submit.status == "submitted"
    repository = OrderStateRepository(session)
    intent = repository.get_intent(intent_id)
    assert intent is not None
    if status != intent.status or reconciliation_required:
        repository.update_intent_status(
            intent,
            status=status,
            reason_code="test_state_override",
            reconciliation_required=reconciliation_required,
            actor="admin",
        )
        session.flush()
    return repository, CredentialRepository(session), intent, session, provider


def _request(order_id, **overrides) -> TestnetOrderCancelRequestData:
    values = dict(
        order_id=order_id,
        confirm_testnet_cancel=True,
        idempotency_key="cancel-click-1",
        reason="user_requested",
        actor="admin",
        submit_kill_switch_enabled=False,
        connector_mode="fake",
    )
    values.update(overrides)
    return TestnetOrderCancelRequestData(**values)


def test_cancel_requires_confirmation_and_idempotency(db_session: Session) -> None:
    repository, credential_repository, intent, *_ = _submitted_context(db_session)

    missing_confirm = cancel_testnet_order(repository, credential_repository, _request(intent.id, confirm_testnet_cancel=False))
    missing_key = cancel_testnet_order(repository, credential_repository, _request(intent.id, idempotency_key=""))

    assert missing_confirm.status == "blocked"
    assert missing_confirm.reason_code == "testnet_order_cancel_confirmation_required"
    assert missing_confirm.semantic_status_code == 400
    assert missing_key.reason_code == "testnet_order_cancel_idempotency_required"


def test_cancel_blocks_non_cancellable_state_before_vault_or_network(db_session: Session) -> None:
    repository, credential_repository, intent, *_ = _submitted_context(db_session, status="filled")
    vault = CountingVaultProvider()

    result = cancel_testnet_order(repository, credential_repository, _request(intent.id), vault_provider=vault)

    assert result.status == "blocked"
    assert result.reason_code == "testnet_order_cancel_state_not_allowed"
    assert vault.read_count == 0


def test_cancel_kill_switch_enabled_still_cancels_fake_order(db_session: Session) -> None:
    repository, credential_repository, intent, *_ = _submitted_context(db_session, status="submitted")

    result = cancel_testnet_order(
        repository,
        credential_repository,
        _request(intent.id, submit_kill_switch_enabled=True, connector_mode="fake"),
    )

    assert result.status == "cancelled"
    assert result.reason_code == "testnet_order_cancel_accepted"
    assert result.intent_status == "cancelled"
    assert repository.get_intent(intent.id).status == "cancelled"


def test_cancel_real_mode_network_disabled_blocks_before_vault(db_session: Session) -> None:
    repository, credential_repository, intent, *_ = _submitted_context(db_session, status="submitted")
    vault = CountingVaultProvider()

    result = cancel_testnet_order(
        repository,
        credential_repository,
        _request(intent.id, connector_mode="real", real_network_enabled=False),
        vault_provider=vault,
    )

    assert result.status == "blocked"
    assert result.reason_code == "testnet_order_cancel_real_network_not_enabled"
    assert vault.read_count == 0


def test_cancel_allows_validated_spot_testnet_credential_with_withdraw_flag(db_session: Session) -> None:
    repository, credential_repository, intent, _session, provider = _submitted_context(db_session, status="submitted", local_dev_secret=True)
    credential = credential_repository.get_credential_ref(intent.credential_ref_id)
    assert credential is not None
    credential.status = "validated_testnet_read_only"
    credential.permission_evidence = {"canTrade": True, "canWithdraw": True, "marginOrFuturesEnabled": False}
    _session.flush()
    result = cancel_testnet_order(
        repository,
        credential_repository,
        _request(intent.id, connector_mode="real", real_network_enabled=True, vault_provider_name="local_dev_encrypted"),
        vault_provider=provider,
        http_client=httpx.Client(transport=RecordingTransport(httpx.Response(200, json={"orderId": 12345, "clientOrderId": intent.client_order_id, "status": "CANCELED", "executedQty": "0", "cummulativeQuoteQty": "0"}))),
    )

    assert result.status == "cancelled"
    assert result.reason_code == "testnet_order_cancel_binance_accepted"


def test_cancel_real_accepted_persists_cancelled_and_sanitized_event(db_session: Session) -> None:
    repository, credential_repository, intent, _session, provider = _submitted_context(
        db_session, status="submitted", local_dev_secret=True
    )
    transport = RecordingTransport(httpx.Response(200, json={"orderId": 12345, "clientOrderId": intent.client_order_id, "status": "CANCELED", "executedQty": "0", "cummulativeQuoteQty": "0"}))
    client = httpx.Client(transport=transport)

    result = cancel_testnet_order(
        repository,
        credential_repository,
        _request(intent.id, connector_mode="real", real_network_enabled=True, vault_provider_name="local_dev_encrypted"),
        vault_provider=provider,
        http_client=client,
    )

    assert result.status == "cancelled"
    assert result.safety_status == "assisted_testnet_cancel_testnet_only"
    assert result.exchange_order_id == "12345"
    assert repository.get_intent(intent.id).status == "cancelled"
    assert "SECRET" not in str([event.metadata_ for event in repository.list_events_for_intent(intent.id)])


def test_cancel_replay_does_not_call_vault_or_network_again(db_session: Session) -> None:
    repository, credential_repository, intent, _session, provider = _submitted_context(
        db_session, status="submitted", local_dev_secret=True
    )
    transport = RecordingTransport(httpx.Response(200, json={"orderId": 12345, "clientOrderId": intent.client_order_id, "status": "CANCELED", "executedQty": "0", "cummulativeQuoteQty": "0"}))
    client = httpx.Client(transport=transport)
    request = _request(intent.id, connector_mode="real", real_network_enabled=True, vault_provider_name="local_dev_encrypted", idempotency_key="cancel-once")

    first = cancel_testnet_order(repository, credential_repository, request, vault_provider=provider, http_client=client)
    second = cancel_testnet_order(repository, credential_repository, request, vault_provider=CountingVaultProvider(), http_client=client)

    assert first.status == "cancelled"
    assert second.reason_code == "testnet_order_cancel_idempotency_replayed"
    assert len(transport.requests) == 1


def test_cancel_not_found_marks_reconciliation_required(db_session: Session) -> None:
    repository, credential_repository, intent, _session, provider = _submitted_context(
        db_session, status="submitted", local_dev_secret=True
    )
    client = httpx.Client(transport=RecordingTransport(httpx.Response(400, json={"code": -2011, "msg": "Unknown order sent."})))

    result = cancel_testnet_order(
        repository,
        credential_repository,
        _request(intent.id, connector_mode="real", real_network_enabled=True, vault_provider_name="local_dev_encrypted"),
        vault_provider=provider,
        http_client=client,
    )

    assert result.status == "reconciliation_required"
    assert repository.get_intent(intent.id).status == "reconciliation_required"
    assert repository.get_intent(intent.id).reconciliation_required is True
