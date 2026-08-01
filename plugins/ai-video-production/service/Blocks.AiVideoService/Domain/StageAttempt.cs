using System;

namespace Blocks.AiVideoService.Domain;

public class StageAttempt
{
    public Guid Id { get; set; }
    public string RunId { get; set; } = null!;
    public Guid ImportBatchId { get; set; }
    public string StageKey { get; set; } = null!;
    public string AttemptId { get; set; } = null!; // run-id-att-seq
    public string Status { get; set; } = null!;
    public DateTime? StartedAt { get; set; }
    public DateTime? CompletedAt { get; set; }
    public DateTime ImportedAt { get; set; }
}
