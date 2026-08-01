from __future__ import annotations

from collections.abc import Iterator
import os

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine, URL, make_url
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from tradelab_api.core.config import get_settings
from tradelab_api.db.testnet_order_event_types import (
    testnet_order_event_type_check_constraint_sql,
)


DEFAULT_DB_CONNECT_TIMEOUT_SECONDS = 5


def database_connect_timeout_seconds() -> int:
    raw_timeout = os.getenv("TRADELAB_DB_CONNECT_TIMEOUT_SECONDS")
    if raw_timeout is None:
        return DEFAULT_DB_CONNECT_TIMEOUT_SECONDS
    try:
        parsed_timeout = int(raw_timeout)
    except ValueError:
        return DEFAULT_DB_CONNECT_TIMEOUT_SECONDS
    return parsed_timeout if parsed_timeout > 0 else DEFAULT_DB_CONNECT_TIMEOUT_SECONDS


def database_connect_args(database_url: URL) -> dict[str, object]:
    if database_url.drivername.startswith("postgresql"):
        return {"connect_timeout": database_connect_timeout_seconds()}
    return {}


def normalize_database_url(database_url: str) -> URL:
    normalized_url = make_url(database_url)
    if normalized_url.drivername in {"postgres", "postgresql"}:
        return normalized_url.set(drivername="postgresql+psycopg")
    return normalized_url

def create_db_engine(database_url: str | None = None) -> Engine:
    active_database_url = normalize_database_url(database_url or get_settings().database_url)
    timeout_seconds = database_connect_timeout_seconds()
    return create_engine(
        active_database_url,
        pool_pre_ping=True,
        pool_timeout=timeout_seconds,
        connect_args=database_connect_args(active_database_url),
        future=True,
    )


SessionLocal = sessionmaker(
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
    class_=Session,
)


def get_engine() -> Engine:
    if not hasattr(get_engine, "_engine"):
        setattr(get_engine, "_engine", create_db_engine())
    return getattr(get_engine, "_engine")


def get_db_session() -> Iterator[Session]:
    session = SessionLocal(bind=get_engine())
    try:
        yield session
    finally:
        session.close()


def verify_database_connection(database_engine: Engine | None = None) -> None:
    active_engine = database_engine or get_engine()
    try:
        with active_engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:  # pragma: no cover - exercised in runtime startup failures
        safe_url = active_engine.url.render_as_string(hide_password=True)
        raise RuntimeError(f"TradeLab database connection failed for {safe_url}") from exc

def apply_schema_compatibility(database_engine: Engine | None = None) -> None:
    active_engine = database_engine or get_engine()
    event_type_check_sql = testnet_order_event_type_check_constraint_sql()
    with active_engine.begin() as connection:
        connection.execute(
            text(
                """
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM pg_constraint constraint_info
                        JOIN pg_class table_info
                            ON table_info.oid = constraint_info.conrelid
                        WHERE table_info.relname = 'testnet_credential_ref'
                            AND constraint_info.conname = 'ck_testnet_credential_ref_status'
                    ) THEN
                        ALTER TABLE testnet_credential_ref DROP CONSTRAINT ck_testnet_credential_ref_status;
                    END IF;
                    IF EXISTS (
                        SELECT 1
                        FROM pg_class table_info
                        WHERE table_info.relname = 'testnet_credential_ref'
                    ) THEN
                        ALTER TABLE testnet_credential_ref
                            ADD CONSTRAINT ck_testnet_credential_ref_status
                            CHECK (status IN ('missing', 'stored_testnet_only', 'permission_check_required', 'validated_testnet_read_only', 'validation_failed', 'unsafe_permissions', 'revoked', 'rotation_required', 'vault_unavailable'));
                    END IF;
                END
                $$;
                """
            )
        )
        connection.execute(
            text(
                """
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM pg_constraint constraint_info
                        JOIN pg_class table_info
                            ON table_info.oid = constraint_info.conrelid
                        WHERE table_info.relname = 'testnet_credential_audit_event'
                            AND constraint_info.conname = 'ck_testnet_credential_audit_action'
                    ) THEN
                        ALTER TABLE testnet_credential_audit_event DROP CONSTRAINT ck_testnet_credential_audit_action;
                    END IF;
                    IF EXISTS (
                        SELECT 1
                        FROM pg_class table_info
                        WHERE table_info.relname = 'testnet_credential_audit_event'
                    ) THEN
                        ALTER TABLE testnet_credential_audit_event
                            ADD CONSTRAINT ck_testnet_credential_audit_action
                            CHECK (action IN ('testnet_credential_create_requested', 'testnet_credential_created', 'testnet_credential_validation_requested', 'testnet_credential_validation_started', 'testnet_credential_validation_completed', 'testnet_credential_validation_failed', 'testnet_credential_validation_blocked', 'testnet_credential_rotated', 'testnet_credential_revoked', 'testnet_credential_blocked_unsafe_permissions', 'testnet_credential_vault_read_requested', 'testnet_credential_vault_read_allowed', 'testnet_credential_vault_read_blocked', 'testnet_credential_vault_read_failed'));
                    END IF;
                END
                $$;
                """
            )
        )
        connection.execute(
            text(
                """
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM pg_constraint constraint_info
                        JOIN pg_class table_info
                            ON table_info.oid = constraint_info.conrelid
                        WHERE table_info.relname = 'bot'
                            AND constraint_info.conname = 'ck_bot_phase1_mode_backtest'
                    ) THEN
                        ALTER TABLE bot DROP CONSTRAINT ck_bot_phase1_mode_backtest;
                        ALTER TABLE bot
                            ADD CONSTRAINT ck_bot_phase1_mode_backtest
                            CHECK (mode IN ('backtest', 'paper'));
                    END IF;
                END
                $$;
                """
            )
        )
        connection.execute(
            text(
                """
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM pg_constraint constraint_info
                        JOIN pg_class table_info
                            ON table_info.oid = constraint_info.conrelid
                        WHERE table_info.relname = 'testnet_order_event'
                            AND constraint_info.conname = 'ck_testnet_order_event_type'
                    ) THEN
                        ALTER TABLE testnet_order_event DROP CONSTRAINT ck_testnet_order_event_type;
                    END IF;
                    IF EXISTS (
                        SELECT 1
                        FROM pg_class table_info
                        WHERE table_info.relname = 'testnet_order_event'
                    ) THEN
                        ALTER TABLE testnet_order_event
                            ADD CONSTRAINT ck_testnet_order_event_type
                            CHECK (__EVENT_TYPE_CHECK_SQL__);
                    END IF;
                END
                $$;
                """
                .replace("__EVENT_TYPE_CHECK_SQL__", event_type_check_sql)
            )
        )
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS manual_trade_journal_entry (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    source_run_id uuid NOT NULL REFERENCES bot_run(id),
                    strategy_id uuid NULL REFERENCES strategy(id),
                    strategy_version_id uuid NULL REFERENCES strategy_version(id),
                    symbol text NOT NULL,
                    timeframe text NOT NULL,
                    side text NOT NULL,
                    planned_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
                    comparison_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
                    outcome_status text NOT NULL,
                    discipline_status text NOT NULL,
                    safety_status text NOT NULL,
                    notes text NULL,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    created_by text NULL,
                    updated_at timestamptz NULL,
                    updated_by text NULL,
                    is_active boolean NOT NULL DEFAULT true,
                    is_deleted boolean NOT NULL DEFAULT false,
                    CONSTRAINT ck_manual_trade_journal_entry_side CHECK (side IN ('long', 'short', 'flat_or_watch')),
                    CONSTRAINT ck_manual_trade_journal_entry_outcome_status CHECK (outcome_status IN ('open', 'incomplete', 'win', 'loss', 'breakeven')),
                    CONSTRAINT ck_manual_trade_journal_entry_discipline_status CHECK (discipline_status IN ('followed_plan', 'partial_deviation', 'broke_plan', 'not_recorded')),
                    CONSTRAINT ck_manual_trade_journal_entry_safety_status CHECK (safety_status IN ('manual_execution_journal_only', 'observed_execution_evidence_only', 'not_live_ready'))
                );

                CREATE TABLE IF NOT EXISTS manual_trade_journal_fill (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    journal_entry_id uuid NOT NULL REFERENCES manual_trade_journal_entry(id),
                    fill_role text NOT NULL,
                    side text NOT NULL,
                    fill_time timestamptz NULL,
                    price numeric(28, 12) NOT NULL,
                    quantity numeric(28, 12) NOT NULL,
                    fee numeric(28, 12) NULL,
                    fee_asset text NULL,
                    notes text NULL,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    created_by text NULL,
                    updated_at timestamptz NULL,
                    updated_by text NULL,
                    is_active boolean NOT NULL DEFAULT true,
                    is_deleted boolean NOT NULL DEFAULT false,
                    CONSTRAINT ck_manual_trade_journal_fill_role CHECK (fill_role IN ('entry', 'exit', 'adjustment')),
                    CONSTRAINT ck_manual_trade_journal_fill_side CHECK (side IN ('buy', 'sell')),
                    CONSTRAINT ck_manual_trade_journal_fill_price_positive CHECK (price > 0),
                    CONSTRAINT ck_manual_trade_journal_fill_quantity_positive CHECK (quantity > 0),
                    CONSTRAINT ck_manual_trade_journal_fill_fee_non_negative CHECK (fee IS NULL OR fee >= 0)
                );

                CREATE INDEX IF NOT EXISTS idx_manual_trade_journal_entry_run_created
                    ON manual_trade_journal_entry (source_run_id, created_at);
                CREATE INDEX IF NOT EXISTS idx_manual_trade_journal_entry_strategy_created
                    ON manual_trade_journal_entry (strategy_id, created_at);
                CREATE INDEX IF NOT EXISTS idx_manual_trade_journal_fill_entry_time
                    ON manual_trade_journal_fill (journal_entry_id, fill_time);

                CREATE TABLE IF NOT EXISTS testnet_credential_ref (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    exchange text NOT NULL,
                    environment text NOT NULL,
                    label text NOT NULL,
                    status text NOT NULL,
                    vault_provider text NOT NULL,
                    vault_secret_ref text NOT NULL,
                    api_key_fingerprint text NULL,
                    permission_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
                    last_validated_at timestamptz NULL,
                    last_validation_status text NULL,
                    last_validation_reason_code text NULL,
                    rotated_at timestamptz NULL,
                    rotated_by text NULL,
                    revoked_at timestamptz NULL,
                    revoked_by text NULL,
                    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    created_by text NULL,
                    updated_at timestamptz NULL,
                    updated_by text NULL,
                    is_active boolean NOT NULL DEFAULT true,
                    is_deleted boolean NOT NULL DEFAULT false,
                    CONSTRAINT ck_testnet_credential_ref_exchange CHECK (exchange IN ('binance_spot')),
                    CONSTRAINT ck_testnet_credential_ref_environment CHECK (environment IN ('binance_testnet')),
                    CONSTRAINT ck_testnet_credential_ref_status CHECK (status IN ('missing', 'stored_testnet_only', 'permission_check_required', 'validated_testnet_read_only', 'validation_failed', 'unsafe_permissions', 'revoked', 'rotation_required', 'vault_unavailable')),
                    CONSTRAINT ck_testnet_credential_ref_provider CHECK (vault_provider IN ('fake', 'local_dev_encrypted'))
                );
                CREATE TABLE IF NOT EXISTS testnet_credential_secret (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    credential_ref_id uuid NOT NULL REFERENCES testnet_credential_ref(id),
                    vault_secret_ref text NOT NULL UNIQUE,
                    vault_provider text NOT NULL,
                    encrypted_payload text NOT NULL,
                    encryption_key_fingerprint text NOT NULL,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    created_by text NULL,
                    updated_at timestamptz NULL,
                    updated_by text NULL,
                    is_active boolean NOT NULL DEFAULT true,
                    is_deleted boolean NOT NULL DEFAULT false,
                    CONSTRAINT ck_testnet_credential_secret_provider CHECK (vault_provider IN ('local_dev_encrypted'))
                );

                CREATE INDEX IF NOT EXISTS idx_testnet_credential_secret_ref_lookup
                    ON testnet_credential_secret(vault_secret_ref);
                CREATE INDEX IF NOT EXISTS idx_testnet_credential_secret_credential_active
                    ON testnet_credential_secret(credential_ref_id, is_active, is_deleted);

                CREATE TABLE IF NOT EXISTS testnet_credential_audit_event (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    credential_ref_id uuid NULL REFERENCES testnet_credential_ref(id),
                    action text NOT NULL,
                    actor text NOT NULL,
                    environment text NOT NULL,
                    reason_code text NULL,
                    request_id text NULL,
                    idempotency_key_hash text NULL,
                    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    created_by text NULL,
                    CONSTRAINT ck_testnet_credential_audit_environment CHECK (environment IN ('binance_testnet')),
                    CONSTRAINT ck_testnet_credential_audit_action CHECK (action IN ('testnet_credential_create_requested', 'testnet_credential_created', 'testnet_credential_validation_requested', 'testnet_credential_validation_started', 'testnet_credential_validation_completed', 'testnet_credential_validation_failed', 'testnet_credential_validation_blocked', 'testnet_credential_rotated', 'testnet_credential_revoked', 'testnet_credential_blocked_unsafe_permissions', 'testnet_credential_vault_read_requested', 'testnet_credential_vault_read_allowed', 'testnet_credential_vault_read_blocked', 'testnet_credential_vault_read_failed'))
                );

                CREATE INDEX IF NOT EXISTS idx_testnet_credential_ref_lookup
                    ON testnet_credential_ref(exchange, environment, status, is_active, is_deleted);
                CREATE INDEX IF NOT EXISTS idx_testnet_credential_ref_fingerprint
                    ON testnet_credential_ref(api_key_fingerprint);
                CREATE INDEX IF NOT EXISTS idx_testnet_credential_audit_credential_time
                    ON testnet_credential_audit_event(credential_ref_id, created_at);
                CREATE INDEX IF NOT EXISTS idx_testnet_credential_audit_action_time
                    ON testnet_credential_audit_event(action, created_at);
                CREATE INDEX IF NOT EXISTS idx_testnet_credential_audit_idempotency_hash
                    ON testnet_credential_audit_event(idempotency_key_hash);

                CREATE TABLE IF NOT EXISTS testnet_order_intent (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    intent_key text NOT NULL UNIQUE,
                    strategy_id uuid NOT NULL REFERENCES strategy(id),
                    strategy_version_id uuid NOT NULL REFERENCES strategy_version(id),
                    source_run_id uuid NULL REFERENCES bot_run(id),
                    source_signal_package_id text NULL,
                    credential_ref_id uuid NOT NULL REFERENCES testnet_credential_ref(id),
                    environment text NOT NULL,
                    exchange text NOT NULL,
                    market_type text NOT NULL,
                    symbol text NOT NULL,
                    side text NOT NULL,
                    order_type text NOT NULL,
                    quantity numeric(28, 12) NULL,
                    quote_quantity numeric(28, 12) NULL,
                    client_order_id text NOT NULL UNIQUE,
                    status text NOT NULL,
                    status_reason_code text NULL,
                    latest_preview_id uuid NULL,
                    exchange_order_id text NULL,
                    exchange_order_status text NULL,
                    unknown_since timestamptz NULL,
                    reconciliation_required boolean NOT NULL DEFAULT false,
                    journal_entry_id uuid NULL REFERENCES manual_trade_journal_entry(id),
                    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    created_by text NULL,
                    updated_at timestamptz NULL,
                    updated_by text NULL,
                    is_active boolean NOT NULL DEFAULT true,
                    is_deleted boolean NOT NULL DEFAULT false,
                    CONSTRAINT ck_testnet_order_intent_environment CHECK (environment IN ('binance_testnet')),
                    CONSTRAINT ck_testnet_order_intent_exchange CHECK (exchange IN ('binance')),
                    CONSTRAINT ck_testnet_order_intent_market_type CHECK (market_type IN ('spot')),
                    CONSTRAINT ck_testnet_order_intent_side CHECK (side IN ('buy', 'sell')),
                    CONSTRAINT ck_testnet_order_intent_order_type CHECK (order_type IN ('market')),
                    CONSTRAINT ck_testnet_order_intent_quantity_non_negative CHECK (quantity IS NULL OR quantity >= 0),
                    CONSTRAINT ck_testnet_order_intent_quote_quantity_non_negative CHECK (quote_quantity IS NULL OR quote_quantity >= 0),
                    CONSTRAINT ck_testnet_order_intent_status CHECK (status IN ('draft_previewed', 'preview_blocked', 'confirmed', 'submitting', 'submitted', 'partially_filled', 'filled', 'cancel_requested', 'cancelled', 'rejected', 'unknown', 'reconciliation_required', 'reconciled', 'journal_projected'))
                );

                CREATE TABLE IF NOT EXISTS testnet_order_preview (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    intent_id uuid NOT NULL REFERENCES testnet_order_intent(id),
                    preview_key text NOT NULL UNIQUE,
                    status text NOT NULL,
                    reason_code text NULL,
                    symbol text NOT NULL,
                    side text NOT NULL,
                    order_type text NOT NULL,
                    quantity numeric(28, 12) NULL,
                    quote_quantity numeric(28, 12) NULL,
                    estimated_notional numeric(28, 12) NULL,
                    estimated_fee numeric(28, 12) NULL,
                    risk_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
                    credential_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
                    source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
                    expires_at timestamptz NULL,
                    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    created_by text NULL,
                    updated_at timestamptz NULL,
                    updated_by text NULL,
                    is_active boolean NOT NULL DEFAULT true,
                    is_deleted boolean NOT NULL DEFAULT false,
                    CONSTRAINT ck_testnet_order_preview_status CHECK (status IN ('allowed', 'blocked', 'expired')),
                    CONSTRAINT ck_testnet_order_preview_side CHECK (side IN ('buy', 'sell')),
                    CONSTRAINT ck_testnet_order_preview_order_type CHECK (order_type IN ('market')),
                    CONSTRAINT ck_testnet_order_preview_quantity_non_negative CHECK (quantity IS NULL OR quantity >= 0),
                    CONSTRAINT ck_testnet_order_preview_quote_quantity_non_negative CHECK (quote_quantity IS NULL OR quote_quantity >= 0),
                    CONSTRAINT ck_testnet_order_preview_notional_non_negative CHECK (estimated_notional IS NULL OR estimated_notional >= 0),
                    CONSTRAINT ck_testnet_order_preview_fee_non_negative CHECK (estimated_fee IS NULL OR estimated_fee >= 0)
                );

                CREATE TABLE IF NOT EXISTS testnet_order_event (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    intent_id uuid NOT NULL REFERENCES testnet_order_intent(id),
                    preview_id uuid NULL REFERENCES testnet_order_preview(id),
                    event_type text NOT NULL,
                    from_status text NULL,
                    to_status text NULL,
                    reason_code text NULL,
                    idempotency_key text NULL,
                    idempotency_key_hash text NULL,
                    client_order_id text NULL,
                    exchange_order_id text NULL,
                    actor text NOT NULL,
                    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    created_by text NULL,
                    CONSTRAINT ck_testnet_order_event_type CHECK (__EVENT_TYPE_CHECK_SQL__)
                );

                CREATE TABLE IF NOT EXISTS testnet_reconciliation_attempt (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    intent_id uuid NOT NULL REFERENCES testnet_order_intent(id),
                    attempt_no integer NOT NULL,
                    trigger text NOT NULL,
                    status text NOT NULL,
                    reason_code text NULL,
                    exchange_order_status text NULL,
                    fills_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
                    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    created_by text NULL,
                    CONSTRAINT uq_testnet_reconciliation_attempt_intent_attempt UNIQUE (intent_id, attempt_no),
                    CONSTRAINT ck_testnet_reconciliation_attempt_no_non_negative CHECK (attempt_no >= 0),
                    CONSTRAINT ck_testnet_reconciliation_attempt_trigger CHECK (trigger IN ('manual', 'submit_timeout', 'cancel_race', 'operator_review')),
                    CONSTRAINT ck_testnet_reconciliation_attempt_status CHECK (status IN ('started', 'matched', 'not_found', 'ambiguous', 'failed'))
                );

                CREATE INDEX IF NOT EXISTS idx_testnet_order_intent_key
                    ON testnet_order_intent(intent_key);
                CREATE INDEX IF NOT EXISTS idx_testnet_order_intent_status_created
                    ON testnet_order_intent(status, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_testnet_order_intent_strategy_created
                    ON testnet_order_intent(strategy_id, strategy_version_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_testnet_order_intent_client_order_id
                    ON testnet_order_intent(client_order_id);
                CREATE INDEX IF NOT EXISTS idx_testnet_order_preview_intent_created
                    ON testnet_order_preview(intent_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_testnet_order_preview_key
                    ON testnet_order_preview(preview_key);
                CREATE INDEX IF NOT EXISTS idx_testnet_order_event_intent_created
                    ON testnet_order_event(intent_id, created_at);
                CREATE INDEX IF NOT EXISTS idx_testnet_order_event_type_created
                    ON testnet_order_event(event_type, created_at);
                CREATE INDEX IF NOT EXISTS idx_testnet_order_event_idempotency_hash
                    ON testnet_order_event(idempotency_key_hash);
                CREATE INDEX IF NOT EXISTS idx_testnet_reconciliation_attempt_intent_attempt
                    ON testnet_reconciliation_attempt(intent_id, attempt_no);
                CREATE INDEX IF NOT EXISTS idx_testnet_reconciliation_attempt_status_created
                    ON testnet_reconciliation_attempt(status, created_at);

                CREATE TABLE IF NOT EXISTS live_credential_ref (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    exchange text NOT NULL,
                    environment text NOT NULL,
                    label text NOT NULL,
                    status text NOT NULL,
                    vault_provider text NOT NULL,
                    vault_secret_ref text NOT NULL,
                    api_key_fingerprint text NULL,
                    permission_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
                    last_validated_at timestamptz NULL,
                    last_validation_status text NULL,
                    last_validation_reason_code text NULL,
                    rotated_at timestamptz NULL,
                    rotated_by text NULL,
                    revoked_at timestamptz NULL,
                    revoked_by text NULL,
                    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    created_by text NULL,
                    updated_at timestamptz NULL,
                    updated_by text NULL,
                    is_active boolean NOT NULL DEFAULT true,
                    is_deleted boolean NOT NULL DEFAULT false,
                    CONSTRAINT ck_live_credential_ref_exchange CHECK (exchange IN ('binance_spot')),
                    CONSTRAINT ck_live_credential_ref_environment CHECK (environment IN ('binance_live')),
                    CONSTRAINT ck_live_credential_ref_status CHECK (status IN ('missing', 'stored_live_only', 'permission_check_required', 'validated_live_read_only', 'validation_failed', 'unsafe_permissions', 'revoked', 'rotation_required', 'vault_unavailable')),
                    CONSTRAINT ck_live_credential_ref_provider CHECK (vault_provider IN ('fake', 'local_dev_encrypted'))
                );
                CREATE TABLE IF NOT EXISTS live_credential_secret (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    credential_ref_id uuid NOT NULL REFERENCES live_credential_ref(id),
                    vault_secret_ref text NOT NULL UNIQUE,
                    vault_provider text NOT NULL,
                    encrypted_payload text NOT NULL,
                    encryption_key_fingerprint text NOT NULL,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    created_by text NULL,
                    updated_at timestamptz NULL,
                    updated_by text NULL,
                    is_active boolean NOT NULL DEFAULT true,
                    is_deleted boolean NOT NULL DEFAULT false,
                    CONSTRAINT ck_live_credential_secret_provider CHECK (vault_provider IN ('local_dev_encrypted'))
                );
                CREATE TABLE IF NOT EXISTS live_credential_audit_event (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    credential_ref_id uuid NULL REFERENCES live_credential_ref(id),
                    action text NOT NULL,
                    actor text NOT NULL,
                    environment text NOT NULL,
                    reason_code text NULL,
                    request_id text NULL,
                    idempotency_key_hash text NULL,
                    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    created_by text NULL,
                    CONSTRAINT ck_live_credential_audit_environment CHECK (environment IN ('binance_live')),
                    CONSTRAINT ck_live_credential_audit_action CHECK (action IN ('live_credential_create_requested', 'live_credential_created', 'live_credential_validation_requested', 'live_credential_validation_started', 'live_credential_validation_completed', 'live_credential_validation_failed', 'live_credential_validation_blocked', 'live_credential_rotated', 'live_credential_revoked', 'live_credential_blocked_unsafe_permissions', 'live_credential_vault_read_requested', 'live_credential_vault_read_allowed', 'live_credential_vault_read_blocked', 'live_credential_vault_read_failed'))
                );
                CREATE TABLE IF NOT EXISTS live_pilot_control (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    exchange text NOT NULL,
                    environment text NOT NULL,
                    status text NOT NULL,
                    hard_stop_reason_code text NULL,
                    active_intent_id uuid NULL,
                    reopened_at timestamptz NULL,
                    reopened_by text NULL,
                    proof_window_status text NOT NULL DEFAULT 'closed',
                    proof_window_opened_at timestamptz NULL,
                    proof_window_opened_by text NULL,
                    proof_window_expires_at timestamptz NULL,
                    proof_window_remaining_intent_budget integer NOT NULL DEFAULT 0,
                    proof_window_reason text NULL,
                    proof_window_closed_at timestamptz NULL,
                    proof_window_closed_by text NULL,
                    proof_window_closed_reason text NULL,
                    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    created_by text NULL,
                    updated_at timestamptz NULL,
                    updated_by text NULL,
                    is_active boolean NOT NULL DEFAULT true,
                    is_deleted boolean NOT NULL DEFAULT false,
                    CONSTRAINT uq_live_pilot_control_scope UNIQUE (exchange, environment),
                    CONSTRAINT ck_live_pilot_control_exchange CHECK (exchange IN ('binance')),
                    CONSTRAINT ck_live_pilot_control_environment CHECK (environment IN ('binance_live')),
                    CONSTRAINT ck_live_pilot_control_status CHECK (status IN ('ready', 'hard_stop')),
                    CONSTRAINT ck_live_pilot_control_proof_window_status CHECK (proof_window_status IN ('closed', 'open', 'consumed', 'expired')),
                    CONSTRAINT ck_live_pilot_control_proof_window_budget_non_negative CHECK (proof_window_remaining_intent_budget >= 0)
                );
                ALTER TABLE live_pilot_control ADD COLUMN IF NOT EXISTS proof_window_status text NOT NULL DEFAULT 'closed';
                ALTER TABLE live_pilot_control ADD COLUMN IF NOT EXISTS proof_window_opened_at timestamptz NULL;
                ALTER TABLE live_pilot_control ADD COLUMN IF NOT EXISTS proof_window_opened_by text NULL;
                ALTER TABLE live_pilot_control ADD COLUMN IF NOT EXISTS proof_window_expires_at timestamptz NULL;
                ALTER TABLE live_pilot_control ADD COLUMN IF NOT EXISTS proof_window_remaining_intent_budget integer NOT NULL DEFAULT 0;
                ALTER TABLE live_pilot_control ADD COLUMN IF NOT EXISTS proof_window_reason text NULL;
                ALTER TABLE live_pilot_control ADD COLUMN IF NOT EXISTS proof_window_closed_at timestamptz NULL;
                ALTER TABLE live_pilot_control ADD COLUMN IF NOT EXISTS proof_window_closed_by text NULL;
                ALTER TABLE live_pilot_control ADD COLUMN IF NOT EXISTS proof_window_closed_reason text NULL;
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1
                        FROM pg_constraint
                        WHERE conname = 'ck_live_pilot_control_proof_window_status'
                    ) THEN
                        ALTER TABLE live_pilot_control
                            ADD CONSTRAINT ck_live_pilot_control_proof_window_status
                            CHECK (proof_window_status IN ('closed', 'open', 'consumed', 'expired'));
                    END IF;
                END
                $$;
                DO $$
                BEGIN
                    IF NOT EXISTS (
                        SELECT 1
                        FROM pg_constraint
                        WHERE conname = 'ck_live_pilot_control_proof_window_budget_non_negative'
                    ) THEN
                        ALTER TABLE live_pilot_control
                            ADD CONSTRAINT ck_live_pilot_control_proof_window_budget_non_negative
                            CHECK (proof_window_remaining_intent_budget >= 0);
                    END IF;
                END
                $$;
                CREATE TABLE IF NOT EXISTS live_order_intent (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    intent_key text NOT NULL UNIQUE,
                    strategy_id uuid NOT NULL REFERENCES strategy(id),
                    strategy_version_id uuid NOT NULL REFERENCES strategy_version(id),
                    source_run_id uuid NULL REFERENCES bot_run(id),
                    source_signal_package_id text NULL,
                    credential_ref_id uuid NOT NULL REFERENCES live_credential_ref(id),
                    environment text NOT NULL,
                    exchange text NOT NULL,
                    market_type text NOT NULL,
                    symbol text NOT NULL,
                    side text NOT NULL,
                    order_type text NOT NULL,
                    quantity numeric(28, 12) NULL,
                    quote_quantity numeric(28, 12) NULL,
                    client_order_id text NOT NULL UNIQUE,
                    status text NOT NULL,
                    status_reason_code text NULL,
                    latest_preview_id uuid NULL,
                    exchange_order_id text NULL,
                    exchange_order_status text NULL,
                    unknown_since timestamptz NULL,
                    reconciliation_required boolean NOT NULL DEFAULT false,
                    journal_entry_id uuid NULL REFERENCES manual_trade_journal_entry(id),
                    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    created_by text NULL,
                    updated_at timestamptz NULL,
                    updated_by text NULL,
                    is_active boolean NOT NULL DEFAULT true,
                    is_deleted boolean NOT NULL DEFAULT false,
                    CONSTRAINT ck_live_order_intent_environment CHECK (environment IN ('binance_live')),
                    CONSTRAINT ck_live_order_intent_exchange CHECK (exchange IN ('binance')),
                    CONSTRAINT ck_live_order_intent_market_type CHECK (market_type IN ('spot')),
                    CONSTRAINT ck_live_order_intent_side CHECK (side IN ('buy', 'sell')),
                    CONSTRAINT ck_live_order_intent_order_type CHECK (order_type IN ('market')),
                    CONSTRAINT ck_live_order_intent_quantity_non_negative CHECK (quantity IS NULL OR quantity >= 0),
                    CONSTRAINT ck_live_order_intent_quote_quantity_non_negative CHECK (quote_quantity IS NULL OR quote_quantity >= 0),
                    CONSTRAINT ck_live_order_intent_status CHECK (status IN ('draft_previewed', 'preview_blocked', 'confirmed', 'submitting', 'submitted', 'partially_filled', 'filled', 'cancel_requested', 'cancelled', 'rejected', 'unknown', 'reconciliation_required', 'reconciled', 'journal_projected'))
                );
                CREATE TABLE IF NOT EXISTS live_order_preview (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    intent_id uuid NOT NULL REFERENCES live_order_intent(id),
                    preview_key text NOT NULL UNIQUE,
                    status text NOT NULL,
                    reason_code text NULL,
                    symbol text NOT NULL,
                    side text NOT NULL,
                    order_type text NOT NULL,
                    quantity numeric(28, 12) NULL,
                    quote_quantity numeric(28, 12) NULL,
                    estimated_notional numeric(28, 12) NULL,
                    estimated_fee numeric(28, 12) NULL,
                    risk_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
                    credential_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
                    source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
                    expires_at timestamptz NULL,
                    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    created_by text NULL,
                    updated_at timestamptz NULL,
                    updated_by text NULL,
                    is_active boolean NOT NULL DEFAULT true,
                    is_deleted boolean NOT NULL DEFAULT false,
                    CONSTRAINT ck_live_order_preview_status CHECK (status IN ('allowed', 'blocked', 'expired')),
                    CONSTRAINT ck_live_order_preview_side CHECK (side IN ('buy', 'sell')),
                    CONSTRAINT ck_live_order_preview_order_type CHECK (order_type IN ('market')),
                    CONSTRAINT ck_live_order_preview_quantity_non_negative CHECK (quantity IS NULL OR quantity >= 0),
                    CONSTRAINT ck_live_order_preview_quote_quantity_non_negative CHECK (quote_quantity IS NULL OR quote_quantity >= 0),
                    CONSTRAINT ck_live_order_preview_notional_non_negative CHECK (estimated_notional IS NULL OR estimated_notional >= 0),
                    CONSTRAINT ck_live_order_preview_fee_non_negative CHECK (estimated_fee IS NULL OR estimated_fee >= 0)
                );
                CREATE TABLE IF NOT EXISTS live_order_event (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    intent_id uuid NOT NULL REFERENCES live_order_intent(id),
                    preview_id uuid NULL REFERENCES live_order_preview(id),
                    event_type text NOT NULL,
                    from_status text NULL,
                    to_status text NULL,
                    reason_code text NULL,
                    idempotency_key text NULL,
                    idempotency_key_hash text NULL,
                    client_order_id text NULL,
                    exchange_order_id text NULL,
                    actor text NOT NULL,
                    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    created_by text NULL,
                    CONSTRAINT ck_live_order_event_type CHECK (event_type IN ('live_order_preview_created', 'live_order_preview_blocked', 'live_order_confirmation_recorded', 'live_order_submit_planned', 'live_order_submit_attempted', 'live_order_submit_accepted', 'live_order_submit_rejected', 'live_order_submit_unknown_recorded', 'live_order_submit_blocked', 'live_order_cancel_requested', 'live_order_cancel_accepted', 'live_order_cancel_rejected', 'live_order_cancel_unknown_recorded', 'live_order_cancel_blocked', 'live_order_unknown_recorded', 'live_order_reconciliation_required', 'live_order_reconciliation_attempt_recorded', 'live_order_reconcile_started', 'live_order_reconcile_completed', 'live_order_reconcile_not_found', 'live_order_reconcile_ambiguous', 'live_order_reconcile_blocked', 'live_order_journal_projection_planned'))
                );
                CREATE TABLE IF NOT EXISTS live_reconciliation_attempt (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    intent_id uuid NOT NULL REFERENCES live_order_intent(id),
                    attempt_no integer NOT NULL,
                    trigger text NOT NULL,
                    status text NOT NULL,
                    reason_code text NULL,
                    exchange_order_status text NULL,
                    fills_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
                    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    created_by text NULL,
                    CONSTRAINT uq_live_reconciliation_attempt_intent_attempt UNIQUE (intent_id, attempt_no),
                    CONSTRAINT ck_live_reconciliation_attempt_no_non_negative CHECK (attempt_no >= 0),
                    CONSTRAINT ck_live_reconciliation_attempt_trigger CHECK (trigger IN ('manual', 'submit_timeout', 'cancel_race', 'operator_review')),
                    CONSTRAINT ck_live_reconciliation_attempt_status CHECK (status IN ('started', 'matched', 'not_found', 'ambiguous', 'failed'))
                );
                CREATE INDEX IF NOT EXISTS idx_live_credential_ref_lookup
                    ON live_credential_ref(exchange, environment, status, is_active, is_deleted);
                CREATE INDEX IF NOT EXISTS idx_live_credential_ref_fingerprint
                    ON live_credential_ref(api_key_fingerprint);
                CREATE INDEX IF NOT EXISTS idx_live_credential_secret_ref_lookup
                    ON live_credential_secret(vault_secret_ref);
                CREATE INDEX IF NOT EXISTS idx_live_credential_secret_credential_active
                    ON live_credential_secret(credential_ref_id, is_active, is_deleted);
                CREATE INDEX IF NOT EXISTS idx_live_credential_audit_credential_time
                    ON live_credential_audit_event(credential_ref_id, created_at);
                CREATE INDEX IF NOT EXISTS idx_live_credential_audit_action_time
                    ON live_credential_audit_event(action, created_at);
                CREATE INDEX IF NOT EXISTS idx_live_credential_audit_idempotency_hash
                    ON live_credential_audit_event(idempotency_key_hash);
                CREATE INDEX IF NOT EXISTS idx_live_pilot_control_scope
                    ON live_pilot_control(exchange, environment);
                CREATE INDEX IF NOT EXISTS idx_live_order_intent_key
                    ON live_order_intent(intent_key);
                CREATE INDEX IF NOT EXISTS idx_live_order_intent_status_created
                    ON live_order_intent(status, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_live_order_intent_strategy_created
                    ON live_order_intent(strategy_id, strategy_version_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_live_order_intent_client_order_id
                    ON live_order_intent(client_order_id);
                CREATE INDEX IF NOT EXISTS idx_live_order_preview_intent_created
                    ON live_order_preview(intent_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_live_order_preview_key
                    ON live_order_preview(preview_key);
                CREATE INDEX IF NOT EXISTS idx_live_order_event_intent_created
                    ON live_order_event(intent_id, created_at);
                CREATE INDEX IF NOT EXISTS idx_live_order_event_type_created
                    ON live_order_event(event_type, created_at);
                CREATE INDEX IF NOT EXISTS idx_live_order_event_idempotency_hash
                    ON live_order_event(idempotency_key_hash);
                CREATE INDEX IF NOT EXISTS idx_live_reconciliation_attempt_intent_attempt
                    ON live_reconciliation_attempt(intent_id, attempt_no);
                CREATE INDEX IF NOT EXISTS idx_live_reconciliation_attempt_status_created
                    ON live_reconciliation_attempt(status, created_at);

                CREATE TABLE IF NOT EXISTS paper_resume_checkpoint (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    paper_session_id uuid NOT NULL REFERENCES paper_session(id),
                    attempt_no integer NOT NULL,
                    last_processed_candle_id uuid NULL REFERENCES market_candle(id),
                    last_processed_candle_open_time timestamptz NULL,
                    last_processed_snapshot_id uuid NULL REFERENCES paper_portfolio_snapshot(id),
                    next_candle_id uuid NULL REFERENCES market_candle(id),
                    next_candle_open_time timestamptz NULL,
                    cash_balance numeric(28, 12) NOT NULL,
                    equity numeric(28, 12) NOT NULL,
                    realized_pnl numeric(28, 12) NOT NULL DEFAULT 0,
                    unrealized_pnl numeric(28, 12) NOT NULL DEFAULT 0,
                    fees_paid numeric(28, 12) NOT NULL DEFAULT 0,
                    exposure_notional numeric(28, 12) NOT NULL DEFAULT 0,
                    open_position_quantity numeric(28, 12) NOT NULL DEFAULT 0,
                    average_entry_price numeric(28, 12) NULL,
                    peak_equity numeric(28, 12) NULL,
                    max_drawdown_pct numeric(28, 12) NOT NULL DEFAULT 0,
                    pending_orders_count integer NOT NULL DEFAULT 0,
                    strategy_runtime_state_status text NOT NULL,
                    checkpoint_source text NOT NULL,
                    reason_code text NULL,
                    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    created_by text NULL,
                    updated_at timestamptz NULL,
                    updated_by text NULL,
                    is_active boolean NOT NULL DEFAULT true,
                    is_deleted boolean NOT NULL DEFAULT false,
                    CONSTRAINT uq_paper_resume_checkpoint_session_attempt UNIQUE (paper_session_id, attempt_no),
                    CONSTRAINT ck_paper_resume_checkpoint_attempt_non_negative CHECK (attempt_no >= 0),
                    CONSTRAINT ck_paper_resume_checkpoint_equity_non_negative CHECK (equity >= 0),
                    CONSTRAINT ck_paper_resume_checkpoint_fees_non_negative CHECK (fees_paid >= 0),
                    CONSTRAINT ck_paper_resume_checkpoint_exposure_non_negative CHECK (exposure_notional >= 0),
                    CONSTRAINT ck_paper_resume_checkpoint_position_non_negative CHECK (open_position_quantity >= 0),
                    CONSTRAINT ck_paper_resume_checkpoint_drawdown_non_negative CHECK (max_drawdown_pct >= 0),
                    CONSTRAINT ck_paper_resume_checkpoint_pending_non_negative CHECK (pending_orders_count >= 0),
                    CONSTRAINT ck_paper_resume_checkpoint_source CHECK (checkpoint_source IN ('persisted', 'derived_diagnostic')),
                    CONSTRAINT ck_paper_resume_checkpoint_strategy_state CHECK (strategy_runtime_state_status IN ('stateless_between_candles', 'unsupported'))
                );

                ALTER TABLE paper_order ADD COLUMN IF NOT EXISTS artifact_key text NULL;
                ALTER TABLE paper_fill ADD COLUMN IF NOT EXISTS artifact_key text NULL;
                ALTER TABLE paper_portfolio_snapshot ADD COLUMN IF NOT EXISTS artifact_key text NULL;
                ALTER TABLE paper_audit_event ADD COLUMN IF NOT EXISTS artifact_key text NULL;

                CREATE UNIQUE INDEX IF NOT EXISTS uq_paper_order_session_artifact_key
                    ON paper_order (paper_session_id, artifact_key);
                CREATE UNIQUE INDEX IF NOT EXISTS uq_paper_fill_session_artifact_key
                    ON paper_fill (paper_session_id, artifact_key);
                CREATE UNIQUE INDEX IF NOT EXISTS uq_paper_portfolio_snapshot_session_artifact_key
                    ON paper_portfolio_snapshot (paper_session_id, artifact_key);
                CREATE UNIQUE INDEX IF NOT EXISTS uq_paper_audit_event_session_artifact_key
                    ON paper_audit_event (paper_session_id, artifact_key);

                CREATE INDEX IF NOT EXISTS idx_paper_order_artifact_key
                    ON paper_order (paper_session_id, artifact_key);
                CREATE INDEX IF NOT EXISTS idx_paper_fill_artifact_key
                    ON paper_fill (paper_session_id, artifact_key);
                CREATE INDEX IF NOT EXISTS idx_paper_portfolio_snapshot_artifact_key
                    ON paper_portfolio_snapshot (paper_session_id, artifact_key);
                CREATE INDEX IF NOT EXISTS idx_paper_audit_event_artifact_key
                    ON paper_audit_event (paper_session_id, artifact_key);
                CREATE INDEX IF NOT EXISTS idx_paper_resume_checkpoint_session_attempt
                    ON paper_resume_checkpoint (paper_session_id, attempt_no);
                CREATE INDEX IF NOT EXISTS idx_paper_resume_checkpoint_session_active
                    ON paper_resume_checkpoint (paper_session_id, is_active, is_deleted);

                CREATE TABLE IF NOT EXISTS tradelab_backtest_position (
                    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                    run_id uuid NOT NULL REFERENCES bot_run(id),
                    symbol text NOT NULL,
                    side text NOT NULL,
                    size numeric(28, 12) NOT NULL,
                    leverage integer NOT NULL,
                    entry_price numeric(28, 12) NOT NULL,
                    close_price numeric(28, 12) NULL,
                    liquidation_price numeric(28, 12) NULL,
                    realized_pnl numeric(28, 12) NOT NULL DEFAULT 0,
                    status text NOT NULL,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    created_by text NULL,
                    updated_at timestamptz NULL,
                    updated_by text NULL,
                    is_active boolean NOT NULL DEFAULT true,
                    is_deleted boolean NOT NULL DEFAULT false
                );
                ALTER TABLE tradelab_backtest_position ADD COLUMN IF NOT EXISTS margin_mode text NOT NULL DEFAULT 'CROSS';
                ALTER TABLE tradelab_backtest_position ADD COLUMN IF NOT EXISTS maintenance_margin numeric(28, 12) NOT NULL DEFAULT 0;
                ALTER TABLE tradelab_backtest_position ADD COLUMN IF NOT EXISTS funding_fee_paid numeric(28, 12) NOT NULL DEFAULT 0;
                ALTER TABLE tradelab_backtest_position ADD COLUMN IF NOT EXISTS max_notional numeric(28, 12) NOT NULL DEFAULT 0;
                ALTER TABLE tradelab_backtest_position ADD COLUMN IF NOT EXISTS max_margin_used numeric(28, 12) NOT NULL DEFAULT 0;
                ALTER TABLE tradelab_backtest_position ADD COLUMN IF NOT EXISTS peak_leverage_used numeric(28, 12) NOT NULL DEFAULT 0;

                CREATE INDEX IF NOT EXISTS idx_tradelab_backtest_position_run_id
                    ON tradelab_backtest_position(run_id);
                """
                .replace("__EVENT_TYPE_CHECK_SQL__", event_type_check_sql)
            )
        )
