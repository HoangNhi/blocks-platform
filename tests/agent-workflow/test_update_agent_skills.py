from __future__ import annotations

import subprocess
import tempfile
import textwrap
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
UPDATE = ROOT / "agents" / "tools" / "skills" / "update-agent-skills.ps1"
TMP_ROOT = ROOT / ".tmp" / "agent-skills-tests"


def make_temp_dir() -> Path:
    TMP_ROOT.mkdir(parents=True, exist_ok=True)
    return Path(tempfile.mkdtemp(prefix="agent-skills-", dir=TMP_ROOT))


def run(command: list[str], cwd: Path) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        command,
        cwd=str(cwd),
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return result


def write_manifest(repo_root: Path, repo_name: str) -> None:
    agents_dir = repo_root / "agents"
    agents_dir.mkdir(parents=True, exist_ok=True)
    (agents_dir / "skills-manifest.yaml").write_text(
        textwrap.dedent(
            f"""\
            version: 1
            entries:
              - source_repo: {repo_name}
                source_skill_path: skills/alpha
                publish_mode: standalone
                target_name: alpha
                targets: codex,agy,claude
                status: active
            """
        ),
        encoding="utf-8",
    )


def seed_repo(seed: Path, remote: Path) -> None:
    run(["git", "init", str(seed)], ROOT)
    run(["git", "-C", str(seed), "config", "user.email", "codex@example.com"], ROOT)
    run(["git", "-C", str(seed), "config", "user.name", "Codex"], ROOT)
    (seed / "README.md").write_text("v1\n", encoding="utf-8")
    run(["git", "-C", str(seed), "add", "README.md"], ROOT)
    run(["git", "-C", str(seed), "commit", "-m", "seed"], ROOT)
    run(["git", "-C", str(seed), "remote", "add", "origin", str(remote)], ROOT)
    run(["git", "-C", str(seed), "push", "-u", "origin", "HEAD"], ROOT)


def test_update_script_pulls_clean_repo() -> None:
    temp_root = make_temp_dir()
    repo_root = temp_root / "repo"
    source_root = repo_root / "agents" / "skills" / "demo-repo"
    remote = temp_root / "remote.git"
    seed = temp_root / "seed"
    upstream = temp_root / "upstream"

    run(["git", "init", "--bare", str(remote)], ROOT)
    seed_repo(seed, remote)
    run(["git", "clone", str(remote), str(source_root)], ROOT)
    run(["git", "clone", str(remote), str(upstream)], ROOT)
    run(["git", "-C", str(upstream), "config", "user.email", "codex@example.com"], ROOT)
    run(["git", "-C", str(upstream), "config", "user.name", "Codex"], ROOT)
    (upstream / "README.md").write_text("v2\n", encoding="utf-8")
    run(["git", "-C", str(upstream), "commit", "-am", "update"], ROOT)
    run(["git", "-C", str(upstream), "push"], ROOT)
    write_manifest(repo_root, "demo-repo")

    result = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(UPDATE),
            "-RepoRoot",
            str(repo_root),
            "-Json",
        ],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert "updated" in result.stdout
    assert "v2" in (source_root / "README.md").read_text(encoding="utf-8")


def test_update_script_skips_dirty_repo() -> None:
    temp_root = make_temp_dir()
    repo_root = temp_root / "repo"
    source_root = repo_root / "agents" / "skills" / "demo-repo"
    remote = temp_root / "remote.git"
    seed = temp_root / "seed"

    run(["git", "init", "--bare", str(remote)], ROOT)
    seed_repo(seed, remote)
    run(["git", "clone", str(remote), str(source_root)], ROOT)
    write_manifest(repo_root, "demo-repo")

    (source_root / "README.md").write_text("dirty\n", encoding="utf-8")

    result = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(UPDATE),
            "-RepoRoot",
            str(repo_root),
            "-Json",
        ],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert "update-skipped" in result.stdout


def test_update_script_skips_detached_head_repo() -> None:
    temp_root = make_temp_dir()
    repo_root = temp_root / "repo"
    source_root = repo_root / "agents" / "skills" / "demo-repo"
    remote = temp_root / "remote.git"
    seed = temp_root / "seed"

    run(["git", "init", "--bare", str(remote)], ROOT)
    seed_repo(seed, remote)
    run(["git", "clone", str(remote), str(source_root)], ROOT)
    head_commit = run(["git", "-C", str(source_root), "rev-parse", "HEAD"], ROOT).stdout.strip()
    run(["git", "-C", str(source_root), "checkout", head_commit], ROOT)
    write_manifest(repo_root, "demo-repo")

    result = subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(UPDATE),
            "-RepoRoot",
            str(repo_root),
            "-Json",
        ],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert "detached-head" in result.stdout
