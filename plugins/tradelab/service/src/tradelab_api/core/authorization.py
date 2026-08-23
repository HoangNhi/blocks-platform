from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
import httpx
from fastapi import Request
from fastapi.responses import JSONResponse


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


class SystemFunctionalAuthorizationClient:
    def __init__(self, base_url: str, timeout_seconds: float = 2.0) -> None:
        self._base_url = base_url.rstrip('/')
        self._timeout_seconds = timeout_seconds

    async def check(
        self,
        request: Request,
        permission_key: str,
        action: FunctionalPermissionAction,
    ) -> FunctionalAuthorizationResult:
        authorization = request.headers.get('authorization')
        if not authorization or not authorization.lower().startswith('bearer '):
            return FunctionalAuthorizationResult(False, True, False)

        try:
            async with httpx.AsyncClient(base_url=self._base_url, timeout=self._timeout_seconds) as client:
                response = await client.post(
                    '/api/Authorization/check',
                    headers={'Authorization': authorization},
                    json={'permissionKey': permission_key, 'action': action.value},
                )
            if response.status_code < 200 or response.status_code >= 300:
                return FunctionalAuthorizationResult(False, False, True)

            payload = response.json()
            success = payload.get('Success', payload.get('success'))
            data = payload.get('Data', payload.get('data'))
            has_permission = None
            if isinstance(data, dict):
                has_permission = data.get('HasPermission', data.get('hasPermission'))
            if not isinstance(success, bool) or not success or not isinstance(has_permission, bool):
                return FunctionalAuthorizationResult(False, False, True)
            return FunctionalAuthorizationResult(has_permission, True, True)
        except (httpx.HTTPError, ValueError, TypeError):
            return FunctionalAuthorizationResult(False, False, True)


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
    if not request.url.path.startswith('/api/tradelab'):
        return None

    rule = resolve_permission(request.url.path, request.method)
    if rule is None:
        return _error(403, 'Functional permission mapping is missing.')

    permission_key, action = rule
    result = await client.check(request, permission_key, action)
    if not result.authenticated:
        return _error(401, 'Authentication token is required.')
    if not result.authority_available:
        return _error(503, 'Authorization authority unavailable.')
    if not result.allowed:
        return _error(403, 'Functional permission is required.')
    return None
