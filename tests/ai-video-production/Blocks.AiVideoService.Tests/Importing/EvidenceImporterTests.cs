using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Blocks.AiVideoService.Domain;
using Blocks.AiVideoService.Importing;
using Blocks.AiVideoService.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Xunit;

namespace Blocks.AiVideoService.Tests.Importing;

public class EvidenceImporterTests
{
    private readonly DbContextOptions<AiVideoDbContext> _options;

    public EvidenceImporterTests()
    {
        _options = new DbContextOptionsBuilder<AiVideoDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .ConfigureWarnings(x => x.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
            .Options;
    }

    [Fact]
    public async Task DryRun_does_not_persist_any_data_to_database()
    {
        using var context = new AiVideoDbContext(_options);
        var mockReader = new MockEvidenceReader();
        var tempPath = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        Directory.CreateDirectory(tempPath);

        try
        {
            var options = Options.Create(new ImportSourceOptions { Legacy = tempPath });
            var registry = new ImportSourceRegistry(options);
            var importer = new EvidenceImporter(context, registry, mockReader, mockReader);

            // Add one run to reader
            var correlationId = Guid.NewGuid();
            mockReader.Runs.Add(new DiscoveredRun(
                RunId: "adw-20260724-legacy-001",
                Lane: "legacy",
                WindowStart: DateTime.UtcNow.Date,
                WindowEnd: DateTime.UtcNow.Date.AddDays(7),
                WorkflowVersion: "1.0",
                ContractVersion: "1.0",
                CorrelationId: correlationId,
                StageAttempts: new[] { new DiscoveredStageAttempt("collect-news", "adw-20260724-legacy-001-att-001", "completed", null, null) },
                Artifacts: new[] { new DiscoveredArtifact("collect-news", "Collection status", "run/adw-20260724-legacy-001/collect/status.json", "application/json", "checksum1", 100, "verified", "run/adw-20260724-legacy-001/collect/status.json") },
                Receipts: new[] { new DiscoveredReceipt("collect-news", "run/adw-20260724-legacy-001/collect/status.json", "checksum1", "verified") }
            ));

            var outcome = await importer.ImportAsync(new ImportRequest("legacy", Apply: false), CancellationToken.None);

            Assert.False(outcome.Applied);
            Assert.Equal(1, outcome.CreatedRuns);
            Assert.Equal(1, outcome.CreatedArtifacts);
            Assert.Equal(0, outcome.RejectedEvidence);

            // Verify DB is empty
            Assert.Empty(context.ImportedRuns);
            Assert.Empty(context.Artifacts);
            Assert.Empty(context.Receipts);
        }
        finally
        {
            Directory.Delete(tempPath, true);
        }
    }

    [Fact]
    public async Task CompleteImport_persists_runs_attempts_artifacts_receipts_and_reimport_is_idempotent()
    {
        using var context = new AiVideoDbContext(_options);
        var mockReader = new MockEvidenceReader();
        var tempPath = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        Directory.CreateDirectory(tempPath);

        try
        {
            var options = Options.Create(new ImportSourceOptions { Legacy = tempPath });
            var registry = new ImportSourceRegistry(options);
            var importer = new EvidenceImporter(context, registry, mockReader, mockReader);

            var correlationId = Guid.NewGuid();
            var run = new DiscoveredRun(
                RunId: "adw-20260724-legacy-001",
                Lane: "legacy",
                WindowStart: DateTime.UtcNow.Date,
                WindowEnd: DateTime.UtcNow.Date.AddDays(7),
                WorkflowVersion: "1.0",
                ContractVersion: "1.0",
                CorrelationId: correlationId,
                StageAttempts: new[] { new DiscoveredStageAttempt("collect-news", "adw-20260724-legacy-001-att-001", "completed", null, null) },
                Artifacts: new[] { new DiscoveredArtifact("collect-news", "Collection status", "run/adw-20260724-legacy-001/collect/status.json", "application/json", "checksum1", 100, "verified", "run/adw-20260724-legacy-001/collect/status.json") },
                Receipts: new[] { new DiscoveredReceipt("collect-news", "run/adw-20260724-legacy-001/collect/status.json", "checksum1", "verified") }
            );
            mockReader.Runs.Add(run);

            // First import (Apply = true)
            var outcome1 = await importer.ImportAsync(new ImportRequest("legacy", Apply: true), CancellationToken.None);
            Assert.True(outcome1.Applied);
            Assert.Equal(1, outcome1.CreatedRuns);
            Assert.Equal(1, outcome1.CreatedArtifacts);
            Assert.Equal(0, outcome1.RejectedEvidence);

            // Verify in DB
            Assert.Single(context.ImportedRuns);
            Assert.Single(context.Artifacts);
            Assert.Single(context.Receipts);

            // Re-import (should be idempotent no-op)
            var outcome2 = await importer.ImportAsync(new ImportRequest("legacy", Apply: true), CancellationToken.None);
            Assert.True(outcome2.Applied);
            Assert.Equal(0, outcome2.CreatedRuns);
            Assert.Equal(0, outcome2.CreatedArtifacts);
            Assert.Equal(0, outcome2.RejectedEvidence);
        }
        finally
        {
            Directory.Delete(tempPath, true);
        }
    }

    [Fact]
    public async Task ReImport_same_attempt_different_checksum_rejects_and_records_reconciliation_event()
    {
        using var context = new AiVideoDbContext(_options);
        var mockReader = new MockEvidenceReader();
        var tempPath = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        Directory.CreateDirectory(tempPath);

        try
        {
            var options = Options.Create(new ImportSourceOptions { Legacy = tempPath });
            var registry = new ImportSourceRegistry(options);
            var importer = new EvidenceImporter(context, registry, mockReader, mockReader);

            var correlationId = Guid.NewGuid();
            var run1 = new DiscoveredRun(
                RunId: "adw-20260724-legacy-001",
                Lane: "legacy",
                WindowStart: DateTime.UtcNow.Date,
                WindowEnd: DateTime.UtcNow.Date.AddDays(7),
                WorkflowVersion: "1.0",
                ContractVersion: "1.0",
                CorrelationId: correlationId,
                StageAttempts: new[] { new DiscoveredStageAttempt("collect-news", "adw-20260724-legacy-001-att-001", "completed", null, null) },
                Artifacts: new[] { new DiscoveredArtifact("collect-news", "Collection status", "run/adw-20260724-legacy-001/collect/status.json", "application/json", "checksum1", 100, "verified", "run/adw-20260724-legacy-001/collect/status.json") },
                Receipts: new[] { new DiscoveredReceipt("collect-news", "run/adw-20260724-legacy-001/collect/status.json", "checksum1", "verified") }
            );
            mockReader.Runs.Add(run1);

            await importer.ImportAsync(new ImportRequest("legacy", Apply: true), CancellationToken.None);

            // Change the checksum for the same attempt in reader
            mockReader.Runs.Clear();
            var run2 = new DiscoveredRun(
                RunId: "adw-20260724-legacy-001",
                Lane: "legacy",
                WindowStart: DateTime.UtcNow.Date,
                WindowEnd: DateTime.UtcNow.Date.AddDays(7),
                WorkflowVersion: "1.0",
                ContractVersion: "1.0",
                CorrelationId: correlationId,
                StageAttempts: new[] { new DiscoveredStageAttempt("collect-news", "adw-20260724-legacy-001-att-001", "completed", null, null) },
                Artifacts: new[] { new DiscoveredArtifact("collect-news", "Collection status", "run/adw-20260724-legacy-001/collect/status.json", "application/json", "checksum2", 100, "verified", "run/adw-20260724-legacy-001/collect/status.json") },
                Receipts: new[] { new DiscoveredReceipt("collect-news", "run/adw-20260724-legacy-001/collect/status.json", "checksum2", "verified") }
            );
            mockReader.Runs.Add(run2);

            var outcome = await importer.ImportAsync(new ImportRequest("legacy", Apply: true), CancellationToken.None);
            Assert.Equal(2, outcome.RejectedEvidence);

            // Verify ReconciliationEvents were created
            Assert.Equal(2, context.ReconciliationEvents.Count());
            var reList = await context.ReconciliationEvents.ToListAsync();
            Assert.Contains(reList, re => re.ConflictType == "ArtifactChecksumConflict" && re.ExpectedChecksum == "checksum1" && re.ObservedChecksum == "checksum2");
            Assert.Contains(reList, re => re.ConflictType == "ReceiptChecksumConflict" && re.ExpectedChecksum == "checksum1" && re.ObservedChecksum == "checksum2");
        }
        finally
        {
            Directory.Delete(tempPath, true);
        }
    }

    [Fact]
    public async Task NewAttempt_different_checksum_creates_next_version_of_artifact()
    {
        using var context = new AiVideoDbContext(_options);
        var mockReader = new MockEvidenceReader();
        var tempPath = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        Directory.CreateDirectory(tempPath);

        try
        {
            var options = Options.Create(new ImportSourceOptions { Legacy = tempPath });
            var registry = new ImportSourceRegistry(options);
            var importer = new EvidenceImporter(context, registry, mockReader, mockReader);

            var correlationId = Guid.NewGuid();
            var run1 = new DiscoveredRun(
                RunId: "adw-20260724-legacy-001",
                Lane: "legacy",
                WindowStart: DateTime.UtcNow.Date,
                WindowEnd: DateTime.UtcNow.Date.AddDays(7),
                WorkflowVersion: "1.0",
                ContractVersion: "1.0",
                CorrelationId: correlationId,
                StageAttempts: new[] { new DiscoveredStageAttempt("collect-news", "adw-20260724-legacy-001-att-001", "completed", null, null) },
                Artifacts: new[] { new DiscoveredArtifact("collect-news", "Collection status", "run/adw-20260724-legacy-001/collect/status.json", "application/json", "checksum1", 100, "verified", "run/adw-20260724-legacy-001/collect/status.json") },
                Receipts: new[] { new DiscoveredReceipt("collect-news", "run/adw-20260724-legacy-001/collect/status.json", "checksum1", "verified") }
            );
            mockReader.Runs.Add(run1);

            await importer.ImportAsync(new ImportRequest("legacy", Apply: true), CancellationToken.None);

            // Import again under a different attempt ID
            mockReader.Runs.Clear();
            var run2 = new DiscoveredRun(
                RunId: "adw-20260724-legacy-001",
                Lane: "legacy",
                WindowStart: DateTime.UtcNow.Date,
                WindowEnd: DateTime.UtcNow.Date.AddDays(7),
                WorkflowVersion: "1.0",
                ContractVersion: "1.0",
                CorrelationId: correlationId,
                StageAttempts: new[] { new DiscoveredStageAttempt("collect-news", "adw-20260724-legacy-001-att-002", "completed", null, null) },
                Artifacts: new[] { new DiscoveredArtifact("collect-news", "Collection status", "run/adw-20260724-legacy-001/collect/status.json", "application/json", "checksum2", 100, "verified", "run/adw-20260724-legacy-001/collect/status.json") },
                Receipts: new[] { new DiscoveredReceipt("collect-news", "run/adw-20260724-legacy-001/collect/status.json", "checksum2", "verified") }
            );
            mockReader.Runs.Add(run2);

            var outcome = await importer.ImportAsync(new ImportRequest("legacy", Apply: true), CancellationToken.None);
            Assert.Equal(0, outcome.RejectedEvidence);
            Assert.Equal(1, outcome.CreatedArtifacts);

            // Verify both versions exist in DB
            var dbArtifacts = await context.Artifacts.ToListAsync();
            Assert.Equal(2, dbArtifacts.Count);
            
            var v1 = dbArtifacts.First(a => a.Version == 1);
            Assert.Equal("checksum1", v1.Checksum);

            var v2 = dbArtifacts.First(a => a.Version == 2);
            Assert.Equal("checksum2", v2.Checksum);
        }
        finally
        {
            Directory.Delete(tempPath, true);
        }
    }

    [Fact]
    public async Task TargetImport_uses_target_reader_and_persists_data()
    {
        using var context = new AiVideoDbContext(_options);
        var mockReader = new MockEvidenceReader();
        var tempPath = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString());
        Directory.CreateDirectory(tempPath);

        try
        {
            var options = Options.Create(new ImportSourceOptions { Target = tempPath });
            var registry = new ImportSourceRegistry(options);
            var importer = new EvidenceImporter(context, registry, mockReader, mockReader);

            var correlationId = Guid.NewGuid();
            var run = new DiscoveredRun(
                RunId: "adw-20260725-target-001",
                Lane: "target",
                WindowStart: DateTime.UtcNow.Date,
                WindowEnd: DateTime.UtcNow.Date.AddDays(7),
                WorkflowVersion: "1.0",
                ContractVersion: "1.0",
                CorrelationId: correlationId,
                StageAttempts: new[] { new DiscoveredStageAttempt("collect-news", "adw-20260725-target-001-att-001", "completed", null, null) },
                Artifacts: new[] { new DiscoveredArtifact("collect-news", "Collection status", "run/adw-20260725-target-001/collect/status.json", "application/json", "checksum1", 100, "verified", "run/adw-20260725-target-001/collect/status.json") },
                Receipts: new[] { new DiscoveredReceipt("collect-news", "run/adw-20260725-target-001/collect/status.json", "checksum1", "verified") }
            );
            mockReader.Runs.Add(run);

            var outcome = await importer.ImportAsync(new ImportRequest("target", Apply: true), CancellationToken.None);
            Assert.True(outcome.Applied);
            Assert.Equal(1, outcome.CreatedRuns);
            Assert.Equal(1, outcome.CreatedArtifacts);
            Assert.Equal(0, outcome.RejectedEvidence);

            Assert.Single(context.ImportedRuns);
            Assert.Equal("target", context.ImportedRuns.First().Lane);
        }
        finally
        {
            Directory.Delete(tempPath, true);
        }
    }

    private class MockEvidenceReader : ILegacyTracerEvidenceReader, ITargetEvidenceReader
    {
        public List<DiscoveredRun> Runs { get; } = new();

        public Task<DiscoveredEvidence> ReadAsync(ImportSource source, CancellationToken cancellationToken)
        {
            return Task.FromResult(new DiscoveredEvidence(Runs));
        }
    }
}
