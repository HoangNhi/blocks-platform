using Blocks.ApiGateway.Configs;
using Blocks.ApiGateway.Middlewares;
using Blocks.Shared.Common;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Blocks.ApiGateway
{
    public static class GatewayHost
    {
        public static WebApplication Build(string[] args)
        {
            var builder = WebApplication.CreateBuilder(new WebApplicationOptions
            {
                Args = args,
                ApplicationName = typeof(GatewayHost).Assembly.FullName
            });

            var port = Environment.GetEnvironmentVariable("PORT");
            if (!string.IsNullOrEmpty(port))
            {
                builder.WebHost.UseUrls($"http://+:{port}");
            }

            builder.WebHost.ConfigureKestrel(options =>
            {
                options.Limits.MaxRequestBodySize = 120 * 1024 * 1024;
            });

            builder.Services.Configure<FormOptions>(options =>
            {
                options.MultipartBodyLengthLimit = 120 * 1024 * 1024;
            });

            builder.Services.AddReverseProxy()
                .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));

            builder.ExecuteConfigService();
            builder.Services.AddTrustedForwardedHeaders(forwardLimit: 1);
            builder.Services.AddHealthChecks()
                .AddCheck("self", () => HealthCheckResult.Healthy(), ["live"]);

            var app = builder.Build();

            app.UseMiddleware<GlobalExceptionHandler>();
            app.UseTrustedForwardedHeaders();

            app.UseCors();

            app.MapHealthChecks("/health");
            app.MapHealthChecks("/alive", new HealthCheckOptions
            {
                Predicate = r => r.Tags.Contains("live")
            });

            app.MapReverseProxy(proxyPipeline =>
            {
                proxyPipeline.UseSessionAffinity();
                proxyPipeline.UseLoadBalancing();
                proxyPipeline.UsePassiveHealthChecks();
                proxyPipeline.UseMiddleware<FileServiceBoundary>();
            });

            return app;
        }
    }

    internal class Program
    {
        private static void Main(string[] args)
        {
            GatewayHost.Build(args).Run();
        }
    }
}
