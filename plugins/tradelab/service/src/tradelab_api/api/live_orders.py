from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from tradelab_api.api.responses import success_response
from tradelab_api.core.config import get_settings
from tradelab_api.db.session import get_db_session
from tradelab_api.schemas.live_orders import (
    LiveOrderCancelRequest,
    LiveOrderCancelResponse,
    LiveOrderConfirmSubmitRequest,
    LiveOrderConfirmSubmitResponse,
    LiveOrderDetailResponse,
    LiveOrderJournalProjectionRequest,
    LiveOrderJournalProjectionResponse,
    LiveOrderListResponse,
    LiveOrderPreviewRequest,
    LiveOrderPreviewResultResponse,
    LiveOrderReconcileRequest,
    LiveOrderReconcileResponse,
    LiveProofWindowCloseRequest,
    LiveProofWindowOpenRequest,
    LiveProofWindowStatusResponse,
)
from tradelab_api.services.execution_journal_repository import ExecutionJournalRepository
from tradelab_api.services.live_credential_repository import LiveCredentialRepository
from tradelab_api.services.live_credential_vault import LocalDevEncryptedCredentialVaultProvider
from tradelab_api.services.live_order_confirm_submit import LiveOrderConfirmSubmitRequestData, confirm_submit_live_order
from tradelab_api.services.live_order_cancel import LiveOrderCancelRequestData, cancel_live_order
from tradelab_api.services.live_order_journal_projection import (
    LiveOrderJournalProjectionRequestData,
    SqlAlchemyRunRepository,
    project_live_order_to_journal,
)
from tradelab_api.services.live_order_preview import LiveOrderPreviewRequestData, preview_live_order
from tradelab_api.services.live_order_read import get_live_order_detail, list_live_orders
from tradelab_api.services.live_order_reconcile import LiveOrderReconcileRequestData, reconcile_live_order
from tradelab_api.services.live_order_state_repository import LiveOrderStateRepository
from tradelab_api.services.live_proof_window import (
    LiveProofWindowCloseRequestData,
    LiveProofWindowOpenRequestData,
    LiveProofWindowRuntimeGate,
    close_live_proof_window,
    get_live_proof_window_status,
    open_live_proof_window,
)

router = APIRouter()


def _build_live_vault_provider(settings):
    if settings.tradelab_live_credential_vault_provider != "local_dev_encrypted":
        return None
    if settings.tradelab_environment not in {"local", "development", "test"}:
        raise RuntimeError("Local/dev encrypted live credential vault is only allowed in local, development, or test environments.")
    return LocalDevEncryptedCredentialVaultProvider(encryption_key=settings.tradelab_local_dev_live_credential_key)


def _live_runtime_gate_from_settings(settings) -> LiveProofWindowRuntimeGate:
    return LiveProofWindowRuntimeGate(
        kill_switch_enabled=settings.tradelab_live_order_submit_kill_switch_enabled,
        connector_mode=settings.tradelab_live_order_submit_connector_mode,
        real_network_enabled=settings.tradelab_live_order_submit_network_enabled,
        environment_name=settings.tradelab_environment,
        binance_live_base_url=settings.tradelab_binance_live_base_url,
        vault_provider_name=settings.tradelab_live_credential_vault_provider,
    )


@router.post("/live/orders/preview")
def preview_live_order_route(
    request: LiveOrderPreviewRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    settings = get_settings()
    result = preview_live_order(
        LiveOrderStateRepository(session),
        LiveCredentialRepository(session),
        LiveOrderPreviewRequestData(
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
        live_order_submit_kill_switch_enabled=settings.tradelab_live_order_submit_kill_switch_enabled,
        connector_mode=settings.tradelab_live_order_submit_connector_mode,
        real_network_enabled=settings.tradelab_live_order_submit_network_enabled,
        environment_name=settings.tradelab_environment,
        binance_live_base_url=settings.tradelab_binance_live_base_url,
        vault_provider_name=settings.tradelab_live_credential_vault_provider,
    )
    if result.should_commit:
        session.commit()
    payload = LiveOrderPreviewResultResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    return success_response(payload, status_code=result.semantic_status_code)


@router.post("/live/orders/{preview_id}/confirm-submit")
def confirm_submit_live_order_route(
    preview_id: UUID,
    request: LiveOrderConfirmSubmitRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    settings = get_settings()
    result = confirm_submit_live_order(
        LiveOrderStateRepository(session),
        LiveCredentialRepository(session),
        LiveOrderConfirmSubmitRequestData(
            preview_id=preview_id,
            confirm_live_order=request.confirm_live_order,
            idempotency_key=request.idempotency_key,
            actor=request.actor,
            live_order_submit_kill_switch_enabled=settings.tradelab_live_order_submit_kill_switch_enabled,
            connector_mode=settings.tradelab_live_order_submit_connector_mode,
            real_network_enabled=settings.tradelab_live_order_submit_network_enabled,
            environment_name=settings.tradelab_environment,
            binance_live_base_url=settings.tradelab_binance_live_base_url,
            vault_provider_name=settings.tradelab_live_credential_vault_provider,
            recv_window_ms=settings.tradelab_live_order_submit_recv_window_ms,
            timeout_seconds=settings.tradelab_live_order_submit_timeout_seconds,
        ),
        vault_provider=_build_live_vault_provider(settings),
    )
    if result.should_commit:
        session.commit()
    payload = LiveOrderConfirmSubmitResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    return success_response(payload, status_code=result.semantic_status_code)


@router.get("/live/proof-window/status")
def get_live_proof_window_status_route(session: Session = Depends(get_db_session)) -> JSONResponse:
    settings = get_settings()
    result = get_live_proof_window_status(
        LiveOrderStateRepository(session),
        runtime_gate=_live_runtime_gate_from_settings(settings),
    )
    if result.should_commit:
        session.commit()
    payload = LiveProofWindowStatusResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    return success_response(payload, status_code=result.semantic_status_code)


@router.post("/live/proof-window/open")
def open_live_proof_window_route(
    request: LiveProofWindowOpenRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    settings = get_settings()
    result = open_live_proof_window(
        LiveOrderStateRepository(session),
        LiveProofWindowOpenRequestData(
            confirm_open=request.confirm_open,
            actor=request.actor,
            reason=request.reason,
            ttl_seconds=request.ttl_seconds,
            intent_budget=request.intent_budget,
        ),
        runtime_gate=_live_runtime_gate_from_settings(settings),
    )
    if result.should_commit:
        session.commit()
    payload = LiveProofWindowStatusResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    return success_response(payload, status_code=result.semantic_status_code)


@router.post("/live/proof-window/close")
def close_live_proof_window_route(
    request: LiveProofWindowCloseRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    settings = get_settings()
    result = close_live_proof_window(
        LiveOrderStateRepository(session),
        LiveProofWindowCloseRequestData(
            confirm_close=request.confirm_close,
            actor=request.actor,
            reason=request.reason,
        ),
        runtime_gate=_live_runtime_gate_from_settings(settings),
    )
    if result.should_commit:
        session.commit()
    payload = LiveProofWindowStatusResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    return success_response(payload, status_code=result.semantic_status_code)


@router.post("/live/orders/{order_id}/cancel")
def cancel_live_order_route(
    order_id: UUID,
    request: LiveOrderCancelRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    settings = get_settings()
    result = cancel_live_order(
        LiveOrderStateRepository(session),
        LiveCredentialRepository(session),
        LiveOrderCancelRequestData(
            order_id=order_id,
            confirm_live_cancel=request.confirm_live_cancel,
            idempotency_key=request.idempotency_key,
            reason=request.reason,
            actor=request.actor,
            live_order_submit_kill_switch_enabled=settings.tradelab_live_order_submit_kill_switch_enabled,
            connector_mode=settings.tradelab_live_order_submit_connector_mode,
            real_network_enabled=settings.tradelab_live_order_submit_network_enabled,
            environment_name=settings.tradelab_environment,
            binance_live_base_url=settings.tradelab_binance_live_base_url,
            vault_provider_name=settings.tradelab_live_credential_vault_provider,
            recv_window_ms=settings.tradelab_live_order_submit_recv_window_ms,
            timeout_seconds=settings.tradelab_live_order_submit_timeout_seconds,
        ),
        vault_provider=_build_live_vault_provider(settings),
    )
    if result.should_commit:
        session.commit()
    payload = LiveOrderCancelResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    return success_response(payload, status_code=result.semantic_status_code)


@router.post("/live/orders/{order_id}/reconcile")
def reconcile_live_order_route(
    order_id: UUID,
    request: LiveOrderReconcileRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    settings = get_settings()
    result = reconcile_live_order(
        LiveOrderStateRepository(session),
        LiveCredentialRepository(session),
        LiveOrderReconcileRequestData(
            order_id=order_id,
            confirm_live_reconcile=request.confirm_live_reconcile,
            trigger=request.trigger,
            actor=request.actor,
            live_order_submit_kill_switch_enabled=settings.tradelab_live_order_submit_kill_switch_enabled,
            connector_mode=settings.tradelab_live_order_submit_connector_mode,
            real_network_enabled=settings.tradelab_live_order_submit_network_enabled,
            environment_name=settings.tradelab_environment,
            binance_live_base_url=settings.tradelab_binance_live_base_url,
            vault_provider_name=settings.tradelab_live_credential_vault_provider,
            recv_window_ms=settings.tradelab_live_order_submit_recv_window_ms,
            timeout_seconds=settings.tradelab_live_order_submit_timeout_seconds,
        ),
        vault_provider=_build_live_vault_provider(settings),
    )
    if result.should_commit:
        session.commit()
    payload = LiveOrderReconcileResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    return success_response(payload, status_code=result.semantic_status_code)


@router.post("/live/orders/{order_id}/project-journal")
def project_live_order_to_journal_route(
    order_id: UUID,
    request: LiveOrderJournalProjectionRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    result = project_live_order_to_journal(
        order_repository=LiveOrderStateRepository(session),
        journal_repository=ExecutionJournalRepository(session),
        run_repository=SqlAlchemyRunRepository(session),
        request=LiveOrderJournalProjectionRequestData(
            order_id=order_id,
            confirm_live_journal_projection=request.confirm_live_journal_projection,
            source=request.source,
            actor=request.actor,
        ),
    )
    if result.should_commit:
        session.commit()
    payload = LiveOrderJournalProjectionResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    return success_response(payload, status_code=result.semantic_status_code)


@router.get("/live/orders/{order_id}")
def get_live_order_detail_route(order_id: UUID, session: Session = Depends(get_db_session)) -> JSONResponse:
    detail = get_live_order_detail(LiveOrderStateRepository(session), order_id)
    if detail is None:
        return success_response({"status": "not_found", "reasonCode": "live_order_not_found"}, status_code=404)
    payload = LiveOrderDetailResponse.model_validate(detail).model_dump(mode="json", by_alias=True)
    return success_response(payload)


@router.get("/live/orders")
def list_live_orders_route(
    strategy_id: UUID | None = Query(default=None, alias="strategyId"),
    strategy_version_id: UUID | None = Query(default=None, alias="strategyVersionId"),
    source_run_id: UUID | None = Query(default=None, alias="sourceRunId"),
    credential_ref_id: UUID | None = Query(default=None, alias="credentialRefId"),
    status: str | None = None,
    symbol: str | None = None,
    limit: int = Query(default=20, ge=1, le=50),
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    result = list_live_orders(
        LiveOrderStateRepository(session),
        strategy_id=strategy_id,
        strategy_version_id=strategy_version_id,
        source_run_id=source_run_id,
        credential_ref_id=credential_ref_id,
        status=status,
        symbol=symbol,
        limit=limit,
    )
    payload = LiveOrderListResponse.model_validate(result).model_dump(mode="json", by_alias=True)
    return success_response(payload)


@router.get("/live/safety/status")
def get_live_safety_status_route(session: Session = Depends(get_db_session)) -> JSONResponse:
    pilot = LiveOrderStateRepository(session).get_or_create_pilot_control()
    payload = {
        "status": getattr(pilot, "status", None),
        "reasonCode": getattr(pilot, "hard_stop_reason_code", None),
        "activeIntentId": str(getattr(pilot, "active_intent_id", None)) if getattr(pilot, "active_intent_id", None) else None,
        "reopenedAt": getattr(pilot, "reopened_at", None),
        "reopenedBy": getattr(pilot, "reopened_by", None),
        "safetyStatus": "assisted_live_pilot_controls_only",
    }
    return success_response(payload)


@router.post("/live/safety/reopen")
def reopen_live_safety_route(
    request: dict,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    confirm_reopen = bool(request.get("confirmReopen", False))
    actor = str(request.get("actor", "local-user"))
    pilot = LiveOrderStateRepository(session).reopen_after_hard_stop(actor=actor, confirm_reopen=confirm_reopen)
    session.commit()
    payload = {
        "status": getattr(pilot, "status", None),
        "reasonCode": getattr(pilot, "hard_stop_reason_code", None),
        "activeIntentId": str(getattr(pilot, "active_intent_id", None)) if getattr(pilot, "active_intent_id", None) else None,
        "reopenedAt": getattr(pilot, "reopened_at", None),
        "reopenedBy": getattr(pilot, "reopened_by", None),
        "safetyStatus": "assisted_live_pilot_controls_only",
    }
    return success_response(payload)
