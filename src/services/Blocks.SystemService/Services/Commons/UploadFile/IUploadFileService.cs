using Blocks.Shared.DTOs.Base;

namespace Blocks.SystemService.Services.Commons.UploadFile
{
    public interface IUploadFileService
    {
        Task<List<ModelAttachment>> UploadDataAsync(string lienKetId, string folderName, string tempFolder);
        Task<bool> DeleteDataAsync(List<string> filePaths);
        Task<string> UploadAvatarAsync(string folderUploadId, string? oldImage);
    }
}
