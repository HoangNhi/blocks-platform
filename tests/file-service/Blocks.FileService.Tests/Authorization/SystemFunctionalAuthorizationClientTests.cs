using System.Net;
using System.Net.Http.Headers;
using System.Text;
using Blocks.FileService.Authorization;
using Blocks.Shared.Authorization;
using Microsoft.AspNetCore.Http;
using Xunit;

namespace Blocks.FileService.Tests.Authorization;

public sealed class SystemFunctionalAuthorizationClientTests
{
    [Fact]
    public async Task Allows_and_forwards_bearer_and_permission_contract()
    {
        var handler = new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("{\"Success\":true,\"Data\":{\"HasPermission\":true}}", Encoding.UTF8, "application/json")
        });
        var client = CreateClient(handler, "Bearer user-token");

        var result = await client.CheckAsync("files.library", FunctionalPermissionAction.VIEW);

        Assert.True(result.Allowed);
        Assert.True(result.AuthorityAvailable);
        Assert.Equal("Bearer user-token", handler.Authorization);
        Assert.Contains("files.library", handler.Body, StringComparison.Ordinal);
        Assert.Contains("VIEW", handler.Body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Denied_permission_never_allows()
    {
        var handler = new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("{\"Success\":true,\"Data\":{\"HasPermission\":false}}", Encoding.UTF8, "application/json")
        });

        var result = await CreateClient(handler).CheckAsync("files.library", FunctionalPermissionAction.DELETE);

        Assert.False(result.Allowed);
        Assert.True(result.AuthorityAvailable);
    }

    [Theory]
    [InlineData(HttpStatusCode.Unauthorized)]
    [InlineData(HttpStatusCode.ServiceUnavailable)]
    public async Task Authority_http_failures_deny(HttpStatusCode statusCode)
    {
        var result = await CreateClient(new StubHandler(_ => new HttpResponseMessage(statusCode)))
            .CheckAsync("files.library", FunctionalPermissionAction.VIEW);

        Assert.False(result.Allowed);
        Assert.False(result.AuthorityAvailable);
    }

    [Fact]
    public async Task Malformed_response_denies()
    {
        var handler = new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("not-json", Encoding.UTF8, "application/json")
        });

        var result = await CreateClient(handler).CheckAsync("files.library", FunctionalPermissionAction.VIEW);

        Assert.False(result.Allowed);
        Assert.False(result.AuthorityAvailable);
    }

    [Fact]
    public async Task Connection_failure_denies()
    {
        var result = await CreateClient(new StubHandler(_ => throw new HttpRequestException()))
            .CheckAsync("files.library", FunctionalPermissionAction.VIEW);

        Assert.False(result.Allowed);
        Assert.False(result.AuthorityAvailable);
    }

    [Fact]
    public async Task Caller_cancellation_is_preserved()
    {
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() =>
            CreateClient(new StubHandler(_ => throw new OperationCanceledException()))
                .CheckAsync("files.library", FunctionalPermissionAction.VIEW, cancellation.Token));
    }

    [Fact]
    public async Task Missing_bearer_is_unauthenticated_without_authority_call()
    {
        var handler = new StubHandler(_ => throw new InvalidOperationException("authority call was unexpected"));

        var result = await CreateClient(handler, null).CheckAsync("files.library", FunctionalPermissionAction.VIEW);

        Assert.False(result.Allowed);
        Assert.False(result.Authenticated);
        Assert.True(result.AuthorityAvailable);
    }

    private static SystemFunctionalAuthorizationClient CreateClient(HttpMessageHandler handler, string? authorization = "Bearer token")
    {
        var httpContext = new DefaultHttpContext();
        if (authorization is not null)
        {
            httpContext.Request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", authorization["Bearer ".Length..]).ToString();
        }

        var accessor = new HttpContextAccessor { HttpContext = httpContext };
        var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://systemservice") };
        return new SystemFunctionalAuthorizationClient(httpClient, accessor);
    }

    private sealed class StubHandler(Func<HttpRequestMessage, HttpResponseMessage> responseFactory) : HttpMessageHandler
    {
        public string? Authorization { get; private set; }

        public string Body { get; private set; } = string.Empty;

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Authorization = request.Headers.Authorization?.ToString();
            Body = await request.Content!.ReadAsStringAsync(cancellationToken);
            return responseFactory(request);
        }
    }
}
