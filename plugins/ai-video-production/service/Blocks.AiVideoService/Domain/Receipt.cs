using System;

namespace Blocks.AiVideoService.Domain;

public class Receipt
{
    public Guid Id { get; set; }
    public string RunId { get; set; } = null!;
    public Guid ImportBatchId { get; set; }
    public string SourceKey { get; set; } = null!;
    public string StageKey { get; set; } = null!;
    public string Locator { get; set; } = null!;
    public string Checksum { get; set; } = null!;
    public string Confidence { get; set; } = null!;
    public DateTime ImportedAt { get; set; }
}
