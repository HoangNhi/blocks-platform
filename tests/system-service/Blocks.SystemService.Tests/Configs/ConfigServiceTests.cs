using Blocks.SystemService.Configs;
using Blocks.SystemService.Infrastructure.Data;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Xunit;

namespace Blocks.SystemService.Tests.Configs;

public sealed class ConfigServiceTests
{
    [Fact]
    public void Does_not_register_schema_migration_as_hosted_service()
    {
        var builder = WebApplication.CreateBuilder();
        builder.Configuration["ConnectionStrings:System"] =
            "Host=127.0.0.1;Port=1;Database=blocks;Username=blocks;Password=blocks";

        builder.ExecuteConfigService();

        Assert.DoesNotContain(
            builder.Services,
            descriptor => descriptor.ServiceType == typeof(IHostedService)
                && descriptor.ImplementationType == typeof(SystemMigrationHostedService));
    }
}
