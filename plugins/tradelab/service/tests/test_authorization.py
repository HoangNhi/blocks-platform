from __future__ import annotations

import httpx
import json
import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request
from uuid import UUID

from tradelab_api.core.authorization import (
    FunctionalAuthorizationResult,
    FunctionalPermissionAction,
    SystemFunctionalAuthorizationClient,
    authorize_request,
    resolve_permission,
)
from tradelab_api.main import app


def build_request(
    path: str = '/api/tradelab/strategies',
    authorization: str | None = 'Bearer token',
    workspace_id: str | None = '11111111-1111-1111-1111-111111111111',
) -> Request:
    headers = []
    if authorization is not None:
        headers.append((b'authorization', authorization.encode()))
    if workspace_id is not None:
        headers.append((b'x-workspace-id', workspace_id.encode()))
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


WORKLOAD_USER_ID = UUID('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
WORKLOAD_WORKSPACE_ID = UUID('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
WORKLOAD_SERVICE_KEY = 'test-service-secret'


class WorkloadResponseStream(httpx.AsyncByteStream):
    def __init__(self, content: bytes) -> None:
        self._content = content

    async def __aiter__(self):
        yield self._content

    async def aclose(self) -> None:
        return None


def workload_response(
    has_permission: object = True,
    user_id: object = WORKLOAD_USER_ID,
    workspace_id: object = WORKLOAD_WORKSPACE_ID,
    *,
    camel_case: bool = False,
) -> dict[str, object]:
    if camel_case:
        return {
            'success': True,
            'data': {
                'hasPermission': has_permission,
                'userId': str(user_id),
                'workspaceId': str(workspace_id),
            },
        }
    return {
        'Success': True,
        'Data': {
            'HasPermission': has_permission,
            'UserId': str(user_id),
            'WorkspaceId': str(workspace_id),
        },
    }


def install_workload_transport(monkeypatch: pytest.MonkeyPatch, handler):
    requests: list[httpx.Request] = []
    options: list[dict[str, object]] = []
    original_client = httpx.AsyncClient

    def handle(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        response = handler(request)
        if response.is_stream_consumed:
            content = response.content
            headers = response.headers
            status_code = response.status_code
            response.close()
            return httpx.Response(
                status_code,
                headers=headers,
                stream=WorkloadResponseStream(content),
            )
        return response

    def create_client(**kwargs: object) -> httpx.AsyncClient:
        options.append(kwargs)
        return original_client(transport=httpx.MockTransport(handle), **kwargs)

    monkeypatch.setattr('tradelab_api.core.authorization.httpx.AsyncClient', create_client)
    return requests, options


@pytest.mark.asyncio
@pytest.mark.parametrize('has_permission', [True, False])
async def test_workload_client_authenticates_service_and_returns_exact_subject(
    monkeypatch: pytest.MonkeyPatch,
    has_permission: bool,
) -> None:
    requests, options = install_workload_transport(
        monkeypatch,
        lambda _request: httpx.Response(200, json=workload_response(has_permission)),
    )
    client = SystemFunctionalAuthorizationClient(
        'http://127.0.0.1:8000', service_authorization_key=WORKLOAD_SERVICE_KEY
    )

    result = await client.check_workload(WORKLOAD_USER_ID, WORKLOAD_WORKSPACE_ID)

    assert result == FunctionalAuthorizationResult(
        has_permission, True, True, WORKLOAD_USER_ID, None, WORKLOAD_WORKSPACE_ID
    )
    assert requests[0].url.path == '/api/Authorization/workload-check'
    assert requests[0].headers['x-service-authorization'] == WORKLOAD_SERVICE_KEY
    assert 'authorization' not in requests[0].headers
    assert json.loads(requests[0].content) == {
        'userId': str(WORKLOAD_USER_ID),
        'workspaceId': str(WORKLOAD_WORKSPACE_ID),
        'permissionKey': 'tradelab.backtests',
        'action': 'analyze',
    }
    assert options[0]['timeout'] == 2.0
    assert options[0]['follow_redirects'] is False
    assert options[0].get('verify', True) is True


@pytest.mark.asyncio
@pytest.mark.parametrize('status_code', [201, 302, 401, 403, 429, 503])
async def test_workload_client_treats_non_200_as_unavailable(
    monkeypatch: pytest.MonkeyPatch,
    status_code: int,
) -> None:
    requests, _ = install_workload_transport(
        monkeypatch,
        lambda _request: httpx.Response(
            status_code,
            headers={'Location': 'https://attacker.invalid/redirect'} if status_code == 302 else None,
            json=workload_response(),
        ),
    )
    client = SystemFunctionalAuthorizationClient(
        'http://127.0.0.1:8000', service_authorization_key=WORKLOAD_SERVICE_KEY
    )

    result = await client.check_workload(WORKLOAD_USER_ID, WORKLOAD_WORKSPACE_ID)

    assert result.allowed is False
    assert result.authority_available is False
    assert len(requests) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    'payload',
    [
        [],
        {'Success': True, 'Data': []},
        {'Success': True, 'Data': {'HasPermission': 'false'}},
        {'Success': True, 'Data': {'HasPermission': 0}},
        workload_response(user_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
        workload_response(user_id='not-a-uuid'),
        workload_response(workspace_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
        {
            **workload_response(),
            'success': False,
        },
        {
            'Success': True,
            'Data': {
                **workload_response()['Data'],
                'hasPermission': False,
            },
        },
    ],
)
async def test_workload_client_rejects_malformed_or_conflicting_proofs(
    monkeypatch: pytest.MonkeyPatch,
    payload: object,
) -> None:
    install_workload_transport(
        monkeypatch,
        lambda _request: httpx.Response(200, json=payload),
    )
    client = SystemFunctionalAuthorizationClient(
        'http://127.0.0.1:8000', service_authorization_key=WORKLOAD_SERVICE_KEY
    )

    result = await client.check_workload(WORKLOAD_USER_ID, WORKLOAD_WORKSPACE_ID)

    assert result.allowed is False
    assert result.authority_available is False


@pytest.mark.asyncio
async def test_workload_client_accepts_false_and_camel_case_envelope(monkeypatch: pytest.MonkeyPatch) -> None:
    install_workload_transport(
        monkeypatch,
        lambda _request: httpx.Response(
            200,
            json=workload_response(False, camel_case=True),
        ),
    )
    client = SystemFunctionalAuthorizationClient(
        'http://127.0.0.1:8000', service_authorization_key=WORKLOAD_SERVICE_KEY
    )

    result = await client.check_workload(WORKLOAD_USER_ID, WORKLOAD_WORKSPACE_ID)

    assert result == FunctionalAuthorizationResult(
        False, True, True, WORKLOAD_USER_ID, None, WORKLOAD_WORKSPACE_ID
    )


@pytest.mark.asyncio
async def test_workload_client_rejects_non_json_response(monkeypatch: pytest.MonkeyPatch) -> None:
    install_workload_transport(
        monkeypatch,
        lambda _request: httpx.Response(
            200,
            headers={'Content-Type': 'application/json'},
            stream=WorkloadResponseStream(b'not-json'),
        ),
    )
    client = SystemFunctionalAuthorizationClient(
        'http://127.0.0.1:8000', service_authorization_key=WORKLOAD_SERVICE_KEY
    )

    result = await client.check_workload(WORKLOAD_USER_ID, WORKLOAD_WORKSPACE_ID)

    assert result.allowed is False
    assert result.authority_available is False


@pytest.mark.asyncio
async def test_workload_client_rejects_oversized_body_and_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    call_count = 0

    def respond(_request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return httpx.Response(
                200,
                headers={'Content-Type': 'application/json'},
                stream=WorkloadResponseStream(b' ' * (16 * 1024 + 1)),
            )
        raise httpx.ReadTimeout('timed out')

    install_workload_transport(monkeypatch, respond)
    client = SystemFunctionalAuthorizationClient(
        'http://127.0.0.1:8000', service_authorization_key=WORKLOAD_SERVICE_KEY
    )
    oversized = await client.check_workload(WORKLOAD_USER_ID, WORKLOAD_WORKSPACE_ID)
    timed_out = await client.check_workload(WORKLOAD_USER_ID, WORKLOAD_WORKSPACE_ID)

    assert not oversized.authority_available
    assert not timed_out.authority_available


@pytest.mark.asyncio
async def test_workload_client_fails_closed_without_key_or_over_remote_http(monkeypatch: pytest.MonkeyPatch) -> None:
    requests, _ = install_workload_transport(
        monkeypatch,
        lambda _request: httpx.Response(200, json=workload_response()),
    )
    no_key = await SystemFunctionalAuthorizationClient('http://127.0.0.1:8000').check_workload(
        WORKLOAD_USER_ID, WORKLOAD_WORKSPACE_ID
    )
    remote_http = await SystemFunctionalAuthorizationClient(
        'http://systemservice', service_authorization_key=WORKLOAD_SERVICE_KEY
    ).check_workload(WORKLOAD_USER_ID, WORKLOAD_WORKSPACE_ID)

    assert not no_key.authority_available
    assert not remote_http.authority_available
    assert requests == []


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
        headers={
            'Authorization': 'Bearer token',
            'X-Workspace-Id': '11111111-1111-1111-1111-111111111111',
        },
    )

    assert response.status_code == status_code
