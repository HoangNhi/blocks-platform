from __future__ import annotations

from tradelab_api.services.credential_boundary import (
    ALLOWED_CREDENTIAL_BOUNDARY_STATUSES,
    CREDENTIAL_BOUNDARY_INVALID_STATUS_REASON,
    CREDENTIAL_BOUNDARY_SECRET_NOT_ALLOWED_REASON,
    build_invalid_credential_boundary_status_error,
    build_secret_not_allowed_error,
    find_secret_like_fields,
    validate_credential_boundary_metadata,
)


def test_credential_boundary_policy_exposes_allowed_statuses() -> None:
    assert ALLOWED_CREDENTIAL_BOUNDARY_STATUSES == (
        "missing",
        "read_only_ready",
        "unsafe_permissions",
        "ip_not_restricted",
        "not_verified",
    )
    assert CREDENTIAL_BOUNDARY_SECRET_NOT_ALLOWED_REASON == "credential_secret_not_allowed"
    assert CREDENTIAL_BOUNDARY_INVALID_STATUS_REASON == "credential_boundary_invalid_status"


def test_find_secret_like_fields_detects_nested_secret_keys_without_values() -> None:
    payload = {
        "credentialBoundary": {
            "status": "read_only_ready",
            "apiKey": "SECRET-WAS-HERE",
            "checks": {"readOnlyEnabled": True},
            "nested": {"private_key": "PRIVATE-WAS-HERE", "safe": "ok"},
        }
    }

    assert find_secret_like_fields(payload) == [
        "credentialBoundary.apiKey",
        "credentialBoundary.nested.private_key",
    ]


def test_validate_credential_boundary_metadata_accepts_valid_manual_readiness() -> None:
    assert (
        validate_credential_boundary_metadata(
            {
                "credentialBoundary": {
                    "exchange": "binance",
                    "status": "read_only_ready",
                    "checks": {
                        "readOnlyEnabled": True,
                        "tradingDisabled": True,
                        "withdrawDisabled": True,
                        "futuresMarginDisabled": True,
                        "ipRestricted": True,
                    },
                    "updatedAt": "2026-05-16T00:00:00Z",
                }
            }
        )
        is None
    )


def test_validate_credential_boundary_metadata_accepts_missing_boundary() -> None:
    assert validate_credential_boundary_metadata({"purpose": "paper-draft-boundary"}) is None


def test_validate_credential_boundary_metadata_rejects_secret_like_fields() -> None:
    error = validate_credential_boundary_metadata(
        {
            "credentialBoundary": {
                "status": "read_only_ready",
                "apiSecret": "SECRET-WAS-HERE",
                "checks": {},
            }
        }
    )

    assert error is not None
    assert error.message == "Credential boundary must not contain secrets."
    assert error.data == {
        "reasonCode": "credential_secret_not_allowed",
        "blockedFields": ["credentialBoundary.apiSecret"],
    }


def test_validate_credential_boundary_metadata_rejects_invalid_status() -> None:
    error = validate_credential_boundary_metadata(
        {"credentialBoundary": {"status": "paper_trading_enabled", "checks": {}}}
    )

    assert error is not None
    assert error.message == "Credential boundary status is invalid."
    assert error.data == {
        "reasonCode": "credential_boundary_invalid_status",
        "status": "paper_trading_enabled",
        "allowedStatuses": [
            "missing",
            "read_only_ready",
            "unsafe_permissions",
            "ip_not_restricted",
            "not_verified",
        ],
    }


def test_secret_error_payload_does_not_echo_secret_values() -> None:
    assert build_secret_not_allowed_error(["credentialBoundary.apiKey"]).data == {
        "reasonCode": "credential_secret_not_allowed",
        "blockedFields": ["credentialBoundary.apiKey"],
    }


def test_invalid_status_error_payload_is_machine_readable() -> None:
    assert build_invalid_credential_boundary_status_error("enabled").data == {
        "reasonCode": "credential_boundary_invalid_status",
        "status": "enabled",
        "allowedStatuses": [
            "missing",
            "read_only_ready",
            "unsafe_permissions",
            "ip_not_restricted",
            "not_verified",
        ],
    }
