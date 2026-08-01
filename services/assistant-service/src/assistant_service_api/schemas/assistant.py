from typing import Literal
from pydantic import BaseModel, Field, ConfigDict, field_validator


class AssistantPageContext(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    route: str | None = None
    title: str | None = None
    owner_key: str | None = Field(default=None, alias="ownerKey")


class AssistantChatRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    scope: Literal["tradelab"]
    message: str
    page_context: AssistantPageContext | None = Field(default=None, alias="pageContext")

    @field_validator("message")
    @classmethod
    def message_must_not_be_empty(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Message is required")
        return normalized


class AssistantStreamStartEvent(BaseModel):
    event: Literal["start"] = "start"
    scope: Literal["tradelab"]
    mode: Literal["ollama_chat"] = "ollama_chat"


class AssistantStreamChunkEvent(BaseModel):
    event: Literal["chunk"] = "chunk"
    content: str


class AssistantStreamCompleteEvent(BaseModel):
    event: Literal["complete"] = "complete"
    suggestions: list[str]


class AssistantStreamErrorEvent(BaseModel):
    event: Literal["error"] = "error"
    message: str
