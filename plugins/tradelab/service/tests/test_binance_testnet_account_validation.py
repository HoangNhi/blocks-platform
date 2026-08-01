from __future__ import annotations

import hashlib
import hmac

import httpx
import pytest

from tradelab_api.services.binance_testnet_account_validation import (
    BINANCE_SPOT_TESTNET_VALIDATION_SAFETY_STATUS,
    BinanceAccountValidationClient,
    BinanceAccountValidationError,
    build_signed_account_query,
)

class RecordingTransport(httpx.BaseTransport):
    def __init__(self, response: httpx.Response) -> None:
        self.response = response
        self.requests: list[httpx.Request] = []

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return self.response

def expected_signature(secret: str, query: str) -> str:
    return hmac.new(secret.encode("utf-8"), query.encode("utf-8"), hashlib.sha256).hexdigest()

def test_build_signed_account_query_is_deterministic() -> None:
    unsigned = "timestamp=1700000000000&recvWindow=5000"
    query = build_signed_account_query(api_secret="my-secret", timestamp_ms=1700000000000, recv_window_ms=5000)
    assert query == f"{unsigned}&signature={expected_signature('my-secret', unsigned)}"

def test_client_rejects_non_testnet_base_url() -> None:
    with pytest.raises(BinanceAccountValidationError) as exc:
        BinanceAccountValidationClient(base_url="https://api.binance.com")
    assert exc.value.reason_code == "testnet_credential_validation_base_url_not_allowed"

def test_validate_account_success_returns_sanitized_evidence() -> None:
    transport = RecordingTransport(httpx.Response(200, json={"accountType": "SPOT", "canTrade": True, "canWithdraw": False, "canDeposit": True, "permissions": ["SPOT"], "balances": [{"asset": "BTC"}]}))
    client = BinanceAccountValidationClient(base_url="https://testnet.binance.vision", http_client=httpx.Client(transport=transport))

    result = client.validate_account(api_key="TESTNET-KEY", api_secret="TESTNET-SECRET", recv_window_ms=5000, request_time_ms=1700000000000)

    assert result.status == "passed"
    assert result.reason_code == "testnet_credential_binance_account_validated"
    assert result.credential_status == "validated_testnet_read_only"
    assert result.safety_status == BINANCE_SPOT_TESTNET_VALIDATION_SAFETY_STATUS
    assert result.evidence["networkCall"] is True
    assert result.evidence["endpoint"] == "GET /api/v3/account"
    assert result.evidence["baseUrlHost"] == "testnet.binance.vision"
    assert result.evidence["marginOrFuturesEnabled"] is False
    assert "balances" not in result.evidence
    assert "TESTNET-KEY" not in str(result.evidence)
    assert "TESTNET-SECRET" not in str(result.details)
    assert "signature" not in str(result.evidence)

def test_validate_account_allows_spot_testnet_with_withdraw_flag() -> None:
    client = BinanceAccountValidationClient(http_client=httpx.Client(transport=RecordingTransport(httpx.Response(200, json={"accountType": "SPOT", "canTrade": True, "canWithdraw": True, "canDeposit": True, "permissions": ["SPOT"]}))))
    result = client.validate_account(api_key="KEY", api_secret="SECRET", recv_window_ms=5000, request_time_ms=1700000000000)
    assert result.status == "passed"
    assert result.reason_code == "testnet_credential_binance_account_validated"
    assert result.credential_status == "validated_testnet_read_only"
    assert result.evidence["canWithdraw"] is True
    assert result.evidence["marginOrFuturesEnabled"] is False

def test_validate_account_blocks_margin_or_futures_permission_when_detected() -> None:
    client = BinanceAccountValidationClient(http_client=httpx.Client(transport=RecordingTransport(httpx.Response(200, json={"accountType": "SPOT", "canTrade": True, "canWithdraw": True, "canDeposit": True, "permissions": ["SPOT", "MARGIN"]}))))
    result = client.validate_account(api_key="KEY", api_secret="SECRET", recv_window_ms=5000, request_time_ms=1700000000000)
    assert result.status == "blocked"
    assert result.reason_code == "testnet_credential_unsafe_permissions"
    assert result.credential_status == "unsafe_permissions"
    assert result.details["unsafePermission"] == "marginOrFuturesEnabled"

@pytest.mark.parametrize(
    ("status_code", "body", "reason_code"),
    [
        (401, {"code": -2015, "msg": "Invalid API-key"}, "testnet_credential_binance_invalid_key_or_signature"),
        (400, {"code": -1021, "msg": "Timestamp outside recvWindow"}, "testnet_credential_binance_clock_skew"),
        (429, {"code": -1003, "msg": "Too many requests"}, "testnet_credential_binance_rate_limited"),
        (500, {"msg": "Internal error"}, "testnet_credential_binance_unavailable"),
    ],
)
def test_validate_account_classifies_http_errors(status_code: int, body: dict[str, object], reason_code: str) -> None:
    client = BinanceAccountValidationClient(http_client=httpx.Client(transport=RecordingTransport(httpx.Response(status_code, json=body))))
    result = client.validate_account(api_key="KEY", api_secret="SECRET", recv_window_ms=5000, request_time_ms=1700000000000)
    assert result.status == "failed"
    assert result.reason_code == reason_code
    assert "Invalid API-key" not in str(result.details)

def test_validate_account_timeout_is_sanitized() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("timeout with SECRET", request=request)

    client = BinanceAccountValidationClient(http_client=httpx.Client(transport=httpx.MockTransport(handler)))
    result = client.validate_account(api_key="KEY", api_secret="SECRET", recv_window_ms=5000, request_time_ms=1700000000000)
    assert result.status == "failed"
    assert result.reason_code == "testnet_credential_binance_timeout"
    assert "SECRET" not in str(result.details)
