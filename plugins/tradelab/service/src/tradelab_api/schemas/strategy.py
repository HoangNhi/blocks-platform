from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import Field

from .common import CamelModel


class StrategyVersionResponse(CamelModel):
    id: UUID
    strategy_id: UUID
    version_number: int
    source_code: str
    source_hash: str
    validation_status: str
    validation_message: str | None = None
    created_at: datetime
    created_by: str | None = None
    updated_at: datetime | None = None
    updated_by: str | None = None
    is_active: bool
    is_deleted: bool


class StrategySummary(CamelModel):
    id: UUID
    strategy_group_id: UUID | None = None
    name: str
    slug: str
    description: str | None = None
    current_version_id: UUID | None = None
    status: str
    runtime_config: dict[str, Any]
    risk_config: dict[str, Any]
    metadata: dict[str, Any] = Field(validation_alias="metadata_", serialization_alias="metadata")
    created_at: datetime
    created_by: str | None = None
    updated_at: datetime | None = None
    updated_by: str | None = None
    is_active: bool
    is_deleted: bool


class StrategyDetail(StrategySummary):
    versions: list[StrategyVersionResponse] = []


class StrategyGroupSummary(CamelModel):
    id: UUID
    name: str
    slug: str
    description: str | None = None
    metadata: dict[str, Any] = Field(validation_alias="metadata_", serialization_alias="metadata")
    created_at: datetime
    created_by: str | None = None
    updated_at: datetime | None = None
    updated_by: str | None = None
    is_active: bool
    is_deleted: bool


class StrategyGroupDetail(StrategyGroupSummary):
    strategies: list[StrategySummary] = []
