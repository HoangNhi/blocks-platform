using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;

namespace Blocks.ApiGateway.Tests;

internal sealed class GatewayFactory : WebApplicationFactory<Program>
{
    private readonly string _systemAddress;
    private readonly string _fileAddress;
    private readonly string _tradeLabAddress;

    private GatewayFactory(string systemAddress, string fileAddress, string tradeLabAddress)
    {
        _systemAddress = systemAddress;
        _fileAddress = fileAddress;
        _tradeLabAddress = tradeLabAddress;
    }

    public static GatewayFactory Create(
        string systemAddress = "http://127.0.0.1:59990/",
        string fileAddress = "http://127.0.0.1:59991/",
        string tradeLabAddress = "http://127.0.0.1:8011/")
    {
        return new GatewayFactory(systemAddress, fileAddress, tradeLabAddress);
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");

        builder.ConfigureAppConfiguration((_, config) =>
        {
            config.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Cors:Origins:0"] = "http://localhost:5173",
                ["Cors:Origins:1"] = "https://localhost:5173",
                ["ReverseProxy:Clusters:system-cluster:Destinations:systemservice:Address"] = _systemAddress,
                ["ReverseProxy:Clusters:files-cluster:Destinations:fileservice:Address"] = _fileAddress,
                ["ReverseProxy:Clusters:tradelab-cluster:Destinations:tradelabservice:Address"] = _tradeLabAddress
            });
        });
    }
}
