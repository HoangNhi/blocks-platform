from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_repository_has_no_development_task_folders() -> None:
    for relative in ("docs/tasks", "docs/plans", "docs/specs", "docs/superpowers"):
        assert not (ROOT / relative).exists(), relative


def test_task_creation_and_current_routing_do_not_fall_back_to_repo() -> None:
    for relative in ("AGENTS.md", "agents/protocol/core.md", "agents/protocol/context-routing.md",
                     "agents/adapters/codex.md", "agents/adapters/claude.md",
                     "agents/adapters/antigravity.md", "agents/adapters/hermes.md",
                     "docs/runbooks/agent-context.md", "docs/README.md", "README.md"):
        text = (ROOT / relative).read_text(encoding="utf-8")
        assert "Knowledge" in text, relative
        assert "docs/tasks/" not in text, relative
        assert ".hermes/runs" not in text, relative
