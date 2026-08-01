using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Blocks.AiVideoService.Domain;
using Blocks.AiVideoService.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Blocks.AiVideoService.Importing;

internal sealed class EvidenceImporter : IEvidenceImporter
{
    private readonly AiVideoDbContext _dbContext;
    private readonly IImportSourceRegistry _sourceRegistry;
    private readonly ILegacyTracerEvidenceReader _legacyReader;
    private readonly ITargetEvidenceReader _targetReader;

    public EvidenceImporter(
        AiVideoDbContext dbContext,
        IImportSourceRegistry sourceRegistry,
        ILegacyTracerEvidenceReader legacyReader,
        ITargetEvidenceReader targetReader)
    {
        _dbContext = dbContext;
        _sourceRegistry = sourceRegistry;
        _legacyReader = legacyReader;
        _targetReader = targetReader;
    }

    public async Task<ImportOutcome> ImportAsync(ImportRequest request, CancellationToken cancellationToken)
    {
        var source = _sourceRegistry.Resolve(request.SourceKey);
        DiscoveredEvidence evidence;
        if (source.SourceKey == "target")
        {
            evidence = await _targetReader.ReadAsync(source, cancellationToken);
        }
        else
        {
            evidence = await _legacyReader.ReadAsync(source, cancellationToken);
        }

        Guid batchId = Guid.NewGuid();
        int createdRuns = 0;
        int createdArtifacts = 0;
        int rejectedEvidence = 0;

        if (request.Apply)
        {
            await using var transaction = await _dbContext.Database.BeginTransactionAsync(cancellationToken);
            try
            {
                var batch = new ImportBatch
                {
                    Id = batchId,
                    SourceKey = source.SourceKey,
                    ImportedAt = DateTime.UtcNow,
                    IsApplied = true
                };
                _dbContext.ImportBatches.Add(batch);
                await _dbContext.SaveChangesAsync(cancellationToken);

                foreach (var run in evidence.Runs)
                {
                    // 1. Check or Create ImportedRun
                    var existingRun = await _dbContext.ImportedRuns
                        .FirstOrDefaultAsync(r => r.Id == run.RunId, cancellationToken);

                    if (existingRun == null)
                    {
                        var newRun = new ImportedRun
                        {
                            Id = run.RunId,
                            ImportBatchId = batchId,
                            SourceKey = source.SourceKey,
                            Lane = run.Lane,
                            WindowStart = run.WindowStart,
                            WindowEnd = run.WindowEnd,
                            WorkflowVersion = run.WorkflowVersion,
                            ContractVersion = run.ContractVersion,
                            CorrelationId = run.CorrelationId,
                            ImportedAt = DateTime.UtcNow
                        };
                        _dbContext.ImportedRuns.Add(newRun);
                        createdRuns++;
                    }

                    // 2. Import Stage Attempts
                    foreach (var attempt in run.StageAttempts)
                    {
                        var existingAttempt = await _dbContext.StageAttempts
                            .FirstOrDefaultAsync(a => a.RunId == run.RunId && a.StageKey == attempt.StageKey && a.AttemptId == attempt.AttemptId, cancellationToken);

                        if (existingAttempt == null)
                        {
                            var newAttempt = new StageAttempt
                            {
                                Id = Guid.NewGuid(),
                                RunId = run.RunId,
                                ImportBatchId = batchId,
                                StageKey = attempt.StageKey,
                                AttemptId = attempt.AttemptId,
                                Status = attempt.Status,
                                StartedAt = attempt.StartedAt,
                                CompletedAt = attempt.CompletedAt,
                                ImportedAt = DateTime.UtcNow
                            };
                            _dbContext.StageAttempts.Add(newAttempt);
                        }
                    }

                    // 3. Import Receipts
                    foreach (var receipt in run.Receipts)
                    {
                        var existingReceipts = await _dbContext.Receipts
                            .Where(r => r.RunId == run.RunId && r.StageKey == receipt.StageKey && r.Locator == receipt.Locator)
                            .ToListAsync(cancellationToken);

                        if (existingReceipts.Any(r => r.Checksum == receipt.Checksum))
                        {
                            // Idempotent duplicate, skip
                            continue;
                        }

                        if (existingReceipts.Any())
                        {
                            // Checksum is different. Is it a same-attempt conflict?
                            var discoveredAttempt = run.StageAttempts.FirstOrDefault(a => a.StageKey == receipt.StageKey);
                            string discoveredAttemptId = discoveredAttempt?.AttemptId ?? $"{run.RunId}-att-001";

                            var existingAttempt = await _dbContext.StageAttempts
                                .FirstOrDefaultAsync(a => a.RunId == run.RunId && a.StageKey == receipt.StageKey && a.AttemptId == discoveredAttemptId, cancellationToken);

                            if (existingAttempt != null)
                            {
                                // Conflicting checksum on same attempt
                                rejectedEvidence++;
                                var re = new ReconciliationEvent
                                {
                                    Id = Guid.NewGuid(),
                                    ImportBatchId = batchId,
                                    RunId = run.RunId,
                                    StageKey = receipt.StageKey,
                                    Locator = receipt.Locator,
                                    ConflictType = "ReceiptChecksumConflict",
                                    ExpectedChecksum = existingReceipts.First().Checksum,
                                    ObservedChecksum = receipt.Checksum,
                                    Message = $"Receipt checksum conflict for {receipt.Locator} on attempt {discoveredAttemptId}. Existing: {existingReceipts.First().Checksum}, New: {receipt.Checksum}",
                                    ImportedAt = DateTime.UtcNow
                                };
                                _dbContext.ReconciliationEvents.Add(re);
                                continue;
                            }
                        }

                        var newReceipt = new Receipt
                        {
                            Id = Guid.NewGuid(),
                            RunId = run.RunId,
                            ImportBatchId = batchId,
                            SourceKey = source.SourceKey,
                            StageKey = receipt.StageKey,
                            Locator = receipt.Locator,
                            Checksum = receipt.Checksum,
                            Confidence = receipt.Confidence,
                            ImportedAt = DateTime.UtcNow
                        };
                        _dbContext.Receipts.Add(newReceipt);
                    }

                    // 4. Import Artifacts
                    foreach (var artifact in run.Artifacts)
                    {
                        var existingArtifacts = await _dbContext.Artifacts
                            .Where(a => a.RunId == run.RunId && a.StageKey == artifact.StageKey && a.Locator == artifact.Locator)
                            .ToListAsync(cancellationToken);

                        if (existingArtifacts.Any(a => a.Checksum == artifact.Checksum))
                        {
                            // Identical checksum exists, skip (idempotent)
                            continue;
                        }

                        if (existingArtifacts.Any())
                        {
                            // Checksum is different. Is it a same-attempt conflict?
                            var discoveredAttempt = run.StageAttempts.FirstOrDefault(a => a.StageKey == artifact.StageKey);
                            string discoveredAttemptId = discoveredAttempt?.AttemptId ?? $"{run.RunId}-att-001";

                            var existingAttempt = await _dbContext.StageAttempts
                                .FirstOrDefaultAsync(a => a.RunId == run.RunId && a.StageKey == artifact.StageKey && a.AttemptId == discoveredAttemptId, cancellationToken);

                            if (existingAttempt != null)
                            {
                                // Conflicting checksum on same attempt!
                                rejectedEvidence++;
                                var re = new ReconciliationEvent
                                {
                                    Id = Guid.NewGuid(),
                                    ImportBatchId = batchId,
                                    RunId = run.RunId,
                                    StageKey = artifact.StageKey,
                                    Locator = artifact.Locator,
                                    ConflictType = "ArtifactChecksumConflict",
                                    ExpectedChecksum = existingArtifacts.First().Checksum,
                                    ObservedChecksum = artifact.Checksum,
                                    Message = $"Artifact checksum conflict for {artifact.Locator} on attempt {discoveredAttemptId}. Existing: {existingArtifacts.First().Checksum}, New: {artifact.Checksum}",
                                    ImportedAt = DateTime.UtcNow
                                };
                                _dbContext.ReconciliationEvents.Add(re);
                                continue;
                            }
                            else
                            {
                                // Different attempt. Create new version
                                int maxVersion = existingArtifacts.Max(a => a.Version);
                                var newArtifact = new Artifact
                                {
                                    Id = Guid.NewGuid(),
                                    RunId = run.RunId,
                                    ImportBatchId = batchId,
                                    SourceKey = source.SourceKey,
                                    StageKey = artifact.StageKey,
                                    LogicalType = artifact.LogicalType,
                                    StorageKey = artifact.StorageKey,
                                    MimeType = artifact.MimeType,
                                    Checksum = artifact.Checksum,
                                    SizeInBytes = artifact.SizeInBytes,
                                    Confidence = artifact.Confidence,
                                    Version = maxVersion + 1,
                                    Locator = artifact.Locator,
                                    ImportedAt = DateTime.UtcNow
                                };
                                _dbContext.Artifacts.Add(newArtifact);
                                createdArtifacts++;
                            }
                        }
                        else
                        {
                            // First version of artifact
                            var newArtifact = new Artifact
                            {
                                Id = Guid.NewGuid(),
                                RunId = run.RunId,
                                ImportBatchId = batchId,
                                SourceKey = source.SourceKey,
                                StageKey = artifact.StageKey,
                                LogicalType = artifact.LogicalType,
                                StorageKey = artifact.StorageKey,
                                MimeType = artifact.MimeType,
                                Checksum = artifact.Checksum,
                                SizeInBytes = artifact.SizeInBytes,
                                Confidence = artifact.Confidence,
                                Version = 1,
                                Locator = artifact.Locator,
                                ImportedAt = DateTime.UtcNow
                            };
                            _dbContext.Artifacts.Add(newArtifact);
                            createdArtifacts++;
                        }
                    }
                }

                await _dbContext.SaveChangesAsync(cancellationToken);
                await transaction.CommitAsync(cancellationToken);
            }
            catch
            {
                await transaction.RollbackAsync(cancellationToken);
                throw;
            }
        }
        else
        {
            // Dry run: simulate counts
            foreach (var run in evidence.Runs)
            {
                var existingRun = await _dbContext.ImportedRuns
                    .FirstOrDefaultAsync(r => r.Id == run.RunId, cancellationToken);
                if (existingRun == null)
                {
                    createdRuns++;
                }

                foreach (var receipt in run.Receipts)
                {
                    var existingReceipts = await _dbContext.Receipts
                        .Where(r => r.RunId == run.RunId && r.StageKey == receipt.StageKey && r.Locator == receipt.Locator)
                        .ToListAsync(cancellationToken);

                    if (existingReceipts.Any(r => r.Checksum == receipt.Checksum))
                    {
                        continue;
                    }

                    if (existingReceipts.Any())
                    {
                        var discoveredAttempt = run.StageAttempts.FirstOrDefault(a => a.StageKey == receipt.StageKey);
                        string discoveredAttemptId = discoveredAttempt?.AttemptId ?? $"{run.RunId}-att-001";

                        var existingAttempt = await _dbContext.StageAttempts
                            .FirstOrDefaultAsync(a => a.RunId == run.RunId && a.StageKey == receipt.StageKey && a.AttemptId == discoveredAttemptId, cancellationToken);

                        if (existingAttempt != null)
                        {
                            rejectedEvidence++;
                        }
                    }
                }

                foreach (var artifact in run.Artifacts)
                {
                    var existingArtifacts = await _dbContext.Artifacts
                        .Where(a => a.RunId == run.RunId && a.StageKey == artifact.StageKey && a.Locator == artifact.Locator)
                        .ToListAsync(cancellationToken);

                    if (existingArtifacts.Any(a => a.Checksum == artifact.Checksum))
                    {
                        continue;
                    }

                    if (existingArtifacts.Any())
                    {
                        var discoveredAttempt = run.StageAttempts.FirstOrDefault(a => a.StageKey == artifact.StageKey);
                        string discoveredAttemptId = discoveredAttempt?.AttemptId ?? $"{run.RunId}-att-001";

                        var existingAttempt = await _dbContext.StageAttempts
                            .FirstOrDefaultAsync(a => a.RunId == run.RunId && a.StageKey == artifact.StageKey && a.AttemptId == discoveredAttemptId, cancellationToken);

                        if (existingAttempt != null)
                        {
                            rejectedEvidence++;
                        }
                        else
                        {
                            createdArtifacts++;
                        }
                    }
                    else
                    {
                        createdArtifacts++;
                    }
                }
            }
        }

        return new ImportOutcome(batchId, createdRuns, createdArtifacts, rejectedEvidence, request.Apply);
    }
}
