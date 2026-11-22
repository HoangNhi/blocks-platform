using Blocks.FileService.Protos;
using Blocks.FileService.Services.CoreFeature.UploadFile;
using Blocks.Shared.Exceptions;
using Grpc.Core;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;

namespace Blocks.FileService.Services.Grpc
{
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    public class FileGrpcService : FileProto.FileProtoBase
    {
        private readonly IUploadFileService _uploadFileService;

        public FileGrpcService(IUploadFileService uploadFileService)
        {
            _uploadFileService = uploadFileService;
        }

        public override async Task<UploadDataResponse> UploadData(UploadDataRequest request, ServerCallContext context)
        {
            var ct = context?.CancellationToken ?? CancellationToken.None;
            try
            {
                var result = await _uploadFileService.UploadDataWithMetadataAsync(
                    request.RelatedId,
                    request.ServicePath,
                    request.FolderName,
                    request.TempFolder,
                    ct
                );

                var response = new UploadDataResponse();
                if (result != null)
                {
                    foreach (var item in result)
                    {
                        var attachment = item.Attachment;
                        response.Attachments.Add(new ModelAttachmentProto
                        {
                            Id = attachment.Id.ToString(),
                            ReferenceType = attachment.ReferenceType,
                            RelatedId = attachment.RelatedId.ToString(),
                            FileName = attachment.FileName ?? string.Empty,
                            FileExtension = attachment.FileExtension ?? string.Empty,
                            FileSize = attachment.FileSize.HasValue ? attachment.FileSize.Value : null,
                            FileUrl = attachment.FileUrl ?? string.Empty,
                            FullFileName = attachment.FullFileName ?? string.Empty,
                            SourceSha256 = item.SourceSha256
                        });

                    }
                }

                return response;
            }
            catch (Exception ex)
            {
                throw MapToRpcException(ex);
            }
        }

        public override async Task<DeleteDataResponse> DeleteData(DeleteDataRequest request, ServerCallContext context)
        {
            var ct = context?.CancellationToken ?? CancellationToken.None;
            try
            {
                var result = await _uploadFileService.DeleteDataAsync(
                    request.FilePaths,
                    ct
                );

                return new DeleteDataResponse { Success = result };
            }
            catch (Exception ex)
            {
                throw MapToRpcException(ex);
            }
        }

        public override async Task<UploadAvatarResponse> UploadAvatar(UploadAvatarRequest request, ServerCallContext context)
        {
            var ct = context?.CancellationToken ?? CancellationToken.None;
            try
            {
                var result = await _uploadFileService.UploadAvatarAsync(
                    request.FolderUploadId,
                    ct
                );

                return new UploadAvatarResponse { NewImage = result };
            }
            catch (Exception ex)
            {
                throw MapToRpcException(ex);
            }
        }

        public override async Task<PreviewFileResponse> PreviewFile(PreviewFileRequest request, ServerCallContext context)
        {
            if (!string.IsNullOrWhiteSpace(request.WatermarkText))
            {
                throw new RpcException(new Status(StatusCode.Unimplemented, "Watermarking is no longer supported."));
            }

            var ct = context?.CancellationToken ?? CancellationToken.None;
            try
            {
                var result = await _uploadFileService.PreviewFileAsync(request.FileUrl, ct);

                return new PreviewFileResponse
                {
                    FileContent = Google.Protobuf.ByteString.CopyFrom(result.FileContent),
                    ContentType = result.ContentType,
                    FileName = result.FileName,
                    HasWatermark = result.HasWatermark,
                    OriginalContentType = result.OriginalContentType ?? string.Empty,
                    ConvertedContentType = result.ConvertedContentType ?? string.Empty
                };
            }
            catch (Exception ex)
            {
                throw MapToRpcException(ex);
            }
        }

        private static RpcException MapToRpcException(Exception ex)
        {
            if (ex is RpcException rpc)
            {
                return rpc;
            }

            if (ex is BusinessException bEx)
            {
                var statusCode = bEx.StatusCode switch
                {
                    400 => StatusCode.InvalidArgument,
                    401 => StatusCode.Unauthenticated,
                    403 => StatusCode.PermissionDenied,
                    404 => StatusCode.NotFound,
                    409 => StatusCode.FailedPrecondition,
                    413 => StatusCode.ResourceExhausted,
                    _ => StatusCode.Internal
                };

                return new RpcException(new Status(statusCode, bEx.Message));
            }

            if (ex is IOException)
            {
                return new RpcException(new Status(StatusCode.Internal, "Lỗi truy cập hệ thống tệp tin"));
            }

            return new RpcException(new Status(StatusCode.Internal, "Lỗi nội bộ máy chủ"));
        }
    }
}
