import math
import os
import ssl
from pathlib import Path
from urllib.parse import urlparse

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE_ENV = os.getenv("KNOWLEDGEHUB_ENV_FILE")
if ENV_FILE_ENV is not None:
    ENV_PATH = (
        Path(ENV_FILE_ENV) if ENV_FILE_ENV and ENV_FILE_ENV.lower() != "none" else None
    )
else:
    DEFAULT_ENV = Path(__file__).resolve().parents[2] / ".env"
    ENV_PATH = DEFAULT_ENV if DEFAULT_ENV.is_file() else None


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="KNOWLEDGEHUB_",
        case_sensitive=False,
        env_file=ENV_PATH,
        env_file_encoding="utf-8",
        extra="ignore",
        hide_input_in_errors=True,
    )

    jwt_key: SecretStr
    jwt_issuer: str
    jwt_audience: str
    system_grpc_url: str
    system_grpc_ca_file: Path
    permission_timeout_seconds: float = Field(default=3.0)
    database_url: SecretStr
    file_grpc_url: str
    file_grpc_ca_file: Path
    file_rpc_timeout_seconds: float = Field(default=10.0)
    file_download_timeout_seconds: float = Field(default=60.0)

    @field_validator("jwt_key")
    @classmethod
    def validate_jwt_key(cls, v: SecretStr) -> SecretStr:
        secret = v.get_secret_value()
        if len(secret.encode("utf-8")) < 32 or not secret.strip():
            raise ValueError(
                "JWT key must be at least 32 UTF-8 bytes and not whitespace"
            )
        return v

    @field_validator("jwt_issuer", "jwt_audience")
    @classmethod
    def validate_non_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Must not be empty")
        return v.strip()

    @field_validator("system_grpc_url")
    @classmethod
    def validate_grpc_url(cls, v: str) -> str:
        parsed = urlparse(v)
        if parsed.scheme != "https":
            raise ValueError("Scheme must be https")
        if not parsed.hostname:
            raise ValueError("URL must include host")
        try:
            port = parsed.port
        except ValueError:
            raise ValueError("Invalid port")
        if port is None or not (1 <= port <= 65535):
            raise ValueError("URL must include a valid port (1-65535)")
        if parsed.query or parsed.fragment or parsed.username or parsed.password:
            raise ValueError("URL must not contain credentials, query, or fragment")
        if parsed.path and parsed.path != "/":
            raise ValueError("URL must not contain non-root path")
        return v

    @field_validator("system_grpc_ca_file")
    @classmethod
    def validate_ca_file(cls, v: Path) -> Path:
        if not v.is_absolute():
            raise ValueError("CA file path must be absolute")
        if not v.is_file():
            raise ValueError("CA file must exist and be a regular file")
        if not os.access(v, os.R_OK):
            raise ValueError("CA file must be readable")

        try:
            content = v.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            raise ValueError("CA file must be a valid UTF-8 PEM certificate")

        if (
            "-----BEGIN CERTIFICATE-----" not in content
            or "-----END CERTIFICATE-----" not in content
        ):
            raise ValueError("CA file must contain a valid PEM certificate block")

        if "PRIVATE KEY" in content:
            raise ValueError("CA file must not contain private keys")

        try:
            ssl._ssl._test_decode_cert(str(v))
        except Exception:
            raise ValueError("CA file must be a valid, readable X.509 PEM certificate")

        return v

    @field_validator("permission_timeout_seconds")
    @classmethod
    def validate_timeout(cls, v: float) -> float:
        if not math.isfinite(v) or v <= 0 or v > 30:
            raise ValueError("Timeout must be a finite number in (0, 30]")
        return v

    @field_validator("database_url")
    @classmethod
    def validate_database_url(cls, v: SecretStr) -> SecretStr:
        raw = v.get_secret_value()
        if not raw or not raw.strip():
            raise ValueError("Database URL must not be empty")
        parsed = urlparse(raw)
        if parsed.scheme != "postgresql+asyncpg":
            raise ValueError("Scheme must be postgresql+asyncpg")
        if not parsed.username or not parsed.username.strip():
            raise ValueError("Database URL must include a username")
        if not parsed.hostname:
            raise ValueError("Database URL must include host")
        try:
            port = parsed.port
        except ValueError:
            raise ValueError("Invalid port")
        if port is None or not (1 <= port <= 65535):
            raise ValueError("Database URL must include a valid port (1-65535)")

        db_name = parsed.path.lstrip("/")
        if db_name != "knowledgehub":
            raise ValueError("Database name must be exactly 'knowledgehub'")
        return v

    @field_validator("file_grpc_url")
    @classmethod
    def validate_file_grpc_url(cls, v: str) -> str:
        parsed = urlparse(v)
        if parsed.scheme != "https":
            raise ValueError("Scheme must be https")
        if not parsed.hostname:
            raise ValueError("URL must include host")
        try:
            port = parsed.port
        except ValueError:
            raise ValueError("Invalid port")
        if port is None or not (1 <= port <= 65535):
            raise ValueError("URL must include a valid port (1-65535)")
        if parsed.query or parsed.fragment or parsed.username or parsed.password:
            raise ValueError("URL must not contain credentials, query, or fragment")
        if parsed.path and parsed.path != "/":
            raise ValueError("URL must not contain non-root path")
        return v

    @field_validator("file_grpc_ca_file")
    @classmethod
    def validate_file_grpc_ca_file(cls, v: Path) -> Path:
        if not v.is_absolute() or not v.is_file() or not os.access(v, os.R_OK):
            raise ValueError("FileService CA path must be an absolute readable file")

        try:
            content = v.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            raise ValueError("FileService CA must be a UTF-8 PEM certificate")

        if (
            "-----BEGIN CERTIFICATE-----" not in content
            or "-----END CERTIFICATE-----" not in content
            or "PRIVATE KEY" in content
        ):
            raise ValueError(
                "FileService CA must contain certificates and no private key"
            )

        try:
            ssl._ssl._test_decode_cert(str(v))
        except Exception:
            raise ValueError("FileService CA must be a valid X.509 PEM certificate")

        return v

    @field_validator("file_rpc_timeout_seconds", "file_download_timeout_seconds")
    @classmethod
    def validate_file_timeouts(cls, v: float) -> float:
        if not math.isfinite(v) or v <= 0 or v > 120:
            raise ValueError("FileService timeout must be finite and in (0, 120]")
        return v
