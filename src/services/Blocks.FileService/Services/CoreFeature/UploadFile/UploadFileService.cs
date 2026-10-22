using AutoDependencyRegistration.Attributes;
using Blocks.FileService.DTOs.Common;
using Blocks.FileService.Infrastructure.Storage;
using Blocks.Shared.DTOs.Base;
using Blocks.Shared.Exceptions;
using Microsoft.AspNetCore.StaticFiles;
using System.Security.Claims;
using System.Text;
using System.Text.Json;

namespace Blocks.FileService.Services.CoreFeature.UploadFile
{
    public record DeleteReceipt(string Key, string DeletionId, DateTimeOffset DeletedAt, string State, string DestinationPath);

    [RegisterClassAsTransient]
    public class UploadFileService : IUploadFileService
    {
        private static readonly byte[] PngHeader = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        private static readonly byte[] JpegHeader = [0xFF, 0xD8, 0xFF];

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

            await _sessions.WriteGate.WaitAsync(cancellationToken);
            try
            {
                var existingSession = await _sessions.ReadAsync(actorId, folderGuid, cancellationToken);
                if (existingSession?.State == "Finalized")
                {
                    throw new BusinessException("Phiên tải lên đã hoàn tất không thể thay thế", 409);
                }

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

        public async Task<List<ModelAttachment>> UploadDataAsync(
            string relatedId,
            string servicePath,
            string folderName,
            string tempFolder,
            CancellationToken cancellationToken = default)
        {
            if (!string.Equals(servicePath, "System", StringComparison.OrdinalIgnoreCase) ||
                !string.Equals(folderName, "Attachments", StringComparison.OrdinalIgnoreCase))
            {
                throw new BusinessException("Mục tiêu lưu trữ không hợp lệ hoặc chưa được đăng ký", 400);
            }

            if (string.IsNullOrWhiteSpace(relatedId) || !Guid.TryParseExact(relatedId, "D", out var relatedGuid) || relatedGuid == Guid.Empty)
            {
                throw new BusinessException("Mã liên kết không hợp lệ", 400);
            }

            if (string.IsNullOrWhiteSpace(tempFolder) || !Guid.TryParseExact(tempFolder, "D", out var folderGuid) || folderGuid == Guid.Empty)
            {
                throw new BusinessException("Thư mục lưu trữ tạm không hợp lệ", 400);
            }

            var actorId = GetActorId();

            await _sessions.WriteGate.WaitAsync(cancellationToken);
            try
            {
                var session = await _sessions.ReadAsync(actorId, folderGuid, cancellationToken);
                if (session == null)
                {
                    throw new BusinessException("Phiên tải lên không tồn tại", 404);
                }

                if (session.State == "Finalized")
                {
                    if (session.Target?.Kind != "Attachment" || session.Target?.RelatedId != relatedGuid)
                    {
                        throw new BusinessException("Phiên tải lên đã hoàn tất cho mục tiêu khác", 409);
                    }

                    // Check that all destination files exist
                    if (session.Result == null || session.Result.Count == 0)
                    {
                        throw new BusinessException("Kết quả phiên tải lên bị thiếu", 409);
                    }

                    foreach (var item in session.Result)
                    {
                        var resolvedPath = _storage.ResolveActiveKey(item.FileUrl);
                        if (!File.Exists(resolvedPath))
                        {
                            throw new BusinessException("Tệp đã bị xóa hoặc không thể phục hồi", 409);
                        }
                    }

                    return session.Result;
                }

                if (session.State == "Finalizing")
                {
                    if (session.Target?.Kind != "Attachment" || session.Target?.RelatedId != relatedGuid)
                    {
                        throw new BusinessException("Phiên tải lên đang hoàn tất cho mục tiêu khác", 409);
                    }
                }
                else
                {
                    session = session with
                    {
                        State = "Finalizing",
                        Target = new UploadTarget("Attachment", "System", "Attachments", relatedGuid)
                    };
                    await _sessions.WriteAsync(session, cancellationToken);
                }

                var sessionDir = _storage.ResolveSession(actorId, folderGuid);
                var batchDir = Path.Combine(sessionDir, "batches", session.BatchId.ToString("D"));
                if (!Directory.Exists(batchDir))
                {
                    throw new BusinessException("Thư mục lô tệp không tồn tại", 404);
                }

                var attachments = new List<ModelAttachment>();
                foreach (var storedFile in session.Files)
                {
                    var sourcePath = Path.Combine(batchDir, $"{storedFile.Id:D}{storedFile.Extension}");
                    if (!File.Exists(sourcePath))
                    {
                        throw new BusinessException("Tệp nguồn trong phiên không tồn tại", 409);
                    }

                    var destFileName = $"{storedFile.Id:D}{storedFile.Extension}";
                    var destPath = _storage.Resolve(StorageArea.Files, "System", "Attachments", relatedGuid.ToString("D"), destFileName);

                    if (File.Exists(destPath))
                    {
                        using var s = File.OpenRead(destPath);
                        var h = Convert.ToHexString(await System.Security.Cryptography.SHA256.HashDataAsync(s, cancellationToken));
                        if (h != storedFile.Sha256)
                        {
                            throw new BusinessException("Tệp đích không khớp với manifest", 409);
                        }
                    }
                    else
                    {
                        var destDir = Path.GetDirectoryName(destPath)!;
                        Directory.CreateDirectory(destDir);
                        File.Copy(sourcePath, destPath, overwrite: false);
                    }

                    attachments.Add(new ModelAttachment
                    {
                        Id = storedFile.Id,
                        FileName = destFileName,
                        FileUrl = $"System/Attachments/{relatedGuid:D}/{destFileName}",
                        FileExtension = storedFile.Extension,
                        FileSize = (int)storedFile.Length
                    });
                }

                session = session with
                {
                    State = "Finalized",
                    Result = attachments
                };
                await _sessions.WriteAsync(session, cancellationToken);

                return attachments;
            }
            finally
            {
                _sessions.WriteGate.Release();
            }
        }

        public async Task<bool> DeleteDataAsync(IEnumerable<string> filePaths, CancellationToken cancellationToken = default)
        {
            if (filePaths == null || !filePaths.Any())
            {
                return true;
            }

            await _sessions.WriteGate.WaitAsync(cancellationToken);
            try
            {
                bool allSuccess = true;
                foreach (var filePath in filePaths)
                {
                    try
                    {
                        var keyHash = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(filePath))).ToLowerInvariant();
                        var receiptsDir = _storage.Resolve(StorageArea.Deleted, "receipts");
                        Directory.CreateDirectory(receiptsDir);
                        var receiptPath = Path.Combine(receiptsDir, $"{keyHash}.json");

                        if (File.Exists(receiptPath))
                        {
                            var existingJson = await File.ReadAllTextAsync(receiptPath, cancellationToken);
                            var receipt = JsonSerializer.Deserialize<DeleteReceipt>(existingJson);
                            if (receipt?.State == "Completed")
                            {
                                continue;
                            }
                        }

                        var sourcePath = _storage.ResolveActiveKey(filePath);
                        if (!File.Exists(sourcePath))
                        {
                            allSuccess = false;
                            continue;
                        }

                        var deletionId = Guid.NewGuid().ToString("D");
                        var fileName = Path.GetFileName(sourcePath);
                        var destPath = _storage.Resolve(StorageArea.Deleted, deletionId, fileName);

                        var pendingReceipt = new DeleteReceipt(filePath, deletionId, DateTimeOffset.UtcNow, "Pending", destPath);
                        await File.WriteAllTextAsync(receiptPath, JsonSerializer.Serialize(pendingReceipt), cancellationToken);

                        var destDir = Path.GetDirectoryName(destPath)!;
                        Directory.CreateDirectory(destDir);
                        File.Move(sourcePath, destPath);

                        var completedReceipt = pendingReceipt with { State = "Completed" };
                        await File.WriteAllTextAsync(receiptPath, JsonSerializer.Serialize(completedReceipt), cancellationToken);
                    }
                    catch (Exception)
                    {
                        allSuccess = false;
                    }
                }

                return allSuccess;
            }
            finally
            {
                _sessions.WriteGate.Release();
            }
        }

        public async Task<string> UploadAvatarAsync(string folderUploadId, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(folderUploadId) ||
                !Guid.TryParseExact(folderUploadId, "D", out var folderGuid) ||
                folderGuid == Guid.Empty)
            {
                throw new BusinessException("Thư mục tải lên không hợp lệ", 400);
            }

            var actorId = GetActorId();

            await _sessions.WriteGate.WaitAsync(cancellationToken);
            try
            {
                var session = await _sessions.ReadAsync(actorId, folderGuid, cancellationToken);
                if (session == null)
                {
                    throw new BusinessException("Phiên tải lên không tồn tại", 404);
                }

                if (session.Files.Count != 1)
                {
                    throw new BusinessException("Chỉ cho phép tải lên đúng một tệp hình ảnh đại diện", 400);
                }

                var storedFile = session.Files[0];
                var sessionDir = _storage.ResolveSession(actorId, folderGuid);
                var sourcePath = Path.Combine(sessionDir, "batches", session.BatchId.ToString("D"), $"{storedFile.Id:D}{storedFile.Extension}");

                if (!File.Exists(sourcePath))
                {
                    throw new BusinessException("Tệp avatar không tồn tại", 404);
                }

                // Bounded header validation: PNG, JPEG, WebP
                var headerBytes = new byte[16];
                using (var fs = File.OpenRead(sourcePath))
                {
                    var read = await fs.ReadAsync(headerBytes, 0, headerBytes.Length, cancellationToken);
                    if (!IsValidRasterHeader(headerBytes, read))
                    {
                        throw new BusinessException("Định dạng tệp không phải ảnh raster hợp lệ (chỉ hỗ trợ PNG, JPEG, WebP)", 400);
                    }
                }

                var avatarFileName = $"{storedFile.Id:D}{storedFile.Extension}";
                var avatarPath = _storage.ResolveAvatar(avatarFileName);

                if (!File.Exists(avatarPath))
                {
                    Directory.CreateDirectory(Path.GetDirectoryName(avatarPath)!);
                    File.Copy(sourcePath, avatarPath, overwrite: false);
                }

                session = session with
                {
                    State = "Finalized",
                    Target = new UploadTarget("Avatar", "System", "Avatar", null)
                };
                await _sessions.WriteAsync(session, cancellationToken);

                return $"System/Avatar/{avatarFileName}";
            }
            finally
            {
                _sessions.WriteGate.Release();
            }
        }

        public async Task<ModelFilePreview> PreviewFileAsync(string fileUrl, CancellationToken cancellationToken = default)
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
            var fileContent = await File.ReadAllBytesAsync(absolutePath, cancellationToken);
            var fileName = Path.GetFileName(absolutePath);

            return new ModelFilePreview
            {
                FileContent = fileContent,
                ContentType = originalContentType,
                FileName = fileName,
                OriginalContentType = originalContentType
            };
        }

        public async Task<ModelFilePreview> PreviewAvatarAsync(string fileName, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(fileName))
            {
                throw new BusinessException("Tên tệp không hợp lệ", 400);
            }

            var absolutePath = _storage.ResolveAvatar(fileName);
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
            var fileContent = await File.ReadAllBytesAsync(absolutePath, cancellationToken);

            return new ModelFilePreview
            {
                FileContent = fileContent,
                ContentType = originalContentType,
                FileName = Path.GetFileName(absolutePath),
                OriginalContentType = originalContentType
            };
        }

        private static bool IsValidRasterHeader(byte[] buffer, int length)
        {
            if (length >= 8 && buffer.Take(8).SequenceEqual(PngHeader))
            {
                return true;
            }

            if (length >= 3 && buffer.Take(3).SequenceEqual(JpegHeader))
            {
                return true;
            }

            // WebP: RIFF at 0..3, WEBP at 8..11
            if (length >= 12 &&
                buffer[0] == (byte)'R' && buffer[1] == (byte)'I' && buffer[2] == (byte)'F' && buffer[3] == (byte)'F' &&
                buffer[8] == (byte)'W' && buffer[9] == (byte)'E' && buffer[10] == (byte)'B' && buffer[11] == (byte)'P')
            {
                return true;
            }

            return false;
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
