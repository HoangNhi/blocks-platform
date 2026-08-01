from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
GITIGNORE = ROOT / ".gitignore"
MANIFEST = ROOT / "agents" / "skills-manifest.yaml"


def test_gitignore_ignores_generated_runtime_skill_outputs() -> None:
    text = GITIGNORE.read_text(encoding="utf-8")
    assert "/.agents/skills/" in text
    assert "/.claude/skills/" in text


def test_manifest_declares_the_initial_publish_set() -> None:
    text = MANIFEST.read_text(encoding="utf-8")

    expected_lines = [
        "source_repo: superpowers",
        "source_repo: obsidian-skills",
        "source_repo: browser-use",
        "source_repo: taste-skill",
        "source_repo: agent-skills",
        "source_repo: impeccable",
        "target_name: frontend-ui-engineering",
        "target_name: using-superpowers",
        "target_name: obsidian-markdown",
        "target_name: browser-use",
        "target_name: taste-skill",
        "status: experimental",
    ]

    for expected in expected_lines:
        assert expected in text
