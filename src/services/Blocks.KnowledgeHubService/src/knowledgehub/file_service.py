import asyncio
import re
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse
from uuid import UUID

import grpc
from fastapi import HTTPException, Request

from knowledgehub.config import Settings
from knowledgehub.identity import AuthenticatedUser
from knowledgehub.rpc import file_pb2, file_pb2_grpc


@dataclass(frozen=True)
class FinalizedFile:
    file_id: UUID
    document_id: UUID
    storage_key: str
    original_filename: str
    file_extension: str
    size_bytes: int
    source_sha256: str


@dataclass(frozen=True)
class FilePreview:
    content: bytes
    file_name: str
    content_type: str


class FileServiceClient:
    def __init__(
        self,
        settings: Settings,
        channel: grpc.aio.Channel | None = None,
        stub: file_pb2_grpc.FileProtoStub | None = None,
    ):
        self.settings = settings
        self.__owns_channel = False
        self.__download_semaphore = asyncio.Semaphore(1)

        if stub is not None:
            self.channel = channel
            self.stub = stub
        else:
            parsed = urlparse(settings.file_grpc_url)
            target = f"{parsed.hostname}:{parsed.port}"
            root_certs = settings.file_grpc_ca_file.read_bytes()
            credentials = grpc.ssl_channel_credentials(root_certificates=root_certs)
            self.channel = grpc.aio.secure_channel(
                target,
                credentials,
                options=(("grpc.max_receive_message_length", 64 * 1024 * 1024),),
            )
            self.stub = file_pb2_grpc.FileProtoStub(self.channel)
            self.__owns_channel = True

    @staticmethod
    def _metadata(user: AuthenticatedUser):
        return (("x-service-authorization", "Bearer " + user.token),)

    @staticmethod
    def _map_rpc_error(error: grpc.RpcError) -> HTTPException:
        code = error.code()
        mapping = {
            grpc.StatusCode.UNAUTHENTICATED: (401, "Xác thực không thành công"),
            grpc.StatusCode.PERMISSION_DENIED: (403, "Bạn không có quyền truy cập"),
            grpc.StatusCode.NOT_FOUND: (404, "Không tìm thấy tài nguyên"),
            grpc.StatusCode.INVALID_ARGUMENT: (400, "Yêu cầu tệp không hợp lệ"),
            grpc.StatusCode.FAILED_PRECONDITION: (409, "Trạng thái tệp không hợp lệ"),
            grpc.StatusCode.RESOURCE_EXHAUSTED: (
                413,
                "Tệp vượt quá giới hạn dung lượng",
            ),
            grpc.StatusCode.UNAVAILABLE: (503, "FileService tạm thời không khả dụng"),
            grpc.StatusCode.DEADLINE_EXCEEDED: (503, "FileService xử lý quá thời gian"),
            grpc.StatusCode.INTERNAL: (503, "FileService gặp lỗi nội bộ"),
        }
        status, message = mapping.get(
            code,
            (503, "FileService tạm thời không khả dụng"),
        )
        return HTTPException(status_code=status, detail=message)

    @staticmethod
    def _validate_storage_key(
        key: str, document_id: UUID, file_id: UUID, extension: str
    ):
        parts = key.split("/")
        expected_name = str(file_id) + extension

        if (
            len(parts) != 4
            or parts[0] != "KnowledgeHub"
            or parts[1] != "Documents"
            or parts[2] != str(document_id)
            or parts[3] != expected_name
            or extension not in (".pdf", ".md", ".txt")
        ):
            raise HTTPException(
                status_code=503,
                detail="FileService trả về storage key không hợp lệ",
            )

    async def finalize_upload(
        self,
        user: AuthenticatedUser,
        document_id: UUID,
        upload_session_id: UUID,
        original_filename: str,
        file_extension: str,
        declared_size_bytes: int,
    ) -> FinalizedFile:
        request = file_pb2.UploadDataRequest(
            related_id=str(document_id),
            service_path="KnowledgeHub",
            folder_name="Documents",
            temp_folder=str(upload_session_id),
        )

        try:
            response = await self.stub.UploadData(
                request,
                metadata=self._metadata(user),
                timeout=self.settings.file_rpc_timeout_seconds,
            )
        except asyncio.CancelledError:
            raise
        except grpc.RpcError as e:
            raise self._map_rpc_error(e) from None

        if len(response.attachments) != 1:
            raise HTTPException(
                status_code=503,
                detail="FileService trả về số lượng tệp không hợp lệ",
            )

        item = response.attachments[0]
        try:
            file_id = UUID(item.id)
            returned_document_id = UUID(item.related_id)
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=503,
                detail="FileService trả về định danh không hợp lệ",
            ) from None

        if (
            file_id.int == 0
            or returned_document_id != document_id
            or item.file_extension != file_extension
            or item.file_name != Path(original_filename).stem
            or not item.HasField("file_size")
        ):
            raise HTTPException(
                status_code=503,
                detail="Metadata FileService không khớp upload intent",
            )

        size_value = item.file_size.value
        if (
            not size_value.is_integer()
            or int(size_value) != declared_size_bytes
            or int(size_value) <= 0
            or int(size_value) > 52_428_800
        ):
            raise HTTPException(
                status_code=503,
                detail="Kích thước FileService không khớp upload intent",
            )

        if not re.fullmatch(r"[0-9a-fA-F]{64}", item.source_sha256):
            raise HTTPException(
                status_code=503,
                detail="SHA256 FileService không hợp lệ",
            )

        self._validate_storage_key(item.file_url, document_id, file_id, file_extension)

        return FinalizedFile(
            file_id=file_id,
            document_id=document_id,
            storage_key=item.file_url,
            original_filename=original_filename,
            file_extension=file_extension,
            size_bytes=int(size_value),
            source_sha256=item.source_sha256,
        )

    async def preview_file(
        self,
        user: AuthenticatedUser,
        storage_key: str,
    ) -> FilePreview:
        request = file_pb2.PreviewFileRequest(file_url=storage_key)

        async with self.__download_semaphore:
            try:
                response = await self.stub.PreviewFile(
                    request,
                    metadata=self._metadata(user),
                    timeout=self.settings.file_rpc_timeout_seconds,
                )
            except asyncio.CancelledError:
                raise
            except grpc.RpcError as e:
                raise self._map_rpc_error(e) from None

        if len(response.file_content) > 52_428_800:
            raise HTTPException(
                status_code=413,
                detail="Tệp vượt quá giới hạn dung lượng",
            )

        return FilePreview(
            content=bytes(response.file_content),
            file_name=response.file_name,
            content_type=response.content_type or "application/octet-stream",
        )

    async def delete_file(self, user: AuthenticatedUser, storage_key: str) -> bool:
        request = file_pb2.DeleteDataRequest(file_paths=[storage_key])

        try:
            response = await self.stub.DeleteData(
                request,
                metadata=self._metadata(user),
                timeout=self.settings.file_rpc_timeout_seconds,
            )
        except asyncio.CancelledError:
            raise
        except grpc.RpcError as e:
            raise self._map_rpc_error(e) from None

        return response.success

    async def check_channel_health(self) -> bool:
        if self.channel is None:
            return True
        try:
            await asyncio.wait_for(
                self.channel.channel_ready(),
                timeout=min(self.settings.file_rpc_timeout_seconds, 2.0),
            )
            return True
        except Exception:
            return False

    async def close(self) -> None:
        if self.__owns_channel and self.channel is not None:
            await self.channel.close()


def get_file_service_client(request: Request) -> FileServiceClient:
    client = getattr(request.app.state, "file_service_client", None)
    if client is None:
        raise RuntimeError("FileServiceClient is not initialized in application state")

    return client
