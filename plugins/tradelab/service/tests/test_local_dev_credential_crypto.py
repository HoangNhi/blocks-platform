from __future__ import annotations

import pytest
from cryptography.fernet import Fernet

from tradelab_api.services.local_dev_credential_crypto import (
    LocalDevCredentialCrypto,
    LocalDevCredentialCryptoError,
    fingerprint_value,
)


def test_encrypt_decrypt_round_trip_without_plaintext_in_ciphertext() -> None:
    crypto = LocalDevCredentialCrypto(Fernet.generate_key().decode("ascii"))
    encrypted = crypto.encrypt_payload(api_key="TESTNET-KEY", api_secret="TESTNET-SECRET")

    assert crypto.decrypt_payload(encrypted) == {"apiKey": "TESTNET-KEY", "apiSecret": "TESTNET-SECRET"}
    assert "TESTNET-KEY" not in encrypted
    assert "TESTNET-SECRET" not in encrypted


def test_invalid_key_fails_closed() -> None:
    with pytest.raises(LocalDevCredentialCryptoError) as exc:
        LocalDevCredentialCrypto("not-a-fernet-key")

    assert exc.value.reason_code == "testnet_credential_vault_key_unavailable"
    assert "not-a-fernet-key" not in str(exc.value)


def test_wrong_key_cannot_decrypt() -> None:
    encrypted = LocalDevCredentialCrypto(Fernet.generate_key().decode("ascii")).encrypt_payload(
        api_key="TESTNET-KEY",
        api_secret="TESTNET-SECRET",
    )
    other = LocalDevCredentialCrypto(Fernet.generate_key().decode("ascii"))

    with pytest.raises(LocalDevCredentialCryptoError) as exc:
        other.decrypt_payload(encrypted)

    assert exc.value.reason_code == "testnet_credential_vault_read_failed"


def test_fingerprint_is_stable_and_non_echoing() -> None:
    fingerprint = fingerprint_value("TESTNET-KEY")

    assert fingerprint == fingerprint_value("TESTNET-KEY")
    assert fingerprint != "TESTNET-KEY"
    assert len(fingerprint) == 64
