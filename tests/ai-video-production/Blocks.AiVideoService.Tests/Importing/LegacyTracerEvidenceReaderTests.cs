using System;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Blocks.AiVideoService.Importing;
using Xunit;

namespace Blocks.AiVideoService.Tests.Importing;

public class LegacyTracerEvidenceReaderTests
{
    [Fact]
    public async Task ReadAsync_with_complete_legacy_fixture_returns_correct_evidence()
    {
        // Setup temp root directory for the test
        string tempRoot = Path.Combine(Path.GetTempPath(), "legacy-complete-" + Guid.NewGuid());
        string runDir = Path.Combine(tempRoot, "run", "adw-20260724-legacy-001");
        
        Directory.CreateDirectory(Path.Combine(runDir, "collect"));
        Directory.CreateDirectory(Path.Combine(runDir, "corpus"));
        Directory.CreateDirectory(Path.Combine(runDir, "scorer"));
        Directory.CreateDirectory(Path.Combine(runDir, "angles"));
        Directory.CreateDirectory(Path.Combine(runDir, "package"));
        Directory.CreateDirectory(Path.Combine(runDir, "visual", "assets", "browser"));
        Directory.CreateDirectory(Path.Combine(runDir, "visual", "assets", "derived"));
        Directory.CreateDirectory(Path.Combine(runDir, "html"));
        Directory.CreateDirectory(Path.Combine(runDir, "audio", "scenes"));
        Directory.CreateDirectory(Path.Combine(runDir, "video"));
        Directory.CreateDirectory(Path.Combine(runDir, "qa", "frames"));
        Directory.CreateDirectory(Path.Combine(runDir, "delivery"));

        var correlationId = Guid.NewGuid();
        var collectStatusJson = $@"{{
            ""workflow_version"": ""2.1.0"",
            ""contract_version"": ""1.0"",
            ""correlation_id"": ""{correlationId}"",
            ""collected"": 10
        }}";

        await File.WriteAllTextAsync(Path.Combine(runDir, "collect", "status.json"), collectStatusJson);
        await File.WriteAllTextAsync(Path.Combine(runDir, "collect", "news.db"), "fake sqlite database");
        await File.WriteAllTextAsync(Path.Combine(runDir, "corpus", "candidates.json"), "[]");
        await File.WriteAllTextAsync(Path.Combine(runDir, "scorer", "scored.json"), "[]");
        await File.WriteAllTextAsync(Path.Combine(runDir, "scorer", "sync_manifest.json"), "{}");
        await File.WriteAllTextAsync(Path.Combine(runDir, "angles", "angles.json"), "{}");
        await File.WriteAllTextAsync(Path.Combine(runDir, "package", "manifest.json"), "{}");
        await File.WriteAllTextAsync(Path.Combine(runDir, "package", "script.md"), "# Script");
        await File.WriteAllTextAsync(Path.Combine(runDir, "package", "analysis_script.md"), "# Analysis");
        await File.WriteAllTextAsync(Path.Combine(runDir, "package", "weekly_rundown.json"), "{}");
        await File.WriteAllTextAsync(Path.Combine(runDir, "package", "youtube_metadata.json"), "{}");
        await File.WriteAllTextAsync(Path.Combine(runDir, "visual", "shot_plan.json"), "{}");
        await File.WriteAllTextAsync(Path.Combine(runDir, "visual", "asset_manifest.json"), "{}");
        await File.WriteAllTextAsync(Path.Combine(runDir, "html", "video.html"), "<html></html>");
        await File.WriteAllTextAsync(Path.Combine(runDir, "audio", "tts-receipt.json"), "{}");
        await File.WriteAllTextAsync(Path.Combine(runDir, "audio", "speech.mp3"), "fake mp3");
        await File.WriteAllTextAsync(Path.Combine(runDir, "video", "final.mp4"), "fake mp4");
        await File.WriteAllTextAsync(Path.Combine(runDir, "video", "render_report.json"), "{}");
        await File.WriteAllTextAsync(Path.Combine(runDir, "qa", "validation-report.json"), "{}");
        await File.WriteAllTextAsync(Path.Combine(runDir, "qa", "determinism-report.json"), "{}");
        await File.WriteAllTextAsync(Path.Combine(runDir, "qa", "visual-qa-report.json"), "{}");
        await File.WriteAllTextAsync(Path.Combine(runDir, "qa", "publish_decision.json"), "{}");
        await File.WriteAllTextAsync(Path.Combine(runDir, "qa", "production-report.md"), "# Production");
        await File.WriteAllTextAsync(Path.Combine(runDir, "delivery", "review-package.zip"), "fake zip");
        await File.WriteAllTextAsync(Path.Combine(runDir, "qa", "postflight_qc.json"), "{}");

        // Write wildcard assets
        await File.WriteAllTextAsync(Path.Combine(runDir, "visual", "assets", "browser", "shot_1.png"), "image data");
        await File.WriteAllTextAsync(Path.Combine(runDir, "visual", "assets", "derived", "render_1.png"), "image data");
        await File.WriteAllTextAsync(Path.Combine(runDir, "audio", "scenes", "scene_1.mp3"), "audio data");
        await File.WriteAllTextAsync(Path.Combine(runDir, "qa", "frames", "frame_01.png"), "frame data");

        try
        {
            var source = new ImportSource("legacy", tempRoot);
            var reader = new LegacyTracerEvidenceReader();

            var evidence = await reader.ReadAsync(source, CancellationToken.None);

            Assert.Single(evidence.Runs);
            var run = evidence.Runs[0];
            Assert.Equal("adw-20260724-legacy-001", run.RunId);
            Assert.Equal("legacy", run.Lane);
            Assert.Equal(new DateTime(2026, 07, 24, 0, 0, 0, DateTimeKind.Utc), run.WindowStart);
            Assert.Equal(new DateTime(2026, 07, 31, 0, 0, 0, DateTimeKind.Utc), run.WindowEnd);
            Assert.Equal("2.1.0", run.WorkflowVersion);
            Assert.Equal("1.0", run.ContractVersion);
            Assert.Equal(correlationId, run.CorrelationId);

            // Assert artifacts
            Assert.Contains(run.Artifacts, a => a.LogicalType == "Collection status" && a.Confidence == "verified");
            Assert.Contains(run.Artifacts, a => a.LogicalType == "News DB snapshot" && a.Confidence == "verified");
            Assert.Contains(run.Artifacts, a => a.LogicalType == "Browser assets" && a.LogicalType == "Browser assets");
            Assert.Contains(run.Artifacts, a => a.LogicalType == "Final MP4" && a.Confidence == "verified");

            // Assert receipts
            Assert.Contains(run.Receipts, r => r.StageKey == "collect-news" && r.Confidence == "verified");
            Assert.Contains(run.Receipts, r => r.StageKey == "qa-review-delivery" && r.Confidence == "verified");

            // Assert stage attempts
            Assert.Contains(run.StageAttempts, s => s.StageKey == "collect-news" && s.Status == "completed");
        }
        finally
        {
            Directory.Delete(tempRoot, true);
        }
    }

    [Fact]
    public async Task ReadAsync_with_incomplete_tracer_fixture_preserves_missing_evidence()
    {
        string tempRoot = Path.Combine(Path.GetTempPath(), "tracer-incomplete-" + Guid.NewGuid());
        string runDir = Path.Combine(tempRoot, "run", "adw-20260724-tracer-002");
        
        Directory.CreateDirectory(Path.Combine(runDir, "collect"));
        Directory.CreateDirectory(Path.Combine(runDir, "video"));

        await File.WriteAllTextAsync(Path.Combine(runDir, "collect", "status.json"), "{}");
        await File.WriteAllTextAsync(Path.Combine(runDir, "video", "final.mp4"), "fake mp4");

        try
        {
            var source = new ImportSource("tracer", tempRoot);
            var reader = new LegacyTracerEvidenceReader();

            var evidence = await reader.ReadAsync(source, CancellationToken.None);

            Assert.Single(evidence.Runs);
            var run = evidence.Runs[0];
            
            // Should only have 2 artifacts
            Assert.Equal(2, run.Artifacts.Count);
            Assert.Contains(run.Artifacts, a => a.LogicalType == "Collection status");
            Assert.Contains(run.Artifacts, a => a.LogicalType == "Final MP4");
            
            // Should not infer missing artifacts (like Corpus JSON, Angles output etc)
            Assert.DoesNotContain(run.Artifacts, a => a.LogicalType == "Corpus JSON");
            Assert.DoesNotContain(run.Artifacts, a => a.LogicalType == "Angles output");

            // Receipts should only contain collect-news (final.mp4 exists but render_report.json receipt is missing)
            Assert.Single(run.Receipts);
            Assert.Equal("collect-news", run.Receipts[0].StageKey);
        }
        finally
        {
            Directory.Delete(tempRoot, true);
        }
    }
}
