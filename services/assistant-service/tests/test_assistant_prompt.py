from assistant_service_api.schemas.assistant import AssistantChatRequest, AssistantPageContext
from assistant_service_api.services.assistant_prompt import build_assistant_messages


def test_prompt_builder_includes_page_context_and_phase2_boundaries() -> None:
    request = AssistantChatRequest(
        scope="tradelab",
        message="Explain this page",
        page_context=AssistantPageContext(
            route="/plugins/tradelab/strategy-lab",
            title="Strategy Lab",
            owner_key="tradelab",
        ),
    )

    messages = build_assistant_messages(request)

    assert len(messages) == 2
    assert messages[0]["role"] == "system"
    assert "Blocks AI assistant for TradeLab Phase 2" in messages[0]["content"]
    assert "No tools." in messages[0]["content"]
    assert "Do not claim that you ran tools" in messages[0]["content"]
    assert messages[1]["role"] == "user"
    assert "Route: /plugins/tradelab/strategy-lab" in messages[1]["content"]
    assert "Title: Strategy Lab" in messages[1]["content"]
    assert "User message: Explain this page" in messages[1]["content"]


def test_prompt_builder_handles_outside_tradelab_context_honestly() -> None:
    request = AssistantChatRequest(
        scope="tradelab",
        message="What can I do here?",
        page_context=AssistantPageContext(
            route="/system/identity/users",
            title="Users",
            owner_key="system-service",
        ),
    )

    messages = build_assistant_messages(request)

    assert "The current page is outside TradeLab" in messages[0]["content"]
    assert "redirect the user back to TradeLab for page-specific help" in messages[0]["content"]
    assert "Owner key: system-service" in messages[1]["content"]
