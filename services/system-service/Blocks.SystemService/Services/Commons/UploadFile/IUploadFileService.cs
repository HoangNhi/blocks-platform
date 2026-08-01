using Blocks.Shared.DTOs.Base;

namespace Blocks.SystemService.Services.Commons.UploadFile
{
    public interface IUploadFileService
    {
        Task<string> UploadAvatarAsync(string folderUploadId, string? oldImage);
    }
}