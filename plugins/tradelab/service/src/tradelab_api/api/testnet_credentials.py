from __future__ import annotations

from time import time
from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from tradelab_api.api.responses import success_response
from tradelab_api.core.config import settings
from tradelab_api.db.session import get_db_session
from tradelab_api.schemas.testnet_credentials import (
    TestnetCredentialCreateRequest,
    TestnetCredentialMetadataResponse,
    TestnetCredentialMutationResponse,
    TestnetCredentialRevokeRequest,
    TestnetCredentialRotateRequest,
    TestnetCredentialValidateRequest,
)
from tradelab_api.services.binance_testnet_account_validation import BinanceAccountValidationClient
from tradelab_api.services.credential_redaction import sanitize_credential_payload
from tradelab_api.services.testnet_credential_repository import TestnetCredentialRepository
from tradelab_api.services.testnet_credential_vault import (
    FakeCredentialVaultProvider,
    LocalDevEncryptedCredentialVaultProvider,
    TestnetCredentialCreateRequestData,
    TestnetCredentialRevokeRequestData,
    TestnetCredentialRotateRequestData,
    TestnetCredentialSecretRequestData,
    TestnetCredentialValidateRequestData,
    create_testnet_credential,
    revoke_testnet_credential,
    rotate_testnet_credential,
    serialize_credential_ref,
    validate_testnet_credential,
)

router = APIRouter()


def build_testnet_credential_provider():
    configured_provider = settings.tradelab_testnet_credential_vault_provider
    if configured_provider == "fake":
        return FakeCredentialVaultProvider()
    if configured_provider == "local_dev_encrypted":
        if settings.tradelab_environment not in {"local", "development", "test"}:
            raise RuntimeError("Local/dev encrypted testnet credential vault is only allowed in local, development, or test environments.")
        return LocalDevEncryptedCredentialVaultProvider(encryption_key=settings.tradelab_local_dev_testnet_credential_key)
    raise RuntimeError("Unsupported testnet credential vault provider.")

def build_binance_account_validation_client() -> BinanceAccountValidationClient:
    return BinanceAccountValidationClient(
        base_url=settings.tradelab_binance_testnet_base_url,
        timeout_seconds=settings.tradelab_testnet_credential_validation_timeout_seconds,
    )


def _secret_request(api_key: str | None, api_secret: str | None) -> TestnetCredentialSecretRequestData | None:
    if api_key is None or api_secret is None:
        return None
    return TestnetCredentialSecretRequestData(api_key=api_key, api_secret=api_secret)


def _mutation_payload(result) -> dict:
    payload = TestnetCredentialMutationResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    details = payload.get("details")
    if isinstance(details, dict):
        payload["details"] = sanitize_credential_payload(details)
    return payload


@router.post("/testnet/credentials")
def create_testnet_credential_route(
    request: TestnetCredentialCreateRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    result = create_testnet_credential(
        TestnetCredentialRepository(session),
        build_testnet_credential_provider(),
        request=TestnetCredentialCreateRequestData(
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


@router.get("/testnet/credentials")
def list_testnet_credentials_route(session: Session = Depends(get_db_session)) -> JSONResponse:
    repository = TestnetCredentialRepository(session)
    payload = [
        TestnetCredentialMetadataResponse.model_validate(serialize_credential_ref(row)).model_dump(mode="json", by_alias=True)
        for row in repository.list_credential_refs()
    ]
    return success_response(payload)


@router.get("/testnet/credentials/{credential_ref_id}")
def get_testnet_credential_route(credential_ref_id: UUID, session: Session = Depends(get_db_session)) -> JSONResponse:
    row = TestnetCredentialRepository(session).get_credential_ref(credential_ref_id)
    if row is None:
        return success_response({"status": "not_found", "reasonCode": "testnet_credential_not_found"}, status_code=404)
    payload = TestnetCredentialMetadataResponse.model_validate(serialize_credential_ref(row)).model_dump(mode="json", by_alias=True)
    return success_response(payload)


@router.post("/testnet/credentials/{credential_ref_id}/validate")
def validate_testnet_credential_route(
    credential_ref_id: UUID,
    request: TestnetCredentialValidateRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    result = validate_testnet_credential(
        TestnetCredentialRepository(session),
        credential_ref_id,
        request=TestnetCredentialValidateRequestData(
            confirm_validate=request.confirm_validate,
            idempotency_key=request.idempotency_key,
            actor=request.actor,
            fake_can_withdraw=request.fake_can_withdraw,
            fake_margin_or_futures_enabled=request.fake_margin_or_futures_enabled,
        ),
        provider=build_testnet_credential_provider(),
        validation_client=build_binance_account_validation_client(),
        settings=settings,
        request_time_ms=int(time() * 1000),
    )
    if result.should_commit:
        session.commit()
    return success_response(_mutation_payload(result), status_code=result.semantic_status_code)


@router.post("/testnet/credentials/{credential_ref_id}/rotate")
def rotate_testnet_credential_route(
    credential_ref_id: UUID,
    request: TestnetCredentialRotateRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    result = rotate_testnet_credential(
        TestnetCredentialRepository(session),
        build_testnet_credential_provider(),
        credential_ref_id,
        request=TestnetCredentialRotateRequestData(
            confirm_rotate=request.confirm_rotate,
            idempotency_key=request.idempotency_key,
            actor=request.actor,
            secret=_secret_request(request.api_key, request.api_secret),
        ),
    )
    if result.should_commit:
        session.commit()
    return success_response(_mutation_payload(result), status_code=result.semantic_status_code)


@router.post("/testnet/credentials/{credential_ref_id}/revoke")
def revoke_testnet_credential_route(
    credential_ref_id: UUID,
    request: TestnetCredentialRevokeRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    result = revoke_testnet_credential(
        TestnetCredentialRepository(session),
        build_testnet_credential_provider(),
        credential_ref_id,
        request=TestnetCredentialRevokeRequestData(
            confirm_revoke=request.confirm_revoke,
            idempotency_key=request.idempotency_key,
            actor=request.actor,
        ),
    )
    if result.should_commit:
        session.commit()
    return success_response(_mutation_payload(result), status_code=result.semantic_status_code)
