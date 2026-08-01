from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GET_CONTEXT = ROOT / "agents" / "tools" / "get-context.ps1"


def seed_repo(repo_root: Path) -> None:
    (repo_root / ".agent-context").mkdir(parents=True)
    (repo_root / "docs").mkdir()
    (repo_root / "AGENTS.md").write_text("repository rules\n", encoding="utf-8")
    (repo_root / "docs" / "core.md").write_text("core contract\n", encoding="utf-8")
    manifest = {
        "version": 1,
        "project": "Blocks",
        "maxBytes": 4096,
        "externalVault": {"env": "OBSIDIAN_VAULT_PATH", "access": "read-only"},
        "canonical": ["AGENTS.md"],
        "areas": {
            "core-service": {
                "repository": ["docs/core.md"],
                "external": ["services/system-service/README.md"],
            }
        },
    }
    (repo_root / ".agent-context" / "context-manifest.yaml").write_text(
        json.dumps(manifest, indent=2) + "\n",
        encoding="utf-8",
    )


def seed_repo_with_web_area(repo_root: Path) -> tuple[Path, Path]:
    vault_root = repo_root.parent / "vault"
    seed_repo(repo_root)
    (repo_root / "docs" / "web.md").write_text("web contract\n", encoding="utf-8")
    manifest_path = repo_root / ".agent-context" / "context-manifest.yaml"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["areas"]["web"] = {"repository": ["docs/web.md"], "external": []}
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return repo_root, vault_root


def run_context(
    repo_root: Path,
    *args: str,
    area: str = "core-service",
    vault_path: Path | None = None,
) -> subprocess.CompletedProcess[str]:
    environment = os.environ.copy()
    environment.pop("OBSIDIAN_VAULT_PATH", None)
    if vault_path is not None:
        environment["OBSIDIAN_VAULT_PATH"] = str(vault_path)
    return subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(GET_CONTEXT),
            "-Area",
            area,
            "-RepoRoot",
            str(repo_root),
            "-GeneratedAt",
            "2026-07-26T12:00:00Z",
            *args,
        ],
        capture_output=True,
        text=True,
        check=False,
        env=environment,
    )


def test_manifest_defined_web_area_and_bounded_vault_task(tmp_path: Path) -> None:
    repo_root, vault_root = seed_repo_with_web_area(tmp_path / "repo")
    task = vault_root / "services" / "web" / "tasks" / "example"
    task.mkdir(parents=True)
    (task / "spec.md").write_text("approved history\n", encoding="utf-8")
    (task / "evidence.log").write_text("must not appear\n", encoding="utf-8")

    result = run_context(
        repo_root,
        "-VaultRelativePath",
        "services/web/tasks/example",
        area="web",
        vault_path=vault_root,
    )

    assert result.returncode == 0, result.stderr
    content = (repo_root / ".agent-context/generated/web-context.md").read_text(encoding="utf-8")
    assert "approved history" in content
    assert "must not appear" not in content


def test_verify_detects_changed_repository_source(tmp_path: Path) -> None:
    repo_root, vault_root = seed_repo_with_web_area(tmp_path / "repo")
    assert run_context(repo_root, area="web", vault_path=vault_root).returncode == 0
    (repo_root / "docs" / "web.md").write_text("changed\n", encoding="utf-8")
    verify = run_context(repo_root, "-Verify", area="web", vault_path=vault_root)
    assert verify.returncode != 0
    assert "stale-context" in verify.stderr


def test_verify_ignores_source_metadata_inside_emitted_content(tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    seed_repo(repo_root)
    (repo_root / "docs" / "core.md").write_text(
        "---\nsource: legacy-vault/core.md\n---\ncore contract\n",
        encoding="utf-8",
    )

    generated = run_context(repo_root)
    verify = run_context(repo_root, "-Verify")

    assert generated.returncode == 0, generated.stderr
    assert verify.returncode == 0, verify.stderr


def test_vault_relative_path_rejects_absolute_and_traversal(tmp_path: Path) -> None:
    repo_root, vault_root = tmp_path / "repo", tmp_path / "vault"
    seed_repo_with_web_area(repo_root)
    for path in ("../outside.md", str((tmp_path / "outside.md").resolve())):
        result = run_context(repo_root, "-VaultRelativePath", path, area="web", vault_path=vault_root)
        assert result.returncode != 0
        assert "vault-path-outside-approved-root" in result.stderr


def test_generates_bounded_attributed_context(tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    vault_root = tmp_path / "vault"
    seed_repo(repo_root)
    note = vault_root / "services" / "system-service" / "README.md"
    note.parent.mkdir(parents=True)
    note.write_text("historical context\nAPI_KEY=super-secret\n", encoding="utf-8")

    result = run_context(repo_root, vault_path=vault_root)

    assert result.returncode == 0, result.stderr
    output = repo_root / ".agent-context" / "generated" / "core-service-context.md"
    content = output.read_text(encoding="utf-8")
    assert "generated_at: 2026-07-26T12:00:00Z" in content
    assert "source: repository:AGENTS.md" in content
    assert "source: vault:services/system-service/README.md" in content
    assert "core contract" in content
    assert "historical context" in content
    assert "super-secret" not in content
    assert "[REDACTED]" in content
    assert len(output.read_bytes()) <= 4096


def test_vault_unavailable_falls_back_to_repository_docs(tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    seed_repo(repo_root)

    result = run_context(repo_root)

    assert result.returncode == 0, result.stderr
    content = (repo_root / ".agent-context" / "generated" / "core-service-context.md").read_text(encoding="utf-8")
    assert "vault_available: false" in content
    assert "repository rules" in content
    assert "vault-unavailable" in content


def test_required_vault_fails_clearly(tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    seed_repo(repo_root)

    result = run_context(repo_root, "-RequireVault")

    assert result.returncode != 0
    assert "vault-required-unavailable" in result.stderr


def test_task_path_cannot_escape_repository(tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    seed_repo(repo_root)

    result = run_context(repo_root, "-TaskPath", "../outside.md")

    assert result.returncode != 0
    assert "task-path-outside-approved-roots" in result.stderr


def test_repository_contract_uses_projection_first_paths() -> None:
    agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")
    claude = (ROOT / "CLAUDE.md").read_text(encoding="utf-8")
    gemini = (ROOT / "GEMINI.md").read_text(encoding="utf-8")
    assert "obsidian-vault/" not in agents
    assert "obsidian-vault/" not in claude
    assert "obsidian-vault/" not in gemini
    assert ".agent-context/generated/" in agents
    assert "OBSIDIAN_VAULT_PATH" in agents
    assert "--add-dir" in (ROOT / "agents" / "tools" / "launch-claude.ps1").read_text(encoding="utf-8")
    assert ":ro" in (ROOT / "docs" / "runbooks" / "agent-context.md").read_text(encoding="utf-8")


def test_root_guide_uses_repository_task_folders_for_approved_work() -> None:
    agents = (ROOT / "AGENTS.md").read_text(encoding="utf-8")

    assert "Save approved implementation tasks under `docs/tasks/YYYY-MM-DD-<slug>/`" in agents
    assert "Save approved task specifications under `docs/specs/`" not in agents
