from __future__ import annotations

import subprocess
import tempfile
import textwrap
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
SYNC = ROOT / "agents" / "tools" / "skills" / "sync-agent-skills.ps1"
TMP_ROOT = ROOT / ".tmp" / "agent-skills-tests"


def make_temp_dir() -> Path:
    TMP_ROOT.mkdir(parents=True, exist_ok=True)
    return Path(tempfile.mkdtemp(prefix="agent-skills-", dir=TMP_ROOT))


def run_sync(repo_root: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            "powershell",
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            str(SYNC),
            "-RepoRoot",
            str(repo_root),
        ],
        capture_output=True,
        text=True,
        check=False,
    )


def test_sync_generates_agents_and_claude_outputs() -> None:
    temp_root = make_temp_dir()
    repo_root = temp_root / "repo"
    skill_root = repo_root / "agents" / "skills" / "solo" / "skills" / "alpha"
    (skill_root / "references").mkdir(parents=True)
    (skill_root / "SKILL.md").write_text(
        "---\nname: alpha\ndescription: demo\n---\n\nSee [guide](references/guide.md)\n",
        encoding="utf-8",
    )
    (skill_root / "references" / "guide.md").write_text("ok\n", encoding="utf-8")
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
            """
        ),
        encoding="utf-8",
    )

    result = run_sync(repo_root)
    assert result.returncode == 0, result.stderr
    agents_skill = repo_root / ".agents" / "skills" / "alpha" / "SKILL.md"
    claude_skill = repo_root / ".claude" / "skills" / "alpha" / "SKILL.md"
    assert agents_skill.exists()
    assert claude_skill.exists()
    assert (repo_root / ".agents" / "skills" / "alpha" / "references" / "guide.md").exists()
    assert not agents_skill.read_bytes().startswith(b"\xef\xbb\xbf")
    assert not claude_skill.read_bytes().startswith(b"\xef\xbb\xbf")


def test_sync_preserves_family_sibling_layout() -> None:
    temp_root = make_temp_dir()
    repo_root = temp_root / "repo"
    alpha_root = repo_root / "agents" / "skills" / "family" / "skills" / "alpha"
    beta_root = repo_root / "agents" / "skills" / "family" / "skills" / "beta"
    alpha_root.mkdir(parents=True)
    beta_root.mkdir(parents=True)
    (alpha_root / "SKILL.md").write_text(
        "---\nname: alpha\ndescription: demo\n---\n\nSee [beta](../beta/SKILL.md)\n",
        encoding="utf-8",
    )
    (beta_root / "SKILL.md").write_text(
        "---\nname: beta\ndescription: demo\n---\n\n# Beta\n",
        encoding="utf-8",
    )
    (repo_root / "agents" / "skills-manifest.yaml").write_text(
        textwrap.dedent(
            """\
            version: 1
            entries:
              - source_repo: family
                source_skill_path: skills/alpha
                publish_mode: family
                family_id: family-demo
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
            """
        ),
        encoding="utf-8",
    )

    result = run_sync(repo_root)
    assert result.returncode == 0, result.stderr
    published = (repo_root / ".agents" / "skills" / "alpha" / "SKILL.md").read_text(encoding="utf-8")
    assert "../beta/SKILL.md" in published
    assert (repo_root / ".agents" / "skills" / "beta" / "SKILL.md").exists()


def test_sync_rewrites_impeccable_runtime_root_for_agents_output() -> None:
    temp_root = make_temp_dir()
    repo_root = temp_root / "repo"
    skill_root = repo_root / "agents" / "skills" / "impeccable" / "plugin" / "skills" / "impeccable" / "scripts"
    skill_root.mkdir(parents=True)
    markdown = skill_root.parent / "SKILL.md"
    markdown.write_text(
        "---\nname: impeccable\ndescription: demo\n---\n\nnode .claude/skills/impeccable/scripts/context.mjs\n",
        encoding="utf-8",
    )
    (skill_root / "context.mjs").write_text("console.log('ok')\n", encoding="utf-8")
    (repo_root / "agents" / "skills-manifest.yaml").write_text(
        textwrap.dedent(
            """\
            version: 1
            entries:
              - source_repo: impeccable
                source_skill_path: plugin/skills/impeccable
                publish_mode: patched
                target_name: impeccable
                targets: codex,agy,claude
                status: experimental
                rewrite_rules: runtime-root-prefix
            """
        ),
        encoding="utf-8",
    )

    result = run_sync(repo_root)
    assert result.returncode == 0, result.stderr
    agents_skill = repo_root / ".agents" / "skills" / "impeccable" / "SKILL.md"
    claude_skill = repo_root / ".claude" / "skills" / "impeccable" / "SKILL.md"
    agents_text = agents_skill.read_text(encoding="utf-8")
    claude_text = claude_skill.read_text(encoding="utf-8")
    assert "node .agents/skills/impeccable/scripts/context.mjs" in agents_text
    assert "node .claude/skills/impeccable/scripts/context.mjs" in claude_text
    assert not agents_skill.read_bytes().startswith(b"\xef\xbb\xbf")
    assert not claude_skill.read_bytes().startswith(b"\xef\xbb\xbf")
