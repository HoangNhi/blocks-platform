from __future__ import annotations

import subprocess
import textwrap
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SYNC = ROOT / "agents" / "tools" / "skills" / "sync-agent-skills.ps1"
CHECK = ROOT / "agents" / "tools" / "skills" / "check-agent-skills.ps1"
CI = ROOT / ".github" / "workflows" / "ci.yml"


def run_script(script: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(script),
            *args,
        ],
        capture_output=True,
        text=True,
        check=False,
    )


def seed_repo(repo_root: Path) -> Path:
    source = repo_root / "agents" / "skills" / "demo" / "skills" / "alpha"
    source.mkdir(parents=True)
    (source / "SKILL.md").write_text(
        "---\nname: alpha\ndescription: demo\n---\n\n# Alpha\n",
        encoding="utf-8",
    )
    (repo_root / "agents" / "skills-manifest.yaml").write_text(
        textwrap.dedent(
            """\
            version: 1
            entries:
              - source_repo: demo
                source_skill_path: skills/alpha
                publish_mode: standalone
                target_name: alpha
                targets: codex,agy,claude,hermes
                status: active
            """
        ),
        encoding="utf-8",
    )
    return source


def test_manifest_owns_caveman_uiux_and_hermes_targets() -> None:
    manifest = (ROOT / "agents" / "skills-manifest.yaml").read_text(encoding="utf-8")

    assert "source_repo: caveman" in manifest
    assert "target_name: ui-ux-pro-max" in manifest
    assert "targets: codex,agy,claude,hermes" in manifest


def test_gitmodules_maps_every_vendor_gitlink() -> None:
    modules = (ROOT / ".gitmodules").read_text(encoding="utf-8")
    expected_paths = {
        "agents/skills/agent-skills",
        "agents/skills/browser-use",
        "agents/skills/caveman",
        "agents/skills/impeccable",
        "agents/skills/obsidian-skills",
        "agents/skills/superpowers",
        "agents/skills/taste-skill",
        "agents/skills/ui-ux-pro-max-skill",
    }

    for path in expected_paths:
        assert f"path = {path}" in modules

    tracked = subprocess.run(
        ["git", "ls-files", "-s", *sorted(expected_paths)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout.splitlines()
    tracked_modes = {line.split()[3]: line.split()[0] for line in tracked}
    assert tracked_modes == {path: "160000" for path in expected_paths}


def test_sync_publishes_marked_catalogs_and_detects_drift(tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    hermes_root = tmp_path / "hermes-skills"
    seed_repo(repo_root)

    result = run_script(
        SYNC,
        "-RepoRoot",
        str(repo_root),
        "-HermesSkillsRoot",
        str(hermes_root),
    )

    assert result.returncode == 0, result.stderr
    for root in (
        repo_root / ".agents" / "skills",
        repo_root / ".claude" / "skills",
        hermes_root,
    ):
        assert (root / "alpha" / "SKILL.md").exists()
        assert (root / ".blocks-agent-skills.generated.json").exists()

    (repo_root / ".agents" / "skills" / "alpha" / "SKILL.md").write_text(
        "drift\n",
        encoding="utf-8",
    )
    drift = run_script(
        SYNC,
        "-RepoRoot",
        str(repo_root),
        "-HermesSkillsRoot",
        str(hermes_root),
        "-Check",
    )

    assert drift.returncode != 0
    assert "generated-skill-drift" in drift.stderr


def test_verification_command_accepts_clean_generated_catalog(tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    hermes_root = tmp_path / "hermes-skills"
    seed_repo(repo_root)
    sync = run_script(
        SYNC,
        "-RepoRoot",
        str(repo_root),
        "-HermesSkillsRoot",
        str(hermes_root),
    )
    assert sync.returncode == 0, sync.stderr

    check = run_script(
        CHECK,
        "-RepoRoot",
        str(repo_root),
        "-HermesSkillsRoot",
        str(hermes_root),
    )

    assert check.returncode == 0, check.stderr
    assert "verification-complete" in check.stdout


def test_ci_verifies_generated_agent_catalogs() -> None:
    workflow = CI.read_text(encoding="utf-8")
    assert "verify-agent-assets:" in workflow
    assert "sync-agent-skills.ps1" in workflow
    assert "check-agent-skills.ps1" in workflow
    assert "submodules: recursive" in workflow
