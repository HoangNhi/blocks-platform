from __future__ import annotations

from dataclasses import dataclass
from typing import Any

CREDENTIAL_BOUNDARY_KEY = "credentialBoundary"
ALLOWED_CREDENTIAL_BOUNDARY_STATUSES = (
    "missing",
    "read_only_ready",
    "unsafe_permissions",
    "ip_not_restricted",
    "not_verified",
)
CREDENTIAL_BOUNDARY_SECRET_NOT_ALLOWED_REASON = "credential_secret_not_allowed"
CREDENTIAL_BOUNDARY_INVALID_STATUS_REASON = "credential_boundary_invalid_status"

SECRET_LIKE_FIELD_NAMES = {
    "apikey",
    "api_secret",
    "apisecret",
    "secret",
    "privatekey",
    "private_key",
    "passphrase",
    "password",
    "token",
}


@dataclass(frozen=True)
class CredentialBoundaryValidationError:
    message: str
    data: dict[str, object]


def normalize_secret_field_name(field_name: str) -> str:
    return field_name.replace("-", "_").strip().lower()


def is_secret_like_field_name(field_name: str) -> bool:
    normalized = normalize_secret_field_name(field_name)
    compact = normalized.replace("_", "")
    return normalized in SECRET_LIKE_FIELD_NAMES or compact in SECRET_LIKE_FIELD_NAMES


def find_secret_like_fields(value: Any, path: str = "") -> list[str]:
    if isinstance(value, dict):
        blocked: list[str] = []
        for key, nested_value in value.items():
            key_text = str(key)
            nested_path = f"{path}.{key_text}" if path else key_text
            if is_secret_like_field_name(key_text):
                blocked.append(nested_path)
                continue
            blocked.extend(find_secret_like_fields(nested_value, nested_path))
        return blocked

    if isinstance(value, list):
        blocked: list[str] = []
        for index, nested_value in enumerate(value):
            nested_path = f"{path}[{index}]" if path else f"[{index}]"
            blocked.extend(find_secret_like_fields(nested_value, nested_path))
        return blocked

    return []


def build_secret_not_allowed_error(blocked_fields: list[str]) -> CredentialBoundaryValidationError:
    return CredentialBoundaryValidationError(
        message="Credential boundary must not contain secrets.",
        data={
            "reasonCode": CREDENTIAL_BOUNDARY_SECRET_NOT_ALLOWED_REASON,
            "blockedFields": blocked_fields,
        },
    )


def build_invalid_credential_boundary_status_error(
    status: object,
) -> CredentialBoundaryValidationError:
    return CredentialBoundaryValidationError(
        message="Credential boundary status is invalid.",
        data={
            "reasonCode": CREDENTIAL_BOUNDARY_INVALID_STATUS_REASON,
            "status": status,
            "allowedStatuses": list(ALLOWED_CREDENTIAL_BOUNDARY_STATUSES),
        },
    )


def validate_credential_boundary_metadata(
    metadata: dict[str, object] | None,
) -> CredentialBoundaryValidationError | None:
    if metadata is None:
        return None

    blocked_fields = find_secret_like_fields(metadata)
    if blocked_fields:
        return build_secret_not_allowed_error(blocked_fields)

    raw_boundary = metadata.get(CREDENTIAL_BOUNDARY_KEY)
    if raw_boundary is None:
        return None
    if not isinstance(raw_boundary, dict):
        return build_invalid_credential_boundary_status_error(None)

    status = raw_boundary.get("status", "missing")
    if status not in ALLOWED_CREDENTIAL_BOUNDARY_STATUSES:
        return build_invalid_credential_boundary_status_error(status)

    return None
