from __future__ import annotations

import hashlib
import json
from typing import Any

from cryptography.fernet import Fernet, InvalidToken


class LocalDevCredentialCryptoError(ValueError):
    def __init__(self, reason_code: str, message: str) -> None:
        super().__init__(message)
        self.reason_code = reason_code


def fingerprint_value(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


class LocalDevCredentialCrypto:
    def __init__(self, key: str) -> None:
        try:
            self._key = key.encode("ascii")
            self._fernet = Fernet(self._key)
        except Exception as exc:
            raise LocalDevCredentialCryptoError(
                "testnet_credential_vault_key_unavailable",
                "Local/dev testnet credential key is unavailable or invalid.",
            ) from exc

    @property
    def key_fingerprint(self) -> str:
        return fingerprint_value(self._key.decode("ascii"))

    def encrypt_payload(self, *, api_key: str, api_secret: str) -> str:
        payload = json.dumps(
            {"apiKey": api_key, "apiSecret": api_secret},
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
        return self._fernet.encrypt(payload).decode("ascii")

    def decrypt_payload(self, encrypted_payload: str) -> dict[str, Any]:
        try:
            raw = self._fernet.decrypt(encrypted_payload.encode("ascii"))
            payload = json.loads(raw.decode("utf-8"))
        except (InvalidToken, UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
            raise LocalDevCredentialCryptoError(
                "testnet_credential_vault_read_failed",
                "Local/dev testnet credential payload could not be decrypted.",
            ) from exc
        if (
            not isinstance(payload, dict)
            or not isinstance(payload.get("apiKey"), str)
            or not isinstance(payload.get("apiSecret"), str)
        ):
            raise LocalDevCredentialCryptoError(
                "testnet_credential_vault_read_failed",
                "Local/dev testnet credential payload is malformed.",
            )
        return {"apiKey": payload["apiKey"], "apiSecret": payload["apiSecret"]}
