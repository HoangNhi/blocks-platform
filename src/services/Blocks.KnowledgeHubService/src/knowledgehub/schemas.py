from pathlib import Path
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
    def from_model(cls, m: Any, document_count: int = 0) -> "CollectionResponse":
        return cls(
            Id=str(m.id),
            Name=m.name,
            Description=m.description,
            CreatedAt=m.created_at.isoformat()
            if hasattr(m.created_at, "isoformat")
            else str(m.created_at),
            UpdatedAt=m.updated_at.isoformat()
            if hasattr(m.updated_at, "isoformat")
            else str(m.updated_at),
            DocumentCount=document_count,
        )


class CollectionListResponse(BaseModel):
    Data: list[CollectionResponse]
    TotalRow: int
    PageIndex: int
    PageSize: int


class CollectionListQuery(BaseModel):
    page_index: int = Field(default=1, ge=1, description="Số trang")
    page_size: int = Field(default=50, ge=1, le=100, description="Kích thước trang")


MAX_DOCUMENT_BYTES = 52_428_800  # 50MB
DOCUMENT_MIME_TYPES = {
    ".pdf": "application/pdf",
    ".md": "text/markdown",
    ".txt": "text/plain",
}
DOCUMENT_REGISTRATION_STATUSES = {
    "AWAITING_UPLOAD",
    "REGISTERING",
    "REGISTRATION_FAILED",
    "REGISTERED",
}


class DocumentUploadIntentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    UploadSessionId: UUID
    OriginalFileName: str
    DeclaredSizeBytes: int = Field(gt=0, le=MAX_DOCUMENT_BYTES)

    @field_validator("UploadSessionId")
    @classmethod
    def validate_session_id(cls, v: str) -> UUID:
        return validate_nonzero_uuid(v)

    @field_validator("OriginalFileName")
    @classmethod
    def validate_title(cls, v: str) -> str:
        name = v.strip()
        if not name or len(name) > 255:
            raise ValueError("Tên tệp phải có từ 1 đến 255 ký tự")

        if (
            "/" in name
            or chr(92) in name
            or ":" in name
            or ".." in name
            or any(ord(ch) < 32 or ord(ch) == 127 for ch in name)
        ):
            raise ValueError("Tên tệp không được chứa đường dẫn hoặc ký tự điều khiển")

        extension = Path(name).suffix.lower()
        if extension not in DOCUMENT_MIME_TYPES:
            raise ValueError("Chỉ chấp nhận PDF, Markdown và TXT")

        if Path(name).name != name:
            raise ValueError("Tên tệp phải là basename")

        return name


class DocumentUploadIntentResponse(BaseModel):
    DocumentId: str
    UploadSessionId: str
    RegistrationStatus: str


class DocumentResponse(BaseModel):
    Id: str
    CollectionId: str
    Title: str
    OriginalFileName: str
    FileExtension: str
    ContentType: str
    SizeBytes: int
    RegistrationStatus: str
    CreatedAt: str
    UpdatedAt: str
    RegisteredAt: str | None = None

    @classmethod
    def from_model(cls, document: Any) -> "DocumentResponse":
        size = document.size_bytes or document.declared_size_bytes
        return cls(
            Id=str(document.id),
            CollectionId=str(document.collection_id),
            Title=document.title,
            OriginalFileName=document.original_filename,
            FileExtension=document.file_extension,
            ContentType=document.content_type,
            SizeBytes=int(size),
            RegistrationStatus=document.registration_status,
            CreatedAt=document.created_at.isoformat(),
            UpdatedAt=document.updated_at.isoformat(),
            RegisteredAt=(
                document.registered_at.isoformat()
                if document.registered_at is not None
                else None
            ),
        )


class DocumentPageResponse(BaseModel):
    Data: list[DocumentResponse]
    TotalRow: int
    PageIndex: int
    PageSize: int


class DocumentDeleteResponse(BaseModel):
    Id: str
    CleanupStatus: str
