from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WRITER = ROOT / 'agents' / 'tools' / 'skills' / 'write-agent-skills-lock.ps1'
REPOSITORIES = (
    'agent-skills',
    'browser-use',
    'caveman',
    'impeccable',
    'obsidian-skills',
    'superpowers',
    'taste-skill',
    'ui-ux-pro-max-skill',
)


def run_writer(repo_root: Path, *arguments: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            'powershell',
            '-NoProfile',
            '-ExecutionPolicy',
            'Bypass',
            '-File',
            str(WRITER),
            '-RepoRoot',
            str(repo_root),
            *arguments,
        ],
        capture_output=True,
        text=True,
        check=False,
    )


def run_git(repo_root: Path, *arguments: str) -> None:
    result = subprocess.run(
        ['git', '-C', str(repo_root), *arguments],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr


def seed_repository(repo_root: Path) -> Path:
    run_git(repo_root, 'init', '-b', 'main')
    modules = []
    repositories = {}
    skills = {}
    for index, repository in enumerate(REPOSITORIES, start=1):
        skill_path = repo_root / 'agents' / 'skills' / repository / 'skill'
        skill_path.mkdir(parents=True)
        (skill_path / 'SKILL.md').write_text(
            f'---\nname: {repository}\ndescription: test\n---\n',
            encoding='utf-8',
        )
        path = f'agents/skills/{repository}'
        commit = f'{index:040x}'
        modules.extend(
            [
                f'[submodule {chr(34)}{path}{chr(34)}]',
                f'\tpath = {path}',
                f'\turl = https://example.test/{repository}.git',
            ]
        )
        repositories[repository] = {'url': 'stale', 'commit': '0' * 40}
        skills[repository] = {
            'source': repository,
            'sourceType': 'gitlink',
            'sourceCommit': '0' * 40,
            'canonicalPath': f'{path}/skill',
            'skillFileSha256': 'stale',
        }
        run_git(repo_root, 'update-index', '--add', '--cacheinfo', f'160000,{commit},{path}')

    (repo_root / '.gitmodules').write_text('\n'.join(modules) + '\n', encoding='utf-8')
    (repo_root / 'skills-lock.json').write_text(
        json.dumps({'version': 2, 'repositories': repositories, 'skills': skills}, indent=2) + '\n',
        encoding='utf-8',
    )
    return repo_root / 'skills-lock.json'


def test_lock_writer_rewrites_checks_and_preserves_check_mode(tmp_path: Path) -> None:
    repo_root = tmp_path / 'repo'
    repo_root.mkdir()
    lock_path = seed_repository(repo_root)

    write = run_writer(repo_root)
    assert write.returncode == 0, write.stderr
    lock = json.loads(lock_path.read_text(encoding='utf-8'))
    for index, repository in enumerate(REPOSITORIES, start=1):
        expected_commit = f'{index:040x}'
        assert lock['repositories'][repository]['commit'] == expected_commit
        assert lock['repositories'][repository]['url'] == f'https://example.test/{repository}.git'
        assert lock['skills'][repository]['sourceCommit'] == expected_commit
        assert lock['skills'][repository]['skillFileSha256'] != 'stale'

    check = run_writer(repo_root, '-Check')
    assert check.returncode == 0, check.stderr
    before_drift_check = lock_path.read_bytes()

    skill_file = repo_root / 'agents' / 'skills' / 'caveman' / 'skill' / 'SKILL.md'
    skill_file.write_text('drift\n', encoding='utf-8')
    drift = run_writer(repo_root, '-Check')
    assert drift.returncode != 0
    assert 'skills-lock.json drift detected' in drift.stderr
    assert lock_path.read_bytes() == before_drift_check
