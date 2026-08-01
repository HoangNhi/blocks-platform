using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace Blocks.AiVideoService.Importing;

public sealed record ImportSource(string SourceKey, string RootPath);

internal sealed record ImportRequest(string SourceKey, bool Apply);

internal sealed record DiscoveredStageAttempt(
    string StageKey,
    string AttemptId,
    string Status,
    DateTime? StartedAt,
    DateTime? CompletedAt
);

internal sealed record DiscoveredArtifact(
    string StageKey,
    string LogicalType,
    string StorageKey,
    string MimeType,
    string Checksum,
    long SizeInBytes,
    string Confidence,
    string Locator
);

internal sealed record DiscoveredReceipt(
    string StageKey,
    string Locator,
    string Checksum,
    string Confidence
);

internal sealed record DiscoveredRun(
    string RunId,
    string Lane,
    DateTime WindowStart,
    DateTime WindowEnd,
    string WorkflowVersion,
    string ContractVersion,
    Guid CorrelationId,
    IReadOnlyList<DiscoveredStageAttempt> StageAttempts,
    IReadOnlyList<DiscoveredArtifact> Artifacts,
    IReadOnlyList<DiscoveredReceipt> Receipts
);

internal sealed record DiscoveredEvidence(IReadOnlyList<DiscoveredRun> Runs);

public interface IImportSourceRegistry
{
    ImportSource Resolve(string sourceKey);
}

internal interface ILegacyTracerEvidenceReader
{
    Task<DiscoveredEvidence> ReadAsync(ImportSource source, CancellationToken cancellationToken);
}

internal interface ITargetEvidenceReader
{
    Task<DiscoveredEvidence> ReadAsync(ImportSource source, CancellationToken cancellationToken);
}
