from __future__ import annotations

from types import SimpleNamespace
from uuid import UUID, uuid4

from cryptography.fernet import Fernet

from tradelab_api.services.live_credential_vault import (
    FAKE_VAULT_PROVIDER,
    LOCAL_DEV_VAULT_PROVIDER,
)
from tradelab_api.services.live_credential_vault import (
    FakeCredentialVaultProvider,
    LocalDevEncryptedCredentialVaultProvider,
    LiveCredentialCreateRequestData,
    LiveCredentialReadRequestData,
    LiveCredentialRevokeRequestData,
    LiveCredentialSecretRequestData,
    LiveCredentialValidateRequestData,
    build_fake_permission_evidence,
    create_live_credential,
    evaluate_permission_evidence_status,
    hash_idempotency_key,
    read_live_credential_secret_for_internal_purpose,
    revoke_live_credential,
    validate_live_credential,
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
        "tradelab_live_credential_validation_enabled": True,
        "tradelab_environment": "local",
        "tradelab_live_credential_vault_provider": "local_dev_encrypted",
        "tradelab_binance_live_base_url": "https://api.binance.com",
        "tradelab_live_credential_validation_recv_window_ms": 5000,
        "tradelab_live_credential_validation_timeout_seconds": 5.0,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def make_probe_result(*, status="passed", reason_code="live_credential_binance_account_validated", credential_status="validated_live_read_only"):
    return SimpleNamespace(
        status=status,
        reason_code=reason_code,
        credential_status=credential_status,
        safety_status="binance_spot_live_credential_validation_only",
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
        return next((row for row in self.secrets if row.vault_secret_ref == vault_secret_ref and row.is_active and not row.is_deleted), None)

    def deactivate_secret_rows(self, *, credential_ref_id, actor):
        for row in self.secrets:
            if row.credential_ref_id == credential_ref_id and row.is_active and not row.is_deleted:
                row.is_active = False
                row.updated_by = actor


def make_encrypted_credential(repository: MemoryRepository, provider: LocalDevEncryptedCredentialVaultProvider):
    created = create_live_credential(
        repository,
        provider,
        request=LiveCredentialCreateRequestData(
            label="Encrypted",
            confirm_create=True,
            idempotency_key="click-1",
            actor="admin",
            secret=LiveCredentialSecretRequestData(api_key="LIVE-KEY", api_secret="LIVE-SECRET"),
        ),
    )
    return repository.get_credential_ref(UUID(created.credential_ref_id))


def test_fake_provider_creates_reference_without_secret_material() -> None:
    provider = FakeCredentialVaultProvider()

    result = provider.create_secret(label="Live A", actor="admin", idempotency_key="click-1")

    assert result.vault_provider == FAKE_VAULT_PROVIDER
    assert result.vault_secret_ref.startswith("fake://binance_live/")
    assert result.api_key_fingerprint is None


def test_fake_permission_evidence_blocks_withdraw_or_margin() -> None:
    unsafe = build_fake_permission_evidence(can_withdraw=True, margin_or_futures_enabled=False)
    margin = build_fake_permission_evidence(can_withdraw=False, margin_or_futures_enabled=True)
    safe = build_fake_permission_evidence(can_withdraw=False, margin_or_futures_enabled=False)

    assert evaluate_permission_evidence_status(unsafe) == "unsafe_permissions"
    assert evaluate_permission_evidence_status(margin) == "unsafe_permissions"
    assert evaluate_permission_evidence_status(safe) == "stored_live_only"


def test_idempotency_hash_does_not_echo_raw_key() -> None:
    digest = hash_idempotency_key("live-credential:create:click-1")

    assert digest != "live-credential:create:click-1"
    assert len(digest) == 64


def test_local_dev_create_encrypts_secret_and_allows_purpose_gated_read() -> None:
    provider = LocalDevEncryptedCredentialVaultProvider(encryption_key=Fernet.generate_key().decode("ascii"))
    repository = MemoryRepository()

    created = create_live_credential(
        repository,
        provider,
        request=LiveCredentialCreateRequestData(
            label="Encrypted",
            confirm_create=True,
            idempotency_key="click-1",
            actor="admin",
            secret=LiveCredentialSecretRequestData(api_key="LIVE-KEY", api_secret="LIVE-SECRET"),
        ),
    )

    assert created.status == "created"
    assert created.vault_provider == LOCAL_DEV_VAULT_PROVIDER
    assert repository.secrets[0].encrypted_payload
    assert "LIVE-SECRET" not in repository.secrets[0].encrypted_payload

    read = read_live_credential_secret_for_internal_purpose(
        repository,
        provider,
        request=LiveCredentialReadRequestData(
            credential_ref_id=UUID(created.credential_ref_id),
            purpose="phase_20_live_order_submit",
            actor="worker",
            request_id="req-1",
        ),
    )

    assert read.status == "allowed"
    assert read.reason_code == "live_credential_vault_read_allowed"
    assert read.payload == {"apiKey": "LIVE-KEY", "apiSecret": "LIVE-SECRET"}


def test_local_dev_read_blocks_unapproved_purpose() -> None:
    provider = LocalDevEncryptedCredentialVaultProvider(encryption_key=Fernet.generate_key().decode("ascii"))
    repository = MemoryRepository()
    created = create_live_credential(
        repository,
        provider,
        request=LiveCredentialCreateRequestData(
            label="Encrypted",
            confirm_create=True,
            idempotency_key="click-1",
            actor="admin",
            secret=LiveCredentialSecretRequestData(api_key="KEY", api_secret="SECRET"),
        ),
    )

    read = read_live_credential_secret_for_internal_purpose(
        repository,
        provider,
        request=LiveCredentialReadRequestData(
            credential_ref_id=UUID(created.credential_ref_id),
            purpose="connector_startup",
            actor="worker",
            request_id="req-2",
        ),
    )

    assert read.status == "blocked"
    assert read.reason_code == "live_credential_vault_read_blocked"
    assert read.payload is None


def test_validate_real_branch_disabled_blocks_before_probe() -> None:
    provider = LocalDevEncryptedCredentialVaultProvider(encryption_key=Fernet.generate_key().decode("ascii"))
    repository = MemoryRepository()
    credential = make_encrypted_credential(repository, provider)
    validation_client = FakeValidationClient(make_probe_result())

    result = validate_live_credential(
        repository,
        credential.id,
        request=LiveCredentialValidateRequestData(confirm_validate=True, idempotency_key="validate-1"),
        provider=provider,
        validation_client=validation_client,
        settings=validation_settings(tradelab_live_credential_validation_enabled=False),
        request_time_ms=1700000000000,
    )

    assert result.status == "blocked"
    assert result.reason_code == "live_credential_validation_not_enabled"
    assert validation_client.calls == []


def test_validate_real_branch_success_updates_status_and_evidence() -> None:
    provider = LocalDevEncryptedCredentialVaultProvider(encryption_key=Fernet.generate_key().decode("ascii"))
    repository = MemoryRepository()
    credential = make_encrypted_credential(repository, provider)
    validation_client = FakeValidationClient(make_probe_result())

    result = validate_live_credential(
        repository,
        credential.id,
        request=LiveCredentialValidateRequestData(confirm_validate=True, idempotency_key="validate-1"),
        provider=provider,
        validation_client=validation_client,
        settings=validation_settings(),
        request_time_ms=1700000000000,
    )

    assert result.status == "validated"
    assert result.safety_status == "binance_spot_live_credential_validation_only"
    assert credential.status == "validated_live_read_only"
    assert credential.last_validation_status == "passed"
    assert validation_client.calls[0]["api_secret"] == "LIVE-SECRET"


def test_validate_real_branch_can_recover_from_previous_unsafe_status() -> None:
    provider = LocalDevEncryptedCredentialVaultProvider(encryption_key=Fernet.generate_key().decode("ascii"))
    repository = MemoryRepository()
    credential = make_encrypted_credential(repository, provider)
    credential.status = "unsafe_permissions"
    validation_client = FakeValidationClient(make_probe_result())

    result = validate_live_credential(
        repository,
        credential.id,
        request=LiveCredentialValidateRequestData(confirm_validate=True, idempotency_key="validate-unsafe-retry"),
        provider=provider,
        validation_client=validation_client,
        settings=validation_settings(),
        request_time_ms=1700000000000,
    )

    assert result.status == "validated"
    assert credential.status == "validated_live_read_only"
    assert validation_client.calls[0]["api_secret"] == "LIVE-SECRET"


def test_revoke_deactivates_local_dev_secret_and_blocks_read() -> None:
    provider = LocalDevEncryptedCredentialVaultProvider(encryption_key=Fernet.generate_key().decode("ascii"))
    repository = MemoryRepository()
    created = create_live_credential(
        repository,
        provider,
        request=LiveCredentialCreateRequestData(
            label="Encrypted",
            confirm_create=True,
            idempotency_key="click-1",
            actor="admin",
            secret=LiveCredentialSecretRequestData(api_key="KEY", api_secret="SECRET"),
        ),
    )

    revoked = revoke_live_credential(
        repository,
        provider,
        UUID(created.credential_ref_id),
        request=LiveCredentialRevokeRequestData(confirm_revoke=True, idempotency_key="revoke-1", actor="admin"),
    )
    read = read_live_credential_secret_for_internal_purpose(
        repository,
        provider,
        request=LiveCredentialReadRequestData(
            credential_ref_id=UUID(created.credential_ref_id),
            purpose="phase_20_live_order_submit",
            actor="worker",
            request_id="req-1",
        ),
    )

    assert revoked.status == "revoked"
    assert read.status == "blocked"
    assert repository.secrets[0].is_active is False
