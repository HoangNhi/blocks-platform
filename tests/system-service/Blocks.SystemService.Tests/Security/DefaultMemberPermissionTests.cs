using Xunit;

namespace Blocks.SystemService.Tests.Security;

public sealed class DefaultMemberPermissionTests
{
    [Fact]
    public void Resource_matrix_marks_domain_resources_blocked_and_workspace_home_safe()
    {
        var matrix = ReadRepoFile("docs", "tasks", "2026-08-07-community-authorization-model", "resource-authorization-matrix.md");

        Assert.Contains("| Personal workspaces |", matrix, StringComparison.Ordinal);
        Assert.Contains("`enforced-and-migrated`", matrix, StringComparison.Ordinal);
        Assert.Contains("| Strategies |", matrix, StringComparison.Ordinal);
        Assert.Contains("blocked-needs-decision", matrix, StringComparison.Ordinal);
    }

    [Fact]
    public void Resource_migration_seeds_only_workspace_home_for_member()
    {
        var migration = ReadRepoFile(
            "services", "system-service", "Blocks.SystemService", "Infrastructure", "Data", "Migrations",
            "2026082301_functional_authorization_resources.sql");

        Assert.Contains("menu.permission_key = 'workspace.home'", migration, StringComparison.Ordinal);
        Assert.DoesNotContain("role.key = 'administrator'", migration, StringComparison.Ordinal);
        var permissionSeed = migration[migration.IndexOf("insert into permission", StringComparison.Ordinal)..];
        Assert.DoesNotContain("tradelab.datasets'", permissionSeed, StringComparison.Ordinal);
    }

    private static string ReadRepoFile(params string[] parts)
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory is not null && !File.Exists(Path.Combine(directory.FullName, "AGENTS.md")))
        {
            directory = directory.Parent;
        }

        Assert.NotNull(directory);
        return File.ReadAllText(Path.Combine([directory!.FullName, .. parts]));
    }
}
