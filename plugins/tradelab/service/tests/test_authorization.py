from __future__ import annotations

import httpx
import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request

from tradelab_api.core.authorization import (
    FunctionalAuthorizationResult,
    FunctionalPermissionAction,
    SystemFunctionalAuthorizationClient,
    authorize_request,
    resolve_permission,
)
from tradelab_api.main import app


def build_request(path: str = '/api/tradelab/strategies', authorization: str | None = 'Bearer token') -> Request:
    headers = []
    if authorization is not None:
        headers.append((b'authorization', authorization.encode()))
    scope = {
        'type': 'http',
        'method': 'GET',
        'path': path,
        'headers': headers,
        'query_string': b'',
        'scheme': 'http',
        'server': ('testserver', 80),
        'client': ('testclient', 50000),
        'root_path': '',
    }
    return Request(scope)


class FakeAsyncClient:
    response: httpx.Response | Exception = httpx.Response(
        200,
        json={'Success': True, 'Data': {'HasPermission': True}},
    )
    request_headers: dict[str, str] | None = None
    request_json: dict[str, str] | None = None

    async def __aenter__(self) -> 'FakeAsyncClient':
        return self

    async def __aexit__(self, *_args: object) -> None:
        return None

    async def post(self, _path: str, *, headers: dict[str, str], json: dict[str, str]) -> httpx.Response:
        self.request_headers = headers
        self.request_json = json
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


@pytest.mark.asyncio
async def test_client_forwards_bearer_and_allows(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = FakeAsyncClient()
    monkeypatch.setattr('tradelab_api.core.authorization.httpx.AsyncClient', lambda **_: fake)

    result = await SystemFunctionalAuthorizationClient('http://systemservice').check(
        build_request(),
        'tradelab.strategies',
        FunctionalPermissionAction.VIEW,
    )

    assert result == FunctionalAuthorizationResult(True, True, True)
    assert fake.request_headers == {'Authorization': 'Bearer token'}
    assert fake.request_json == {'permissionKey': 'tradelab.strategies', 'action': 'view'}


@pytest.mark.asyncio
async def test_client_denies_false_malformed_and_http_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = FakeAsyncClient()
    monkeypatch.setattr('tradelab_api.core.authorization.httpx.AsyncClient', lambda **_: fake)

    fake.response = httpx.Response(200, json={'Success': True, 'Data': {'HasPermission': False}})
    denied = await SystemFunctionalAuthorizationClient('http://systemservice').check(
        build_request(), 'tradelab.strategies', FunctionalPermissionAction.VIEW
    )
    fake.response = httpx.Response(200, content=b'not-json')
    malformed = await SystemFunctionalAuthorizationClient('http://systemservice').check(
        build_request(), 'tradelab.strategies', FunctionalPermissionAction.VIEW
    )
    fake.response = httpx.Response(503)
    unavailable = await SystemFunctionalAuthorizationClient('http://systemservice').check(
        build_request(), 'tradelab.strategies', FunctionalPermissionAction.VIEW
    )

    assert denied == FunctionalAuthorizationResult(False, True, True)
    assert malformed == FunctionalAuthorizationResult(False, False, True)
    assert unavailable == FunctionalAuthorizationResult(False, False, True)


@pytest.mark.asyncio
async def test_client_connection_failure_and_missing_bearer_fail_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = FakeAsyncClient()
    fake.response = httpx.ConnectError('down')
    monkeypatch.setattr('tradelab_api.core.authorization.httpx.AsyncClient', lambda **_: fake)

    client = SystemFunctionalAuthorizationClient('http://systemservice')
    failure = await client.check(build_request(), 'tradelab.strategies', FunctionalPermissionAction.VIEW)
    missing = await client.check(
        build_request(authorization=None), 'tradelab.strategies', FunctionalPermissionAction.VIEW
    )

    assert failure == FunctionalAuthorizationResult(False, False, True)
    assert missing == FunctionalAuthorizationResult(False, True, False)


def test_resolve_permission_maps_actions_explicitly() -> None:
    assert resolve_permission('/api/tradelab/strategies', 'GET') == (
        'tradelab.strategies', FunctionalPermissionAction.VIEW
    )
    assert resolve_permission('/api/tradelab/strategies', 'POST') == (
        'tradelab.strategies', FunctionalPermissionAction.ADD
    )
    assert resolve_permission('/api/tradelab/bots/id/backtests', 'POST') == (
        'tradelab.backtests', FunctionalPermissionAction.ANALYZE
    )
    assert resolve_permission('/api/tradelab/datasets/fill-jobs/id/mark-stale-failed', 'POST') == (
        'tradelab.datasets', FunctionalPermissionAction.APPROVE
    )
    assert resolve_permission('/api/tradelab/paper/sessions', 'GET') == (
        'tradelab.backtests', FunctionalPermissionAction.VIEW
    )


class DecisionClient:
    def __init__(self, result: FunctionalAuthorizationResult) -> None:
        self.result = result

    async def check(self, *_args: object, **_kwargs: object) -> FunctionalAuthorizationResult:
        return self.result


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ('result', 'status_code'),
    [
        (FunctionalAuthorizationResult(False, True, True), 403),
        (FunctionalAuthorizationResult(False, False, True), 503),
        (FunctionalAuthorizationResult(False, True, False), 401),
    ],
)
async def test_middleware_denies_without_allowed_authority(
    result: FunctionalAuthorizationResult,
    status_code: int,
) -> None:
    response = await authorize_request(build_request(), DecisionClient(result))

    assert response is not None
    assert response.status_code == status_code


@pytest.mark.parametrize(
    ('result', 'status_code'),
    [
        (FunctionalAuthorizationResult(False, True, True), 403),
        (FunctionalAuthorizationResult(False, False, True), 503),
    ],
)
def test_tradelab_route_denies_without_functional_permission(
    result: FunctionalAuthorizationResult,
    status_code: int,
) -> None:
    app.state.system_authorization_client = DecisionClient(result)

    response = TestClient(app).get(
        '/api/tradelab/strategies',
        headers={'Authorization': 'Bearer token'},
    )

    assert response.status_code == status_code
