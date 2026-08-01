from __future__ import annotations

from time import time
from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from tradelab_api.api.responses import success_response
from tradelab_api.core.config import settings
from tradelab_api.db.session import get_db_session
from tradelab_api.schemas.live_credentials import (
    LiveCredentialCreateRequest,
    LiveCredentialMetadataResponse,
    LiveCredentialMutationResponse,
    LiveCredentialRevokeRequest,
    LiveCredentialRotateRequest,
    LiveCredentialValidateRequest,
)
from tradelab_api.services.binance_live_account_validation import BinanceLiveAccountValidationClient
from tradelab_api.services.credential_redaction import sanitize_credential_payload
from tradelab_api.services.live_credential_repository import LiveCredentialRepository
from tradelab_api.services.live_credential_vault import (
    FakeCredentialVaultProvider,
    LocalDevEncryptedCredentialVaultProvider,
    LiveCredentialCreateRequestData,
    LiveCredentialRevokeRequestData,
    LiveCredentialRotateRequestData,
    LiveCredentialSecretRequestData,
    LiveCredentialValidateRequestData,
    create_live_credential,
    revoke_live_credential,
    rotate_live_credential,
    serialize_credential_ref,
    validate_live_credential,
)

router = APIRouter()


def build_live_credential_provider():
    configured_provider = settings.tradelab_live_credential_vault_provider
    if configured_provider == "disabled":
        return FakeCredentialVaultProvider()
    if configured_provider == "local_dev_encrypted":
        if settings.tradelab_environment not in {"local", "development", "test"}:
            raise RuntimeError("Local/dev encrypted live credential vault is only allowed in local, development, or test environments.")
        return LocalDevEncryptedCredentialVaultProvider(encryption_key=settings.tradelab_local_dev_live_credential_key)
    raise RuntimeError("Unsupported live credential vault provider.")


def build_binance_account_validation_client() -> BinanceLiveAccountValidationClient:
    return BinanceLiveAccountValidationClient(
        base_url=settings.tradelab_binance_live_base_url,
        timeout_seconds=settings.tradelab_live_credential_validation_timeout_seconds,
    )


def _secret_request(api_key: str | None, api_secret: str | None) -> LiveCredentialSecretRequestData | None:
    if api_key is None or api_secret is None:
        return None
    return LiveCredentialSecretRequestData(api_key=api_key, api_secret=api_secret)


def _mutation_payload(result) -> dict:
    payload = LiveCredentialMutationResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    details = payload.get("details")
    if isinstance(details, dict):
        payload["details"] = sanitize_credential_payload(details)
    return payload


@router.post("/live/credentials")
def create_live_credential_route(
    request: LiveCredentialCreateRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    result = create_live_credential(
        LiveCredentialRepository(session),
        build_live_credential_provider(),
        request=LiveCredentialCreateRequestData(
            label=request.label,
            confirm_create=request.confirm_create,
            idempotency_key=request.idempotency_key,
            actor=request.actor,
            metadata=request.metadata,
            secret=_secret_request(request.api_key, request.api_secret),
        ),
    )
    if result.should_commit:
        session.commit()
    return success_response(_mutation_payload(result), status_code=result.semantic_status_code)


@router.get("/live/credentials")
def list_live_credentials_route(session: Session = Depends(get_db_session)) -> JSONResponse:
    repository = LiveCredentialRepository(session)
    payload = [
        LiveCredentialMetadataResponse.model_validate(serialize_credential_ref(row)).model_dump(mode="json", by_alias=True)
        for row in repository.list_credential_refs()
    ]
    return success_response(payload)


@router.get("/live/credentials/{credential_ref_id}")
def get_live_credential_route(credential_ref_id: UUID, session: Session = Depends(get_db_session)) -> JSONResponse:
    row = LiveCredentialRepository(session).get_credential_ref(credential_ref_id)
    if row is None:
        return success_response({"status": "not_found", "reasonCode": "live_credential_not_found"}, status_code=404)
    payload = LiveCredentialMetadataResponse.model_validate(serialize_credential_ref(row)).model_dump(mode="json", by_alias=True)
    return success_response(payload)


@router.post("/live/credentials/{credential_ref_id}/validate")
def validate_live_credential_route(
    credential_ref_id: UUID,
    request: LiveCredentialValidateRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    result = validate_live_credential(
        LiveCredentialRepository(session),
        credential_ref_id,
        request=LiveCredentialValidateRequestData(
            confirm_validate=request.confirm_validate,
            idempotency_key=request.idempotency_key,
            actor=request.actor,
        ),
        provider=build_live_credential_provider(),
        validation_client=build_binance_account_validation_client(),
        settings=settings,
        request_time_ms=int(time() * 1000),
    )
    if result.should_commit:
        session.commit()
    return success_response(_mutation_payload(result), status_code=result.semantic_status_code)


@router.post("/live/credentials/{credential_ref_id}/rotate")
def rotate_live_credential_route(
    credential_ref_id: UUID,
    request: LiveCredentialRotateRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    result = rotate_live_credential(
        LiveCredentialRepository(session),
        build_live_credential_provider(),
        credential_ref_id,
        request=LiveCredentialRotateRequestData(
            confirm_rotate=request.confirm_rotate,
            idempotency_key=request.idempotency_key,
            actor=request.actor,
            secret=_secret_request(request.api_key, request.api_secret),
        ),
    )
    if result.should_commit:
        session.commit()
    return success_response(_mutation_payload(result), status_code=result.semantic_status_code)


@router.post("/live/credentials/{credential_ref_id}/revoke")
def revoke_live_credential_route(
    credential_ref_id: UUID,
    request: LiveCredentialRevokeRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    result = revoke_live_credential(
        LiveCredentialRepository(session),
        build_live_credential_provider(),
        credential_ref_id,
        request=LiveCredentialRevokeRequestData(
            confirm_revoke=request.confirm_revoke,
            idempotency_key=request.idempotency_key,
            actor=request.actor,
        ),
    )
    if result.should_commit:
        session.commit()
    return success_response(_mutation_payload(result), status_code=result.semantic_status_code)
