import sys
from pathlib import Path


def find_repository_root(start: Path) -> Path:
    current = start.resolve()
    for candidate in (current, *current.parents):
        if (candidate / 'AGENTS.md').exists() and (candidate / 'Blocks.slnx').exists():
            return candidate
    raise RuntimeError('Could not locate the Blocks repository root')


repo_root = find_repository_root(Path(__file__).resolve().parent)
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))

from agents.tools.tradelab_pilot_controller import research_status, submit_experiment

def register(ctx):
    ctx.register_tool(
        name="tradelab_research_status",
        toolset="tradelab_research",
        description="Query policy and research status for the current agent family.",
        schema={
            "type": "object",
            "properties": {
                "campaignId": {
                    "type": "string",
                    "description": "The active campaign ID."
                }
            },
            "required": ["campaignId"],
            "additionalProperties": False,
        },
        handler=research_status,
    )

    ctx.register_tool(
        name="tradelab_submit_experiment",
        toolset="tradelab_research",
        description="Submit a new parameter hypothesis experiment run to TradeLab.",
        schema={
            "type": "object",
            "properties": {
                "campaignId": {
                    "type": "string",
                    "description": "The active campaign ID."
                },
                "hypothesis": {
                    "type": "string",
                    "description": "The research hypothesis."
                },
                "sources": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "url": {"type": "string"},
                            "retrievedAt": {"type": "string"},
                            "claim": {"type": "string"}
                        },
                        "required": ["url", "retrievedAt", "claim"],
                        "additionalProperties": False
                    }
                },
                "changedParameterGroup": {
                    "type": "string",
                    "enum": ["baseline", "entry", "exit"]
                },
                "parameters": {
                    "type": "object"
                },
                "expectedEffect": {
                    "type": "string"
                },
                "observedEffect": {
                    "type": "string"
                },
                "lesson": {
                    "type": "string"
                },
                "nextExperiment": {
                    "type": "string"
                }
            },
            "required": [
                "campaignId",
                "hypothesis",
                "sources",
                "changedParameterGroup",
                "parameters",
                "expectedEffect",
                "observedEffect",
                "lesson",
                "nextExperiment"
            ],
            "additionalProperties": False,
        },
        handler=submit_experiment,
    )
