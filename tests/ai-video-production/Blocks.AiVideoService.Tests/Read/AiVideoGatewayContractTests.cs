using System;
using System.IO;
using System.Text.Json;
using Xunit;

namespace Blocks.AiVideoService.Tests.Read;

public class AiVideoGatewayContractTests
{
    [Fact]
    public void GatewayConfig_ContainsAiVideoRouteAndCluster()
    {
        string gatewaySettingsPath = Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory,
            "..", "..", "..", "..", "..", "..",
            "services", "api-gateway", "Blocks.ApiGateway", "appsettings.json"
        ));

        string json = File.ReadAllText(gatewaySettingsPath);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        var reverseProxy = root.GetProperty("ReverseProxy");
        var routes = reverseProxy.GetProperty("Routes");
        var clusters = reverseProxy.GetProperty("Clusters");

        Assert.True(routes.TryGetProperty("ai-video-route", out var route));
        Assert.Equal("ai-video-cluster", route.GetProperty("ClusterId").GetString());
        Assert.Equal("/api/ai-video/{**catch-all}", route.GetProperty("Match").GetProperty("Path").GetString());

        Assert.True(clusters.TryGetProperty("ai-video-cluster", out var cluster));
        var destinations = cluster.GetProperty("Destinations");
        Assert.True(destinations.TryGetProperty("aivideoservice", out _));
    }

    [Fact]
    public void AppHost_ContainsGatewayWiringForAiVideo()
    {
        string appHostPath = Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory,
            "..", "..", "..", "..", "..", "..",
            "platform", "apphost", "Blocks.AppHost", "AppHost.cs"
        ));

        string content = File.ReadAllText(appHostPath);

        Assert.Contains("aiVideoService", content);
        Assert.Contains("ReverseProxy__Clusters__ai-video-cluster__Destinations__aivideoservice__Address", content);
    }
}
