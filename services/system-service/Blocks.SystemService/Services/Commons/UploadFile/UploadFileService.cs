using Blocks.FileService.Protos;
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

        public async Task<string> UploadAvatarAsync(string folderUploadId, string? oldImage)
        {
            var response = await _fileProtoClient.UploadAvatarAsync(new UploadAvatarRequest
            {
                FolderUploadId = folderUploadId,
                OldImage = string.IsNullOrEmpty(oldImage) ? string.Empty : oldImage
            });

            return response.NewImage;
        }
    }
}