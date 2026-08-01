using System;

namespace Blocks.AiVideoService.Domain;

public class ImportBatch
{
    public Guid Id { get; set; }
    public string SourceKey { get; set; } = null!;
    public DateTime ImportedAt { get; set; }
    public bool IsApplied { get; set; }
}
