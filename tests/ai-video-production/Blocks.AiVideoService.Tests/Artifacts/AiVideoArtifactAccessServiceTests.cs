using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Blocks.AiVideoService.Domain;
using Blocks.AiVideoService.Infrastructure.Data;
using Blocks.AiVideoService.Importing;
using Blocks.AiVideoService.Artifacts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Xunit;

namespace Blocks.AiVideoService.Tests.Artifacts;

public class AiVideoArtifactAccessServiceTests
{
    private DbContextOptions<AiVideoDbContext> CreateNewContextOptions()
    {
        return new DbContextOptionsBuilder<AiVideoDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
    }

    private class TestSourceRegistry : IImportSourceRegistry
    {
        public string FakeRoot { get; set; } = Path.GetTempPath();

        public ImportSource Resolve(string sourceKey)
        {
            if (sourceKey == "invalid")
            {
                throw new ArgumentException("Invalid source key");
            }
            return new ImportSource(sourceKey, FakeRoot);
        }
    }

    [Fact]
    public async Task GetPreviewAsync_ReturnsUnsupportedMime_WhenMimeNotInAllowlist()
    {
        var options = CreateNewContextOptions();
        var registry = new TestSourceRegistry();
        var artifactId = Guid.NewGuid();

        using (var context = new AiVideoDbContext(options))
        {
            context.Artifacts.Add(new Artifact
            {
                Id = artifactId,
                RunId = "run-1",
                StageKey = "collect-news",
                LogicalType = "raw-news",
                StorageKey = "s3://bucket/exe.exe",
                MimeType = "application/x-msdownload",
                Checksum = "sha256-abc",
                Confidence = "high",
                Locator = "collect-news/exe.exe",
                SourceKey = "legacy"
            });
            await context.SaveChangesAsync();
        }

        using (var context = new AiVideoDbContext(options))
        {
            var service = new AiVideoArtifactAccessService(context, registry);

            var result = await service.GetPreviewAsync(artifactId, CancellationToken.None);

            Assert.False(result.IsSuccess);
            Assert.Equal(AccessErrorStatus.UnsupportedMime, result.ErrorStatus);
        }
    }

    [Fact]
    public async Task GetPreviewAsync_ReturnsInvalidLocator_WhenPathContainsTraversal()
    {
        var options = CreateNewContextOptions();
        var registry = new TestSourceRegistry();
        var artifactId = Guid.NewGuid();

        using (var context = new AiVideoDbContext(options))
        {
            context.Artifacts.Add(new Artifact
            {
                Id = artifactId,
                RunId = "run-1",
                StageKey = "collect-news",
                LogicalType = "raw-news",
                StorageKey = "s3://bucket/traversal",
                MimeType = "application/json",
                Checksum = "sha256-abc",
                Confidence = "high",
                Locator = "../../../etc/passwd",
                SourceKey = "legacy"
            });
            await context.SaveChangesAsync();
        }

        using (var context = new AiVideoDbContext(options))
        {
            var service = new AiVideoArtifactAccessService(context, registry);

            var result = await service.GetPreviewAsync(artifactId, CancellationToken.None);

            Assert.False(result.IsSuccess);
            Assert.Equal(AccessErrorStatus.InvalidLocator, result.ErrorStatus);
        }
    }

    [Fact]
    public async Task GetPreviewAsync_ReturnsSourceFileNotFound_WhenFileDoesNotExist()
    {
        var options = CreateNewContextOptions();
        var registry = new TestSourceRegistry();
        var artifactId = Guid.NewGuid();

        using (var context = new AiVideoDbContext(options))
        {
            context.Artifacts.Add(new Artifact
            {
                Id = artifactId,
                RunId = "run-1",
                StageKey = "collect-news",
                LogicalType = "raw-news",
                StorageKey = "s3://bucket/missing.json",
                MimeType = "application/json",
                Checksum = "sha256-abc",
                Confidence = "high",
                Locator = "collect-news/missing-file-that-does-not-exist.json",
                SourceKey = "legacy"
            });
            await context.SaveChangesAsync();
        }

        using (var context = new AiVideoDbContext(options))
        {
            var service = new AiVideoArtifactAccessService(context, registry);

            var result = await service.GetPreviewAsync(artifactId, CancellationToken.None);

            Assert.False(result.IsSuccess);
            Assert.Equal(AccessErrorStatus.SourceFileNotFound, result.ErrorStatus);
        }
    }

    [Fact]
    public async Task GetPreviewAsync_ReturnsTooLarge_WhenArtifactExceedsPreviewLimit()
    {
        var options = CreateNewContextOptions();
        var registry = new TestSourceRegistry();
        var artifactId = Guid.NewGuid();

        using (var context = new AiVideoDbContext(options))
        {
            context.Artifacts.Add(new Artifact
            {
                Id = artifactId,
                RunId = "run-1",
                StageKey = "compile-render-video",
                LogicalType = "large-video",
                StorageKey = "video/final.mp4",
                MimeType = "video/mp4",
                Checksum = "sha256-abc",
                Confidence = "verified",
                Locator = "video/final.mp4",
                SourceKey = "legacy",
                SizeInBytes = 26 * 1024 * 1024
            });
            await context.SaveChangesAsync();
        }

        using (var context = new AiVideoDbContext(options))
        {
            var service = new AiVideoArtifactAccessService(context, registry);

            var result = await service.GetPreviewAsync(artifactId, CancellationToken.None);

            Assert.False(result.IsSuccess);
            Assert.Equal(AccessErrorStatus.TooLarge, result.ErrorStatus);
        }
    }

    [Fact]
    public async Task GetDownloadAsync_ReturnsUnsupportedMime_WhenMimeNotAllowlisted()
    {
        var options = CreateNewContextOptions();
        var registry = new TestSourceRegistry();
        var artifactId = Guid.NewGuid();

        using (var context = new AiVideoDbContext(options))
        {
            context.Artifacts.Add(new Artifact
            {
                Id = artifactId,
                RunId = "run-1",
                StageKey = "collect-news",
                LogicalType = "executable",
                StorageKey = "bin/run.exe",
                MimeType = "application/x-msdownload",
                Checksum = "sha256-abc",
                Confidence = "verified",
                Locator = "bin/run.exe",
                SourceKey = "legacy"
            });
            await context.SaveChangesAsync();
        }

        using (var context = new AiVideoDbContext(options))
        {
            var service = new AiVideoArtifactAccessService(context, registry);

            var result = await service.GetDownloadAsync(artifactId, CancellationToken.None);

            Assert.False(result.IsSuccess);
            Assert.Equal(AccessErrorStatus.UnsupportedMime, result.ErrorStatus);
        }
    }
}
