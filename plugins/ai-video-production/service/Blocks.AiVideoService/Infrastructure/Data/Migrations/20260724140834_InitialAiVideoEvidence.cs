using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Blocks.AiVideoService.Infrastructure.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialAiVideoEvidence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "import_batch",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    source_key = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    imported_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false),
                    is_applied = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_import_batch", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "artifact",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    run_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    import_batch_id = table.Column<Guid>(type: "uuid", nullable: false),
                    source_key = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    stage_key = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    logical_type = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    storage_key = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    mime_type = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    checksum = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    size_in_bytes = table.Column<long>(type: "bigint", nullable: false),
                    confidence = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    version = table.Column<int>(type: "integer", nullable: false, defaultValue: 1),
                    locator = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    imported_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_artifact", x => x.id);
                    table.CheckConstraint("CK_Artifact_Confidence", "confidence IN ('verified', 'metadata-only', 'absent', 'Unknown')");
                    table.CheckConstraint("CK_Artifact_StageKey", "stage_key IN ('collect-news', 'build-weekly-corpus', 'score-select-stories', 'derive-angles', 'build-episode-package', 'build-visual-assets', 'generate-narration', 'compile-render-video', 'qa-review-delivery')");
                    table.ForeignKey(
                        name: "fk_artifact_import_batch",
                        column: x => x.import_batch_id,
                        principalTable: "import_batch",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "imported_run",
                columns: table => new
                {
                    id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    import_batch_id = table.Column<Guid>(type: "uuid", nullable: false),
                    source_key = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    lane = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    window_start = table.Column<DateTime>(type: "timestamp without time zone", nullable: false),
                    window_end = table.Column<DateTime>(type: "timestamp without time zone", nullable: false),
                    workflow_version = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    contract_version = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    correlation_id = table.Column<Guid>(type: "uuid", nullable: false),
                    imported_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_imported_run", x => x.id);
                    table.ForeignKey(
                        name: "fk_imported_run_import_batch",
                        column: x => x.import_batch_id,
                        principalTable: "import_batch",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "receipt",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    run_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    import_batch_id = table.Column<Guid>(type: "uuid", nullable: false),
                    source_key = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    stage_key = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    locator = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    checksum = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    confidence = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    imported_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_receipt", x => x.id);
                    table.CheckConstraint("CK_Receipt_Confidence", "confidence IN ('verified', 'metadata-only', 'absent', 'Unknown')");
                    table.CheckConstraint("CK_Receipt_StageKey", "stage_key IN ('collect-news', 'build-weekly-corpus', 'score-select-stories', 'derive-angles', 'build-episode-package', 'build-visual-assets', 'generate-narration', 'compile-render-video', 'qa-review-delivery')");
                    table.ForeignKey(
                        name: "fk_receipt_import_batch",
                        column: x => x.import_batch_id,
                        principalTable: "import_batch",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "reconciliation_event",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    import_batch_id = table.Column<Guid>(type: "uuid", nullable: false),
                    run_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    stage_key = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    locator = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    conflict_type = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    expected_checksum = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    observed_checksum = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    message = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    imported_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_reconciliation_event", x => x.id);
                    table.CheckConstraint("CK_ReconciliationEvent_StageKey", "stage_key IN ('collect-news', 'build-weekly-corpus', 'score-select-stories', 'derive-angles', 'build-episode-package', 'build-visual-assets', 'generate-narration', 'compile-render-video', 'qa-review-delivery')");
                    table.ForeignKey(
                        name: "fk_reconciliation_event_import_batch",
                        column: x => x.import_batch_id,
                        principalTable: "import_batch",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "stage_attempt",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    run_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    import_batch_id = table.Column<Guid>(type: "uuid", nullable: false),
                    stage_key = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    attempt_id = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    started_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true),
                    completed_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: true),
                    imported_at = table.Column<DateTime>(type: "timestamp without time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_stage_attempt", x => x.id);
                    table.CheckConstraint("CK_StageAttempt_StageKey", "stage_key IN ('collect-news', 'build-weekly-corpus', 'score-select-stories', 'derive-angles', 'build-episode-package', 'build-visual-assets', 'generate-narration', 'compile-render-video', 'qa-review-delivery')");
                    table.ForeignKey(
                        name: "fk_stage_attempt_import_batch",
                        column: x => x.import_batch_id,
                        principalTable: "import_batch",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_artifact_import_batch_id",
                table: "artifact",
                column: "import_batch_id");

            migrationBuilder.CreateIndex(
                name: "ix_artifact_run_id",
                table: "artifact",
                column: "run_id");

            migrationBuilder.CreateIndex(
                name: "ux_artifact_source_run_locator_checksum",
                table: "artifact",
                columns: new[] { "source_key", "run_id", "locator", "checksum" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_imported_run_import_batch_id",
                table: "imported_run",
                column: "import_batch_id");

            migrationBuilder.CreateIndex(
                name: "ix_imported_run_source_key",
                table: "imported_run",
                column: "source_key");

            migrationBuilder.CreateIndex(
                name: "IX_receipt_import_batch_id",
                table: "receipt",
                column: "import_batch_id");

            migrationBuilder.CreateIndex(
                name: "ix_receipt_run_id",
                table: "receipt",
                column: "run_id");

            migrationBuilder.CreateIndex(
                name: "ux_receipt_source_run_locator_checksum",
                table: "receipt",
                columns: new[] { "source_key", "run_id", "locator", "checksum" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_reconciliation_event_import_batch_id",
                table: "reconciliation_event",
                column: "import_batch_id");

            migrationBuilder.CreateIndex(
                name: "ix_reconciliation_event_run_id",
                table: "reconciliation_event",
                column: "run_id");

            migrationBuilder.CreateIndex(
                name: "ix_stage_attempt_attempt_id",
                table: "stage_attempt",
                column: "attempt_id");

            migrationBuilder.CreateIndex(
                name: "IX_stage_attempt_import_batch_id",
                table: "stage_attempt",
                column: "import_batch_id");

            migrationBuilder.CreateIndex(
                name: "ix_stage_attempt_run_id",
                table: "stage_attempt",
                column: "run_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "artifact");

            migrationBuilder.DropTable(
                name: "imported_run");

            migrationBuilder.DropTable(
                name: "receipt");

            migrationBuilder.DropTable(
                name: "reconciliation_event");

            migrationBuilder.DropTable(
                name: "stage_attempt");

            migrationBuilder.DropTable(
                name: "import_batch");
        }
    }
}
