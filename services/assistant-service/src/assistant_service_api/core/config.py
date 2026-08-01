from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="", case_sensitive=False, extra="ignore"
    )

    assistant_llm_provider: str = Field(default="ollama")
    assistant_llm_model: str = Field(default="qwen3.5:2b-q4_K_M")
    assistant_llm_base_url: str = Field(default="http://localhost:11434")
    assistant_llm_context_tokens: int = Field(default=4096, ge=512, le=32768)
    assistant_llm_timeout_seconds: float = Field(default=60.0, ge=1, le=300)


def get_settings() -> Settings:
    return Settings()


settings = get_settings()
