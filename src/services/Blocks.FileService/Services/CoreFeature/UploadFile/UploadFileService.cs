using AutoDependencyRegistration.Attributes;
using Blocks.FileService.DTOs.Common;
using Blocks.FileService.Infrastructure.Storage;
using Blocks.Shared.DTOs.Base;
using Blocks.Shared.Exceptions;
using Microsoft.AspNetCore.StaticFiles;
using System.Security.Claims;

namespace Blocks.FileService.Services.CoreFeature.UploadFile
{
    [RegisterClassAsTransient]
    public class UploadFileService : IUploadFileService
    {
        private readonly FileStorage _storage;
        private readonly IHttpContextAccessor _contextAccessor;

        public UploadFileService(FileStorage storage, IHttpContextAccessor contextAccessor)
        {
            _storage = storage;
            _contextAccessor = contextAccessor;
        }

        private Guid GetActorId()
        {
            var user = _contextAccessor.HttpContext?.User;
            if (user == null)
            {
                throw new BusinessException("Xác thực không thành công: thiếu ngữ cảnh người dùng", 401);
            }

            var claimValue = user.FindFirst("name")?.Value ??
                             user.FindFirst(ClaimTypes.NameIdentifier)?.Value ??
                             user.FindFirst("unique_name")?.Value;

            if (string.IsNullOrWhiteSpace(claimValue) || !Guid.TryParseExact(claimValue, "D", out var actorId) || actorId == Guid.Empty)
            {
                throw new BusinessException("Xác thực không thành công: định danh người dùng không hợp lệ", 401);
            }

            return actorId;
        }

        public async Task Insert(List<IFormFile> files, string FolderName)
        {
            if (files == null || files.Count == 0)
            {
                throw new BusinessException("Danh sách tệp rỗng", 400);
            }

            if (string.IsNullOrWhiteSpace(FolderName) ||
                !Guid.TryParseExact(FolderName, "D", out var folderGuid) ||
                folderGuid == Guid.Empty)
            {
                throw new BusinessException("Thư mục lưu trữ không hợp lệ", 400);
            }

            var actorId = GetActorId();
            var sessionPath = _storage.ResolveSession(actorId, folderGuid);
            Directory.CreateDirectory(sessionPath);

            long totalBytes = 0;
            foreach (var file in files)
            {
                if (file == null || file.Length == 0)
                {
                    throw new BusinessException("Tệp tải lên không được rỗng", 400);
                }

                totalBytes += file.Length;
                if (totalBytes > FileStorage.MaxFileBytes)
                {
                    throw new BusinessException("Tổng dung lượng tệp vượt quá giới hạn", 413);
                }

                ValidateUploadFileName(file.FileName);

                var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
                if (!IsValidExtension(ext))
                {
                    throw new BusinessException("Định dạng tệp không được hỗ trợ", 400);
                }

                var physicalFileName = $"{Guid.NewGuid():D}{ext}";
                var targetPath = Path.Combine(sessionPath, physicalFileName);

                using (var stream = new FileStream(targetPath, FileMode.CreateNew, FileAccess.Write))
                {
                    await file.CopyToAsync(stream);
                }
            }
        }

        public async Task<List<ModelAttachment>> InsertAndReturn(List<IFormFile> files, string folderName)
        {
            await Insert(files, folderName);
            var embedId = Guid.NewGuid();
            return UploadData(embedId, "System", "Attachments", folderName);
        }

        public List<ModelAttachment> UploadData(object lienKetId, string servicePath, string folderName, string tempFolder)
        {
            if (!string.Equals(servicePath, "System", StringComparison.OrdinalIgnoreCase) ||
                !string.Equals(folderName, "Attachments", StringComparison.OrdinalIgnoreCase))
            {
                throw new BusinessException("Mục tiêu lưu trữ không hợp lệ hoặc chưa được đăng ký", 400);
            }

            if (lienKetId == null || !Guid.TryParse(lienKetId.ToString(), out var relatedGuid) || relatedGuid == Guid.Empty)
            {
                throw new BusinessException("Mã liên kết không hợp lệ", 400);
            }

            if (string.IsNullOrWhiteSpace(tempFolder) ||
                !Guid.TryParseExact(tempFolder, "D", out var folderGuid) ||
                folderGuid == Guid.Empty)
            {
                throw new BusinessException("Thư mục lưu trữ tạm không hợp lệ", 400);
            }

            var actorId = GetActorId();
            var sourceDir = _storage.ResolveSession(actorId, folderGuid);
            if (!Directory.Exists(sourceDir))
            {
                throw new BusinessException("Thư mục tạm không tồn tại", 404);
            }

            var result = new List<ModelAttachment>();
            var files = Directory.GetFiles(sourceDir);

            foreach (var f in files)
            {
                var fileInfo = new FileInfo(f);
                var fileLength = fileInfo.Length;
                var fileExt = fileInfo.Extension.ToLowerInvariant();
                var fileGuid = Guid.NewGuid();
                var destFileName = $"{fileGuid:D}{fileExt}";
                var destPath = _storage.Resolve(StorageArea.Files, "System", "Attachments", relatedGuid.ToString("D"), destFileName);

                var destDir = Path.GetDirectoryName(destPath)!;
                Directory.CreateDirectory(destDir);
                File.Move(f, destPath, overwrite: true);

                result.Add(new ModelAttachment
                {
                    Id = fileGuid,
                    FileName = destFileName,
                    FileUrl = $"System/Attachments/{relatedGuid:D}/{destFileName}",
                    FileExtension = fileExt,
                    FileSize = (int)fileLength
                });
            }

            return result;
        }

        public bool DeleteData(IEnumerable<string> filePaths)
        {
            if (filePaths == null || !filePaths.Any())
            {
                return true;
            }

            bool allSuccess = true;
            foreach (var filePath in filePaths)
            {
                try
                {
                    var sourcePath = _storage.ResolveActiveKey(filePath);
                    if (!File.Exists(sourcePath))
                    {
                        allSuccess = false;
                        continue;
                    }

                    var deletionId = Guid.NewGuid().ToString("D");
                    var fileName = Path.GetFileName(sourcePath);
                    var destPath = _storage.Resolve(StorageArea.Deleted, deletionId, fileName);

                    var destDir = Path.GetDirectoryName(destPath)!;
                    Directory.CreateDirectory(destDir);

                    File.Move(sourcePath, destPath);
                }
                catch (Exception)
                {
                    allSuccess = false;
                }
            }

            return allSuccess;
        }

        public string UploadAvatar(string folderUploadId, string oldImage)
        {
            if (string.IsNullOrWhiteSpace(folderUploadId) ||
                !Guid.TryParseExact(folderUploadId, "D", out var folderGuid) ||
                folderGuid == Guid.Empty)
            {
                throw new BusinessException("Thư mục tải lên không hợp lệ", 400);
            }

            var actorId = GetActorId();
            var sourceDir = _storage.ResolveSession(actorId, folderGuid);
            if (!Directory.Exists(sourceDir))
            {
                return oldImage ?? string.Empty;
            }

            var files = Directory.GetFiles(sourceDir);
            if (files.Length == 0)
            {
                return oldImage ?? string.Empty;
            }

            var firstFile = files[0];
            var ext = Path.GetExtension(firstFile).ToLowerInvariant();
            var avatarGuid = Guid.NewGuid();
            var avatarFileName = $"{avatarGuid:D}{ext}";
            var avatarPath = _storage.ResolveAvatar(avatarFileName);

            Directory.CreateDirectory(Path.GetDirectoryName(avatarPath)!);
            File.Move(firstFile, avatarPath, overwrite: true);

            try
            {
                Directory.Delete(sourceDir, recursive: true);
            }
            catch
            {
                // Best-effort cleanup
            }

            return $"System/Avatar/{avatarFileName}";
        }

        public async Task<ModelFilePreview> PreviewFileAsync(string fileUrl)
        {
            if (string.IsNullOrWhiteSpace(fileUrl))
            {
                throw new BusinessException("Đường dẫn tệp không hợp lệ", 400);
            }

            var absolutePath = _storage.ResolveActiveKey(fileUrl);
            if (!File.Exists(absolutePath))
            {
                throw new BusinessException("Tệp không tồn tại", 404);
            }

            var fileInfo = new FileInfo(absolutePath);
            if (fileInfo.Length > FileStorage.MaxFileBytes)
            {
                throw new BusinessException("Kích thước tệp vượt quá giới hạn", 413);
            }

            var originalContentType = GetContentType(absolutePath);
            var fileContent = await File.ReadAllBytesAsync(absolutePath);
            var fileName = Path.GetFileName(absolutePath);

            return new ModelFilePreview
            {
                FileContent = fileContent,
                ContentType = originalContentType,
                FileName = fileName,
                OriginalContentType = originalContentType
            };
        }

        private static void ValidateUploadFileName(string fileName)
        {
            if (string.IsNullOrWhiteSpace(fileName))
            {
                throw new BusinessException("Tên tệp không được rỗng", 400);
            }

            if (fileName.Contains('/') || fileName.Contains('\\') || fileName.Contains(':') ||
                fileName.Contains("..") || fileName.Any(char.IsControl))
            {
                throw new BusinessException("Tên tệp chứa ký tự không hợp lệ", 400);
            }
        }

        private static bool IsValidExtension(string ext)
        {
            string[] valid = CommonConst._fileHinhAnhValid
                .Concat(CommonConst._fileVideoValid)
                .Concat(CommonConst._fileAudioValid)
                .Concat(CommonConst._fileTaiLieuValid)
                .ToArray();

            return valid.Contains(ext);
        }

        private static string GetContentType(string filePath)
        {
            var provider = new FileExtensionContentTypeProvider();
            if (provider.TryGetContentType(filePath, out var contentType))
            {
                return contentType;
            }

            return "application/octet-stream";
        }
    }
}
