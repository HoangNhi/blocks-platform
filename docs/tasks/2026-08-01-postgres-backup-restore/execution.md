# Local PostgreSQL Backup Restore — Execution Evidence

**Date:** 2026-08-01
**Status:** PASS

---

## Task 1: Assemble Backup

| File | Expected Size | Actual Size | Status |
|------|--------------|-------------|--------|
| `pg-restored-all-20260731T095358Z.sql.gz.01.part` | 47,185,920 | 47,185,920 | OK |
| `pg-restored-all-20260731T095358Z.sql.gz.02.part` | 47,185,920 | 47,185,920 | OK |
| `pg-restored-all-20260731T095358Z.sql.gz.03.part` | 17,366,970 | 17,366,970 | OK |
| `pg-restored-all-20260731T095358Z.sql.gz` (combined) | 111,738,810 | 111,738,810 | OK |

Parts joined in numeric order via Python streaming. Combined archive created at `C:\Users\Adonis\Downloads\pg-restored-all-20260731T095358Z.sql.gz`.

## Task 2: Validate Archive

- **Gzip integrity:** PASSED (decompressed size: 924,067,028 bytes, read to EOF without error)
- **SQL payload check:** PASSED (keywords found: CREATE, SET, SELECT, ALTER, COMMENT, --)
- **Resource availability:** Container name `postgres-restore-candidate` unused, volume `postgres_restored_data_20260801` unused, port 5433 freed (native `postgresql-x64-18` service stopped)

## Task 3: Restore Candidate

- **Volume created:** `postgres_restored_data_20260801`
- **Password source:** Read from existing `postgres-container` environment (17 characters, not logged)
- **Container:** `postgres-restore-candidate` started on `127.0.0.1:5433`
- **Image:** `postgres@sha256:78481659c47e862334611ccdaf7c369c986b3046da9857112f3b309114a65fb4`
- **Mount:** Archive mounted read-only at `/backup/restore.sql.gz`; restore wrapper script filtered `DROP ROLE IF EXISTS postgres;` to avoid benign entrypoint failure
- **Volume mount:** `/var/lib/postgresql` (PG 18 layout)
- **Initialization:** Completed in ~20 seconds

## Task 4: Verify Candidate

- **Log check:** PASSED (benign errors only: `role "postgres" already exists`)
- **pg_isready:** `/var/run/postgresql:5432 - accepting connections`
- **SELECT 1:** OK (1 row)
- **Non-template databases:** `ai-video`, `postgres`, `system`, `tradelab`
- **Candidate stopped:** Yes, volume retained
- **Old container/volume:** Still present at verification time

## Task 5: Replace Existing Database

- **Pre-checks:** Candidate stopped, restored volume present, old container exited, old volume present
- **Password:** Re-read from candidate container (17 characters, not logged)
- **Old container `postgres-container`:** Removed
- **Old volume `postgres_data`:** Removed
- **New container `postgres-container`:** Started on `127.0.0.1:5432` with volume `postgres_restored_data_20260801`

## Task 6: Verify Final State

- **pg_isready:** PASSED (0s)
- **SELECT 1:** OK (1 row)
- **Non-template databases:** `ai-video`, `postgres`, `system`, `tradelab`
- **Container name:** `/postgres-container`
- **State:** running
- **Port binding:** `5432/tcp=127.0.0.1:5432`
- **Volume:** `postgres_restored_data_20260801:/var/lib/postgresql`
- **Candidate `postgres-restore-candidate`:** Removed after final checks
- **Archive files:** All 3 parts + combined archive verified with exact sizes

## Resources Summary

| Resource | Action | Final State |
|----------|--------|-------------|
| `postgres_restored_data_20260801` | Created | Active volume for `postgres-container` |
| `postgres_data` | Removed | Absent |
| `postgres-container` | Replaced | Running on port 5432 |
| `postgres-restore-candidate` | Created then removed | Absent |
| Combined archive (111,738,810 bytes) | Created | Present in Downloads |
| 3 part files | Preserved | Present in Downloads |
