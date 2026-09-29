from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from tradelab_api.db.models import TestnetCredentialAuditEvent, TestnetCredentialRef, TestnetCredentialSecret
from tradelab_api.services.credential_redaction import sanitize_credential_payload


class TestnetCredentialRepository:
    def __init__(
        self,
        session: Session,
        workspace_id: UUID,
        owner_user_id: UUID,
    ) -> None:
        if not isinstance(workspace_id, UUID) or not isinstance(owner_user_id, UUID):
            raise ValueError("Verified workspace_id and owner_user_id are required.")
        self.session = session
        self.workspace_id = workspace_id
        self.owner_user_id = owner_user_id

    def create_credential_ref(
        self,
        *,
        exchange: str,
        environment: str,
        label: str,
        status: str,
        vault_provider: str,
        vault_secret_ref: str,
        api_key_fingerprint: str | None,
        permission_evidence: dict[str, Any],
        metadata: dict[str, Any],
        actor: str,
    ) -> TestnetCredentialRef:
        row = TestnetCredentialRef(
            workspace_id=self.workspace_id,
            owner_user_id=self.owner_user_id,
            exchange=exchange,
            environment=environment,
            label=label,
            status=status,
            vault_provider=vault_provider,
            vault_secret_ref=vault_secret_ref,
            api_key_fingerprint=api_key_fingerprint,
            permission_evidence=sanitize_credential_payload(permission_evidence),
            metadata_=sanitize_credential_payload(metadata),
            created_by=actor,
        )
        self.session.add(row)
        self.session.flush()
        return row

    def add_audit_event(
        self,
        *,
        credential_ref_id: UUID | None,
        action: str,
        actor: str,
        environment: str,
        reason_code: str | None = None,
        request_id: str | None = None,
        idempotency_key_hash: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> TestnetCredentialAuditEvent:
        row = TestnetCredentialAuditEvent(
            workspace_id=self.workspace_id,
            credential_ref_id=credential_ref_id,
            action=action,
            actor=actor,
            environment=environment,
            reason_code=reason_code,
            request_id=request_id,
            idempotency_key_hash=idempotency_key_hash,
            metadata_=sanitize_credential_payload(metadata or {}),
            created_by=actor,
        )
        self.session.add(row)
        self.session.flush()
        return row

    def create_secret_row(
        self,
        *,
        credential_ref_id: UUID,
        vault_secret_ref: str,
        encrypted_payload: str,
        encryption_key_fingerprint: str,
        actor: str,
    ) -> TestnetCredentialSecret:
        row = TestnetCredentialSecret(
            workspace_id=self.workspace_id,
            credential_ref_id=credential_ref_id,
            vault_secret_ref=vault_secret_ref,
            vault_provider="local_dev_encrypted",
            encrypted_payload=encrypted_payload,
            encryption_key_fingerprint=encryption_key_fingerprint,
            created_by=actor,
        )
        self.session.add(row)
        self.session.flush()
        return row

    def get_active_secret_by_ref(self, vault_secret_ref: str) -> TestnetCredentialSecret | None:
        statement = select(TestnetCredentialSecret).join(
            TestnetCredentialRef,
            TestnetCredentialRef.id == TestnetCredentialSecret.credential_ref_id,
        ).where(
            TestnetCredentialRef.workspace_id == self.workspace_id,
            TestnetCredentialRef.owner_user_id == self.owner_user_id,
            TestnetCredentialRef.is_deleted.is_(False),
            TestnetCredentialSecret.vault_secret_ref == vault_secret_ref,
            TestnetCredentialSecret.is_active.is_(True),
            TestnetCredentialSecret.is_deleted.is_(False),
        )
        statement = statement.where(TestnetCredentialSecret.workspace_id == self.workspace_id)
        return self.session.scalars(statement).first()

    def deactivate_secret_rows(self, *, credential_ref_id: UUID, actor: str) -> None:
        statement = select(TestnetCredentialSecret).join(
            TestnetCredentialRef,
            TestnetCredentialRef.id == TestnetCredentialSecret.credential_ref_id,
        ).where(
            TestnetCredentialRef.workspace_id == self.workspace_id,
            TestnetCredentialRef.owner_user_id == self.owner_user_id,
            TestnetCredentialRef.is_deleted.is_(False),
            TestnetCredentialSecret.credential_ref_id == credential_ref_id,
            TestnetCredentialSecret.is_active.is_(True),
            TestnetCredentialSecret.is_deleted.is_(False),
        )
        statement = statement.where(TestnetCredentialSecret.workspace_id == self.workspace_id)
        for row in self.session.scalars(statement).all():
            row.is_active = False
            row.updated_by = actor

    def get_credential_ref(self, credential_ref_id: UUID) -> TestnetCredentialRef | None:
        stmt = select(TestnetCredentialRef).where(TestnetCredentialRef.id == credential_ref_id)
        stmt = stmt.where(TestnetCredentialRef.workspace_id == self.workspace_id)
        stmt = stmt.where(TestnetCredentialRef.owner_user_id == self.owner_user_id)
        return self.session.scalars(stmt).first()

    def list_credential_refs(self) -> list[TestnetCredentialRef]:
        statement = select(TestnetCredentialRef).where(TestnetCredentialRef.is_deleted.is_(False))
        statement = statement.where(TestnetCredentialRef.workspace_id == self.workspace_id)
        statement = statement.where(TestnetCredentialRef.owner_user_id == self.owner_user_id)
        statement = statement.order_by(TestnetCredentialRef.created_at.desc())
        return list(self.session.scalars(statement).all())
