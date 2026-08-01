from __future__ import annotations

from collections.abc import Iterator
import os

import httpx
import pytest
from sqlalchemy.orm import Session

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://postgres:postgres123secure@localhost:5432/tradelab")

from tradelab_api.db.session import SessionLocal, apply_schema_compatibility, get_engine  # noqa: E402
from tradelab_api.services.testnet_credential_repository import TestnetCredentialRepository as CredentialRepository  # noqa: E402
from tradelab_api.services.testnet_order_reconcile import TestnetOrderReconcileRequestData, reconcile_testnet_order  # noqa: E402
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
    status: str = "unknown",
    local_dev_secret: bool = False,
    reconciliation_required: bool = True,
):
    provider = _local_dev_provider()
    credential = _encrypted_submit_credential(session, provider) if local_dev_secret else None
    preview_id, intent_id = _preview(session, credential_id=credential.id if credential is not None else None)
    submit = _submit(session, preview_id, submit_kill_switch_enabled=False)
    assert submit.status == "submitted"
    repository = OrderStateRepository(session)
    intent = repository.get_intent(intent_id)
    assert intent is not None
    if status != intent.status or reconciliation_required != intent.reconciliation_required:
        repository.update_intent_status(
            intent,
            status=status,
            reason_code="test_state_override",
            reconciliation_required=reconciliation_required,
            actor="admin",
        )
        session.flush()
    return repository, CredentialRepository(session), intent, session, provider


def _request(order_id, **overrides) -> TestnetOrderReconcileRequestData:
    values = dict(
        order_id=order_id,
        confirm_testnet_reconcile=True,
        trigger="manual",
        actor="admin",
        submit_kill_switch_enabled=True,
        connector_mode="fake",
    )
    values.update(overrides)
    return TestnetOrderReconcileRequestData(**values)


def test_reconcile_requires_confirmation(db_session: Session) -> None:
    repository, credential_repository, intent, *_ = _submitted_context(db_session)

    result = reconcile_testnet_order(repository, credential_repository, _request(intent.id, confirm_testnet_reconcile=False))

    assert result.status == "blocked"
    assert result.reason_code == "testnet_order_reconcile_confirmation_required"
    assert result.semantic_status_code == 400


def test_reconcile_blocks_non_reconcilable_state_before_vault_or_network(db_session: Session) -> None:
    repository, credential_repository, intent, *_ = _submitted_context(db_session, status="filled", reconciliation_required=False)
    vault = CountingVaultProvider()

    result = reconcile_testnet_order(repository, credential_repository, _request(intent.id), vault_provider=vault)

    assert result.status == "blocked"
    assert result.reason_code == "testnet_order_reconcile_state_not_allowed"
    assert vault.read_count == 0


def test_reconcile_kill_switch_enabled_still_recovers_fake_order(db_session: Session) -> None:
    repository, credential_repository, intent, *_ = _submitted_context(db_session, status="unknown")

    result = reconcile_testnet_order(repository, credential_repository, _request(intent.id, submit_kill_switch_enabled=True))

    assert result.status == "reconciliation_required"
    assert result.reason_code == "testnet_order_reconciliation_required"
    assert result.intent_status == "reconciliation_required"
    assert repository.list_reconciliation_attempts_for_intent(intent.id)[0].status == "ambiguous"


def test_reconcile_real_mode_network_disabled_blocks_before_vault(db_session: Session) -> None:
    repository, credential_repository, intent, *_ = _submitted_context(db_session, status="unknown")
    vault = CountingVaultProvider()

    result = reconcile_testnet_order(
        repository,
        credential_repository,
        _request(intent.id, connector_mode="real", real_network_enabled=False),
        vault_provider=vault,
    )

    assert result.status == "blocked"
    assert result.reason_code == "testnet_order_reconcile_real_network_not_enabled"
    assert vault.read_count == 0


def test_reconcile_real_matched_persists_attempt_and_sanitized_event(db_session: Session) -> None:
    repository, credential_repository, intent, _session, provider = _submitted_context(
        db_session, status="unknown", local_dev_secret=True
    )
    transport = RecordingTransport(
        httpx.Response(
            200,
            json={
                "orderId": 12345,
                "clientOrderId": intent.client_order_id,
                "status": "FILLED",
                "executedQty": "0.01",
                "cummulativeQuoteQty": "600",
            },
        )
    )
    client = httpx.Client(transport=transport)

    result = reconcile_testnet_order(
        repository,
        credential_repository,
        _request(intent.id, connector_mode="real", real_network_enabled=True, vault_provider_name="local_dev_encrypted"),
        vault_provider=provider,
        http_client=client,
    )

    attempts = repository.list_reconciliation_attempts_for_intent(intent.id)
    assert result.status == "filled"
    assert result.reason_code == "testnet_order_reconcile_binance_matched"
    assert result.reconciliation_attempt_id == str(attempts[0].id)
    assert attempts[0].status == "matched"
    assert repository.get_intent(intent.id).status == "filled"
    assert "SECRET" not in str([event.metadata_ for event in repository.list_events_for_intent(intent.id)])


def test_reconcile_allows_validated_spot_testnet_credential_with_withdraw_flag(db_session: Session) -> None:
    repository, credential_repository, intent, _session, provider = _submitted_context(
        db_session, status="unknown", local_dev_secret=True
    )
    credential = credential_repository.get_credential_ref(intent.credential_ref_id)
    assert credential is not None
    credential.status = "validated_testnet_read_only"
    credential.permission_evidence = {"canTrade": True, "canWithdraw": True, "marginOrFuturesEnabled": False}
    _session.flush()
    client = httpx.Client(
        transport=RecordingTransport(
            httpx.Response(
                200,
                json={
                    "orderId": 12345,
                    "clientOrderId": intent.client_order_id,
                    "status": "FILLED",
                    "executedQty": "0.01",
                    "cummulativeQuoteQty": "600",
                },
            )
        )
    )

    result = reconcile_testnet_order(
        repository,
        credential_repository,
        _request(intent.id, connector_mode="real", real_network_enabled=True, vault_provider_name="local_dev_encrypted"),
        vault_provider=provider,
        http_client=client,
    )

    assert result.status == "filled"
    assert result.reason_code == "testnet_order_reconcile_binance_matched"


def test_reconcile_not_found_remains_reconciliation_required(db_session: Session) -> None:
    repository, credential_repository, intent, _session, provider = _submitted_context(
        db_session, status="unknown", local_dev_secret=True
    )
    client = httpx.Client(transport=RecordingTransport(httpx.Response(400, json={"code": -2013, "msg": "Order does not exist."})))

    result = reconcile_testnet_order(
        repository,
        credential_repository,
        _request(intent.id, connector_mode="real", real_network_enabled=True, vault_provider_name="local_dev_encrypted"),
        vault_provider=provider,
        http_client=client,
    )

    assert result.status == "reconciliation_required"
    assert result.reason_code == "testnet_order_reconcile_binance_not_found"
    assert repository.get_intent(intent.id).reconciliation_required is True
