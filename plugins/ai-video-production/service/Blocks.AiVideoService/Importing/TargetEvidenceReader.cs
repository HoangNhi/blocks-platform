using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;

namespace Blocks.AiVideoService.Importing;

internal sealed class TargetEvidenceReader : ITargetEvidenceReader
{
    private static readonly Regex RunIdRegex = new(@"^adw-(\d{8})-target-(\d+)$", RegexOptions.Compiled);

    private static readonly HashSet<string> CanonicalStageKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "collect-news",
        "build-weekly-corpus",
        "score-select-stories",
        "derive-angles",
        "build-episode-package",
        "build-visual-assets",
        "generate-narration",
        "compile-render-video",
        "qa-review-delivery"
    };

    private static readonly HashSet<string> AllowedMimeTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "application/json",
        "application/x-sqlite3",
        "text/markdown",
        "text/html",
        "audio/mpeg",
        "video/mp4",
        "application/zip",
        "image/png",
        "image/jpeg",
        "audio/wav"
    };

    private static readonly HashSet<string> AllowedLogicalTypes = new(StringComparer.Ordinal)
    {
        "Collection status",
        "News DB snapshot",
        "Corpus JSON",
        "Scorer output",
        "Sync manifest",
        "Angles output",
        "Package manifest",
        "Script (Markdown)",
        "Analysis script",
        "Weekly rundown",
        "YouTube metadata",
        "Visual plan",
        "Asset manifest",
        "HTML preview",
        "TTS receipt",
        "Speech audio",
        "Final MP4",
        "Render report",
        "Validation report",
        "Determinism report",
        "Visual QA report",
        "Publish decision",
        "Production report",
        "Review ZIP",
        "Postflight QC",
        "Browser assets",
        "Derived assets",
        "Legacy scene audio",
        "QA frames"
    };

    public async Task<DiscoveredEvidence> ReadAsync(ImportSource source, CancellationToken cancellationToken)
    {
        var runs = new List<DiscoveredRun>();
        string runDirParent = Path.Combine(source.RootPath, "run");

        if (!Directory.Exists(runDirParent))
        {
            return new DiscoveredEvidence(runs);
        }

        string canonicalRoot = Path.GetFullPath(source.RootPath);

        foreach (string dir in Directory.GetDirectories(runDirParent))
        {
            string canonicalDir = Path.GetFullPath(dir);
            if (!canonicalDir.StartsWith(canonicalRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException($"Directory '{dir}' escapes configured source root.");
            }

            string dirName = Path.GetFileName(canonicalDir);
            var match = RunIdRegex.Match(dirName);
            if (!match.Success)
            {
                // Must be exact target run ID format
                throw new InvalidOperationException($"Directory name '{dirName}' is not a valid target run ID format.");
            }

            string manifestPath = Path.Combine(canonicalDir, "run-manifest.json");
            if (!File.Exists(manifestPath))
            {
                throw new FileNotFoundException($"run-manifest.json not found in directory '{dirName}'.");
            }

            string jsonContent = await File.ReadAllTextAsync(manifestPath, cancellationToken);
            ManifestDto manifest;
            try
            {
                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                manifest = JsonSerializer.Deserialize<ManifestDto>(jsonContent, options) 
                    ?? throw new InvalidOperationException("Failed to deserialize manifest.");
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"Failed to parse run-manifest.json for run '{dirName}': {ex.Message}", ex);
            }

            // Validate manifest structure
            if (manifest.RunId != dirName)
            {
                throw new InvalidOperationException($"Run ID mismatch: folder is '{dirName}', manifest states '{manifest.RunId}'.");
            }

            if (manifest.Lane != "target")
            {
                throw new InvalidOperationException($"Lane mismatch: manifest lane must be 'target', but found '{manifest.Lane}'.");
            }

            if (manifest.Decision != "review_candidate" && manifest.Decision != "hold")
            {
                throw new InvalidOperationException($"Decision must be 'review_candidate' or 'hold', but found '{manifest.Decision}'.");
            }

            // Map and Validate Stage Attempts
            var stageAttempts = new List<DiscoveredStageAttempt>();
            if (manifest.StageAttempts == null || manifest.StageAttempts.Count == 0)
            {
                throw new InvalidOperationException("Stage attempts list cannot be empty.");
            }

            foreach (var sa in manifest.StageAttempts)
            {
                if (string.IsNullOrWhiteSpace(sa.StageKey) || !CanonicalStageKeys.Contains(sa.StageKey))
                {
                    throw new InvalidOperationException($"Invalid or unsupported stage key: '{sa.StageKey}'.");
                }
                if (string.IsNullOrWhiteSpace(sa.AttemptId))
                {
                    throw new InvalidOperationException("Attempt ID cannot be empty.");
                }
                if (string.IsNullOrWhiteSpace(sa.Status))
                {
                    throw new InvalidOperationException("Status cannot be empty.");
                }

                stageAttempts.Add(new DiscoveredStageAttempt(
                    StageKey: sa.StageKey,
                    AttemptId: sa.AttemptId,
                    Status: sa.Status,
                    StartedAt: sa.StartedAt,
                    CompletedAt: sa.CompletedAt
                ));
            }

            // Map and Validate Artifacts
            var artifacts = new List<DiscoveredArtifact>();
            if (manifest.Artifacts != null)
            {
                foreach (var art in manifest.Artifacts)
                {
                    if (string.IsNullOrWhiteSpace(art.StageKey) || !CanonicalStageKeys.Contains(art.StageKey))
                    {
                        throw new InvalidOperationException($"Invalid stage key '{art.StageKey}' in artifact.");
                    }
                    if (string.IsNullOrWhiteSpace(art.LogicalType) || !AllowedLogicalTypes.Contains(art.LogicalType))
                    {
                        throw new InvalidOperationException($"Invalid or unknown logical type '{art.LogicalType}' in artifact.");
                    }
                    if (string.IsNullOrWhiteSpace(art.MimeType) || !AllowedMimeTypes.Contains(art.MimeType))
                    {
                        throw new InvalidOperationException($"Mime type '{art.MimeType}' in artifact is not allowlisted.");
                    }
                    if (string.IsNullOrWhiteSpace(art.Locator))
                    {
                        throw new InvalidOperationException("Artifact locator cannot be empty.");
                    }
                    if (string.IsNullOrWhiteSpace(art.Checksum))
                    {
                        throw new InvalidOperationException("Artifact checksum cannot be empty.");
                    }

                    // Verify locator does not escape root
                    string fullPath = Path.Combine(source.RootPath, art.Locator);
                    VerifyFileInRoot(fullPath, canonicalRoot);

                    if (!File.Exists(fullPath))
                    {
                        throw new FileNotFoundException($"Artifact file not found: {art.Locator}");
                    }

                    // Verify SHA-256
                    string computedHash = ComputeSha256(fullPath);
                    if (!string.Equals(computedHash, art.Checksum, StringComparison.OrdinalIgnoreCase))
                    {
                        throw new InvalidOperationException($"Checksum mismatch for artifact '{art.Locator}'. Expected '{art.Checksum}', got '{computedHash}'.");
                    }

                    long size = new FileInfo(fullPath).Length;

                    artifacts.Add(new DiscoveredArtifact(
                        StageKey: art.StageKey,
                        LogicalType: art.LogicalType,
                        StorageKey: art.Locator,
                        MimeType: art.MimeType,
                        Checksum: art.Checksum.ToLowerInvariant(),
                        SizeInBytes: size,
                        Confidence: art.Confidence ?? "verified",
                        Locator: art.Locator
                    ));
                }
            }

            // Map and Validate Receipts
            var receipts = new List<DiscoveredReceipt>();
            if (manifest.Receipts == null || manifest.Receipts.Count == 0)
            {
                throw new InvalidOperationException("Receipts list cannot be empty.");
            }

            foreach (var rec in manifest.Receipts)
            {
                if (string.IsNullOrWhiteSpace(rec.StageKey) || !CanonicalStageKeys.Contains(rec.StageKey))
                {
                    throw new InvalidOperationException($"Invalid stage key '{rec.StageKey}' in receipt.");
                }
                if (string.IsNullOrWhiteSpace(rec.Locator))
                {
                    throw new InvalidOperationException("Receipt locator cannot be empty.");
                }
                if (string.IsNullOrWhiteSpace(rec.Checksum))
                {
                    throw new InvalidOperationException("Receipt checksum cannot be empty.");
                }

                // Verify locator does not escape root
                string fullPath = Path.Combine(source.RootPath, rec.Locator);
                VerifyFileInRoot(fullPath, canonicalRoot);

                if (!File.Exists(fullPath))
                {
                    throw new FileNotFoundException($"Receipt file not found: {rec.Locator}");
                }

                // Verify SHA-256
                string computedHash = ComputeSha256(fullPath);
                if (!string.Equals(computedHash, rec.Checksum, StringComparison.OrdinalIgnoreCase))
                {
                    throw new InvalidOperationException($"Checksum mismatch for receipt '{rec.Locator}'. Expected '{rec.Checksum}', got '{computedHash}'.");
                }

                receipts.Add(new DiscoveredReceipt(
                    StageKey: rec.StageKey,
                    Locator: rec.Locator,
                    Checksum: rec.Checksum.ToLowerInvariant(),
                    Confidence: rec.Confidence ?? "verified"
                ));
            }

            runs.Add(new DiscoveredRun(
                RunId: manifest.RunId!,
                Lane: manifest.Lane!,
                WindowStart: DateTime.SpecifyKind(manifest.WindowStart, DateTimeKind.Utc),
                WindowEnd: DateTime.SpecifyKind(manifest.WindowEnd, DateTimeKind.Utc),
                WorkflowVersion: manifest.WorkflowVersion ?? "1.0.0",
                ContractVersion: manifest.ContractVersion ?? "1.0",
                CorrelationId: manifest.CorrelationId,
                StageAttempts: stageAttempts,
                Artifacts: artifacts,
                Receipts: receipts
            ));
        }

        return new DiscoveredEvidence(runs);
    }

    private void VerifyFileInRoot(string filePath, string rootPath)
    {
        string canonicalPath = Path.GetFullPath(filePath);
        if (!canonicalPath.StartsWith(rootPath + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException($"File '{filePath}' escapes configured source root '{rootPath}'.");
        }
    }

    private static string ComputeSha256(string filePath)
    {
        using var stream = File.OpenRead(filePath);
        using var sha256 = SHA256.Create();
        var hash = sha256.ComputeHash(stream);
        return BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();
    }

    // DTO classes for manifest JSON parsing
    private sealed class ManifestDto
    {
        public string? RunId { get; set; }
        public string? Lane { get; set; }
        public DateTime WindowStart { get; set; }
        public DateTime WindowEnd { get; set; }
        public string? WorkflowVersion { get; set; }
        public string? ContractVersion { get; set; }
        public Guid CorrelationId { get; set; }
        public string? Decision { get; set; }
        public List<StageAttemptDto>? StageAttempts { get; set; }
        public List<ArtifactDto>? Artifacts { get; set; }
        public List<ReceiptDto>? Receipts { get; set; }
    }

    private sealed class StageAttemptDto
    {
        public string? StageKey { get; set; }
        public string? AttemptId { get; set; }
        public string? Status { get; set; }
        public DateTime? StartedAt { get; set; }
        public DateTime? CompletedAt { get; set; }
    }

    private sealed class ArtifactDto
    {
        public string? StageKey { get; set; }
        public string? LogicalType { get; set; }
        public string? MimeType { get; set; }
        public string? Checksum { get; set; }
        public string? Confidence { get; set; }
        public string? Locator { get; set; }
    }

    private sealed class ReceiptDto
    {
        public string? StageKey { get; set; }
        public string? Checksum { get; set; }
        public string? Confidence { get; set; }
        public string? Locator { get; set; }
    }
}
