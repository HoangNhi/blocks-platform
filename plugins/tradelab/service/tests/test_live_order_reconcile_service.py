from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from decimal import Decimal
import os
from uuid import UUID, uuid4

from cryptography.fernet import Fernet
import httpx
import pytest
from sqlalchemy.orm import Session

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://postgres:postgres123secure@localhost:5432/tradelab")

from tradelab_api.db.models import Strategy, StrategyGroup, StrategyVersion  # noqa: E402
from tradelab_api.db.session import SessionLocal, apply_schema_compatibility, get_engine  # noqa: E402
from tradelab_api.services.live_credential_repository import LiveCredentialRepository as CredentialRepository  # noqa: E402
from tradelab_api.services.live_credential_vault import LocalDevEncryptedCredentialVaultProvider, LiveCredentialCreateRequestData, LiveCredentialSecretRequestData, create_live_credential  # noqa: E402
from tradelab_api.services.live_order_confirm_submit import LiveOrderConfirmSubmitRequestData, confirm_submit_live_order  # noqa: E402
from tradelab_api.services.live_order_preview import LiveOrderPreviewRequestData, preview_live_order  # noqa: E402
from tradelab_api.services.live_order_reconcile import LiveOrderReconcileRequestData, reconcile_live_order  # noqa: E402
from tradelab_api.services.live_order_state_repository import LiveOrderStateRepository as OrderStateRepository  # noqa: E402

apply_schema_compatibility()


class RecordingTransport(httpx.BaseTransport):
    def __init__(self, response: httpx.Response) -> None:
        self.response = response
        self.requests: list[httpx.Request] = []

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        return self.response


def _local_dev_provider() -> LocalDevEncryptedCredentialVaultProvider:
    return LocalDevEncryptedCredentialVaultProvider(encryption_key=Fernet.generate_key().decode("ascii"))


@pytest.fixture()
def db_session() -> Iterator[Session]:
    connection = get_engine().connect()
    transaction = connection.begin()
    session = SessionLocal(bind=connection)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


def _strategy(session: Session):
    suffix = datetime.now(UTC).strftime("%Y%m%d%H%M%S%f")
    group = StrategyGroup(name="Live Group", slug=f"live-group-{suffix}", metadata_={}, created_by="admin")
    session.add(group)
    session.flush()
    strategy = Strategy(strategy_group_id=group.id, name="Live Strategy", slug=f"live-strategy-{suffix}", status="active", runtime_config={}, risk_config={}, metadata_={}, created_by="admin")
    session.add(strategy)
    session.flush()
    version = StrategyVersion(strategy_id=strategy.id, version_number=1, source_code="def on_bar(ctx): return []", source_hash=f"hash-{suffix}", validation_status="valid", created_by="admin")
    session.add(version)
    session.flush()
    return strategy, version


def _credential(session: Session, *, status: str = "validated_live_read_only", can_trade: bool = True, can_withdraw: bool = False):
    return CredentialRepository(session).create_credential_ref(
        exchange="binance_spot",
        environment="binance_live",
        label="Submit credential",
        status=status,
        vault_provider="local_dev_encrypted",
        vault_secret_ref=f"local-dev://phase20/{uuid4()}",
        api_key_fingerprint="fingerprint",
        permission_evidence={"canTrade": can_trade, "canWithdraw": can_withdraw, "marginOrFuturesEnabled": False},
        metadata={"apiSecret": "SECRET"},
        actor="admin",
    )


def _submitted_context(session: Session, *, status: str = "unknown", local_dev_secret: bool = False, reconciliation_required: bool = True):
    provider = _local_dev_provider()
    credential = _credential(session) if not local_dev_secret else _encrypted_submit_credential(session, provider)
    preview_id, intent_id = _preview(session, credential_id=credential.id)
    submit = _submit(session, preview_id, live_order_submit_kill_switch_enabled=False)
    assert submit.status == "submitted"
    repository = OrderStateRepository(session)
    intent = repository.get_intent(intent_id)
    assert intent is not None
    if status != intent.status or reconciliation_required != intent.reconciliation_required:
        repository.update_intent_status(intent, status=status, reason_code="state_override", reconciliation_required=reconciliation_required, actor="admin")
        session.flush()
    return repository, CredentialRepository(session), intent, session, provider


def _preview(session: Session, *, credential_id: UUID | None = None):
    strategy, version = _strategy(session)
    credential_ref_id = credential_id or _credential(session).id
    result = preview_live_order(
        OrderStateRepository(session),
        CredentialRepository(session),
        LiveOrderPreviewRequestData(
            confirm_preview_only=True,
            idempotency_key=f"preview-key-{uuid4()}",
            client_action_id=f"action-{uuid4()}",
            source="strategy_lab",
            actor="admin",
            strategy_id=strategy.id,
            strategy_version_id=version.id,
            source_run_id=None,
            source_signal_package_id=None,
            credential_ref_id=credential_ref_id,
            environment="binance_live",
            exchange="binance",
            market_type="spot",
            symbol="BTCUSDT",
            side="buy",
            order_type="market",
            quantity=None,
            quote_quantity=Decimal("25"),
        ),
        live_order_submit_kill_switch_enabled=False,
    )
    assert result.preview_id is not None
    preview = OrderStateRepository(session).get_preview(UUID(result.preview_id))
    assert preview is not None
    preview.expires_at = datetime.now(UTC) + timedelta(minutes=15)
    session.flush()
    return UUID(result.preview_id), UUID(result.intent_id)


def _submit(session: Session, preview_id: UUID, **overrides):
    values = dict(
        preview_id=preview_id,
        confirm_live_order=True,
        idempotency_key="submit-key-1",
        actor="admin",
        live_order_submit_kill_switch_enabled=False,
    )
    values.update(overrides)
    return confirm_submit_live_order(OrderStateRepository(session), CredentialRepository(session), LiveOrderConfirmSubmitRequestData(**values))


def _request(order_id, **overrides) -> LiveOrderReconcileRequestData:
    values = dict(
        order_id=order_id,
        confirm_live_reconcile=True,
        trigger="manual",
        actor="admin",
        live_order_submit_kill_switch_enabled=True,
        connector_mode="fake",
    )
    values.update(overrides)
    return LiveOrderReconcileRequestData(**values)


def _encrypted_submit_credential(session: Session, provider: LocalDevEncryptedCredentialVaultProvider):
    repository = CredentialRepository(session)
    created = create_live_credential(
        repository,
        provider,
        request=LiveCredentialCreateRequestData(
            label="Real submit credential",
            confirm_create=True,
            idempotency_key=f"credential-{uuid4()}",
            actor="admin",
            secret=LiveCredentialSecretRequestData(api_key="LIVE-KEY", api_secret="LIVE-SECRET"),
        ),
    )
    credential = repository.get_credential_ref(UUID(created.credential_ref_id))
    assert credential is not None
    credential.status = "validated_live_read_only"
    credential.permission_evidence = {"canTrade": True, "canWithdraw": False, "marginOrFuturesEnabled": False}
    session.flush()
    return credential


def test_reconcile_requires_confirmation(db_session: Session) -> None:
    repository, credential_repository, intent, *_ = _submitted_context(db_session)

    result = reconcile_live_order(repository, credential_repository, _request(intent.id, confirm_live_reconcile=False))

    assert result.status == "blocked"
    assert result.reason_code == "live_order_reconcile_confirmation_required"


def test_reconcile_blocks_non_reconcilable_state_before_vault_or_network(db_session: Session) -> None:
    repository, credential_repository, intent, *_ = _submitted_context(db_session, status="filled", reconciliation_required=False)

    result = reconcile_live_order(repository, credential_repository, _request(intent.id))

    assert result.status == "blocked"
    assert result.reason_code == "live_order_reconcile_state_not_allowed"


def test_reconcile_fake_mode_returns_reconciliation_required(db_session: Session) -> None:
    repository, credential_repository, intent, *_ = _submitted_context(db_session, status="unknown")

    result = reconcile_live_order(repository, credential_repository, _request(intent.id, connector_mode="fake"))

    assert result.status == "reconciliation_required"
    assert result.reason_code == "live_order_reconciliation_required"


def test_reconcile_real_mode_network_disabled_blocks_before_vault(db_session: Session) -> None:
    repository, credential_repository, intent, *_ = _submitted_context(db_session, status="unknown")

    result = reconcile_live_order(repository, credential_repository, _request(intent.id, connector_mode="real", real_network_enabled=False))

    assert result.status == "blocked"
    assert result.reason_code == "live_order_reconcile_real_network_not_enabled"


def test_reconcile_real_matched_persists_attempt_and_sanitized_event(db_session: Session) -> None:
    repository, credential_repository, intent, _session, provider = _submitted_context(db_session, status="unknown", local_dev_secret=True)
    transport = RecordingTransport(httpx.Response(200, json={"orderId": 12345, "clientOrderId": intent.client_order_id, "status": "FILLED", "executedQty": "0.01", "cummulativeQuoteQty": "600"}))
    client = httpx.Client(transport=transport)

    result = reconcile_live_order(
        repository,
        credential_repository,
        _request(intent.id, connector_mode="real", real_network_enabled=True, vault_provider_name="local_dev_encrypted"),
        vault_provider=provider,
        http_client=client,
    )

    attempts = repository.list_reconciliation_attempts_for_intent(intent.id)
    assert result.status == "filled"
    assert result.reason_code == "live_order_reconcile_binance_matched"
    assert result.reconciliation_attempt_id == str(attempts[0].id)
    assert attempts[0].status == "matched"
    assert repository.get_intent(intent.id).status == "filled"
