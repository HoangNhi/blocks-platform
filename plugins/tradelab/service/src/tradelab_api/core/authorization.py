from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any
from uuid import UUID
import httpx
from fastapi import Request
from fastapi.responses import JSONResponse

from tradelab_api.core.security import SecurityActor


class FunctionalPermissionAction(StrEnum):
    VIEW = 'view'
    ADD = 'add'
    UPDATE = 'update'
    DELETE = 'delete'
    APPROVE = 'approve'
    ANALYZE = 'analyze'


@dataclass(frozen=True)
class FunctionalAuthorizationResult:
    allowed: bool
    authority_available: bool
    authenticated: bool
    user_id: UUID | None = None
    username: str | None = None
    workspace_id: UUID | None = None


class SystemFunctionalAuthorizationClient:
    def __init__(self, base_url: str, timeout_seconds: float = 2.0) -> None:
        self._base_url = base_url.rstrip('/')
        self._timeout_seconds = timeout_seconds

    async def check(
        self,
        request: Request,
        permission_key: str,
        action: FunctionalPermissionAction,
        workspace_id: UUID | None = None,
    ) -> FunctionalAuthorizationResult:
        authorization = request.headers.get('authorization')
        if not authorization or not authorization.lower().startswith('bearer '):
            return FunctionalAuthorizationResult(False, True, False)

        body: dict[str, Any] = {'permissionKey': permission_key, 'action': action.value}
        if workspace_id is not None:
            body['workspaceId'] = str(workspace_id)

        try:
            async with httpx.AsyncClient(base_url=self._base_url, timeout=self._timeout_seconds) as client:
                response = await client.post(
                    '/api/Authorization/check',
                    headers={'Authorization': authorization},
                    json=body,
                )
            if response.status_code == 401:
                return FunctionalAuthorizationResult(False, True, False)
            if response.status_code < 200 or response.status_code >= 300:
                return FunctionalAuthorizationResult(False, False, True)

            payload = response.json()
            success = payload.get('Success', payload.get('success'))
            data = payload.get('Data', payload.get('data'))
            has_permission = None
            resp_user_id: UUID | None = None
            resp_username: str | None = None
            resp_workspace_id: UUID | None = None
            if isinstance(data, dict):
                has_permission = data.get('HasPermission', data.get('hasPermission'))
                raw_user_id = data.get('UserId', data.get('userId'))
                if raw_user_id:
                    try:
                        resp_user_id = UUID(str(raw_user_id))
                    except (ValueError, TypeError):
                        pass
                resp_username = data.get('Username', data.get('username'))
                raw_workspace_id = data.get('WorkspaceId', data.get('workspaceId'))
                if raw_workspace_id:
                    try:
                        resp_workspace_id = UUID(str(raw_workspace_id))
                    except (ValueError, TypeError):
                        pass

            if not isinstance(success, bool) or not success or not isinstance(has_permission, bool):
                return FunctionalAuthorizationResult(False, False, True)

            if workspace_id is not None:
                if resp_user_id is None or resp_workspace_id != workspace_id:
                    return FunctionalAuthorizationResult(False, False, True)

            return FunctionalAuthorizationResult(
                allowed=has_permission,
                authority_available=True,
                authenticated=True,
                user_id=resp_user_id,
                username=resp_username,
                workspace_id=resp_workspace_id,
            )
        except (httpx.HTTPError, ValueError, TypeError):
            return FunctionalAuthorizationResult(False, False, True)


def is_operator_only_route(relative_path: str) -> bool:
    normalized = relative_path.strip('/')
    return (
        normalized == 'smoke'
        or normalized.startswith('smoke/')
        or normalized.startswith('live/proof-window')
        or normalized.startswith('proof-window')
        or normalized.startswith('live-pilot-control')
        or normalized == 'live/safety'
        or normalized.startswith('live/safety/')
    )


def is_shared_route(relative_path: str) -> bool:
    normalized = relative_path.strip('/')
    return (
        normalized.startswith('datasets')
        or normalized.startswith('exchange-symbols')
        or normalized == 'health'
    )


def resolve_permission(path: str, method: str) -> tuple[str, FunctionalPermissionAction] | None:
    relative_path = path.removeprefix('/api/tradelab').strip('/')
    normalized_method = method.upper()
    if not relative_path:
        return None

    if relative_path.startswith('strategies') or relative_path.startswith('strategy-groups'):
        return 'tradelab.strategies', _method_action(normalized_method)
    if relative_path.startswith('indicators'):
        return 'tradelab.strategies', FunctionalPermissionAction.VIEW
    if 'execution-journal' in relative_path:
        return 'tradelab.backtests', _method_action(normalized_method)
    if relative_path.startswith('bots/') or relative_path == 'bots':
        if '/backtests' in relative_path:
            return 'tradelab.backtests', (
                FunctionalPermissionAction.ANALYZE
                if normalized_method == 'POST'
                else FunctionalPermissionAction.VIEW
            )
        return 'tradelab.strategies', _method_action(normalized_method)
    if relative_path.startswith('bot-runs'):
        return 'tradelab.backtests', (
            FunctionalPermissionAction.ANALYZE
            if any(marker in relative_path for marker in ('/analysis', '/manual-signal-package', '/robustness-gate'))
            else FunctionalPermissionAction.VIEW
        )
    if relative_path.startswith('datasets'):
        if '/mark-stale-failed' in relative_path:
            return 'tradelab.datasets', FunctionalPermissionAction.APPROVE
        if '/cancel' in relative_path:
            return 'tradelab.datasets', FunctionalPermissionAction.UPDATE
        return 'tradelab.datasets', _method_action(normalized_method)
    if relative_path.startswith('smoke'):
        return 'tradelab.datasets', FunctionalPermissionAction.UPDATE
    if relative_path.startswith('exchange-connections') or relative_path.startswith('exchange-symbols'):
        return 'tradelab.risk-profiles', _method_action(normalized_method)
    if relative_path.startswith('paper'):
        return 'tradelab.backtests', (
            FunctionalPermissionAction.VIEW
            if normalized_method == 'GET'
            else FunctionalPermissionAction.ANALYZE
        )
    if relative_path.startswith('live') or relative_path.startswith('testnet'):
        if '/proof-window/open' in relative_path or '/proof-window/close' in relative_path:
            return 'tradelab.risk-profiles', FunctionalPermissionAction.APPROVE
        return 'tradelab.risk-profiles', _method_action(normalized_method)
    return None


def _method_action(method: str) -> FunctionalPermissionAction:
    return {
        'GET': FunctionalPermissionAction.VIEW,
        'POST': FunctionalPermissionAction.ADD,
        'PUT': FunctionalPermissionAction.UPDATE,
        'PATCH': FunctionalPermissionAction.UPDATE,
        'DELETE': FunctionalPermissionAction.DELETE,
    }.get(method, FunctionalPermissionAction.VIEW)


def _error(status_code: int, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            'Success': False,
            'StatusCode': status_code,
            'Data': None,
            'Message': message,
        },
    )


async def authorize_request(
    request: Request,
    client: SystemFunctionalAuthorizationClient,
) -> JSONResponse | None:
    if request.method == 'OPTIONS':
        return None

    path = request.url.path
    if not path.startswith('/api/tradelab'):
        return None

    relative_path = path.removeprefix('/api/tradelab').strip('/')
    if relative_path == 'health':
        return None

    rule = resolve_permission(path, request.method)
    if rule is None:
        return _error(403, 'Functional permission mapping is missing.')

    permission_key, action = rule

    if is_operator_only_route(relative_path):
        return _error(403, 'Operator-only control is not accessible to tenant users.')

    authorization = request.headers.get('authorization')
    if not authorization or not authorization.lower().startswith('bearer '):
        return _error(401, 'Authentication token is required.')

    # Shared routes: only require functional permission, no workspace context
    if is_shared_route(relative_path):
        result = await client.check(request, permission_key, action, workspace_id=None)
        if not result.authenticated:
            return _error(401, 'Authentication token is required.')
        if not result.authority_available:
            return _error(503, 'Authorization authority unavailable.')
        if not result.allowed:
            return _error(403, 'Functional permission is required.')
        return None

    # Private routes: require X-Workspace-Id header and scoped authority proof
    workspace_header = request.headers.get('x-workspace-id')
    if not workspace_header:
        auth_check = await client.check(request, permission_key, action, workspace_id=None)
        if not auth_check.authenticated:
            return _error(401, 'Authentication token is required.')
        return _error(400, 'X-Workspace-Id header is required.')

    try:
        workspace_id = UUID(workspace_header.strip())
    except (ValueError, TypeError):
        auth_check = await client.check(request, permission_key, action, workspace_id=None)
        if not auth_check.authenticated:
            return _error(401, 'Authentication token is required.')
        return _error(400, 'Invalid X-Workspace-Id header; UUID format required.')

    result = await client.check(request, permission_key, action, workspace_id=workspace_id)
    if not result.authenticated:
        return _error(401, 'Authentication token is required.')
    if not result.authority_available:
        return _error(503, 'Authorization authority unavailable.')
    if not result.allowed:
        return _error(403, 'Workspace membership or functional permission is required.')

    if result.user_id is None or result.workspace_id != workspace_id:
        return _error(503, 'Scoped authority proof missing or mismatched.')

    request.state.actor = SecurityActor(
        user_id=result.user_id,
        workspace_id=result.workspace_id,
        username=result.username,
    )
    return None
