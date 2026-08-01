from __future__ import annotations

import json
import subprocess
import tempfile
import textwrap
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CHECK = ROOT / "agents" / "tools" / "skills" / "check-agent-skills.ps1"
TMP_ROOT = ROOT / ".tmp" / "agent-skills-tests"


def make_temp_dir() -> Path:
    TMP_ROOT.mkdir(parents=True, exist_ok=True)
    return Path(tempfile.mkdtemp(prefix="agent-skills-", dir=TMP_ROOT))


def run_check(repo_root: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(CHECK),
            "-RepoRoot",
            str(repo_root),
            "-Json",
        ],
        capture_output=True,
        text=True,
        check=False,
    )


def test_check_classifies_standalone_family_and_patch_cases() -> None:
    temp_root = make_temp_dir()
    repo_root = temp_root / "repo"
    skills_root = repo_root / "agents" / "skills"
    (skills_root / "solo" / "skills" / "alpha" / "references").mkdir(parents=True)
    (skills_root / "family" / "skills" / "beta").mkdir(parents=True)
    (skills_root / "patched" / "plugin" / "skills" / "gamma").mkdir(parents=True)
    (skills_root / "solo" / "skills" / "alpha" / "SKILL.md").write_text(
        "---\nname: alpha\ndescription: demo\n---\n\nSee [ref](references/guide.md)\n",
        encoding="utf-8",
    )
    (skills_root / "solo" / "skills" / "alpha" / "references" / "guide.md").write_text("ok\n", encoding="utf-8")
    (skills_root / "family" / "skills" / "beta" / "SKILL.md").write_text(
        "---\nname: beta\ndescription: demo\n---\n\nSee [sibling](../gamma/readme.md)\n",
        encoding="utf-8",
    )
    (skills_root / "patched" / "plugin" / "skills" / "gamma" / "SKILL.md").write_text(
        "---\nname: gamma\ndescription: demo\n---\n\nnode .claude/skills/gamma/scripts/x.mjs\n",
        encoding="utf-8",
    )
    (repo_root / "agents").mkdir(parents=True, exist_ok=True)
    (repo_root / "agents" / "skills-manifest.yaml").write_text(
        textwrap.dedent(
            """\
            version: 1
            entries:
              - source_repo: solo
                source_skill_path: skills/alpha
                publish_mode: standalone
                target_name: alpha
                targets: codex,agy,claude
                status: active
              - source_repo: family
                source_skill_path: skills/beta
                publish_mode: family
                family_id: family-demo
                target_name: beta
                targets: codex,agy,claude
                status: active
              - source_repo: patched
                source_skill_path: plugin/skills/gamma
                publish_mode: patched
                target_name: gamma
                targets: codex,agy,claude
                status: experimental
            """
        ),
        encoding="utf-8",
    )

    result = run_check(repo_root)
    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    by_name = {entry["target_name"]: entry["classification"] for entry in payload["entries"]}
    assert by_name["alpha"] == "standalone-ready"
    assert by_name["beta"] == "family-required"
    assert by_name["gamma"] == "patch-required"


def test_check_fails_on_duplicate_target_names() -> None:
    temp_root = make_temp_dir()
    repo_root = temp_root / "repo"
    (repo_root / "agents").mkdir(parents=True, exist_ok=True)
    (repo_root / "agents" / "skills-manifest.yaml").write_text(
        textwrap.dedent(
            """\
            version: 1
            entries:
              - source_repo: repo-a
                source_skill_path: skills/one
                publish_mode: standalone
                target_name: shared-name
                targets: codex,agy,claude
                status: active
              - source_repo: repo-b
                source_skill_path: skills/two
                publish_mode: standalone
                target_name: shared-name
                targets: codex,agy,claude
                status: active
            """
        ),
        encoding="utf-8",
    )

    result = run_check(repo_root)
    assert result.returncode != 0
    assert "duplicate-target-name" in result.stderr
