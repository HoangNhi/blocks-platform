using System.Net.Http.Json;
using System.Text.Json;
using Blocks.Shared.Authorization;

namespace Blocks.FileService.Authorization;

public sealed class SystemFunctionalAuthorizationClient
{
    private const string CheckPath = "/api/Authorization/check";
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(2);
    private readonly HttpClient _httpClient;
    private readonly IHttpContextAccessor _httpContextAccessor;

    public SystemFunctionalAuthorizationClient(HttpClient httpClient, IHttpContextAccessor httpContextAccessor)
    {
        _httpClient = httpClient;
        _httpContextAccessor = httpContextAccessor;
    }

    public async Task<FunctionalAuthorizationResult> CheckAsync(
        string permissionKey,
        FunctionalPermissionAction action,
        CancellationToken cancellationToken = default)
    {
        var authorization = GetAuthorizationHeader();
        if (authorization is null)
        {
            return FunctionalAuthorizationResult.Unauthenticated();
        }

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(Timeout);
        using var request = new HttpRequestMessage(HttpMethod.Post, CheckPath)
        {
            Content = JsonContent.Create(new FunctionalAuthorizationRequest
            {
                PermissionKey = permissionKey,
                Action = action
            })
        };
        request.Headers.TryAddWithoutValidation("Authorization", authorization);

        try
        {
            using var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
            if (!response.IsSuccessStatusCode)
            {
                return FunctionalAuthorizationResult.Unavailable();
            }

            var envelope = await response.Content.ReadFromJsonAsync<AuthorizationEnvelope>(cancellationToken: timeout.Token);
            if (envelope?.Success != true || envelope.Data is null)
            {
                return FunctionalAuthorizationResult.Unavailable();
            }

            return envelope.Data.HasPermission
                ? FunctionalAuthorizationResult.Allow()
                : FunctionalAuthorizationResult.Deny();
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return FunctionalAuthorizationResult.Unavailable();
        }
        catch (HttpRequestException)
        {
            return FunctionalAuthorizationResult.Unavailable();
        }
        catch (JsonException)
        {
            return FunctionalAuthorizationResult.Unavailable();
        }
    }

    private string? GetAuthorizationHeader()
    {
        var request = _httpContextAccessor.HttpContext?.Request;
        var authorization = request?.Headers.Authorization.ToString();
        if (string.IsNullOrWhiteSpace(authorization))
        {
            authorization = request?.Headers["x-service-authorization"].ToString();
        }

        if (string.IsNullOrWhiteSpace(authorization))
        {
            return null;
        }

        return authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
            ? authorization
            : "Bearer " + authorization;
    }

    private sealed class AuthorizationEnvelope
    {
        public bool Success { get; init; }

        public AuthorizationData? Data { get; init; }
    }

    private sealed class AuthorizationData
    {
        public bool HasPermission { get; init; }
    }
}
