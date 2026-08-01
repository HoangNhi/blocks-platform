using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Blocks.AiVideoService.Importing;
using Blocks.AiVideoService.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Blocks.AiVideoImporter;

public static class Program
{
    public static async Task<int> Main(string[] args)
    {
        AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);
        string? sourceKey = null;
        bool apply = false;

        // Parse arguments
        for (int i = 0; i < args.Length; i++)
        {
            if (args[i] == "--source-key")
            {
                if (i + 1 < args.Length)
                {
                    sourceKey = args[i + 1];
                    i++;
                }
                else
                {
                    Console.Error.WriteLine("validation_error: Missing value for --source-key parameter.");
                    return 1;
                }
            }
            else if (args[i] == "--apply")
            {
                apply = true;
            }
            else
            {
                Console.Error.WriteLine($"validation_error: Unknown parameter '{args[i]}'. Only --source-key and --apply are supported.");
                return 1;
            }
        }

        if (string.IsNullOrWhiteSpace(sourceKey))
        {
            Console.Error.WriteLine("validation_error: Parameter --source-key is required.");
            return 1;
        }

        string normalizedKey = sourceKey.Trim().ToLowerInvariant();
        if (normalizedKey != "legacy" && normalizedKey != "tracer" && normalizedKey != "target")
        {
            Console.Error.WriteLine("validation_error: Source key must be 'legacy', 'tracer', or 'target'.");
            return 1;
        }

        // Set up configuration
        var configBuilder = new ConfigurationBuilder()
            .SetBasePath(Directory.GetCurrentDirectory())
            .AddJsonFile("appsettings.json", optional: true)
            .AddJsonFile("appsettings.Development.json", optional: true)
            .AddEnvironmentVariables();

        var configuration = configBuilder.Build();

        string? connectionString = configuration.GetConnectionString("AiVideo");
        if (string.IsNullOrEmpty(connectionString))
        {
            Console.Error.WriteLine("validation_error: Database connection string 'AiVideo' not found in configuration under ConnectionStrings:AiVideo.");
            return 1;
        }

        // Setup DI
        var services = new ServiceCollection();
        
        services.AddDbContext<AiVideoDbContext>(options =>
            options.UseNpgsql(connectionString, x => x.MigrationsAssembly(typeof(AiVideoDbContext).Assembly.FullName)));

        services.Configure<ImportSourceOptions>(configuration.GetSection(ImportSourceOptions.SectionName));
        services.AddSingleton<IImportSourceRegistry, ImportSourceRegistry>();
        services.AddSingleton<ILegacyTracerEvidenceReader, LegacyTracerEvidenceReader>();
        services.AddSingleton<ITargetEvidenceReader, TargetEvidenceReader>();
        services.AddScoped<IEvidenceImporter, EvidenceImporter>();

        var serviceProvider = services.BuildServiceProvider();

        try
        {
            var importer = serviceProvider.GetRequiredService<IEvidenceImporter>();
            var outcome = await importer.ImportAsync(new ImportRequest(normalizedKey, apply), CancellationToken.None);

            Console.WriteLine($"BatchId: {outcome.ImportBatchId}");
            Console.WriteLine($"CreatedRuns: {outcome.CreatedRuns}");
            Console.WriteLine($"CreatedArtifacts: {outcome.CreatedArtifacts}");
            Console.WriteLine($"RejectedEvidence: {outcome.RejectedEvidence}");
            Console.WriteLine($"Applied: {outcome.Applied}");
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"reconciliation_failure: Import failed. Details: {ex.Message}"); if (ex.InnerException != null) Console.Error.WriteLine($"Inner: {ex.InnerException.Message}");
            return 1;
        }
    }
}
