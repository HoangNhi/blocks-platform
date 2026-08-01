using Microsoft.Extensions.Hosting;

const string GatewayCorsPolicy = "GatewayCors";

var builder = WebApplication.CreateBuilder(args);

var port = Environment.GetEnvironmentVariable("PORT");
if (!string.IsNullOrEmpty(port))
{
    builder.WebHost.UseUrls($"http://+:{port}");
}

builder.AddServiceDefaults();

builder.Services.AddCors(options =>
{
    options.AddPolicy(GatewayCorsPolicy, policy =>
    {
        var origins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>() ?? [];

        policy.SetIsOriginAllowed(origin =>
            origins.Contains(origin, StringComparer.OrdinalIgnoreCase) ||
            (Uri.TryCreate(origin, UriKind.Absolute, out var uri) &&
             (string.Equals(uri.Host, "localhost", StringComparison.OrdinalIgnoreCase) ||
              string.Equals(uri.Host, "127.0.0.1", StringComparison.OrdinalIgnoreCase)) &&
             (uri.Scheme == Uri.UriSchemeHttp || uri.Scheme == Uri.UriSchemeHttps)))
            .AllowAnyHeader()
            .AllowAnyMethod()
            .WithExposedHeaders("Content-Disposition");
    });
});

builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));

var app = builder.Build();

app.MapDefaultEndpoints();

app.UseCors();

app.MapReverseProxy();

app.Run();

public partial class Program
{
}
