using Blocks.FileService.Protos;
using Blocks.FileService.Services.CoreFeature.UploadFile;
using Grpc.Core;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;

namespace Blocks.FileService.Services.Grpc;

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
            request.TempFolder);

        var response = new UploadDataResponse();

        foreach (var item in result)
        {
            response.Attachments.Add(new ModelAttachmentProto
            {
                Id = item.Id.ToString(),
                ReferenceType = item.ReferenceType,
                RelatedId = item.RelatedId.ToString(),
                FileName = item.FileName ?? string.Empty,
                FileExtension = item.FileExtension ?? string.Empty,
                FileSize = item.FileSize,
                FileUrl = item.FileUrl ?? string.Empty,
                FullFileName = item.FullFileName ?? string.Empty
            });
        }

        return Task.FromResult(response);
    }

    public override Task<DeleteDataResponse> DeleteData(DeleteDataRequest request, ServerCallContext context)
    {
        var deleted = _uploadFileService.DeleteData(request.FilePaths);
        return Task.FromResult(new DeleteDataResponse { Success = deleted });
    }

    public override Task<UploadAvatarResponse> UploadAvatar(UploadAvatarRequest request, ServerCallContext context)
    {
        var newImage = _uploadFileService.UploadAvatar(request.FolderUploadId, request.OldImage);
        return Task.FromResult(new UploadAvatarResponse { NewImage = newImage });
    }
}
