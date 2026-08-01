namespace Blocks.AiVideoService.Importing;

internal sealed class ImportSourceOptions
{
    public const string SectionName = "ImportSources";
    public string? Legacy { get; set; }
    public string? Tracer { get; set; }
    public string? Target { get; set; }
}
