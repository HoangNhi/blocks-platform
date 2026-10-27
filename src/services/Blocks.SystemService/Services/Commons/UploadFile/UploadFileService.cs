using Blocks.FileService.Protos;
using Blocks.Shared.DTOs.Base;
using AutoDependencyRegistration.Attributes;

namespace Blocks.SystemService.Services.Commons.UploadFile
{
    [RegisterClassAsTransient]
    public class UploadFileService : IUploadFileService
    {
        private readonly FileProto.FileProtoClient _fileProtoClient;

        public UploadFileService(FileProto.FileProtoClient fileProtoClient)
        {
            _fileProtoClient = fileProtoClient;
        }

        public async Task<List<ModelAttachment>> UploadDataAsync(string relatedId, string folderName, string tempFolder)
        {
            var request = new UploadDataRequest
            {
                RelatedId = relatedId,
                ServicePath = "System",
                FolderName = folderName,
                TempFolder = tempFolder
            };

            var response = await _fileProtoClient.UploadDataAsync(request);

            return response.Attachments.Select(x => new ModelAttachment
            {
                Id = Guid.TryParse(x.Id, out var id) ? id : Guid.Empty,
                ReferenceType = x.ReferenceType,
                RelatedId = Guid.Parse(relatedId),
                FileName = x.FileName,
                FileExtension = x.FileExtension,
                FileSize = x.FileSize,
                FileUrl = x.FileUrl
            }).ToList();
        }

        public async Task<bool> DeleteDataAsync(List<string> filePaths)
        {
            var request = new DeleteDataRequest();
            request.FilePaths.AddRange(filePaths);
            var response = await _fileProtoClient.DeleteDataAsync(request);
            return response.Success;
        }

        public async Task<string> UploadAvatarAsync(string folderUploadId, string? oldImage)
        {
            var request = new UploadAvatarRequest
            {
                FolderUploadId = folderUploadId,
                OldImage = string.IsNullOrEmpty(oldImage) ? "" : oldImage
            };

            var response = await _fileProtoClient.UploadAvatarAsync(request);

            return response.NewImage;
        }
    }
}
