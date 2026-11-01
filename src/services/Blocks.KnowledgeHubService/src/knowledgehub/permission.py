import asyncio
from urllib.parse import urlparse

import grpc
from fastapi import Depends, HTTPException, Request

from knowledgehub.config import Settings
from knowledgehub.identity import AuthenticatedUser, get_current_user
from knowledgehub.rpc import system_pb2, system_pb2_grpc


class PermissionClient:
    def __init__(
        self,
        settings: Settings,
        channel: grpc.aio.Channel | None = None,
        stub: system_pb2_grpc.SystemProtoStub | None = None,
    ):
        self.settings = settings
        self._owns_channel = False

        if stub is not None:
            self.stub = stub
            self.channel = channel
        else:
            parsed = urlparse(settings.system_grpc_url)
            target = f"{parsed.hostname}:{parsed.port}"

            root_certs = settings.system_grpc_ca_file.read_bytes()
            credentials = grpc.ssl_channel_credentials(root_certificates=root_certs)

            self.channel = grpc.aio.secure_channel(target, credentials)
            self.stub = system_pb2_grpc.SystemProtoStub(self.channel)
            self._owns_channel = True

    async def check_permission(
        self, user: AuthenticatedUser, controller: str, action: int
    ) -> bool:
        req = system_pb2.CheckPermissionRequest(
            user_id=str(user.actor_id), controller=controller, action=action
        )
        metadata = (("x-service-authorization", f"Bearer {user.token}"),)

        try:
            resp = await self.stub.CheckPermission(
                req,
                metadata=metadata,
                timeout=self.settings.permission_timeout_seconds,
            )
            return bool(resp.success)
        except asyncio.CancelledError:
            raise
        except grpc.RpcError as e:
            code = e.code() if hasattr(e, "code") else None
            if code == grpc.StatusCode.UNAUTHENTICATED:
                raise HTTPException(status_code=401, detail="Xác thực không thành công")
            elif code == grpc.StatusCode.PERMISSION_DENIED:
                raise HTTPException(status_code=403, detail="Bạn không có quyền truy cập")
            elif code in (
                grpc.StatusCode.UNAVAILABLE,
                grpc.StatusCode.DEADLINE_EXCEEDED,
                grpc.StatusCode.INTERNAL,
            ):
                raise HTTPException(
                    status_code=503,
                    detail="Dịch vụ xác thực quyền tạm thời không khả dụng",
                )
            else:
                raise HTTPException(
                    status_code=503,
                    detail="Dịch vụ xác thực quyền tạm thời không khả dụng",
                )

    async def check_channel_health(self) -> bool:
        if self.channel is None:
            return True
        try:
            await asyncio.wait_for(
                self.channel.channel_ready(),
                timeout=min(self.settings.permission_timeout_seconds, 2.0),
            )
            return True
        except (TimeoutError, Exception):
            return False

    async def close(self) -> None:
        if self._owns_channel and self.channel is not None:
            await self.channel.close()


def get_permission_client(request: Request) -> PermissionClient:
    client = getattr(request.app.state, "permission_client", None)
    if client is None:
        raise RuntimeError("PermissionClient is not initialized in application state")
    return client


def require_permission(controller: str, action: int):
    async def dependency(
        user: AuthenticatedUser = Depends(get_current_user),
        permission_client: PermissionClient = Depends(get_permission_client),
    ) -> AuthenticatedUser:
        allowed = await permission_client.check_permission(user, controller, action)
        if not allowed:
            raise HTTPException(status_code=403, detail="Bạn không có quyền truy cập")
        return user

    return dependency
