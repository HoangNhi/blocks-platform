from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from pydantic import Field

from .common import CamelModel


class ExchangeConnectionResponse(CamelModel):
    id: UUID
    exchange: str
    name: str
    account_label: str | None = None
    api_key_ref: str | None = None
    api_secret_ref: str | None = None
    permissions: dict[str, Any]
    metadata: dict[str, Any] = Field(validation_alias="metadata_", serialization_alias="metadata")
    status: str
    created_at: datetime
    created_by: str | None = None
    updated_at: datetime | None = None
    updated_by: str | None = None
    is_active: bool
    is_deleted: bool


class ExchangeSymbolResponse(CamelModel):
    id: UUID
    exchange: str
    symbol: str
    base_asset: str
    quote_asset: str
    status: str
    tick_size: Decimal | None = None
    step_size: Decimal | None = None
    min_qty: Decimal | None = None
    min_notional: Decimal | None = None
    metadata: dict[str, Any] = Field(validation_alias="metadata_", serialization_alias="metadata")
    created_at: datetime
    created_by: str | None = None
    updated_at: datetime | None = None
    updated_by: str | None = None
    is_active: bool
    is_deleted: bool
