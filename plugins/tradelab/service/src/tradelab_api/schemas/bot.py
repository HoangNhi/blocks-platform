from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import Field, root_validator

from .common import CamelModel


class BotResponse(CamelModel):
    id: UUID
    strategy_id: UUID
    strategy_version_id: UUID | None = None
    name: str
    mode: str
    status: str
    exchange_connection_id: UUID | None = None
    symbol: str
    timeframe: str
    runtime_config: dict[str, Any]
    risk_config: dict[str, Any]
    metadata: dict[str, Any] = Field(validation_alias="metadata_", serialization_alias="metadata")
    created_at: datetime
    created_by: str | None = None
    updated_at: datetime | None = None
    updated_by: str | None = None
    is_active: bool
    is_deleted: bool


class ExecutionMode(str, Enum):
    BACKTEST = "backtest"
    PAPER = "paper"
    LIVE = "live"


class BotCreate(CamelModel):
    name: str
    strategy_id: str
    dataset_id: str
    execution_mode: ExecutionMode
    market_type: str = "spot"
    default_leverage: int = 1

    @root_validator(pre=True)
    def validate_futures_boundary(cls, values):
        exec_mode = values.get("execution_mode")
        market_type = values.get("market_type", "spot")
        if market_type == "usd_m_futures" and exec_mode != ExecutionMode.BACKTEST:
            raise ValueError("Futures are strictly restricted to backtest mode.")
        return values

