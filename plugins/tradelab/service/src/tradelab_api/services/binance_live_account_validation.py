from __future__ import annotations

from dataclasses import dataclass, field
import hashlib
import hmac
from typing import Any
from urllib.parse import urlparse

import httpx


BINANCE_LIVE_VALIDATION_SAFETY_STATUS = "binance_spot_live_credential_validation_only"
BINANCE_LIVE_DEFAULT_BASE_URL = "https://api.binance.com"
ACCOUNT_ENDPOINT = "GET /api/v3/account"
API_RESTRICTIONS_ENDPOINT = "GET /sapi/v1/account/apiRestrictions"
ALLOWED_LIVE_HOSTS = {"api.binance.com"}


@dataclass(frozen=True)
class BinanceLiveAccountValidationProbeResult:
    status: str
    reason_code: str
    credential_status: str
    safety_status: str = BINANCE_LIVE_VALIDATION_SAFETY_STATUS
    evidence: dict[str, Any] = field(default_factory=dict)
    details: dict[str, Any] = field(default_factory=dict)


class BinanceLiveAccountValidationError(ValueError):
    def __init__(self, reason_code: str) -> None:
        super().__init__(reason_code)
        self.reason_code = reason_code


def build_signed_account_query(*, api_secret: str, timestamp_ms: int, recv_window_ms: int) -> str:
    query = f"timestamp={timestamp_ms}&recvWindow={recv_window_ms}"
    signature = hmac.new(api_secret.encode("utf-8"), query.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{query}&signature={signature}"


class BinanceLiveAccountValidationClient:
    def __init__(
        self,
        *,
        base_url: str = BINANCE_LIVE_DEFAULT_BASE_URL,
        timeout_seconds: float = 5.0,
        http_client: httpx.Client | None = None,
    ) -> None:
        parsed = urlparse(base_url)
        if parsed.scheme != "https" or parsed.hostname not in ALLOWED_LIVE_HOSTS or base_url.rstrip("/") != BINANCE_LIVE_DEFAULT_BASE_URL:
            raise BinanceLiveAccountValidationError("live_credential_validation_base_url_not_allowed")
        self._base_url = base_url.rstrip("/")
        self._base_url_host = parsed.hostname
        self._timeout_seconds = timeout_seconds
        self._http_client = http_client

    def validate_account(
        self,
        *,
        api_key: str,
        api_secret: str,
        recv_window_ms: int,
        request_time_ms: int,
    ) -> BinanceLiveAccountValidationProbeResult:
        client = self._http_client or httpx.Client(timeout=self._timeout_seconds)
        close_client = self._http_client is None
        timestamp_ms = self._resolve_timestamp_ms(client=client, request_time_ms=request_time_ms)
        try:
            restrictions_response = self._signed_get(
                client=client,
                endpoint="/sapi/v1/account/apiRestrictions",
                api_key=api_key,
                api_secret=api_secret,
                timestamp_ms=timestamp_ms,
                recv_window_ms=recv_window_ms,
            )
            account_response = self._signed_get(
                client=client,
                endpoint="/api/v3/account",
                api_key=api_key,
                api_secret=api_secret,
                timestamp_ms=timestamp_ms,
                recv_window_ms=recv_window_ms,
            )
        except httpx.TimeoutException:
            return self._result(
                status="failed",
                reason_code="live_credential_binance_timeout",
                credential_status="validation_failed",
            )
        finally:
            if close_client:
                client.close()

        restrictions_body = self._safe_json(restrictions_response)
        if restrictions_response.status_code != 200:
            return self._classify_http_error(
                restrictions_response.status_code,
                restrictions_body,
                endpoint=API_RESTRICTIONS_ENDPOINT,
            )
        if not isinstance(restrictions_body, dict):
            return self._result(
                status="failed",
                reason_code="live_credential_binance_malformed_response",
                credential_status="validation_failed",
            )

        account_body = self._safe_json(account_response)
        if account_response.status_code != 200:
            return self._classify_http_error(
                account_response.status_code,
                account_body,
                endpoint=ACCOUNT_ENDPOINT,
            )
        if not isinstance(account_body, dict):
            return self._result(
                status="failed",
                reason_code="live_credential_binance_malformed_response",
                credential_status="validation_failed",
            )

        evidence = self._evidence_from_account(account_body, restrictions_body)
        if evidence.get("canWithdraw") is True:
            return self._result(
                status="blocked",
                reason_code="live_credential_unsafe_permissions",
                credential_status="unsafe_permissions",
                evidence=evidence,
                details={"unsafePermission": "enableWithdrawals"},
            )
        if evidence.get("marginOrFuturesEnabled") is True:
            return self._result(
                status="blocked",
                reason_code="live_credential_unsafe_permissions",
                credential_status="unsafe_permissions",
                evidence=evidence,
                details={"unsafePermission": "marginOrFuturesEnabled"},
            )
        if evidence.get("canTrade") is not True:
            return self._result(
                status="blocked",
                reason_code="live_credential_unsafe_permissions",
                credential_status="unsafe_permissions",
                evidence=evidence,
                details={"unsafePermission": "canTrade"},
            )
        return self._result(
            status="passed",
            reason_code="live_credential_binance_account_validated",
            credential_status="validated_live_read_only",
            evidence=evidence,
        )

    def _classify_http_error(
        self,
        status_code: int,
        body: dict[str, Any] | list[Any] | None,
        *,
        endpoint: str,
    ) -> BinanceLiveAccountValidationProbeResult:
        error_code = body.get("code") if isinstance(body, dict) else None
        if status_code == 401:
            reason_code = "live_credential_binance_invalid_key_or_signature"
        elif status_code == 400 and error_code == -1021:
            reason_code = "live_credential_binance_clock_skew"
        elif status_code == 429:
            reason_code = "live_credential_binance_rate_limited"
        elif status_code >= 500:
            reason_code = "live_credential_binance_unavailable"
        else:
            reason_code = "live_credential_binance_validation_failed"
        return self._result(
            status="failed",
            reason_code=reason_code,
            credential_status="validation_failed",
            details={"httpStatus": status_code, "binanceErrorCode": error_code, "endpoint": endpoint},
        )

    def _resolve_timestamp_ms(self, *, client: httpx.Client, request_time_ms: int) -> int:
        server_time_ms = self._fetch_server_time_ms(client=client)
        if server_time_ms is None:
            return request_time_ms
        return server_time_ms

    def _fetch_server_time_ms(self, *, client: httpx.Client) -> int | None:
        try:
            response = client.get(f"{self._base_url}/api/v3/time")
        except httpx.HTTPError:
            return None
        if response.status_code != 200:
            return None
        body = self._safe_json(response)
        if not isinstance(body, dict):
            return None
        server_time = body.get("serverTime")
        if isinstance(server_time, int):
            return server_time
        if isinstance(server_time, str) and server_time.isdigit():
            return int(server_time)
        return None

    def _signed_get(
        self,
        *,
        client: httpx.Client,
        endpoint: str,
        api_key: str,
        api_secret: str,
        timestamp_ms: int,
        recv_window_ms: int,
    ) -> httpx.Response:
        query = build_signed_account_query(
            api_secret=api_secret,
            timestamp_ms=timestamp_ms,
            recv_window_ms=recv_window_ms,
        )
        url = f"{self._base_url}{endpoint}?{query}"
        return client.get(url, headers={"X-MBX-APIKEY": api_key})

    def _result(
        self,
        *,
        status: str,
        reason_code: str,
        credential_status: str,
        evidence: dict[str, Any] | None = None,
        details: dict[str, Any] | None = None,
    ) -> BinanceLiveAccountValidationProbeResult:
        base_evidence = {
            "networkCall": True,
            "endpoint": ACCOUNT_ENDPOINT,
            "apiKeyPermissionEndpoint": API_RESTRICTIONS_ENDPOINT,
            "baseUrlHost": self._base_url_host,
        }
        if evidence:
            base_evidence.update(evidence)
        return BinanceLiveAccountValidationProbeResult(
            status=status,
            reason_code=reason_code,
            credential_status=credential_status,
            evidence=base_evidence,
            details=details or {},
        )

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
    def _evidence_from_account(account_body: dict[str, Any], restrictions_body: dict[str, Any]) -> dict[str, Any]:
        permissions = account_body.get("permissions") if isinstance(account_body.get("permissions"), list) else []
        return {
            "accountType": account_body.get("accountType"),
            "canTrade": bool(account_body.get("canTrade")) and bool(restrictions_body.get("enableSpotAndMarginTrading")),
            "canWithdraw": bool(restrictions_body.get("enableWithdrawals")),
            "canDeposit": account_body.get("canDeposit"),
            "accountCanTrade": account_body.get("canTrade"),
            "accountCanWithdraw": account_body.get("canWithdraw"),
            "apiKeyCanTrade": bool(restrictions_body.get("enableSpotAndMarginTrading")),
            "apiKeyCanWithdraw": bool(restrictions_body.get("enableWithdrawals")),
            "ipRestrict": restrictions_body.get("ipRestrict"),
            "permissions": permissions,
            "marginOrFuturesEnabled": bool(restrictions_body.get("enableMargin"))
            or bool(restrictions_body.get("enableFutures"))
            or bool(restrictions_body.get("enablePortfolioMarginTrading")),
        }
