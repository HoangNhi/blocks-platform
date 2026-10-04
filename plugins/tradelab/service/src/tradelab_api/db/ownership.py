from __future__ import annotations

from enum import StrEnum
from dataclasses import dataclass


class TableScope(StrEnum):
    PRIVATE = "private"
    SHARED = "shared"
    OPERATOR_ONLY = "operator_only"


@dataclass(frozen=True)
class TableClassification:
    name: str
    scope: TableScope
    has_owner_user_id: bool = False
    parent_table: str | None = None
    description: str = ""


# Canonical Registry of all 43 TradeLab tables
TABLE_CLASSIFICATIONS: list[TableClassification] = [
    # 1. Private — strategy/bot
    TableClassification("strategy_group", TableScope.PRIVATE, description="Strategy groups scoped by workspace"),
    TableClassification("strategy", TableScope.PRIVATE, description="Strategies scoped by workspace"),
    TableClassification("strategy_version", TableScope.PRIVATE, parent_table="strategy", description="Strategy code versions"),
    TableClassification("bot", TableScope.PRIVATE, parent_table="strategy", description="Trading bots"),
    TableClassification("bot_run", TableScope.PRIVATE, parent_table="bot", description="Execution runs"),
    TableClassification("benchmark_run_check", TableScope.PRIVATE, parent_table="bot_run", description="Benchmark comparisons"),

    # 2. Private — credentials (require owner_user_id)
    TableClassification("exchange_connection", TableScope.PRIVATE, has_owner_user_id=True, description="Exchange API connections"),
    TableClassification("testnet_credential_ref", TableScope.PRIVATE, has_owner_user_id=True, description="Testnet credential references"),
    TableClassification("testnet_credential_secret", TableScope.PRIVATE, parent_table="testnet_credential_ref", description="Encrypted testnet secrets"),
    TableClassification("testnet_credential_audit_event", TableScope.PRIVATE, parent_table="testnet_credential_ref", description="Testnet credential audit events"),
    TableClassification("live_credential_ref", TableScope.PRIVATE, has_owner_user_id=True, description="Live credential references"),
    TableClassification("live_credential_secret", TableScope.PRIVATE, parent_table="live_credential_ref", description="Encrypted live secrets"),
    TableClassification("live_credential_audit_event", TableScope.PRIVATE, parent_table="live_credential_ref", description="Live credential audit events"),

    # 3. Private — order execution
    TableClassification("testnet_order_intent", TableScope.PRIVATE, description="Testnet order intents"),
    TableClassification("testnet_order_preview", TableScope.PRIVATE, parent_table="testnet_order_intent", description="Testnet order previews"),
    TableClassification("testnet_order_event", TableScope.PRIVATE, parent_table="testnet_order_intent", description="Testnet order events"),
    TableClassification("testnet_reconciliation_attempt", TableScope.PRIVATE, parent_table="testnet_order_intent", description="Testnet reconciliations"),
    TableClassification("live_order_intent", TableScope.PRIVATE, description="Live order intents"),
    TableClassification("live_order_preview", TableScope.PRIVATE, parent_table="live_order_intent", description="Live order previews"),
    TableClassification("live_order_event", TableScope.PRIVATE, parent_table="live_order_intent", description="Live order events"),
    TableClassification("live_reconciliation_attempt", TableScope.PRIVATE, parent_table="live_order_intent", description="Live reconciliations"),

    # 4. Private — research results
    TableClassification("backtest_result", TableScope.PRIVATE, parent_table="bot_run", description="Backtest result metrics"),
    TableClassification("strategy_signal", TableScope.PRIVATE, parent_table="bot_run", description="Signals emitted during runs"),
    TableClassification("order_intent", TableScope.PRIVATE, parent_table="bot_run", description="Simulated order intents"),
    TableClassification("trade_order", TableScope.PRIVATE, parent_table="bot_run", description="Simulated trade orders"),
    TableClassification("strategy_log", TableScope.PRIVATE, parent_table="bot_run", description="Logs emitted during runs"),
    TableClassification("tradelab_backtest_position", TableScope.PRIVATE, parent_table="bot_run", description="Simulated backtest positions"),

    # 5. Private — journal
    TableClassification("manual_trade_journal_entry", TableScope.PRIVATE, description="Trade journal entries"),
    TableClassification("manual_trade_journal_fill", TableScope.PRIVATE, parent_table="manual_trade_journal_entry", description="Journal fills"),

    # 6. Private — paper trading
    TableClassification("paper_session", TableScope.PRIVATE, parent_table="bot", description="Paper trading sessions"),
    TableClassification("paper_order", TableScope.PRIVATE, parent_table="paper_session", description="Paper orders"),
    TableClassification("paper_fill", TableScope.PRIVATE, parent_table="paper_session", description="Paper fills"),
    TableClassification("paper_position", TableScope.PRIVATE, parent_table="paper_session", description="Paper positions"),
    TableClassification("paper_portfolio_snapshot", TableScope.PRIVATE, parent_table="paper_session", description="Paper portfolio snapshots"),
    TableClassification("paper_audit_event", TableScope.PRIVATE, parent_table="paper_session", description="Paper audit events"),
    TableClassification("paper_resume_checkpoint", TableScope.PRIVATE, parent_table="paper_session", description="Paper resume checkpoints"),

    # 7. Private — bridge
    TableClassification("market_data_job_run_link", TableScope.PRIVATE, parent_table="bot_run", description="Bridge linking data jobs to bot runs"),

    # 8. Shared instance data / catalog
    TableClassification("market_candle", TableScope.SHARED, description="Shared market candles"),
    TableClassification("exchange_symbol", TableScope.SHARED, description="Shared exchange symbol catalog"),
    TableClassification("market_data_coverage", TableScope.SHARED, description="Shared market data coverage"),
    TableClassification("market_data_coverage_segment", TableScope.SHARED, parent_table="market_data_coverage", description="Shared coverage segments"),
    TableClassification("market_data_import_job", TableScope.SHARED, description="Shared market data import jobs"),

    # 9. Operator-only control
    TableClassification("live_pilot_control", TableScope.OPERATOR_ONLY, description="Instance-wide live pilot control"),
]

TABLE_REGISTRY: dict[str, TableClassification] = {
    c.name: c for c in TABLE_CLASSIFICATIONS
}

PRIVATE_TABLES: list[str] = [c.name for c in TABLE_CLASSIFICATIONS if c.scope == TableScope.PRIVATE]
SHARED_TABLES: list[str] = [c.name for c in TABLE_CLASSIFICATIONS if c.scope == TableScope.SHARED]
OPERATOR_ONLY_TABLES: list[str] = [c.name for c in TABLE_CLASSIFICATIONS if c.scope == TableScope.OPERATOR_ONLY]
CREDENTIAL_ROOT_TABLES: list[str] = [c.name for c in TABLE_CLASSIFICATIONS if c.has_owner_user_id]
