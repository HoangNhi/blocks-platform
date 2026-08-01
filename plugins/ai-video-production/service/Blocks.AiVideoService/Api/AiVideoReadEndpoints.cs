using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Blocks.AiVideoService.Read;
using Blocks.AiVideoService.Artifacts;
using Microsoft.AspNetCore.Http.Extensions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace Blocks.AiVideoService.Api;

public static class AiVideoReadEndpoints
{
    public static IEndpointRouteBuilder MapAiVideoReadEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/ai-video")
            .RequireAuthorization(AiVideoAccessPolicies.View);

        group.MapGet("/status", async (
            AiVideoReadService readService,
            CancellationToken cancellationToken) =>
        {
            return Results.Ok(AiVideoResponses.Ok(await readService.GetStatusAsync(cancellationToken)));
        });

        group.MapGet("/runs", async (
            [AsParameters] AiVideoRunListQuery query,
            AiVideoReadService readService,
            CancellationToken cancellationToken) =>
        {
            var (items, totalCount) = await readService.ListRunsAsync(query, cancellationToken);
            return Results.Ok(AiVideoResponses.Ok(new { items, totalCount }));
        });

        group.MapGet("/runs/{runId}", async (
            string runId,
            AiVideoReadService readService,
            CancellationToken cancellationToken) =>
        {
            var detail = await readService.GetRunDetailAsync(runId, cancellationToken);
            if (detail == null)
            {
                return Results.NotFound(AiVideoResponses.Fail<object>("Run not found."));
            }
            return Results.Ok(AiVideoResponses.Ok(detail));
        });

        group.MapGet("/runs/{runId}/artifacts", async (
            string runId,
            AiVideoReadService readService,
            CancellationToken cancellationToken) =>
        {
            var artifacts = await readService.GetRunArtifactsAsync(runId, cancellationToken);
            if (artifacts == null)
            {
                return Results.NotFound(AiVideoResponses.Fail<object>("Run not found.", "NOT_FOUND"));
            }

            return Results.Ok(AiVideoResponses.Ok(new { items = artifacts }));
        });

        group.MapGet("/artifacts/{artifactId:guid}/preview", async (
            Guid artifactId,
            AiVideoArtifactAccessService artifactService,
            CancellationToken cancellationToken) =>
        {
            var result = await artifactService.GetPreviewAsync(artifactId, cancellationToken);
            if (!result.IsSuccess)
            {
                return MapAccessError(result);
            }

            return Results.File(result.FilePath!, result.MimeType!);
        });

        group.MapGet("/artifacts/{artifactId:guid}/download", async (
            Guid artifactId,
            AiVideoArtifactAccessService artifactService,
            CancellationToken cancellationToken) =>
        {
            var result = await artifactService.GetDownloadAsync(artifactId, cancellationToken);
            if (!result.IsSuccess)
            {
                return MapAccessError(result);
            }

            return Results.File(result.FilePath!, result.MimeType!, result.FileName);
        });

        return endpoints;
    }

    private static IResult MapAccessError(ArtifactAccessResult result)
    {
        return result.ErrorStatus switch
        {
            AccessErrorStatus.NotFound => Results.NotFound(AiVideoResponses.Fail<object>(result.ErrorMessage!, "NOT_FOUND")),
            AccessErrorStatus.UnsupportedMime => Results.Json(AiVideoResponses.Fail<object>(result.ErrorMessage!, "UNSUPPORTED_MIME"), statusCode: StatusCodes.Status415UnsupportedMediaType),
            AccessErrorStatus.InvalidLocator => Results.BadRequest(AiVideoResponses.Fail<object>(result.ErrorMessage!, "INVALID_LOCATOR")),
            AccessErrorStatus.SourceFileNotFound => Results.NotFound(AiVideoResponses.Fail<object>(result.ErrorMessage!, "STORAGE_FILE_MISSING")),
            AccessErrorStatus.TooLarge => Results.Json(AiVideoResponses.Fail<object>(result.ErrorMessage!, "PAYLOAD_TOO_LARGE"), statusCode: StatusCodes.Status413PayloadTooLarge),
            AccessErrorStatus.Forbidden => Results.Json(AiVideoResponses.Fail<object>(result.ErrorMessage!, "FORBIDDEN"), statusCode: StatusCodes.Status403Forbidden),
            _ => Results.Json(AiVideoResponses.Fail<object>("Internal error accessing artifact.", "INTERNAL_ERROR"), statusCode: StatusCodes.Status500InternalServerError)
        };
    }
}
