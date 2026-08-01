from __future__ import annotations

import json
import os
import re
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

SUBMODULE_ROOTS = tuple(
    ROOT / 'agents' / 'skills' / name
    for name in (
        'agent-skills',
        'browser-use',
        'caveman',
        'impeccable',
        'obsidian-skills',
        'superpowers',
        'taste-skill',
        'ui-ux-pro-max-skill',
    )
)

SKIP_SCAN_DIRECTORY_NAMES = frozenset(
    {
        '.git',
        'bin',
        'node_modules',
        'obj',
        'dist',
        'test-results',
        'playwright-report',
    }
)


def repository_files() -> list[Path]:
    files = []
    for current, directories, filenames in os.walk(ROOT):
        current_path = Path(current)
        directories[:] = [
            name
            for name in directories
            if name not in SKIP_SCAN_DIRECTORY_NAMES
        ]
        if any(current_path == submodule or submodule in current_path.parents for submodule in SUBMODULE_ROOTS):
            directories[:] = []
            continue
        files.extend(current_path / name for name in filenames)
    return files


def test_forbidden_exact_paths_are_absent() -> None:
    present = [str(path) for path in (ROOT / item for item in FORBIDDEN_EXACT_PATHS) if path.exists()]
    assert not present, present


def test_forbidden_directories_and_suffixes_are_absent() -> None:
    paths = repository_files()
    forbidden_directories = []
    for current, directories, _ in os.walk(ROOT):
        current_path = Path(current)
        forbidden_directories.extend(
            str(current_path / name)
            for name in directories
            if name in FORBIDDEN_DIRECTORY_NAMES
        )
        directories[:] = [
            name
            for name in directories
            if name not in SKIP_SCAN_DIRECTORY_NAMES
        ]
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
    assert re.search(r'(?m)^\s+branches:\s*\[main\]\s*$', text)
    assert 'pull_request_target' not in text
    assert '${{ secrets.' not in text
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
        'shadcn@4.16.1',
        '@monotool/context7-mcp@1.0.6',
    ):
        assert package in mcp_text
    assert not (ROOT / '.agent-context' / 'generated').exists()
