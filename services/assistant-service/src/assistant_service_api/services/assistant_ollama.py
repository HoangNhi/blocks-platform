import json
from collections.abc import AsyncIterator, Callable

import httpx

from assistant_service_api.core.config import Settings


class AssistantOllamaConfigError(RuntimeError):
    pass


class AssistantOllamaStreamError(RuntimeError):
    pass


async def stream_ollama_assistant_reply(
    messages: list[dict[str, str]],
    settings: Settings,
    *,
    client_factory: Callable[..., httpx.AsyncClient] = httpx.AsyncClient,
) -> AsyncIterator[str]:
    if settings.assistant_llm_provider.lower() != "ollama":
        raise AssistantOllamaConfigError("Assistant provider is not configured for Ollama.")

    base_url = settings.assistant_llm_base_url.rstrip("/")
    if not base_url:
        raise AssistantOllamaConfigError("Assistant base URL is not configured.")

    payload = {
        "model": settings.assistant_llm_model,
        "stream": True,
        "think": False,
        "messages": messages,
        "options": {
            "num_ctx": settings.assistant_llm_context_tokens,
            "num_predict": 64,
        },
    }

    timeout = httpx.Timeout(settings.assistant_llm_timeout_seconds)

    try:
        async with client_factory(base_url=base_url, timeout=timeout) as client:
            async with client.stream("POST", "/api/chat", json=payload) as response:
                if response.status_code != 200:
                    raise AssistantOllamaStreamError("Assistant model is unavailable.")

                async for line in response.aiter_lines():
                    if not line:
                        continue

                    chunk = json.loads(line)
                    message = chunk.get("message")
                    if isinstance(message, dict):
                        content = message.get("content")
                        if isinstance(content, str) and content:
                            yield content

                    if chunk.get("done") is True:
                        break
    except AssistantOllamaStreamError:
        raise
    except json.JSONDecodeError as exc:
        raise AssistantOllamaStreamError("Assistant stream returned invalid data.") from exc
    except httpx.HTTPError as exc:
        raise AssistantOllamaStreamError("Assistant model is unavailable.") from exc
