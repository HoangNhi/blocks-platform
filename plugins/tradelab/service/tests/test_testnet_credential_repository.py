from __future__ import annotations

from collections.abc import Iterator
import os

import pytest
from sqlalchemy.orm import Session

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://postgres:postgres123secure@localhost:5432/tradelab")

from tradelab_api.db.models import Base  # noqa: E402
from tradelab_api.db.session import SessionLocal, apply_schema_compatibility, get_engine  # noqa: E402
from tradelab_api.services.testnet_credential_repository import TestnetCredentialRepository as CredentialRepository  # noqa: E402

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


def test_repository_persists_metadata_and_audit_with_redaction(db_session: Session) -> None:
    repository = CredentialRepository(db_session)

    credential = repository.create_credential_ref(
        exchange="binance_spot",
        environment="binance_testnet",
        label="Fake testnet",
        status="stored_testnet_only",
        vault_provider="fake",
        vault_secret_ref="fake://binance_testnet/ref-1",
        api_key_fingerprint=None,
        permission_evidence={"canWithdraw": False},
        metadata={"safe": "yes", "apiSecret": "SECRET-WAS-HERE"},
        actor="admin",
    )
    audit = repository.add_audit_event(
        credential_ref_id=credential.id,
        action="testnet_credential_created",
        actor="admin",
        environment="binance_testnet",
        reason_code="testnet_credential_fake_created",
        idempotency_key_hash="hash-1",
        metadata={"token": "TOKEN-WAS-HERE", "safe": "yes"},
    )

    db_session.flush()
    db_session.refresh(credential)
    db_session.refresh(audit)

    assert credential.metadata_["apiSecret"] == "[REDACTED]"
    assert audit.metadata_["token"] == "[REDACTED]"
    assert repository.get_credential_ref(credential.id) == credential


def test_credential_ref_table_has_no_secret_material_columns() -> None:
    table = Base.metadata.tables["testnet_credential_ref"]
    forbidden = {"api_key", "api_secret", "secret", "password", "passphrase", "private_key", "token"}

    assert forbidden.isdisjoint({column.name for column in table.columns})

def test_repository_persists_encrypted_secret_without_plaintext(db_session: Session) -> None:
    repository = CredentialRepository(db_session)
    credential = repository.create_credential_ref(
        exchange="binance_spot",
        environment="binance_testnet",
        label="Encrypted testnet",
        status="stored_testnet_only",
        vault_provider="local_dev_encrypted",
        vault_secret_ref="local-dev://binance_testnet/ref-1",
        api_key_fingerprint="key-fingerprint",
        permission_evidence={"networkCall": False},
        metadata={"safe": "yes"},
        actor="admin",
    )

    secret = repository.create_secret_row(
        credential_ref_id=credential.id,
        vault_secret_ref="local-dev://binance_testnet/ref-1",
        encrypted_payload="ciphertext-without-plain-values",
        encryption_key_fingerprint="key-fingerprint",
        actor="admin",
    )
    db_session.flush()

    assert repository.get_active_secret_by_ref("local-dev://binance_testnet/ref-1") == secret
    assert "TESTNET-SECRET" not in secret.encrypted_payload


def test_repository_deactivates_active_secret_rows(db_session: Session) -> None:
    repository = CredentialRepository(db_session)
    credential = repository.create_credential_ref(
        exchange="binance_spot",
        environment="binance_testnet",
        label="Encrypted testnet",
        status="stored_testnet_only",
        vault_provider="local_dev_encrypted",
        vault_secret_ref="local-dev://binance_testnet/ref-1",
        api_key_fingerprint="key-fingerprint",
        permission_evidence={},
        metadata={},
        actor="admin",
    )
    repository.create_secret_row(
        credential_ref_id=credential.id,
        vault_secret_ref="local-dev://binance_testnet/ref-1",
        encrypted_payload="ciphertext",
        encryption_key_fingerprint="key-fingerprint",
        actor="admin",
    )

    repository.deactivate_secret_rows(credential_ref_id=credential.id, actor="admin")
    db_session.flush()

    assert repository.get_active_secret_by_ref("local-dev://binance_testnet/ref-1") is None
