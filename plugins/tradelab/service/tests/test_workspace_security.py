from __future__ import annotations

from uuid import UUID, uuid4
import pytest
from starlette.requests import Request

from tradelab_api.core.authorization import (
    FunctionalAuthorizationResult,
    FunctionalPermissionAction,
    authorize_request,
)
from tradelab_api.core.security import SecurityActor, get_current_actor


def build_request(
    path: str = '/api/tradelab/strategies',
    method: str = 'GET',
    authorization: str | None = 'Bearer valid-test-token',
    workspace_id: str | None = '11111111-1111-1111-1111-111111111111',
) -> Request:
    headers: list[tuple[bytes, bytes]] = []
    if authorization is not None:
        headers.append((b'authorization', authorization.encode()))
    if workspace_id is not None:
        headers.append((b'x-workspace-id', workspace_id.encode()))
    scope = {
        'type': 'http',
        'method': method,
        'path': path,
        'headers': headers,
        'query_string': b'',
        'scheme': 'http',
        'server': ('testserver', 80),
        'client': ('testclient', 50000),
        'root_path': '',
    }
    return Request(scope)


class MockAuthorityClient:
    def __init__(self, result: FunctionalAuthorizationResult) -> None:
        self.result = result
        self.last_workspace_id: UUID | None = None

    async def check(
        self,
        request: Request,
        permission_key: str,
        action: FunctionalPermissionAction,
        workspace_id: UUID | None = None,
    ) -> FunctionalAuthorizationResult:
        self.last_workspace_id = workspace_id
        return self.result


@pytest.mark.asyncio
async def test_missing_token_returns_401_even_if_workspace_missing() -> None:
    req = build_request(authorization=None, workspace_id=None)
    client = MockAuthorityClient(FunctionalAuthorizationResult(False, True, False))
    response = await authorize_request(req, client)
    assert response is not None
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_invalid_token_returns_401_even_if_workspace_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    # When token is invalid, authority returns 401
    req = build_request(authorization='Bearer invalid-token', workspace_id=None)
    client = MockAuthorityClient(FunctionalAuthorizationResult(False, True, False))
    response = await authorize_request(req, client)
    assert response is not None
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_authenticated_missing_workspace_header_returns_400() -> None:
    req = build_request(authorization='Bearer valid-token', workspace_id=None)
    client = MockAuthorityClient(FunctionalAuthorizationResult(True, True, True))
    response = await authorize_request(req, client)
    assert response is not None
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_authenticated_malformed_workspace_header_returns_400() -> None:
    req = build_request(authorization='Bearer valid-token', workspace_id='not-a-uuid')
    client = MockAuthorityClient(FunctionalAuthorizationResult(True, True, True))
    response = await authorize_request(req, client)
    assert response is not None
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_nonmember_returns_403() -> None:
    req = build_request(workspace_id='11111111-1111-1111-1111-111111111111')
    client = MockAuthorityClient(FunctionalAuthorizationResult(False, True, True))
    response = await authorize_request(req, client)
    assert response is not None
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_unavailable_authority_returns_503() -> None:
    req = build_request()
    client = MockAuthorityClient(FunctionalAuthorizationResult(False, False, True))
    response = await authorize_request(req, client)
    assert response is not None
    assert response.status_code == 503


@pytest.mark.asyncio
async def test_old_authority_without_scoped_proof_returns_503() -> None:
    req = build_request(workspace_id='11111111-1111-1111-1111-111111111111')
    # Old authority only returned allowed=True, but user_id and workspace_id are None
    client = MockAuthorityClient(FunctionalAuthorizationResult(
        allowed=True,
        authority_available=True,
        authenticated=True,
        user_id=None,
        workspace_id=None,
    ))
    response = await authorize_request(req, client)
    assert response is not None
    assert response.status_code == 503


@pytest.mark.asyncio
async def test_mismatched_workspace_id_from_authority_returns_503() -> None:
    req = build_request(workspace_id='11111111-1111-1111-1111-111111111111')
    client = MockAuthorityClient(FunctionalAuthorizationResult(
        allowed=True,
        authority_available=True,
        authenticated=True,
        user_id=uuid4(),
        workspace_id=UUID('22222222-2222-2222-2222-222222222222'),
    ))
    response = await authorize_request(req, client)
    assert response is not None
    assert response.status_code == 503


@pytest.mark.asyncio
async def test_shared_route_datasets_allows_without_workspace_header() -> None:
    req = build_request(path='/api/tradelab/datasets', workspace_id=None)
    client = MockAuthorityClient(FunctionalAuthorizationResult(True, True, True))
    response = await authorize_request(req, client)
    assert response is None  # Allowed through


@pytest.mark.asyncio
async def test_operator_only_route_is_denied_to_tenant() -> None:
    req = build_request(path='/api/tradelab/live/proof-window/open', method='POST')
    client = MockAuthorityClient(FunctionalAuthorizationResult(True, True, True))
    response = await authorize_request(req, client)
    assert response is not None
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_valid_private_request_populates_security_actor() -> None:
    user_id = uuid4()
    ws_id = UUID('11111111-1111-1111-1111-111111111111')
    req = build_request(workspace_id=str(ws_id))
    client = MockAuthorityClient(FunctionalAuthorizationResult(
        allowed=True,
        authority_available=True,
        authenticated=True,
        user_id=user_id,
        username='alice',
        workspace_id=ws_id,
    ))
    response = await authorize_request(req, client)
    assert response is None
    actor = get_current_actor(req)
    assert actor == SecurityActor(user_id=user_id, workspace_id=ws_id, username='alice')
