using System;

namespace Blocks.AiVideoService.Domain;

public class ReconciliationEvent
{
    public Guid Id { get; set; }
    public Guid ImportBatchId { get; set; }
    public string RunId { get; set; } = null!;
    public string StageKey { get; set; } = null!;
    public string Locator { get; set; } = null!;
    public string ConflictType { get; set; } = null!;
    public string ExpectedChecksum { get; set; } = null!;
    public string ObservedChecksum { get; set; } = null!;
    public string Message { get; set; } = null!;
    public DateTime ImportedAt { get; set; }
}
