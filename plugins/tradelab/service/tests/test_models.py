from __future__ import annotations

from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateTable

from tradelab_api.core.config import Settings
from tradelab_api.db.models import Base


EXPECTED_TABLES = {
    "strategy_group",
    "strategy",
    "strategy_version",
    "bot",
    "exchange_connection",
    "exchange_symbol",
    "market_data_coverage",
    "market_data_coverage_segment",
    "market_data_import_job",
    "market_data_job_run_link",
    "benchmark_run_check",
    "bot_run",
    "market_candle",
    "backtest_result",
    "strategy_signal",
    "order_intent",
    "trade_order",
    "strategy_log",
    "paper_session",
    "paper_order",
    "paper_fill",
    "paper_position",
    "paper_portfolio_snapshot",
    "paper_audit_event",
    "paper_resume_checkpoint",
    "tradelab_backtest_position",
    "testnet_credential_ref",
    "testnet_credential_audit_event",
    "testnet_credential_secret",
    "testnet_order_intent",
    "testnet_order_preview",
    "testnet_order_event",
    "testnet_reconciliation_attempt",
    "manual_trade_journal_entry",
    "manual_trade_journal_fill",
    "live_credential_ref",
    "live_credential_secret",
    "live_credential_audit_event",
    "live_pilot_control",
    "live_order_intent",
    "live_order_preview",
    "live_order_event",
    "live_reconciliation_attempt",
}

MUTABLE_TABLES = {
    "strategy_group",
    "strategy",
    "strategy_version",
    "bot",
    "exchange_connection",
    "exchange_symbol",
    "market_data_coverage",
    "market_data_coverage_segment",
    "market_data_import_job",
    "market_data_job_run_link",
    "benchmark_run_check",
    "paper_session",
    "paper_order",
    "paper_position",
    "paper_resume_checkpoint",
    "tradelab_backtest_position",
    "testnet_credential_ref",
    "testnet_credential_secret",
    "testnet_order_intent",
    "testnet_order_preview",
    "manual_trade_journal_entry",
    "manual_trade_journal_fill",
}

APPEND_ONLY_PAPER_TABLES = {
    "paper_fill",
    "paper_portfolio_snapshot",
    "paper_audit_event",
    "testnet_credential_audit_event",
    "testnet_order_event",
    "testnet_reconciliation_attempt",
}

AUDIT_COLUMNS = {
    "created_at",
    "created_by",
    "updated_at",
    "updated_by",
    "is_active",
    "is_deleted",
}

APPEND_ONLY_AUDIT_COLUMNS = {
    "created_at",
    "created_by",
}

MUTABLE_ONLY_COLUMNS = {
    "updated_at",
    "updated_by",
    "is_active",
    "is_deleted",
}

PAPER_TABLE_COLUMNS = {
    "paper_session": {
        "id",
        "bot_id",
        "strategy_id",
        "strategy_version_id",
        "mode",
        "status",
        "exchange",
        "symbol",
        "timeframe",
        "dataset_key",
        "start_at",
        "end_at",
        "started_at",
        "finished_at",
        "cancel_requested_at",
        "starting_cash",
        "runtime_config",
        "risk_config",
        "source_snapshot",
        "dataset_context",
        "gate_context",
        "reason_code",
        "error_message",
    },
    "paper_order": {
        "id",
        "paper_session_id",
        "side",
        "order_type",
        "status",
        "quantity",
        "requested_price",
        "requested_notional",
        "submitted_at",
        "finalized_at",
        "artifact_key",
        "reason_code",
        "metadata",
    },
    "paper_fill": {
        "id",
        "paper_session_id",
        "paper_order_id",
        "source_candle_id",
        "fill_time",
        "side",
        "price",
        "quantity",
        "notional",
        "fee_amount",
        "fee_asset",
        "slippage_amount",
        "artifact_key",
        "metadata",
    },
    "paper_position": {
        "id",
        "paper_session_id",
        "symbol",
        "side",
        "status",
        "quantity",
        "average_entry_price",
        "realized_pnl",
        "unrealized_pnl",
        "opened_at",
        "closed_at",
        "metadata",
    },
    "paper_portfolio_snapshot": {
        "id",
        "paper_session_id",
        "source_candle_id",
        "snapshot_at",
        "cash_balance",
        "equity",
        "realized_pnl",
        "unrealized_pnl",
        "fees_paid",
        "drawdown_pct",
        "exposure_notional",
        "artifact_key",
        "metadata",
    },
    "paper_audit_event": {
        "id",
        "paper_session_id",
        "event_at",
        "actor",
        "action",
        "target_type",
        "target_id",
        "old_state",
        "new_state",
        "reason_code",
        "correlation_id",
        "request_id",
        "artifact_key",
        "metadata",
    },
    "paper_resume_checkpoint": {
        "id",
        "paper_session_id",
        "attempt_no",
        "last_processed_candle_id",
        "last_processed_candle_open_time",
        "last_processed_snapshot_id",
        "next_candle_id",
        "next_candle_open_time",
        "cash_balance",
        "equity",
        "realized_pnl",
        "unrealized_pnl",
        "fees_paid",
        "exposure_notional",
        "open_position_quantity",
        "average_entry_price",
        "peak_equity",
        "max_drawdown_pct",
        "pending_orders_count",
        "strategy_runtime_state_status",
        "checkpoint_source",
        "reason_code",
        "metadata",
    },
}

PAPER_FOREIGN_KEYS = {
    "paper_session": {"bot", "strategy", "strategy_version"},
    "paper_order": {"paper_session"},
    "paper_fill": {"paper_session", "paper_order", "market_candle"},
    "paper_position": {"paper_session"},
    "paper_portfolio_snapshot": {"paper_session", "market_candle"},
    "paper_audit_event": {"paper_session"},
    "paper_resume_checkpoint": {"paper_session", "market_candle", "paper_portfolio_snapshot"},
}

PAPER_INDEXES = {
    "idx_paper_session_bot_status_created",
    "idx_paper_session_strategy_created",
    "idx_paper_session_dataset",
    "idx_paper_session_status_created",
    "idx_paper_order_session_created",
    "idx_paper_order_session_status",
    "idx_paper_order_artifact_key",
    "idx_paper_fill_session_time",
    "idx_paper_fill_order",
    "idx_paper_fill_candle",
    "idx_paper_fill_artifact_key",
    "idx_paper_position_session_symbol",
    "idx_paper_position_session_status",
    "idx_paper_portfolio_snapshot_session_time",
    "idx_paper_portfolio_snapshot_candle",
    "idx_paper_portfolio_snapshot_artifact_key",
    "idx_paper_audit_event_session_time",
    "idx_paper_audit_event_action_time",
    "idx_paper_audit_event_correlation",
    "idx_paper_audit_event_artifact_key",
    "idx_paper_resume_checkpoint_session_attempt",
    "idx_paper_resume_checkpoint_session_active",
}

PAPER_CHECK_CONSTRAINTS = {
    "ck_paper_session_mode_paper",
    "ck_paper_session_status",
    "ck_paper_session_starting_cash_non_negative",
    "ck_paper_session_range_order",
    "ck_paper_order_side",
    "ck_paper_order_type_market",
    "ck_paper_order_status",
    "ck_paper_order_quantity_non_negative",
    "ck_paper_order_requested_price_non_negative",
    "ck_paper_order_requested_notional_non_negative",
    "ck_paper_fill_side",
    "ck_paper_fill_price_non_negative",
    "ck_paper_fill_quantity_non_negative",
    "ck_paper_fill_notional_non_negative",
    "ck_paper_fill_fee_non_negative",
    "ck_paper_position_side",
    "ck_paper_position_status",
    "ck_paper_position_quantity_non_negative",
    "ck_paper_position_entry_price_non_negative",
    "ck_paper_portfolio_snapshot_cash_non_negative",
    "ck_paper_portfolio_snapshot_equity_non_negative",
    "ck_paper_portfolio_snapshot_fees_non_negative",
    "ck_paper_portfolio_snapshot_drawdown_non_negative",
    "ck_paper_portfolio_snapshot_exposure_non_negative",
    "ck_paper_resume_checkpoint_attempt_non_negative",
    "ck_paper_resume_checkpoint_equity_non_negative",
    "ck_paper_resume_checkpoint_fees_non_negative",
    "ck_paper_resume_checkpoint_exposure_non_negative",
    "ck_paper_resume_checkpoint_position_non_negative",
    "ck_paper_resume_checkpoint_drawdown_non_negative",
    "ck_paper_resume_checkpoint_pending_non_negative",
    "ck_paper_resume_checkpoint_source",
    "ck_paper_resume_checkpoint_strategy_state",
}

EXECUTION_JOURNAL_TABLE_COLUMNS = {
    "manual_trade_journal_entry": {
        "id",
        "source_run_id",
        "strategy_id",
        "strategy_version_id",
        "symbol",
        "timeframe",
        "side",
        "planned_snapshot",
        "comparison_summary",
        "outcome_status",
        "discipline_status",
        "safety_status",
        "notes",
    },
    "manual_trade_journal_fill": {
        "id",
        "journal_entry_id",
        "fill_role",
        "side",
        "fill_time",
        "price",
        "quantity",
        "fee",
        "fee_asset",
        "notes",
    },
}

EXECUTION_JOURNAL_FOREIGN_KEYS = {
    "manual_trade_journal_entry": {"bot_run", "strategy", "strategy_version"},
    "manual_trade_journal_fill": {"manual_trade_journal_entry"},
}

EXECUTION_JOURNAL_INDEXES = {
    "idx_manual_trade_journal_entry_run_created",
    "idx_manual_trade_journal_entry_strategy_created",
    "idx_manual_trade_journal_fill_entry_time",
}

EXECUTION_JOURNAL_CHECK_CONSTRAINTS = {
    "ck_manual_trade_journal_entry_side",
    "ck_manual_trade_journal_entry_outcome_status",
    "ck_manual_trade_journal_entry_discipline_status",
    "ck_manual_trade_journal_entry_safety_status",
    "ck_manual_trade_journal_fill_role",
    "ck_manual_trade_journal_fill_side",
    "ck_manual_trade_journal_fill_price_positive",
    "ck_manual_trade_journal_fill_quantity_positive",
    "ck_manual_trade_journal_fill_fee_non_negative",
}

TESTNET_CREDENTIAL_TABLE_COLUMNS = {
    "testnet_credential_ref": {
        "id",
        "exchange",
        "environment",
        "label",
        "status",
        "vault_provider",
        "vault_secret_ref",
        "api_key_fingerprint",
        "permission_evidence",
        "last_validated_at",
        "last_validation_status",
        "last_validation_reason_code",
        "rotated_at",
        "rotated_by",
        "revoked_at",
        "revoked_by",
        "metadata",
    },
    "testnet_credential_secret": {
        "id",
        "credential_ref_id",
        "vault_secret_ref",
        "vault_provider",
        "encrypted_payload",
        "encryption_key_fingerprint",
    },
    "testnet_credential_audit_event": {
        "id",
        "credential_ref_id",
        "action",
        "actor",
        "environment",
        "reason_code",
        "request_id",
        "idempotency_key_hash",
        "metadata",
    },
}

TESTNET_CREDENTIAL_INDEXES = {
    "idx_testnet_credential_ref_lookup",
    "idx_testnet_credential_ref_fingerprint",
    "idx_testnet_credential_secret_ref_lookup",
    "idx_testnet_credential_secret_credential_active",
    "idx_testnet_credential_audit_credential_time",
    "idx_testnet_credential_audit_action_time",
    "idx_testnet_credential_audit_idempotency_hash",
}

TESTNET_CREDENTIAL_CHECK_CONSTRAINTS = {
    "ck_testnet_credential_ref_exchange",
    "ck_testnet_credential_ref_environment",
    "ck_testnet_credential_ref_status",
    "ck_testnet_credential_ref_provider",
    "ck_testnet_credential_secret_provider",
    "ck_testnet_credential_audit_environment",
    "ck_testnet_credential_audit_action",
}

TESTNET_ORDER_TABLE_COLUMNS = {
    "testnet_order_intent": {
        "id",
        "intent_key",
        "strategy_id",
        "strategy_version_id",
        "source_run_id",
        "source_signal_package_id",
        "credential_ref_id",
        "environment",
        "exchange",
        "market_type",
        "symbol",
        "side",
        "order_type",
        "quantity",
        "quote_quantity",
        "client_order_id",
        "status",
        "status_reason_code",
        "latest_preview_id",
        "exchange_order_id",
        "exchange_order_status",
        "unknown_since",
        "reconciliation_required",
        "journal_entry_id",
        "metadata",
    },
    "testnet_order_preview": {
        "id",
        "intent_id",
        "preview_key",
        "status",
        "reason_code",
        "symbol",
        "side",
        "order_type",
        "quantity",
        "quote_quantity",
        "estimated_notional",
        "estimated_fee",
        "risk_snapshot",
        "credential_snapshot",
        "source_snapshot",
        "expires_at",
        "metadata",
    },
    "testnet_order_event": {
        "id",
        "intent_id",
        "preview_id",
        "event_type",
        "from_status",
        "to_status",
        "reason_code",
        "idempotency_key",
        "idempotency_key_hash",
        "client_order_id",
        "exchange_order_id",
        "actor",
        "metadata",
    },
    "testnet_reconciliation_attempt": {
        "id",
        "intent_id",
        "attempt_no",
        "trigger",
        "status",
        "reason_code",
        "exchange_order_status",
        "fills_snapshot",
        "metadata",
    },
}

TESTNET_ORDER_FOREIGN_KEYS = {
    "testnet_order_intent": {
        "strategy",
        "strategy_version",
        "bot_run",
        "testnet_credential_ref",
        "manual_trade_journal_entry",
    },
    "testnet_order_preview": {"testnet_order_intent"},
    "testnet_order_event": {"testnet_order_intent", "testnet_order_preview"},
    "testnet_reconciliation_attempt": {"testnet_order_intent"},
}

TESTNET_ORDER_INDEXES = {
    "idx_testnet_order_intent_key",
    "idx_testnet_order_intent_status_created",
    "idx_testnet_order_intent_strategy_created",
    "idx_testnet_order_intent_client_order_id",
    "idx_testnet_order_preview_intent_created",
    "idx_testnet_order_preview_key",
    "idx_testnet_order_event_intent_created",
    "idx_testnet_order_event_type_created",
    "idx_testnet_order_event_idempotency_hash",
    "idx_testnet_reconciliation_attempt_intent_attempt",
    "idx_testnet_reconciliation_attempt_status_created",
}

TESTNET_ORDER_CHECK_CONSTRAINTS = {
    "ck_testnet_order_intent_environment",
    "ck_testnet_order_intent_exchange",
    "ck_testnet_order_intent_market_type",
    "ck_testnet_order_intent_side",
    "ck_testnet_order_intent_order_type",
    "ck_testnet_order_intent_quantity_non_negative",
    "ck_testnet_order_intent_quote_quantity_non_negative",
    "ck_testnet_order_intent_status",
    "ck_testnet_order_preview_status",
    "ck_testnet_order_preview_side",
    "ck_testnet_order_preview_order_type",
    "ck_testnet_order_preview_quantity_non_negative",
    "ck_testnet_order_preview_quote_quantity_non_negative",
    "ck_testnet_order_preview_notional_non_negative",
    "ck_testnet_order_preview_fee_non_negative",
    "ck_testnet_order_event_type",
    "ck_testnet_reconciliation_attempt_no_non_negative",
    "ck_testnet_reconciliation_attempt_trigger",
    "ck_testnet_reconciliation_attempt_status",
}


def test_metadata_compiles_for_postgresql() -> None:
    dialect = postgresql.dialect()

    assert set(Base.metadata.tables) == EXPECTED_TABLES
    for table in Base.metadata.sorted_tables:
        compiled = str(CreateTable(table).compile(dialect=dialect))
        assert f"CREATE TABLE {table.name}" in compiled

def test_phase_18_5_validation_settings_default_closed() -> None:
    settings = Settings()

    assert settings.tradelab_testnet_credential_validation_enabled is False
    assert settings.tradelab_binance_testnet_base_url == "https://testnet.binance.vision"
    assert settings.tradelab_testnet_credential_validation_recv_window_ms == 5000
    assert settings.tradelab_testnet_credential_validation_timeout_seconds == 5


def test_mutable_tables_expose_audit_columns() -> None:
    for table_name in MUTABLE_TABLES:
        table = Base.metadata.tables[table_name]
        assert AUDIT_COLUMNS.issubset(table.columns.keys())


def test_append_only_paper_tables_expose_append_only_audit_columns() -> None:
    for table_name in APPEND_ONLY_PAPER_TABLES:
        table = Base.metadata.tables[table_name]
        columns = set(table.columns.keys())

        assert APPEND_ONLY_AUDIT_COLUMNS.issubset(columns)
        assert MUTABLE_ONLY_COLUMNS.isdisjoint(columns)


def test_paper_tables_expose_core_columns() -> None:
    for table_name, expected_columns in PAPER_TABLE_COLUMNS.items():
        table = Base.metadata.tables[table_name]
        assert expected_columns.issubset(table.columns.keys())


def test_paper_tables_expose_expected_foreign_keys() -> None:
    for table_name, expected_targets in PAPER_FOREIGN_KEYS.items():
        table = Base.metadata.tables[table_name]
        actual_targets = {
            foreign_key.column.table.name
            for column in table.columns
            for foreign_key in column.foreign_keys
        }
        assert expected_targets.issubset(actual_targets)


def test_paper_tables_expose_expected_indexes() -> None:
    actual_indexes = {
        index.name
        for table in Base.metadata.tables.values()
        for index in table.indexes
    }
    assert PAPER_INDEXES.issubset(actual_indexes)


def test_paper_tables_expose_expected_check_constraints() -> None:
    actual_constraints = {
        constraint.name
        for table in Base.metadata.tables.values()
        for constraint in table.constraints
        if constraint.name
    }
    assert PAPER_CHECK_CONSTRAINTS.issubset(actual_constraints)


def test_paper_resume_and_artifact_identity_unique_constraints() -> None:
    expected = {
        "uq_paper_resume_checkpoint_session_attempt",
        "uq_paper_order_session_artifact_key",
        "uq_paper_fill_session_artifact_key",
        "uq_paper_portfolio_snapshot_session_artifact_key",
        "uq_paper_audit_event_session_artifact_key",
    }

    actual = {
        constraint.name
        for table in Base.metadata.tables.values()
        for constraint in table.constraints
        if constraint.name is not None
    }

    assert expected.issubset(actual)

def test_execution_journal_tables_expose_core_columns() -> None:
    for table_name, expected_columns in EXECUTION_JOURNAL_TABLE_COLUMNS.items():
        table = Base.metadata.tables[table_name]
        assert expected_columns.issubset(table.columns.keys())

def test_execution_journal_tables_expose_expected_foreign_keys() -> None:
    for table_name, expected_targets in EXECUTION_JOURNAL_FOREIGN_KEYS.items():
        table = Base.metadata.tables[table_name]
        actual_targets = {
            foreign_key.column.table.name
            for column in table.columns
            for foreign_key in column.foreign_keys
        }
        assert expected_targets.issubset(actual_targets)

def test_execution_journal_tables_expose_expected_indexes() -> None:
    actual_indexes = {
        index.name
        for table in Base.metadata.tables.values()
        for index in table.indexes
    }
    assert EXECUTION_JOURNAL_INDEXES.issubset(actual_indexes)

def test_execution_journal_tables_expose_expected_check_constraints() -> None:
    actual_constraints = {
        constraint.name
        for table in Base.metadata.tables.values()
        for constraint in table.constraints
        if constraint.name
    }
    assert EXECUTION_JOURNAL_CHECK_CONSTRAINTS.issubset(actual_constraints)


def test_testnet_credential_tables_have_expected_columns() -> None:
    for table_name, expected_columns in TESTNET_CREDENTIAL_TABLE_COLUMNS.items():
        table = Base.metadata.tables[table_name]
        actual_columns = set(table.columns.keys()) - AUDIT_COLUMNS - APPEND_ONLY_AUDIT_COLUMNS
        assert expected_columns <= actual_columns


def test_testnet_credential_indexes_exist() -> None:
    index_names = {index.name for table in Base.metadata.tables.values() for index in table.indexes}
    assert TESTNET_CREDENTIAL_INDEXES <= index_names


def test_testnet_credential_check_constraints_exist() -> None:
    constraint_names = {
        constraint.name
        for table in Base.metadata.tables.values()
        for constraint in table.constraints
        if constraint.name
    }
    assert TESTNET_CREDENTIAL_CHECK_CONSTRAINTS <= constraint_names

def test_testnet_order_tables_have_expected_columns() -> None:
    for table_name, expected_columns in TESTNET_ORDER_TABLE_COLUMNS.items():
        table = Base.metadata.tables[table_name]
        actual_columns = set(table.columns.keys()) - AUDIT_COLUMNS - APPEND_ONLY_AUDIT_COLUMNS
        assert expected_columns <= actual_columns

def test_testnet_order_tables_have_expected_foreign_keys() -> None:
    for table_name, expected_targets in TESTNET_ORDER_FOREIGN_KEYS.items():
        table = Base.metadata.tables[table_name]
        actual_targets = {
            foreign_key.column.table.name
            for column in table.columns
            for foreign_key in column.foreign_keys
        }
        assert expected_targets <= actual_targets

def test_testnet_order_indexes_exist() -> None:
    index_names = {index.name for table in Base.metadata.tables.values() for index in table.indexes}
    assert TESTNET_ORDER_INDEXES <= index_names

def test_testnet_order_check_constraints_exist() -> None:
    constraint_names = {
        constraint.name
        for table in Base.metadata.tables.values()
        for constraint in table.constraints
        if constraint.name
    }
    assert TESTNET_ORDER_CHECK_CONSTRAINTS <= constraint_names

def test_testnet_order_events_are_append_only() -> None:
    for table_name in {"testnet_order_event", "testnet_reconciliation_attempt"}:
        table = Base.metadata.tables[table_name]
        columns = set(table.columns.keys())
        assert APPEND_ONLY_AUDIT_COLUMNS <= columns
        assert MUTABLE_ONLY_COLUMNS.isdisjoint(columns)


def test_benchmark_run_check_columns() -> None:
    table = Base.metadata.tables["benchmark_run_check"]
    assert {
        "baseline_run_id",
        "repeat_run_id",
        "strategy_id",
        "strategy_version_id",
        "dataset_key",
        "input_fingerprint",
        "repeat_input_fingerprint",
        "input_match",
        "result_fingerprint",
        "repeat_result_fingerprint",
        "result_match",
        "tolerance_policy",
        "metric_diffs",
        "status",
        "error_message",
    }.issubset(table.columns.keys())




