from __future__ import annotations

from decimal import Decimal
import hashlib
import hmac
from urllib.parse import parse_qs

import httpx
import pytest

from tradelab_api.services.live_connector_contract import ConnectorOrderRequest, LiveOrderState
from tradelab_api.services.real_binance_spot_live_connector import (
    BINANCE_SPOT_LIVE_ORDER_SAFETY_STATUS,
    RealBinanceSpotLiveConnector,
    RealBinanceSpotLiveConnectorError,
    build_signed_order_lookup_query,
    build_signed_order_query,
)


class RecordingTransport(httpx.BaseTransport):
    def __init__(self, response: httpx.Response) -> None:
        self.response = response
        self.requests: list[httpx.Request] = []

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return self.response


def _request(**overrides) -> ConnectorOrderRequest:
    values = {
        "symbol": "BTCUSDT",
        "side": "buy",
        "order_type": "market",
        "quantity": None,
        "quote_quantity": Decimal("25"),
        "client_order_id": "tl-live-client-1",
        "metadata": {"intentId": "intent-1", "previewId": "preview-1"},
    }
    values.update(overrides)
    return ConnectorOrderRequest(**values)


def _signature(secret: str, unsigned_query: str) -> str:
    return hmac.new(secret.encode("utf-8"), unsigned_query.encode("utf-8"), hashlib.sha256).hexdigest()


def test_build_signed_order_query_uses_quote_order_quantity() -> None:
    query = build_signed_order_query(order_request=_request(), api_secret="LIVE-SECRET", timestamp_ms=1700000000000, recv_window_ms=5000)
    parsed = parse_qs(query)
    unsigned = "symbol=BTCUSDT&side=BUY&type=MARKET&quoteOrderQty=25&newClientOrderId=tl-live-client-1&timestamp=1700000000000&recvWindow=5000"
    assert parsed["quoteOrderQty"] == ["25"]
    assert parsed["signature"] == [_signature("LIVE-SECRET", unsigned)]


def test_build_signed_order_lookup_query_uses_orig_client_order_id() -> None:
    query = build_signed_order_lookup_query(order_request=_request(), api_secret="LIVE-SECRET", timestamp_ms=1700000000000, recv_window_ms=5000)
    parsed = parse_qs(query)
    assert parsed["origClientOrderId"] == ["tl-live-client-1"]


def test_connector_rejects_live_base_url() -> None:
    with pytest.raises(RealBinanceSpotLiveConnectorError) as exc:
        RealBinanceSpotLiveConnector(base_url="https://testnet.binance.vision")
    assert exc.value.reason_code == "live_order_submit_base_url_not_allowed"


def test_submit_success_returns_sanitized_submitted_snapshot() -> None:
    transport = RecordingTransport(httpx.Response(200, json={"orderId": 12345, "clientOrderId": "tl-live-client-1", "status": "NEW", "executedQty": "0", "cummulativeQuoteQty": "0"}))
    client = httpx.Client(transport=transport)
    connector = RealBinanceSpotLiveConnector(base_url="https://api.binance.com", http_client=client)

    result = connector.submit_order(_request(), api_key="LIVE-KEY", api_secret="LIVE-SECRET", recv_window_ms=5000, request_time_ms=1700000000000)

    assert result.reason_code == "live_order_submit_binance_accepted"
    assert result.snapshot is not None
    assert result.snapshot.state == LiveOrderState.SUBMITTED
    assert result.metadata["safetyStatus"] == BINANCE_SPOT_LIVE_ORDER_SAFETY_STATUS
    assert "LIVE-SECRET" not in str(result.metadata)


def test_submit_malformed_success_maps_to_unknown() -> None:
    connector = RealBinanceSpotLiveConnector(http_client=httpx.Client(transport=RecordingTransport(httpx.Response(200, json={"clientOrderId": "tl-live-client-1"}))))
    result = connector.submit_order(_request(), api_key="KEY", api_secret="SECRET", recv_window_ms=5000, request_time_ms=1700000000000)
    assert result.reason_code == "live_order_submit_binance_malformed_response_unknown"
    assert result.snapshot.state == LiveOrderState.UNKNOWN


def test_cancel_not_found_requires_reconciliation() -> None:
    connector = RealBinanceSpotLiveConnector(http_client=httpx.Client(transport=RecordingTransport(httpx.Response(400, json={"code": -2011, "msg": "Unknown order sent."}))))
    result = connector.cancel_order(_request(), api_key="KEY", api_secret="SECRET", recv_window_ms=5000, request_time_ms=1700000000000)
    assert result.reason_code == "live_order_cancel_binance_not_found_reconciliation_required"
    assert result.snapshot.state == LiveOrderState.RECONCILIATION_REQUIRED


@pytest.mark.parametrize(
    ("binance_status", "expected_state"),
    [
        ("NEW", LiveOrderState.SUBMITTED),
        ("PARTIALLY_FILLED", LiveOrderState.PARTIALLY_FILLED),
        ("FILLED", LiveOrderState.FILLED),
        ("CANCELED", LiveOrderState.CANCELLED),
        ("REJECTED", LiveOrderState.REJECTED),
    ],
)
def test_reconcile_maps_binance_statuses(binance_status: str, expected_state: LiveOrderState) -> None:
    connector = RealBinanceSpotLiveConnector(http_client=httpx.Client(transport=RecordingTransport(httpx.Response(200, json={"orderId": 12345, "clientOrderId": "tl-live-client-1", "status": binance_status, "executedQty": "0.01", "cummulativeQuoteQty": "600"}))))

    result = connector.reconcile(_request(), api_key="KEY", api_secret="SECRET", recv_window_ms=5000, request_time_ms=1700000000000)

    assert result.reason_code == "live_order_reconcile_binance_matched"
    assert result.snapshot.state == expected_state
