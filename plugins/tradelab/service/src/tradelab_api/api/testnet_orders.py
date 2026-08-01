from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from tradelab_api.api.responses import success_response
from tradelab_api.core.config import get_settings
from tradelab_api.db.session import get_db_session
from tradelab_api.schemas.testnet_orders import (
    TestnetOrderCancelRequest,
    TestnetOrderCancelResponse,
    TestnetOrderConfirmSubmitRequest,
    TestnetOrderConfirmSubmitResponse,
    TestnetOrderDetailResponse,
    TestnetOrderJournalProjectionRequest,
    TestnetOrderJournalProjectionResponse,
    TestnetOrderListResponse,
    TestnetOrderPreviewRequest,
    TestnetOrderPreviewResultResponse,
    TestnetOrderReconcileRequest,
    TestnetOrderReconcileResponse,
)
from tradelab_api.services.testnet_credential_repository import TestnetCredentialRepository
from tradelab_api.services.testnet_credential_vault import LocalDevEncryptedCredentialVaultProvider
from tradelab_api.services.execution_journal_repository import ExecutionJournalRepository
from tradelab_api.services.testnet_order_confirm_submit import (
    TestnetOrderConfirmSubmitRequestData,
    confirm_submit_testnet_order,
)
from tradelab_api.services.testnet_order_cancel import TestnetOrderCancelRequestData, cancel_testnet_order
from tradelab_api.services.testnet_order_journal_projection import (
    SqlAlchemyRunRepository,
    TestnetOrderJournalProjectionRequestData,
    project_testnet_order_to_journal,
)
from tradelab_api.services.testnet_order_preview import TestnetOrderPreviewRequestData, preview_testnet_order
from tradelab_api.services.testnet_order_read import get_testnet_order_detail, list_testnet_orders
from tradelab_api.services.testnet_order_reconcile import TestnetOrderReconcileRequestData, reconcile_testnet_order
from tradelab_api.services.testnet_order_state_repository import TestnetOrderStateRepository

router = APIRouter()

def _build_testnet_vault_provider(settings):
    if settings.tradelab_testnet_credential_vault_provider != "local_dev_encrypted":
        return None
    if settings.tradelab_environment not in {"local", "development", "test"}:
        raise RuntimeError("Local/dev encrypted testnet credential vault is only allowed in local, development, or test environments.")
    return LocalDevEncryptedCredentialVaultProvider(encryption_key=settings.tradelab_local_dev_testnet_credential_key)

@router.post("/testnet/orders/preview")
def preview_testnet_order_route(
    request: TestnetOrderPreviewRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    result = preview_testnet_order(
        TestnetOrderStateRepository(session),
        TestnetCredentialRepository(session),
        TestnetOrderPreviewRequestData(
            confirm_preview_only=request.confirm_preview_only,
            idempotency_key=request.idempotency_key,
            client_action_id=request.client_action_id,
            source=request.source,
            actor=request.actor,
            strategy_id=request.strategy_id,
            strategy_version_id=request.strategy_version_id,
            source_run_id=request.source_run_id,
            source_signal_package_id=request.source_signal_package_id,
            credential_ref_id=request.credential_ref_id,
            environment=request.environment,
            exchange=request.exchange,
            market_type=request.market_type,
            symbol=request.symbol,
            side=request.side,
            order_type=request.order_type,
            quantity=request.quantity,
            quote_quantity=request.quote_quantity,
        ),
    )
    if result.should_commit:
        session.commit()
    payload = TestnetOrderPreviewResultResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    return success_response(payload, status_code=result.semantic_status_code)

@router.post("/testnet/orders/{preview_id}/confirm-submit")
def confirm_submit_testnet_order_route(
    preview_id: UUID,
    request: TestnetOrderConfirmSubmitRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    settings = get_settings()
    result = confirm_submit_testnet_order(
        TestnetOrderStateRepository(session),
        TestnetCredentialRepository(session),
        TestnetOrderConfirmSubmitRequestData(
            preview_id=preview_id,
            confirm_testnet_order=request.confirm_testnet_order,
            idempotency_key=request.idempotency_key,
            actor=request.actor,
            submit_kill_switch_enabled=settings.tradelab_testnet_order_submit_kill_switch_enabled,
            connector_mode=settings.tradelab_testnet_order_submit_connector_mode,
            real_network_enabled=settings.tradelab_testnet_order_submit_network_enabled,
            environment_name=settings.tradelab_environment,
            binance_testnet_base_url=settings.tradelab_binance_testnet_base_url,
            vault_provider_name=settings.tradelab_testnet_credential_vault_provider,
            recv_window_ms=settings.tradelab_testnet_order_submit_recv_window_ms,
            timeout_seconds=settings.tradelab_testnet_order_submit_timeout_seconds,
        ),
        vault_provider=_build_testnet_vault_provider(settings),
    )
    if result.should_commit:
        session.commit()
    payload = TestnetOrderConfirmSubmitResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    return success_response(payload, status_code=result.semantic_status_code)

@router.post("/testnet/orders/{order_id}/cancel")
def cancel_testnet_order_route(
    order_id: UUID,
    request: TestnetOrderCancelRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    settings = get_settings()
    result = cancel_testnet_order(
        TestnetOrderStateRepository(session),
        TestnetCredentialRepository(session),
        TestnetOrderCancelRequestData(
            order_id=order_id,
            confirm_testnet_cancel=request.confirm_testnet_cancel,
            idempotency_key=request.idempotency_key,
            reason=request.reason,
            actor=request.actor,
            submit_kill_switch_enabled=settings.tradelab_testnet_order_submit_kill_switch_enabled,
            connector_mode=settings.tradelab_testnet_order_submit_connector_mode,
            real_network_enabled=settings.tradelab_testnet_order_submit_network_enabled,
            environment_name=settings.tradelab_environment,
            binance_testnet_base_url=settings.tradelab_binance_testnet_base_url,
            vault_provider_name=settings.tradelab_testnet_credential_vault_provider,
            recv_window_ms=settings.tradelab_testnet_order_submit_recv_window_ms,
            timeout_seconds=settings.tradelab_testnet_order_submit_timeout_seconds,
        ),
        vault_provider=_build_testnet_vault_provider(settings),
    )
    if result.should_commit:
        session.commit()
    payload = TestnetOrderCancelResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    return success_response(payload, status_code=result.semantic_status_code)

@router.post("/testnet/reconcile")
def reconcile_testnet_order_route(
    request: TestnetOrderReconcileRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    settings = get_settings()
    result = reconcile_testnet_order(
        TestnetOrderStateRepository(session),
        TestnetCredentialRepository(session),
        TestnetOrderReconcileRequestData(
            order_id=request.order_id,
            confirm_testnet_reconcile=request.confirm_testnet_reconcile,
            trigger=request.trigger,
            actor=request.actor,
            submit_kill_switch_enabled=settings.tradelab_testnet_order_submit_kill_switch_enabled,
            connector_mode=settings.tradelab_testnet_order_submit_connector_mode,
            real_network_enabled=settings.tradelab_testnet_order_submit_network_enabled,
            environment_name=settings.tradelab_environment,
            binance_testnet_base_url=settings.tradelab_binance_testnet_base_url,
            vault_provider_name=settings.tradelab_testnet_credential_vault_provider,
            recv_window_ms=settings.tradelab_testnet_order_submit_recv_window_ms,
            timeout_seconds=settings.tradelab_testnet_order_submit_timeout_seconds,
        ),
        vault_provider=_build_testnet_vault_provider(settings),
    )
    if result.should_commit:
        session.commit()
    payload = TestnetOrderReconcileResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    return success_response(payload, status_code=result.semantic_status_code)

@router.post("/testnet/orders/{order_id}/project-journal")
def project_testnet_order_to_journal_route(
    order_id: UUID,
    request: TestnetOrderJournalProjectionRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    result = project_testnet_order_to_journal(
        order_repository=TestnetOrderStateRepository(session),
        journal_repository=ExecutionJournalRepository(session),
        run_repository=SqlAlchemyRunRepository(session),
        request=TestnetOrderJournalProjectionRequestData(
            order_id=order_id,
            confirm_testnet_journal_projection=request.confirm_testnet_journal_projection,
            source=request.source,
            actor=request.actor,
        ),
    )
    if result.should_commit:
        session.commit()
    payload = TestnetOrderJournalProjectionResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    return success_response(payload, status_code=result.semantic_status_code)

@router.get("/testnet/orders/{order_id}")
def get_testnet_order_detail_route(order_id: UUID, session: Session = Depends(get_db_session)) -> JSONResponse:
    detail = get_testnet_order_detail(TestnetOrderStateRepository(session), order_id)
    if detail is None:
        return success_response({"status": "not_found", "reasonCode": "testnet_order_not_found"}, status_code=404)
    payload = TestnetOrderDetailResponse.model_validate(detail).model_dump(mode="json", by_alias=True)
    return success_response(payload)

@router.get("/testnet/orders")
def list_testnet_orders_route(
    strategy_id: UUID | None = Query(default=None, alias="strategyId"),
    strategy_version_id: UUID | None = Query(default=None, alias="strategyVersionId"),
    source_run_id: UUID | None = Query(default=None, alias="sourceRunId"),
    credential_ref_id: UUID | None = Query(default=None, alias="credentialRefId"),
    status: str | None = None,
    symbol: str | None = None,
    limit: int = Query(default=20, ge=1, le=50),
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    result = list_testnet_orders(
        TestnetOrderStateRepository(session),
        strategy_id=strategy_id,
        strategy_version_id=strategy_version_id,
        source_run_id=source_run_id,
        credential_ref_id=credential_ref_id,
        status=status,
        symbol=symbol,
        limit=limit,
    )
    payload = TestnetOrderListResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    return success_response(payload)
