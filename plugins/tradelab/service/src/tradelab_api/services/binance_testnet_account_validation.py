from __future__ import annotations

from dataclasses import dataclass, field
import hashlib
import hmac
from typing import Any
from urllib.parse import urlparse

import httpx

BINANCE_SPOT_TESTNET_VALIDATION_SAFETY_STATUS = "binance_spot_testnet_credential_validation_only"
BINANCE_TESTNET_DEFAULT_BASE_URL = "https://testnet.binance.vision"
ACCOUNT_ENDPOINT = "GET /api/v3/account"
ALLOWED_TESTNET_HOSTS = {"testnet.binance.vision"}

@dataclass(frozen=True)
class BinanceAccountValidationProbeResult:
    status: str
    reason_code: str
    credential_status: str
    safety_status: str = BINANCE_SPOT_TESTNET_VALIDATION_SAFETY_STATUS
    evidence: dict[str, Any] = field(default_factory=dict)
    details: dict[str, Any] = field(default_factory=dict)

class BinanceAccountValidationError(ValueError):
    def __init__(self, reason_code: str) -> None:
        super().__init__(reason_code)
        self.reason_code = reason_code

def build_signed_account_query(*, api_secret: str, timestamp_ms: int, recv_window_ms: int) -> str:
    query = f"timestamp={timestamp_ms}&recvWindow={recv_window_ms}"
    signature = hmac.new(api_secret.encode("utf-8"), query.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"{query}&signature={signature}"

class BinanceAccountValidationClient:
    def __init__(
        self,
        *,
        base_url: str = BINANCE_TESTNET_DEFAULT_BASE_URL,
        timeout_seconds: float = 5.0,
        http_client: httpx.Client | None = None,
    ) -> None:
        parsed = urlparse(base_url)
        if parsed.scheme != "https" or parsed.hostname not in ALLOWED_TESTNET_HOSTS:
            raise BinanceAccountValidationError("testnet_credential_validation_base_url_not_allowed")
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
    ) -> BinanceAccountValidationProbeResult:
        query = build_signed_account_query(
            api_secret=api_secret,
            timestamp_ms=request_time_ms,
            recv_window_ms=recv_window_ms,
        )
        url = f"{self._base_url}/api/v3/account?{query}"
        client = self._http_client or httpx.Client(timeout=self._timeout_seconds)
        close_client = self._http_client is None
        try:
            response = client.get(url, headers={"X-MBX-APIKEY": api_key})
        except httpx.TimeoutException:
            return self._result(
                status="failed",
                reason_code="testnet_credential_binance_timeout",
                credential_status="validation_failed",
            )
        finally:
            if close_client:
                client.close()

        body = self._safe_json(response)
        if response.status_code != 200:
            return self._classify_http_error(response.status_code, body)
        if not isinstance(body, dict):
            return self._result(
                status="failed",
                reason_code="testnet_credential_binance_malformed_response",
                credential_status="validation_failed",
            )

        evidence = self._evidence_from_account(body)
        if evidence.get("marginOrFuturesEnabled") is True:
            return self._result(
                status="blocked",
                reason_code="testnet_credential_unsafe_permissions",
                credential_status="unsafe_permissions",
                evidence=evidence,
                details={"unsafePermission": "marginOrFuturesEnabled"},
            )
        if body.get("canTrade") is not True:
            return self._result(
                status="blocked",
                reason_code="testnet_credential_unsafe_permissions",
                credential_status="unsafe_permissions",
                evidence=evidence,
                details={"unsafePermission": "canTrade"},
            )
        return self._result(
            status="passed",
            reason_code="testnet_credential_binance_account_validated",
            credential_status="validated_testnet_read_only",
            evidence=evidence,
        )

    def _classify_http_error(
        self,
        status_code: int,
        body: dict[str, Any] | list[Any] | None,
    ) -> BinanceAccountValidationProbeResult:
        error_code = body.get("code") if isinstance(body, dict) else None
        if status_code == 401:
            reason_code = "testnet_credential_binance_invalid_key_or_signature"
        elif status_code == 400 and error_code == -1021:
            reason_code = "testnet_credential_binance_clock_skew"
        elif status_code == 429:
            reason_code = "testnet_credential_binance_rate_limited"
        elif status_code >= 500:
            reason_code = "testnet_credential_binance_unavailable"
        else:
            reason_code = "testnet_credential_binance_validation_failed"
        return self._result(
            status="failed",
            reason_code=reason_code,
            credential_status="validation_failed",
            details={"httpStatus": status_code, "binanceErrorCode": error_code},
        )

    def _result(
        self,
        *,
        status: str,
        reason_code: str,
        credential_status: str,
        evidence: dict[str, Any] | None = None,
        details: dict[str, Any] | None = None,
    ) -> BinanceAccountValidationProbeResult:
        base_evidence = {
            "networkCall": True,
            "endpoint": ACCOUNT_ENDPOINT,
            "baseUrlHost": self._base_url_host,
        }
        if evidence:
            base_evidence.update(evidence)
        return BinanceAccountValidationProbeResult(
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
    def _evidence_from_account(body: dict[str, Any]) -> dict[str, Any]:
        permissions = body.get("permissions") if isinstance(body.get("permissions"), list) else []
        normalized_permissions = [str(permission).upper() for permission in permissions]
        return {
            "accountType": body.get("accountType"),
            "canTrade": body.get("canTrade"),
            "canWithdraw": body.get("canWithdraw"),
            "canDeposit": body.get("canDeposit"),
            "permissions": permissions,
            "marginOrFuturesEnabled": any(permission in {"MARGIN", "FUTURES"} for permission in normalized_permissions),
        }
