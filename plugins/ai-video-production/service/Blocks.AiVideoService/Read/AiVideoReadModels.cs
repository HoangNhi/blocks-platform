using System;
using System.Collections.Generic;

namespace Blocks.AiVideoService.Read;

public record AiVideoRunListQuery(
    string? Search = null,
    string? Lane = null,
    string? Status = null,
    DateTime? From = null,
    DateTime? To = null,
    int Page = 1,
    int PageSize = 20
);

public record AiVideoRunSummaryDto(
    string Id,
    string Lane,
    string Status,
    DateTime WindowStart,
    DateTime WindowEnd,
    string WorkflowVersion,
    DateTime ImportedAt
);

public record AiVideoStageTimelineItemDto(
    string StageKey,
    string? AttemptId,
    string Status,
    DateTime? StartedAt,
    DateTime? CompletedAt
);

public record AiVideoArtifactDto(
    Guid Id,
    string StageKey,
    string LogicalType,
    string StorageKey,
    string MimeType,
    long SizeInBytes,
    string Confidence,
    int Version,
    string Locator
);

public record AiVideoReconciliationEventDto(
    Guid Id,
    string StageKey,
    string ConflictType,
    string ExpectedChecksum,
    string ObservedChecksum,
    string Message,
    DateTime ImportedAt
);

public record AiVideoRunDetailDto(
    string Id,
    string Lane,
    string Status,
    DateTime WindowStart,
    DateTime WindowEnd,
    string WorkflowVersion,
    string ContractVersion,
    Guid CorrelationId,
    DateTime ImportedAt,
    IReadOnlyList<AiVideoStageTimelineItemDto> Timeline,
    IReadOnlyList<AiVideoArtifactDto> Artifacts,
    IReadOnlyList<AiVideoReconciliationEventDto> ReconciliationEvents
);

public record AiVideoStatusDto(
    bool IsHealthy,
    int ImportedRunCount,
    int ArtifactCount,
    int ImportBatchCount,
    string WorkerStatus,
    string ProviderConfigurationStatus
);
