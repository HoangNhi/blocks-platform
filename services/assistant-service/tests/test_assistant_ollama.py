import json

import httpx
import pytest

from assistant_service_api.core.config import Settings
from assistant_service_api.services.assistant_ollama import (
    AssistantOllamaConfigError,
    AssistantOllamaStreamError,
    stream_ollama_assistant_reply,
)


def make_client_factory(handler):
    def factory(**kwargs):
        return httpx.AsyncClient(
            transport=httpx.MockTransport(handler),
            base_url=kwargs["base_url"],
            timeout=kwargs["timeout"],
        )

    return factory


def test_settings_default_to_vps_model(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ASSISTANT_LLM_MODEL", raising=False)

    assert Settings().assistant_llm_model == "qwen3.5:2b-q4_K_M"


@pytest.mark.asyncio
async def test_stream_ollama_assistant_reply_yields_content_chunks() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content.decode("utf-8"))
        assert request.url.path == "/api/chat"
        assert payload["model"] == "qwen3.5:2b-q4_K_M"
        assert payload["stream"] is True
        assert payload["think"] is False
        assert payload["options"]["num_predict"] == 64
        stream = [
            b'{"message":{"content":"Hello"},"done":false}\n',
            b'{"message":{"content":" world"},"done":false}\n',
            b'{"message":{"content":""},"done":true}\n',
        ]
        return httpx.Response(200, content=b"".join(stream))

    chunks = []

    async for chunk in stream_ollama_assistant_reply(
        [{"role": "user", "content": "Explain this page"}],
        Settings(),
        client_factory=make_client_factory(handler),
    ):
        chunks.append(chunk)

    assert chunks == ["Hello", " world"]


@pytest.mark.asyncio
async def test_stream_ollama_assistant_reply_rejects_wrong_provider() -> None:
    with pytest.raises(AssistantOllamaConfigError):
        async for _ in stream_ollama_assistant_reply(
            [{"role": "user", "content": "Explain this page"}],
            Settings(assistant_llm_provider="openai"),
        ):
            pass


@pytest.mark.asyncio
async def test_stream_ollama_assistant_reply_raises_safe_error_for_http_failure() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(503, content=b'{"error":"unavailable"}')

    with pytest.raises(AssistantOllamaStreamError, match="Assistant model is unavailable."):
        async for _ in stream_ollama_assistant_reply(
            [{"role": "user", "content": "Explain this page"}],
            Settings(),
            client_factory=make_client_factory(handler),
        ):
            pass
