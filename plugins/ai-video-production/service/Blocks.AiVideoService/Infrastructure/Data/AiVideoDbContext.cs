using Blocks.AiVideoService.Domain;
using Microsoft.EntityFrameworkCore;

namespace Blocks.AiVideoService.Infrastructure.Data;

public class AiVideoDbContext : DbContext
{
    public AiVideoDbContext(DbContextOptions<AiVideoDbContext> options) : base(options)
    {
    }

    public DbSet<ImportBatch> ImportBatches => Set<ImportBatch>();
    public DbSet<ImportedRun> ImportedRuns => Set<ImportedRun>();
    public DbSet<StageAttempt> StageAttempts => Set<StageAttempt>();
    public DbSet<Artifact> Artifacts => Set<Artifact>();
    public DbSet<Receipt> Receipts => Set<Receipt>();
    public DbSet<ReconciliationEvent> ReconciliationEvents => Set<ReconciliationEvent>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        
        // Apply custom configurations
        modelBuilder.ApplyConfiguration(new ImportBatchConfiguration());
        modelBuilder.ApplyConfiguration(new ImportedRunConfiguration());
        modelBuilder.ApplyConfiguration(new StageAttemptConfiguration());
        modelBuilder.ApplyConfiguration(new ArtifactConfiguration());
        modelBuilder.ApplyConfiguration(new ReceiptConfiguration());
        modelBuilder.ApplyConfiguration(new ReconciliationEventConfiguration());
    }
}
