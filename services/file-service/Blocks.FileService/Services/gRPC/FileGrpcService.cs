using Blocks.FileService.Protos;
using Blocks.FileService.Authorization;
using Blocks.FileService.Services.CoreFeature.UploadFile;
using Grpc.Core;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;

namespace Blocks.FileService.Services.Grpc;

[Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
public class FileGrpcService : FileProto.FileProtoBase
{
    private readonly IUploadFileService _uploadFileService;
    private readonly SystemFunctionalAuthorizationClient _authorization;

    public FileGrpcService(IUploadFileService uploadFileService, SystemFunctionalAuthorizationClient authorization)
    {
        _uploadFileService = uploadFileService;
        _authorization = authorization;
    }

    public override async Task<UploadDataResponse> UploadData(UploadDataRequest request, ServerCallContext context)
    {
        await EnsureAllowedAsync(Blocks.Shared.Authorization.FunctionalPermissionAction.ADD, context);
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

        return response;
    }

    public override async Task<DeleteDataResponse> DeleteData(DeleteDataRequest request, ServerCallContext context)
    {
        await EnsureAllowedAsync(Blocks.Shared.Authorization.FunctionalPermissionAction.DELETE, context);
        var deleted = _uploadFileService.DeleteData(request.FilePaths);
        return new DeleteDataResponse { Success = deleted };
    }

    public override async Task<UploadAvatarResponse> UploadAvatar(UploadAvatarRequest request, ServerCallContext context)
    {
        await EnsureAllowedAsync(Blocks.Shared.Authorization.FunctionalPermissionAction.UPDATE, context);
        var newImage = _uploadFileService.UploadAvatar(request.FolderUploadId, request.OldImage);
        return new UploadAvatarResponse { NewImage = newImage };
    }

    private async Task EnsureAllowedAsync(Blocks.Shared.Authorization.FunctionalPermissionAction action, ServerCallContext context)
    {
        var result = await _authorization.CheckAsync("files.library", action, context.CancellationToken);
        if (!result.Authenticated)
        {
            throw new RpcException(new Status(StatusCode.Unauthenticated, "Authentication token is required."));
        }

        if (!result.AuthorityAvailable)
        {
            throw new RpcException(new Status(StatusCode.Unavailable, "Authorization authority unavailable."));
        }

        if (!result.Allowed)
        {
            throw new RpcException(new Status(StatusCode.PermissionDenied, "File permission is required."));
        }
    }
}
