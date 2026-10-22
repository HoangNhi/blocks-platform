using Blocks.FileService.Infrastructure.Storage;
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
            var manifestPath = Path.Combine(sessionDir, "manifest.json");

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
                if (session == null || session.ActorId != actorId || session.FolderId != folderId)
                {
                    throw new BusinessException("Manifest phiên tải lên bị hỏng hoặc không khớp", 409);
                }

                return session;
            }
            catch (JsonException)
            {
                throw new BusinessException("Manifest phiên tải lên bị hỏng", 409);
            }
        }

        internal async Task WriteAsync(UploadSession session, CancellationToken ct)
        {
            var sessionDir = _storage.ResolveSession(session.ActorId, session.FolderId);
            Directory.CreateDirectory(sessionDir);
            var manifestPath = Path.Combine(sessionDir, "manifest.json");
            var tempManifestPath = Path.Combine(sessionDir, $"manifest.{Guid.NewGuid():D}.tmp");

            var json = JsonSerializer.Serialize(session, new JsonSerializerOptions { WriteIndented = true });
            await File.WriteAllTextAsync(tempManifestPath, json, ct);

            File.Move(tempManifestPath, manifestPath, overwrite: true);
        }
    }
}
