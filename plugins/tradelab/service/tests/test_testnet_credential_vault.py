from __future__ import annotations

from types import SimpleNamespace
from uuid import UUID, uuid4

from cryptography.fernet import Fernet
import pytest

from tradelab_api.services.testnet_credential_vault import (
    FakeCredentialVaultProvider,
    LOCAL_DEV_VAULT_PROVIDER,
    TESTNET_CREDENTIAL_LOCAL_DEV_SAFETY_STATUS,
    LocalDevEncryptedCredentialVaultProvider,
    TestnetCredentialCreateRequestData,
    TestnetCredentialReadRequestData,
    TestnetCredentialRevokeRequestData,
    TestnetCredentialSecretRequestData,
    TestnetCredentialValidateRequestData,
    build_fake_permission_evidence,
    create_testnet_credential,
    evaluate_permission_evidence_status,
    hash_idempotency_key,
    read_testnet_credential_secret_for_internal_purpose,
    revoke_testnet_credential,
    validate_testnet_credential,
)

class FakeValidationClient:
    def __init__(self, result) -> None:
        self.result = result
        self.calls = []

    def validate_account(self, **kwargs):
        self.calls.append(kwargs)
        return self.result

def validation_settings(**overrides):
    values = {
        "tradelab_testnet_credential_validation_enabled": True,
        "tradelab_environment": "local",
        "tradelab_testnet_credential_vault_provider": "local_dev_encrypted",
        "tradelab_binance_testnet_base_url": "https://testnet.binance.vision",
        "tradelab_testnet_credential_validation_recv_window_ms": 5000,
        "tradelab_testnet_credential_validation_timeout_seconds": 5.0,
    }
    values.update(overrides)
    return SimpleNamespace(**values)

def make_probe_result(*, status="passed", reason_code="testnet_credential_binance_account_validated", credential_status="validated_testnet_read_only"):
    return SimpleNamespace(
        status=status,
        reason_code=reason_code,
        credential_status=credential_status,
        safety_status="binance_spot_testnet_credential_validation_only",
        evidence={"networkCall": True, "endpoint": "GET /api/v3/account", "canWithdraw": credential_status == "unsafe_permissions"},
        details={},
    )



class MemoryRow:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


class MemoryRepository:
    def __init__(self) -> None:
        self.credentials = []
        self.secrets = []
        self.audits = []

    def create_credential_ref(self, **kwargs):
        if "metadata" in kwargs:
            kwargs["metadata_"] = kwargs.pop("metadata")
        row = MemoryRow(id=uuid4(), is_active=True, is_deleted=False, **kwargs)
        self.credentials.append(row)
        return row

    def add_audit_event(self, **kwargs):
        row = MemoryRow(id=uuid4(), **kwargs)
        self.audits.append(row)
        return row

    def create_secret_row(self, **kwargs):
        row = MemoryRow(id=uuid4(), vault_provider=LOCAL_DEV_VAULT_PROVIDER, is_active=True, is_deleted=False, **kwargs)
        self.secrets.append(row)
        return row

    def get_credential_ref(self, credential_ref_id):
        return next((row for row in self.credentials if row.id == credential_ref_id), None)

    def get_active_secret_by_ref(self, vault_secret_ref):
        return next(
            (
                row
                for row in self.secrets
                if row.vault_secret_ref == vault_secret_ref and row.is_active and not row.is_deleted
            ),
            None,
        )

    def deactivate_secret_rows(self, *, credential_ref_id, actor):
        for row in self.secrets:
            if row.credential_ref_id == credential_ref_id and row.is_active and not row.is_deleted:
                row.is_active = False
                row.updated_by = actor

def make_encrypted_credential(repository: MemoryRepository, provider: LocalDevEncryptedCredentialVaultProvider):
    created = create_testnet_credential(
        repository,
        provider,
        request=TestnetCredentialCreateRequestData(
            label="Encrypted",
            confirm_create=True,
            idempotency_key="click-1",
            actor="admin",
            secret=TestnetCredentialSecretRequestData(api_key="TESTNET-KEY", api_secret="TESTNET-SECRET"),
        ),
    )
    return repository.get_credential_ref(UUID(created.credential_ref_id))

def test_fake_provider_creates_reference_without_secret_material() -> None:
    provider = FakeCredentialVaultProvider()

    result = provider.create_secret(label="Testnet A", actor="admin", idempotency_key="click-1")

    assert result.vault_provider == "fake"
    assert result.vault_secret_ref.startswith("fake://binance_testnet/")
    assert result.api_key_fingerprint is None
    assert "secret" not in result.vault_secret_ref.lower()


def test_fake_permission_evidence_allows_withdraw_flag_for_spot_testnet() -> None:
    withdraw_flag = build_fake_permission_evidence(can_withdraw=True, margin_or_futures_enabled=False)
    margin = build_fake_permission_evidence(can_withdraw=False, margin_or_futures_enabled=True)
    safe = build_fake_permission_evidence(can_withdraw=False, margin_or_futures_enabled=False)

    assert evaluate_permission_evidence_status(withdraw_flag) == "stored_testnet_only"
    assert evaluate_permission_evidence_status(margin) == "unsafe_permissions"
    assert evaluate_permission_evidence_status(safe) == "stored_testnet_only"


def test_idempotency_hash_does_not_echo_raw_key() -> None:
    digest = hash_idempotency_key("testnet-credential:create:click-1")

    assert digest != "testnet-credential:create:click-1"
    assert len(digest) == 64


def test_local_dev_create_encrypts_secret_and_allows_purpose_gated_read() -> None:
    provider = LocalDevEncryptedCredentialVaultProvider(encryption_key=Fernet.generate_key().decode("ascii"))
    repository = MemoryRepository()

    created = create_testnet_credential(
        repository,
        provider,
        request=TestnetCredentialCreateRequestData(
            label="Encrypted",
            confirm_create=True,
            idempotency_key="click-1",
            actor="admin",
            secret=TestnetCredentialSecretRequestData(api_key="TESTNET-KEY", api_secret="TESTNET-SECRET"),
        ),
    )

    assert created.status == "created"
    assert created.reason_code == "testnet_credential_secret_encrypted"
    assert created.safety_status == TESTNET_CREDENTIAL_LOCAL_DEV_SAFETY_STATUS
    assert created.vault_provider == LOCAL_DEV_VAULT_PROVIDER
    assert repository.secrets[0].encrypted_payload
    assert "TESTNET-SECRET" not in repository.secrets[0].encrypted_payload
    assert "encryptedPayload" not in repository.credentials[0].metadata_["providerMetadata"]

    read = read_testnet_credential_secret_for_internal_purpose(
        repository,
        provider,
        request=TestnetCredentialReadRequestData(
            credential_ref_id=UUID(created.credential_ref_id),
            purpose="phase_18_4_verification_probe",
            actor="worker",
            request_id="req-1",
        ),
    )

    assert read.status == "allowed"
    assert read.reason_code == "testnet_credential_vault_read_allowed"
    assert read.payload == {"apiKey": "TESTNET-KEY", "apiSecret": "TESTNET-SECRET"}
    assert any(audit.action == "testnet_credential_vault_read_allowed" for audit in repository.audits)


def test_local_dev_read_blocks_unapproved_purpose() -> None:
    provider = LocalDevEncryptedCredentialVaultProvider(encryption_key=Fernet.generate_key().decode("ascii"))
    repository = MemoryRepository()
    created = create_testnet_credential(
        repository,
        provider,
        request=TestnetCredentialCreateRequestData(
            label="Encrypted",
            confirm_create=True,
            idempotency_key="click-1",
            actor="admin",
            secret=TestnetCredentialSecretRequestData(api_key="KEY", api_secret="SECRET"),
        ),
    )

    read = read_testnet_credential_secret_for_internal_purpose(
        repository,
        provider,
        request=TestnetCredentialReadRequestData(
            credential_ref_id=UUID(created.credential_ref_id),
            purpose="connector_startup",
            actor="worker",
            request_id="req-2",
        ),
    )

    assert read.status == "blocked"
    assert read.reason_code == "testnet_credential_vault_read_blocked"
    assert read.payload is None







def test_revoke_deactivates_local_dev_secret_and_blocks_read() -> None:
    provider = LocalDevEncryptedCredentialVaultProvider(encryption_key=Fernet.generate_key().decode("ascii"))
    repository = MemoryRepository()
    created = create_testnet_credential(
        repository,
        provider,
        request=TestnetCredentialCreateRequestData(
            label="Encrypted",
            confirm_create=True,
            idempotency_key="click-1",
            actor="admin",
            secret=TestnetCredentialSecretRequestData(api_key="KEY", api_secret="SECRET"),
        ),
    )

    revoked = revoke_testnet_credential(
        repository,
        provider,
        UUID(created.credential_ref_id),
        request=TestnetCredentialRevokeRequestData(confirm_revoke=True, idempotency_key="revoke-1", actor="admin"),
    )
    read = read_testnet_credential_secret_for_internal_purpose(
        repository,
        provider,
        request=TestnetCredentialReadRequestData(
            credential_ref_id=UUID(created.credential_ref_id),
            purpose="phase_18_4_verification_probe",
            actor="worker",
            request_id="req-1",
        ),
    )

    assert revoked.status == "revoked"
    assert read.status == "blocked"
    assert read.reason_code == "testnet_credential_vault_read_blocked"
    assert repository.secrets[0].is_active is False

def test_phase_18_5_read_purpose_is_allowed_and_audit_is_sanitized() -> None:
    provider = LocalDevEncryptedCredentialVaultProvider(encryption_key=Fernet.generate_key().decode("ascii"))
    repository = MemoryRepository()
    credential = make_encrypted_credential(repository, provider)

    read = read_testnet_credential_secret_for_internal_purpose(
        repository,
        provider,
        request=TestnetCredentialReadRequestData(
            credential_ref_id=credential.id,
            purpose="phase_18_5_binance_testnet_validation",
            actor="validator",
            request_id="req-18-5",
        ),
    )

    assert read.status == "allowed"
    assert read.payload == {"apiKey": "TESTNET-KEY", "apiSecret": "TESTNET-SECRET"}
    assert "TESTNET-SECRET" not in str([audit.__dict__ for audit in repository.audits])

def test_validate_real_branch_disabled_blocks_before_probe() -> None:
    provider = LocalDevEncryptedCredentialVaultProvider(encryption_key=Fernet.generate_key().decode("ascii"))
    repository = MemoryRepository()
    credential = make_encrypted_credential(repository, provider)
    validation_client = FakeValidationClient(make_probe_result())

    result = validate_testnet_credential(
        repository,
        credential.id,
        request=TestnetCredentialValidateRequestData(confirm_validate=True, idempotency_key="validate-1"),
        provider=provider,
        validation_client=validation_client,
        settings=validation_settings(tradelab_testnet_credential_validation_enabled=False),
        request_time_ms=1700000000000,
    )

    assert result.status == "blocked"
    assert result.reason_code == "testnet_credential_validation_not_enabled"
    assert validation_client.calls == []

def test_validate_real_branch_success_updates_status_and_evidence() -> None:
    provider = LocalDevEncryptedCredentialVaultProvider(encryption_key=Fernet.generate_key().decode("ascii"))
    repository = MemoryRepository()
    credential = make_encrypted_credential(repository, provider)
    validation_client = FakeValidationClient(make_probe_result())

    result = validate_testnet_credential(
        repository,
        credential.id,
        request=TestnetCredentialValidateRequestData(confirm_validate=True, idempotency_key="validate-1"),
        provider=provider,
        validation_client=validation_client,
        settings=validation_settings(),
        request_time_ms=1700000000000,
    )

    assert result.status == "validated"
    assert result.safety_status == "binance_spot_testnet_credential_validation_only"
    assert credential.status == "validated_testnet_read_only"
    assert credential.last_validation_status == "passed"
    assert credential.permission_evidence["endpoint"] == "GET /api/v3/account"
    assert validation_client.calls[0]["api_secret"] == "TESTNET-SECRET"

def test_validate_real_branch_unsafe_probe_blocks_status() -> None:
    provider = LocalDevEncryptedCredentialVaultProvider(encryption_key=Fernet.generate_key().decode("ascii"))
    repository = MemoryRepository()
    credential = make_encrypted_credential(repository, provider)
    validation_client = FakeValidationClient(
        make_probe_result(
            status="blocked",
            reason_code="testnet_credential_unsafe_permissions",
            credential_status="unsafe_permissions",
        )
    )

    result = validate_testnet_credential(
        repository,
        credential.id,
        request=TestnetCredentialValidateRequestData(confirm_validate=True, idempotency_key="validate-1"),
        provider=provider,
        validation_client=validation_client,
        settings=validation_settings(),
        request_time_ms=1700000000000,
    )

    assert result.status == "blocked"
    assert credential.status == "unsafe_permissions"
    assert credential.last_validation_status == "blocked"

def test_validate_real_branch_fake_provider_is_not_supported() -> None:
    provider = FakeCredentialVaultProvider()
    repository = MemoryRepository()
    credential = repository.create_credential_ref(
        exchange="binance_spot",
        environment="binance_testnet",
        label="Fake",
        status="stored_testnet_only",
        vault_provider="fake",
        vault_secret_ref="fake://binance_testnet/1",
        api_key_fingerprint=None,
        permission_evidence={},
        metadata={},
        actor="admin",
    )
    validation_client = FakeValidationClient(make_probe_result())

    result = validate_testnet_credential(
        repository,
        credential.id,
        request=TestnetCredentialValidateRequestData(confirm_validate=True, idempotency_key="validate-1"),
        provider=provider,
        validation_client=validation_client,
        settings=validation_settings(),
        request_time_ms=1700000000000,
    )

    assert result.status == "blocked"
    assert result.reason_code == "testnet_credential_validation_provider_not_supported"
    assert validation_client.calls == []


def test_phase_19_3b_submit_read_purpose_is_allowed_and_sanitized() -> None:
    provider = LocalDevEncryptedCredentialVaultProvider(encryption_key=Fernet.generate_key().decode("ascii"))
    repository = MemoryRepository()
    credential = make_encrypted_credential(repository, provider)

    read = read_testnet_credential_secret_for_internal_purpose(
        repository,
        provider,
        request=TestnetCredentialReadRequestData(
            credential_ref_id=credential.id,
            purpose="phase_19_3b_testnet_order_submit",
            actor="submit-worker",
            request_id="intent-1:preview-1",
        ),
    )

    assert read.status == "allowed"
    assert read.reason_code == "testnet_credential_vault_read_allowed"
    assert read.payload == {"apiKey": "TESTNET-KEY", "apiSecret": "TESTNET-SECRET"}
    assert "TESTNET-SECRET" not in str([audit.__dict__ for audit in repository.audits])
    assert any(audit.metadata.get("purpose") == "phase_19_3b_testnet_order_submit" for audit in repository.audits)


def test_phase_19_3b_submit_read_blocks_fake_provider() -> None:
    provider = FakeCredentialVaultProvider()
    repository = MemoryRepository()
    credential = repository.create_credential_ref(
        exchange="binance_spot",
        environment="binance_testnet",
        label="Fake",
        status="stored_testnet_only",
        vault_provider="fake",
        vault_secret_ref="fake://binance_testnet/1",
        api_key_fingerprint=None,
        permission_evidence={},
        metadata={},
        actor="admin",
    )

    read = read_testnet_credential_secret_for_internal_purpose(
        repository,
        provider,
        request=TestnetCredentialReadRequestData(
            credential_ref_id=credential.id,
            purpose="phase_19_3b_testnet_order_submit",
            actor="submit-worker",
            request_id="intent-1:preview-1",
        ),
    )

    assert read.status == "blocked"
    assert read.reason_code == "testnet_credential_vault_read_blocked"
    assert read.payload is None


@pytest.mark.parametrize(
    "purpose",
    [
        "phase_19_4_testnet_order_cancel",
        "phase_19_4_testnet_order_reconcile",
    ],
)
def test_phase_19_4_cancel_reconcile_read_purposes_are_allowed_and_sanitized(purpose: str) -> None:
    provider = LocalDevEncryptedCredentialVaultProvider(encryption_key=Fernet.generate_key().decode("ascii"))
    repository = MemoryRepository()
    credential = make_encrypted_credential(repository, provider)

    read = read_testnet_credential_secret_for_internal_purpose(
        repository,
        provider,
        request=TestnetCredentialReadRequestData(
            credential_ref_id=credential.id,
            purpose=purpose,
            actor="admin",
            request_id=f"intent-1:{purpose}",
        ),
    )

    assert read.status == "allowed"
    assert read.payload == {"apiKey": "TESTNET-KEY", "apiSecret": "TESTNET-SECRET"}
    assert any(audit.metadata.get("purpose") == purpose for audit in repository.audits)
    assert "TESTNET-SECRET" not in str([audit.__dict__ for audit in repository.audits])

