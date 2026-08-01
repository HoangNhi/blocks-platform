from __future__ import annotations

from pathlib import Path

import pytest

from agents.tools.file_lock import exclusive_file_lock


def open_lock_file(tmp_path: Path):
    return (tmp_path / 'records.jsonl').open('a+', encoding='utf-8')


def test_file_lock_imports_and_exposes_context_manager() -> None:
    assert callable(exclusive_file_lock)


def test_file_lock_acquires_exclusive_region(tmp_path: Path) -> None:
    with open_lock_file(tmp_path) as handle:
        with exclusive_file_lock(handle):
            handle.write('locked\n')
            handle.flush()

    assert (tmp_path / 'records.jsonl').read_text(encoding='utf-8') == 'locked\n'


def test_file_lock_releases_after_exception(tmp_path: Path) -> None:
    with open_lock_file(tmp_path) as handle:
        with pytest.raises(RuntimeError, match='inside lock'):
            with exclusive_file_lock(handle):
                raise RuntimeError('inside lock')

        with exclusive_file_lock(handle):
            handle.write('after exception\n')
            handle.flush()

    assert 'after exception\n' in (tmp_path / 'records.jsonl').read_text(encoding='utf-8')


def test_file_lock_releases_on_normal_exit(tmp_path: Path) -> None:
    with open_lock_file(tmp_path) as handle:
        with exclusive_file_lock(handle):
            handle.write('first\n')
            handle.flush()

        with exclusive_file_lock(handle):
            handle.write('second\n')
            handle.flush()

    assert (tmp_path / 'records.jsonl').read_text(encoding='utf-8') == 'first\nsecond\n'
