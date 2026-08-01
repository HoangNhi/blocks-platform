using Blocks.AiVideoService.Infrastructure.Data;
using Blocks.AiVideoService.Importing;
using Blocks.AiVideoService.Read;
using Blocks.AiVideoService.Artifacts;
using Blocks.AiVideoService.Api;
using Microsoft.EntityFrameworkCore;
using System.Runtime.CompilerServices;

[assembly: InternalsVisibleTo("Blocks.AiVideoService.Tests")]
[assembly: InternalsVisibleTo("Blocks.AiVideoImporter")]

AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true);

var builder = WebApplication.CreateBuilder(args);

builder.AddServiceDefaults();

// Retrieve connection string
var connectionString = builder.Configuration.GetConnectionString("AiVideo");
if (string.IsNullOrEmpty(connectionString))
{
    if (EF.IsDesignTime)
    {
        connectionString = "Host=localhost;Database=dummy;Username=postgres;Password=postgres";
    }
    else
    {
        throw new InvalidOperationException("Connection string 'AiVideo' not found in configuration under ConnectionStrings:AiVideo.");
    }
}

builder.Services.AddDbContext<AiVideoDbContext>(options =>
    options.UseNpgsql(connectionString, x => x.MigrationsAssembly(typeof(Program).Assembly.FullName)));

// Register Read/Artifact services and options
builder.Services.Configure<ImportSourceOptions>(builder.Configuration.GetSection("ImportSources"));
builder.Services.AddAiVideoAccess(builder.Configuration);
builder.Services.AddScoped<IImportSourceRegistry, ImportSourceRegistry>();
builder.Services.AddScoped<ILegacyTracerEvidenceReader, LegacyTracerEvidenceReader>();
builder.Services.AddScoped<ITargetEvidenceReader, TargetEvidenceReader>();
builder.Services.AddScoped<IEvidenceImporter, EvidenceImporter>();
builder.Services.AddScoped<AiVideoReadService>();
builder.Services.AddScoped<AiVideoArtifactAccessService>();

var app = builder.Build();

app.MapDefaultEndpoints();
app.UseAuthentication();
app.UseAuthorization();
app.MapAiVideoReadEndpoints();

app.Run();

public partial class Program { }
