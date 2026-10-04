from __future__ import annotations

import json
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import StrEnum
from typing import Any
from urllib.parse import urlsplit
from uuid import UUID, uuid4
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


def _response_field(payload: dict[str, Any], pascal: str, camel: str) -> Any:
    values = [payload[key] for key in (pascal, camel) if key in payload]
    if not values or any(value != values[0] for value in values[1:]):
        raise ValueError('missing or conflicting response field')
    return values[0]


def _unique_json_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate JSON object key')
        result[key] = value
    return result


class SystemFunctionalAuthorizationClient:
    _workload_response_limit = 16 * 1024
    _workload_timeout_seconds = 2.0
    _service_key_limit = 512

    def __init__(
        self,
        base_url: str,
        timeout_seconds: float = 2.0,
        service_authorization_key: str | None = None,
    ) -> None:
        self._base_url = base_url.rstrip('/')
        self._timeout_seconds = timeout_seconds
        self._service_authorization_key = service_authorization_key

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


    async def check_workload(
        self,
        user_id: UUID,
        workspace_id: UUID,
    ) -> FunctionalAuthorizationResult:
        unavailable = FunctionalAuthorizationResult(
            False, False, True, user_id=user_id, workspace_id=workspace_id
        )
        service_key = self._service_authorization_key
        if (
            user_id.int == 0
            or workspace_id.int == 0
            or not service_key
            or not service_key.strip()
            or len(service_key.encode('utf-8')) > self._service_key_limit
        ):
            return unavailable

        try:
            base_url = urlsplit(self._base_url)
            host = base_url.hostname
            local_http = base_url.scheme == 'http' and host is not None and host.casefold() in {
                'localhost', '127.0.0.1', '::1'
            }
            if (
                (base_url.scheme != 'https' and not local_http)
                or host is None
                or base_url.username is not None
                or base_url.password is not None
            ):
                return unavailable

            request_body = {
                'userId': str(user_id),
                'workspaceId': str(workspace_id),
                'permissionKey': 'tradelab.backtests',
                'action': FunctionalPermissionAction.ANALYZE.value,
            }
            async with httpx.AsyncClient(
                base_url=self._base_url,
                timeout=self._workload_timeout_seconds,
                follow_redirects=False,
                verify=True,
            ) as client:
                async with client.stream(
                    'POST',
                    '/api/Authorization/workload-check',
                    headers={
                        'X-Service-Authorization': service_key,
                        'Accept': 'application/json',
                        'Accept-Encoding': 'identity',
                    },
                    json=request_body,
                ) as response:
                    if response.status_code != 200:
                        return unavailable
                    content_length = response.headers.get('content-length')
                    if content_length is not None:
                        try:
                            if int(content_length) > self._workload_response_limit:
                                return unavailable
                        except ValueError:
                            return unavailable

                    response_body = bytearray()
                    async for chunk in response.aiter_raw(
                        chunk_size=self._workload_response_limit + 1
                    ):
                        response_body.extend(chunk)
                        if len(response_body) > self._workload_response_limit:
                            return unavailable

            payload = json.loads(response_body, object_pairs_hook=_unique_json_object)
            if not isinstance(payload, dict):
                return unavailable
            success = _response_field(payload, 'Success', 'success')
            data = _response_field(payload, 'Data', 'data')
            if type(success) is not bool or not success or not isinstance(data, dict):
                return unavailable

            has_permission = _response_field(data, 'HasPermission', 'hasPermission')
            raw_user_id = _response_field(data, 'UserId', 'userId')
            raw_workspace_id = _response_field(data, 'WorkspaceId', 'workspaceId')
            if (
                type(has_permission) is not bool
                or not isinstance(raw_user_id, str)
                or not isinstance(raw_workspace_id, str)
            ):
                return unavailable

            response_user_id = UUID(raw_user_id)
            response_workspace_id = UUID(raw_workspace_id)
            if (
                response_user_id.int == 0
                or response_workspace_id.int == 0
                or response_user_id != user_id
                or response_workspace_id != workspace_id
            ):
                return unavailable

            return FunctionalAuthorizationResult(
                has_permission,
                True,
                True,
                user_id=response_user_id,
                workspace_id=response_workspace_id,
            )
        except (httpx.HTTPError, ValueError, TypeError, RecursionError):
            return unavailable


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

    from tradelab_api.core.context import ExecutionContext

    request.state.actor = SecurityActor(
        user_id=result.user_id,
        workspace_id=result.workspace_id,
        username=result.username,
    )
    request.state.execution_context = ExecutionContext(
        workspace_id=result.workspace_id,
        actor_user_id=result.user_id,
        permission_key=permission_key,
        action=action,
        resource_type="route",
        resource_id=None,
        run_id=None,
        correlation_id=request.headers.get("x-correlation-id") or str(uuid4()),
        authority_verified_at=datetime.now(timezone.utc),
        authority_deadline_monotonic=time.monotonic() + 7.0,
    )
    return None
