from __future__ import annotations

import json
import re
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]

FORBIDDEN_EXACT_PATHS = tuple(
    Path(value)
    for value in (
        '.vs',
        '.agents',
        '.claude',
        '.codebuddy',
        '.codex',
        '.continue',
        '.cursor',
        '.kiro',
        '.opencode',
        '.qoder',
        '.roo',
        '.trae',
        '.windsurf',
        '.hermes',
        '.mcp.json',
        '.agent/bridge',
        '.agent-context/generated',
        'apps/web/Blocks.Web/smoke-artifacts',
        'docs/archive',
        'docs/audits/repository-surface',
        'docs/tasks/2026-07-31-branch-aware-heroku-file-service-cicd',
    )
)

FORBIDDEN_DIRECTORY_NAMES = frozenset({'obj'})
FORBIDDEN_FILE_SUFFIXES = ('.csproj.user',)
_WINDOWS_SEPARATOR = chr(92)
FORBIDDEN_CONTENT_PATTERNS = (
    'D:' + _WINDOWS_SEPARATOR + 'Workspace' + _WINDOWS_SEPARATOR + 'Personal' + _WINDOWS_SEPARATOR + 'Blocks',
    'D:' + _WINDOWS_SEPARATOR + 'AgentData' + _WINDOWS_SEPARATOR + 'Blocks',
    'D:' + _WINDOWS_SEPARATOR + 'Knowledge' + _WINDOWS_SEPARATOR + 'Blocks',
    '/home' + '/hermes/',
    '/opt' + '/blocks',
    '\\.herokuapp' + '\\.com',
)

def repository_files() -> list[Path]:
    result = subprocess.run(
        ['git', 'ls-files', '--cached', '-z'],
        capture_output=True,
        check=True,
        cwd=ROOT,
        text=True,
    )
    return [ROOT / Path(value) for value in result.stdout.split('\0') if value]


def has_tracked_path(path: Path, files: list[Path]) -> bool:
    return any(file == path or path in file.parents for file in files)


def test_repository_files_exclude_untracked_workspace_files() -> None:
    with tempfile.NamedTemporaryFile(dir=ROOT, prefix='.publication-boundary-', delete=False) as handle:
        probe = Path(handle.name)

    try:
        assert probe not in repository_files()
    finally:
        probe.unlink()


def test_forbidden_exact_paths_are_absent() -> None:
    files = repository_files()
    present = [
        str(path)
        for item in FORBIDDEN_EXACT_PATHS
        if has_tracked_path(path := ROOT / item, files)
    ]
    assert not present, present


def test_forbidden_directories_and_suffixes_are_absent() -> None:
    paths = repository_files()
    forbidden_directories = sorted(
        {
            str(parent)
            for path in paths
            for parent in path.parents
            if parent.name in FORBIDDEN_DIRECTORY_NAMES
        }
    )
    forbidden_suffixes = [
        str(path)
        for path in paths
        if path.name.endswith(FORBIDDEN_FILE_SUFFIXES)
    ]
    assert not forbidden_directories, forbidden_directories
    assert not forbidden_suffixes, forbidden_suffixes


def test_private_content_patterns_are_absent() -> None:
    findings = []
    for path in repository_files():
        try:
            text = path.read_text(encoding='utf-8')
        except (UnicodeDecodeError, OSError):
            continue
        for pattern in FORBIDDEN_CONTENT_PATTERNS:
            if re.search(re.escape(pattern), text, flags=re.IGNORECASE):
                findings.append(f'{path.relative_to(ROOT)}: {pattern}')
    assert not findings, findings


def test_public_ci_is_main_only_fork_safe_and_pinned() -> None:
    workflow = ROOT / '.github' / 'workflows' / 'ci.yml'
    text = workflow.read_text(encoding='utf-8')
    validation, deploy = text.split('\n  deploy-heroku:', 1)
    assert re.search(r'(?m)^\s+branches:\s*\[main\]\s*$', text)
    assert 'pull_request_target' not in text
    assert '${{ secrets.' not in validation
    assert "github.event_name == 'push' && github.ref == 'refs/heads/main'" in deploy
    assert '${{ secrets.HEROKU_API_KEY }}' in deploy
    assert re.search(r'(?m)^\s+permissions:\s*read-all\s*$', text)
    for action in re.findall(r'(?m)^\s+uses:\s*([^\s]+)', text):
        if action.startswith('./') or action.startswith('docker://'):
            continue
        assert re.search(r'@[0-9a-f]{40}$', action), action


def test_mcp_example_is_pinned_and_context_is_optional() -> None:
    mcp_path = ROOT / 'agents' / 'mcp.example.json'
    mcp_text = mcp_path.read_text(encoding='utf-8')
    json.loads(mcp_text)
    for package in (
        '@playwright/mcp@0.0.78',
        '@ytsuda/ripple@0.14.1',
        'shadcn@4.19.1',
    ):
        assert package in mcp_text
    assert '@monotool/context7-mcp' not in mcp_text
    assert not has_tracked_path(ROOT / '.agent-context' / 'generated', repository_files())
