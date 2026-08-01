---
status: awaiting-user-review
owner: Adonis
last_reviewed: 2026-08-01
scope: local-postgres-backup-restore
---

# Local PostgreSQL Backup Restore Specification

## Goal

Reassemble three Telegram-sized PostgreSQL backup parts into one gzip archive, validate it, restore it through Docker, and replace the existing local `postgres-container` database only after the restored candidate passes verification.

## Inputs

- `C:\Users\Adonis\Downloads\pg-restored-all-20260731T095358Z.sql.gz.01.part`
- `C:\Users\Adonis\Downloads\pg-restored-all-20260731T095358Z.sql.gz.02.part`
- `C:\Users\Adonis\Downloads\pg-restored-all-20260731T095358Z.sql.gz.03.part`

Part order is numeric: `01`, `02`, `03`.

Expected combined file:

- Path: `C:\Users\Adonis\Downloads\pg-restored-all-20260731T095358Z.sql.gz`
- Size: `111738810` bytes
- Format: gzip-compressed SQL; first bytes already match gzip signature `1F8B`.

## Existing Docker State

- Container: `postgres-container`
- Image: `postgres:latest`
- Resolved PostgreSQL major version: `18`
- Host port: `5432`
- Existing volume: `postgres_data`
- Existing container is stopped.

Existing credential values remain unchanged and must not be written into repository documentation or command output retained as evidence.

## Restore Design

1. Concatenate the three parts into the expected combined file without modifying or deleting source parts.
2. Verify exact combined size and fully decompress the gzip stream as an integrity test.
3. Create a temporary Docker volume and temporary PostgreSQL 18 container using a non-conflicting host port, `5433`.
4. Mount the validated gzip SQL archive read-only into PostgreSQL initialization input and allow the official entrypoint to restore it into the temporary volume.
5. Verify initialization completed without SQL errors, PostgreSQL is ready, databases can be listed, and a basic SQL query succeeds.
6. Stop the temporary container after successful verification.
7. Remove the old `postgres-container` and old `postgres_data` volume.
8. Create `postgres-container` on host port `5432` using the verified restored volume and existing local credential configuration.
9. Verify final readiness, database listing, and basic SQL query on port `5432`.
10. Remove temporary container artifacts that are no longer needed. Keep the restored volume, combined archive, and all three source parts.

## Safety Rules

> [!danger] Destructive boundary
> Do not remove `postgres-container` or `postgres_data` until candidate restore and verification pass.

- Stop immediately if part names, order, or total byte count differ from specification.
- Stop immediately if gzip integrity validation fails.
- Stop immediately if restore logs contain SQL import errors or PostgreSQL never becomes ready.
- Preserve existing container and volume after any candidate failure.
- Do not print, persist, or change PostgreSQL credentials.
- Do not delete any backup file.
- Do not alter unrelated Docker containers, images, networks, or volumes.

## Failure Recovery

- Before destructive boundary: remove failed temporary container and temporary volume only; existing database remains untouched.
- After destructive boundary: final container uses already-verified restored volume, so no second import is required.
- If final port binding fails, leave restored volume intact, inspect port `5432`, and retry container creation without changing database data.

## Acceptance Criteria

- One combined `.sql.gz` file exists with size `111738810` bytes.
- Combined archive passes full gzip integrity validation.
- Candidate PostgreSQL container reports ready.
- Restore completes without SQL errors.
- Database listing and `SELECT 1;` succeed in candidate container.
- Final container is named `postgres-container` and exposes PostgreSQL on host port `5432`.
- Database listing and `SELECT 1;` succeed in final container.
- Old `postgres_data` is removed only after candidate verification.
- Original three parts and combined archive remain in Downloads.

## Out of Scope

- Changing PostgreSQL credentials.
- Editing application connection strings.
- Upgrading or transforming database schema.
- Deleting backup archives after restore.
- Modifying Blocks source code.
