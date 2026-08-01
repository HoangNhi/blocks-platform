from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

SECRET_KEY_MARKERS = (
    "apikey",
    "api_key",
    "apisecret",
    "api_secret",
    "secret",
    "privatekey",
    "private_key",
    "passphrase",
    "token",
    "password",
    "signature",
    "signedurl",
    "signed_url",
    "authorization",
)


def is_secret_like_key(key: object) -> bool:
    normalized = str(key).replace("-", "_").replace(" ", "_").lower()
    compact = normalized.replace("_", "")
    return any(marker in normalized or marker in compact for marker in SECRET_KEY_MARKERS)


def sanitize_credential_payload(value: Any) -> Any:
    if isinstance(value, Mapping):
        return {
            str(key): "[REDACTED]" if is_secret_like_key(key) else sanitize_credential_payload(item)
            for key, item in value.items()
        }
    if isinstance(value, Sequence) and not isinstance(value, str | bytes | bytearray):
        return [sanitize_credential_payload(item) for item in value]
    return value


def find_secret_like_fields(value: Any, prefix: str = "") -> list[str]:
    if isinstance(value, Mapping):
        paths: list[str] = []
        for key, item in value.items():
            path = f"{prefix}.{key}" if prefix else str(key)
            if is_secret_like_key(key):
                paths.append(path)
            else:
                paths.extend(find_secret_like_fields(item, path))
        return paths
    if isinstance(value, Sequence) and not isinstance(value, str | bytes | bytearray):
        paths = []
        for index, item in enumerate(value):
            path = f"{prefix}.{index}" if prefix else str(index)
            paths.extend(find_secret_like_fields(item, path))
        return paths
    return []
