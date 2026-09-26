from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
NEW_TASK = ROOT / "agents/tools/new-task.ps1"
TASK_PATH = "agent-workflow/tasks/2026-09-26-example"


def run_new_task(repo_root: Path, *args: str, vault: Path | None = None) -> subprocess.CompletedProcess[str]:
    environment = os.environ.copy()
    environment.pop("OBSIDIAN_VAULT_PATH", None)
    if vault is not None:
        environment["OBSIDIAN_VAULT_PATH"] = str(vault)
    return subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(NEW_TASK),
         "-RepoRoot", str(repo_root), "-TaskPath", TASK_PATH, *args],
        capture_output=True, text=True, check=False, env=environment,
    )


def test_task_scaffold_uses_only_exact_vault_path(tmp_path: Path) -> None:
    repo_root, vault = tmp_path / "repo", tmp_path / "vault"
    repo_root.mkdir()
    vault.mkdir()
    result = run_new_task(repo_root, vault=vault)
    task = vault / TASK_PATH
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == str(task.resolve())
    assert {file.name for file in task.iterdir()} == {"spec.md", "plan.md", "execution.md", "review.md"}
    assert "status: not_started" in (task / "execution.md").read_text(encoding="utf-8")
    assert all(not file.read_bytes().startswith(b"\xef\xbb\xbf") for file in task.iterdir())
    assert not list(repo_root.iterdir())
    assert run_new_task(repo_root, vault=vault).returncode != 0


def test_missing_vault_never_falls_back_to_repo(tmp_path: Path) -> None:
    result = run_new_task(tmp_path / "repo")
    assert result.returncode != 0
    assert "OBSIDIAN_VAULT_PATH" in result.stderr
    assert not (tmp_path / "repo").exists()


@pytest.mark.parametrize("relative", ["../outside", "safe/../../outside", ".", "folder/../task", "folder./task", "folder /task", "folder/task:stream"])
def test_invalid_task_paths_are_rejected(tmp_path: Path, relative: str) -> None:
    vault = tmp_path / "vault"
    vault.mkdir()
    environment = os.environ.copy()
    environment["OBSIDIAN_VAULT_PATH"] = str(vault)
    result = subprocess.run(
        ["powershell", "-NoProfile", "-File", str(NEW_TASK), "-RepoRoot", str(tmp_path / "repo"),
         "-TaskPath", relative], capture_output=True, text=True, check=False, env=environment,
    )
    assert result.returncode != 0
    assert not list(vault.iterdir())


def test_absolute_task_path_is_rejected(tmp_path: Path) -> None:
    vault = tmp_path / "vault"
    vault.mkdir()
    result = subprocess.run(
        ["powershell", "-NoProfile", "-File", str(NEW_TASK), "-RepoRoot", str(tmp_path / "repo"),
         "-VaultPath", str(vault), "-TaskPath", str(tmp_path / "outside")],
        capture_output=True, text=True, check=False,
    )
    assert result.returncode != 0
    assert not (tmp_path / "outside").exists()


def test_vault_inside_repo_is_rejected(tmp_path: Path) -> None:
    vault = tmp_path / "repo" / "vault"
    vault.mkdir(parents=True)
    result = run_new_task(tmp_path / "repo", vault=vault)
    assert result.returncode != 0
    assert not list(vault.iterdir())


def test_existing_task_is_not_modified(tmp_path: Path) -> None:
    vault = tmp_path / "vault"
    task = vault / TASK_PATH
    task.mkdir(parents=True)
    record = task / "execution.md"
    record.write_text("existing owner record", encoding="utf-8")
    result = run_new_task(tmp_path / "repo", vault=vault)
    assert result.returncode != 0
    assert record.read_text(encoding="utf-8") == "existing owner record"
    assert list(task.iterdir()) == [record]


def test_junction_ancestor_cannot_escape_vault(tmp_path: Path) -> None:
    vault, outside = tmp_path / "vault", tmp_path / "outside"
    vault.mkdir()
    outside.mkdir()
    junction = vault / "agent-workflow"
    created = subprocess.run(
        ["powershell", "-NoProfile", "-Command",
         "New-Item -ItemType Junction -Path $env:TEST_JUNCTION -Target $env:TEST_TARGET | Out-Null"],
        capture_output=True, text=True, check=False,
        env={**os.environ, "TEST_JUNCTION": str(junction), "TEST_TARGET": str(outside)},
    )
    assert created.returncode == 0, created.stderr
    try:
        result = run_new_task(tmp_path / "repo", vault=vault)
        assert result.returncode != 0
        assert not list(outside.iterdir())
    finally:
        junction.rmdir()
