using System.Reflection;
using Npgsql;

namespace Blocks.SystemService.Infrastructure.Data;

public sealed class SystemMigrationHostedService(
    IConfiguration configuration,
    ILogger<SystemMigrationHostedService> logger) : IHostedService
{
    public const long AdvisoryLockKey = 42425253;
    public const string AdvisoryLockCommandText = "select pg_advisory_xact_lock($1);";
    public const string CreateJournalCommandText = "create table if not exists system_schema_migration (filename text primary key, applied_at timestamp with time zone not null default now());";
    public const string CheckAppliedCommandText = "select exists (select 1 from system_schema_migration where filename = $1);";
    public const string RecordAppliedCommandText = "insert into system_schema_migration (filename) values ($1);";

    public static IReadOnlyList<string> GetMigrationResourceNames(Assembly assembly)
    {
        return assembly.GetManifestResourceNames()
            .Where(name => name.Contains("Infrastructure.Data.Migrations.", StringComparison.Ordinal) &&
                          name.EndsWith(".sql", StringComparison.OrdinalIgnoreCase))
            .Order(StringComparer.Ordinal)
            .ToArray();
    }

    public static IReadOnlyList<string> GetPendingMigrationResourceNames(
        IEnumerable<string> resources,
        IEnumerable<string> appliedResources)
    {
        var applied = appliedResources.ToHashSet(StringComparer.Ordinal);
        return resources
            .Where(resource => !applied.Contains(resource))
            .Order(StringComparer.Ordinal)
            .ToArray();
    }

    public static string ReadMigrationSql(Assembly assembly, string resourceName)
    {
        using var resource = assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException($"Embedded migration resource '{resourceName}' was not found.");
        using var reader = new StreamReader(resource);
        return reader.ReadToEnd();
    }

    public static async Task ExecuteInTransactionAsync(
        Func<Task> operation,
        Func<Task> commit,
        Func<Task> rollback)
    {
        try
        {
            await operation();
            await commit();
        }
        catch
        {
            await rollback();
            throw;
        }
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        var connectionString = configuration.GetConnectionString("System");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException("Connection string 'System' not found in configuration under ConnectionStrings:System.");
        }

        await using var connection = new NpgsqlConnection(connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);

        await ExecuteInTransactionAsync(
            async () =>
            {
                await using (var lockCommand = new NpgsqlCommand(AdvisoryLockCommandText, connection, transaction))
                {
                    lockCommand.Parameters.AddWithValue(AdvisoryLockKey);
                    await lockCommand.ExecuteNonQueryAsync(cancellationToken);
                }

                await using (var journalCommand = new NpgsqlCommand(CreateJournalCommandText, connection, transaction))
                {
                    await journalCommand.ExecuteNonQueryAsync(cancellationToken);
                }

                var appliedResources = new List<string>();
                await using (var appliedCommand = new NpgsqlCommand(
                    "select filename from system_schema_migration;",
                    connection,
                    transaction))
                await using (var reader = await appliedCommand.ExecuteReaderAsync(cancellationToken))
                {
                    while (await reader.ReadAsync(cancellationToken))
                    {
                        appliedResources.Add(reader.GetString(0));
                    }
                }

                foreach (var resourceName in GetPendingMigrationResourceNames(
                             GetMigrationResourceNames(typeof(SystemMigrationHostedService).Assembly),
                             appliedResources))
                {
                    await using var migrationCommand = new NpgsqlCommand(
                        ReadMigrationSql(typeof(SystemMigrationHostedService).Assembly, resourceName),
                        connection,
                        transaction);
                    await migrationCommand.ExecuteNonQueryAsync(cancellationToken);

                    await using var recordCommand = new NpgsqlCommand(RecordAppliedCommandText, connection, transaction);
                    recordCommand.Parameters.AddWithValue(resourceName);
                    await recordCommand.ExecuteNonQueryAsync(cancellationToken);
                }
            },
            () => transaction.CommitAsync(cancellationToken),
            () => transaction.RollbackAsync(CancellationToken.None));

        logger.LogInformation("System database migrations applied successfully.");
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
