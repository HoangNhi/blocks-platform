from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
import hashlib
import hmac
from typing import Any
from urllib.parse import urlencode, urlparse

import httpx

from tradelab_api.services.credential_redaction import sanitize_credential_payload
from tradelab_api.services.live_connector_contract import (
    ConnectorCancelResult,
    ConnectorEnvironmentFingerprint,
    ConnectorOrderRequest,
    ConnectorOrderPreviewResult,
    ConnectorOrderSnapshot,
    ConnectorOutcome,
    ConnectorReconciliationResult,
    ConnectorSubmitResult,
    LiveOrderState,
)

BINANCE_SPOT_LIVE_ORDER_SAFETY_STATUS = "assisted_live_real_submit_live_only"
BINANCE_LIVE_ORDER_ENDPOINT = "POST /api/v3/order"
BINANCE_LIVE_CANCEL_ENDPOINT = "DELETE /api/v3/order"
BINANCE_LIVE_RECONCILE_ENDPOINT = "GET /api/v3/order"
BINANCE_SPOT_LIVE_CANCEL_SAFETY_STATUS = "assisted_live_cancel_live_only"
BINANCE_SPOT_LIVE_RECONCILE_SAFETY_STATUS = "assisted_live_reconcile_live_only"
BINANCE_LIVE_DEFAULT_BASE_URL = "https://api.binance.com"
ALLOWED_LIVE_HOSTS = {"api.binance.com"}


class RealBinanceSpotLiveConnectorError(ValueError):
    def __init__(self, reason_code: str) -> None:
        super().__init__(reason_code)
        self.reason_code = reason_code


@dataclass(frozen=True)
class SubmitHttpEvidence:
    http_status: int | None
    binance_error_code: int | None = None
    binance_error_msg: str | None = None


def _decimal_text(value: Decimal) -> str:
    return format(value.normalize(), "f")


def build_signed_order_query(
    *,
    order_request: ConnectorOrderRequest,
    api_secret: str,
    timestamp_ms: int,
    recv_window_ms: int,
) -> str:
    pairs: list[tuple[str, str]] = [
        ("symbol", order_request.symbol.upper()),
        ("side", order_request.side.upper()),
        ("type", order_request.order_type.upper()),
    ]
    if order_request.quantity is not None:
        pairs.append(("quantity", _decimal_text(order_request.quantity)))
    elif order_request.quote_quantity is not None:
        pairs.append(("quoteOrderQty", _decimal_text(order_request.quote_quantity)))
    else:
        raise RealBinanceSpotLiveConnectorError("live_order_submit_signed_request_failed")
    pairs.extend(
        [
            ("newClientOrderId", order_request.client_order_id),
            ("timestamp", str(timestamp_ms)),
            ("recvWindow", str(recv_window_ms)),
        ]
    )
    unsigned_query = urlencode(pairs)
    signature = hmac.new(api_secret.encode("utf-8"), unsigned_query.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{unsigned_query}&signature={signature}"


def build_signed_order_lookup_query(
    *,
    order_request: ConnectorOrderRequest,
    api_secret: str,
    timestamp_ms: int,
    recv_window_ms: int,
) -> str:
    pairs: list[tuple[str, str]] = [
        ("symbol", order_request.symbol.upper()),
        ("origClientOrderId", order_request.client_order_id),
        ("timestamp", str(timestamp_ms)),
        ("recvWindow", str(recv_window_ms)),
    ]
    unsigned_query = urlencode(pairs)
    signature = hmac.new(api_secret.encode("utf-8"), unsigned_query.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{unsigned_query}&signature={signature}"


class RealBinanceSpotLiveConnector:
    def __init__(
        self,
        *,
        base_url: str = BINANCE_LIVE_DEFAULT_BASE_URL,
        timeout_seconds: float = 5.0,
        http_client: httpx.Client | None = None,
    ) -> None:
        parsed = urlparse(base_url)
        if parsed.scheme != "https" or parsed.hostname not in ALLOWED_LIVE_HOSTS or base_url.rstrip("/") != BINANCE_LIVE_DEFAULT_BASE_URL:
            raise RealBinanceSpotLiveConnectorError("live_order_submit_base_url_not_allowed")
        self._base_url = base_url.rstrip("/")
        self._base_url_host = parsed.hostname or ""
        self._timeout_seconds = timeout_seconds
        self._http_client = http_client

    def get_environment(self) -> ConnectorEnvironmentFingerprint:
        return ConnectorEnvironmentFingerprint(
            exchange="binance_spot",
            environment="binance_live",
            base_url_host=self._base_url_host,
            endpoint_fingerprint="binance_spot_live_real",
        )

    def build_client_order_id(self, order_intent_fingerprint: str) -> str:
        digest = hashlib.sha256(order_intent_fingerprint.encode("utf-8")).hexdigest()[:24]
        return f"tl-live-{digest}"

    def preview_order(self, order_request: ConnectorOrderRequest):
        return ConnectorOrderPreviewResult(
            outcome=ConnectorOutcome.PREVIEWED,
            reason_code="live_connector_preview_created",
            environment=self.get_environment(),
            metadata={"symbol": order_request.symbol},
        )

    def submit_order(
        self,
        order_request: ConnectorOrderRequest,
        *,
        api_key: str,
        api_secret: str,
        recv_window_ms: int,
        request_time_ms: int,
    ) -> ConnectorSubmitResult:
        try:
            query = build_signed_order_query(
                order_request=order_request,
                api_secret=api_secret,
                timestamp_ms=request_time_ms,
                recv_window_ms=recv_window_ms,
            )
        except RealBinanceSpotLiveConnectorError:
            return self._unknown_result(order_request, "live_order_submit_signed_request_failed", None)

        client = self._http_client or httpx.Client(timeout=self._timeout_seconds)
        close_client = self._http_client is None
        try:
            response = client.post(f"{self._base_url}/api/v3/order?{query}", headers={"X-MBX-APIKEY": api_key})
        except httpx.TimeoutException:
            return self._unknown_result(order_request, "live_order_submit_binance_timeout_unknown", None)
        except httpx.TransportError:
            return self._unknown_result(order_request, "live_order_submit_binance_ambiguous_unknown", None)
        finally:
            if close_client:
                client.close()

        body = self._safe_json(response)
        evidence = self._http_evidence(response.status_code, body)
        if 200 <= response.status_code < 300:
            return self._success_or_unknown(order_request, body, evidence)
        if response.status_code in {400, 401, 403}:
            return self._rejected_result(order_request, "live_order_submit_binance_rejected", evidence)
        if response.status_code == 429:
            return self._unknown_result(order_request, "live_order_submit_binance_rate_limited_unknown", evidence)
        if response.status_code >= 500:
            return self._unknown_result(order_request, "live_order_submit_binance_unavailable_unknown", evidence)
        return self._unknown_result(order_request, "live_order_submit_binance_ambiguous_unknown", evidence)

    def cancel_order(
        self,
        order_request: ConnectorOrderRequest,
        *,
        api_key: str,
        api_secret: str,
        recv_window_ms: int,
        request_time_ms: int,
    ) -> ConnectorCancelResult:
        query = build_signed_order_lookup_query(
            order_request=order_request,
            api_secret=api_secret,
            timestamp_ms=request_time_ms,
            recv_window_ms=recv_window_ms,
        )
        client = self._http_client or httpx.Client(timeout=self._timeout_seconds)
        close_client = self._http_client is None
        try:
            response = client.delete(f"{self._base_url}/api/v3/order?{query}", headers={"X-MBX-APIKEY": api_key})
        except httpx.TimeoutException:
            return self._cancel_unknown_result(order_request, "live_order_cancel_binance_timeout_unknown", None)
        except httpx.TransportError:
            return self._cancel_unknown_result(order_request, "live_order_cancel_binance_ambiguous_unknown", None)
        finally:
            if close_client:
                client.close()

        body = self._safe_json(response)
        evidence = self._http_evidence(response.status_code, body)
        if 200 <= response.status_code < 300:
            return self._cancel_success_or_unknown(order_request, body, evidence)
        if isinstance(body, dict) and body.get("code") == -2011:
            return self._cancel_reconciliation_required(
                order_request,
                "live_order_cancel_binance_not_found_reconciliation_required",
                evidence,
            )
        if response.status_code in {429} or response.status_code >= 500:
            return self._cancel_unknown_result(order_request, "live_order_cancel_binance_ambiguous_unknown", evidence)
        return self._cancel_reconciliation_required(
            order_request,
            "live_order_cancel_binance_not_found_reconciliation_required",
            evidence,
        )

    def reconcile(
        self,
        order_request: ConnectorOrderRequest,
        *,
        api_key: str,
        api_secret: str,
        recv_window_ms: int,
        request_time_ms: int,
    ) -> ConnectorReconciliationResult:
        query = build_signed_order_lookup_query(
            order_request=order_request,
            api_secret=api_secret,
            timestamp_ms=request_time_ms,
            recv_window_ms=recv_window_ms,
        )
        client = self._http_client or httpx.Client(timeout=self._timeout_seconds)
        close_client = self._http_client is None
        try:
            response = client.get(f"{self._base_url}/api/v3/order?{query}", headers={"X-MBX-APIKEY": api_key})
        except httpx.TimeoutException:
            return self._reconcile_required_result(order_request, "live_order_reconcile_binance_ambiguous", None)
        except httpx.TransportError:
            return self._reconcile_required_result(order_request, "live_order_reconcile_binance_ambiguous", None)
        finally:
            if close_client:
                client.close()

        body = self._safe_json(response)
        evidence = self._http_evidence(response.status_code, body)
        if 200 <= response.status_code < 300:
            return self._reconcile_success_or_required(order_request, body, evidence)
        if isinstance(body, dict) and body.get("code") in {-2011, -2013}:
            return self._reconcile_required_result(order_request, "live_order_reconcile_binance_not_found", evidence)
        return self._reconcile_required_result(order_request, "live_order_reconcile_binance_ambiguous", evidence)

    def _success_or_unknown(
        self,
        order_request: ConnectorOrderRequest,
        body: dict[str, Any] | list[Any] | None,
        evidence: SubmitHttpEvidence,
    ) -> ConnectorSubmitResult:
        if not isinstance(body, dict) or body.get("orderId") is None:
            return self._unknown_result(order_request, "live_order_submit_binance_malformed_response_unknown", evidence)
        snapshot = ConnectorOrderSnapshot(
            state=LiveOrderState.SUBMITTED,
            client_order_id=str(body.get("clientOrderId") or order_request.client_order_id),
            exchange_order_id=str(body.get("orderId")),
            symbol=body.get("symbol") or order_request.symbol,
            executed_quantity=Decimal(str(body.get("executedQty", "0"))),
            cumulative_quote_quantity=Decimal(str(body.get("cummulativeQuoteQty", "0"))),
            reason_code="live_order_submit_binance_accepted",
            metadata=sanitize_credential_payload({"exchangeOrderStatus": body.get("status")}),
        )
        return ConnectorSubmitResult(
            outcome=ConnectorOutcome.ACCEPTED,
            reason_code="live_order_submit_binance_accepted",
            snapshot=snapshot,
            metadata=self._metadata(evidence, exchange_order_status=body.get("status")),
        )

    def _rejected_result(self, order_request: ConnectorOrderRequest, reason_code: str, evidence: SubmitHttpEvidence) -> ConnectorSubmitResult:
        snapshot = ConnectorOrderSnapshot(
            state=LiveOrderState.REJECTED,
            client_order_id=order_request.client_order_id,
            exchange_order_id=None,
            symbol=order_request.symbol,
            reason_code=reason_code,
            metadata=self._metadata(evidence),
        )
        return ConnectorSubmitResult(
            outcome=ConnectorOutcome.REJECTED,
            reason_code=reason_code,
            snapshot=snapshot,
            metadata=self._metadata(evidence),
        )

    def _unknown_result(
        self,
        order_request: ConnectorOrderRequest,
        reason_code: str,
        evidence: SubmitHttpEvidence | None,
    ) -> ConnectorSubmitResult:
        snapshot = ConnectorOrderSnapshot(
            state=LiveOrderState.UNKNOWN,
            client_order_id=order_request.client_order_id,
            exchange_order_id=None,
            symbol=order_request.symbol,
            reason_code=reason_code,
            metadata=self._metadata(evidence),
        )
        return ConnectorSubmitResult(
            outcome=ConnectorOutcome.UNKNOWN,
            reason_code=reason_code,
            snapshot=snapshot,
            metadata=self._metadata(evidence),
        )

    def _cancel_success_or_unknown(
        self,
        order_request: ConnectorOrderRequest,
        body: dict[str, Any] | list[Any] | None,
        evidence: SubmitHttpEvidence,
    ) -> ConnectorCancelResult:
        snapshot = self._snapshot_from_body(order_request, body, default_reason="live_order_cancel_binance_accepted")
        if snapshot is None:
            return self._cancel_unknown_result(order_request, "live_order_cancel_binance_ambiguous_unknown", evidence)
        reason = "live_order_cancel_binance_accepted"
        outcome = ConnectorOutcome.CANCELLED
        if snapshot.state in {LiveOrderState.FILLED, LiveOrderState.PARTIALLY_FILLED}:
            reason = "live_order_cancel_binance_filled_race"
            outcome = ConnectorOutcome.FILLED if snapshot.state == LiveOrderState.FILLED else ConnectorOutcome.PARTIALLY_FILLED
        return ConnectorCancelResult(
            outcome=outcome,
            reason_code=reason,
            snapshot=snapshot,
            metadata=self._operation_metadata(
                evidence,
                endpoint=BINANCE_LIVE_CANCEL_ENDPOINT,
                safety_status=BINANCE_SPOT_LIVE_CANCEL_SAFETY_STATUS,
                exchange_order_status=snapshot.metadata.get("exchangeOrderStatus"),
            ),
        )

    def _reconcile_success_or_required(
        self,
        order_request: ConnectorOrderRequest,
        body: dict[str, Any] | list[Any] | None,
        evidence: SubmitHttpEvidence,
    ) -> ConnectorReconciliationResult:
        snapshot = self._snapshot_from_body(order_request, body, default_reason="live_order_reconcile_binance_matched")
        if snapshot is None:
            return self._reconcile_required_result(order_request, "live_order_reconcile_binance_ambiguous", evidence)
        return ConnectorReconciliationResult(
            outcome=_outcome_from_state(snapshot.state),
            reason_code="live_order_reconcile_binance_matched",
            snapshot=snapshot,
            metadata=self._operation_metadata(
                evidence,
                endpoint=BINANCE_LIVE_RECONCILE_ENDPOINT,
                safety_status=BINANCE_SPOT_LIVE_RECONCILE_SAFETY_STATUS,
                exchange_order_status=snapshot.metadata.get("exchangeOrderStatus"),
            ),
        )

    def _snapshot_from_body(
        self,
        order_request: ConnectorOrderRequest,
        body: dict[str, Any] | list[Any] | None,
        *,
        default_reason: str,
    ) -> ConnectorOrderSnapshot | None:
        if not isinstance(body, dict) or body.get("orderId") is None:
            return None
        exchange_status = str(body.get("status") or "").upper()
        state = _state_from_binance_status(exchange_status)
        return ConnectorOrderSnapshot(
            state=state,
            client_order_id=str(body.get("clientOrderId") or order_request.client_order_id),
            exchange_order_id=str(body.get("orderId")),
            symbol=body.get("symbol") or order_request.symbol,
            executed_quantity=Decimal(str(body.get("executedQty", "0"))),
            cumulative_quote_quantity=Decimal(str(body.get("cummulativeQuoteQty", "0"))),
            reason_code=default_reason,
            metadata=sanitize_credential_payload({"exchangeOrderStatus": exchange_status}),
        )

    def _cancel_unknown_result(
        self,
        order_request: ConnectorOrderRequest,
        reason_code: str,
        evidence: SubmitHttpEvidence | None,
    ) -> ConnectorCancelResult:
        snapshot = ConnectorOrderSnapshot(
            state=LiveOrderState.UNKNOWN,
            client_order_id=order_request.client_order_id,
            symbol=order_request.symbol,
            reason_code=reason_code,
            metadata=self._operation_metadata(
                evidence,
                endpoint=BINANCE_LIVE_CANCEL_ENDPOINT,
                safety_status=BINANCE_SPOT_LIVE_CANCEL_SAFETY_STATUS,
            ),
        )
        return ConnectorCancelResult(
            outcome=ConnectorOutcome.UNKNOWN,
            reason_code=reason_code,
            snapshot=snapshot,
            metadata=self._operation_metadata(
                evidence,
                endpoint=BINANCE_LIVE_CANCEL_ENDPOINT,
                safety_status=BINANCE_SPOT_LIVE_CANCEL_SAFETY_STATUS,
            ),
        )

    def _cancel_reconciliation_required(
        self,
        order_request: ConnectorOrderRequest,
        reason_code: str,
        evidence: SubmitHttpEvidence | None,
    ) -> ConnectorCancelResult:
        snapshot = ConnectorOrderSnapshot(
            state=LiveOrderState.RECONCILIATION_REQUIRED,
            client_order_id=order_request.client_order_id,
            symbol=order_request.symbol,
            reason_code=reason_code,
            metadata=self._operation_metadata(
                evidence,
                endpoint=BINANCE_LIVE_CANCEL_ENDPOINT,
                safety_status=BINANCE_SPOT_LIVE_CANCEL_SAFETY_STATUS,
            ),
        )
        return ConnectorCancelResult(
            outcome=ConnectorOutcome.RECONCILIATION_REQUIRED,
            reason_code=reason_code,
            snapshot=snapshot,
            metadata=self._operation_metadata(
                evidence,
                endpoint=BINANCE_LIVE_CANCEL_ENDPOINT,
                safety_status=BINANCE_SPOT_LIVE_CANCEL_SAFETY_STATUS,
            ),
        )

    def _reconcile_required_result(
        self,
        order_request: ConnectorOrderRequest,
        reason_code: str,
        evidence: SubmitHttpEvidence | None,
    ) -> ConnectorReconciliationResult:
        snapshot = ConnectorOrderSnapshot(
            state=LiveOrderState.RECONCILIATION_REQUIRED,
            client_order_id=order_request.client_order_id,
            symbol=order_request.symbol,
            reason_code=reason_code,
            metadata=self._operation_metadata(
                evidence,
                endpoint=BINANCE_LIVE_RECONCILE_ENDPOINT,
                safety_status=BINANCE_SPOT_LIVE_RECONCILE_SAFETY_STATUS,
            ),
        )
        return ConnectorReconciliationResult(
            outcome=ConnectorOutcome.RECONCILIATION_REQUIRED,
            reason_code=reason_code,
            snapshot=snapshot,
            metadata=self._operation_metadata(
                evidence,
                endpoint=BINANCE_LIVE_RECONCILE_ENDPOINT,
                safety_status=BINANCE_SPOT_LIVE_RECONCILE_SAFETY_STATUS,
            ),
        )

    def _metadata(self, evidence: SubmitHttpEvidence | None, **extra: Any) -> dict[str, Any]:
        values = {
            "safetyStatus": BINANCE_SPOT_LIVE_ORDER_SAFETY_STATUS,
            "networkCall": True,
            "endpoint": BINANCE_LIVE_ORDER_ENDPOINT,
            "baseUrlHost": self._base_url_host,
            "connectorMode": "real",
            "httpStatus": evidence.http_status if evidence else None,
            "binanceErrorCode": evidence.binance_error_code if evidence else None,
            "binanceErrorMsg": evidence.binance_error_msg if evidence else None,
        }
        values.update(extra)
        return sanitize_credential_payload({key: value for key, value in values.items() if value is not None})

    def _operation_metadata(self, evidence: SubmitHttpEvidence | None, *, endpoint: str, safety_status: str, **extra: Any) -> dict[str, Any]:
        values = {
            "safetyStatus": safety_status,
            "networkCall": True,
            "endpoint": endpoint,
            "baseUrlHost": self._base_url_host,
            "connectorMode": "real",
            "httpStatus": evidence.http_status if evidence else None,
            "binanceErrorCode": evidence.binance_error_code if evidence else None,
            "binanceErrorMsg": evidence.binance_error_msg if evidence else None,
        }
        values.update(extra)
        return sanitize_credential_payload({key: value for key, value in values.items() if value is not None})

    @staticmethod
    def _safe_json(response: httpx.Response) -> dict[str, Any] | list[Any] | None:
        try:
            parsed = response.json()
        except ValueError:
            return None
        if isinstance(parsed, dict | list):
            return parsed
        return None

    @staticmethod
    def _http_evidence(status_code: int, body: dict[str, Any] | list[Any] | None) -> SubmitHttpEvidence:
        if isinstance(body, dict):
            code = body.get("code")
            msg = body.get("msg")
            return SubmitHttpEvidence(
                http_status=status_code,
                binance_error_code=code if isinstance(code, int) else None,
                binance_error_msg=str(msg)[:160] if msg is not None else None,
            )
        return SubmitHttpEvidence(http_status=status_code)


def _state_from_binance_status(status: str) -> LiveOrderState:
    if status == "NEW":
        return LiveOrderState.SUBMITTED
    if status == "PARTIALLY_FILLED":
        return LiveOrderState.PARTIALLY_FILLED
    if status == "FILLED":
        return LiveOrderState.FILLED
    if status == "CANCELED":
        return LiveOrderState.CANCELLED
    if status in {"REJECTED", "EXPIRED", "EXPIRED_IN_MATCH"}:
        return LiveOrderState.REJECTED
    return LiveOrderState.RECONCILIATION_REQUIRED


def _outcome_from_state(state: LiveOrderState) -> ConnectorOutcome:
    if state == LiveOrderState.CANCELLED:
        return ConnectorOutcome.CANCELLED
    if state == LiveOrderState.FILLED:
        return ConnectorOutcome.FILLED
    if state == LiveOrderState.PARTIALLY_FILLED:
        return ConnectorOutcome.PARTIALLY_FILLED
    if state == LiveOrderState.REJECTED:
        return ConnectorOutcome.REJECTED
    if state == LiveOrderState.SUBMITTED:
        return ConnectorOutcome.ACCEPTED
    return ConnectorOutcome.RECONCILIATION_REQUIRED
