from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = (ROOT / '.github' / 'workflows' / 'ci.yml').read_text(encoding='utf-8')


def deploy_job() -> str:
    assert WORKFLOW.count('\n  deploy-heroku:') == 1
    return WORKFLOW.split('\n  deploy-heroku:', 1)[1]


def test_deploy_requires_every_ci_job_and_main_push() -> None:
    job = deploy_job()
    needs = re.search(r'(?m)^    needs: \[(.*?)\]$', job)
    assert needs is not None
    for name in (
        'build-and-test',
        'verify-agent-assets',
        'test-agent-workflow',
        'test-python-services',
        'test-frontend',
        'boundary',
    ):
        assert name in needs.group(1)
    assert "github.event_name == 'push'" in job
    assert "github.ref == 'refs/heads/main'" in job
    assert 'persist-credentials: false' in job


def test_deploy_targets_match_existing_docker_builds() -> None:
    job = deploy_job()
    rows = re.findall(
        r'(?m)^          - app: ([\w-]+)\n'
        r'^            dockerfile: ([^\n]+)\n'
        r'^            context: ([^\n]+)$',
        job,
    )
    assert rows == [
        ('blocks-system-service', 'services/system-service/Blocks.SystemService/Dockerfile', '.'),
        ('blocks-api-gateway', 'services/api-gateway/Blocks.ApiGateway/Dockerfile', '.'),
        ('blocks', 'apps/web/Blocks.Web/Dockerfile', 'apps/web/Blocks.Web'),
        ('blocks-trade-lab', 'plugins/tradelab/service/Dockerfile', '.'),
        ('blocks-ai-video', 'plugins/ai-video-production/service/Blocks.AiVideoService/Dockerfile', '.'),
        ('blocks-ai-assistant', 'services/assistant-service/Dockerfile', 'services/assistant-service'),
    ]
    for _, dockerfile, context in rows:
        assert (ROOT / dockerfile).is_file()
        assert (ROOT / context).is_dir()
    assert 'fail-fast: false' in job
    assert 'cancel-in-progress: false' in job
    assert 'matrix.app' in job


def test_deploy_requires_secret_then_pushes_and_releases() -> None:
    job = deploy_job()
    assert 'HEROKU_API_KEY: ' in job and 'secrets.HEROKU_API_KEY' in job
    assert re.search(r'(?m)^    env:', job) is None
    assert job.count('secrets.HEROKU_API_KEY') == 3
    assert 'test -n "$HEROKU_API_KEY"' in job
    assert '--password-stdin' in job
    assert 'docker build -f' in job and 'matrix.dockerfile' in job
    assert 'registry.heroku.com/' in job and 'matrix.app' in job
    assert job.index('docker build') < job.index('docker push') < job.index('heroku container:release web')
    assert 'heroku container:release web --app' in job
