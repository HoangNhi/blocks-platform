using System;

namespace Blocks.AiVideoService.Domain;

public class Artifact
{
    public Guid Id { get; set; }
    public string RunId { get; set; } = null!;
    public Guid ImportBatchId { get; set; }
    public string SourceKey { get; set; } = null!;
    public string StageKey { get; set; } = null!;
    public string LogicalType { get; set; } = null!;
    public string StorageKey { get; set; } = null!;
    public string MimeType { get; set; } = null!;
    public string Checksum { get; set; } = null!;
    public long SizeInBytes { get; set; }
    public string Confidence { get; set; } = null!;
    public int Version { get; set; }
    public string Locator { get; set; } = null!;
    public DateTime ImportedAt { get; set; }
}
