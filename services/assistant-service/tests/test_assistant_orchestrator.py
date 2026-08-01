import pytest
from pydantic import ValidationError

from assistant_service_api.schemas.assistant import AssistantChatRequest
from assistant_service_api.services.assistant_orchestrator import (
    AssistantOrchestrationDecision,
    AssistantToolCatalog,
    AssistantToolDefinition,
    AssistantToolRequest,
    AssistantToolRequestRejected,
    plan_assistant_turn,
    validate_tool_request,
)


def test_empty_catalog_always_plans_a_response() -> None:
    decision = plan_assistant_turn(
        AssistantChatRequest(scope="tradelab", message="Explain this page"),
        AssistantToolCatalog(),
    )

    assert decision == AssistantOrchestrationDecision(kind="respond")


def test_catalog_rejects_unregistered_tool_request() -> None:
    request = AssistantToolRequest(name="tradelab.list_sessions", arguments={})

    with pytest.raises(
        AssistantToolRequestRejected,
        match="Assistant tool request is not supported.",
    ):
        validate_tool_request(request, AssistantToolCatalog())


def test_catalog_rejects_mutation_tool_request() -> None:
    catalog = AssistantToolCatalog(
        [AssistantToolDefinition(name="tradelab.save_draft", risk="mutation")]
    )
    request = AssistantToolRequest(name="tradelab.save_draft", arguments={})

    with pytest.raises(
        AssistantToolRequestRejected,
        match="Assistant tool request is not supported.",
    ):
        validate_tool_request(request, catalog)


def test_tool_request_rejects_empty_name() -> None:
    with pytest.raises(ValidationError):
        AssistantToolRequest(name="", arguments={})


def test_tool_request_rejects_non_json_compatible_arguments() -> None:
    with pytest.raises(ValidationError):
        AssistantToolRequest(
            name="tradelab.list_sessions",
            arguments={"bad": {"set"}},
        )