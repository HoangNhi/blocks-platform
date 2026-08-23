using Blocks.SystemService.Infrastructure.Data;
using Xunit;

namespace Blocks.SystemService.Tests.Data;

public sealed class AuthorizationNavigationMigrationTests
{
    [Fact]
    public void Navigation_backfill_exposes_system_overview_and_admin_permissions()
    {
        var resource = SystemMigrationHostedService
            .GetMigrationResourceNames(typeof(SystemMigrationHostedService).Assembly)
            .Last();
        var stream = typeof(SystemMigrationHostedService).Assembly.GetManifestResourceStream(resource);
        Assert.NotNull(stream);
        using var reader = new StreamReader(stream!);
        var sql = reader.ReadToEnd();
        Assert.Contains("permission_key = 'admin.registration'", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("is_show_menu = true", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("role.key = 'administrator'", sql, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("not exists", sql, StringComparison.OrdinalIgnoreCase);
    }
}
