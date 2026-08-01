using System;

namespace Blocks.AiVideoService.Domain;

public class ImportedRun
{
    public string Id { get; set; } = null!; // run-id
    public Guid ImportBatchId { get; set; }
    public string SourceKey { get; set; } = null!;
    public string Lane { get; set; } = null!;
    public DateTime WindowStart { get; set; }
    public DateTime WindowEnd { get; set; }
    public string WorkflowVersion { get; set; } = null!;
    public string ContractVersion { get; set; } = null!;
    public Guid CorrelationId { get; set; }
    public DateTime ImportedAt { get; set; }
}
