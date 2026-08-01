from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy.inspection import inspect


def serialize_model(model: object) -> dict[str, object]:
    mapper = inspect(model).mapper
    payload: dict[str, object] = {}
    for attr in mapper.column_attrs:
        column = attr.columns[0]
        payload[column.name] = serialize_value(getattr(model, attr.key))
    return payload


def serialize_value(value: object) -> object:
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, list):
        return [serialize_value(item) for item in value]
    if isinstance(value, dict):
        return {str(key): serialize_value(item) for key, item in value.items()}
    return value


def serialize_sorted_value(value: object) -> object:
    if isinstance(value, dict):
        return {
            str(key): serialize_sorted_value(item)
            for key, item in sorted(value.items(), key=lambda item: str(item[0]))
        }
    if isinstance(value, list):
        return [serialize_sorted_value(item) for item in value]
    return serialize_value(value)
