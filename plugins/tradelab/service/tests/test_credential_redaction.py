from __future__ import annotations

from tradelab_api.services.credential_redaction import find_secret_like_fields, sanitize_credential_payload


def test_sanitizes_nested_secret_like_values_without_dropping_safe_fields() -> None:
    payload = {
        "apiKey": "KEY-WAS-HERE",
        "nested": {
            "safe": "visible",
            "api_secret": "SECRET-WAS-HERE",
            "items": [{"privateKey": "PRIVATE-WAS-HERE", "label": "ok"}],
        },
    }

    assert sanitize_credential_payload(payload) == {
        "apiKey": "[REDACTED]",
        "nested": {
            "safe": "visible",
            "api_secret": "[REDACTED]",
            "items": [{"privateKey": "[REDACTED]", "label": "ok"}],
        },
    }


def test_find_secret_like_fields_returns_paths_without_values() -> None:
    payload = {"credentials": {"apiSecret": "SECRET-WAS-HERE", "token": "TOKEN-WAS-HERE"}}

    assert find_secret_like_fields(payload) == ["credentials.apiSecret", "credentials.token"]
