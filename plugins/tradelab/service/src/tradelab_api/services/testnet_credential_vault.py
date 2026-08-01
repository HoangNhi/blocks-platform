from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import hashlib
from typing import Any, Protocol
from uuid import UUID, uuid4

from tradelab_api.services.credential_redaction import find_secret_like_fields, sanitize_credential_payload
from tradelab_api.services.local_dev_credential_crypto import (
    LocalDevCredentialCrypto,
    LocalDevCredentialCryptoError,
    fingerprint_value,
)

TESTNET_CREDENTIAL_SAFETY_STATUS = "fake_testnet_credential_vault_only"
TESTNET_CREDENTIAL_LOCAL_DEV_SAFETY_STATUS = "local_dev_encrypted_testnet_credential_vault_only"
TESTNET_CREDENTIAL_ENVIRONMENT = "binance_testnet"
TESTNET_CREDENTIAL_EXCHANGE = "binance_spot"
FAKE_VAULT_PROVIDER = "fake"
LOCAL_DEV_VAULT_PROVIDER = "local_dev_encrypted"
PHASE_18_4_VERIFICATION_PURPOSE = "phase_18_4_verification_probe"
PHASE_18_5_VALIDATION_PURPOSE = "phase_18_5_binance_testnet_validation"
PHASE_19_3B_SUBMIT_PURPOSE = "phase_19_3b_testnet_order_submit"
PHASE_19_4_CANCEL_PURPOSE = "phase_19_4_testnet_order_cancel"
PHASE_19_4_RECONCILE_PURPOSE = "phase_19_4_testnet_order_reconcile"
ALLOWED_TESTNET_CREDENTIAL_READ_PURPOSES = {
    PHASE_18_4_VERIFICATION_PURPOSE,
    PHASE_18_5_VALIDATION_PURPOSE,
    PHASE_19_3B_SUBMIT_PURPOSE,
    PHASE_19_4_CANCEL_PURPOSE,
    PHASE_19_4_RECONCILE_PURPOSE,
}
BLOCKED_READ_STATUSES = {"revoked", "unsafe_permissions", "vault_unavailable"}


class TestnetCredentialValidationError(ValueError):
    def __init__(self, reason_code: str, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.reason_code = reason_code
        self.status_code = status_code


@dataclass(frozen=True)
class VaultSecretWriteResult:
    vault_provider: str
    vault_secret_ref: str
    api_key_fingerprint: str | None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class TestnetCredentialSecretRequestData:
    api_key: str
    api_secret: str


@dataclass(frozen=True)
class TestnetCredentialReadRequestData:
    credential_ref_id: UUID
    purpose: str
    actor: str = "local-user"
    request_id: str | None = None


@dataclass(frozen=True)
class TestnetCredentialReadResult:
    status: str
    reason_code: str
    payload: dict[str, str] | None = None
    audit_event_ids: list[str] = field(default_factory=list)
    semantic_status_code: int = 200


class CredentialVaultProvider(Protocol):
    def create_secret(
        self,
        *,
        label: str,
        actor: str,
        idempotency_key: str,
        secret: TestnetCredentialSecretRequestData | None = None,
    ) -> VaultSecretWriteResult: ...

    def rotate_secret(
        self,
        *,
        vault_secret_ref: str,
        actor: str,
        idempotency_key: str,
        secret: TestnetCredentialSecretRequestData | None = None,
    ) -> VaultSecretWriteResult: ...

    def read_secret_for_connector(self, *, vault_secret_ref: str, purpose: str, actor: str) -> None: ...
    def revoke_secret(self, *, vault_secret_ref: str, actor: str) -> dict[str, Any]: ...


class FakeCredentialVaultProvider:
    def create_secret(
        self,
        *,
        label: str,
        actor: str,
        idempotency_key: str,
        secret: TestnetCredentialSecretRequestData | None = None,
    ) -> VaultSecretWriteResult:
        if secret is not None:
            raise TestnetCredentialValidationError(
                "testnet_credential_secret_not_allowed",
                "Fake credential vault does not accept secret material.",
                status_code=400,
            )
        return VaultSecretWriteResult(
            vault_provider=FAKE_VAULT_PROVIDER,
            vault_secret_ref=f"fake://binance_testnet/{uuid4()}",
            api_key_fingerprint=None,
            metadata=sanitize_credential_payload({"label": label, "actor": actor, "fakeOnly": True}),
        )

    def rotate_secret(
        self,
        *,
        vault_secret_ref: str,
        actor: str,
        idempotency_key: str,
        secret: TestnetCredentialSecretRequestData | None = None,
    ) -> VaultSecretWriteResult:
        if secret is not None:
            raise TestnetCredentialValidationError(
                "testnet_credential_secret_not_allowed",
                "Fake credential vault does not accept secret material.",
                status_code=400,
            )
        return VaultSecretWriteResult(
            vault_provider=FAKE_VAULT_PROVIDER,
            vault_secret_ref=f"fake://binance_testnet/{uuid4()}",
            api_key_fingerprint=None,
            metadata=sanitize_credential_payload({"previousVaultSecretRef": vault_secret_ref, "actor": actor, "fakeOnly": True}),
        )

    def read_secret_for_connector(self, *, vault_secret_ref: str, purpose: str, actor: str) -> None:
        raise TestnetCredentialValidationError(
            "testnet_credential_vault_read_blocked",
            "Fake credential vault does not expose connector secrets.",
            status_code=403,
        )

    def revoke_secret(self, *, vault_secret_ref: str, actor: str) -> dict[str, Any]:
        return sanitize_credential_payload({"vaultSecretRef": vault_secret_ref, "actor": actor, "fakeOnly": True})


class LocalDevEncryptedCredentialVaultProvider:
    def __init__(self, *, encryption_key: str) -> None:
        self._crypto = LocalDevCredentialCrypto(encryption_key)

    def create_secret(
        self,
        *,
        label: str,
        actor: str,
        idempotency_key: str,
        secret: TestnetCredentialSecretRequestData | None = None,
    ) -> VaultSecretWriteResult:
        if secret is None:
            raise TestnetCredentialValidationError(
                "testnet_credential_secret_required",
                "Local/dev encrypted testnet credential requires apiKey and apiSecret.",
                status_code=400,
            )
        encrypted_payload = self._crypto.encrypt_payload(api_key=secret.api_key, api_secret=secret.api_secret)
        return VaultSecretWriteResult(
            vault_provider=LOCAL_DEV_VAULT_PROVIDER,
            vault_secret_ref=f"local-dev://binance_testnet/{uuid4()}",
            api_key_fingerprint=fingerprint_value(secret.api_key),
            metadata={
                "localDevEncrypted": True,
                "encryptedPayload": encrypted_payload,
                "encryptionKeyFingerprint": self._crypto.key_fingerprint,
            },
        )

    def rotate_secret(
        self,
        *,
        vault_secret_ref: str,
        actor: str,
        idempotency_key: str,
        secret: TestnetCredentialSecretRequestData | None = None,
    ) -> VaultSecretWriteResult:
        return self.create_secret(label="rotation", actor=actor, idempotency_key=idempotency_key, secret=secret)

    def decrypt_secret_payload(self, encrypted_payload: str) -> dict[str, str]:
        payload = self._crypto.decrypt_payload(encrypted_payload)
        return {"apiKey": payload["apiKey"], "apiSecret": payload["apiSecret"]}

    def read_secret_for_connector(self, *, vault_secret_ref: str, purpose: str, actor: str) -> None:
        raise TestnetCredentialValidationError(
            "testnet_credential_vault_read_blocked",
            "Local/dev encrypted credential reads require purpose-gated internal service access.",
            status_code=403,
        )

    def revoke_secret(self, *, vault_secret_ref: str, actor: str) -> dict[str, Any]:
        return sanitize_credential_payload({"vaultSecretRef": vault_secret_ref, "actor": actor, "localDevEncrypted": True})


@dataclass(frozen=True)
class TestnetCredentialCreateRequestData:
    label: str
    confirm_create: bool
    idempotency_key: str
    actor: str = "local-user"
    metadata: dict[str, Any] = field(default_factory=dict)
    secret: TestnetCredentialSecretRequestData | None = None


@dataclass(frozen=True)
class TestnetCredentialValidateRequestData:
    confirm_validate: bool
    idempotency_key: str
    actor: str = "local-user"
    fake_can_withdraw: bool = False
    fake_margin_or_futures_enabled: bool = False


@dataclass(frozen=True)
class TestnetCredentialRotateRequestData:
    confirm_rotate: bool
    idempotency_key: str
    actor: str = "local-user"
    secret: TestnetCredentialSecretRequestData | None = None


@dataclass(frozen=True)
class TestnetCredentialRevokeRequestData:
    confirm_revoke: bool
    idempotency_key: str
    actor: str = "local-user"


@dataclass(frozen=True)
class TestnetCredentialMutationResult:
    status: str
    reason_code: str
    safety_status: str = TESTNET_CREDENTIAL_SAFETY_STATUS
    credential_ref_id: str | None = None
    label: str | None = None
    vault_provider: str | None = None
    vault_secret_ref: str | None = None
    credential_status: str | None = None
    audit_event_ids: list[str] = field(default_factory=list)
    details: dict[str, Any] = field(default_factory=dict)
    should_commit: bool = False
    semantic_status_code: int = 200


def hash_idempotency_key(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def build_fake_permission_evidence(*, can_withdraw: bool, margin_or_futures_enabled: bool) -> dict[str, Any]:
    return {
        "provider": FAKE_VAULT_PROVIDER,
        "environment": TESTNET_CREDENTIAL_ENVIRONMENT,
        "canWithdraw": can_withdraw,
        "marginOrFuturesEnabled": margin_or_futures_enabled,
        "networkCall": False,
    }


def evaluate_permission_evidence_status(evidence: dict[str, Any]) -> str:
    if evidence.get("marginOrFuturesEnabled"):
        return "unsafe_permissions"
    return "stored_testnet_only"


def _blocked_secret_result(fields: list[str]) -> TestnetCredentialMutationResult:
    return TestnetCredentialMutationResult(
        status="blocked",
        reason_code="testnet_credential_secret_not_allowed",
        details={"blockedFields": fields},
        should_commit=False,
        semantic_status_code=400,
    )


def _provider_metadata_without_secret(metadata: dict[str, Any]) -> dict[str, Any]:
    return sanitize_credential_payload({key: value for key, value in metadata.items() if key != "encryptedPayload"})


def _encrypted_payload_from_write(write: VaultSecretWriteResult) -> str | None:
    encrypted_payload = write.metadata.get("encryptedPayload")
    if isinstance(encrypted_payload, str) and encrypted_payload:
        return encrypted_payload
    return None


def _safety_status_for_provider(provider_name: str) -> str:
    if provider_name == LOCAL_DEV_VAULT_PROVIDER:
        return TESTNET_CREDENTIAL_LOCAL_DEV_SAFETY_STATUS
    return TESTNET_CREDENTIAL_SAFETY_STATUS


def _audit_metadata(**values: Any) -> dict[str, Any]:
    return sanitize_credential_payload({key: value for key, value in values.items() if value is not None})


def serialize_credential_ref(row: Any) -> dict[str, Any]:
    return {
        "credential_ref_id": str(row.id),
        "exchange": row.exchange,
        "environment": row.environment,
        "label": row.label,
        "status": row.status,
        "vault_provider": row.vault_provider,
        "vault_secret_ref": row.vault_secret_ref,
        "api_key_fingerprint": row.api_key_fingerprint,
        "permission_evidence": sanitize_credential_payload(row.permission_evidence or {}),
        "metadata": sanitize_credential_payload(row.metadata_ or {}),
        "safety_status": _safety_status_for_provider(row.vault_provider),
    }


def create_testnet_credential(
    repository: Any,
    provider: CredentialVaultProvider,
    *,
    request: TestnetCredentialCreateRequestData,
) -> TestnetCredentialMutationResult:
    blocked_fields = find_secret_like_fields(request.metadata)
    if blocked_fields:
        return _blocked_secret_result(blocked_fields)
    if not request.confirm_create:
        return TestnetCredentialMutationResult(status="blocked", reason_code="testnet_credential_create_confirmation_required", semantic_status_code=400)
    try:
        write = provider.create_secret(label=request.label, actor=request.actor, idempotency_key=request.idempotency_key, secret=request.secret)
    except TestnetCredentialValidationError as exc:
        return TestnetCredentialMutationResult(status="blocked", reason_code=exc.reason_code, should_commit=False, semantic_status_code=exc.status_code)

    provider_metadata = _provider_metadata_without_secret(write.metadata)
    credential = repository.create_credential_ref(
        exchange=TESTNET_CREDENTIAL_EXCHANGE,
        environment=TESTNET_CREDENTIAL_ENVIRONMENT,
        label=request.label,
        status="stored_testnet_only",
        vault_provider=write.vault_provider,
        vault_secret_ref=write.vault_secret_ref,
        api_key_fingerprint=write.api_key_fingerprint,
        permission_evidence=build_fake_permission_evidence(can_withdraw=False, margin_or_futures_enabled=False),
        metadata={**sanitize_credential_payload(request.metadata), "providerMetadata": provider_metadata},
        actor=request.actor,
    )
    reason_code = "testnet_credential_fake_created"
    audit_metadata = {"fakeOnly": True}
    if write.vault_provider == LOCAL_DEV_VAULT_PROVIDER:
        encrypted_payload = _encrypted_payload_from_write(write)
        if encrypted_payload is None:
            return TestnetCredentialMutationResult(status="blocked", reason_code="testnet_credential_vault_write_failed", should_commit=False, semantic_status_code=500)
        repository.create_secret_row(
            credential_ref_id=credential.id,
            vault_secret_ref=write.vault_secret_ref,
            encrypted_payload=encrypted_payload,
            encryption_key_fingerprint=str(write.metadata.get("encryptionKeyFingerprint", "")),
            actor=request.actor,
        )
        reason_code = "testnet_credential_secret_encrypted"
        audit_metadata = {"localDevEncrypted": True, "providerMetadata": provider_metadata}
    audit = repository.add_audit_event(
        credential_ref_id=credential.id,
        action="testnet_credential_created",
        actor=request.actor,
        environment=TESTNET_CREDENTIAL_ENVIRONMENT,
        reason_code=reason_code,
        idempotency_key_hash=hash_idempotency_key(f"testnet-credential:create:{request.idempotency_key}"),
        metadata=audit_metadata,
    )
    return TestnetCredentialMutationResult(
        status="created",
        reason_code=reason_code,
        safety_status=_safety_status_for_provider(write.vault_provider),
        credential_ref_id=str(credential.id),
        label=credential.label,
        vault_provider=credential.vault_provider,
        vault_secret_ref=credential.vault_secret_ref,
        credential_status=credential.status,
        audit_event_ids=[str(audit.id)],
        should_commit=True,
        semantic_status_code=201,
    )


def _validation_gate_block(reason_code: str, *, semantic_status_code: int = 400) -> TestnetCredentialMutationResult:
    return TestnetCredentialMutationResult(
        status="blocked",
        reason_code=reason_code,
        should_commit=False,
        semantic_status_code=semantic_status_code,
    )

def _real_validation_action(status: str) -> str:
    if status == "passed":
        return "testnet_credential_validation_completed"
    if status == "blocked":
        return "testnet_credential_validation_blocked"
    return "testnet_credential_validation_failed"

def validate_testnet_credential(
    repository: Any,
    credential_ref_id: UUID,
    *,
    request: TestnetCredentialValidateRequestData,
    provider: CredentialVaultProvider | None = None,
    validation_client: Any | None = None,
    settings: Any | None = None,
    request_time_ms: int | None = None,
) -> TestnetCredentialMutationResult:
    credential = repository.get_credential_ref(credential_ref_id)
    if credential is None:
        return TestnetCredentialMutationResult(status="not_found", reason_code="testnet_credential_not_found", semantic_status_code=404)
    if not request.confirm_validate:
        return TestnetCredentialMutationResult(status="blocked", reason_code="testnet_credential_validate_confirmation_required", semantic_status_code=400)
    if provider is not None and validation_client is not None and settings is not None and request_time_ms is not None:
        if getattr(settings, "tradelab_testnet_credential_validation_enabled", False) is not True:
            return _validation_gate_block("testnet_credential_validation_not_enabled")
        if getattr(settings, "tradelab_environment", "") not in {"local", "development", "test"}:
            return _validation_gate_block("testnet_credential_validation_environment_not_allowed")
        if getattr(settings, "tradelab_testnet_credential_vault_provider", "") != LOCAL_DEV_VAULT_PROVIDER:
            return _validation_gate_block("testnet_credential_validation_provider_not_supported")
        if getattr(settings, "tradelab_binance_testnet_base_url", "") != "https://testnet.binance.vision":
            return _validation_gate_block("testnet_credential_validation_base_url_not_allowed")
        if credential.vault_provider != LOCAL_DEV_VAULT_PROVIDER or not isinstance(provider, LocalDevEncryptedCredentialVaultProvider):
            return _validation_gate_block("testnet_credential_validation_provider_not_supported")
        if credential.environment != TESTNET_CREDENTIAL_ENVIRONMENT:
            return _validation_gate_block("testnet_credential_validation_environment_mismatch")
        if not getattr(credential, "is_active", False):
            return _validation_gate_block("testnet_credential_inactive")
        if getattr(credential, "is_deleted", False):
            return _validation_gate_block("testnet_credential_deleted")
        if credential.status == "revoked":
            return _validation_gate_block("testnet_credential_revoked")

        read = read_testnet_credential_secret_for_internal_purpose(
            repository,
            provider,
            request=TestnetCredentialReadRequestData(
                credential_ref_id=credential.id,
                purpose=PHASE_18_5_VALIDATION_PURPOSE,
                actor=request.actor,
            ),
        )
        if read.status != "allowed" or read.payload is None:
            return TestnetCredentialMutationResult(
                status=read.status,
                reason_code=read.reason_code,
                credential_ref_id=str(credential.id),
                audit_event_ids=read.audit_event_ids,
                should_commit=False,
                semantic_status_code=read.semantic_status_code,
            )

        started = repository.add_audit_event(
            credential_ref_id=credential.id,
            action="testnet_credential_validation_started",
            actor=request.actor,
            environment=TESTNET_CREDENTIAL_ENVIRONMENT,
            reason_code="testnet_credential_validation_started",
            idempotency_key_hash=hash_idempotency_key(f"testnet-credential:validate:{request.idempotency_key}:started"),
            metadata={"purpose": PHASE_18_5_VALIDATION_PURPOSE},
        )
        probe = validation_client.validate_account(
            api_key=read.payload["apiKey"],
            api_secret=read.payload["apiSecret"],
            recv_window_ms=getattr(settings, "tradelab_testnet_credential_validation_recv_window_ms", 5000),
            request_time_ms=request_time_ms,
        )
        credential.status = probe.credential_status
        credential.permission_evidence = sanitize_credential_payload(probe.evidence)
        credential.last_validated_at = now_utc()
        credential.last_validation_status = probe.status
        credential.last_validation_reason_code = probe.reason_code
        audit = repository.add_audit_event(
            credential_ref_id=credential.id,
            action=_real_validation_action(probe.status),
            actor=request.actor,
            environment=TESTNET_CREDENTIAL_ENVIRONMENT,
            reason_code=probe.reason_code,
            idempotency_key_hash=hash_idempotency_key(f"testnet-credential:validate:{request.idempotency_key}"),
            metadata=sanitize_credential_payload({"evidence": probe.evidence, "details": probe.details}),
        )
        result_status = "validated" if probe.status == "passed" else probe.status
        return TestnetCredentialMutationResult(
            status=result_status,
            reason_code=probe.reason_code,
            safety_status=probe.safety_status,
            credential_ref_id=str(credential.id),
            credential_status=credential.status,
            audit_event_ids=[*read.audit_event_ids, str(started.id), str(audit.id)],
            details=sanitize_credential_payload(probe.details),
            should_commit=True,
        )
    evidence = build_fake_permission_evidence(
        can_withdraw=request.fake_can_withdraw,
        margin_or_futures_enabled=request.fake_margin_or_futures_enabled,
    )
    new_status = evaluate_permission_evidence_status(evidence)
    credential.status = new_status
    credential.permission_evidence = evidence
    credential.last_validated_at = now_utc()
    credential.last_validation_status = "blocked" if new_status == "unsafe_permissions" else "passed"
    credential.last_validation_reason_code = "testnet_credential_unsafe_permissions" if new_status == "unsafe_permissions" else "testnet_credential_fake_validated"
    audit = repository.add_audit_event(
        credential_ref_id=credential.id,
        action="testnet_credential_validation_completed",
        actor=request.actor,
        environment=TESTNET_CREDENTIAL_ENVIRONMENT,
        reason_code=credential.last_validation_reason_code,
        idempotency_key_hash=hash_idempotency_key(f"testnet-credential:validate:{request.idempotency_key}"),
        metadata=evidence,
    )
    return TestnetCredentialMutationResult(status="validated", reason_code=credential.last_validation_reason_code, credential_ref_id=str(credential.id), credential_status=credential.status, audit_event_ids=[str(audit.id)], should_commit=True)


def rotate_testnet_credential(
    repository: Any,
    provider: CredentialVaultProvider,
    credential_ref_id: UUID,
    *,
    request: TestnetCredentialRotateRequestData,
) -> TestnetCredentialMutationResult:
    credential = repository.get_credential_ref(credential_ref_id)
    if credential is None:
        return TestnetCredentialMutationResult(status="not_found", reason_code="testnet_credential_not_found", semantic_status_code=404)
    if not request.confirm_rotate:
        return TestnetCredentialMutationResult(status="blocked", reason_code="testnet_credential_rotate_confirmation_required", semantic_status_code=400)
    try:
        write = provider.rotate_secret(vault_secret_ref=credential.vault_secret_ref, actor=request.actor, idempotency_key=request.idempotency_key, secret=request.secret)
    except TestnetCredentialValidationError as exc:
        return TestnetCredentialMutationResult(status="blocked", reason_code=exc.reason_code, should_commit=False, semantic_status_code=exc.status_code)

    previous_ref = credential.vault_secret_ref
    credential.vault_secret_ref = write.vault_secret_ref
    credential.vault_provider = write.vault_provider
    credential.api_key_fingerprint = write.api_key_fingerprint
    credential.status = "rotation_required"
    credential.rotated_at = now_utc()
    credential.rotated_by = request.actor
    reason_code = "testnet_credential_fake_rotated"
    audit_metadata = write.metadata
    if write.vault_provider == LOCAL_DEV_VAULT_PROVIDER:
        encrypted_payload = _encrypted_payload_from_write(write)
        if encrypted_payload is None:
            return TestnetCredentialMutationResult(status="blocked", reason_code="testnet_credential_vault_write_failed", should_commit=False, semantic_status_code=500)
        if hasattr(repository, "deactivate_secret_rows"):
            repository.deactivate_secret_rows(credential_ref_id=credential.id, actor=request.actor)
        repository.create_secret_row(
            credential_ref_id=credential.id,
            vault_secret_ref=write.vault_secret_ref,
            encrypted_payload=encrypted_payload,
            encryption_key_fingerprint=str(write.metadata.get("encryptionKeyFingerprint", "")),
            actor=request.actor,
        )
        reason_code = "testnet_credential_secret_rotated"
        audit_metadata = _audit_metadata(localDevEncrypted=True, previousVaultSecretRef=previous_ref, providerMetadata=_provider_metadata_without_secret(write.metadata))
    audit = repository.add_audit_event(
        credential_ref_id=credential.id,
        action="testnet_credential_rotated",
        actor=request.actor,
        environment=TESTNET_CREDENTIAL_ENVIRONMENT,
        reason_code=reason_code,
        idempotency_key_hash=hash_idempotency_key(f"testnet-credential:rotate:{request.idempotency_key}"),
        metadata=audit_metadata,
    )
    return TestnetCredentialMutationResult(status="rotated", reason_code=reason_code, safety_status=_safety_status_for_provider(write.vault_provider), credential_ref_id=str(credential.id), vault_provider=credential.vault_provider, vault_secret_ref=credential.vault_secret_ref, credential_status=credential.status, audit_event_ids=[str(audit.id)], should_commit=True)


def revoke_testnet_credential(repository: Any, provider: CredentialVaultProvider, credential_ref_id: UUID, *, request: TestnetCredentialRevokeRequestData) -> TestnetCredentialMutationResult:
    credential = repository.get_credential_ref(credential_ref_id)
    if credential is None:
        return TestnetCredentialMutationResult(status="not_found", reason_code="testnet_credential_not_found", semantic_status_code=404)
    if not request.confirm_revoke:
        return TestnetCredentialMutationResult(status="blocked", reason_code="testnet_credential_revoke_confirmation_required", semantic_status_code=400)
    metadata = provider.revoke_secret(vault_secret_ref=credential.vault_secret_ref, actor=request.actor)
    credential.status = "revoked"
    credential.revoked_at = now_utc()
    credential.revoked_by = request.actor
    credential.is_active = False
    if hasattr(repository, "deactivate_secret_rows"):
        repository.deactivate_secret_rows(credential_ref_id=credential.id, actor=request.actor)
    audit = repository.add_audit_event(
        credential_ref_id=credential.id,
        action="testnet_credential_revoked",
        actor=request.actor,
        environment=TESTNET_CREDENTIAL_ENVIRONMENT,
        reason_code="testnet_credential_fake_revoked" if credential.vault_provider == FAKE_VAULT_PROVIDER else "testnet_credential_secret_revoked",
        idempotency_key_hash=hash_idempotency_key(f"testnet-credential:revoke:{request.idempotency_key}"),
        metadata=metadata,
    )
    return TestnetCredentialMutationResult(status="revoked", reason_code=audit.reason_code, safety_status=_safety_status_for_provider(credential.vault_provider), credential_ref_id=str(credential.id), credential_status=credential.status, audit_event_ids=[str(audit.id)], should_commit=True)


def _read_blocked(repository: Any, request: TestnetCredentialReadRequestData, credential_ref_id: UUID | None, reason_code: str = "testnet_credential_vault_read_blocked") -> TestnetCredentialReadResult:
    audit = repository.add_audit_event(
        credential_ref_id=credential_ref_id,
        action="testnet_credential_vault_read_blocked",
        actor=request.actor,
        environment=TESTNET_CREDENTIAL_ENVIRONMENT,
        reason_code=reason_code,
        request_id=request.request_id,
        metadata={"purpose": request.purpose},
    )
    return TestnetCredentialReadResult(status="blocked", reason_code=reason_code, audit_event_ids=[str(audit.id)], semantic_status_code=403)


def read_testnet_credential_secret_for_internal_purpose(
    repository: Any,
    provider: CredentialVaultProvider,
    *,
    request: TestnetCredentialReadRequestData,
) -> TestnetCredentialReadResult:
    requested = repository.add_audit_event(
        credential_ref_id=request.credential_ref_id,
        action="testnet_credential_vault_read_requested",
        actor=request.actor,
        environment=TESTNET_CREDENTIAL_ENVIRONMENT,
        reason_code="testnet_credential_vault_read_requested",
        request_id=request.request_id,
        metadata={"purpose": request.purpose},
    )
    credential = repository.get_credential_ref(request.credential_ref_id)
    if credential is None:
        blocked = _read_blocked(repository, request, request.credential_ref_id, "testnet_credential_not_found")
        return TestnetCredentialReadResult(status=blocked.status, reason_code=blocked.reason_code, audit_event_ids=[str(requested.id), *blocked.audit_event_ids], semantic_status_code=404)
    if request.purpose not in ALLOWED_TESTNET_CREDENTIAL_READ_PURPOSES:
        blocked = _read_blocked(repository, request, credential.id)
        return TestnetCredentialReadResult(status=blocked.status, reason_code=blocked.reason_code, audit_event_ids=[str(requested.id), *blocked.audit_event_ids], semantic_status_code=403)
    if credential.environment != TESTNET_CREDENTIAL_ENVIRONMENT or credential.vault_provider != LOCAL_DEV_VAULT_PROVIDER:
        blocked = _read_blocked(repository, request, credential.id)
        return TestnetCredentialReadResult(status=blocked.status, reason_code=blocked.reason_code, audit_event_ids=[str(requested.id), *blocked.audit_event_ids], semantic_status_code=403)
    if not getattr(credential, "is_active", False) or getattr(credential, "is_deleted", False) or credential.status in BLOCKED_READ_STATUSES:
        blocked = _read_blocked(repository, request, credential.id)
        return TestnetCredentialReadResult(status=blocked.status, reason_code=blocked.reason_code, audit_event_ids=[str(requested.id), *blocked.audit_event_ids], semantic_status_code=403)
    secret = repository.get_active_secret_by_ref(credential.vault_secret_ref)
    if secret is None:
        blocked = _read_blocked(repository, request, credential.id)
        return TestnetCredentialReadResult(status=blocked.status, reason_code=blocked.reason_code, audit_event_ids=[str(requested.id), *blocked.audit_event_ids], semantic_status_code=403)
    if not isinstance(provider, LocalDevEncryptedCredentialVaultProvider):
        blocked = _read_blocked(repository, request, credential.id)
        return TestnetCredentialReadResult(status=blocked.status, reason_code=blocked.reason_code, audit_event_ids=[str(requested.id), *blocked.audit_event_ids], semantic_status_code=403)
    try:
        payload = provider.decrypt_secret_payload(secret.encrypted_payload)
    except LocalDevCredentialCryptoError:
        failed = repository.add_audit_event(
            credential_ref_id=credential.id,
            action="testnet_credential_vault_read_failed",
            actor=request.actor,
            environment=TESTNET_CREDENTIAL_ENVIRONMENT,
            reason_code="testnet_credential_vault_read_failed",
            request_id=request.request_id,
            metadata={"purpose": request.purpose},
        )
        return TestnetCredentialReadResult(status="failed", reason_code="testnet_credential_vault_read_failed", audit_event_ids=[str(requested.id), str(failed.id)], semantic_status_code=500)
    allowed = repository.add_audit_event(
        credential_ref_id=credential.id,
        action="testnet_credential_vault_read_allowed",
        actor=request.actor,
        environment=TESTNET_CREDENTIAL_ENVIRONMENT,
        reason_code="testnet_credential_vault_read_allowed",
        request_id=request.request_id,
        metadata={"purpose": request.purpose},
    )
    return TestnetCredentialReadResult(status="allowed", reason_code="testnet_credential_vault_read_allowed", payload=payload, audit_event_ids=[str(requested.id), str(allowed.id)])
