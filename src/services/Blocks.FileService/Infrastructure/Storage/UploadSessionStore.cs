using Blocks.Shared.DTOs.Base;
using Blocks.Shared.Exceptions;
using System.Text.Json;

namespace Blocks.FileService.Infrastructure.Storage
{
    public record StoredUploadFile(Guid Id, string OriginalName, string Extension, long Length, string Sha256);
    public record UploadTarget(string Kind, string Service, string Module, Guid? RelatedId);
    public record UploadSession(
        Guid ActorId,
        Guid FolderId,
        Guid BatchId,
        DateTimeOffset CreatedAt,
        string State,
        List<StoredUploadFile> Files,
        UploadTarget? Target,
        List<ModelAttachment>? Result);

    public sealed class UploadSessionStore
    {
        private readonly FileStorage _storage;

        public UploadSessionStore(FileStorage storage)
        {
            _storage = storage;
        }

        // ponytail: singleton gate serializes all instance mutations to prevent unbounded lock dictionary; upgrade to per-session locks when contention measured.
        internal SemaphoreSlim WriteGate { get; } = new(1, 1);

        internal async Task<UploadSession?> ReadAsync(Guid actorId, Guid folderId, CancellationToken ct)
        {
            var sessionDir = _storage.ResolveSession(actorId, folderId);
            var manifestPath = _storage.Resolve(StorageArea.Temp, actorId.ToString("D"), folderId.ToString("D"), "manifest.json");

            if (!Directory.Exists(sessionDir))
            {
                return null;
            }

            if (!File.Exists(manifestPath))
            {
                // Session directory exists but manifest missing -> fail closed
                throw new BusinessException("Phiên tải lên không hợp lệ hoặc thiếu manifest", 409);
            }

            try
            {
                var json = await File.ReadAllTextAsync(manifestPath, ct);
                var session = JsonSerializer.Deserialize<UploadSession>(json);
                if (session == null)
                {
                    throw new BusinessException("Manifest phiên tải lên bị hỏng", 409);
                }

                if (session.ActorId != actorId)
                {
                    throw new BusinessException("Không có quyền truy cập phiên tải lên của người dùng khác", 403);
                }

                if (session.FolderId != folderId)
                {
                    throw new BusinessException("Manifest phiên tải lên không khớp thư mục", 409);
                }

                ValidateSessionShape(session);

                return session;
            }
            catch (JsonException)
            {
                throw new BusinessException("Manifest phiên tải lên bị hỏng", 409);
            }
        }

        private static void ValidateSessionShape(UploadSession session)
        {
            if (session.ActorId == Guid.Empty || session.FolderId == Guid.Empty || session.BatchId == Guid.Empty ||
                session.CreatedAt == default)
            {
                throw new BusinessException("Manifest chứa định danh không hợp lệ", 409);
            }

            if (session.State != "Staged" && session.State != "Finalizing" && session.State != "Finalized")
            {
                throw new BusinessException("Trạng thái phiên tải lên không hợp lệ", 409);
            }

            if (session.Files == null || session.Files.Count == 0 ||
                session.Files.Any(f => f == null) || session.Files.Select(f => f.Id).Distinct().Count() != session.Files.Count)
            {
                throw new BusinessException("Danh sách tệp trong phiên không được rỗng", 409);
            }

            long totalBytes = 0;
            foreach (var file in session.Files)
            {
                if (file == null || file.Id == Guid.Empty)
                {
                    throw new BusinessException("Tệp trong phiên không hợp lệ", 409);
                }

                if (string.IsNullOrWhiteSpace(file.OriginalName) ||
                    string.IsNullOrWhiteSpace(file.Extension) ||
                    file.OriginalName.IndexOfAny(['/', '\\', ':']) >= 0 ||
                    file.OriginalName.Contains("..") || file.OriginalName.Any(char.IsControl) ||
                    file.Extension.Length < 2 || file.Extension[0] != '.' ||
                    file.Extension.Skip(1).Any(c => !char.IsAsciiLetterOrDigit(c)) ||
                    !string.Equals(Path.GetExtension(file.OriginalName), file.Extension, StringComparison.OrdinalIgnoreCase))
                {
                    throw new BusinessException("Thông tin tệp trong phiên không hợp lệ", 409);
                }

                if (file.Length <= 0 || file.Length > FileStorage.MaxFileBytes)
                {
                    throw new BusinessException("Dung lượng tệp trong phiên không hợp lệ", 409);
                }

                totalBytes += file.Length;
                if (totalBytes > FileStorage.MaxFileBytes)
                {
                    throw new BusinessException("Tổng dung lượng phiên vượt quá giới hạn", 409);
                }

                if (string.IsNullOrWhiteSpace(file.Sha256) || file.Sha256.Length != 64 || !file.Sha256.All(Uri.IsHexDigit))
                {
                    throw new BusinessException("Mã băm tệp trong phiên không hợp lệ", 409);
                }
            }

            if (session.State == "Staged")
            {
                if (session.Target != null || session.Result != null)
                {
                    throw new BusinessException("Phiên tạm không được có kết quả hoàn tất", 409);
                }
                return;
            }

            var target = session.Target;
            if (target == null || target.Service != "System" ||
                !(target.Kind == "Attachment" && target.Module == "Attachments" && target.RelatedId is Guid id && id != Guid.Empty ||
                  target.Kind == "Avatar" && target.Module == "Avatar" && target.RelatedId == null && session.Files.Count == 1))
            {
                throw new BusinessException("Mục tiêu phiên tải lên không hợp lệ", 409);
            }

            if (session.Result == null || session.Result.Count != session.Files.Count ||
                session.Result.Any(r => r == null) || session.Result.Select(r => r.Id).Distinct().Count() != session.Files.Count)
            {
                throw new BusinessException("Kết quả phiên tải lên không hợp lệ", 409);
            }

            foreach (var file in session.Files)
            {
                var item = session.Result.SingleOrDefault(r => r.Id == file.Id);
                var expectedKey = target.Kind == "Avatar"
                    ? $"System/Avatar/{file.Id:D}{file.Extension}"
                    : $"System/Attachments/{target.RelatedId:D}/{file.Id:D}{file.Extension}";
                if (item == null || item.FileUrl != expectedKey ||
                    item.RelatedId != (target.RelatedId ?? Guid.Empty) ||
                    item.FileName != Path.GetFileNameWithoutExtension(file.OriginalName) ||
                    item.FileExtension != file.Extension || item.FileSize != file.Length)
                {
                    throw new BusinessException("Kết quả không khớp mục tiêu và lô tệp", 409);
                }
            }
        }

        internal async Task WriteAsync(UploadSession session, CancellationToken ct)
        {
            var sessionDir = _storage.ResolveSession(session.ActorId, session.FolderId);
            Directory.CreateDirectory(sessionDir);
            var manifestPath = _storage.Resolve(StorageArea.Temp, session.ActorId.ToString("D"), session.FolderId.ToString("D"), "manifest.json");
            var tempManifestPath = _storage.Resolve(StorageArea.Temp, session.ActorId.ToString("D"), session.FolderId.ToString("D"), $"manifest.{Guid.NewGuid():D}.tmp");

            var json = JsonSerializer.Serialize(session, new JsonSerializerOptions { WriteIndented = true });
            await File.WriteAllTextAsync(tempManifestPath, json, ct);

            File.Move(tempManifestPath, manifestPath, overwrite: true);
        }
    }
}
