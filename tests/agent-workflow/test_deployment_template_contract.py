from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ROOT / 'infra' / 'compose' / 'production.example.yml'
FILE_COMPOSE = ROOT / 'infra' / 'compose' / 'file-service.production.example.yml'
DEPLOY = ROOT / 'infra' / 'deploy' / 'deploy-compose.example.sh'
FILE_DEPLOY = ROOT / 'infra' / 'deploy' / 'deploy-file-service.example.sh'
NGINX = ROOT / 'apps' / 'web' / 'Blocks.Web' / 'nginx.heroku.conf.template'


def test_public_deployment_templates_exist_without_active_heroku_control() -> None:
    for path in (COMPOSE, FILE_COMPOSE, DEPLOY, FILE_DEPLOY):
        assert path.is_file(), path
    assert not (ROOT / 'heroku.yml').exists()


def test_compose_templates_use_required_placeholders() -> None:
    compose_text = COMPOSE.read_text(encoding='utf-8')
    file_compose_text = FILE_COMPOSE.read_text(encoding='utf-8')

    for variable in (
        'SYSTEM_SERVICE_IMAGE',
        'FILE_SERVICE_IMAGE',
        'ASSISTANT_SERVICE_IMAGE',
        'TRADELAB_SERVICE_IMAGE',
        'API_GATEWAY_IMAGE',
        'WEB_IMAGE',
    ):
        assert f'${{{variable}' in compose_text
    assert '${FILE_STORAGE_PATH' in file_compose_text
    for text in (compose_text, file_compose_text):
        assert 'ghcr.io/hoangnhi' not in text
        assert '/opt' + '/blocks' not in text
        assert 'blocks_prod' not in text


def test_deploy_templates_require_explicit_runtime_inputs() -> None:
    for path in (DEPLOY, FILE_DEPLOY):
        text = path.read_text(encoding='utf-8')
        assert 'ROOT_DIR=' in text
        assert 'ENV_FILE=' in text
        assert 'COMPOSE_FILE=' in text
        assert 'HEALTHCHECK_URL=' in text
        assert '/opt' + '/blocks' not in text
        assert 'docker compose' in text
        assert re.search(r'curl -fsS\s+?\$HEALTHCHECK_URL?', text)


def test_nginx_template_injects_gateway_url() -> None:
    text = NGINX.read_text(encoding='utf-8')
    assert '${API_GATEWAY_URL}' in text
    assert not re.search(r'https://[^\s;]+', text)
