from __future__ import annotations

import json
import subprocess
import tempfile
import textwrap
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
COMMON = ROOT / "agents" / "tools" / "skills" / "agent-skills.common.ps1"
TMP_ROOT = ROOT / ".tmp" / "agent-skills-tests"


def run_pwsh(script: str, cwd: Path | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ],
        cwd=str(cwd or ROOT),
        capture_output=True,
        text=True,
        check=False,
    )


def make_temp_dir() -> Path:
    TMP_ROOT.mkdir(parents=True, exist_ok=True)
    return Path(tempfile.mkdtemp(prefix="agent-skills-", dir=TMP_ROOT))


def test_read_agent_skills_manifest_parses_flat_entries() -> None:
    temp_root = make_temp_dir()
    manifest = temp_root / "skills-manifest.yaml"
    manifest.write_text(
        textwrap.dedent(
            """\
            version: 1
            entries:
              - source_repo: repo-a
                source_skill_path: skills/alpha
                publish_mode: standalone
                target_name: alpha
                targets: codex,agy,claude
                status: active
            """
        ),
        encoding="utf-8",
    )

    result = run_pwsh(
        f"""
        . "{COMMON}"
        $entries = Read-AgentSkillsManifest -ManifestPath "{manifest}"
        $entries | ConvertTo-Json -Depth 5
        """
    )

    assert result.returncode == 0, result.stderr
    payload = json.loads(result.stdout)
    if isinstance(payload, dict):
        payload = [payload]
    assert payload[0]["source_repo"] == "repo-a"
    assert payload[0]["targets"] == ["codex", "agy", "claude"]


def test_get_agent_skill_source_root_joins_repo_and_skill_path() -> None:
    temp_root = make_temp_dir()
    repo_root = temp_root / "repo"
    (repo_root / "agents" / "skills" / "repo-a" / "skills" / "alpha").mkdir(parents=True)

    result = run_pwsh(
        f"""
        . "{COMMON}"
        $entry = [pscustomobject]@{{
            source_repo = "repo-a"
            source_skill_path = "skills/alpha"
        }}
        Get-AgentSkillSourceRoot -RepoRoot "{repo_root}" -Entry $entry
        """
    )

    assert result.returncode == 0, result.stderr
    assert Path(result.stdout.strip()) == repo_root / "agents" / "skills" / "repo-a" / "skills" / "alpha"


def test_set_agent_skill_name_in_file_rewrites_frontmatter_name() -> None:
    temp_root = make_temp_dir()
    skill = temp_root / "SKILL.md"
    skill.write_text(
        "---\nname: old-name\ndescription: demo\n---\n\n# Demo\n",
        encoding="utf-8",
    )

    result = run_pwsh(
        f'''
        . "{COMMON}"
        Set-AgentSkillNameInFile -SkillMarkdownPath "{skill}" -TargetName "new-name"
        Get-Content -LiteralPath "{skill}" -Raw
        '''
    )

    assert result.returncode == 0, result.stderr
    assert "name: new-name" in result.stdout
