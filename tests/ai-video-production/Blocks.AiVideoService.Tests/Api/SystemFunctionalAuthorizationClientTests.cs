using System.Net;
using System.Net.Http.Headers;
using System.Text;
using Blocks.AiVideoService.Api;
using Blocks.Shared.Authorization;
using Microsoft.AspNetCore.Http;
using Xunit;

namespace Blocks.AiVideoService.Tests.Api;

public sealed class SystemFunctionalAuthorizationClientTests
{
    [Fact]
    public async Task Allows_and_forwards_bearer()
    {
        var handler = new StubHandler(_ => Json("{\"Success\":true,\"Data\":{\"HasPermission\":true}}"));
        var result = await CreateClient(handler).CheckAsync("ai-video.projects", FunctionalPermissionAction.VIEW);

        Assert.True(result.Allowed);
        Assert.Equal("Bearer token", handler.Authorization);
        Assert.Contains("ai-video.projects", handler.Body, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Denied_and_malformed_responses_fail_closed()
    {
        var denied = await CreateClient(new StubHandler(_ => Json("{\"Success\":true,\"Data\":{\"HasPermission\":false}}")))
            .CheckAsync("ai-video.projects", FunctionalPermissionAction.VIEW);
        var malformed = await CreateClient(new StubHandler(_ => Json("bad")))
            .CheckAsync("ai-video.projects", FunctionalPermissionAction.VIEW);

        Assert.False(denied.Allowed);
        Assert.True(denied.AuthorityAvailable);
        Assert.False(malformed.Allowed);
        Assert.False(malformed.AuthorityAvailable);
    }

    [Fact]
    public async Task Http_failure_and_missing_bearer_never_allow()
    {
        var unavailable = await CreateClient(new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.GatewayTimeout)))
            .CheckAsync("ai-video.projects", FunctionalPermissionAction.VIEW);
        var unauthenticated = await CreateClient(
                new StubHandler(_ => throw new InvalidOperationException()),
                new DefaultHttpContext(),
                addAuthorization: false)
            .CheckAsync("ai-video.projects", FunctionalPermissionAction.VIEW);

        Assert.False(unavailable.Allowed);
        Assert.False(unavailable.AuthorityAvailable);
        Assert.False(unauthenticated.Allowed);
        Assert.False(unauthenticated.Authenticated);
    }

    private static HttpResponseMessage Json(string content) => new(HttpStatusCode.OK)
    {
        Content = new StringContent(content, Encoding.UTF8, "application/json")
    };

    private static SystemFunctionalAuthorizationClient CreateClient(
        HttpMessageHandler handler,
        DefaultHttpContext? httpContext = null,
        bool addAuthorization = true)
    {
        httpContext ??= new DefaultHttpContext();
        if (addAuthorization && httpContext.Request.Headers.Authorization.Count == 0)
        {
            httpContext.Request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "token").ToString();
        }

        return new SystemFunctionalAuthorizationClient(
            new HttpClient(handler) { BaseAddress = new Uri("http://systemservice") },
            new HttpContextAccessor { HttpContext = httpContext });
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
