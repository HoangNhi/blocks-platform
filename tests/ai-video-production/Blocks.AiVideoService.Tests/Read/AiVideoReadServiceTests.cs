using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Blocks.AiVideoService.Domain;
using Blocks.AiVideoService.Infrastructure.Data;
using Blocks.AiVideoService.Read;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Blocks.AiVideoService.Tests.Read;

public class AiVideoReadServiceTests
{
    private DbContextOptions<AiVideoDbContext> CreateNewContextOptions()
    {
        return new DbContextOptionsBuilder<AiVideoDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
    }

    [Fact]
    public async Task ListRunsAsync_ReturnsNewestFirst_AndAggregatesStatusCorrectly()
    {
        var options = CreateNewContextOptions();
        using (var context = new AiVideoDbContext(options))
        {
            var batchId = Guid.NewGuid();
            context.ImportedRuns.AddRange(new[]
            {
                new ImportedRun
                {
                    Id = "run-1",
                    Lane = "weekly",
                    WindowStart = new DateTime(2026, 7, 1),
                    WindowEnd = new DateTime(2026, 7, 8),
                    ImportedAt = new DateTime(2026, 7, 24, 10, 0, 0),
                    WorkflowVersion = "1.0",
                    ContractVersion = "1.0",
                    SourceKey = "legacy"
                },
                new ImportedRun
                {
                    Id = "run-2",
                    Lane = "weekly",
                    WindowStart = new DateTime(2026, 7, 8),
                    WindowEnd = new DateTime(2026, 7, 15),
                    ImportedAt = new DateTime(2026, 7, 24, 11, 0, 0),
                    WorkflowVersion = "1.0",
                    ContractVersion = "1.0",
                    SourceKey = "legacy"
                }
            });

            context.StageAttempts.Add(new StageAttempt
            {
                Id = Guid.NewGuid(),
                RunId = "run-1",
                StageKey = "collect-news",
                AttemptId = "run-1-att-1",
                Status = "failed",
                StartedAt = DateTime.UtcNow,
                ImportedAt = DateTime.UtcNow
            });

            context.StageAttempts.Add(new StageAttempt
            {
                Id = Guid.NewGuid(),
                RunId = "run-2",
                StageKey = "qa-review-delivery",
                AttemptId = "run-2-att-1",
                Status = "success",
                StartedAt = DateTime.UtcNow,
                ImportedAt = DateTime.UtcNow
            });

            await context.SaveChangesAsync();
        }

        using (var context = new AiVideoDbContext(options))
        {
            var service = new AiVideoReadService(context);

            var (items, total) = await service.ListRunsAsync(new AiVideoRunListQuery(), CancellationToken.None);

            Assert.Equal(2, total);
            Assert.Equal("run-2", items[0].Id);
            Assert.Equal("completed", items[0].Status);
            Assert.Equal("run-1", items[1].Id);
            Assert.Equal("failed", items[1].Status);
        }
    }

    [Fact]
    public async Task GetRunDetailAsync_ReturnsAllNineTimelineStages_WithUnknownForMissing()
    {
        var options = CreateNewContextOptions();
        using (var context = new AiVideoDbContext(options))
        {
            context.ImportedRuns.Add(new ImportedRun
            {
                Id = "run-detail-test",
                Lane = "weekly",
                ImportedAt = DateTime.UtcNow,
                WorkflowVersion = "1.0",
                ContractVersion = "1.0",
                SourceKey = "legacy"
            });

            context.StageAttempts.AddRange(new[]
            {
                new StageAttempt
                {
                    Id = Guid.NewGuid(),
                    RunId = "run-detail-test",
                    StageKey = "collect-news",
                    AttemptId = "run-detail-test-att-1",
                    Status = "success",
                    StartedAt = DateTime.UtcNow,
                    ImportedAt = DateTime.UtcNow
                },
                new StageAttempt
                {
                    Id = Guid.NewGuid(),
                    RunId = "run-detail-test",
                    StageKey = "build-weekly-corpus",
                    AttemptId = "run-detail-test-att-1",
                    Status = "running",
                    StartedAt = DateTime.UtcNow,
                    ImportedAt = DateTime.UtcNow
                }
            });

            context.Artifacts.Add(new Artifact
            {
                Id = Guid.NewGuid(),
                RunId = "run-detail-test",
                StageKey = "collect-news",
                LogicalType = "raw-news",
                StorageKey = "s3://bucket/raw.json",
                MimeType = "application/json",
                Checksum = "sha256-abc",
                Confidence = "high",
                Locator = "collect-news/raw.json",
                SourceKey = "legacy"
            });

            await context.SaveChangesAsync();
        }

        using (var context = new AiVideoDbContext(options))
        {
            var service = new AiVideoReadService(context);

            var detail = await service.GetRunDetailAsync("run-detail-test", CancellationToken.None);

            Assert.NotNull(detail);
            Assert.Equal(9, detail.Timeline.Count);

            var firstStage = detail.Timeline.First(t => t.StageKey == "collect-news");
            Assert.Equal("success", firstStage.Status);
            Assert.Equal("run-detail-test-att-1", firstStage.AttemptId);

            var secondStage = detail.Timeline.First(t => t.StageKey == "build-weekly-corpus");
            Assert.Equal("running", secondStage.Status);

            var thirdStage = detail.Timeline.First(t => t.StageKey == "score-select-stories");
            Assert.Equal("Unknown", thirdStage.Status);
            Assert.Null(thirdStage.AttemptId);

            Assert.Single(detail.Artifacts);
            Assert.Equal("raw-news", detail.Artifacts[0].LogicalType);
        }
    }

    [Fact]
    public async Task GetRunArtifactsAsync_ReturnsArtifactsOnlyForExistingRun()
    {
        var options = CreateNewContextOptions();
        var artifactId = Guid.NewGuid();
        using (var context = new AiVideoDbContext(options))
        {
            context.ImportedRuns.Add(new ImportedRun
            {
                Id = "run-artifacts-test",
                Lane = "weekly",
                ImportedAt = DateTime.UtcNow,
                WorkflowVersion = "1.0",
                ContractVersion = "1.0",
                SourceKey = "legacy"
            });
            context.Artifacts.Add(new Artifact
            {
                Id = artifactId,
                RunId = "run-artifacts-test",
                StageKey = "collect-news",
                LogicalType = "raw-news",
                StorageKey = "source/raw.json",
                MimeType = "application/json",
                Checksum = "sha256-abc",
                Confidence = "verified",
                Locator = "collect-news/raw.json",
                SourceKey = "legacy"
            });
            await context.SaveChangesAsync();
        }

        using (var context = new AiVideoDbContext(options))
        {
            var service = new AiVideoReadService(context);

            var artifacts = await service.GetRunArtifactsAsync("run-artifacts-test", CancellationToken.None);
            var missing = await service.GetRunArtifactsAsync("missing", CancellationToken.None);

            Assert.NotNull(artifacts);
            Assert.Single(artifacts);
            Assert.Equal(artifactId, artifacts[0].Id);
            Assert.Null(missing);
        }
    }

    [Fact]
    public async Task GetStatusAsync_ReturnsCountsAndUnknownProviderState()
    {
        var options = CreateNewContextOptions();
        using (var context = new AiVideoDbContext(options))
        {
            context.ImportedRuns.Add(new ImportedRun
            {
                Id = "run-status-test",
                Lane = "weekly",
                ImportedAt = DateTime.UtcNow,
                WorkflowVersion = "1.0",
                ContractVersion = "1.0",
                SourceKey = "legacy"
            });
            await context.SaveChangesAsync();
        }

        using (var context = new AiVideoDbContext(options))
        {
            var service = new AiVideoReadService(context);

            var status = await service.GetStatusAsync(CancellationToken.None);

            Assert.True(status.IsHealthy);
            Assert.Equal(1, status.ImportedRunCount);
            Assert.Equal("Unknown", status.WorkerStatus);
            Assert.Equal("Unknown", status.ProviderConfigurationStatus);
        }
    }
}
