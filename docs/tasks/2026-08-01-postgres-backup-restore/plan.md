# Local PostgreSQL Backup Restore Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reassemble three PostgreSQL backup parts, validate and restore them into Docker, then replace existing local database only after candidate verification passes.

**Architecture:** Use Python 3.14 standard-library streaming for byte-safe concatenation and gzip checking. Restore through official PostgreSQL 18 entrypoint into new candidate volume, verify on port `5433`, then attach verified volume to `postgres-container` on port `5432`. Preserve old container and volume until candidate passes every gate.

**Tech Stack:** PowerShell, Python 3.14 standard library, Docker Engine 29.4.1, PostgreSQL 18 container image

---

## Resource Map

- Create: `C:\Users\Adonis\Downloads\pg-restored-all-20260731T095358Z.sql.gz` — combined backup archive.
- Create: Docker volume `postgres_restored_data_20260801` — restored PostgreSQL data.
- Create then remove: Docker container `postgres-restore-candidate` — isolated restore container on port `5433`.
- Replace: Docker container `postgres-container` — final container on port `5432`.
- Remove after candidate verification: Docker volume `postgres_data` — old database data.
- Create during execution: `docs/tasks/2026-08-01-postgres-backup-restore/execution.md` — redacted evidence.

No Git commits: current repository checkout has no `.git` directory. Never write credential values into task documents or retained evidence.

### Task 1: Assemble Backup

**Files:** Create combined archive in Downloads; preserve three `.part` files.

- [ ] Verify part sizes: `47185920`, `47185920`, `17366970` bytes.
- [ ] Refuse work if combined or temporary output exists.
- [ ] Join parts in numeric order through temporary output.
- [ ] Assert combined size is `111738810` bytes.

Expected: combined archive exists; source parts unchanged.

### Task 2: Validate Archive

- [ ] Use Python `gzip` standard library to read entire archive to EOF.
- [ ] Reject CRC, truncation, empty output, or non-SQL payload.
- [ ] Confirm `postgres-restore-candidate`, `postgres_restored_data_20260801`, and port `5433` are unused.

Expected: gzip validation passes before any Docker volume is created.

### Task 3: Restore Candidate

- [ ] Create Docker volume `postgres_restored_data_20260801`.
- [ ] Read existing password from `postgres-container` into process memory only.
- [ ] Start `postgres-restore-candidate` on `127.0.0.1:5433`.
- [ ] Mount combined archive read-only as `/docker-entrypoint-initdb.d/restore.sql.gz`.
- [ ] Pin image digest `sha256:78481659c47e862334611ccdaf7c369c986b3046da9857112f3b309114a65fb4`.
- [ ] Wait up to 30 minutes for initialization completion.

Expected: candidate remains running and logs show initialization complete.

### Task 4: Verify Candidate

- [ ] Reject PostgreSQL `ERROR` or `PANIC` log entries.
- [ ] Run `pg_isready` as user `postgres`.
- [ ] Run `SELECT 1;` with `ON_ERROR_STOP` enabled.
- [ ] List non-template databases from `pg_database`.
- [ ] Stop candidate while retaining restored volume.

Expected: all checks pass; old container and volume still exist.

### Task 5: Replace Existing Database

- [ ] Reconfirm stopped candidate, restored volume, old container, and old volume.
- [ ] Read password from candidate into process memory only.
- [ ] Remove old `postgres-container`.
- [ ] Remove old `postgres_data` only after prior checks pass.
- [ ] Start new `postgres-container` on host port `5432` using restored volume.
- [ ] Keep stopped candidate until final container passes verification.

Expected: final container starts from verified data without rerunning import.

### Task 6: Verify Final State

- [ ] Wait up to five minutes for final `pg_isready` success.
- [ ] Run final `SELECT 1;` and list non-template databases.
- [ ] Confirm container name `postgres-container`, running state, port `5432`, and volume `postgres_restored_data_20260801`.
- [ ] Remove stopped `postgres-restore-candidate` only after final checks pass.
- [ ] Confirm three parts and combined archive still exist with exact sizes.

Expected: restored PostgreSQL runs on port `5432`; old volume and candidate are absent.

### Task 7: Record Evidence

**Files:** Create `docs/tasks/2026-08-01-postgres-backup-restore/execution.md`.

- [ ] Record date, archive sizes, resource names, database names, command outcomes, and final `PASS` or exact `BLOCKED` reason.
- [ ] Exclude password and full Docker environment output.
- [ ] Scan evidence with `rtk rg` for `POSTGRES_PASSWORD=`, known password text, `TBD`, `TODO`, `FIXME`, and `PLACEHOLDER`.

Expected: evidence contains no secrets or unresolved placeholders.
