using System.Net;
using System.Net.Http.Headers;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Xunit;

namespace Blocks.ApiGateway.Tests;

public sealed class GatewayProxyRouteTests
{
    [Fact]
    public async Task System_route_removes_gateway_prefix_and_forwards_authorization()
    {
        await using var system = await UpstreamServer.StartAsync(app =>
        {
            app.MapPost("/api/Auth/login", (HttpContext context) =>
            {
                context.Response.Headers["X-Echo-Path"] = context.Request.Path.Value;
                context.Response.Headers["X-Echo-Authorization"] = context.Request.Headers.Authorization.ToString();
                return Results.Json(new { ok = true });
            });
        });

        await using var files = await UpstreamServer.StartAsync(app =>
        {
            app.MapPost("/api/UploadFile/embed", () => Results.Ok());
        });

        await using var factory = GatewayFactory.Create(system.Address, files.Address);
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/system/Auth/login");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", "abc123");

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.TryGetValues("X-Echo-Path", out var paths));
        Assert.Contains("/api/Auth/login", paths);
        Assert.True(response.Headers.TryGetValues("X-Echo-Authorization", out var authHeaders));
        Assert.Contains("Bearer abc123", authHeaders);
    }

    [Fact]
    public async Task Files_route_removes_gateway_prefix_and_exposes_content_disposition()
    {
        await using var system = await UpstreamServer.StartAsync(app =>
        {
            app.MapPost("/api/Auth/login", () => Results.Ok());
        });

        await using var files = await UpstreamServer.StartAsync(app =>
        {
            app.MapPost("/api/UploadFile/embed", (HttpContext context) =>
            {
                context.Response.Headers["X-Echo-Path"] = context.Request.Path.Value;
                context.Response.Headers["Content-Disposition"] = "attachment; filename=\"avatar.png\"";
                return Results.Json(new { uploaded = true });
            });
        });

        await using var factory = GatewayFactory.Create(system.Address, files.Address);
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Post, "/api/files/UploadFile/embed");
        request.Headers.TryAddWithoutValidation("Origin", "http://localhost:5173");

        using var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.TryGetValues("X-Echo-Path", out var paths));
        Assert.Contains("/api/UploadFile/embed", paths);
        Assert.True(response.Content.Headers.TryGetValues("Content-Disposition", out var contentDisposition));
        Assert.Contains("attachment; filename=\"avatar.png\"", contentDisposition);
        Assert.True(response.Headers.TryGetValues("Access-Control-Expose-Headers", out var exposedHeaders));
        Assert.Contains("Content-Disposition", exposedHeaders);
    }

    [Fact]
    public async Task TradeLab_route_forwards_api_prefix_to_python_service()
    {
        await using var system = await UpstreamServer.StartAsync(app =>
        {
            app.MapPost("/api/Auth/login", () => Results.Ok());
        });

        await using var files = await UpstreamServer.StartAsync(app =>
        {
            app.MapPost("/api/UploadFile/embed", () => Results.Ok());
        });

        await using var tradeLab = await UpstreamServer.StartAsync(app =>
        {
            app.MapGet("/api/tradelab/indicators", (HttpContext context) =>
            {
                context.Response.Headers["X-Echo-Path"] = context.Request.Path.Value;
                return Results.Json(new[] { new { name = "sma" } });
            });
        });

        await using var factory = GatewayFactory.Create(system.Address, files.Address, tradeLab.Address);
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/api/tradelab/indicators");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.True(response.Headers.TryGetValues("X-Echo-Path", out var paths));
        Assert.Contains("/api/tradelab/indicators", paths);
    }
}
