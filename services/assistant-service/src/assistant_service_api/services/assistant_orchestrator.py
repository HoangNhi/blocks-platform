import json
from dataclasses import dataclass
from typing import Iterable, Literal

from pydantic import BaseModel, Field, field_validator

from assistant_service_api.schemas.assistant import AssistantChatRequest

ToolRisk = Literal["read_only", "mutation"]
DecisionKind = Literal["respond", "reject_tool_request"]


class AssistantToolRequest(BaseModel):
    name: str = Field(min_length=1)
    arguments: dict[str, object]

    @field_validator("arguments")
    @classmethod
    def arguments_must_be_json_compatible(
        cls, value: dict[str, object]
    ) -> dict[str, object]:
        try:
            json.dumps(value)
        except (TypeError, ValueError) as error:
            raise ValueError("Tool arguments must be JSON-compatible.") from error
        return value


@dataclass(frozen=True)
class AssistantToolDefinition:
    name: str
    risk: ToolRisk


@dataclass(frozen=True)
class AssistantOrchestrationDecision:
    kind: DecisionKind
    message: str | None = None


class AssistantToolRequestRejected(ValueError):
    pass


class AssistantToolCatalog:
    def __init__(self, definitions: Iterable[AssistantToolDefinition] = ()) -> None:
        self._definitions = {definition.name: definition for definition in definitions}

    def get(self, name: str) -> AssistantToolDefinition | None:
        return self._definitions.get(name)


def validate_tool_request(
    request: AssistantToolRequest, catalog: AssistantToolCatalog
) -> AssistantToolDefinition:
    definition = catalog.get(request.name)
    if definition is None or definition.risk != "read_only":
        raise AssistantToolRequestRejected("Assistant tool request is not supported.")
    return definition


def plan_assistant_turn(
    request: AssistantChatRequest, catalog: AssistantToolCatalog
) -> AssistantOrchestrationDecision:
    del request, catalog
    return AssistantOrchestrationDecision(kind="respond")