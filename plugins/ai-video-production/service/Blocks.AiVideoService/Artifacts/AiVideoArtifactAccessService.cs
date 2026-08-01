using System;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Blocks.AiVideoService.Domain;
using Blocks.AiVideoService.Infrastructure.Data;
using Blocks.AiVideoService.Importing;
using Microsoft.EntityFrameworkCore;

namespace Blocks.AiVideoService.Artifacts;

public sealed class AiVideoArtifactAccessService
{
    private const long PreviewSizeLimitBytes = 25 * 1024 * 1024;
    private const long DownloadSizeLimitBytes = 512 * 1024 * 1024;

    private readonly AiVideoDbContext _dbContext;
    private readonly IImportSourceRegistry _sourceRegistry;

    private static readonly string[] PreviewMimeAllowlist =
    {
        "application/json",
        "text/markdown",
        "text/plain",
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
        "audio/mpeg",
        "audio/wav",
        "audio/mp3",
        "audio/x-wav",
        "audio/m4a",
        "audio/x-m4a",
        "video/mp4",
        "video/webm",
        "text/html"
    };

    private static readonly string[] DownloadMimeAllowlist =
    {
        "application/json",
        "text/markdown",
        "text/plain",
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
        "audio/mpeg",
        "audio/wav",
        "audio/mp3",
        "audio/x-wav",
        "audio/m4a",
        "audio/x-m4a",
        "video/mp4",
        "video/webm",
        "text/html",
        "application/zip"
    };

    public AiVideoArtifactAccessService(AiVideoDbContext dbContext, IImportSourceRegistry sourceRegistry)
    {
        _dbContext = dbContext;
        _sourceRegistry = sourceRegistry;
    }

    public async Task<ArtifactAccessResult> GetPreviewAsync(Guid artifactId, CancellationToken cancellationToken)
    {
        var artifact = await _dbContext.Artifacts
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == artifactId, cancellationToken);

        if (artifact == null)
        {
            return ArtifactAccessResult.NotFound();
        }

        if (!IsAllowedForPreview(artifact.MimeType))
        {
            return ArtifactAccessResult.UnsupportedMime();
        }

        if (artifact.SizeInBytes > PreviewSizeLimitBytes)
        {
            return ArtifactAccessResult.TooLarge("Artifact is too large for preview.");
        }

        return await ResolveArtifactFileAsync(artifact, cancellationToken);
    }

    public async Task<ArtifactAccessResult> GetDownloadAsync(Guid artifactId, CancellationToken cancellationToken)
    {
        var artifact = await _dbContext.Artifacts
            .AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == artifactId, cancellationToken);

        if (artifact == null)
        {
            return ArtifactAccessResult.NotFound();
        }

        if (!IsAllowedForDownload(artifact.MimeType))
        {
            return ArtifactAccessResult.UnsupportedMime();
        }

        if (artifact.SizeInBytes > DownloadSizeLimitBytes)
        {
            return ArtifactAccessResult.TooLarge("Artifact is too large for controlled download.");
        }

        var result = await ResolveArtifactFileAsync(artifact, cancellationToken);
        if (result.IsSuccess)
        {
            string safeFilename = Path.GetFileName(artifact.Locator);
            if (string.IsNullOrWhiteSpace(safeFilename))
            {
                safeFilename = $"{artifact.Id}.bin";
            }
            return ArtifactAccessResult.Success(result.FilePath!, artifact.MimeType, safeFilename);
        }

        return result;
    }

    private static bool IsAllowedForPreview(string mimeType)
    {
        return IsAllowedMime(mimeType, PreviewMimeAllowlist);
    }

    private static bool IsAllowedForDownload(string mimeType)
    {
        return IsAllowedMime(mimeType, DownloadMimeAllowlist);
    }

    private static bool IsAllowedMime(string mimeType, string[] allowlist)
    {
        return !string.IsNullOrWhiteSpace(mimeType)
            && allowlist.Contains(mimeType.Split(';')[0].Trim().ToLowerInvariant());
    }

    private async Task<ArtifactAccessResult> ResolveArtifactFileAsync(Artifact artifact, CancellationToken cancellationToken)
    {
        if (artifact.Locator.Contains("..") || artifact.Locator.Contains(":") || artifact.Locator.StartsWith("/") || artifact.Locator.StartsWith("\\"))
        {
            return ArtifactAccessResult.InvalidLocator("Invalid path locator pattern detected.");
        }

        try
        {
            var source = _sourceRegistry.Resolve(artifact.SourceKey);
            if (source == null)
            {
                return ArtifactAccessResult.Forbidden($"Source key '{artifact.SourceKey}' could not be resolved.");
            }

            var rootPath = Path.GetFullPath(source.RootPath);
            if (!rootPath.EndsWith(Path.DirectorySeparatorChar))
            {
                rootPath += Path.DirectorySeparatorChar;
            }

            string resolvedPath = Path.GetFullPath(Path.Combine(rootPath, artifact.Locator));

            if (!resolvedPath.StartsWith(rootPath, StringComparison.OrdinalIgnoreCase))
            {
                return ArtifactAccessResult.InvalidLocator("Path traversal attempt detected.");
            }

            if (!File.Exists(resolvedPath))
            {
                return ArtifactAccessResult.SourceFileNotFound();
            }

            return ArtifactAccessResult.Success(resolvedPath, artifact.MimeType, Path.GetFileName(resolvedPath));
        }
        catch (ArgumentException ex)
        {
            return ArtifactAccessResult.Forbidden(ex.Message);
        }
        catch (Exception)
        {
            return ArtifactAccessResult.Forbidden("Error resolving artifact source.");
        }
    }
}

public sealed class ArtifactAccessResult
{
    public bool IsSuccess { get; private set; }
    public string? FilePath { get; private set; }
    public string? MimeType { get; private set; }
    public string? FileName { get; private set; }
    public string? ErrorMessage { get; private set; }
    public AccessErrorStatus ErrorStatus { get; private set; }

    public static ArtifactAccessResult Success(string filePath, string mimeType, string fileName) =>
        new() { IsSuccess = true, FilePath = filePath, MimeType = mimeType, FileName = fileName };

    public static ArtifactAccessResult NotFound() =>
        new() { IsSuccess = false, ErrorStatus = AccessErrorStatus.NotFound, ErrorMessage = "Artifact record not found in database." };

    public static ArtifactAccessResult UnsupportedMime() =>
        new() { IsSuccess = false, ErrorStatus = AccessErrorStatus.UnsupportedMime, ErrorMessage = "Preview is not supported for this file type." };

    public static ArtifactAccessResult InvalidLocator(string message) =>
        new() { IsSuccess = false, ErrorStatus = AccessErrorStatus.InvalidLocator, ErrorMessage = message };

    public static ArtifactAccessResult SourceFileNotFound() =>
        new() { IsSuccess = false, ErrorStatus = AccessErrorStatus.SourceFileNotFound, ErrorMessage = "Source file does not exist on storage." };

    public static ArtifactAccessResult TooLarge(string message) =>
        new() { IsSuccess = false, ErrorStatus = AccessErrorStatus.TooLarge, ErrorMessage = message };

    public static ArtifactAccessResult Forbidden(string message) =>
        new() { IsSuccess = false, ErrorStatus = AccessErrorStatus.Forbidden, ErrorMessage = message };
}

public enum AccessErrorStatus
{
    None,
    NotFound,
    UnsupportedMime,
    InvalidLocator,
    SourceFileNotFound,
    TooLarge,
    Forbidden
}
