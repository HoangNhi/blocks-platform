import json
from collections.abc import AsyncIterator

from assistant_service_api.core.config import get_settings
from assistant_service_api.schemas.assistant import (
    AssistantChatRequest,
    AssistantStreamChunkEvent,
    AssistantStreamCompleteEvent,
    AssistantStreamErrorEvent,
    AssistantStreamStartEvent,
)
from assistant_service_api.services.assistant_ollama import (
    AssistantOllamaConfigError,
    AssistantOllamaStreamError,
    stream_ollama_assistant_reply,
)
from assistant_service_api.services.assistant_prompt import (
    OUTSIDE_TRADELAB_REPLY,
    build_assistant_messages,
    is_tradelab_context,
)

from assistant_service_api.services.assistant_orchestrator import (
    AssistantToolCatalog,
    plan_assistant_turn,
)


def format_sse_event(event_name: str, payload: dict[str, object]) -> str:
    return (
        f"event: {event_name}\ndata: {json.dumps(payload, separators=(',', ':'))}\n\n"
    )


async def stream_assistant_events(request: AssistantChatRequest) -> AsyncIterator[str]:
    yield format_sse_event(
        "start",
        AssistantStreamStartEvent(scope=request.scope).model_dump(
            mode="json", by_alias=True
        ),
    )
    decision = plan_assistant_turn(request, AssistantToolCatalog())

    if decision.kind == "reject_tool_request":
        yield format_sse_event(
            "error",
            AssistantStreamErrorEvent(
                message=decision.message or "Assistant tool request is not supported."
            ).model_dump(mode="json", by_alias=True),
        )
        return

    if not is_tradelab_context(request):
        yield format_sse_event(
            "chunk",
            AssistantStreamChunkEvent(content=OUTSIDE_TRADELAB_REPLY).model_dump(
                mode="json", by_alias=True
            ),
        )
        yield format_sse_event(
            "complete",
            AssistantStreamCompleteEvent(suggestions=[]).model_dump(
                mode="json", by_alias=True
            ),
        )
        return

    settings = get_settings()

    try:
        messages = build_assistant_messages(request)
        async for chunk in stream_ollama_assistant_reply(messages, settings):
            yield format_sse_event(
                "chunk",
                AssistantStreamChunkEvent(content=chunk).model_dump(
                    mode="json", by_alias=True
                ),
            )
        yield format_sse_event(
            "complete",
            AssistantStreamCompleteEvent(suggestions=[]).model_dump(
                mode="json", by_alias=True
            ),
        )
    except (AssistantOllamaConfigError, AssistantOllamaStreamError) as exc:
        yield format_sse_event(
            "error",
            AssistantStreamErrorEvent(message=str(exc)).model_dump(
                mode="json", by_alias=True
            ),
        )
