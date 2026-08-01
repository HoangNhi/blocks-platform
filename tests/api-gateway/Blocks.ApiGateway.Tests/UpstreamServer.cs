using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Extensions.DependencyInjection;

namespace Blocks.ApiGateway.Tests;

internal sealed class UpstreamServer : IAsyncDisposable
{
    private readonly WebApplication _app;

    private UpstreamServer(WebApplication app, string address)
    {
        _app = app;
        Address = address.EndsWith('/') ? address : address + "/";
    }

    public string Address { get; }

    public static async Task<UpstreamServer> StartAsync(Action<WebApplication> configure)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseKestrel();
        builder.WebHost.UseUrls("http://127.0.0.1:0");

        var app = builder.Build();
        configure(app);

        await app.StartAsync();

        var server = app.Services.GetRequiredService<IServer>();
        var addresses = server.Features.Get<IServerAddressesFeature>();
        var address = addresses?.Addresses.Single()
            ?? throw new InvalidOperationException("The upstream server did not publish an address.");

        return new UpstreamServer(app, address);
    }

    public async ValueTask DisposeAsync()
    {
        await _app.StopAsync();
        await _app.DisposeAsync();
    }
}
