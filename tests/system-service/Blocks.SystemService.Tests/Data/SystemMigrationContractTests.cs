using System.Reflection;
using Blocks.SystemService.Infrastructure.Data;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;

namespace Blocks.SystemService.Tests.Data;

public class SystemMigrationContractTests
{
    [Fact]
    public void Migration_resources_are_embedded_and_ordered()
    {
        var resources = SystemMigrationHostedService.GetMigrationResourceNames(typeof(SystemMigrationContractTests).Assembly);

        Assert.Equal(2, resources.Count);
        Assert.Equal(resources.Order(StringComparer.Ordinal), resources);
        Assert.EndsWith(".000_test.sql", resources[0], StringComparison.Ordinal);
        Assert.EndsWith(".001_test.sql", resources[1], StringComparison.Ordinal);
        Assert.Equal("select 1;\n", SystemMigrationHostedService.ReadMigrationSql(typeof(SystemMigrationContractTests).Assembly, resources[0]));
    }

    [Fact]
    public void Pending_migrations_exclude_journaled_resources_in_filename_order()
    {
        var resources = new[]
        {
            "Blocks.SystemService.Infrastructure.Data.Migrations.002.sql",
            "Blocks.SystemService.Infrastructure.Data.Migrations.001.sql",
            "Blocks.SystemService.Infrastructure.Data.Migrations.003.sql"
        };

        var pending = SystemMigrationHostedService.GetPendingMigrationResourceNames(
            resources,
            new[] { "Blocks.SystemService.Infrastructure.Data.Migrations.001.sql" });

        Assert.Equal(
            new[]
            {
                "Blocks.SystemService.Infrastructure.Data.Migrations.002.sql",
                "Blocks.SystemService.Infrastructure.Data.Migrations.003.sql"
            },
            pending);
    }

    [Fact]
    public async Task Missing_connection_string_fails_startup_before_database_access()
    {
        var service = new SystemMigrationHostedService(
            new ConfigurationBuilder().Build(),
            NullLogger<SystemMigrationHostedService>.Instance);

        var exception = await Assert.ThrowsAsync<InvalidOperationException>(() => service.StartAsync(CancellationToken.None));

        Assert.Equal(
            "Connection string 'System' not found in configuration under ConnectionStrings:System.",
            exception.Message);
    }

    [Fact]
    public async Task Transaction_runner_rolls_back_and_rethrows_operation_failure()
    {
        var committed = false;
        var rolledBack = false;

        await Assert.ThrowsAsync<InvalidOperationException>(() => SystemMigrationHostedService.ExecuteInTransactionAsync(
            () => Task.FromException(new InvalidOperationException("migration failed")),
            () =>
            {
                committed = true;
                return Task.CompletedTask;
            },
            () =>
            {
                rolledBack = true;
                return Task.CompletedTask;
            }));

        Assert.False(committed);
        Assert.True(rolledBack);
    }

    [Fact]
    public void Migration_sql_contract_uses_required_journal_and_lock()
    {
        Assert.Equal(42425253, SystemMigrationHostedService.AdvisoryLockKey);
        Assert.Equal("select pg_advisory_xact_lock($1);", SystemMigrationHostedService.AdvisoryLockCommandText);
        Assert.Contains("create table if not exists system_schema_migration", SystemMigrationHostedService.CreateJournalCommandText, StringComparison.Ordinal);
        Assert.Contains("system_schema_migration", SystemMigrationHostedService.CheckAppliedCommandText, StringComparison.Ordinal);
        Assert.Contains("system_schema_migration", SystemMigrationHostedService.RecordAppliedCommandText, StringComparison.Ordinal);
    }
}
