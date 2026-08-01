using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Blocks.AiVideoService.Domain;
using Blocks.AiVideoService.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Blocks.AiVideoService.Read;

public sealed class AiVideoReadService
{
    private readonly AiVideoDbContext _dbContext;

    private static readonly string[] OrderedStages = new[]
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

    public AiVideoReadService(AiVideoDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<(IReadOnlyList<AiVideoRunSummaryDto> Items, int TotalCount)> ListRunsAsync(
        AiVideoRunListQuery query,
        CancellationToken cancellationToken)
    {
        var runsQuery = _dbContext.ImportedRuns.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            string search = query.Search.Trim().ToLowerInvariant();
            runsQuery = runsQuery.Where(r => r.Id.ToLower().Contains(search) || r.Lane.ToLower().Contains(search));
        }

        if (!string.IsNullOrWhiteSpace(query.Lane))
        {
            string lane = query.Lane.Trim().ToLowerInvariant();
            runsQuery = runsQuery.Where(r => r.Lane.ToLower() == lane);
        }

        if (query.From.HasValue)
        {
            runsQuery = runsQuery.Where(r => r.WindowEnd >= query.From.Value);
        }

        if (query.To.HasValue)
        {
            runsQuery = runsQuery.Where(r => r.WindowStart <= query.To.Value);
        }

        var allRuns = await runsQuery.ToListAsync(cancellationToken);

        var runIds = allRuns.Select(r => r.Id).ToList();
        var attempts = await _dbContext.StageAttempts
            .AsNoTracking()
            .Where(a => runIds.Contains(a.RunId))
            .ToListAsync(cancellationToken);

        var summaries = allRuns.Select(run =>
        {
            var runAttempts = attempts.Where(a => a.RunId == run.Id).ToList();
            string status = DetermineRunStatus(runAttempts);

            return new AiVideoRunSummaryDto(
                run.Id,
                run.Lane,
                status,
                run.WindowStart,
                run.WindowEnd,
                run.WorkflowVersion,
                run.ImportedAt
            );
        }).AsQueryable();

        if (!string.IsNullOrWhiteSpace(query.Status))
        {
            string targetStatus = query.Status.Trim().ToLowerInvariant();
            summaries = summaries.Where(s => s.Status.ToLower() == targetStatus);
        }

        var list = summaries
            .OrderByDescending(s => s.WindowEnd)
            .ThenByDescending(s => s.ImportedAt)
            .ThenByDescending(s => s.Id)
            .Skip((Math.Max(query.Page, 1) - 1) * Math.Clamp(query.PageSize, 1, 100))
            .Take(Math.Clamp(query.PageSize, 1, 100))
            .ToList();

        return (list, summaries.Count());
    }

    public async Task<AiVideoRunDetailDto?> GetRunDetailAsync(
        string runId,
        CancellationToken cancellationToken)
    {
        var run = await _dbContext.ImportedRuns
            .AsNoTracking()
            .FirstOrDefaultAsync(r => r.Id == runId, cancellationToken);

        if (run == null)
        {
            return null;
        }

        var attempts = await _dbContext.StageAttempts
            .AsNoTracking()
            .Where(a => a.RunId == runId)
            .ToListAsync(cancellationToken);

        var artifacts = await _dbContext.Artifacts
            .AsNoTracking()
            .Where(a => a.RunId == runId)
            .ToListAsync(cancellationToken);

        var reconEvents = await _dbContext.ReconciliationEvents
            .AsNoTracking()
            .Where(e => e.RunId == runId)
            .ToListAsync(cancellationToken);

        var timeline = new List<AiVideoStageTimelineItemDto>();
        foreach (var stageKey in OrderedStages)
        {
            var stageAttempts = attempts.Where(a => a.StageKey == stageKey).ToList();
            if (stageAttempts.Count == 0)
            {
                timeline.Add(new AiVideoStageTimelineItemDto(
                    stageKey,
                    null,
                    "Unknown",
                    null,
                    null
                ));
            }
            else
            {
                var latestAttempt = stageAttempts
                    .OrderByDescending(a => a.StartedAt ?? DateTime.MinValue)
                    .ThenByDescending(a => a.ImportedAt)
                    .First();

                timeline.Add(new AiVideoStageTimelineItemDto(
                    stageKey,
                    latestAttempt.AttemptId,
                    latestAttempt.Status,
                    latestAttempt.StartedAt,
                    latestAttempt.CompletedAt
                ));
            }
        }

        var runStatus = DetermineRunStatus(attempts);

        return new AiVideoRunDetailDto(
            run.Id,
            run.Lane,
            runStatus,
            run.WindowStart,
            run.WindowEnd,
            run.WorkflowVersion,
            run.ContractVersion,
            run.CorrelationId,
            run.ImportedAt,
            timeline,
            artifacts.Select(a => new AiVideoArtifactDto(
                a.Id,
                a.StageKey,
                a.LogicalType,
                a.StorageKey,
                a.MimeType,
                a.SizeInBytes,
                a.Confidence,
                a.Version,
                a.Locator
            )).ToList(),
            reconEvents.Select(e => new AiVideoReconciliationEventDto(
                e.Id,
                e.StageKey,
                e.ConflictType,
                e.ExpectedChecksum,
                e.ObservedChecksum,
                e.Message,
                e.ImportedAt
            )).ToList()
        );
    }

    public async Task<IReadOnlyList<AiVideoArtifactDto>?> GetRunArtifactsAsync(
        string runId,
        CancellationToken cancellationToken)
    {
        var exists = await _dbContext.ImportedRuns
            .AsNoTracking()
            .AnyAsync(r => r.Id == runId, cancellationToken);

        if (!exists)
        {
            return null;
        }

        return await _dbContext.Artifacts
            .AsNoTracking()
            .Where(a => a.RunId == runId)
            .OrderBy(a => a.StageKey)
            .ThenBy(a => a.LogicalType)
            .Select(a => new AiVideoArtifactDto(
                a.Id,
                a.StageKey,
                a.LogicalType,
                a.StorageKey,
                a.MimeType,
                a.SizeInBytes,
                a.Confidence,
                a.Version,
                a.Locator
            ))
            .ToListAsync(cancellationToken);
    }

    public async Task<AiVideoStatusDto> GetStatusAsync(CancellationToken cancellationToken)
    {
        return new AiVideoStatusDto(
            IsHealthy: true,
            ImportedRunCount: await _dbContext.ImportedRuns.AsNoTracking().CountAsync(cancellationToken),
            ArtifactCount: await _dbContext.Artifacts.AsNoTracking().CountAsync(cancellationToken),
            ImportBatchCount: await _dbContext.ImportBatches.AsNoTracking().CountAsync(cancellationToken),
            WorkerStatus: "Unknown",
            ProviderConfigurationStatus: "Unknown"
        );
    }

    private static string DetermineRunStatus(List<StageAttempt> attempts)
    {
        if (attempts.Count == 0)
        {
            return "Unknown";
        }

        if (attempts.Any(a => a.Status.Equals("failed", StringComparison.OrdinalIgnoreCase)))
        {
            return "failed";
        }

        if (attempts.Any(a => a.Status.Equals("running", StringComparison.OrdinalIgnoreCase)))
        {
            return "running";
        }

        var hasLastStageSuccess = attempts.Any(a =>
            a.StageKey.Equals("qa-review-delivery", StringComparison.OrdinalIgnoreCase) &&
            (a.Status.Equals("success", StringComparison.OrdinalIgnoreCase)
                || a.Status.Equals("completed", StringComparison.OrdinalIgnoreCase)));

        if (hasLastStageSuccess)
        {
            return "completed";
        }

        return "partial";
    }
}
