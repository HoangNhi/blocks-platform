from __future__ import annotations

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
NEW_TASK = ROOT / "agents" / "tools" / "new-task.ps1"

def run_new_task(repo_root: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(NEW_TASK),
            "-RepoRoot", str(repo_root), "-Date", "2026-07-28", *args,
        ],
        capture_output=True,
        text=True,
        check=False,
    )

def test_approved_mode_scaffolds_repository_task(tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    result = run_new_task(repo_root, "-Slug", "context-cutover")
    task = repo_root / "docs" / "tasks" / "2026-07-28-context-cutover"
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == str(task.resolve())
    assert {path.name for path in task.iterdir()} == {
        "spec.md", "plan.md", "execution.md", "review.md"
    }
    assert "status: not_started" in (task / "execution.md").read_text(encoding="utf-8")
    assert all(not path.read_bytes().startswith(b"\xef\xbb\xbf") for path in task.iterdir())

def test_draft_mode_requires_existing_vault(tmp_path: Path) -> None:
    result = run_new_task(tmp_path / "repo", "-Mode", "draft", "-Scope", "agent-workflow", "-Slug", "context")
    assert result.returncode != 0
    assert "OBSIDIAN_VAULT_PATH" in result.stderr
