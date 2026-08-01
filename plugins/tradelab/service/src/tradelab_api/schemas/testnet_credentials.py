from __future__ import annotations

from typing import Any

from pydantic import Field

from .common import CamelModel


class TestnetCredentialCreateRequest(CamelModel):
    label: str
    confirm_create: bool = False
    idempotency_key: str
    actor: str = "local-user"
    metadata: dict[str, Any] = Field(default_factory=dict)
    api_key: str | None = None
    api_secret: str | None = None


class TestnetCredentialValidateRequest(CamelModel):
    confirm_validate: bool = False
    idempotency_key: str
    actor: str = "local-user"
    fake_can_withdraw: bool = False
    fake_margin_or_futures_enabled: bool = False


class TestnetCredentialRotateRequest(CamelModel):
    confirm_rotate: bool = False
    idempotency_key: str
    actor: str = "local-user"
    api_key: str | None = None
    api_secret: str | None = None


class TestnetCredentialRevokeRequest(CamelModel):
    confirm_revoke: bool = False
    idempotency_key: str
    actor: str = "local-user"


class TestnetCredentialMutationResponse(CamelModel):
    status: str
    reason_code: str
    safety_status: str
    credential_ref_id: str | None = None
    label: str | None = None
    vault_provider: str | None = None
    vault_secret_ref: str | None = None
    credential_status: str | None = None
    audit_event_ids: list[str] = Field(default_factory=list)
    details: dict[str, Any] = Field(default_factory=dict)


class TestnetCredentialMetadataResponse(CamelModel):
    credential_ref_id: str
    exchange: str
    environment: str
    label: str
    status: str
    vault_provider: str
    vault_secret_ref: str
    api_key_fingerprint: str | None = None
    permission_evidence: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    safety_status: str
