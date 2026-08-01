using System;
using System.IO;
using Microsoft.Extensions.Options;

namespace Blocks.AiVideoService.Importing;

internal sealed class ImportSourceRegistry : IImportSourceRegistry
{
    private readonly ImportSourceOptions _options;

    public ImportSourceRegistry(IOptions<ImportSourceOptions> options)
    {
        _options = options.Value;
    }

    public ImportSource Resolve(string sourceKey)
    {
        if (string.IsNullOrWhiteSpace(sourceKey))
        {
            throw new ArgumentException("Source key cannot be empty.", nameof(sourceKey));
        }

        string normalizedKey = sourceKey.Trim().ToLowerInvariant();
        if (normalizedKey != "legacy" && normalizedKey != "tracer" && normalizedKey != "target")
        {
            throw new ArgumentException($"Invalid source key '{sourceKey}'. Only 'legacy', 'tracer', and 'target' are allowlisted.");
        }

        // Check for traversal or path-like characters in the key itself
        if (sourceKey.Contains("..") || sourceKey.Contains("/") || sourceKey.Contains("\\"))
        {
            throw new ArgumentException("Path traversal characters not allowed in source key.");
        }

        string? configuredPath = normalizedKey switch
        {
            "legacy" => _options.Legacy,
            "tracer" => _options.Tracer,
            "target" => _options.Target,
            _ => null
        };
        if (string.IsNullOrWhiteSpace(configuredPath))
        {
            throw new InvalidOperationException($"Source root configuration for '{normalizedKey}' is not configured.");
        }

        if (!Directory.Exists(configuredPath))
        {
            throw new DirectoryNotFoundException($"Configured source root directory '{configuredPath}' does not exist.");
        }

        string fullRootPath = Path.GetFullPath(configuredPath);
        return new ImportSource(normalizedKey, fullRootPath);
    }
}
