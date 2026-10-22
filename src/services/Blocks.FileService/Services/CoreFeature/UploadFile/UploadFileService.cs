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
        private readonly UploadSessionStore _sessions;
        private readonly IHttpContextAccessor _contextAccessor;

        public UploadFileService(FileStorage storage, UploadSessionStore sessions, IHttpContextAccessor contextAccessor)
        {
            _storage = storage;
            _sessions = sessions;
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

        public async Task Insert(List<IFormFile> files, string FolderName, CancellationToken cancellationToken = default)
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

            // Validate all files in the batch first
            long declaredTotal = 0;
            foreach (var file in files)
            {
                if (file == null || file.Length == 0)
                {
                    throw new BusinessException("Tệp tải lên không được rỗng", 400);
                }

                declaredTotal += file.Length;
                if (declaredTotal > FileStorage.MaxFileBytes)
                {
                    throw new BusinessException("Tổng dung lượng tệp vượt quá giới hạn", 413);
                }

                ValidateUploadFileName(file.FileName);

                var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
                if (!IsValidExtension(ext))
                {
                    throw new BusinessException("Định dạng tệp không được hỗ trợ", 400);
                }
            }

            // Acquire singleton write gate
            await _sessions.WriteGate.WaitAsync(cancellationToken);
            try
            {
                var sessionDir = _storage.ResolveSession(actorId, folderGuid);
                Directory.CreateDirectory(sessionDir);

                var batchId = Guid.NewGuid();
                var batchDir = Path.Combine(sessionDir, "batches", batchId.ToString("D"));
                Directory.CreateDirectory(batchDir);

                var storedFiles = new List<StoredUploadFile>();
                long totalBytesWritten = 0;

                foreach (var file in files)
                {
                    var fileId = Guid.NewGuid();
                    var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
                    var physicalFileName = $"{fileId:D}{ext}";
                    var targetFilePath = Path.Combine(batchDir, physicalFileName);

                    long fileBytesWritten = 0;
                    using (var inputStream = file.OpenReadStream())
                    using (var outputStream = new FileStream(targetFilePath, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                    {
                        var buffer = new byte[81920];
                        int bytesRead;
                        while ((bytesRead = await inputStream.ReadAsync(buffer, 0, buffer.Length, cancellationToken)) > 0)
                        {
                            await outputStream.WriteAsync(buffer, 0, bytesRead, cancellationToken);
                            fileBytesWritten += bytesRead;
                            totalBytesWritten += bytesRead;
                            if (totalBytesWritten > FileStorage.MaxFileBytes)
                            {
                                throw new BusinessException("Tổng dung lượng tệp vượt quá giới hạn", 413);
                            }
                        }
                    }

                    using var hashStream = File.OpenRead(targetFilePath);
                    var hashBytes = await System.Security.Cryptography.SHA256.HashDataAsync(hashStream, cancellationToken);
                    var sha256 = Convert.ToHexString(hashBytes);

                    storedFiles.Add(new StoredUploadFile(fileId, file.FileName, ext, fileBytesWritten, sha256));
                }

                var session = new UploadSession(
                    actorId,
                    folderGuid,
                    batchId,
                    DateTimeOffset.UtcNow,
                    "Staged",
                    storedFiles,
                    null,
                    null);

                await _sessions.WriteAsync(session, cancellationToken);
            }
            finally
            {
                _sessions.WriteGate.Release();
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
            var sessionDir = _storage.ResolveSession(actorId, folderGuid);
            if (!Directory.Exists(sessionDir))
            {
                throw new BusinessException("Thư mục tạm không tồn tại", 404);
            }

            var session = _sessions.ReadAsync(actorId, folderGuid, CancellationToken.None).GetAwaiter().GetResult();
            var sourceDir = session != null
                ? Path.Combine(sessionDir, "batches", session.BatchId.ToString("D"))
                : sessionDir;

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
            var sessionDir = _storage.ResolveSession(actorId, folderGuid);
            if (!Directory.Exists(sessionDir))
            {
                return oldImage ?? string.Empty;
            }

            var session = _sessions.ReadAsync(actorId, folderGuid, CancellationToken.None).GetAwaiter().GetResult();
            var sourceDir = session != null
                ? Path.Combine(sessionDir, "batches", session.BatchId.ToString("D"))
                : sessionDir;

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
                Directory.Delete(sessionDir, recursive: true);
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
