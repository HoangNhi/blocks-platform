using AutoDependencyRegistration.Attributes;
using Blocks.FileService.DTOs.Common;
using Blocks.FileService.DTOs.CoreFeature.UploadFile;
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

        public async Task Insert(List<IFormFile> files, string FolderName, CancellationToken cancellationToken = default, string? uploadPurpose = null)
        {
            const string knowledgeHubPurpose = "KnowledgeHubDocument";

            if (uploadPurpose is not null && !string.Equals(uploadPurpose, knowledgeHubPurpose, StringComparison.Ordinal))
            {
                throw new BusinessException("Upload purpose không được hỗ trợ", 400);
            }

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

            var isKnowledgeHub = uploadPurpose == knowledgeHubPurpose;
            if (isKnowledgeHub && files.Count != 1)
                throw new BusinessException("KnowledgeHub chỉ cho phép tải lên một tệp mỗi lần", 400);

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

                var validExtensions = isKnowledgeHub
                    ? ext is ".pdf" or ".md" or ".txt"
                    : IsValidExtension(ext);

                if (!validExtensions)
                {
                    throw new BusinessException("Định dạng tệp không được hỗ trợ", 400);
                }
            }

            await _sessions.WriteGate.WaitAsync(cancellationToken);
            string? newBatchDir = null;

            try
            {
                var existingSession = await _sessions.ReadAsync(actorId, folderGuid, cancellationToken);

                if (isKnowledgeHub && existingSession != null)
                {
                    var sameContent = await IsSameKnowledgeHubStageAsync(
                        existingSession, files, cancellationToken
                    );

                    if (sameContent) return;

                    throw new BusinessException("UploadSessionId đã được sử dụng cho nội dung khác", 409);
                }

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
                    null,
                    uploadPurpose);

                await _sessions.WriteAsync(session, cancellationToken);

                if (existingSession != null)
                {
                    var oldBatchDir = _storage.Resolve(StorageArea.Temp, actorId.ToString("D"), folderGuid.ToString("D"), "batches", existingSession.BatchId.ToString("D"));
                    if (Directory.Exists(oldBatchDir))
                    {
                        try { Directory.Delete(oldBatchDir, recursive: true); } catch { }
                    }
                }

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
            var finalized = await UploadDataWithMetadataAsync(relatedId, servicePath, folderName, tempFolder, cancellationToken);
            return finalized.Select(fa => fa.Attachment).ToList();
        }

        public async Task<List<FinalizedAttachment>> UploadDataWithMetadataAsync(
            string relatedId,
            string servicePath,
            string folderName,
            string tempFolder,
            CancellationToken cancellationToken = default
        )
        {
            var isAttachment = string.Equals(servicePath, "System", StringComparison.OrdinalIgnoreCase) &&
                               string.Equals(folderName, "Attachments", StringComparison.OrdinalIgnoreCase);

            var isKnowledgeHubDocument = string.Equals(servicePath, "KnowledgeHub", StringComparison.OrdinalIgnoreCase) &&
                                          string.Equals(folderName, "Documents", StringComparison.OrdinalIgnoreCase);

            if (!isAttachment && !isKnowledgeHubDocument)
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

                var expectedPurpose = isKnowledgeHubDocument ? "KnowledgeHubDocument" : null;

                if (session.Purpose != expectedPurpose)
                {
                    throw new BusinessException("Upload purpose không khớp mục tiêu finalize", 409);
                }

                if (isKnowledgeHubDocument && session.Files.Count != 1)
                {
                    throw new BusinessException("KnowledgeHub chỉ cho phép một tệp", 409);
                }

                var targetKind = isKnowledgeHubDocument ? "Document" : "Attachment";
                var targetService = isKnowledgeHubDocument ? "KnowledgeHub" : "System";
                var targetModule = isKnowledgeHubDocument ? "Documents" : "Attachments";

                if (session.Target != null &&
                    (session.Target.Kind != targetKind ||
                    session.Target.Service != targetService ||
                    session.Target.Module != targetModule ||
                    session.Target.RelatedId != relatedGuid))
                    throw new BusinessException(
                        "Phiên tải lên đã liên kết với mục tiêu khác", 409);

                string BuildKey(StoredUploadFile file) => isKnowledgeHubDocument
                    ? $"KnowledgeHub/Documents/{relatedGuid:D}/{file.Id:D}{file.Extension}"
                    : $"System/Attachments/{relatedGuid:D}/{file.Id:D}{file.Extension}";

                if (session.State == "Finalized")
                {
                    if (session.Target?.Kind != targetKind ||
                        session.Target.RelatedId != relatedGuid ||
                        session.Result == null ||
                        session.Result.Count != session.Files.Count)
                        throw new BusinessException(
                            "Kết quả phiên tải lên không khớp mục tiêu", 409);

                    var completed = new List<FinalizedAttachment>();

                    foreach (var item in session.Result)
                    {
                        var stored = session.Files.Single(f => f.Id == item.Id);
                        if (!string.Equals(item.FileUrl, BuildKey(stored), StringComparison.Ordinal))
                            throw new BusinessException("Storage key không khớp manifest", 409);

                        var path = _storage.ResolveActiveKey(item.FileUrl);
                        if (!File.Exists(path))
                            throw new BusinessException(
                                "Tệp đã bị xóa hoặc không thể phục hồi", 409);

                        await VerifyFileAsync(path, stored, cancellationToken);

                        completed.Add(new FinalizedAttachment(
                            item,
                            stored.Sha256.ToLowerInvariant()));
                    }

                    return completed;
                }

                if (session.State == "Finalizing" &&
                (session.Target?.Kind != targetKind ||
                 session.Target.RelatedId != relatedGuid))
                    throw new BusinessException(
                        "Phiên tải lên đang hoàn tất cho mục tiêu khác", 409);

                var batchDir = _storage.Resolve(
                    StorageArea.Temp,
                    actorId.ToString("D"),
                    folderGuid.ToString("D"),
                    "batches",
                    session.BatchId.ToString("D"));

                if (!Directory.Exists(batchDir))
                    throw new BusinessException(
                        "Thư mục lô tệp không tồn tại", 404);

                var attachments = session.Files.Select(stored => new ModelAttachment
                {
                    Id = stored.Id,
                    RelatedId = relatedGuid,
                    FileName = Path.GetFileNameWithoutExtension(stored.OriginalName),
                    FileExtension = stored.Extension,
                    FileSize = stored.Length,
                    FileUrl = BuildKey(stored)
                }).ToList();

                if (session.State != "Finalizing")
                {
                    session = session with
                    {
                        State = "Finalizing",
                        Target = new UploadTarget(
                            targetKind,
                            targetService,
                            targetModule,
                            relatedGuid),
                        Result = attachments
                    };

                    await _sessions.WriteAsync(session, cancellationToken);
                }

                foreach (var stored in session.Files)
                {
                    var sourcePath = _storage.Resolve(
                        StorageArea.Temp,
                        actorId.ToString("D"),
                        folderGuid.ToString("D"),
                        "batches",
                        session.BatchId.ToString("D"),
                        $"{stored.Id:D}{stored.Extension}");

                    if (!File.Exists(sourcePath))
                        throw new BusinessException(
                            "Tệp nguồn trong phiên không tồn tại", 409);

                    var destinationPath = isKnowledgeHubDocument
                        ? _storage.Resolve(
                            StorageArea.Files,
                            "KnowledgeHub",
                            "Documents",
                            relatedGuid.ToString("D"),
                            $"{stored.Id:D}{stored.Extension}")
                        : _storage.Resolve(
                            StorageArea.Files,
                            "System",
                            "Attachments",
                            relatedGuid.ToString("D"),
                            $"{stored.Id:D}{stored.Extension}");

                    if (File.Exists(destinationPath))
                    {
                        await VerifyFileAsync(
                            destinationPath,
                            stored,
                            cancellationToken);
                    }
                    else
                    {
                        RejectDeletedTarget(BuildKey(stored));
                        Directory.CreateDirectory(
                            Path.GetDirectoryName(destinationPath)!);
                        File.Copy(sourcePath, destinationPath, overwrite: false);
                        await VerifyFileAsync(
                            destinationPath,
                            stored,
                            cancellationToken);
                    }
                }
                session = session with { State = "Finalized" };
                await _sessions.WriteAsync(session, cancellationToken);

                return attachments
                    .Select(item => new FinalizedAttachment(
                        item,
                        session.Files.Single(f => f.Id == item.Id)
                            .Sha256.ToLowerInvariant()))
                    .ToList();
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
            string canonical;

            if (segments.Length == 3 &&
                string.Equals(segments[0], "System", StringComparison.OrdinalIgnoreCase) &&
                string.Equals(segments[1], "Avatar", StringComparison.OrdinalIgnoreCase))
            {
                canonical = $"System/Avatar/{segments[2]}";
            }
            else if (segments.Length == 4 &&
                     string.Equals(segments[0], "System", StringComparison.OrdinalIgnoreCase) &&
                     string.Equals(segments[1], "Attachments", StringComparison.OrdinalIgnoreCase))
            {
                canonical = $"System/Attachments/{segments[2]}/{segments[3]}";
            }
            else if (segments.Length == 4 && segments[0] == "KnowledgeHub" && segments[1] == "Documents")
            {
                canonical = $"KnowledgeHub/Documents/{segments[2]}/{segments[3]}";
            }
            else
            {
                throw new BusinessException(
                    "Storage key không hợp lệ để tạo deletion receipt", 400);
            }

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
                throw new BusinessException("Tên tệp không được rỗng", 400);

            if (fileName.Contains('/') ||
                fileName.Contains((char)92) ||
                fileName.Contains(':') ||
                fileName.Contains("..") ||
                fileName.Any(char.IsControl) ||
                fileName.EnumerateRunes().Count() > 255)
                throw new BusinessException(
                    "Tên tệp chứa ký tự không hợp lệ hoặc quá dài",
                    400);
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

        private static async Task<bool> IsSameKnowledgeHubStageAsync(UploadSession existing, List<IFormFile> files, CancellationToken cancellationToken)
        {
            if (existing.Purpose != "KnowledgeHubDocument"
                || existing.Files.Count != 1
                || files.Count != 1
            )
            {
                return false;
            }

            var stored = existing.Files[0];
            var incoming = files[0];

            if (!string.Equals(stored.OriginalName, incoming.FileName, StringComparison.Ordinal)
                || stored.Length != incoming.Length
                || !string.Equals(stored.Extension, Path.GetExtension(incoming.FileName).ToLowerInvariant(), StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            using var input = incoming.OpenReadStream();
            var hash = Convert.ToHexString(await System.Security.Cryptography.SHA256.HashDataAsync(input, cancellationToken));

            return string.Equals(stored.Sha256, hash, StringComparison.OrdinalIgnoreCase);
        }
    }
}
