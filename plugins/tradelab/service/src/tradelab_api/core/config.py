from __future__ import annotations

import sys
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="",
        case_sensitive=False,
        extra="ignore",
        env_file=".env.local",
        env_file_encoding="utf-8",
    )

    database_url: str = Field(
        default="postgresql+psycopg://postgres:postgres@localhost:5432/tradelab"
    )
    binance_base_url: str = Field(default="https://api.binance.com")
    runner_python_path: str = Field(default=sys.executable)
    tradelab_runner_root: str | None = Field(default=None)
    strategy_timeout_seconds: int = Field(default=180, ge=1)
    max_backtest_candles: int = Field(default=10_000, ge=1)
    job_poll_interval_seconds: float = Field(default=1.0, ge=0)
    max_candles_per_import_batch: int = Field(default=2_000, ge=1)
    max_candles_per_repair_batch: int = Field(default=5_000, ge=1)
    default_worker_identity: str = Field(default="trade-lab-local-worker")
    tradelab_environment: str = Field(default="local")
    tradelab_testnet_credential_vault_provider: str = Field(default="fake")
    tradelab_local_dev_testnet_credential_key: str = Field(default="")
    tradelab_testnet_credential_validation_enabled: bool = Field(default=False)
    tradelab_binance_testnet_base_url: str = Field(default="https://testnet.binance.vision")
    tradelab_testnet_credential_validation_recv_window_ms: int = Field(default=5000, ge=1000, le=60000)
    tradelab_testnet_credential_validation_timeout_seconds: float = Field(default=5.0, ge=1, le=15)
    tradelab_testnet_order_submit_kill_switch_enabled: bool = Field(default=True)
    tradelab_testnet_order_submit_connector_mode: str = Field(default="fake")
    tradelab_testnet_order_submit_network_enabled: bool = Field(default=False)
    tradelab_testnet_order_submit_recv_window_ms: int = Field(default=5000, ge=1000, le=60000)
    tradelab_testnet_order_submit_timeout_seconds: float = Field(default=5.0, ge=1, le=15)
    tradelab_live_credential_vault_provider: str = Field(default="disabled")
    tradelab_local_dev_live_credential_key: str = Field(default="")
    tradelab_live_credential_validation_enabled: bool = Field(default=False)
    tradelab_binance_live_base_url: str = Field(default="https://api.binance.com")
    tradelab_live_credential_validation_recv_window_ms: int = Field(default=5000, ge=1000, le=60000)
    tradelab_live_credential_validation_timeout_seconds: float = Field(default=5.0, ge=1, le=15)
    tradelab_live_order_submit_kill_switch_enabled: bool = Field(default=True)
    tradelab_live_order_submit_connector_mode: str = Field(default="fake")
    tradelab_live_order_submit_network_enabled: bool = Field(default=False)
    tradelab_live_order_submit_recv_window_ms: int = Field(default=5000, ge=1000, le=60000)
    tradelab_live_order_submit_timeout_seconds: float = Field(default=5.0, ge=1, le=15)
    tradelab_local_fill_enabled: bool = Field(default=False)
    tradelab_local_paper_engine_enabled: bool = Field(default=False)
    tradelab_local_paper_kill_switch_enabled: bool = Field(default=False)
    tradelab_background_fill_scheduler_enabled: bool = Field(default=False)
    tradelab_background_fill_scheduler_interval_seconds: float = Field(default=60.0, ge=0)
    tradelab_background_fill_scheduler_worker_id: str = Field(default="trade-lab-local-scheduler")
    tradelab_background_fill_scheduler_error_backoff_seconds: float = Field(default=60.0, ge=0)
    tradelab_paper_scheduler_enabled: bool = Field(default=False)
    tradelab_paper_scheduler_interval_seconds: float = Field(default=60.0, ge=0)
    tradelab_paper_scheduler_worker_id: str = Field(default="tradelab-local-paper-scheduler")
    tradelab_paper_scheduler_error_backoff_seconds: float = Field(default=60.0, ge=0)
    seed_baseline_on_startup: bool = Field(default=False)
    seed_baseline_created_by: str = Field(default="trade-lab-startup")


def get_settings() -> Settings:
    return Settings()


settings = get_settings()


