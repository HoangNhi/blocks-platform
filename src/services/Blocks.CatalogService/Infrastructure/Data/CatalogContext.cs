using System;
using System.Collections.Generic;
using Blocks.CatalogService.Entities;
using Microsoft.EntityFrameworkCore;

namespace Blocks.CatalogService.Infrastructure.Data;

public partial class CatalogContext : DbContext
{
    public CatalogContext(DbContextOptions<CatalogContext> options)
        : base(options)
    {
    }

    public virtual DbSet<Criterion> Criteria { get; set; }

    public virtual DbSet<CriterionRequirement> CriterionRequirements { get; set; }

    public virtual DbSet<Faculty> Faculties { get; set; }

    public virtual DbSet<FileType> FileTypes { get; set; }

    public virtual DbSet<Stakeholder> Stakeholders { get; set; }

    public virtual DbSet<Standard> Standards { get; set; }

    public virtual DbSet<StandardSet> StandardSets { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder
            .UseCollation("utf8mb4_0900_ai_ci")
            .HasCharSet("utf8mb4");

        modelBuilder.Entity<Criterion>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("PRIMARY");

            entity.ToTable("Criterion");

            entity.HasIndex(e => e.StandardId, "FK_Criterion_Standard");

            entity.Property(e => e.Code).HasColumnType("text");
            entity.Property(e => e.CreatedAt).HasColumnType("timestamp");
            entity.Property(e => e.CreatedBy).HasMaxLength(255);
            entity.Property(e => e.Description).HasColumnType("text");
            entity.Property(e => e.DiagnosticQuestions).HasColumnType("text");
            entity.Property(e => e.Name).HasColumnType("text");
            entity.Property(e => e.UpdatedAt).HasColumnType("timestamp");
            entity.Property(e => e.UpdatedBy).HasMaxLength(255);

            entity.HasOne(d => d.Standard).WithMany(p => p.Criteria)
                .HasForeignKey(d => d.StandardId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Criterion_Standard");
        });

        modelBuilder.Entity<CriterionRequirement>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("PRIMARY");

            entity.ToTable("CriterionRequirement");

            entity.HasIndex(e => e.CriterionId, "FK_CriterionRequirement_Criterion");

            entity.HasIndex(e => e.FileTypeId, "FK_CriterionRequirement_FileType");

            entity.Property(e => e.CreatedAt).HasColumnType("timestamp");
            entity.Property(e => e.CreatedBy).HasMaxLength(255);
            entity.Property(e => e.Suggestion).HasColumnType("text");
            entity.Property(e => e.UpdatedAt).HasColumnType("timestamp");
            entity.Property(e => e.UpdatedBy).HasMaxLength(255);

            entity.HasOne(d => d.Criterion).WithMany(p => p.CriterionRequirements)
                .HasForeignKey(d => d.CriterionId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_CriterionRequirement_Criterion");

            entity.HasOne(d => d.FileType).WithMany(p => p.CriterionRequirements)
                .HasForeignKey(d => d.FileTypeId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_CriterionRequirement_FileType");
        });

        modelBuilder.Entity<Faculty>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("PRIMARY");

            entity.ToTable("Faculty");

            entity.Property(e => e.Id)
                .UseCollation("ascii_general_ci")
                .HasCharSet("ascii");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("utc_timestamp()")
                .HasColumnType("timestamp");
            entity.Property(e => e.CreatedBy).HasMaxLength(255);
            entity.Property(e => e.IsActived)
                .IsRequired()
                .HasDefaultValueSql("'1'");
            entity.Property(e => e.Name).HasColumnType("text");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("utc_timestamp()")
                .HasColumnType("timestamp");
            entity.Property(e => e.UpdatedBy).HasMaxLength(255);
        });

        modelBuilder.Entity<FileType>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("PRIMARY");

            entity.ToTable("FileType");

            entity.Property(e => e.Code).HasColumnType("text");
            entity.Property(e => e.CreatedAt).HasColumnType("timestamp");
            entity.Property(e => e.CreatedBy).HasMaxLength(255);
            entity.Property(e => e.Description).HasColumnType("text");
            entity.Property(e => e.Name).HasColumnType("text");
            entity.Property(e => e.UpdatedAt).HasColumnType("timestamp");
            entity.Property(e => e.UpdatedBy).HasMaxLength(255);
        });

        modelBuilder.Entity<Stakeholder>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("PRIMARY");

            entity.ToTable("Stakeholder");

            entity.Property(e => e.Id)
                .UseCollation("ascii_general_ci")
                .HasCharSet("ascii");
            entity.Property(e => e.CreatedAt).HasColumnType("timestamp");
            entity.Property(e => e.CreatedBy).HasMaxLength(255);
            entity.Property(e => e.Description).HasColumnType("text");
            entity.Property(e => e.Email).HasColumnType("text");
            entity.Property(e => e.FullName).HasColumnType("text");
            entity.Property(e => e.UpdatedAt).HasColumnType("timestamp");
            entity.Property(e => e.UpdatedBy).HasMaxLength(255);
        });

        modelBuilder.Entity<Standard>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("PRIMARY");

            entity.ToTable("Standard");

            entity.HasIndex(e => e.StandardSetId, "FK_Standard_StandardSet");

            entity.Property(e => e.Code).HasColumnType("text");
            entity.Property(e => e.CreatedAt).HasColumnType("timestamp");
            entity.Property(e => e.CreatedBy).HasMaxLength(255);
            entity.Property(e => e.Description).HasMaxLength(1000);
            entity.Property(e => e.Name).HasColumnType("text");
            entity.Property(e => e.UpdatedAt).HasColumnType("timestamp");
            entity.Property(e => e.UpdatedBy).HasMaxLength(255);

            entity.HasOne(d => d.StandardSet).WithMany(p => p.Standards)
                .HasForeignKey(d => d.StandardSetId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("FK_Standard_StandardSet");
        });

        modelBuilder.Entity<StandardSet>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("PRIMARY");

            entity.ToTable("StandardSet");

            entity.Property(e => e.ChartType).HasComment("0 = SpiderChart, 1 = BarChart");
            entity.Property(e => e.Code).HasColumnType("text");
            entity.Property(e => e.CreatedAt).HasColumnType("timestamp");
            entity.Property(e => e.CreatedBy).HasMaxLength(255);
            entity.Property(e => e.Description).HasColumnType("text");
            entity.Property(e => e.Name).HasColumnType("text");
            entity.Property(e => e.UpdatedAt).HasColumnType("timestamp");
            entity.Property(e => e.UpdatedBy).HasMaxLength(255);
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
