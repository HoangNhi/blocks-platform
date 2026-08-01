from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from .common import CamelModel


class StrategyLogResponse(CamelModel):
    id: UUID
    bot_run_id: UUID
    level: str
    event_type: str
    message: str
    payload: dict[str, Any]
    created_at: datetime

