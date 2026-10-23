using AutoDependencyRegistration.Attributes;
using Blocks.FileService.DTOs.Common;
using Blocks.FileService.Infrastructure.Storage;
using Blocks.Shared.DTOs.Base;
using Blocks.Shared.Exceptions;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.Logging.Abstractions;
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
        private readonly ILogger<UploadFileService> _logger;

        public UploadFileService(FileStorage storage, UploadSessionStore sessions, IHttpContextAccessor contextAccessor,
            ILogger<UploadFileService>? logger = null)
        {
            _storage = storage;
            _sessions = sessions;
            _contextAccessor = contextAccessor;
            _logger = logger ?? NullLogger<UploadFileService>.Instance;
        }

        private Guid GetActorId()
        {
            var user = _contextAccessor.HttpContext?.User;
            if (user?.Identity?.IsAuthenticated != true)
            {
                throw new BusinessException("Xác thực không thành công: thiếu ngữ cảnh người dùng", 401);
            }

            var claimValue = user.FindFirst("name")?.Value;

            if (string.IsNullOrWhiteSpace(claimValue) || claimValue.Length != 36 ||
                !Guid.TryParseExact(claimValue, "D", out var actorId) || actorId == Guid.Empty)
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
                FolderName.Length != 36 ||
                !Guid.TryParseExact(FolderName, "D", out var folderGuid) ||
                folderGuid == Guid.Empty)
            {
                throw new BusinessException("Thư mục lưu trữ không hợp lệ", 400);
            }

            var actorId = GetActorId();

            long declaredTotal = 0;
            foreach (var file in files)
            {
                if (file == null || file.Length <= 0)
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
            string? newBatchDir = null;
            try
            {
                var existingSession = await _sessions.ReadAsync(actorId, folderGuid, cancellationToken);
                if (existingSession != null && (existingSession.State == "Finalized" || existingSession.State == "Finalizing"))
                {
                    throw new BusinessException("Phiên tải lên đang hoặc đã hoàn tất không thể thay thế", 409);
                }

                var sessionDir = _storage.ResolveSession(actorId, folderGuid);
                Directory.CreateDirectory(sessionDir);

                var batchId = Guid.NewGuid();
                newBatchDir = _storage.Resolve(StorageArea.Temp, actorId.ToString("D"), folderGuid.ToString("D"), "batches", batchId.ToString("D"));
                Directory.CreateDirectory(newBatchDir);

                var storedFiles = new List<StoredUploadFile>();
                long totalBytesWritten = 0;

                foreach (var file in files)
                {
                    var fileId = Guid.NewGuid();
                    var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
                    var physicalFileName = $"{fileId:D}{ext}";
                    var targetFilePath = _storage.Resolve(StorageArea.Temp, actorId.ToString("D"), folderGuid.ToString("D"), "batches", batchId.ToString("D"), physicalFileName);

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

                    if (fileBytesWritten == 0)
                    {
                        throw new BusinessException("Tệp tải lên không được rỗng", 400);
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
                newBatchDir = null;
            }
            catch
            {
                if (newBatchDir != null && Directory.Exists(newBatchDir))
                {
                    try { Directory.Delete(newBatchDir, recursive: true); } catch { }
                }
                throw;
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

            if (string.IsNullOrWhiteSpace(relatedId) || relatedId.Length != 36 ||
                !Guid.TryParseExact(relatedId, "D", out var relatedGuid) || relatedGuid == Guid.Empty)
            {
                throw new BusinessException("Mã liên kết không hợp lệ", 400);
            }

            if (string.IsNullOrWhiteSpace(tempFolder) || tempFolder.Length != 36 ||
                !Guid.TryParseExact(tempFolder, "D", out var folderGuid) || folderGuid == Guid.Empty)
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
                    throw new BusinessException("Phiên tải lên không tồn tại", 409);
                }

                if (session.Target != null && session.Target.Kind != "Attachment")
                {
                    throw new BusinessException("Phiên tải lên đã liên kết với mục tiêu khác", 409);
                }

                if (session.State == "Finalized")
                {
                    if (session.Target?.Kind != "Attachment" || session.Target?.RelatedId != relatedGuid)
                    {
                        throw new BusinessException("Phiên tải lên đã hoàn tất cho mục tiêu khác", 409);
                    }

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

                        var fi = new FileInfo(resolvedPath);
                        var matchingStored = session.Files.FirstOrDefault(f => f.Id == item.Id);
                        if (matchingStored != null)
                        {
                            if (fi.Length != matchingStored.Length)
                            {
                                throw new BusinessException("Tệp đích không khớp độ dài manifest", 409);
                            }
                            using var s = File.OpenRead(resolvedPath);
                            var h = Convert.ToHexString(await System.Security.Cryptography.SHA256.HashDataAsync(s, cancellationToken));
                            if (!string.Equals(h, matchingStored.Sha256, StringComparison.OrdinalIgnoreCase))
                            {
                                throw new BusinessException("Tệp đích không khớp SHA256 manifest", 409);
                            }
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

                var batchDir = _storage.Resolve(StorageArea.Temp, actorId.ToString("D"), folderGuid.ToString("D"), "batches", session.BatchId.ToString("D"));
                if (!Directory.Exists(batchDir))
                {
                    throw new BusinessException("Thư mục lô tệp không tồn tại", 404);
                }

                var attachments = new List<ModelAttachment>();
                foreach (var storedFile in session.Files)
                {
                    var destFileName = $"{storedFile.Id:D}{storedFile.Extension}";
                    attachments.Add(new ModelAttachment
                    {
                        Id = storedFile.Id,
                        RelatedId = relatedGuid,
                        FileName = Path.GetFileNameWithoutExtension(storedFile.OriginalName),
                        FileExtension = storedFile.Extension,
                        FileSize = storedFile.Length,
                        FileUrl = $"System/Attachments/{relatedGuid:D}/{destFileName}"
                    });
                }

                if (session.State != "Finalizing")
                {
                    session = session with
                    {
                        State = "Finalizing",
                        Target = new UploadTarget("Attachment", "System", "Attachments", relatedGuid),
                        Result = attachments
                    };
                    await _sessions.WriteAsync(session, cancellationToken);
                }

                foreach (var storedFile in session.Files)
                {
                    var sourcePath = _storage.Resolve(StorageArea.Temp, actorId.ToString("D"), folderGuid.ToString("D"), "batches", session.BatchId.ToString("D"), $"{storedFile.Id:D}{storedFile.Extension}");
                    if (!File.Exists(sourcePath))
                    {
                        throw new BusinessException("Tệp nguồn trong phiên không tồn tại", 409);
                    }

                    var destFileName = $"{storedFile.Id:D}{storedFile.Extension}";
                    var destPath = _storage.Resolve(StorageArea.Files, "System", "Attachments", relatedGuid.ToString("D"), destFileName);

                    if (File.Exists(destPath))
                    {
                        var fi = new FileInfo(destPath);
                        if (fi.Length != storedFile.Length)
                        {
                            throw new BusinessException("Tệp đích không khớp độ dài manifest", 409);
                        }
                        using var s = File.OpenRead(destPath);
                        var h = Convert.ToHexString(await System.Security.Cryptography.SHA256.HashDataAsync(s, cancellationToken));
                        if (!string.Equals(h, storedFile.Sha256, StringComparison.OrdinalIgnoreCase))
                        {
                            throw new BusinessException("Tệp đích không khớp SHA256 manifest", 409);
                        }
                    }
                    else
                    {
                        RejectDeletedTarget($"System/Attachments/{relatedGuid:D}/{destFileName}");
                        var destDir = Path.GetDirectoryName(destPath)!;
                        Directory.CreateDirectory(destDir);
                        File.Copy(sourcePath, destPath, overwrite: false);
                    }
                    await VerifyFileAsync(destPath, storedFile, cancellationToken);
                }

                session = session with
                {
                    State = "Finalized"
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
                    cancellationToken.ThrowIfCancellationRequested();
                    var keyHash = "invalid";

                    try
                    {
                        var sourcePath = _storage.ResolveActiveKey(filePath);

                        keyHash = ReceiptKeyHash(filePath);
                        var receiptsDir = _storage.Resolve(StorageArea.Deleted, "receipts");
                        Directory.CreateDirectory(receiptsDir);
                        var receiptPath = _storage.Resolve(StorageArea.Deleted, "receipts", $"{keyHash}.json");

                        DeleteReceipt? receipt = null;
                        if (File.Exists(receiptPath))
                        {
                            var existingJson = await File.ReadAllTextAsync(receiptPath, cancellationToken);
                            receipt = JsonSerializer.Deserialize<DeleteReceipt>(existingJson);
                            var comparison = OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
                            if (receipt == null || !Guid.TryParseExact(receipt.DeletionId, "D", out var id) || id == Guid.Empty ||
                                receipt.DeletionId.Length != 36 ||
                                receipt.DeletedAt == default || receipt.State is not ("Pending" or "Completed") ||
                                !string.Equals(_storage.ResolveActiveKey(receipt.Key), sourcePath, comparison))
                            {
                                throw new BusinessException("Biên nhận xóa không hợp lệ", 409);
                            }
                            var expectedDestination = _storage.Resolve(StorageArea.Deleted, id.ToString("D"), Path.GetFileName(sourcePath));
                            if (!string.Equals(receipt.DestinationPath, expectedDestination, comparison))
                            {
                                throw new BusinessException("Đích biên nhận xóa không hợp lệ", 409);
                            }
                            var sourceExists = File.Exists(sourcePath);
                            var destinationExists = File.Exists(expectedDestination);
                            if (!sourceExists && destinationExists)
                            {
                                if (receipt.State == "Pending")
                                    await WriteDeleteReceiptAsync(keyHash, receipt with { State = "Completed" }, cancellationToken);
                                continue;
                            }
                            if (receipt.State == "Completed" || !sourceExists || destinationExists)
                            {
                                throw new BusinessException("Trạng thái biên nhận xóa không khớp tệp", 409);
                            }
                        }

                        if (!File.Exists(sourcePath))
                        {
                            allSuccess = false;
                            _logger.LogWarning("File delete missing target {ReceiptHash}, correlation {CorrelationId}",
                                keyHash, _contextAccessor.HttpContext?.TraceIdentifier);
                            continue;
                        }

                        if (receipt == null)
                        {
                            var deletionId = Guid.NewGuid().ToString("D");
                            var destination = _storage.Resolve(StorageArea.Deleted, deletionId, Path.GetFileName(sourcePath));
                            receipt = new DeleteReceipt(filePath, deletionId, DateTimeOffset.UtcNow, "Pending", destination);
                            await WriteDeleteReceiptAsync(keyHash, receipt, cancellationToken);
                        }
                        var destDir = Path.GetDirectoryName(receipt.DestinationPath)!;
                        Directory.CreateDirectory(destDir);
                        File.Move(sourcePath, receipt.DestinationPath);
                        await WriteDeleteReceiptAsync(keyHash, receipt with { State = "Completed" }, cancellationToken);
                    }
                    catch (OperationCanceledException)
                    {
                        throw;
                    }
                    catch (Exception ex)
                    {
                        allSuccess = false;
                        _logger.LogWarning("File delete failed {ReceiptHash}, category {Category}, correlation {CorrelationId}",
                            keyHash, ex.GetType().Name, _contextAccessor.HttpContext?.TraceIdentifier);
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
                folderUploadId.Length != 36 ||
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
                    throw new BusinessException("Phiên tải lên không tồn tại", 409);
                }

                if (session.Target != null && session.Target.Kind != "Avatar")
                {
                    throw new BusinessException("Phiên tải lên đã liên kết với mục tiêu khác", 409);
                }

                if (session.Files == null || session.Files.Count != 1)
                {
                    throw new BusinessException("Chỉ cho phép tải lên đúng một tệp hình ảnh đại diện", 400);
                }

                var storedFile = session.Files[0];
                var ext = storedFile.Extension.ToLowerInvariant();
                if (ext != ".png" && ext != ".jpg" && ext != ".jpeg" && ext != ".webp")
                {
                    throw new BusinessException("Định dạng tệp không được hỗ trợ cho ảnh đại diện", 400);
                }

                var avatarFileName = $"{storedFile.Id:D}{storedFile.Extension}";
                var avatarPath = _storage.ResolveAvatar(avatarFileName);
                var avatarKey = $"System/Avatar/{avatarFileName}";

                if (session.State == "Finalized")
                {
                    if (session.Target?.Kind != "Avatar")
                    {
                        throw new BusinessException("Phiên tải lên đã hoàn tất cho mục tiêu khác", 409);
                    }

                    if (!File.Exists(avatarPath))
                    {
                        throw new BusinessException("Tệp đã bị xóa hoặc không thể phục hồi", 409);
                    }

                    var fi = new FileInfo(avatarPath);
                    if (fi.Length != storedFile.Length)
                    {
                        throw new BusinessException("Tệp đích không khớp độ dài manifest", 409);
                    }
                    using var s = File.OpenRead(avatarPath);
                    var h = Convert.ToHexString(await System.Security.Cryptography.SHA256.HashDataAsync(s, cancellationToken));
                    if (!string.Equals(h, storedFile.Sha256, StringComparison.OrdinalIgnoreCase))
                    {
                        throw new BusinessException("Tệp đích không khớp SHA256 manifest", 409);
                    }

                    return avatarKey;
                }

                if (session.State == "Finalizing")
                {
                    if (session.Target?.Kind != "Avatar")
                    {
                        throw new BusinessException("Phiên tải lên đang hoàn tất cho mục tiêu khác", 409);
                    }
                }

                var sourcePath = _storage.Resolve(StorageArea.Temp, actorId.ToString("D"), folderGuid.ToString("D"), "batches", session.BatchId.ToString("D"), avatarFileName);
                if (!File.Exists(sourcePath))
                {
                    throw new BusinessException("Tệp avatar không tồn tại", 404);
                }

                var headerBytes = new byte[16];
                using (var fs = File.OpenRead(sourcePath))
                {
                    var read = await fs.ReadAsync(headerBytes, 0, headerBytes.Length, cancellationToken);
                    if (!HeaderMatchesExtension(headerBytes, read, ext))
                    {
                        throw new BusinessException("Định dạng tệp không khớp phần mở rộng ảnh", 400);
                    }
                }

                var avatarResult = new List<ModelAttachment>
                {
                    new ModelAttachment
                    {
                        Id = storedFile.Id,
                        RelatedId = Guid.Empty,
                        FileName = Path.GetFileNameWithoutExtension(storedFile.OriginalName),
                        FileExtension = storedFile.Extension,
                        FileSize = storedFile.Length,
                        FileUrl = avatarKey
                    }
                };

                if (session.State != "Finalizing")
                {
                    session = session with
                    {
                        State = "Finalizing",
                        Target = new UploadTarget("Avatar", "System", "Avatar", null),
                        Result = avatarResult
                    };
                    await _sessions.WriteAsync(session, cancellationToken);
                }

                if (File.Exists(avatarPath))
                {
                    var fi = new FileInfo(avatarPath);
                    if (fi.Length != storedFile.Length)
                    {
                        throw new BusinessException("Tệp đích không khớp độ dài manifest", 409);
                    }
                    using var s = File.OpenRead(avatarPath);
                    var h = Convert.ToHexString(await System.Security.Cryptography.SHA256.HashDataAsync(s, cancellationToken));
                    if (!string.Equals(h, storedFile.Sha256, StringComparison.OrdinalIgnoreCase))
                    {
                        throw new BusinessException("Tệp đích không khớp SHA256 manifest", 409);
                    }
                }
                else
                {
                    RejectDeletedTarget(avatarKey);
                    Directory.CreateDirectory(Path.GetDirectoryName(avatarPath)!);
                    File.Copy(sourcePath, avatarPath, overwrite: false);
                }
                await VerifyFileAsync(avatarPath, storedFile, cancellationToken);

                session = session with
                {
                    State = "Finalized"
                };
                await _sessions.WriteAsync(session, cancellationToken);

                return avatarKey;
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
            var fileContent = await ReadBoundedBytesAsync(absolutePath, FileStorage.MaxFileBytes, cancellationToken);
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

            var ext = Path.GetExtension(fileName).ToLowerInvariant();
            if (ext != ".png" && ext != ".jpg" && ext != ".jpeg" && ext != ".webp")
            {
                throw new BusinessException("Định dạng tệp không được hỗ trợ cho ảnh đại diện", 400);
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
            var fileContent = await ReadBoundedBytesAsync(absolutePath, FileStorage.MaxFileBytes, cancellationToken);

            return new ModelFilePreview
            {
                FileContent = fileContent,
                ContentType = originalContentType,
                FileName = Path.GetFileName(absolutePath),
                OriginalContentType = originalContentType
            };
        }

        private static async Task<byte[]> ReadBoundedBytesAsync(string path, long maxBytes, CancellationToken ct)
        {
            using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true);
            return await ReadBoundedBytesAsync(fs, maxBytes, ct);
        }

        internal static async Task<byte[]> ReadBoundedBytesAsync(Stream fs, long maxBytes, CancellationToken ct)
        {
            if (fs.Length > maxBytes)
            {
                throw new BusinessException("Kích thước tệp vượt quá giới hạn", 413);
            }

            using var ms = new MemoryStream();
            var buffer = new byte[81920];
            long totalRead = 0;
            int read;
            while ((read = await fs.ReadAsync(buffer, 0, buffer.Length, ct)) > 0)
            {
                totalRead += read;
                if (totalRead > maxBytes)
                {
                    throw new BusinessException("Kích thước tệp vượt quá giới hạn", 413);
                }
                await ms.WriteAsync(buffer, 0, read, ct);
            }
            return ms.ToArray();
        }

        private static string ReceiptKeyHash(string key)
        {
            var segments = key.Split('/');
            var canonical = segments.Length == 3
                ? $"System/Avatar/{segments[2]}"
                : $"System/Attachments/{segments[2]}/{segments[3]}";
            var normalized = OperatingSystem.IsWindows() ? canonical.ToLowerInvariant() : canonical;
            return Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(normalized))).ToLowerInvariant();
        }

        private void RejectDeletedTarget(string key)
        {
            if (File.Exists(_storage.Resolve(StorageArea.Deleted, "receipts", ReceiptKeyHash(key) + ".json")))
                throw new BusinessException("Tệp đã được yêu cầu xóa; cần tải lên phiên mới", 409);
        }

        private async Task WriteDeleteReceiptAsync(string hash, DeleteReceipt receipt, CancellationToken ct)
        {
            var temporary = _storage.Resolve(StorageArea.Deleted, "receipts", $"{hash}.{Guid.NewGuid():D}.tmp");
            var destination = _storage.Resolve(StorageArea.Deleted, "receipts", hash + ".json");
            await File.WriteAllTextAsync(temporary, JsonSerializer.Serialize(receipt), ct);
            ct.ThrowIfCancellationRequested();
            File.Move(temporary, destination, overwrite: true);
        }

        private static async Task VerifyFileAsync(string path, StoredUploadFile file, CancellationToken ct)
        {
            using var stream = File.OpenRead(path);
            if (stream.Length != file.Length ||
                !string.Equals(Convert.ToHexString(await System.Security.Cryptography.SHA256.HashDataAsync(stream, ct)),
                    file.Sha256, StringComparison.OrdinalIgnoreCase))
                throw new BusinessException("Tệp đích không khớp manifest", 409);
        }

        private static bool HeaderMatchesExtension(byte[] buffer, int length, string ext)
        {
            if (ext == ".png")
            {
                return length >= 8 && buffer.Take(8).SequenceEqual(PngHeader);
            }

            if (ext == ".jpg" || ext == ".jpeg")
            {
                return length >= 3 && buffer.Take(3).SequenceEqual(JpegHeader);
            }

            if (ext == ".webp")
            {
                return length >= 12 &&
                    buffer[0] == (byte)'R' && buffer[1] == (byte)'I' && buffer[2] == (byte)'F' && buffer[3] == (byte)'F' &&
                    buffer[8] == (byte)'W' && buffer[9] == (byte)'E' && buffer[10] == (byte)'B' && buffer[11] == (byte)'P';
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
