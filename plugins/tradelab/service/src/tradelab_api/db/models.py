from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, Numeric, Text, UniqueConstraint, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PGUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from tradelab_api.db.testnet_order_event_types import (
    testnet_order_event_type_check_constraint_sql,
)


class Base(DeclarativeBase):
    pass


class UUIDPrimaryKeyMixin:
    id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )


class AuditMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    created_by: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_by: Mapped[str | None] = mapped_column(Text, nullable=True)


class AppendOnlyAuditMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    created_by: Mapped[str | None] = mapped_column(Text, nullable=True)


class MutableStatusMixin:
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("true"))
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))


class StrategyGroup(Base, UUIDPrimaryKeyMixin, AuditMixin, MutableStatusMixin):
    __tablename__ = "strategy_group"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    slug: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    strategies: Mapped[list["Strategy"]] = relationship(
        back_populates="strategy_group",
        foreign_keys="Strategy.strategy_group_id",
    )


class Strategy(Base, UUIDPrimaryKeyMixin, AuditMixin, MutableStatusMixin):
    __tablename__ = "strategy"

    strategy_group_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("strategy_group.id"), nullable=True
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    slug: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_version_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("strategy_version.id", name="fk_strategy_current_version", use_alter=True),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(Text, nullable=False)
    runtime_config: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    risk_config: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    strategy_group: Mapped["StrategyGroup | None"] = relationship(
        back_populates="strategies",
        foreign_keys=[strategy_group_id],
    )
    versions: Mapped[list["StrategyVersion"]] = relationship(
        back_populates="strategy",
        foreign_keys="StrategyVersion.strategy_id",
    )
    bots: Mapped[list["Bot"]] = relationship(back_populates="strategy")


class StrategyVersion(Base, UUIDPrimaryKeyMixin, AuditMixin, MutableStatusMixin):
    __tablename__ = "strategy_version"

    strategy_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("strategy.id"), nullable=False
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    source_code: Mapped[str] = mapped_column(Text, nullable=False)
    source_hash: Mapped[str] = mapped_column(Text, nullable=False)
    validation_status: Mapped[str] = mapped_column(Text, nullable=False)
    validation_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    strategy: Mapped["Strategy"] = relationship(
        back_populates="versions",
        foreign_keys=[strategy_id],
    )
    bots: Mapped[list["Bot"]] = relationship(
        back_populates="strategy_version",
        foreign_keys="Bot.strategy_version_id",
    )
    bot_runs: Mapped[list["BotRun"]] = relationship(
        back_populates="strategy_version",
        foreign_keys="BotRun.strategy_version_id",
    )


class Bot(Base, UUIDPrimaryKeyMixin, AuditMixin, MutableStatusMixin):
    __tablename__ = "bot"

    strategy_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("strategy.id"), nullable=False
    )
    strategy_version_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("strategy_version.id"), nullable=True
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    mode: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    exchange_connection_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    symbol: Mapped[str] = mapped_column(Text, nullable=False)
    timeframe: Mapped[str] = mapped_column(Text, nullable=False)
    runtime_config: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    risk_config: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    strategy: Mapped["Strategy"] = relationship(back_populates="bots")
    strategy_version: Mapped["StrategyVersion | None"] = relationship(
        back_populates="bots",
        foreign_keys=[strategy_version_id],
    )
    bot_runs: Mapped[list["BotRun"]] = relationship(back_populates="bot")


class ExchangeConnection(Base, UUIDPrimaryKeyMixin, AuditMixin, MutableStatusMixin):
    __tablename__ = "exchange_connection"

    exchange: Mapped[str] = mapped_column(Text, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    account_label: Mapped[str | None] = mapped_column(Text, nullable=True)
    api_key_ref: Mapped[str | None] = mapped_column(Text, nullable=True)
    api_secret_ref: Mapped[str | None] = mapped_column(Text, nullable=True)
    permissions: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    status: Mapped[str] = mapped_column(Text, nullable=False)


class TestnetCredentialRef(Base, UUIDPrimaryKeyMixin, AuditMixin, MutableStatusMixin):
    __tablename__ = "testnet_credential_ref"
    __table_args__ = (
        CheckConstraint("exchange IN ('binance_spot')", name="ck_testnet_credential_ref_exchange"),
        CheckConstraint("environment IN ('binance_testnet')", name="ck_testnet_credential_ref_environment"),
        CheckConstraint(
            "status IN ('missing', 'stored_testnet_only', 'permission_check_required', 'validated_testnet_read_only', 'validation_failed', 'unsafe_permissions', 'revoked', 'rotation_required', 'vault_unavailable')",
            name="ck_testnet_credential_ref_status",
        ),
        CheckConstraint("vault_provider IN ('fake', 'local_dev_encrypted')", name="ck_testnet_credential_ref_provider"),
    )

    exchange: Mapped[str] = mapped_column(Text, nullable=False)
    environment: Mapped[str] = mapped_column(Text, nullable=False)
    label: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    vault_provider: Mapped[str] = mapped_column(Text, nullable=False)
    vault_secret_ref: Mapped[str] = mapped_column(Text, nullable=False)
    api_key_fingerprint: Mapped[str | None] = mapped_column(Text, nullable=True)
    permission_evidence: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    last_validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_validation_status: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_validation_reason_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    rotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rotated_by: Mapped[str | None] = mapped_column(Text, nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_by: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    audit_events: Mapped[list["TestnetCredentialAuditEvent"]] = relationship(
        back_populates="credential_ref",
        order_by="TestnetCredentialAuditEvent.created_at",
    )

class TestnetCredentialSecret(Base, UUIDPrimaryKeyMixin, AuditMixin, MutableStatusMixin):
    __tablename__ = "testnet_credential_secret"
    __table_args__ = (
        CheckConstraint(
            "vault_provider IN ('local_dev_encrypted')",
            name="ck_testnet_credential_secret_provider",
        ),
    )

    credential_ref_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("testnet_credential_ref.id"), nullable=False
    )
    vault_secret_ref: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    vault_provider: Mapped[str] = mapped_column(Text, nullable=False)
    encrypted_payload: Mapped[str] = mapped_column(Text, nullable=False)
    encryption_key_fingerprint: Mapped[str] = mapped_column(Text, nullable=False)
class TestnetCredentialAuditEvent(Base, UUIDPrimaryKeyMixin, AppendOnlyAuditMixin):
    __tablename__ = "testnet_credential_audit_event"
    __table_args__ = (
        CheckConstraint("environment IN ('binance_testnet')", name="ck_testnet_credential_audit_environment"),
        CheckConstraint(
            "action IN ('testnet_credential_create_requested', 'testnet_credential_created', 'testnet_credential_validation_requested', 'testnet_credential_validation_started', 'testnet_credential_validation_completed', 'testnet_credential_validation_failed', 'testnet_credential_validation_blocked', 'testnet_credential_rotated', 'testnet_credential_revoked', 'testnet_credential_blocked_unsafe_permissions', 'testnet_credential_vault_read_requested', 'testnet_credential_vault_read_allowed', 'testnet_credential_vault_read_blocked', 'testnet_credential_vault_read_failed')",
            name="ck_testnet_credential_audit_action",
        ),
    )

    credential_ref_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("testnet_credential_ref.id"), nullable=True
    )
    action: Mapped[str] = mapped_column(Text, nullable=False)
    actor: Mapped[str] = mapped_column(Text, nullable=False)
    environment: Mapped[str] = mapped_column(Text, nullable=False)
    reason_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    request_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    idempotency_key_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    credential_ref: Mapped["TestnetCredentialRef | None"] = relationship(back_populates="audit_events")

class TestnetOrderIntent(Base, UUIDPrimaryKeyMixin, AuditMixin, MutableStatusMixin):
    __tablename__ = "testnet_order_intent"
    __table_args__ = (
        UniqueConstraint("intent_key", name="uq_testnet_order_intent_key"),
        UniqueConstraint("client_order_id", name="uq_testnet_order_intent_client_order_id"),
        CheckConstraint(
            "environment IN ('binance_testnet')",
            name="ck_testnet_order_intent_environment",
        ),
        CheckConstraint("exchange IN ('binance')", name="ck_testnet_order_intent_exchange"),
        CheckConstraint("market_type IN ('spot')", name="ck_testnet_order_intent_market_type"),
        CheckConstraint("side IN ('buy', 'sell')", name="ck_testnet_order_intent_side"),
        CheckConstraint("order_type IN ('market')", name="ck_testnet_order_intent_order_type"),
        CheckConstraint(
            "quantity IS NULL OR quantity >= 0",
            name="ck_testnet_order_intent_quantity_non_negative",
        ),
        CheckConstraint(
            "quote_quantity IS NULL OR quote_quantity >= 0",
            name="ck_testnet_order_intent_quote_quantity_non_negative",
        ),
        CheckConstraint(
            "status IN ('draft_previewed', 'preview_blocked', 'confirmed', 'submitting', "
            "'submitted', 'partially_filled', 'filled', 'cancel_requested', 'cancelled', "
            "'rejected', 'unknown', 'reconciliation_required', 'reconciled', "
            "'journal_projected')",
            name="ck_testnet_order_intent_status",
        ),
    )

    intent_key: Mapped[str] = mapped_column(Text, nullable=False)
    strategy_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("strategy.id"), nullable=False
    )
    strategy_version_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("strategy_version.id"), nullable=False
    )
    source_run_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("bot_run.id"), nullable=True
    )
    source_signal_package_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    credential_ref_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("testnet_credential_ref.id"), nullable=False
    )
    environment: Mapped[str] = mapped_column(Text, nullable=False)
    exchange: Mapped[str] = mapped_column(Text, nullable=False)
    market_type: Mapped[str] = mapped_column(Text, nullable=False)
    symbol: Mapped[str] = mapped_column(Text, nullable=False)
    side: Mapped[str] = mapped_column(Text, nullable=False)
    order_type: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[Decimal | None] = mapped_column(Numeric(28, 12), nullable=True)
    quote_quantity: Mapped[Decimal | None] = mapped_column(Numeric(28, 12), nullable=True)
    client_order_id: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    status_reason_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    latest_preview_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    exchange_order_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    exchange_order_status: Mapped[str | None] = mapped_column(Text, nullable=True)
    unknown_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reconciliation_required: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    journal_entry_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("manual_trade_journal_entry.id"), nullable=True
    )
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    previews: Mapped[list["TestnetOrderPreview"]] = relationship(
        back_populates="intent",
        foreign_keys="TestnetOrderPreview.intent_id",
    )
    events: Mapped[list["TestnetOrderEvent"]] = relationship(
        back_populates="intent",
        foreign_keys="TestnetOrderEvent.intent_id",
        order_by="TestnetOrderEvent.created_at",
    )
    reconciliation_attempts: Mapped[list["TestnetReconciliationAttempt"]] = relationship(
        back_populates="intent",
        foreign_keys="TestnetReconciliationAttempt.intent_id",
        order_by="TestnetReconciliationAttempt.attempt_no",
    )

class TestnetOrderPreview(Base, UUIDPrimaryKeyMixin, AuditMixin, MutableStatusMixin):
    __tablename__ = "testnet_order_preview"
    __table_args__ = (
        UniqueConstraint("preview_key", name="uq_testnet_order_preview_key"),
        CheckConstraint(
            "status IN ('allowed', 'blocked', 'expired')",
            name="ck_testnet_order_preview_status",
        ),
        CheckConstraint("side IN ('buy', 'sell')", name="ck_testnet_order_preview_side"),
        CheckConstraint("order_type IN ('market')", name="ck_testnet_order_preview_order_type"),
        CheckConstraint(
            "quantity IS NULL OR quantity >= 0",
            name="ck_testnet_order_preview_quantity_non_negative",
        ),
        CheckConstraint(
            "quote_quantity IS NULL OR quote_quantity >= 0",
            name="ck_testnet_order_preview_quote_quantity_non_negative",
        ),
        CheckConstraint(
            "estimated_notional IS NULL OR estimated_notional >= 0",
            name="ck_testnet_order_preview_notional_non_negative",
        ),
        CheckConstraint(
            "estimated_fee IS NULL OR estimated_fee >= 0",
            name="ck_testnet_order_preview_fee_non_negative",
        ),
    )

    intent_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("testnet_order_intent.id"), nullable=False
    )
    preview_key: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    reason_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    symbol: Mapped[str] = mapped_column(Text, nullable=False)
    side: Mapped[str] = mapped_column(Text, nullable=False)
    order_type: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[Decimal | None] = mapped_column(Numeric(28, 12), nullable=True)
    quote_quantity: Mapped[Decimal | None] = mapped_column(Numeric(28, 12), nullable=True)
    estimated_notional: Mapped[Decimal | None] = mapped_column(Numeric(28, 12), nullable=True)
    estimated_fee: Mapped[Decimal | None] = mapped_column(Numeric(28, 12), nullable=True)
    risk_snapshot: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    credential_snapshot: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    source_snapshot: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    intent: Mapped["TestnetOrderIntent"] = relationship(back_populates="previews")

class TestnetOrderEvent(Base, UUIDPrimaryKeyMixin, AppendOnlyAuditMixin):
    __tablename__ = "testnet_order_event"
    __table_args__ = (
        CheckConstraint(
            testnet_order_event_type_check_constraint_sql(),
            name="ck_testnet_order_event_type",
        ),
    )

    intent_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("testnet_order_intent.id"), nullable=False
    )
    preview_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("testnet_order_preview.id"), nullable=True
    )
    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    from_status: Mapped[str | None] = mapped_column(Text, nullable=True)
    to_status: Mapped[str | None] = mapped_column(Text, nullable=True)
    reason_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    idempotency_key_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    client_order_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    exchange_order_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    actor: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    intent: Mapped["TestnetOrderIntent"] = relationship(back_populates="events")
    preview: Mapped["TestnetOrderPreview | None"] = relationship()

class TestnetReconciliationAttempt(Base, UUIDPrimaryKeyMixin, AppendOnlyAuditMixin):
    __tablename__ = "testnet_reconciliation_attempt"
    __table_args__ = (
        UniqueConstraint(
            "intent_id",
            "attempt_no",
            name="uq_testnet_reconciliation_attempt_intent_attempt",
        ),
        CheckConstraint(
            "attempt_no >= 0",
            name="ck_testnet_reconciliation_attempt_no_non_negative",
        ),
        CheckConstraint(
            "trigger IN ('manual', 'submit_timeout', 'cancel_race', 'operator_review')",
            name="ck_testnet_reconciliation_attempt_trigger",
        ),
        CheckConstraint(
            "status IN ('started', 'matched', 'not_found', 'ambiguous', 'failed')",
            name="ck_testnet_reconciliation_attempt_status",
        ),
    )

    intent_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("testnet_order_intent.id"), nullable=False
    )
    attempt_no: Mapped[int] = mapped_column(Integer, nullable=False)
    trigger: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    reason_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    exchange_order_status: Mapped[str | None] = mapped_column(Text, nullable=True)
    fills_snapshot: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    intent: Mapped["TestnetOrderIntent"] = relationship(back_populates="reconciliation_attempts")

class LiveCredentialRef(Base, UUIDPrimaryKeyMixin, AuditMixin, MutableStatusMixin):
    __tablename__ = "live_credential_ref"
    __table_args__ = (
        CheckConstraint("exchange IN ('binance_spot')", name="ck_live_credential_ref_exchange"),
        CheckConstraint("environment IN ('binance_live')", name="ck_live_credential_ref_environment"),
        CheckConstraint(
            "status IN ('missing', 'stored_live_only', 'permission_check_required', 'validated_live_read_only', 'validation_failed', 'unsafe_permissions', 'revoked', 'rotation_required', 'vault_unavailable')",
            name="ck_live_credential_ref_status",
        ),
        CheckConstraint("vault_provider IN ('fake', 'local_dev_encrypted')", name="ck_live_credential_ref_provider"),
    )

    exchange: Mapped[str] = mapped_column(Text, nullable=False)
    environment: Mapped[str] = mapped_column(Text, nullable=False)
    label: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    vault_provider: Mapped[str] = mapped_column(Text, nullable=False)
    vault_secret_ref: Mapped[str] = mapped_column(Text, nullable=False)
    api_key_fingerprint: Mapped[str | None] = mapped_column(Text, nullable=True)
    permission_evidence: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    last_validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_validation_status: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_validation_reason_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    rotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rotated_by: Mapped[str | None] = mapped_column(Text, nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_by: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    audit_events: Mapped[list["LiveCredentialAuditEvent"]] = relationship(
        back_populates="credential_ref",
        order_by="LiveCredentialAuditEvent.created_at",
    )


class LiveCredentialSecret(Base, UUIDPrimaryKeyMixin, AuditMixin, MutableStatusMixin):
    __tablename__ = "live_credential_secret"
    __table_args__ = (
        CheckConstraint("vault_provider IN ('local_dev_encrypted')", name="ck_live_credential_secret_provider"),
    )

    credential_ref_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("live_credential_ref.id"), nullable=False
    )
    vault_secret_ref: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    vault_provider: Mapped[str] = mapped_column(Text, nullable=False)
    encrypted_payload: Mapped[str] = mapped_column(Text, nullable=False)
    encryption_key_fingerprint: Mapped[str] = mapped_column(Text, nullable=False)


class LiveCredentialAuditEvent(Base, UUIDPrimaryKeyMixin, AppendOnlyAuditMixin):
    __tablename__ = "live_credential_audit_event"
    __table_args__ = (
        CheckConstraint("environment IN ('binance_live')", name="ck_live_credential_audit_environment"),
        CheckConstraint(
            "action IN ('live_credential_create_requested', 'live_credential_created', 'live_credential_validation_requested', 'live_credential_validation_started', 'live_credential_validation_completed', 'live_credential_validation_failed', 'live_credential_validation_blocked', 'live_credential_rotated', 'live_credential_revoked', 'live_credential_blocked_unsafe_permissions', 'live_credential_vault_read_requested', 'live_credential_vault_read_allowed', 'live_credential_vault_read_blocked', 'live_credential_vault_read_failed')",
            name="ck_live_credential_audit_action",
        ),
    )

    credential_ref_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("live_credential_ref.id"), nullable=True
    )
    action: Mapped[str] = mapped_column(Text, nullable=False)
    actor: Mapped[str] = mapped_column(Text, nullable=False)
    environment: Mapped[str] = mapped_column(Text, nullable=False)
    reason_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    request_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    idempotency_key_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    credential_ref: Mapped["LiveCredentialRef | None"] = relationship(back_populates="audit_events")


class LivePilotControl(Base, UUIDPrimaryKeyMixin, AuditMixin, MutableStatusMixin):
    __tablename__ = "live_pilot_control"
    __table_args__ = (
        UniqueConstraint("exchange", "environment", name="uq_live_pilot_control_scope"),
        CheckConstraint("exchange IN ('binance')", name="ck_live_pilot_control_exchange"),
        CheckConstraint("environment IN ('binance_live')", name="ck_live_pilot_control_environment"),
        CheckConstraint("status IN ('ready', 'hard_stop')", name="ck_live_pilot_control_status"),
        CheckConstraint(
            "proof_window_status IN ('closed', 'open', 'consumed', 'expired')",
            name="ck_live_pilot_control_proof_window_status",
        ),
        CheckConstraint(
            "proof_window_remaining_intent_budget >= 0",
            name="ck_live_pilot_control_proof_window_budget_non_negative",
        ),
    )

    exchange: Mapped[str] = mapped_column(Text, nullable=False)
    environment: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    hard_stop_reason_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    active_intent_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    reopened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reopened_by: Mapped[str | None] = mapped_column(Text, nullable=True)
    proof_window_status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'closed'"))
    proof_window_opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    proof_window_opened_by: Mapped[str | None] = mapped_column(Text, nullable=True)
    proof_window_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    proof_window_remaining_intent_budget: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    proof_window_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    proof_window_closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    proof_window_closed_by: Mapped[str | None] = mapped_column(Text, nullable=True)
    proof_window_closed_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )


class LiveOrderIntent(Base, UUIDPrimaryKeyMixin, AuditMixin, MutableStatusMixin):
    __tablename__ = "live_order_intent"
    __table_args__ = (
        UniqueConstraint("intent_key", name="uq_live_order_intent_key"),
        UniqueConstraint("client_order_id", name="uq_live_order_intent_client_order_id"),
        CheckConstraint("environment IN ('binance_live')", name="ck_live_order_intent_environment"),
        CheckConstraint("exchange IN ('binance')", name="ck_live_order_intent_exchange"),
        CheckConstraint("market_type IN ('spot')", name="ck_live_order_intent_market_type"),
        CheckConstraint("side IN ('buy', 'sell')", name="ck_live_order_intent_side"),
        CheckConstraint("order_type IN ('market')", name="ck_live_order_intent_order_type"),
        CheckConstraint("quantity IS NULL OR quantity >= 0", name="ck_live_order_intent_quantity_non_negative"),
        CheckConstraint("quote_quantity IS NULL OR quote_quantity >= 0", name="ck_live_order_intent_quote_quantity_non_negative"),
        CheckConstraint(
            "status IN ('draft_previewed', 'preview_blocked', 'confirmed', 'submitting', 'submitted', 'partially_filled', 'filled', 'cancel_requested', 'cancelled', 'rejected', 'unknown', 'reconciliation_required', 'reconciled', 'journal_projected')",
            name="ck_live_order_intent_status",
        ),
    )

    intent_key: Mapped[str] = mapped_column(Text, nullable=False)
    strategy_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("strategy.id"), nullable=False)
    strategy_version_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("strategy_version.id"), nullable=False)
    source_run_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("bot_run.id"), nullable=True)
    source_signal_package_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    credential_ref_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("live_credential_ref.id"), nullable=False)
    environment: Mapped[str] = mapped_column(Text, nullable=False)
    exchange: Mapped[str] = mapped_column(Text, nullable=False)
    market_type: Mapped[str] = mapped_column(Text, nullable=False)
    symbol: Mapped[str] = mapped_column(Text, nullable=False)
    side: Mapped[str] = mapped_column(Text, nullable=False)
    order_type: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[Decimal | None] = mapped_column(Numeric(28, 12), nullable=True)
    quote_quantity: Mapped[Decimal | None] = mapped_column(Numeric(28, 12), nullable=True)
    client_order_id: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    status_reason_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    latest_preview_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    exchange_order_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    exchange_order_status: Mapped[str | None] = mapped_column(Text, nullable=True)
    unknown_since: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reconciliation_required: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))
    journal_entry_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("manual_trade_journal_entry.id"), nullable=True
    )
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    previews: Mapped[list["LiveOrderPreview"]] = relationship(
        back_populates="intent",
        foreign_keys="LiveOrderPreview.intent_id",
    )
    events: Mapped[list["LiveOrderEvent"]] = relationship(
        back_populates="intent",
        foreign_keys="LiveOrderEvent.intent_id",
        order_by="LiveOrderEvent.created_at",
    )
    reconciliation_attempts: Mapped[list["LiveReconciliationAttempt"]] = relationship(
        back_populates="intent",
        foreign_keys="LiveReconciliationAttempt.intent_id",
        order_by="LiveReconciliationAttempt.attempt_no",
    )


class LiveOrderPreview(Base, UUIDPrimaryKeyMixin, AuditMixin, MutableStatusMixin):
    __tablename__ = "live_order_preview"
    __table_args__ = (
        UniqueConstraint("preview_key", name="uq_live_order_preview_key"),
        CheckConstraint("status IN ('allowed', 'blocked', 'expired')", name="ck_live_order_preview_status"),
        CheckConstraint("side IN ('buy', 'sell')", name="ck_live_order_preview_side"),
        CheckConstraint("order_type IN ('market')", name="ck_live_order_preview_order_type"),
        CheckConstraint("quantity IS NULL OR quantity >= 0", name="ck_live_order_preview_quantity_non_negative"),
        CheckConstraint("quote_quantity IS NULL OR quote_quantity >= 0", name="ck_live_order_preview_quote_quantity_non_negative"),
        CheckConstraint("estimated_notional IS NULL OR estimated_notional >= 0", name="ck_live_order_preview_notional_non_negative"),
        CheckConstraint("estimated_fee IS NULL OR estimated_fee >= 0", name="ck_live_order_preview_fee_non_negative"),
    )

    intent_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("live_order_intent.id"), nullable=False)
    preview_key: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    reason_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    symbol: Mapped[str] = mapped_column(Text, nullable=False)
    side: Mapped[str] = mapped_column(Text, nullable=False)
    order_type: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[Decimal | None] = mapped_column(Numeric(28, 12), nullable=True)
    quote_quantity: Mapped[Decimal | None] = mapped_column(Numeric(28, 12), nullable=True)
    estimated_notional: Mapped[Decimal | None] = mapped_column(Numeric(28, 12), nullable=True)
    estimated_fee: Mapped[Decimal | None] = mapped_column(Numeric(28, 12), nullable=True)
    risk_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    credential_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    source_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    intent: Mapped["LiveOrderIntent"] = relationship(back_populates="previews")


class LiveOrderEvent(Base, UUIDPrimaryKeyMixin, AppendOnlyAuditMixin):
    __tablename__ = "live_order_event"
    __table_args__ = (
        CheckConstraint(
            "event_type IN ('live_order_preview_created', 'live_order_preview_blocked', 'live_order_confirmation_recorded', 'live_order_submit_planned', 'live_order_submit_attempted', 'live_order_submit_accepted', 'live_order_submit_rejected', 'live_order_submit_unknown_recorded', 'live_order_submit_blocked', 'live_order_cancel_requested', 'live_order_cancel_accepted', 'live_order_cancel_rejected', 'live_order_cancel_unknown_recorded', 'live_order_cancel_blocked', 'live_order_unknown_recorded', 'live_order_reconciliation_required', 'live_order_reconciliation_attempt_recorded', 'live_order_reconcile_started', 'live_order_reconcile_completed', 'live_order_reconcile_not_found', 'live_order_reconcile_ambiguous', 'live_order_reconcile_blocked', 'live_order_journal_projection_planned')",
            name="ck_live_order_event_type",
        ),
    )

    intent_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("live_order_intent.id"), nullable=False)
    preview_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("live_order_preview.id"), nullable=True)
    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    from_status: Mapped[str | None] = mapped_column(Text, nullable=True)
    to_status: Mapped[str | None] = mapped_column(Text, nullable=True)
    reason_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    idempotency_key_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    client_order_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    exchange_order_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    actor: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    intent: Mapped["LiveOrderIntent"] = relationship(back_populates="events")
    preview: Mapped["LiveOrderPreview | None"] = relationship()


class LiveReconciliationAttempt(Base, UUIDPrimaryKeyMixin, AppendOnlyAuditMixin):
    __tablename__ = "live_reconciliation_attempt"
    __table_args__ = (
        UniqueConstraint("intent_id", "attempt_no", name="uq_live_reconciliation_attempt_intent_attempt"),
        CheckConstraint("attempt_no >= 0", name="ck_live_reconciliation_attempt_no_non_negative"),
        CheckConstraint("trigger IN ('manual', 'submit_timeout', 'cancel_race', 'operator_review')", name="ck_live_reconciliation_attempt_trigger"),
        CheckConstraint("status IN ('started', 'matched', 'not_found', 'ambiguous', 'failed')", name="ck_live_reconciliation_attempt_status"),
    )

    intent_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("live_order_intent.id"), nullable=False)
    attempt_no: Mapped[int] = mapped_column(Integer, nullable=False)
    trigger: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    reason_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    exchange_order_status: Mapped[str | None] = mapped_column(Text, nullable=True)
    fills_snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    intent: Mapped["LiveOrderIntent"] = relationship(back_populates="reconciliation_attempts")

class ExchangeSymbol(Base, UUIDPrimaryKeyMixin, AuditMixin, MutableStatusMixin):
    __tablename__ = "exchange_symbol"

    exchange: Mapped[str] = mapped_column(Text, nullable=False)
    symbol: Mapped[str] = mapped_column(Text, nullable=False)
    base_asset: Mapped[str] = mapped_column(Text, nullable=False)
    quote_asset: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    tick_size: Mapped[Decimal | None] = mapped_column(Numeric(28, 12), nullable=True)
    step_size: Mapped[Decimal | None] = mapped_column(Numeric(28, 12), nullable=True)
    min_qty: Mapped[Decimal | None] = mapped_column(Numeric(28, 12), nullable=True)
    min_notional: Mapped[Decimal | None] = mapped_column(Numeric(28, 12), nullable=True)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )


class MarketDataImportJob(Base, UUIDPrimaryKeyMixin, AuditMixin, MutableStatusMixin):
    __tablename__ = "market_data_import_job"

    coverage_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("market_data_coverage.id"), nullable=True
    )
    dataset_key: Mapped[str] = mapped_column(Text, nullable=False)
    job_type: Mapped[str] = mapped_column(Text, nullable=False)
    exchange: Mapped[str] = mapped_column(Text, nullable=False)
    symbol: Mapped[str] = mapped_column(Text, nullable=False)
    timeframe: Mapped[str] = mapped_column(Text, nullable=False)
    requested_start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    requested_end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    applied_start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    applied_end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    worker_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    rows_imported: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    coverage: Mapped["MarketDataCoverage | None"] = relationship(back_populates="import_jobs")


class MarketDataCoverage(Base, UUIDPrimaryKeyMixin, AuditMixin, MutableStatusMixin):
    __tablename__ = "market_data_coverage"

    dataset_key: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    exchange: Mapped[str] = mapped_column(Text, nullable=False)
    symbol: Mapped[str] = mapped_column(Text, nullable=False)
    timeframe: Mapped[str] = mapped_column(Text, nullable=False)
    health_status: Mapped[str] = mapped_column(Text, nullable=False)
    earliest_open_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    latest_open_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    covered_start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    covered_end_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    segment_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    gap_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    segments: Mapped[list["MarketDataCoverageSegment"]] = relationship(
        back_populates="coverage",
        cascade="all, delete-orphan",
        order_by="MarketDataCoverageSegment.segment_index",
    )
    import_jobs: Mapped[list["MarketDataImportJob"]] = relationship(back_populates="coverage")


class MarketDataCoverageSegment(Base, UUIDPrimaryKeyMixin, AuditMixin, MutableStatusMixin):
    __tablename__ = "market_data_coverage_segment"

    coverage_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("market_data_coverage.id"), nullable=False
    )
    segment_index: Mapped[int] = mapped_column(Integer, nullable=False)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    row_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    coverage: Mapped["MarketDataCoverage"] = relationship(back_populates="segments")


class MarketDataJobRunLink(Base, UUIDPrimaryKeyMixin, AuditMixin, MutableStatusMixin):
    __tablename__ = "market_data_job_run_link"

    import_job_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("market_data_import_job.id"), nullable=False
    )
    bot_run_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("bot_run.id"), nullable=False
    )
    link_status: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    import_job: Mapped["MarketDataImportJob"] = relationship()
    bot_run: Mapped["BotRun"] = relationship(back_populates="data_job_links")


class BenchmarkRunCheck(Base, UUIDPrimaryKeyMixin, AuditMixin, MutableStatusMixin):
    __tablename__ = "benchmark_run_check"

    baseline_run_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("bot_run.id"), nullable=False
    )
    repeat_run_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("bot_run.id"), nullable=True
    )
    strategy_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("strategy.id"), nullable=False
    )
    strategy_version_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("strategy_version.id"), nullable=False
    )
    dataset_key: Mapped[str] = mapped_column(Text, nullable=False)
    input_fingerprint: Mapped[str] = mapped_column(Text, nullable=False)
    repeat_input_fingerprint: Mapped[str | None] = mapped_column(Text, nullable=True)
    input_match: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    result_fingerprint: Mapped[str | None] = mapped_column(Text, nullable=True)
    repeat_result_fingerprint: Mapped[str | None] = mapped_column(Text, nullable=True)
    result_match: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    tolerance_policy: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    metric_diffs: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    status: Mapped[str] = mapped_column(Text, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    baseline_run: Mapped["BotRun"] = relationship(foreign_keys=[baseline_run_id])
    repeat_run: Mapped["BotRun | None"] = relationship(foreign_keys=[repeat_run_id])

class BotRun(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "bot_run"

    bot_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("bot.id"), nullable=True
    )
    strategy_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("strategy.id"), nullable=False
    )
    strategy_version_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("strategy_version.id"), nullable=False
    )
    run_type: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    exchange: Mapped[str] = mapped_column(Text, nullable=False)
    symbol: Mapped[str] = mapped_column(Text, nullable=False)
    timeframe: Mapped[str] = mapped_column(Text, nullable=False)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    runtime_config: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    risk_config: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    source_snapshot: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    dataset_context: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    pipeline_context: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    pipeline_status: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'queued'"))
    data_job_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("market_data_import_job.id"), nullable=True
    )
    selected_trade_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    created_by: Mapped[str | None] = mapped_column(Text, nullable=True)

    bot: Mapped["Bot | None"] = relationship(back_populates="bot_runs")
    strategy: Mapped["Strategy"] = relationship(foreign_keys=[strategy_id])
    strategy_version: Mapped["StrategyVersion"] = relationship(
        back_populates="bot_runs",
        foreign_keys=[strategy_version_id],
    )
    data_job: Mapped["MarketDataImportJob | None"] = relationship()
    data_job_links: Mapped[list["MarketDataJobRunLink"]] = relationship(
        back_populates="bot_run",
        cascade="all, delete-orphan",
    )
    result: Mapped["BacktestResult | None"] = relationship(back_populates="bot_run", uselist=False)
    signals: Mapped[list["StrategySignal"]] = relationship(back_populates="bot_run")
    order_intents: Mapped[list["OrderIntent"]] = relationship(back_populates="bot_run")
    trade_orders: Mapped[list["TradeOrder"]] = relationship(back_populates="bot_run")
    logs: Mapped[list["StrategyLog"]] = relationship(back_populates="bot_run")
    positions: Mapped[list["BacktestPosition"]] = relationship(back_populates="bot_run")


class MarketCandle(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "market_candle"

    exchange: Mapped[str] = mapped_column(Text, nullable=False)
    symbol: Mapped[str] = mapped_column(Text, nullable=False)
    timeframe: Mapped[str] = mapped_column(Text, nullable=False)
    open_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    close_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    open: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False)
    high: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False)
    low: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False)
    close: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False)
    volume: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False)
    quote_volume: Mapped[Decimal | None] = mapped_column(Numeric(28, 12), nullable=True)
    trade_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'binance'"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class BacktestResult(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "backtest_result"

    bot_run_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("bot_run.id"), nullable=False
    )
    initial_equity: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False)
    final_equity: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False)
    total_return_pct: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False)
    max_drawdown_pct: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False)
    profit_factor: Mapped[Decimal | None] = mapped_column(Numeric(28, 12), nullable=True)
    win_rate_pct: Mapped[Decimal | None] = mapped_column(Numeric(28, 12), nullable=True)
    total_trades: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    metrics: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    equity_curve: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, server_default=text("'[]'::jsonb")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    bot_run: Mapped["BotRun"] = relationship(back_populates="result")


class StrategySignal(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "strategy_signal"

    bot_run_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("bot_run.id"), nullable=False
    )
    candle_open_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    signal_type: Mapped[str] = mapped_column(Text, nullable=False)
    strength: Mapped[Decimal | None] = mapped_column(Numeric(28, 12), nullable=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    bot_run: Mapped["BotRun"] = relationship(back_populates="signals")
    order_intents: Mapped[list["OrderIntent"]] = relationship(back_populates="strategy_signal")


class OrderIntent(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "order_intent"

    bot_run_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("bot_run.id"), nullable=False
    )
    strategy_signal_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("strategy_signal.id"), nullable=True
    )
    side: Mapped[str] = mapped_column(Text, nullable=False)
    order_type: Mapped[str] = mapped_column(Text, nullable=False)
    requested_qty: Mapped[Decimal | None] = mapped_column(Numeric(28, 12), nullable=True)
    requested_notional: Mapped[Decimal | None] = mapped_column(Numeric(28, 12), nullable=True)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    reject_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    bot_run: Mapped["BotRun"] = relationship(back_populates="order_intents")
    strategy_signal: Mapped["StrategySignal | None"] = relationship(back_populates="order_intents")
    trade_orders: Mapped[list["TradeOrder"]] = relationship(back_populates="order_intent")


class TradeOrder(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "trade_order"

    bot_run_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("bot_run.id"), nullable=False
    )
    order_intent_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("order_intent.id"), nullable=True
    )
    side: Mapped[str] = mapped_column(Text, nullable=False)
    order_type: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    fill_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    fill_price: Mapped[Decimal | None] = mapped_column(Numeric(28, 12), nullable=True)
    fill_qty: Mapped[Decimal | None] = mapped_column(Numeric(28, 12), nullable=True)
    fill_notional: Mapped[Decimal | None] = mapped_column(Numeric(28, 12), nullable=True)
    fee_amount: Mapped[Decimal | None] = mapped_column(Numeric(28, 12), nullable=True)
    fee_asset: Mapped[str | None] = mapped_column(Text, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    bot_run: Mapped["BotRun"] = relationship(back_populates="trade_orders")
    order_intent: Mapped["OrderIntent | None"] = relationship(back_populates="trade_orders")


class StrategyLog(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "strategy_log"

    bot_run_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("bot_run.id"), nullable=False
    )
    level: Mapped[str] = mapped_column(Text, nullable=False)
    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    bot_run: Mapped["BotRun"] = relationship(back_populates="logs")


class ManualTradeJournalEntry(Base, UUIDPrimaryKeyMixin, AuditMixin, MutableStatusMixin):
    __tablename__ = "manual_trade_journal_entry"
    __table_args__ = (
        CheckConstraint("side IN ('long', 'short', 'flat_or_watch')", name="ck_manual_trade_journal_entry_side"),
        CheckConstraint(
            "outcome_status IN ('open', 'incomplete', 'win', 'loss', 'breakeven')",
            name="ck_manual_trade_journal_entry_outcome_status",
        ),
        CheckConstraint(
            "discipline_status IN ('followed_plan', 'partial_deviation', 'broke_plan', 'not_recorded')",
            name="ck_manual_trade_journal_entry_discipline_status",
        ),
        CheckConstraint(
            "safety_status IN ('manual_execution_journal_only', 'observed_execution_evidence_only', 'not_live_ready')",
            name="ck_manual_trade_journal_entry_safety_status",
        ),
        Index("idx_manual_trade_journal_entry_run_created", "source_run_id", "created_at"),
        Index("idx_manual_trade_journal_entry_strategy_created", "strategy_id", "created_at"),
    )

    source_run_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("bot_run.id"), nullable=False)
    strategy_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), ForeignKey("strategy.id"), nullable=True)
    strategy_version_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("strategy_version.id"), nullable=True
    )
    symbol: Mapped[str] = mapped_column(Text, nullable=False)
    timeframe: Mapped[str] = mapped_column(Text, nullable=False)
    side: Mapped[str] = mapped_column(Text, nullable=False)
    planned_snapshot: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    comparison_summary: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    outcome_status: Mapped[str] = mapped_column(Text, nullable=False)
    discipline_status: Mapped[str] = mapped_column(Text, nullable=False)
    safety_status: Mapped[str] = mapped_column(Text, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    source_run: Mapped["BotRun"] = relationship()
    strategy: Mapped["Strategy | None"] = relationship()
    strategy_version: Mapped["StrategyVersion | None"] = relationship()
    fills: Mapped[list["ManualTradeJournalFill"]] = relationship(
        back_populates="journal_entry",
        cascade="all, delete-orphan",
    )

class ManualTradeJournalFill(Base, UUIDPrimaryKeyMixin, AuditMixin, MutableStatusMixin):
    __tablename__ = "manual_trade_journal_fill"
    __table_args__ = (
        CheckConstraint("fill_role IN ('entry', 'exit', 'adjustment')", name="ck_manual_trade_journal_fill_role"),
        CheckConstraint("side IN ('buy', 'sell')", name="ck_manual_trade_journal_fill_side"),
        CheckConstraint("price > 0", name="ck_manual_trade_journal_fill_price_positive"),
        CheckConstraint("quantity > 0", name="ck_manual_trade_journal_fill_quantity_positive"),
        CheckConstraint("fee IS NULL OR fee >= 0", name="ck_manual_trade_journal_fill_fee_non_negative"),
        Index("idx_manual_trade_journal_fill_entry_time", "journal_entry_id", "fill_time"),
    )

    journal_entry_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("manual_trade_journal_entry.id"), nullable=False
    )
    fill_role: Mapped[str] = mapped_column(Text, nullable=False)
    side: Mapped[str] = mapped_column(Text, nullable=False)
    fill_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    price: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False)
    fee: Mapped[Decimal | None] = mapped_column(Numeric(28, 12), nullable=True)
    fee_asset: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    journal_entry: Mapped["ManualTradeJournalEntry"] = relationship(back_populates="fills")

class PaperSession(Base, UUIDPrimaryKeyMixin, AuditMixin, MutableStatusMixin):
    __tablename__ = "paper_session"
    __table_args__ = (
        CheckConstraint("mode = 'paper'", name="ck_paper_session_mode_paper"),
        CheckConstraint(
            "status IN ('draft', 'blocked', 'queued', 'running', 'completed', 'failed', 'cancel_requested', 'cancelled')",
            name="ck_paper_session_status",
        ),
        CheckConstraint("starting_cash >= 0", name="ck_paper_session_starting_cash_non_negative"),
        CheckConstraint("end_at >= start_at", name="ck_paper_session_range_order"),
    )

    bot_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("bot.id"), nullable=False)
    strategy_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("strategy.id"), nullable=False
    )
    strategy_version_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("strategy_version.id"), nullable=False
    )
    mode: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    exchange: Mapped[str] = mapped_column(Text, nullable=False)
    symbol: Mapped[str] = mapped_column(Text, nullable=False)
    timeframe: Mapped[str] = mapped_column(Text, nullable=False)
    dataset_key: Mapped[str] = mapped_column(Text, nullable=False)
    start_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancel_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    starting_cash: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False)
    runtime_config: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    risk_config: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    source_snapshot: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    dataset_context: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    gate_context: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    reason_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    bot: Mapped["Bot"] = relationship()
    strategy: Mapped["Strategy"] = relationship()
    strategy_version: Mapped["StrategyVersion"] = relationship()
    orders: Mapped[list["PaperOrder"]] = relationship(back_populates="paper_session")
    fills: Mapped[list["PaperFill"]] = relationship(back_populates="paper_session")
    positions: Mapped[list["PaperPosition"]] = relationship(back_populates="paper_session")
    portfolio_snapshots: Mapped[list["PaperPortfolioSnapshot"]] = relationship(back_populates="paper_session")
    audit_events: Mapped[list["PaperAuditEvent"]] = relationship(back_populates="paper_session")
    resume_checkpoints: Mapped[list["PaperResumeCheckpoint"]] = relationship(back_populates="paper_session")


class PaperOrder(Base, UUIDPrimaryKeyMixin, AuditMixin, MutableStatusMixin):
    __tablename__ = "paper_order"
    __table_args__ = (
        UniqueConstraint("paper_session_id", "artifact_key", name="uq_paper_order_session_artifact_key"),
        CheckConstraint("side IN ('buy', 'sell')", name="ck_paper_order_side"),
        CheckConstraint("order_type = 'market'", name="ck_paper_order_type_market"),
        CheckConstraint(
            "status IN ('created', 'accepted', 'rejected', 'filled', 'cancelled')",
            name="ck_paper_order_status",
        ),
        CheckConstraint("quantity >= 0", name="ck_paper_order_quantity_non_negative"),
        CheckConstraint(
            "requested_price IS NULL OR requested_price >= 0",
            name="ck_paper_order_requested_price_non_negative",
        ),
        CheckConstraint(
            "requested_notional IS NULL OR requested_notional >= 0",
            name="ck_paper_order_requested_notional_non_negative",
        ),
    )

    paper_session_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("paper_session.id"), nullable=False
    )
    side: Mapped[str] = mapped_column(Text, nullable=False)
    order_type: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False)
    requested_price: Mapped[Decimal | None] = mapped_column(Numeric(28, 12), nullable=True)
    requested_notional: Mapped[Decimal | None] = mapped_column(Numeric(28, 12), nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finalized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    artifact_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    reason_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    paper_session: Mapped["PaperSession"] = relationship(back_populates="orders")
    fills: Mapped[list["PaperFill"]] = relationship(back_populates="paper_order")


class PaperFill(Base, UUIDPrimaryKeyMixin, AppendOnlyAuditMixin):
    __tablename__ = "paper_fill"
    __table_args__ = (
        UniqueConstraint("paper_session_id", "artifact_key", name="uq_paper_fill_session_artifact_key"),
        CheckConstraint("side IN ('buy', 'sell')", name="ck_paper_fill_side"),
        CheckConstraint("price >= 0", name="ck_paper_fill_price_non_negative"),
        CheckConstraint("quantity >= 0", name="ck_paper_fill_quantity_non_negative"),
        CheckConstraint("notional >= 0", name="ck_paper_fill_notional_non_negative"),
        CheckConstraint("fee_amount >= 0", name="ck_paper_fill_fee_non_negative"),
    )

    paper_session_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("paper_session.id"), nullable=False
    )
    paper_order_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("paper_order.id"), nullable=False
    )
    source_candle_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("market_candle.id"), nullable=True
    )
    fill_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    side: Mapped[str] = mapped_column(Text, nullable=False)
    price: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False)
    notional: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False)
    fee_amount: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False, server_default=text("0"))
    fee_asset: Mapped[str | None] = mapped_column(Text, nullable=True)
    slippage_amount: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False, server_default=text("0"))
    artifact_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    paper_session: Mapped["PaperSession"] = relationship(back_populates="fills")
    paper_order: Mapped["PaperOrder"] = relationship(back_populates="fills")
    source_candle: Mapped["MarketCandle | None"] = relationship()


class PaperPosition(Base, UUIDPrimaryKeyMixin, AuditMixin, MutableStatusMixin):
    __tablename__ = "paper_position"
    __table_args__ = (
        CheckConstraint("side IN ('long', 'short')", name="ck_paper_position_side"),
        CheckConstraint("status IN ('open', 'closed')", name="ck_paper_position_status"),
        CheckConstraint("quantity >= 0", name="ck_paper_position_quantity_non_negative"),
        CheckConstraint(
            "average_entry_price IS NULL OR average_entry_price >= 0",
            name="ck_paper_position_entry_price_non_negative",
        ),
    )

    paper_session_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("paper_session.id"), nullable=False
    )
    symbol: Mapped[str] = mapped_column(Text, nullable=False)
    side: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False)
    average_entry_price: Mapped[Decimal | None] = mapped_column(Numeric(28, 12), nullable=True)
    realized_pnl: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False, server_default=text("0"))
    unrealized_pnl: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False, server_default=text("0"))
    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    paper_session: Mapped["PaperSession"] = relationship(back_populates="positions")


class PaperPortfolioSnapshot(Base, UUIDPrimaryKeyMixin, AppendOnlyAuditMixin):
    __tablename__ = "paper_portfolio_snapshot"
    __table_args__ = (
        UniqueConstraint(
            "paper_session_id",
            "artifact_key",
            name="uq_paper_portfolio_snapshot_session_artifact_key",
        ),
        CheckConstraint("cash_balance >= 0", name="ck_paper_portfolio_snapshot_cash_non_negative"),
        CheckConstraint("equity >= 0", name="ck_paper_portfolio_snapshot_equity_non_negative"),
        CheckConstraint("fees_paid >= 0", name="ck_paper_portfolio_snapshot_fees_non_negative"),
        CheckConstraint("drawdown_pct >= 0", name="ck_paper_portfolio_snapshot_drawdown_non_negative"),
        CheckConstraint(
            "exposure_notional >= 0",
            name="ck_paper_portfolio_snapshot_exposure_non_negative",
        ),
    )

    paper_session_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("paper_session.id"), nullable=False
    )
    source_candle_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("market_candle.id"), nullable=True
    )
    snapshot_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    cash_balance: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False)
    equity: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False)
    realized_pnl: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False, server_default=text("0"))
    unrealized_pnl: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False, server_default=text("0"))
    fees_paid: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False, server_default=text("0"))
    drawdown_pct: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False, server_default=text("0"))
    exposure_notional: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False, server_default=text("0"))
    artifact_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    paper_session: Mapped["PaperSession"] = relationship(back_populates="portfolio_snapshots")
    source_candle: Mapped["MarketCandle | None"] = relationship()


class PaperAuditEvent(Base, UUIDPrimaryKeyMixin, AppendOnlyAuditMixin):
    __tablename__ = "paper_audit_event"
    __table_args__ = (
        UniqueConstraint("paper_session_id", "artifact_key", name="uq_paper_audit_event_session_artifact_key"),
    )

    paper_session_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("paper_session.id"), nullable=False
    )
    event_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    actor: Mapped[str | None] = mapped_column(Text, nullable=True)
    action: Mapped[str] = mapped_column(Text, nullable=False)
    target_type: Mapped[str] = mapped_column(Text, nullable=False)
    target_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    old_state: Mapped[str | None] = mapped_column(Text, nullable=True)
    new_state: Mapped[str | None] = mapped_column(Text, nullable=True)
    reason_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    correlation_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    request_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    artifact_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    paper_session: Mapped["PaperSession"] = relationship(back_populates="audit_events")


class PaperResumeCheckpoint(Base, UUIDPrimaryKeyMixin, AuditMixin, MutableStatusMixin):
    __tablename__ = "paper_resume_checkpoint"
    __table_args__ = (
        UniqueConstraint(
            "paper_session_id",
            "attempt_no",
            name="uq_paper_resume_checkpoint_session_attempt",
        ),
        CheckConstraint("attempt_no >= 0", name="ck_paper_resume_checkpoint_attempt_non_negative"),
        CheckConstraint("equity >= 0", name="ck_paper_resume_checkpoint_equity_non_negative"),
        CheckConstraint("fees_paid >= 0", name="ck_paper_resume_checkpoint_fees_non_negative"),
        CheckConstraint(
            "exposure_notional >= 0",
            name="ck_paper_resume_checkpoint_exposure_non_negative",
        ),
        CheckConstraint(
            "open_position_quantity >= 0",
            name="ck_paper_resume_checkpoint_position_non_negative",
        ),
        CheckConstraint("max_drawdown_pct >= 0", name="ck_paper_resume_checkpoint_drawdown_non_negative"),
        CheckConstraint("pending_orders_count >= 0", name="ck_paper_resume_checkpoint_pending_non_negative"),
        CheckConstraint(
            "checkpoint_source IN ('persisted', 'derived_diagnostic')",
            name="ck_paper_resume_checkpoint_source",
        ),
        CheckConstraint(
            "strategy_runtime_state_status IN ('stateless_between_candles', 'unsupported')",
            name="ck_paper_resume_checkpoint_strategy_state",
        ),
    )

    paper_session_id: Mapped[UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("paper_session.id"), nullable=False
    )
    attempt_no: Mapped[int] = mapped_column(Integer, nullable=False)
    last_processed_candle_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("market_candle.id"), nullable=True
    )
    last_processed_candle_open_time: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_processed_snapshot_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("paper_portfolio_snapshot.id"), nullable=True
    )
    next_candle_id: Mapped[UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("market_candle.id"), nullable=True
    )
    next_candle_open_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cash_balance: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False)
    equity: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False)
    realized_pnl: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False, server_default=text("0"))
    unrealized_pnl: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False, server_default=text("0"))
    fees_paid: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False, server_default=text("0"))
    exposure_notional: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False, server_default=text("0"))
    open_position_quantity: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False, server_default=text("0"))
    average_entry_price: Mapped[Decimal | None] = mapped_column(Numeric(28, 12), nullable=True)
    peak_equity: Mapped[Decimal | None] = mapped_column(Numeric(28, 12), nullable=True)
    max_drawdown_pct: Mapped[Decimal] = mapped_column(Numeric(28, 12), nullable=False, server_default=text("0"))
    pending_orders_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    strategy_runtime_state_status: Mapped[str] = mapped_column(Text, nullable=False)
    checkpoint_source: Mapped[str] = mapped_column(Text, nullable=False)
    reason_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict[str, Any]] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    paper_session: Mapped["PaperSession"] = relationship(back_populates="resume_checkpoints")
    last_processed_candle: Mapped["MarketCandle | None"] = relationship(foreign_keys=[last_processed_candle_id])
    next_candle: Mapped["MarketCandle | None"] = relationship(foreign_keys=[next_candle_id])
    last_processed_snapshot: Mapped["PaperPortfolioSnapshot | None"] = relationship(
        foreign_keys=[last_processed_snapshot_id]
    )

Index("idx_strategy_group_slug", StrategyGroup.slug)
Index("idx_strategy_slug", Strategy.slug)
Index("idx_strategy_version_strategy", StrategyVersion.strategy_id, StrategyVersion.version_number.desc())
Index("idx_bot_strategy", Bot.strategy_id)
Index("idx_exchange_symbol_lookup", ExchangeSymbol.exchange, ExchangeSymbol.symbol, unique=True)
Index(
    "idx_testnet_credential_ref_lookup",
    TestnetCredentialRef.exchange,
    TestnetCredentialRef.environment,
    TestnetCredentialRef.status,
    TestnetCredentialRef.is_active,
    TestnetCredentialRef.is_deleted,
)
Index("idx_testnet_credential_ref_fingerprint", TestnetCredentialRef.api_key_fingerprint)
Index("idx_testnet_credential_secret_ref_lookup", TestnetCredentialSecret.vault_secret_ref, unique=True)
Index(
    "idx_testnet_credential_secret_credential_active",
    TestnetCredentialSecret.credential_ref_id,
    TestnetCredentialSecret.is_active,
    TestnetCredentialSecret.is_deleted,
)
Index(
    "idx_testnet_credential_audit_credential_time",
    TestnetCredentialAuditEvent.credential_ref_id,
    TestnetCredentialAuditEvent.created_at,
)
Index(
    "idx_testnet_credential_audit_action_time",
    TestnetCredentialAuditEvent.action,
    TestnetCredentialAuditEvent.created_at,
)
Index("idx_testnet_credential_audit_idempotency_hash", TestnetCredentialAuditEvent.idempotency_key_hash)
Index("idx_testnet_order_intent_key", TestnetOrderIntent.intent_key, unique=True)
Index("idx_testnet_order_intent_status_created", TestnetOrderIntent.status, TestnetOrderIntent.created_at.desc())
Index(
    "idx_testnet_order_intent_strategy_created",
    TestnetOrderIntent.strategy_id,
    TestnetOrderIntent.strategy_version_id,
    TestnetOrderIntent.created_at.desc(),
)
Index("idx_testnet_order_intent_client_order_id", TestnetOrderIntent.client_order_id, unique=True)
Index("idx_testnet_order_preview_intent_created", TestnetOrderPreview.intent_id, TestnetOrderPreview.created_at.desc())
Index("idx_testnet_order_preview_key", TestnetOrderPreview.preview_key, unique=True)
Index("idx_testnet_order_event_intent_created", TestnetOrderEvent.intent_id, TestnetOrderEvent.created_at)
Index("idx_testnet_order_event_type_created", TestnetOrderEvent.event_type, TestnetOrderEvent.created_at)
Index("idx_testnet_order_event_idempotency_hash", TestnetOrderEvent.idempotency_key_hash)
Index(
    "idx_testnet_reconciliation_attempt_intent_attempt",
    TestnetReconciliationAttempt.intent_id,
    TestnetReconciliationAttempt.attempt_no,
)
Index(
    "idx_testnet_reconciliation_attempt_status_created",
    TestnetReconciliationAttempt.status,
    TestnetReconciliationAttempt.created_at,
)
Index("idx_live_credential_ref_lookup", LiveCredentialRef.exchange, LiveCredentialRef.environment, LiveCredentialRef.status, LiveCredentialRef.is_active, LiveCredentialRef.is_deleted)
Index("idx_live_credential_ref_fingerprint", LiveCredentialRef.api_key_fingerprint)
Index("idx_live_credential_secret_ref_lookup", LiveCredentialSecret.vault_secret_ref, unique=True)
Index(
    "idx_live_credential_secret_credential_active",
    LiveCredentialSecret.credential_ref_id,
    LiveCredentialSecret.is_active,
    LiveCredentialSecret.is_deleted,
)
Index(
    "idx_live_credential_audit_credential_time",
    LiveCredentialAuditEvent.credential_ref_id,
    LiveCredentialAuditEvent.created_at,
)
Index(
    "idx_live_credential_audit_action_time",
    LiveCredentialAuditEvent.action,
    LiveCredentialAuditEvent.created_at,
)
Index("idx_live_credential_audit_idempotency_hash", LiveCredentialAuditEvent.idempotency_key_hash)
Index("idx_live_pilot_control_scope", LivePilotControl.exchange, LivePilotControl.environment, unique=True)
Index("idx_live_order_intent_key", LiveOrderIntent.intent_key, unique=True)
Index("idx_live_order_intent_status_created", LiveOrderIntent.status, LiveOrderIntent.created_at.desc())
Index(
    "idx_live_order_intent_strategy_created",
    LiveOrderIntent.strategy_id,
    LiveOrderIntent.strategy_version_id,
    LiveOrderIntent.created_at.desc(),
)
Index("idx_live_order_intent_client_order_id", LiveOrderIntent.client_order_id, unique=True)
Index("idx_live_order_preview_intent_created", LiveOrderPreview.intent_id, LiveOrderPreview.created_at.desc())
Index("idx_live_order_preview_key", LiveOrderPreview.preview_key, unique=True)
Index("idx_live_order_event_intent_created", LiveOrderEvent.intent_id, LiveOrderEvent.created_at)
Index("idx_live_order_event_type_created", LiveOrderEvent.event_type, LiveOrderEvent.created_at)
Index("idx_live_order_event_idempotency_hash", LiveOrderEvent.idempotency_key_hash)
Index(
    "idx_live_reconciliation_attempt_intent_attempt",
    LiveReconciliationAttempt.intent_id,
    LiveReconciliationAttempt.attempt_no,
)
Index(
    "idx_live_reconciliation_attempt_status_created",
    LiveReconciliationAttempt.status,
    LiveReconciliationAttempt.created_at,
)
Index("idx_market_data_coverage_dataset", MarketDataCoverage.exchange, MarketDataCoverage.symbol, MarketDataCoverage.timeframe, unique=True)
Index("idx_market_data_coverage_segment_lookup", MarketDataCoverageSegment.coverage_id, MarketDataCoverageSegment.start_at, MarketDataCoverageSegment.end_at, unique=True)
Index("idx_market_data_import_job_dataset_status", MarketDataImportJob.dataset_key, MarketDataImportJob.status, MarketDataImportJob.created_at.desc())
Index("idx_market_data_import_job_active", MarketDataImportJob.dataset_key, MarketDataImportJob.job_type, MarketDataImportJob.is_active, MarketDataImportJob.is_deleted)
Index("idx_market_data_job_run_link_job", MarketDataJobRunLink.import_job_id, MarketDataJobRunLink.bot_run_id, unique=True)
Index(
    "idx_market_candle_lookup",
    MarketCandle.exchange,
    MarketCandle.symbol,
    MarketCandle.timeframe,
    MarketCandle.open_time,
    unique=True,
)
Index("idx_bot_run_strategy", BotRun.strategy_id, BotRun.strategy_version_id)
Index("idx_bot_run_strategy_created_status", BotRun.strategy_id, BotRun.created_at.desc(), BotRun.status)
Index("idx_bot_run_data_job", BotRun.data_job_id, BotRun.status)
Index("idx_bot_run_created_at", BotRun.created_at.desc())
Index("idx_trade_order_run", TradeOrder.bot_run_id, TradeOrder.created_at)
Index("idx_strategy_log_run", StrategyLog.bot_run_id, StrategyLog.created_at)
Index("idx_paper_session_bot_status_created", PaperSession.bot_id, PaperSession.status, PaperSession.created_at.desc())
Index(
    "idx_paper_session_strategy_created",
    PaperSession.strategy_id,
    PaperSession.strategy_version_id,
    PaperSession.created_at.desc(),
)
Index(
    "idx_paper_session_dataset",
    PaperSession.exchange,
    PaperSession.symbol,
    PaperSession.timeframe,
    PaperSession.start_at,
    PaperSession.end_at,
)
Index("idx_paper_session_status_created", PaperSession.status, PaperSession.created_at.desc())
Index("idx_paper_order_session_created", PaperOrder.paper_session_id, PaperOrder.created_at)
Index("idx_paper_order_session_status", PaperOrder.paper_session_id, PaperOrder.status, PaperOrder.created_at)
Index("idx_paper_order_artifact_key", PaperOrder.paper_session_id, PaperOrder.artifact_key)
Index("idx_paper_fill_session_time", PaperFill.paper_session_id, PaperFill.fill_time)
Index("idx_paper_fill_order", PaperFill.paper_order_id, PaperFill.fill_time)
Index("idx_paper_fill_candle", PaperFill.source_candle_id)
Index("idx_paper_fill_artifact_key", PaperFill.paper_session_id, PaperFill.artifact_key)
Index("idx_paper_position_session_symbol", PaperPosition.paper_session_id, PaperPosition.symbol)
Index("idx_paper_position_session_status", PaperPosition.paper_session_id, PaperPosition.status)
Index(
    "idx_paper_portfolio_snapshot_session_time",
    PaperPortfolioSnapshot.paper_session_id,
    PaperPortfolioSnapshot.snapshot_at,
)
Index("idx_paper_portfolio_snapshot_candle", PaperPortfolioSnapshot.source_candle_id)
Index(
    "idx_paper_portfolio_snapshot_artifact_key",
    PaperPortfolioSnapshot.paper_session_id,
    PaperPortfolioSnapshot.artifact_key,
)
Index("idx_paper_audit_event_session_time", PaperAuditEvent.paper_session_id, PaperAuditEvent.event_at)
Index("idx_paper_audit_event_action_time", PaperAuditEvent.action, PaperAuditEvent.event_at)
Index("idx_paper_audit_event_correlation", PaperAuditEvent.correlation_id)
Index("idx_paper_audit_event_artifact_key", PaperAuditEvent.paper_session_id, PaperAuditEvent.artifact_key)
Index(
    "idx_paper_resume_checkpoint_session_attempt",
    PaperResumeCheckpoint.paper_session_id,
    PaperResumeCheckpoint.attempt_no,
)
Index(
    "idx_paper_resume_checkpoint_session_active",
    PaperResumeCheckpoint.paper_session_id,
    PaperResumeCheckpoint.is_active,
    PaperResumeCheckpoint.is_deleted,
)


class BacktestPosition(Base, UUIDPrimaryKeyMixin, AuditMixin, MutableStatusMixin):
    __tablename__ = "tradelab_backtest_position"

    run_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("bot_run.id"), index=True, nullable=False)
    symbol: Mapped[str] = mapped_column(Text, nullable=False)
    side: Mapped[str] = mapped_column(Text, nullable=False)  # LONG or SHORT
    size: Mapped[Decimal] = mapped_column(Numeric, nullable=False)
    leverage: Mapped[int] = mapped_column(Integer, nullable=False)
    entry_price: Mapped[Decimal] = mapped_column(Numeric, nullable=False)
    close_price: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    liquidation_price: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    margin_mode: Mapped[str | None] = mapped_column(Text, nullable=True)
    maintenance_margin: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    funding_fee_paid: Mapped[Decimal] = mapped_column(Numeric, nullable=False, default=Decimal("0"))
    max_notional: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    max_margin_used: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    peak_leverage_used: Mapped[Decimal | None] = mapped_column(Numeric, nullable=True)
    realized_pnl: Mapped[Decimal] = mapped_column(Numeric, nullable=False, default=Decimal("0.0"))
    status: Mapped[str] = mapped_column(Text, nullable=False)  # OPEN, CLOSED, LIQUIDATED

    bot_run: Mapped["BotRun"] = relationship(back_populates="positions")



