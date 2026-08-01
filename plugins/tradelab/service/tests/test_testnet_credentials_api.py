from __future__ import annotations

from uuid import uuid4

from fastapi.testclient import TestClient

from tradelab_api.api import testnet_credentials as credentials_api
from tradelab_api.main import app
from tradelab_api.services.testnet_credential_vault import TestnetCredentialMutationResult as MutationResult

client = TestClient(app)


def assert_success_envelope(response, semantic_status: int) -> dict[str, object]:
    assert response.status_code == 200
    payload = response.json()
    assert payload["Success"] is True
    assert payload["StatusCode"] == semantic_status
    assert payload["Message"] is None
    return payload["Data"]


class FakeSession:
    def __init__(self) -> None:
        self.commits = 0

    def commit(self) -> None:
        self.commits += 1

    def close(self) -> None:
        pass


def test_create_testnet_credential_route_returns_success_envelope_and_commits(monkeypatch) -> None:
    fake_session = FakeSession()

    def fake_create(*args, **kwargs):
        assert "request" in kwargs
        return MutationResult(
            status="created",
            reason_code="testnet_credential_fake_created",
            credential_ref_id="00000000-0000-0000-0000-000000000001",
            label="Fake testnet",
            vault_provider="fake",
            vault_secret_ref="fake://binance_testnet/ref-1",
            credential_status="stored_testnet_only",
            audit_event_ids=["00000000-0000-0000-0000-000000000002"],
            should_commit=True,
            semantic_status_code=201,
        )

    monkeypatch.setattr("tradelab_api.api.testnet_credentials.create_testnet_credential", fake_create)
    app.dependency_overrides[credentials_api.get_db_session] = lambda: fake_session
    try:
        data = assert_success_envelope(
            client.post(
                "/api/tradelab/testnet/credentials",
                json={
                    "label": "Fake testnet",
                    "confirmCreate": True,
                    "idempotencyKey": "click-1",
                    "actor": "admin",
                    "metadata": {"safe": "yes"},
                },
            ),
            201,
        )
    finally:
        app.dependency_overrides.pop(credentials_api.get_db_session, None)

    assert fake_session.commits == 1
    assert data["status"] == "created"
    assert data["reasonCode"] == "testnet_credential_fake_created"
    assert data["vaultProvider"] == "fake"
    assert "apiSecret" not in str(data)


def test_create_testnet_credential_route_blocks_without_commit(monkeypatch) -> None:
    fake_session = FakeSession()

    def fake_create(*args, **kwargs):
        return MutationResult(
            status="blocked",
            reason_code="testnet_credential_secret_not_allowed",
            details={"blockedFields": ["metadata.apiSecret"]},
            should_commit=False,
            semantic_status_code=400,
        )

    monkeypatch.setattr("tradelab_api.api.testnet_credentials.create_testnet_credential", fake_create)
    app.dependency_overrides[credentials_api.get_db_session] = lambda: fake_session
    try:
        data = assert_success_envelope(
            client.post(
                "/api/tradelab/testnet/credentials",
                json={"label": "Fake testnet", "confirmCreate": True, "idempotencyKey": "click-1"},
            ),
            400,
        )
    finally:
        app.dependency_overrides.pop(credentials_api.get_db_session, None)

    assert fake_session.commits == 0
    assert data["status"] == "blocked"
    assert data["reasonCode"] == "testnet_credential_secret_not_allowed"


def test_create_testnet_credential_real_secret_payload_is_blocked_without_echo(monkeypatch) -> None:
    response = client.post(
        "/api/tradelab/testnet/credentials",
        json={
            "label": "Fake testnet",
            "confirmCreate": True,
            "idempotencyKey": "click-secret",
            "actor": "admin",
            "metadata": {"apiSecret": "SECRET-WAS-HERE"},
        },
    )

    payload_text = response.text
    assert response.status_code == 200
    assert "SECRET-WAS-HERE" not in payload_text
    assert response.json()["Data"]["reasonCode"] == "testnet_credential_secret_not_allowed"


def test_mutation_routes_pass_uuid_and_commit(monkeypatch) -> None:
    credential_ref_id = uuid4()
    fake_session = FakeSession()
    captured: dict[str, object] = {}
    monkeypatch.setattr("tradelab_api.api.testnet_credentials.build_testnet_credential_provider", lambda: object())
    monkeypatch.setattr("tradelab_api.api.testnet_credentials.build_binance_account_validation_client", lambda: object())

    def fake_validate(repository, credential_id, *, request, **kwargs):
        captured["credential_id"] = credential_id
        captured["kwargs"] = kwargs
        return MutationResult(
            status="validated",
            reason_code="testnet_credential_fake_validated",
            credential_ref_id=str(credential_id),
            should_commit=True,
        )

    monkeypatch.setattr("tradelab_api.api.testnet_credentials.validate_testnet_credential", fake_validate)
    app.dependency_overrides[credentials_api.get_db_session] = lambda: fake_session
    try:
        data = assert_success_envelope(
            client.post(
                f"/api/tradelab/testnet/credentials/{credential_ref_id}/validate",
                json={"confirmValidate": True, "idempotencyKey": "click-validate"},
            ),
            200,
        )
    finally:
        app.dependency_overrides.pop(credentials_api.get_db_session, None)

    assert captured["credential_id"] == credential_ref_id
    assert "settings" in captured["kwargs"]
    assert "provider" in captured["kwargs"]
    assert "validation_client" in captured["kwargs"]
    assert fake_session.commits == 1
    assert data["status"] == "validated"

def test_validate_route_sanitizes_secret_and_signature_details(monkeypatch) -> None:
    credential_ref_id = uuid4()
    fake_session = FakeSession()
    monkeypatch.setattr("tradelab_api.api.testnet_credentials.build_testnet_credential_provider", lambda: object())
    monkeypatch.setattr("tradelab_api.api.testnet_credentials.build_binance_account_validation_client", lambda: object())

    def fake_validate(repository, credential_id, *, request, **kwargs):
        return MutationResult(
            status="blocked",
            reason_code="testnet_credential_binance_validation_failed",
            credential_ref_id=str(credential_id),
            details={"apiSecret": "SECRET-WAS-HERE", "signature": "SIGNATURE-WAS-HERE"},
            should_commit=False,
            semantic_status_code=400,
        )

    monkeypatch.setattr("tradelab_api.api.testnet_credentials.validate_testnet_credential", fake_validate)
    app.dependency_overrides[credentials_api.get_db_session] = lambda: fake_session
    try:
        response = client.post(
            f"/api/tradelab/testnet/credentials/{credential_ref_id}/validate",
            json={"confirmValidate": True, "idempotencyKey": "click-validate"},
        )
    finally:
        app.dependency_overrides.pop(credentials_api.get_db_session, None)

    assert response.status_code == 200
    assert "SECRET-WAS-HERE" not in response.text
    assert "SIGNATURE-WAS-HERE" not in response.text


def test_create_route_passes_secret_payload_to_service_without_echo(monkeypatch) -> None:
    fake_session = FakeSession()
    captured = {}
    monkeypatch.setattr("tradelab_api.api.testnet_credentials.build_testnet_credential_provider", lambda: object())

    def fake_create(repository, provider, *, request):
        captured["secret"] = request.secret
        return MutationResult(
            status="created",
            reason_code="testnet_credential_secret_encrypted",
            credential_ref_id="00000000-0000-0000-0000-000000000001",
            vault_provider="local_dev_encrypted",
            vault_secret_ref="local-dev://binance_testnet/ref-1",
            credential_status="stored_testnet_only",
            should_commit=True,
            semantic_status_code=201,
        )

    monkeypatch.setattr("tradelab_api.api.testnet_credentials.create_testnet_credential", fake_create)
    app.dependency_overrides[credentials_api.get_db_session] = lambda: fake_session
    try:
        response = client.post(
            "/api/tradelab/testnet/credentials",
            json={
                "label": "Encrypted",
                "confirmCreate": True,
                "idempotencyKey": "click-1",
                "apiKey": "TESTNET-KEY",
                "apiSecret": "TESTNET-SECRET",
            },
        )
    finally:
        app.dependency_overrides.pop(credentials_api.get_db_session, None)

    assert response.status_code == 200
    assert captured["secret"].api_key == "TESTNET-KEY"
    assert captured["secret"].api_secret == "TESTNET-SECRET"
    assert "TESTNET-SECRET" not in response.text


def test_rotate_route_passes_secret_payload_to_service_without_echo(monkeypatch) -> None:
    credential_ref_id = uuid4()
    fake_session = FakeSession()
    captured = {}
    monkeypatch.setattr("tradelab_api.api.testnet_credentials.build_testnet_credential_provider", lambda: object())

    def fake_rotate(repository, provider, credential_id, *, request):
        captured["credential_id"] = credential_id
        captured["secret"] = request.secret
        return MutationResult(
            status="rotated",
            reason_code="testnet_credential_secret_rotated",
            credential_ref_id=str(credential_id),
            should_commit=True,
        )

    monkeypatch.setattr("tradelab_api.api.testnet_credentials.rotate_testnet_credential", fake_rotate)
    app.dependency_overrides[credentials_api.get_db_session] = lambda: fake_session
    try:
        response = client.post(
            f"/api/tradelab/testnet/credentials/{credential_ref_id}/rotate",
            json={"confirmRotate": True, "idempotencyKey": "rotate-1", "apiKey": "KEY2", "apiSecret": "SECRET2"},
        )
    finally:
        app.dependency_overrides.pop(credentials_api.get_db_session, None)

    assert response.status_code == 200
    assert captured["credential_id"] == credential_ref_id
    assert captured["secret"].api_key == "KEY2"
    assert captured["secret"].api_secret == "SECRET2"
    assert "SECRET2" not in response.text


def test_create_route_partial_secret_does_not_echo(monkeypatch) -> None:
    fake_session = FakeSession()
    monkeypatch.setattr("tradelab_api.api.testnet_credentials.build_testnet_credential_provider", lambda: object())

    def fake_create(repository, provider, *, request):
        assert request.secret is None
        return MutationResult(
            status="blocked",
            reason_code="testnet_credential_secret_required",
            should_commit=False,
            semantic_status_code=400,
        )

    monkeypatch.setattr("tradelab_api.api.testnet_credentials.create_testnet_credential", fake_create)
    app.dependency_overrides[credentials_api.get_db_session] = lambda: fake_session
    try:
        response = client.post(
            "/api/tradelab/testnet/credentials",
            json={"label": "Encrypted", "confirmCreate": True, "idempotencyKey": "click-1", "apiKey": "KEY-ONLY"},
        )
    finally:
        app.dependency_overrides.pop(credentials_api.get_db_session, None)

    assert response.status_code == 200
    assert response.json()["Data"]["reasonCode"] == "testnet_credential_secret_required"
    assert "KEY-ONLY" not in response.text
