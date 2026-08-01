from fastapi.testclient import TestClient

import pytest

import assistant_service_api.api.assistant as assistant_api_module
import assistant_service_api.services.assistant_chat as assistant_chat
from assistant_service_api.main import app
from assistant_service_api.schemas.assistant import AssistantChatRequest
from assistant_service_api.services.assistant_orchestrator import AssistantOrchestrationDecision


client = TestClient(app)


def request_body() -> dict[str, object]:
    return {
        "scope": "tradelab",
        "message": "Explain this page",
        "pageContext": {
            "route": "/plugins/tradelab",
            "title": "Strategy Lab",
            "ownerKey": "tradelab",
        },
    }


def test_assistant_chat_stream_returns_sse_events(monkeypatch) -> None:
    async def fake_stream(_request):
        yield 'event: start\ndata: {"event":"start","scope":"tradelab","mode":"ollama_chat"}\n\n'
        yield 'event: chunk\ndata: {"event":"chunk","content":"Hello"}\n\n'
        yield 'event: complete\ndata: {"event":"complete","suggestions":[]}\n\n'

    monkeypatch.setattr(assistant_api_module, "stream_assistant_events", fake_stream)

    response = client.post(
        "/api/assistant/chat",
        json=request_body(),
        headers={"Accept": "text/event-stream"},
    )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert 'event: start' in response.text
    assert '"mode":"ollama_chat"' in response.text
    assert 'event: chunk' in response.text
    assert 'Hello' in response.text
    assert 'event: complete' in response.text


def test_assistant_chat_rejects_empty_message() -> None:
    response = client.post(
        "/api/assistant/chat",
        json={"scope": "tradelab", "message": "   "},
        headers={"Accept": "text/event-stream"},
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_rejected_orchestration_decision_skips_ollama(monkeypatch) -> None:
    async def ollama_must_not_be_called(*_args, **_kwargs):
        raise AssertionError("Ollama must not be called")

    monkeypatch.setattr(
        assistant_chat,
        "plan_assistant_turn",
        lambda *_args: AssistantOrchestrationDecision(
            kind="reject_tool_request",
            message="Assistant tool request is not supported.",
        ),
    )
    monkeypatch.setattr(
        assistant_chat,
        "stream_ollama_assistant_reply",
        ollama_must_not_be_called,
    )

    events = [
        event
        async for event in assistant_chat.stream_assistant_events(
            AssistantChatRequest(scope="tradelab", message="Help")
        )
    ]

    assert len(events) == 2
    assert events[0].startswith("event: start\n")
    assert events[1].startswith("event: error\n")
    assert "Assistant tool request is not supported." in events[1]
    assert not any(event.startswith("event: chunk\n") for event in events)
    assert not any(event.startswith("event: complete\n") for event in events)
@pytest.mark.asyncio
async def test_outside_tradelab_context_returns_boundary_without_ollama(monkeypatch) -> None:
    async def ollama_must_not_be_called(*_args, **_kwargs):
        raise AssertionError("Ollama must not be called")
        yield ""

    monkeypatch.setattr(
        assistant_chat,
        "stream_ollama_assistant_reply",
        ollama_must_not_be_called,
    )

    events = [
        event
        async for event in assistant_chat.stream_assistant_events(
            AssistantChatRequest(
                scope="tradelab",
                message="What does service uptime mean?",
                page_context={
                    "route": "/",
                    "title": "Platform Overview",
                    "ownerKey": "blocks-web",
                },
            )
        )
    ]

    assert len(events) == 3
    assert events[0].startswith("event: start\n")
    assert events[1].startswith("event: chunk\n")
    assert "This page is outside TradeLab." in events[1]
    assert "TradeLab is the first supported assistant scope." in events[1]
    assert events[2].startswith("event: complete\n")