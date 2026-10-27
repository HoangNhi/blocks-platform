using Blocks.Shared.DTOs.Base;

namespace Blocks.FileService.Services.CoreFeature.UploadFile
{
    public interface IUploadFileService
    {
        Task Insert(List<IFormFile> files, string FolderName, CancellationToken cancellationToken = default);
        Task<List<ModelAttachment>> UploadDataAsync(string relatedId, string servicePath, string folderName, string tempFolder, CancellationToken cancellationToken = default);
        Task<bool> DeleteDataAsync(IEnumerable<string> filePaths, CancellationToken cancellationToken = default);
        Task<string> UploadAvatarAsync(string folderUploadId, CancellationToken cancellationToken = default);
        Task<ModelFilePreview> PreviewFileAsync(string fileUrl, CancellationToken cancellationToken = default);
        Task<ModelFilePreview> PreviewAvatarAsync(string fileName, CancellationToken cancellationToken = default);
    }
}
