from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

ZERO_UUID = UUID("00000000-0000-0000-0000-000000000000")


def validate_nonzero_uuid(v: str | UUID) -> UUID:
    if isinstance(v, str):
        try:
            parsed = UUID(v)
        except (ValueError, AttributeError, TypeError):
            raise ValueError("Mã định danh không hợp lệ") from None
    elif isinstance(v, UUID):
        parsed = v
    else:
        raise TypeError("Mã định danh không hợp lệ")

    if parsed == ZERO_UUID:
        raise ValueError("Mã định danh không được là zero UUID")
    return parsed


def _validate_clean_text(
    v: str | None, max_len: int, field_name: str, required: bool = False
) -> str | None:
    if v is None:
        if required:
            raise ValueError(f"{field_name} là bắt buộc")
        return None
    if "\0" in v:
        raise ValueError(f"{field_name} không được chứa ký tự null (NUL)")
    trimmed = v.strip()
    if required and not trimmed:
        raise ValueError(f"{field_name} không được để trống")
    if len(trimmed) > max_len:
        raise ValueError(f"{field_name} không được vượt quá {max_len} ký tự")
    return trimmed or None


class CollectionCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    Name: str = Field(..., description="Tên bộ sưu tập")
    Description: str | None = Field(default=None, description="Mô tả bộ sưu tập")

    @field_validator("Name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        res = _validate_clean_text(
            v, max_len=200, field_name="Tên bộ sưu tập", required=True
        )
        assert res is not None
        return res

    @field_validator("Description")
    @classmethod
    def validate_description(cls, v: str | None) -> str | None:
        return _validate_clean_text(v, max_len=2000, field_name="Mô tả", required=False)


class CollectionUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    Name: str = Field(..., description="Tên bộ sưu tập")
    Description: str | None = Field(default=None, description="Mô tả bộ sưu tập")

    @field_validator("Name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        res = _validate_clean_text(
            v, max_len=200, field_name="Tên bộ sưu tập", required=True
        )
        assert res is not None
        return res

    @field_validator("Description")
    @classmethod
    def validate_description(cls, v: str | None) -> str | None:
        return _validate_clean_text(v, max_len=2000, field_name="Mô tả", required=False)


class CollectionResponse(BaseModel):
    Id: str
    Name: str
    Description: str | None = None
    CreatedAt: str
    UpdatedAt: str
    DocumentCount: int = 0

    @classmethod
    def from_model(cls, m: Any) -> "CollectionResponse":
        return cls(
            Id=str(m.id),
            Name=m.name,
            Description=m.description,
            CreatedAt=m.created_at.isoformat() if hasattr(m.created_at, "isoformat") else str(m.created_at),
            UpdatedAt=m.updated_at.isoformat() if hasattr(m.updated_at, "isoformat") else str(m.updated_at),
            DocumentCount=0,
        )


class CollectionListResponse(BaseModel):
    Data: list[CollectionResponse]
    TotalRow: int
    PageIndex: int
    PageSize: int


class CollectionListQuery(BaseModel):
    page_index: int = Field(default=1, ge=1, description="Số trang")
    page_size: int = Field(default=50, ge=1, le=100, description="Kích thước trang")
