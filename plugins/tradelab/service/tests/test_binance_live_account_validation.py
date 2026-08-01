from __future__ import annotations

import hashlib
import hmac
from collections.abc import Callable

import httpx
import pytest

from tradelab_api.services.binance_live_account_validation import (
    API_RESTRICTIONS_ENDPOINT,
    BINANCE_LIVE_VALIDATION_SAFETY_STATUS,
    ACCOUNT_ENDPOINT,
    BinanceLiveAccountValidationClient,
    BinanceLiveAccountValidationError,
    build_signed_account_query,
)


def expected_signature(secret: str, query: str) -> str:
    return hmac.new(secret.encode("utf-8"), query.encode("utf-8"), hashlib.sha256).hexdigest()


def make_client(handler: Callable[[httpx.Request], httpx.Response]) -> BinanceLiveAccountValidationClient:
    return BinanceLiveAccountValidationClient(
        http_client=httpx.Client(transport=httpx.MockTransport(handler)),
    )


def test_build_signed_account_query_is_deterministic() -> None:
    unsigned = "timestamp=1700000000000&recvWindow=5000"
    query = build_signed_account_query(api_secret="my-secret", timestamp_ms=1700000000000, recv_window_ms=5000)

    assert query == f"{unsigned}&signature={expected_signature('my-secret', unsigned)}"


def test_client_rejects_non_live_base_url() -> None:
    with pytest.raises(BinanceLiveAccountValidationError) as exc:
        BinanceLiveAccountValidationClient(base_url="https://testnet.binance.vision")

    assert exc.value.reason_code == "live_credential_validation_base_url_not_allowed"


def test_validate_account_uses_api_key_permissions_for_withdrawal_gate() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v3/time":
            return httpx.Response(200, json={"serverTime": 1700000000000})
        if request.url.path == "/sapi/v1/account/apiRestrictions":
            return httpx.Response(
                200,
                json={
                    "ipRestrict": True,
                    "enableReading": True,
                    "enableWithdrawals": False,
                    "enableInternalTransfer": False,
                    "enableMargin": False,
                    "enableFutures": False,
                    "enableSpotAndMarginTrading": True,
                    "enablePortfolioMarginTrading": False,
                },
            )
        if request.url.path == "/api/v3/account":
            return httpx.Response(
                200,
                json={
                    "accountType": "SPOT",
                    "canTrade": True,
                    "canWithdraw": True,
                    "canDeposit": True,
                    "permissions": ["TRD_GRP_071"],
                },
            )
        raise AssertionError(f"Unexpected path: {request.url.path}")

    client = make_client(handler)

    result = client.validate_account(
        api_key="LIVE-KEY",
        api_secret="LIVE-SECRET",
        recv_window_ms=5000,
        request_time_ms=1700000000000,
    )

    assert result.status == "passed"
    assert result.reason_code == "live_credential_binance_account_validated"
    assert result.credential_status == "validated_live_read_only"
    assert result.safety_status == BINANCE_LIVE_VALIDATION_SAFETY_STATUS
    assert result.evidence["endpoint"] == ACCOUNT_ENDPOINT
    assert result.evidence["apiKeyPermissionEndpoint"] == API_RESTRICTIONS_ENDPOINT
    assert result.evidence["canTrade"] is True
    assert result.evidence["canWithdraw"] is False
    assert result.evidence["accountCanWithdraw"] is True
    assert result.evidence["apiKeyCanWithdraw"] is False
    assert result.evidence["marginOrFuturesEnabled"] is False


def test_validate_account_blocks_withdrawal_enabled_on_api_key() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v3/time":
            return httpx.Response(200, json={"serverTime": 1700000000000})
        if request.url.path == "/sapi/v1/account/apiRestrictions":
            return httpx.Response(
                200,
                json={
                    "ipRestrict": True,
                    "enableReading": True,
                    "enableWithdrawals": True,
                    "enableInternalTransfer": False,
                    "enableMargin": False,
                    "enableFutures": False,
                    "enableSpotAndMarginTrading": True,
                    "enablePortfolioMarginTrading": False,
                },
            )
        if request.url.path == "/api/v3/account":
            return httpx.Response(
                200,
                json={"accountType": "SPOT", "canTrade": True, "canWithdraw": True, "canDeposit": True, "permissions": ["TRD_GRP_071"]},
            )
        raise AssertionError(f"Unexpected path: {request.url.path}")

    client = make_client(handler)
    result = client.validate_account(api_key="KEY", api_secret="SECRET", recv_window_ms=5000, request_time_ms=1700000000000)

    assert result.status == "blocked"
    assert result.reason_code == "live_credential_unsafe_permissions"
    assert result.credential_status == "unsafe_permissions"
    assert result.details["unsafePermission"] == "enableWithdrawals"


def test_validate_account_blocks_margin_or_futures_permission_when_detected() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v3/time":
            return httpx.Response(200, json={"serverTime": 1700000000000})
        if request.url.path == "/sapi/v1/account/apiRestrictions":
            return httpx.Response(
                200,
                json={
                    "ipRestrict": True,
                    "enableReading": True,
                    "enableWithdrawals": False,
                    "enableInternalTransfer": False,
                    "enableMargin": True,
                    "enableFutures": False,
                    "enableSpotAndMarginTrading": True,
                    "enablePortfolioMarginTrading": False,
                },
            )
        if request.url.path == "/api/v3/account":
            return httpx.Response(
                200,
                json={"accountType": "SPOT", "canTrade": True, "canWithdraw": True, "canDeposit": True, "permissions": ["TRD_GRP_071"]},
            )
        raise AssertionError(f"Unexpected path: {request.url.path}")

    client = make_client(handler)
    result = client.validate_account(api_key="KEY", api_secret="SECRET", recv_window_ms=5000, request_time_ms=1700000000000)

    assert result.status == "blocked"
    assert result.reason_code == "live_credential_unsafe_permissions"
    assert result.credential_status == "unsafe_permissions"
    assert result.details["unsafePermission"] == "marginOrFuturesEnabled"


def test_validate_account_blocks_when_trading_is_not_available() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v3/time":
            return httpx.Response(200, json={"serverTime": 1700000000000})
        if request.url.path == "/sapi/v1/account/apiRestrictions":
            return httpx.Response(
                200,
                json={
                    "ipRestrict": True,
                    "enableReading": True,
                    "enableWithdrawals": False,
                    "enableInternalTransfer": False,
                    "enableMargin": False,
                    "enableFutures": False,
                    "enableSpotAndMarginTrading": False,
                    "enablePortfolioMarginTrading": False,
                },
            )
        if request.url.path == "/api/v3/account":
            return httpx.Response(
                200,
                json={"accountType": "SPOT", "canTrade": True, "canWithdraw": True, "canDeposit": True, "permissions": ["TRD_GRP_071"]},
            )
        raise AssertionError(f"Unexpected path: {request.url.path}")

    client = make_client(handler)
    result = client.validate_account(api_key="KEY", api_secret="SECRET", recv_window_ms=5000, request_time_ms=1700000000000)

    assert result.status == "blocked"
    assert result.reason_code == "live_credential_unsafe_permissions"
    assert result.credential_status == "unsafe_permissions"
    assert result.details["unsafePermission"] == "canTrade"


@pytest.mark.parametrize(
    ("path", "status_code", "body", "reason_code"),
    [
        ("/sapi/v1/account/apiRestrictions", 401, {"code": -2015, "msg": "Invalid API-key"}, "live_credential_binance_invalid_key_or_signature"),
        ("/api/v3/account", 429, {"code": -1003, "msg": "Too many requests"}, "live_credential_binance_rate_limited"),
    ],
)
def test_validate_account_classifies_http_errors(path: str, status_code: int, body: dict[str, object], reason_code: str) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v3/time":
            return httpx.Response(200, json={"serverTime": 1700000000000})
        if request.url.path == path:
            return httpx.Response(status_code, json=body)
        if request.url.path == "/sapi/v1/account/apiRestrictions":
            return httpx.Response(
                200,
                json={
                    "ipRestrict": True,
                    "enableReading": True,
                    "enableWithdrawals": False,
                    "enableInternalTransfer": False,
                    "enableMargin": False,
                    "enableFutures": False,
                    "enableSpotAndMarginTrading": True,
                    "enablePortfolioMarginTrading": False,
                },
            )
        if request.url.path == "/api/v3/account":
            return httpx.Response(
                200,
                json={"accountType": "SPOT", "canTrade": True, "canWithdraw": True, "canDeposit": True, "permissions": ["TRD_GRP_071"]},
            )
        raise AssertionError(f"Unexpected path: {request.url.path}")

    client = make_client(handler)
    result = client.validate_account(api_key="KEY", api_secret="SECRET", recv_window_ms=5000, request_time_ms=1700000000000)

    assert result.status == "failed"
    assert result.reason_code == reason_code
    assert "endpoint" in result.details


def test_validate_account_timeout_is_sanitized() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.TimeoutException("timeout with SECRET", request=request)

    client = make_client(handler)
    result = client.validate_account(api_key="KEY", api_secret="SECRET", recv_window_ms=5000, request_time_ms=1700000000000)

    assert result.status == "failed"
    assert result.reason_code == "live_credential_binance_timeout"
    assert "SECRET" not in str(result.details)
