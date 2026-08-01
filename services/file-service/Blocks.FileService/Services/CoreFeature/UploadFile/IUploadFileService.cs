using Blocks.Shared.DTOs.Base;

namespace Blocks.FileService.Services.CoreFeature.UploadFile;

public interface IUploadFileService
{
    Task Insert(List<IFormFile> files, string folderName);
    Task<List<ModelAttachment>> InsertAndReturn(List<IFormFile> files, string folderName);
    List<ModelAttachment> UploadData(object relatedId, string servicePath, string folderName, string tempFolder);
    bool DeleteData(IEnumerable<string> filePaths);
    string UploadAvatar(string folderUploadId, string oldImage);
}
