from __future__ import annotations

from decimal import Decimal
import hashlib
import hmac
from urllib.parse import parse_qs

import httpx
import pytest

from tradelab_api.services.real_binance_spot_testnet_connector import (
    BINANCE_SPOT_TESTNET_ORDER_SAFETY_STATUS,
    RealBinanceSpotTestnetConnector,
    RealBinanceSpotTestnetConnectorError,
    build_signed_order_query,
    build_signed_order_lookup_query,
)
from tradelab_api.services.testnet_connector_contract import ConnectorOrderRequest, TestnetOrderState


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
        "client_order_id": "tltn-client-1",
        "metadata": {"intentId": "intent-1", "previewId": "preview-1"},
    }
    values.update(overrides)
    return ConnectorOrderRequest(**values)


def _signature(secret: str, unsigned_query: str) -> str:
    return hmac.new(secret.encode("utf-8"), unsigned_query.encode("utf-8"), hashlib.sha256).hexdigest()


def test_build_signed_order_query_uses_quote_order_quantity() -> None:
    query = build_signed_order_query(
        order_request=_request(),
        api_secret="TESTNET-SECRET",
        timestamp_ms=1700000000000,
        recv_window_ms=5000,
    )
    parsed = parse_qs(query)
    unsigned = "symbol=BTCUSDT&side=BUY&type=MARKET&quoteOrderQty=25&newClientOrderId=tltn-client-1&timestamp=1700000000000&recvWindow=5000"
    assert parsed["quoteOrderQty"] == ["25"]
    assert "quantity" not in parsed
    assert parsed["signature"] == [_signature("TESTNET-SECRET", unsigned)]


def test_build_signed_order_query_uses_base_quantity() -> None:
    query = build_signed_order_query(
        order_request=_request(quantity=Decimal("0.0025"), quote_quantity=None, side="sell"),
        api_secret="TESTNET-SECRET",
        timestamp_ms=1700000000000,
        recv_window_ms=5000,
    )
    parsed = parse_qs(query)
    assert parsed["side"] == ["SELL"]
    assert parsed["quantity"] == ["0.0025"]
    assert "quoteOrderQty" not in parsed


def test_build_signed_order_lookup_query_uses_orig_client_order_id() -> None:
    query = build_signed_order_lookup_query(
        order_request=_request(),
        api_secret="TESTNET-SECRET",
        timestamp_ms=1700000000000,
        recv_window_ms=5000,
    )
    parsed = parse_qs(query)
    unsigned = "symbol=BTCUSDT&origClientOrderId=tltn-client-1&timestamp=1700000000000&recvWindow=5000"

    assert parsed["symbol"] == ["BTCUSDT"]
    assert parsed["origClientOrderId"] == ["tltn-client-1"]
    assert parsed["signature"] == [_signature("TESTNET-SECRET", unsigned)]
    assert "newClientOrderId" not in parsed


def test_connector_rejects_live_base_url() -> None:
    with pytest.raises(RealBinanceSpotTestnetConnectorError) as exc:
        RealBinanceSpotTestnetConnector(base_url="https://api.binance.com")
    assert exc.value.reason_code == "testnet_order_submit_base_url_not_allowed"


def test_submit_success_returns_sanitized_submitted_snapshot() -> None:
    transport = RecordingTransport(httpx.Response(200, json={"orderId": 12345, "clientOrderId": "tltn-client-1", "status": "NEW", "executedQty": "0", "cummulativeQuoteQty": "0"}))
    client = httpx.Client(transport=transport)
    connector = RealBinanceSpotTestnetConnector(base_url="https://testnet.binance.vision", http_client=client)

    result = connector.submit_order(
        _request(),
        api_key="TESTNET-KEY",
        api_secret="TESTNET-SECRET",
        recv_window_ms=5000,
        request_time_ms=1700000000000,
    )

    assert result.reason_code == "testnet_order_submit_binance_accepted"
    assert result.snapshot is not None
    assert result.snapshot.state == TestnetOrderState.SUBMITTED
    assert result.snapshot.exchange_order_id == "12345"
    assert result.metadata["safetyStatus"] == BINANCE_SPOT_TESTNET_ORDER_SAFETY_STATUS
    assert result.metadata["endpoint"] == "POST /api/v3/order"
    assert "TESTNET-KEY" not in str(result.metadata)
    assert "TESTNET-SECRET" not in str(result.metadata)
    assert "signature" not in str(result.metadata).lower()
    sent = transport.requests[0]
    assert sent.method == "POST"
    assert sent.url.host == "testnet.binance.vision"
    assert sent.url.path == "/api/v3/order"
    assert sent.headers["X-MBX-APIKEY"] == "TESTNET-KEY"


@pytest.mark.parametrize(
    ("status_code", "body", "reason_code"),
    [
        (400, {"code": -1013, "msg": "Filter failure"}, "testnet_order_submit_binance_rejected"),
        (401, {"code": -2015, "msg": "Invalid API-key"}, "testnet_order_submit_binance_rejected"),
        (403, {"code": -2015, "msg": "Forbidden"}, "testnet_order_submit_binance_rejected"),
    ],
)
def test_submit_rejects_known_bad_request(status_code: int, body: dict[str, object], reason_code: str) -> None:
    connector = RealBinanceSpotTestnetConnector(http_client=httpx.Client(transport=RecordingTransport(httpx.Response(status_code, json=body))))
    result = connector.submit_order(_request(), api_key="KEY", api_secret="SECRET", recv_window_ms=5000, request_time_ms=1700000000000)
    assert result.reason_code == reason_code
    assert result.snapshot is not None
    assert result.snapshot.state == TestnetOrderState.REJECTED
    assert "SECRET" not in str(result.metadata)


@pytest.mark.parametrize(
    ("status_code", "reason_code"),
    [
        (429, "testnet_order_submit_binance_rate_limited_unknown"),
        (500, "testnet_order_submit_binance_unavailable_unknown"),
    ],
)
def test_submit_maps_ambiguous_http_errors_to_unknown(status_code: int, reason_code: str) -> None:
    connector = RealBinanceSpotTestnetConnector(http_client=httpx.Client(transport=RecordingTransport(httpx.Response(status_code, json={"code": -1003, "msg": "busy"}))))
    result = connector.submit_order(_request(), api_key="KEY", api_secret="SECRET", recv_window_ms=5000, request_time_ms=1700000000000)
    assert result.reason_code == reason_code
    assert result.snapshot is not None
    assert result.snapshot.state == TestnetOrderState.UNKNOWN


def test_submit_timeout_maps_to_unknown_without_secret_echo() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("timeout with SECRET", request=request)

    connector = RealBinanceSpotTestnetConnector(http_client=httpx.Client(transport=httpx.MockTransport(handler)))
    result = connector.submit_order(_request(), api_key="KEY", api_secret="SECRET", recv_window_ms=5000, request_time_ms=1700000000000)
    assert result.reason_code == "testnet_order_submit_binance_timeout_unknown"
    assert result.snapshot is not None
    assert result.snapshot.state == TestnetOrderState.UNKNOWN
    assert "SECRET" not in str(result.metadata)


def test_submit_malformed_success_maps_to_unknown() -> None:
    connector = RealBinanceSpotTestnetConnector(http_client=httpx.Client(transport=RecordingTransport(httpx.Response(200, json={"clientOrderId": "tltn-client-1"}))))
    result = connector.submit_order(_request(), api_key="KEY", api_secret="SECRET", recv_window_ms=5000, request_time_ms=1700000000000)
    assert result.reason_code == "testnet_order_submit_binance_malformed_response_unknown"
    assert result.snapshot is not None
    assert result.snapshot.state == TestnetOrderState.UNKNOWN


def test_cancel_success_returns_cancelled_snapshot_without_secret_echo() -> None:
    transport = RecordingTransport(httpx.Response(200, json={"orderId": 12345, "clientOrderId": "tltn-client-1", "status": "CANCELED", "executedQty": "0", "cummulativeQuoteQty": "0"}))
    client = httpx.Client(transport=transport)
    connector = RealBinanceSpotTestnetConnector(base_url="https://testnet.binance.vision", http_client=client)

    result = connector.cancel_order(
        _request(),
        api_key="TESTNET-KEY",
        api_secret="TESTNET-SECRET",
        recv_window_ms=5000,
        request_time_ms=1700000000000,
    )

    assert result.reason_code == "testnet_order_cancel_binance_accepted"
    assert result.snapshot is not None
    assert result.snapshot.state == TestnetOrderState.CANCELLED
    assert result.snapshot.exchange_order_id == "12345"
    assert result.metadata["endpoint"] == "DELETE /api/v3/order"
    assert "TESTNET-SECRET" not in str(result.metadata)
    sent = transport.requests[0]
    assert sent.method == "DELETE"
    assert sent.url.host == "testnet.binance.vision"
    assert sent.url.path == "/api/v3/order"
    assert sent.headers["X-MBX-APIKEY"] == "TESTNET-KEY"


def test_cancel_filled_race_returns_filled_snapshot() -> None:
    connector = RealBinanceSpotTestnetConnector(http_client=httpx.Client(transport=RecordingTransport(httpx.Response(200, json={"orderId": 12345, "clientOrderId": "tltn-client-1", "status": "FILLED", "executedQty": "0.01", "cummulativeQuoteQty": "600"}))))

    result = connector.cancel_order(_request(), api_key="KEY", api_secret="SECRET", recv_window_ms=5000, request_time_ms=1700000000000)

    assert result.reason_code == "testnet_order_cancel_binance_filled_race"
    assert result.snapshot is not None
    assert result.snapshot.state == TestnetOrderState.FILLED
    assert result.snapshot.executed_quantity == Decimal("0.01")


def test_cancel_not_found_requires_reconciliation() -> None:
    connector = RealBinanceSpotTestnetConnector(http_client=httpx.Client(transport=RecordingTransport(httpx.Response(400, json={"code": -2011, "msg": "Unknown order sent."}))))

    result = connector.cancel_order(_request(), api_key="KEY", api_secret="SECRET", recv_window_ms=5000, request_time_ms=1700000000000)

    assert result.reason_code == "testnet_order_cancel_binance_not_found_reconciliation_required"
    assert result.snapshot is not None
    assert result.snapshot.state == TestnetOrderState.RECONCILIATION_REQUIRED


@pytest.mark.parametrize(
    ("binance_status", "expected_state"),
    [
        ("NEW", TestnetOrderState.SUBMITTED),
        ("PARTIALLY_FILLED", TestnetOrderState.PARTIALLY_FILLED),
        ("FILLED", TestnetOrderState.FILLED),
        ("CANCELED", TestnetOrderState.CANCELLED),
        ("REJECTED", TestnetOrderState.REJECTED),
        ("EXPIRED", TestnetOrderState.REJECTED),
    ],
)
def test_reconcile_maps_binance_statuses(binance_status: str, expected_state: TestnetOrderState) -> None:
    connector = RealBinanceSpotTestnetConnector(http_client=httpx.Client(transport=RecordingTransport(httpx.Response(200, json={"orderId": 12345, "clientOrderId": "tltn-client-1", "status": binance_status, "executedQty": "0.01", "cummulativeQuoteQty": "600"}))))

    result = connector.reconcile_order(_request(), api_key="KEY", api_secret="SECRET", recv_window_ms=5000, request_time_ms=1700000000000)

    assert result.reason_code == "testnet_order_reconcile_binance_matched"
    assert result.snapshot is not None
    assert result.snapshot.state == expected_state
    assert "SECRET" not in str(result.metadata)


def test_reconcile_not_found_returns_reconciliation_required() -> None:
    connector = RealBinanceSpotTestnetConnector(http_client=httpx.Client(transport=RecordingTransport(httpx.Response(400, json={"code": -2013, "msg": "Order does not exist."}))))

    result = connector.reconcile_order(_request(), api_key="KEY", api_secret="SECRET", recv_window_ms=5000, request_time_ms=1700000000000)

    assert result.reason_code == "testnet_order_reconcile_binance_not_found"
    assert result.snapshot is not None
    assert result.snapshot.state == TestnetOrderState.RECONCILIATION_REQUIRED
