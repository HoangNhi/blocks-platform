using Blocks.FileService.Protos;
using Blocks.FileService.Services.CoreFeature.UploadFile;
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

        public override Task<UploadDataResponse> UploadData(UploadDataRequest request, ServerCallContext context)
        {
            var result = _uploadFileService.UploadData(
                request.RelatedId,
                request.ServicePath,
                request.FolderName,
                request.TempFolder
            );

            var response = new UploadDataResponse();

            if (result != null)
            {
                foreach (var item in result)
                {
                    response.Attachments.Add(new ModelAttachmentProto
                    {
                        Id = item.Id.ToString(),
                        ReferenceType = item.ReferenceType,
                        RelatedId = item.RelatedId.ToString(),
                        FileName = item.FileName ?? string.Empty,
                        FileExtension = item.FileExtension ?? string.Empty,
                        FileSize = item.FileSize.HasValue ? item.FileSize.Value : null,
                        FileUrl = item.FileUrl ?? string.Empty,
                        FullFileName = item.FullFileName ?? string.Empty
                    });
                }
            }

            return Task.FromResult(response);
        }

        public override Task<DeleteDataResponse> DeleteData(DeleteDataRequest request, ServerCallContext context)
        {
            var result = _uploadFileService.DeleteData(
                request.FilePaths
            );

            var response = new DeleteDataResponse
            {
                Success = result
            };
            return Task.FromResult(response);
        }

        public override Task<UploadAvatarResponse> UploadAvatar(UploadAvatarRequest request, ServerCallContext context)
        {
            var result = _uploadFileService.UploadAvatar(
                request.FolderUploadId, request.OldImage
            );

            var response = new UploadAvatarResponse
            {
                NewImage = result
            };

            return Task.FromResult(response);
        }

        public override async Task<PreviewFileResponse> PreviewFile(PreviewFileRequest request, ServerCallContext context)
        {
            // Legacy clients must not receive an unmarked original when requesting a watermark.
            if (!string.IsNullOrWhiteSpace(request.WatermarkText))
            {
                throw new RpcException(new Status(StatusCode.Unimplemented, "Watermarking is no longer supported."));
            }

            var result = await _uploadFileService.PreviewFileAsync(request.FileUrl);

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
    }
}
