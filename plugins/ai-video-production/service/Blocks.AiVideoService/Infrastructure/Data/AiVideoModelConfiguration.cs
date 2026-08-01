using Blocks.AiVideoService.Domain;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Blocks.AiVideoService.Infrastructure.Data;

public class ImportBatchConfiguration : IEntityTypeConfiguration<ImportBatch>
{
    public void Configure(EntityTypeBuilder<ImportBatch> builder)
    {
        builder.ToTable("import_batch");
        builder.HasKey(e => e.Id);
        
        builder.Property(e => e.Id).HasColumnName("id");
        builder.Property(e => e.SourceKey).HasColumnName("source_key").HasMaxLength(100).IsRequired();
        builder.Property(e => e.ImportedAt).HasColumnName("imported_at").HasColumnType("timestamp without time zone");
        builder.Property(e => e.IsApplied).HasColumnName("is_applied");
    }
}

public class ImportedRunConfiguration : IEntityTypeConfiguration<ImportedRun>
{
    public void Configure(EntityTypeBuilder<ImportedRun> builder)
    {
        builder.ToTable("imported_run");
        builder.HasKey(e => e.Id);

        builder.Property(e => e.Id).HasColumnName("id").HasMaxLength(100);
        builder.Property(e => e.ImportBatchId).HasColumnName("import_batch_id");
        builder.Property(e => e.SourceKey).HasColumnName("source_key").HasMaxLength(100).IsRequired();
        builder.Property(e => e.Lane).HasColumnName("lane").HasMaxLength(100).IsRequired();
        builder.Property(e => e.WindowStart).HasColumnName("window_start").HasColumnType("timestamp without time zone");
        builder.Property(e => e.WindowEnd).HasColumnName("window_end").HasColumnType("timestamp without time zone");
        builder.Property(e => e.WorkflowVersion).HasColumnName("workflow_version").HasMaxLength(50).IsRequired();
        builder.Property(e => e.ContractVersion).HasColumnName("contract_version").HasMaxLength(50).IsRequired();
        builder.Property(e => e.CorrelationId).HasColumnName("correlation_id");
        builder.Property(e => e.ImportedAt).HasColumnName("imported_at").HasColumnType("timestamp without time zone");

        builder.HasIndex(e => e.ImportBatchId, "ix_imported_run_import_batch_id");
        builder.HasIndex(e => e.SourceKey, "ix_imported_run_source_key");

        builder.HasOne<ImportBatch>()
            .WithMany()
            .HasForeignKey(e => e.ImportBatchId)
            .OnDelete(DeleteBehavior.Restrict)
            .HasConstraintName("fk_imported_run_import_batch");
    }
}

public class StageAttemptConfiguration : IEntityTypeConfiguration<StageAttempt>
{
    public void Configure(EntityTypeBuilder<StageAttempt> builder)
    {
        builder.ToTable("stage_attempt");
        builder.HasKey(e => e.Id);

        builder.Property(e => e.Id).HasColumnName("id");
        builder.Property(e => e.RunId).HasColumnName("run_id").HasMaxLength(100).IsRequired();
        builder.Property(e => e.ImportBatchId).HasColumnName("import_batch_id");
        builder.Property(e => e.StageKey).HasColumnName("stage_key").HasMaxLength(100).IsRequired();
        builder.Property(e => e.AttemptId).HasColumnName("attempt_id").HasMaxLength(150).IsRequired();
        builder.Property(e => e.Status).HasColumnName("status").HasMaxLength(50).IsRequired();
        builder.Property(e => e.StartedAt).HasColumnName("started_at").HasColumnType("timestamp without time zone");
        builder.Property(e => e.CompletedAt).HasColumnName("completed_at").HasColumnType("timestamp without time zone");
        builder.Property(e => e.ImportedAt).HasColumnName("imported_at").HasColumnType("timestamp without time zone");

        builder.HasIndex(e => e.RunId, "ix_stage_attempt_run_id");
        builder.HasIndex(e => e.AttemptId, "ix_stage_attempt_attempt_id");

        builder.ToTable(t => t.HasCheckConstraint("CK_StageAttempt_StageKey", 
            "stage_key IN ('collect-news', 'build-weekly-corpus', 'score-select-stories', 'derive-angles', 'build-episode-package', 'build-visual-assets', 'generate-narration', 'compile-render-video', 'qa-review-delivery')"));

        builder.HasOne<ImportBatch>()
            .WithMany()
            .HasForeignKey(e => e.ImportBatchId)
            .OnDelete(DeleteBehavior.Restrict)
            .HasConstraintName("fk_stage_attempt_import_batch");
    }
}

public class ArtifactConfiguration : IEntityTypeConfiguration<Artifact>
{
    public void Configure(EntityTypeBuilder<Artifact> builder)
    {
        builder.ToTable("artifact");
        builder.HasKey(e => e.Id);

        builder.Property(e => e.Id).HasColumnName("id");
        builder.Property(e => e.RunId).HasColumnName("run_id").HasMaxLength(100).IsRequired();
        builder.Property(e => e.ImportBatchId).HasColumnName("import_batch_id");
        builder.Property(e => e.SourceKey).HasColumnName("source_key").HasMaxLength(100).IsRequired();
        builder.Property(e => e.StageKey).HasColumnName("stage_key").HasMaxLength(100).IsRequired();
        builder.Property(e => e.LogicalType).HasColumnName("logical_type").HasMaxLength(100).IsRequired();
        builder.Property(e => e.StorageKey).HasColumnName("storage_key").HasMaxLength(1000).IsRequired();
        builder.Property(e => e.MimeType).HasColumnName("mime_type").HasMaxLength(100).IsRequired();
        builder.Property(e => e.Checksum).HasColumnName("checksum").HasMaxLength(64).IsRequired();
        builder.Property(e => e.SizeInBytes).HasColumnName("size_in_bytes");
        builder.Property(e => e.Confidence).HasColumnName("confidence").HasMaxLength(50).IsRequired();
        builder.Property(e => e.Version).HasColumnName("version").HasDefaultValue(1);
        builder.Property(e => e.Locator).HasColumnName("locator").HasMaxLength(1000).IsRequired();
        builder.Property(e => e.ImportedAt).HasColumnName("imported_at").HasColumnType("timestamp without time zone");

        builder.HasIndex(e => e.RunId, "ix_artifact_run_id");
        builder.HasIndex(e => new { e.SourceKey, e.RunId, e.Locator, e.Checksum }, "ux_artifact_source_run_locator_checksum").IsUnique();

        builder.ToTable(t => t.HasCheckConstraint("CK_Artifact_StageKey", 
            "stage_key IN ('collect-news', 'build-weekly-corpus', 'score-select-stories', 'derive-angles', 'build-episode-package', 'build-visual-assets', 'generate-narration', 'compile-render-video', 'qa-review-delivery')"));
        builder.ToTable(t => t.HasCheckConstraint("CK_Artifact_Confidence", 
            "confidence IN ('verified', 'metadata-only', 'absent', 'Unknown')"));

        builder.HasOne<ImportBatch>()
            .WithMany()
            .HasForeignKey(e => e.ImportBatchId)
            .OnDelete(DeleteBehavior.Restrict)
            .HasConstraintName("fk_artifact_import_batch");
    }
}

public class ReceiptConfiguration : IEntityTypeConfiguration<Receipt>
{
    public void Configure(EntityTypeBuilder<Receipt> builder)
    {
        builder.ToTable("receipt");
        builder.HasKey(e => e.Id);

        builder.Property(e => e.Id).HasColumnName("id");
        builder.Property(e => e.RunId).HasColumnName("run_id").HasMaxLength(100).IsRequired();
        builder.Property(e => e.ImportBatchId).HasColumnName("import_batch_id");
        builder.Property(e => e.SourceKey).HasColumnName("source_key").HasMaxLength(100).IsRequired();
        builder.Property(e => e.StageKey).HasColumnName("stage_key").HasMaxLength(100).IsRequired();
        builder.Property(e => e.Locator).HasColumnName("locator").HasMaxLength(1000).IsRequired();
        builder.Property(e => e.Checksum).HasColumnName("checksum").HasMaxLength(64).IsRequired();
        builder.Property(e => e.Confidence).HasColumnName("confidence").HasMaxLength(50).IsRequired();
        builder.Property(e => e.ImportedAt).HasColumnName("imported_at").HasColumnType("timestamp without time zone");

        builder.HasIndex(e => e.RunId, "ix_receipt_run_id");
        builder.HasIndex(e => new { e.SourceKey, e.RunId, e.Locator, e.Checksum }, "ux_receipt_source_run_locator_checksum").IsUnique();

        builder.ToTable(t => t.HasCheckConstraint("CK_Receipt_StageKey", 
            "stage_key IN ('collect-news', 'build-weekly-corpus', 'score-select-stories', 'derive-angles', 'build-episode-package', 'build-visual-assets', 'generate-narration', 'compile-render-video', 'qa-review-delivery')"));
        builder.ToTable(t => t.HasCheckConstraint("CK_Receipt_Confidence", 
            "confidence IN ('verified', 'metadata-only', 'absent', 'Unknown')"));

        builder.HasOne<ImportBatch>()
            .WithMany()
            .HasForeignKey(e => e.ImportBatchId)
            .OnDelete(DeleteBehavior.Restrict)
            .HasConstraintName("fk_receipt_import_batch");
    }
}

public class ReconciliationEventConfiguration : IEntityTypeConfiguration<ReconciliationEvent>
{
    public void Configure(EntityTypeBuilder<ReconciliationEvent> builder)
    {
        builder.ToTable("reconciliation_event");
        builder.HasKey(e => e.Id);

        builder.Property(e => e.Id).HasColumnName("id");
        builder.Property(e => e.ImportBatchId).HasColumnName("import_batch_id");
        builder.Property(e => e.RunId).HasColumnName("run_id").HasMaxLength(100).IsRequired();
        builder.Property(e => e.StageKey).HasColumnName("stage_key").HasMaxLength(100).IsRequired();
        builder.Property(e => e.Locator).HasColumnName("locator").HasMaxLength(1000).IsRequired();
        builder.Property(e => e.ConflictType).HasColumnName("conflict_type").HasMaxLength(100).IsRequired();
        builder.Property(e => e.ExpectedChecksum).HasColumnName("expected_checksum").HasMaxLength(64).IsRequired();
        builder.Property(e => e.ObservedChecksum).HasColumnName("observed_checksum").HasMaxLength(64).IsRequired();
        builder.Property(e => e.Message).HasColumnName("message").HasMaxLength(2000).IsRequired();
        builder.Property(e => e.ImportedAt).HasColumnName("imported_at").HasColumnType("timestamp without time zone");

        builder.HasIndex(e => e.RunId, "ix_reconciliation_event_run_id");

        builder.ToTable(t => t.HasCheckConstraint("CK_ReconciliationEvent_StageKey", 
            "stage_key IN ('collect-news', 'build-weekly-corpus', 'score-select-stories', 'derive-angles', 'build-episode-package', 'build-visual-assets', 'generate-narration', 'compile-render-video', 'qa-review-delivery')"));

        builder.HasOne<ImportBatch>()
            .WithMany()
            .HasForeignKey(e => e.ImportBatchId)
            .OnDelete(DeleteBehavior.Restrict)
            .HasConstraintName("fk_reconciliation_event_import_batch");
    }
}
