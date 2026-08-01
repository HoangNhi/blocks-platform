using System.Net;
using Xunit;

namespace Blocks.ApiGateway.Tests;

public sealed class GatewayHealthAndCorsTests
{
    [Fact]
    public async Task Health_endpoint_is_available_in_development()
    {
        await using var factory = GatewayFactory.Create();
        using var client = factory.CreateClient();

        using var response = await client.GetAsync("/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task Cors_preflight_allows_configured_web_origin_for_system_route()
    {
        await using var factory = GatewayFactory.Create();
        using var client = factory.CreateClient();
        using var request = new HttpRequestMessage(HttpMethod.Options, "/api/system/Auth/login");
        request.Headers.TryAddWithoutValidation("Origin", "http://localhost:5173");
        request.Headers.TryAddWithoutValidation("Access-Control-Request-Method", "POST");
        request.Headers.TryAddWithoutValidation("Access-Control-Request-Headers", "authorization,content-type");

        using var response = await client.SendAsync(request);

        Assert.True(response.IsSuccessStatusCode);
        Assert.True(response.Headers.TryGetValues("Access-Control-Allow-Origin", out var origins));
        Assert.Contains("http://localhost:5173", origins);
    }
}
