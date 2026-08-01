using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Blocks.AiVideoService.Importing;
using Xunit;

namespace Blocks.AiVideoService.Tests.Importing;

public class TargetEvidenceReaderTests
{
    private static string ComputeSha256String(string data)
    {
        using var sha256 = SHA256.Create();
        var hash = sha256.ComputeHash(Encoding.UTF8.GetBytes(data));
        return BitConverter.ToString(hash).Replace("-", "").ToLowerInvariant();
    }

    [Fact]
    public async Task ReadAsync_with_valid_manifest_returns_correct_evidence()
    {
        string tempRoot = Path.Combine(Path.GetTempPath(), "target-valid-" + Guid.NewGuid());
        string runId = "adw-20260725-target-001";
        string runDir = Path.Combine(tempRoot, "run", runId);
        Directory.CreateDirectory(runDir);

        // Files to create
        string mp4Path = Path.Combine(runDir, "final-video.mp4");
        string jsonPath = Path.Combine(runDir, "validation-report.json");
        string pngPath = Path.Combine(runDir, "frame_01.png");
        string sourceManifestPath = Path.Combine(runDir, "source-evidence-manifest.json");

        string mp4Content = "fake mp4 content";
        string jsonContent = "{}";
        string pngContent = "fake png content";
        string sourceManifestContent = "{}";

        await File.WriteAllTextAsync(mp4Path, mp4Content);
        await File.WriteAllTextAsync(jsonPath, jsonContent);
        await File.WriteAllTextAsync(pngPath, pngContent);
        await File.WriteAllTextAsync(sourceManifestPath, sourceManifestContent);

        string mp4Hash = ComputeSha256String(mp4Content);
        string jsonHash = ComputeSha256String(jsonContent);
        string pngHash = ComputeSha256String(pngContent);
        string sourceManifestHash = ComputeSha256String(sourceManifestContent);

        string correlationId = Guid.NewGuid().ToString();

        // Create run-manifest.json
        string manifestJson = $@"{{
            ""runId"": ""{runId}"",
            ""lane"": ""target"",
            ""windowStart"": ""2026-07-25T00:00:00Z"",
            ""windowEnd"": ""2026-08-01T00:00:00Z"",
            ""workflowVersion"": ""1.0.0"",
            ""contractVersion"": ""1.0"",
            ""correlationId"": ""{correlationId}"",
            ""decision"": ""review_candidate"",
            ""stageAttempts"": [
                {{
                    ""stageKey"": ""collect-news"",
                    ""attemptId"": ""{runId}-att-001"",
                    ""status"": ""completed"",
                    ""startedAt"": ""2026-07-25T00:00:00Z"",
                    ""completedAt"": ""2026-07-25T00:05:00Z""
                }},
                {{
                    ""stageKey"": ""qa-review-delivery"",
                    ""attemptId"": ""{runId}-att-001"",
                    ""status"": ""completed"",
                    ""startedAt"": ""2026-07-25T00:05:00Z"",
                    ""completedAt"": ""2026-07-25T00:10:00Z""
                }}
            ],
            ""artifacts"": [
                {{
                    ""stageKey"": ""compile-render-video"",
                    ""logicalType"": ""Final MP4"",
                    ""mimeType"": ""video/mp4"",
                    ""checksum"": ""{mp4Hash}"",
                    ""locator"": ""run/{runId}/final-video.mp4""
                }},
                {{
                    ""stageKey"": ""qa-review-delivery"",
                    ""logicalType"": ""Validation report"",
                    ""mimeType"": ""application/json"",
                    ""checksum"": ""{jsonHash}"",
                    ""locator"": ""run/{runId}/validation-report.json""
                }},
                {{
                    ""stageKey"": ""qa-review-delivery"",
                    ""logicalType"": ""QA frames"",
                    ""mimeType"": ""image/png"",
                    ""checksum"": ""{pngHash}"",
                    ""locator"": ""run/{runId}/frame_01.png""
                }}
            ],
            ""receipts"": [
                {{
                    ""stageKey"": ""qa-review-delivery"",
                    ""checksum"": ""{jsonHash}"",
                    ""locator"": ""run/{runId}/validation-report.json""
                }}
            ]
        }}";

        await File.WriteAllTextAsync(Path.Combine(runDir, "run-manifest.json"), manifestJson);

        try
        {
            var source = new ImportSource("target", tempRoot);
            var reader = new TargetEvidenceReader();

            var evidence = await reader.ReadAsync(source, CancellationToken.None);

            Assert.Single(evidence.Runs);
            var run = evidence.Runs[0];
            Assert.Equal(runId, run.RunId);
            Assert.Equal("target", run.Lane);
            Assert.Equal(Guid.Parse(correlationId), run.CorrelationId);
            Assert.Equal(3, run.Artifacts.Count);
            Assert.Single(run.Receipts);
            Assert.Equal("qa-review-delivery", run.Receipts[0].StageKey);
        }
        finally
        {
            Directory.Delete(tempRoot, true);
        }
    }

    [Fact]
    public async Task ReadAsync_missing_manifest_throws_FileNotFoundException()
    {
        string tempRoot = Path.Combine(Path.GetTempPath(), "target-missing-manifest-" + Guid.NewGuid());
        string runId = "adw-20260725-target-001";
        string runDir = Path.Combine(tempRoot, "run", runId);
        Directory.CreateDirectory(runDir);

        try
        {
            var source = new ImportSource("target", tempRoot);
            var reader = new TargetEvidenceReader();

            await Assert.ThrowsAsync<FileNotFoundException>(() => reader.ReadAsync(source, CancellationToken.None));
        }
        finally
        {
            Directory.Delete(tempRoot, true);
        }
    }

    [Fact]
    public async Task ReadAsync_invalid_run_id_throws_InvalidOperationException()
    {
        string tempRoot = Path.Combine(Path.GetTempPath(), "target-invalid-runid-" + Guid.NewGuid());
        string runId = "adw-20260725-invalid-001"; // Should be 'target'
        string runDir = Path.Combine(tempRoot, "run", runId);
        Directory.CreateDirectory(runDir);

        try
        {
            var source = new ImportSource("target", tempRoot);
            var reader = new TargetEvidenceReader();

            await Assert.ThrowsAsync<InvalidOperationException>(() => reader.ReadAsync(source, CancellationToken.None));
        }
        finally
        {
            Directory.Delete(tempRoot, true);
        }
    }

    [Fact]
    public async Task ReadAsync_lane_not_target_throws_InvalidOperationException()
    {
        string tempRoot = Path.Combine(Path.GetTempPath(), "target-invalid-lane-" + Guid.NewGuid());
        string runId = "adw-20260725-target-001";
        string runDir = Path.Combine(tempRoot, "run", runId);
        Directory.CreateDirectory(runDir);

        string manifestJson = $@"{{
            ""runId"": ""{runId}"",
            ""lane"": ""legacy"",
            ""windowStart"": ""2026-07-25T00:00:00Z"",
            ""windowEnd"": ""2026-08-01T00:00:00Z"",
            ""stageAttempts"": [ {{ ""stageKey"": ""collect-news"", ""attemptId"": ""att-01"", ""status"": ""completed"" }} ],
            ""receipts"": [ {{ ""stageKey"": ""collect-news"", ""checksum"": ""c"", ""locator"": ""l"" }} ]
        }}";
        await File.WriteAllTextAsync(Path.Combine(runDir, "run-manifest.json"), manifestJson);

        try
        {
            var source = new ImportSource("target", tempRoot);
            var reader = new TargetEvidenceReader();

            await Assert.ThrowsAsync<InvalidOperationException>(() => reader.ReadAsync(source, CancellationToken.None));
        }
        finally
        {
            Directory.Delete(tempRoot, true);
        }
    }

    [Fact]
    public async Task ReadAsync_root_escape_throws_InvalidOperationException()
    {
        string tempRoot = Path.Combine(Path.GetTempPath(), "target-root-escape-" + Guid.NewGuid());
        string runId = "adw-20260725-target-001";
        string runDir = Path.Combine(tempRoot, "run", runId);
        Directory.CreateDirectory(runDir);

        string manifestJson = $@"{{
            ""runId"": ""{runId}"",
            ""lane"": ""target"",
            ""windowStart"": ""2026-07-25T00:00:00Z"",
            ""windowEnd"": ""2026-08-01T00:00:00Z"",
            ""decision"": ""review_candidate"",
            ""stageAttempts"": [ {{ ""stageKey"": ""collect-news"", ""attemptId"": ""att-01"", ""status"": ""completed"" }} ],
            ""artifacts"": [
                {{
                    ""stageKey"": ""collect-news"",
                    ""logicalType"": ""Collection status"",
                    ""mimeType"": ""application/json"",
                    ""checksum"": ""c"",
                    ""locator"": ""../../etc/passwd""
                }}
            ],
            ""receipts"": [ {{ ""stageKey"": ""collect-news"", ""checksum"": ""c"", ""locator"": ""run/l"" }} ]
        }}";
        await File.WriteAllTextAsync(Path.Combine(runDir, "run-manifest.json"), manifestJson);

        try
        {
            var source = new ImportSource("target", tempRoot);
            var reader = new TargetEvidenceReader();

            await Assert.ThrowsAsync<InvalidOperationException>(() => reader.ReadAsync(source, CancellationToken.None));
        }
        finally
        {
            Directory.Delete(tempRoot, true);
        }
    }

    [Fact]
    public async Task ReadAsync_checksum_mismatch_throws_InvalidOperationException()
    {
        string tempRoot = Path.Combine(Path.GetTempPath(), "target-checksum-mismatch-" + Guid.NewGuid());
        string runId = "adw-20260725-target-001";
        string runDir = Path.Combine(tempRoot, "run", runId);
        Directory.CreateDirectory(runDir);

        string fileContent = "file content";
        string filePath = Path.Combine(runDir, "status.json");
        await File.WriteAllTextAsync(filePath, fileContent);

        string manifestJson = $@"{{
            ""runId"": ""{runId}"",
            ""lane"": ""target"",
            ""windowStart"": ""2026-07-25T00:00:00Z"",
            ""windowEnd"": ""2026-08-01T00:00:00Z"",
            ""decision"": ""review_candidate"",
            ""stageAttempts"": [ {{ ""stageKey"": ""collect-news"", ""attemptId"": ""att-01"", ""status"": ""completed"" }} ],
            ""artifacts"": [
                {{
                    ""stageKey"": ""collect-news"",
                    ""logicalType"": ""Collection status"",
                    ""mimeType"": ""application/json"",
                    ""checksum"": ""wrongchecksum"",
                    ""locator"": ""run/{runId}/status.json""
                }}
            ],
            ""receipts"": [ {{ ""stageKey"": ""collect-news"", ""checksum"": ""c"", ""locator"": ""run/l"" }} ]
        }}";
        await File.WriteAllTextAsync(Path.Combine(runDir, "run-manifest.json"), manifestJson);

        try
        {
            var source = new ImportSource("target", tempRoot);
            var reader = new TargetEvidenceReader();

            await Assert.ThrowsAsync<InvalidOperationException>(() => reader.ReadAsync(source, CancellationToken.None));
        }
        finally
        {
            Directory.Delete(tempRoot, true);
        }
    }

    [Fact]
    public async Task ReadAsync_unknown_logical_type_throws_InvalidOperationException()
    {
        string tempRoot = Path.Combine(Path.GetTempPath(), "target-unknown-type-" + Guid.NewGuid());
        string runId = "adw-20260725-target-001";
        string runDir = Path.Combine(tempRoot, "run", runId);
        Directory.CreateDirectory(runDir);

        string fileContent = "file content";
        string filePath = Path.Combine(runDir, "status.json");
        await File.WriteAllTextAsync(filePath, fileContent);
        string sha = ComputeSha256String(fileContent);

        string manifestJson = $@"{{
            ""runId"": ""{runId}"",
            ""lane"": ""target"",
            ""windowStart"": ""2026-07-25T00:00:00Z"",
            ""windowEnd"": ""2026-08-01T00:00:00Z"",
            ""decision"": ""review_candidate"",
            ""stageAttempts"": [ {{ ""stageKey"": ""collect-news"", ""attemptId"": ""att-01"", ""status"": ""completed"" }} ],
            ""artifacts"": [
                {{
                    ""stageKey"": ""collect-news"",
                    ""logicalType"": ""Unknown Logical Type"",
                    ""mimeType"": ""application/json"",
                    ""checksum"": ""{sha}"",
                    ""locator"": ""run/{runId}/status.json""
                }}
            ],
            ""receipts"": [ {{ ""stageKey"": ""collect-news"", ""checksum"": ""c"", ""locator"": ""run/l"" }} ]
        }}";
        await File.WriteAllTextAsync(Path.Combine(runDir, "run-manifest.json"), manifestJson);

        try
        {
            var source = new ImportSource("target", tempRoot);
            var reader = new TargetEvidenceReader();

            await Assert.ThrowsAsync<InvalidOperationException>(() => reader.ReadAsync(source, CancellationToken.None));
        }
        finally
        {
            Directory.Delete(tempRoot, true);
        }
    }
}
