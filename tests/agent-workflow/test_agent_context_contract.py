from __future__ import annotations

import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / ".agent-context" / "context-manifest.yaml"
WORKFLOW_MAP = ROOT / "agents" / "manifests" / "workflow-map.yaml"
ROUTING = ROOT / "agents" / "protocol" / "context-routing.md"
SYNC = ROOT / "agents" / "tools" / "skills" / "sync-agent-skills.ps1"

ACTIVE_SOURCES = (
    ROOT / "AGENTS.md",
    ROOT / "agents/protocol/core.md",
    ROOT / "agents/protocol/context-routing.md",
    ROOT / "agents/adapters/codex.md",
    ROOT / "agents/skills/blocks-skills/skills/blocks-ui-workflow/SKILL.md",
)


@pytest.fixture(autouse=True)
def remove_generated_root_catalogs():
    catalogs = (ROOT / ".agents", ROOT / ".claude")
    preexisting = {catalog for catalog in catalogs if catalog.exists()}
    yield
    for catalog in catalogs:
        if catalog not in preexisting:
            assert catalog.resolve().parent == ROOT.resolve()
            shutil.rmtree(catalog, ignore_errors=True)


def test_workflow_context_areas_exist_in_manifest() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    declared = re.findall(r"^    context_area: ([a-z-]+)$", WORKFLOW_MAP.read_text(encoding="utf-8"), re.M)
    assert declared == ["cross-service", "tradelab", "agent-workflow"]
    assert set(declared) <= set(manifest["areas"])


def test_routing_requires_exact_knowledge_task() -> None:
    routing = ROUTING.read_text(encoding="utf-8")
    assert "exact owner-approved Knowledge task" in routing
    assert "BLOCKED" in routing
    assert "public contributor task under" not in routing
    assert "-Area web" in routing
    assert "-Area assistant" in routing
    assert "-Area agent-workflow" in routing
    assert "-Area cross-service" in routing


def test_active_context_sources_do_not_require_removed_vault_paths() -> None:
    for source in ACTIVE_SOURCES:
        assert "obsidian-vault/" not in source.read_text(encoding="utf-8"), source


def test_sync_publishes_corrected_blocks_ui_workflow() -> None:
    sync = subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(SYNC), "-RepoRoot", str(ROOT)],
        capture_output=True, text=True, check=False,
    )
    assert sync.returncode == 0, sync.stderr
    for catalog in (ROOT / ".agents/skills", ROOT / ".claude/skills"):
        published = (catalog / "blocks-ui-workflow/SKILL.md").read_text(encoding="utf-8")
        assert "obsidian-vault/" not in published
        assert ".agent-context/generated/web-context.md" in published

