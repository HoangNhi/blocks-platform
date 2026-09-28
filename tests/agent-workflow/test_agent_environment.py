from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
CHECK_ENV = ROOT / "agents/tools/check-agent-environment.ps1"
POWERSHELL = shutil.which("powershell") or shutil.which("pwsh")
assert POWERSHELL, "PowerShell is required for agent workflow tests"


def run_check_env(*args: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    environment = os.environ.copy() if env is None else env.copy()
    return subprocess.run(
        [POWERSHELL, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(CHECK_ENV), *args],
        capture_output=True, text=True, check=False, env=environment,
    )


def test_valid_context_exits_zero(tmp_path: Path) -> None:
    vault = tmp_path / "vault"
    task_dir = vault / "agent-workflow" / "tasks" / "2026-09-27-valid"
    task_dir.mkdir(parents=True)
    for name in ("spec.md", "plan.md", "execution.md"):
        (task_dir / name).write_text(f"# {name}\n", encoding="utf-8")

    user_vault = subprocess.run(
        [POWERSHELL, "-NoProfile", "-Command", "[Environment]::GetEnvironmentVariable('OBSIDIAN_VAULT_PATH', 'User')"],
        capture_output=True, text=True, check=False,
    ).stdout.strip()

    env = os.environ.copy()
    env["OBSIDIAN_VAULT_PATH"] = str(vault)

    # If User env is set, match it or skip StaleProcess expectation
    result = run_check_env("-TaskPath", "agent-workflow/tasks/2026-09-27-valid", "-Json", env=env)
    assert result.returncode == 0, result.stderr
    data = json.loads(result.stdout)
    assert data["TaskState"] == "Ready"
    assert "git" in data["Tools"]
    assert "rg" in data["Tools"]
    assert "gh" in data["Tools"]


def test_missing_task_path_exits_nonzero(tmp_path: Path) -> None:
    vault = tmp_path / "vault"
    vault.mkdir()
    env = os.environ.copy()
    env["OBSIDIAN_VAULT_PATH"] = str(vault)
    result = run_check_env("-TaskPath", "agent-workflow/nonexistent", "-RequireTaskContext", "-Json", env=env)
    assert result.returncode != 0
    data = json.loads(result.stdout)
    assert data["TaskState"] == "MissingTaskPath"


def test_task_traversal_is_rejected(tmp_path: Path) -> None:
    vault = tmp_path / "vault"
    vault.mkdir()
    env = os.environ.copy()
    env["OBSIDIAN_VAULT_PATH"] = str(vault)
    result = run_check_env("-TaskPath", "agent-workflow/../../outside", "-RequireTaskContext", "-Json", env=env)
    assert result.returncode != 0
    data = json.loads(result.stdout)
    assert data["TaskState"] == "MissingTaskPath"


def test_missing_artifacts_is_rejected(tmp_path: Path) -> None:
    vault = tmp_path / "vault"
    task_dir = vault / "agent-workflow" / "tasks" / "2026-09-27-incomplete"
    task_dir.mkdir(parents=True)
    (task_dir / "spec.md").write_text("# Spec\n", encoding="utf-8")

    env = os.environ.copy()
    env["OBSIDIAN_VAULT_PATH"] = str(vault)
    result = run_check_env("-TaskPath", "agent-workflow/tasks/2026-09-27-incomplete", "-RequireTaskContext", "-Json", env=env)
    assert result.returncode != 0
    data = json.loads(result.stdout)
    assert data["TaskState"] == "MissingArtifacts"


def test_python_stub_exit_1_is_not_runnable(tmp_path: Path) -> None:
    stub_dir = tmp_path / "stubs"
    stub_dir.mkdir()
    stub = stub_dir / ("python.cmd" if os.name == "nt" else "python")
    stub.write_text("@echo off\nexit /b 1\n" if os.name == "nt" else "#!/bin/sh\nexit 1\n", encoding="ascii")
    stub.chmod(0o755)

    env = os.environ.copy()
    env["PATH"] = f"{stub_dir}{os.pathsep}{env.get('PATH', '')}"
    result = run_check_env("-Json", env=env)
    assert result.returncode == 0, result.stderr
    data = json.loads(result.stdout)
    assert data["Tools"]["python"]["State"] != "Runnable"


def test_optional_gh_missing_exits_zero_without_require_task(tmp_path: Path) -> None:
    clean_dir = tmp_path / "clean_bin"
    clean_dir.mkdir()
    env = os.environ.copy()
    env["PATH"] = str(clean_dir)
    result = run_check_env("-Json", env=env)
    assert result.returncode == 0, result.stderr
    data = json.loads(result.stdout)
    assert data["Tools"]["gh"]["State"] == "Missing"


def test_vault_state_detection() -> None:
    user_vault = subprocess.run(
        [POWERSHELL, "-NoProfile", "-Command", "[Environment]::GetEnvironmentVariable('OBSIDIAN_VAULT_PATH', 'User')"],
        capture_output=True, text=True, check=False,
    ).stdout.strip()

    if user_vault:
        env = os.environ.copy()
        env["OBSIDIAN_VAULT_PATH"] = "D:\\Different\\Path\\DoesNotMatchUser"
        result = run_check_env("-Json", env=env)
        assert result.returncode == 0, result.stderr
        data = json.loads(result.stdout)
        assert data["VaultState"] == "StaleProcess"
    else:
        env = os.environ.copy()
        env.pop("OBSIDIAN_VAULT_PATH", None)
        result = run_check_env("-Json", env=env)
        assert result.returncode == 0, result.stderr
        data = json.loads(result.stdout)
        assert data["VaultState"] == "Missing"
