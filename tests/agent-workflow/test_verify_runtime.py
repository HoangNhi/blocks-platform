from __future__ import annotations

import http.server
import json
import os
import subprocess
import threading
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
VERIFY = ROOT / "agents/tools/verify-runtime.ps1"


class MockHttpHandler(http.server.BaseHTTPRequestHandler):
    def do_HEAD(self) -> None:
        if self.path == "/ok":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
        elif self.path == "/redirect":
            self.send_response(302)
            self.send_header("Location", "http://external-origin.example.com/target")
            self.end_headers()
        elif self.path == "/error":
            self.send_response(500)
            self.end_headers()
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format: str, *args: object) -> None:
        pass


@pytest.fixture(scope="module")
def mock_server():
    server = http.server.HTTPServer(("127.0.0.1", 0), MockHttpHandler)
    port = server.server_port
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{port}"
    server.shutdown()


def run_verify(*arguments: str, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    environment = os.environ.copy() if env is None else env.copy()
    return subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(VERIFY), *arguments],
        capture_output=True, text=True, timeout=20, check=False, env=environment,
    )


def test_docs_valid_no_network() -> None:
    result = run_verify("-Mode", "docs")
    assert result.returncode == 0, result.stderr
    assert "NOT APPLICABLE" in result.stdout


def test_docs_with_browser_requirement_is_blocked() -> None:
    result = run_verify("-Mode", "docs", "-RequireBrowserEvidence")
    assert result.returncode != 0
    assert "BLOCKED" in result.stdout


def test_missing_url_is_blocked() -> None:
    result = run_verify("-Mode", "backend")
    assert result.returncode != 0
    assert "BLOCKED" in result.stdout


def test_invalid_url_scheme_is_blocked() -> None:
    result = run_verify("-Mode", "backend", "-AppHostUrl", "ftp://localhost/path")
    assert result.returncode != 0
    assert "BLOCKED" in result.stdout


def test_backend_head200_is_liveness_only(mock_server: str) -> None:
    result = run_verify("-Mode", "backend", "-AppHostUrl", f"{mock_server}/ok", "-Route", "/api/health")
    assert result.returncode == 0, result.stderr
    assert "PASS" in result.stdout
    assert "liveness" in result.stdout.lower()


def test_backend_head500_is_blocked(mock_server: str) -> None:
    result = run_verify("-Mode", "backend", "-AppHostUrl", f"{mock_server}/error")
    assert result.returncode != 0
    assert "BLOCKED" in result.stdout


def test_backend_redirect_is_blocked(mock_server: str) -> None:
    result = run_verify("-Mode", "backend", "-AppHostUrl", f"{mock_server}/redirect")
    assert result.returncode != 0
    assert "BLOCKED" in result.stdout


def test_ui_runtime_missing_browser_evidence_is_blocked(mock_server: str) -> None:
    result = run_verify("-Mode", "ui-runtime", "-AppHostUrl", f"{mock_server}/ok")
    assert result.returncode != 0
    assert "BLOCKED" in result.stdout


def test_ui_runtime_invalid_browser_json_is_blocked(tmp_path: Path, mock_server: str) -> None:
    vault = tmp_path / "vault"
    task_dir = vault / "agent-workflow" / "tasks" / "2026-09-27-ui"
    evidence_dir = task_dir / "evidence" / "run-01"
    evidence_dir.mkdir(parents=True)
    (evidence_dir / "browser.json").write_text("{ corrupt json ", encoding="utf-8")

    env = os.environ.copy()
    env["OBSIDIAN_VAULT_PATH"] = str(vault)

    result = run_verify(
        "-Mode", "ui-runtime", "-AppHostUrl", f"{mock_server}/ok", "-Route", "/app",
        "-TaskPath", "agent-workflow/tasks/2026-09-27-ui", "-RunId", "run-01",
        env=env,
    )
    assert result.returncode != 0
    assert "BLOCKED" in result.stdout


def test_ui_runtime_mismatch_metadata_is_blocked(tmp_path: Path, mock_server: str) -> None:
    vault = tmp_path / "vault"
    task_dir = vault / "agent-workflow" / "tasks" / "2026-09-27-ui"
    evidence_dir = task_dir / "evidence" / "run-01"
    evidence_dir.mkdir(parents=True)
    report = {
        "schemaVersion": 1,
        "runId": "different-run",
        "appHostUrl": f"{mock_server}/ok",
        "route": "/app",
        "status": "PASS",
        "checks": [{"name": "render", "status": "PASS"}],
        "artifacts": ["screenshot.png"],
    }
    (evidence_dir / "browser.json").write_text(json.dumps(report), encoding="utf-8")
    (evidence_dir / "screenshot.png").write_text("fake image", encoding="utf-8")

    env = os.environ.copy()
    env["OBSIDIAN_VAULT_PATH"] = str(vault)

    result = run_verify(
        "-Mode", "ui-runtime", "-AppHostUrl", f"{mock_server}/ok", "-Route", "/app",
        "-TaskPath", "agent-workflow/tasks/2026-09-27-ui", "-RunId", "run-01",
        env=env,
    )
    assert result.returncode != 0
    assert "BLOCKED" in result.stdout


def test_ui_runtime_checks_empty_or_failed_is_blocked(tmp_path: Path, mock_server: str) -> None:
    vault = tmp_path / "vault"
    task_dir = vault / "agent-workflow" / "tasks" / "2026-09-27-ui"
    evidence_dir = task_dir / "evidence" / "run-01"
    evidence_dir.mkdir(parents=True)
    report = {
        "schemaVersion": 1,
        "runId": "run-01",
        "appHostUrl": f"{mock_server}/ok",
        "route": "/app",
        "status": "PASS",
        "checks": [{"name": "render", "status": "FAIL"}],
        "artifacts": ["screenshot.png"],
    }
    (evidence_dir / "browser.json").write_text(json.dumps(report), encoding="utf-8")
    (evidence_dir / "screenshot.png").write_text("fake image", encoding="utf-8")

    env = os.environ.copy()
    env["OBSIDIAN_VAULT_PATH"] = str(vault)

    result = run_verify(
        "-Mode", "ui-runtime", "-AppHostUrl", f"{mock_server}/ok", "-Route", "/app",
        "-TaskPath", "agent-workflow/tasks/2026-09-27-ui", "-RunId", "run-01",
        env=env,
    )
    assert result.returncode != 0
    assert "BLOCKED" in result.stdout


def test_ui_runtime_artifact_traversal_or_missing_is_blocked(tmp_path: Path, mock_server: str) -> None:
    vault = tmp_path / "vault"
    task_dir = vault / "agent-workflow" / "tasks" / "2026-09-27-ui"
    evidence_dir = task_dir / "evidence" / "run-01"
    evidence_dir.mkdir(parents=True)
    report = {
        "schemaVersion": 1,
        "runId": "run-01",
        "appHostUrl": f"{mock_server}/ok",
        "route": "/app",
        "status": "PASS",
        "checks": [{"name": "render", "status": "PASS"}],
        "artifacts": ["../../outside.png"],
    }
    (evidence_dir / "browser.json").write_text(json.dumps(report), encoding="utf-8")

    env = os.environ.copy()
    env["OBSIDIAN_VAULT_PATH"] = str(vault)

    result = run_verify(
        "-Mode", "ui-runtime", "-AppHostUrl", f"{mock_server}/ok", "-Route", "/app",
        "-TaskPath", "agent-workflow/tasks/2026-09-27-ui", "-RunId", "run-01",
        env=env,
    )
    assert result.returncode != 0
    assert "BLOCKED" in result.stdout


def test_ui_runtime_valid_evidence_is_pass(tmp_path: Path, mock_server: str) -> None:
    vault = tmp_path / "vault"
    task_dir = vault / "agent-workflow" / "tasks" / "2026-09-27-ui"
    evidence_dir = task_dir / "evidence" / "run-01"
    evidence_dir.mkdir(parents=True)
    report = {
        "schemaVersion": 1,
        "runId": "run-01",
        "appHostUrl": f"{mock_server}/ok",
        "route": "/app",
        "status": "PASS",
        "checks": [{"name": "render", "status": "PASS"}],
        "artifacts": ["screenshot.png"],
    }
    (evidence_dir / "browser.json").write_text(json.dumps(report), encoding="utf-8")
    (evidence_dir / "screenshot.png").write_text("TEST ONLY synthetic artifact", encoding="utf-8")

    env = os.environ.copy()
    env["OBSIDIAN_VAULT_PATH"] = str(vault)

    result = run_verify(
        "-Mode", "ui-runtime", "-AppHostUrl", f"{mock_server}/ok", "-Route", "/app",
        "-TaskPath", "agent-workflow/tasks/2026-09-27-ui", "-RunId", "run-01",
        env=env,
    )
    assert result.returncode == 0, result.stderr
    assert "PASS" in result.stdout

@pytest.fixture
def browser_scope(tmp_path: Path, mock_server: str):
    vault = tmp_path / 'vault'
    run = vault / 'approved' / 'task' / 'evidence' / 'run-review'
    run.mkdir(parents=True)
    report = {
        'schemaVersion': 1, 'runId': 'run-review', 'appHostUrl': f'{mock_server}/ok',
        'route': '/app', 'status': 'PASS',
        'checks': [{'name': 'synthetic regression fixture', 'status': 'PASS'}],
        'artifacts': ['artifact.txt'],
    }
    report_path = run / 'browser.json'
    report_path.write_text(json.dumps(report), encoding='utf-8')
    (run / 'artifact.txt').write_text('TEST ONLY synthetic artifact', encoding='utf-8')
    environment = os.environ.copy()
    environment['OBSIDIAN_VAULT_PATH'] = str(vault)
    arguments = ['-Mode', 'ui-runtime', '-AppHostUrl', f'{mock_server}/ok',
                 '-TaskPath', 'approved/task', '-RunId', 'run-review', '-Route', '/app']
    return run, report_path, report, environment, arguments


@pytest.mark.parametrize('omitted', ['-TaskPath', '-RunId', '-Route'])
def test_direct_report_still_requires_scope(browser_scope, omitted: str) -> None:
    run, report_path, report, environment, arguments = browser_scope
    offset = arguments.index(omitted)
    del arguments[offset:offset + 2]
    result = run_verify(*arguments, '-BrowserEvidencePath', str(report_path), env=environment)
    assert result.returncode != 0, result.stdout
    assert 'BLOCKED' in result.stdout


def test_direct_report_outside_approved_run_is_blocked(browser_scope, tmp_path: Path) -> None:
    run, report_path, report, environment, arguments = browser_scope
    outside = tmp_path / 'outside'
    outside.mkdir()
    (outside / 'browser.json').write_text(json.dumps(report), encoding='utf-8')
    (outside / 'artifact.txt').write_text('TEST ONLY', encoding='utf-8')
    result = run_verify(*arguments, '-BrowserEvidencePath', str(outside / 'browser.json'), env=environment)
    assert result.returncode != 0, result.stdout


def test_direct_report_in_approved_run_is_pass(browser_scope) -> None:
    run, report_path, report, environment, arguments = browser_scope
    result = run_verify(*arguments, '-BrowserEvidencePath', str(report_path), env=environment)
    assert result.returncode == 0, result.stdout + result.stderr


@pytest.mark.parametrize('field,value', [
    ('schemaVersion', '1'),
    ('schemaVersion', True),
    ('status', 'pass'),
    ('runId', ['run-review']),
    ('checks', {'name': 'not an array', 'status': 'PASS'}),
    ('checks', [{'status': 'PASS'}]),
    ('checks', [{'name': '', 'status': 'PASS'}]),
    ('artifacts', 'artifact.txt'),
    ('route', '/App'),
    ('runId', 'RUN-REVIEW'),
])
def test_invalid_browser_report_shape_or_scope_is_blocked(browser_scope, field, value) -> None:
    run, report_path, report, environment, arguments = browser_scope
    report[field] = value
    report_path.write_text(json.dumps(report), encoding='utf-8')
    result = run_verify(*arguments, env=environment)
    assert result.returncode != 0, result.stdout


def test_artifact_parent_link_is_blocked(browser_scope, tmp_path: Path) -> None:
    run, report_path, report, environment, arguments = browser_scope
    outside = tmp_path / 'outside'
    outside.mkdir()
    (outside / 'artifact.txt').write_text('TEST ONLY outside run', encoding='utf-8')
    link = run / 'linked'
    if os.name == 'nt':
        import base64
        command = "New-Item -ItemType Junction -Path '{}' -Target '{}' | Out-Null".format(
            str(link).replace("'", "''"), str(outside).replace("'", "''"))
        encoded = base64.b64encode(command.encode('utf-16-le')).decode('ascii')
        created = subprocess.run(['powershell', '-NoProfile', '-EncodedCommand', encoded], capture_output=True, text=True)
        assert created.returncode == 0, created.stderr
    else:
        link.symlink_to(outside, target_is_directory=True)
    try:
        report['artifacts'] = ['linked/artifact.txt']
        report_path.write_text(json.dumps(report), encoding='utf-8')
        result = run_verify(*arguments, env=environment)
        assert result.returncode != 0, result.stdout
    finally:
        if os.name == 'nt':
            os.rmdir(link)
        else:
            link.unlink()


def test_report_file_link_is_blocked(browser_scope, tmp_path: Path) -> None:
    run, report_path, report, environment, arguments = browser_scope
    outside = tmp_path / 'outside-report.json'
    outside.write_text(json.dumps(report), encoding='utf-8')
    report_path.unlink()
    try:
        report_path.symlink_to(outside)
    except OSError as error:
        pytest.skip(f'File symlink unavailable: {error}')
    result = run_verify(*arguments, env=environment)
    assert result.returncode != 0, result.stdout

def test_report_root_array_is_blocked(browser_scope) -> None:
    run, report_path, report, environment, arguments = browser_scope
    report_path.write_text(json.dumps([report]), encoding='utf-8')
    result = run_verify(*arguments, env=environment)
    assert result.returncode != 0, result.stdout
    assert 'BLOCKED' in result.stdout
