# FileService private-storage cutover

## Scope and safety

This runbook accompanies
`docs/superpowers/specs/2026-10-22-fileservice-storage-hardening-design.md`
and its implementation plan. It is not permission to change production data.
Obtain separate approval for inventory access, backups, file copies, configuration
changes, downtime, rollback, and any deletion. No automatic migration or purge
ships with this change.

Keep writes disabled until every mandatory gate has evidence. A successful
build, local HTTP test, or migration fixture does not prove deployment network
isolation, object authorization, backup recovery, or correct production data.

Supported deployment: one FileService writer and one private persistent volume.
Do not run a rolling deployment with two writers sharing that volume.
Do not restore watermarking, Office conversion, SAR embeds, or static downloads.

## 1. Inventory and approval

- [ ] Name deployment owner, maintenance window, approver, rollback owner,
  application versions, and evidence location.
- [ ] Inventory every application DB field and external consumer storing file
  keys. Include User avatar references and consumers outside this repository.
  Use approved read-only queries; do not print credentials or personal data.
- [ ] Inventory old volume paths, logical keys, lengths, and SHA256 checksums.
  Classify active attachments, avatars, Temp, Deleted, PDF caches, unknown
  files, symlinks, duplicate keys, and invalid legacy names separately.
- [ ] Resolve invalid keys and unsupported avatars explicitly. Do not silently
  discard an SVG, arbitrary old name, or malformed image to make cutover pass.
- [ ] Inventory all Gateway routes, clusters, destinations, DNS aliases,
  transforms, reload sources, public origins, static mounts, ingress rules,
  CDNs and cached copies. Track consumers needing the new AvatarAction contract.
- [ ] Obtain approval for exact source/destination inventory and mapping before
  any write. Stop on unmapped keys, unresolved consumers, or checksum conflicts.

## 2. Mapping

Configure `FileStorage:RootPath` as an absolute private-volume path through
deployment configuration. Do not put secrets or machine-specific values in Git.
Root must not equal, contain, or live under web root. It and every accessed
ancestor must not be a symlink/junction/reparse point.

| Inventory class | New location | Logical key and access |
| --- | --- | --- |
| Registered System attachment | `Files/System/Attachments/<related-guid>/<file-guid>.<ext>` | `System/Attachments/<related-guid>/<file-guid>.<ext>`; backend-authorized RPC only |
| Accepted raster avatar | `Avatars/<file-guid>.<png|jpg|jpeg|webp>` | `System/Avatar/<file-guid>.<ext>`; JWT-required avatar HTTP |
| Old Temp without verified owner | `LegacyQuarantine/<approved-inventory-id>/...` | No active upload session; require new upload |
| Old Deleted, PDF cache, unknown files | `LegacyQuarantine/<approved-inventory-id>/...` | No public/active reader, no purge |
| Newly deleted active file | `Deleted/<deletion-id>/...`, plus receipt | Service-managed only; do not fabricate receipts for old files |

Only namespaces registered in the current server resolver can become active.
Do not infer owner from folder name, URL, username, or an uploaded file's name.
Logical keys stay relative and host-independent. Normalize verified inventory
under an approved mapping; do not add a generic legacy-path fallback.
Record every renamed key and any separately approved DB update.

## 3. Backup and freeze

- [ ] Back up all affected DBs and file volumes with matching inventory/version.
  Keep backups outside web root and outside static mounts.
- [ ] Restore a sample into an isolated location; compare lengths/checksums
  and sample DB references. Record successful recovery before proceeding.
- [ ] Disable uploads, user/profile saves, finalization, deletes and external
  writers. Drain in-flight requests before making a consistent inventory.
- [ ] Block legacy static URLs at every origin/proxy, including direct
  FileService ports and old versions kept for rollback.
- [ ] Invalidate private-file caches where applicable. Previously downloaded
  bytes cannot be revoked by moving storage.

## 4. Copy and reconcile

- [ ] Copy rather than remove the approved source inventory. Enforce destination
  containment, reject links/reparse points, avoid overwrite, and preserve source
  backup. Do not follow user-provided paths.
- [ ] Compare length and SHA256 for every copied item and active DB key.
  A mismatch, absent target, collision, unsupported key or missing reference
  blocks cutover; do not open writes for a partial copy.
- [ ] Quarantine historical Temp/Deleted/cache/unknown items without exposing
  them or guessing manifest ownership. Do not purge historical data.
- [ ] Verify OS ACLs permit only the service account and approved administrators.
  Configure volume quota, disk alerts and a documented manual orphan review.
  Volume quota is not per-user abuse protection.
- [ ] Record source, destination, hash, key mapping, quarantine reason and
  verification result in a restricted inventory artifact, not application logs.

## 5. Publish and network gates

- [ ] Build/publish FileService, SystemService, Gateway and frontend together.
  Do not deploy intermediate task commits independently.
- [ ] Inspect actual publish and final image: no historical `wwwroot` uploads,
  removed watermark/Office assemblies, fonts, or PDF cache. A `.csproj` check
  alone is insufficient. Keep rollback artifacts non-public.
- [ ] Verify `FileStorage:RootPath` points to the new private volume, not an
  ephemeral container directory. Start one writer only.
- [ ] Set `FileProxy:ClusterId` to the actual selected FileService cluster ID.
  Inventory all equivalent DNS/destination aliases, including other cluster IDs;
  code cannot recognize arbitrary aliases by cluster name alone.
  Missing/blank configuration denies every request reaching the proxy pipeline,
  including other services. This is deliberate fail-closed behavior, not a
  fallback to a guessed cluster name. Real CORS preflight is handled by
  `UseCors`; ordinary OPTIONS requests do not bypass the boundary.
- [ ] Permit only POST `/File/api/UploadFile`, POST
  `/File/api/UploadFile/embed` (retired, application status 410), and GET
  `/File/api/Avatar/<uuid.ext>` to FileService through Gateway.
  Permit only the registered `/File` prefix-removal transform for these routes.
  No route/method/content-type transform may expose RPC through an allowed URL.
- [ ] From the user network, verify native gRPC and gRPC-Web are blocked for
  `/file.FileProto/*`, prefixed routes and aliases even with valid JWT.
  Read both transport status and application envelope.
- [ ] Firewall direct FileService ports from user/Internet networks. Permit RPC
  only from authorized backends on the private network. Header names and CORS
  are not service identity or firewall evidence.
- [ ] Keep route/destination inventory under change control after cutover.
  Test configuration reloads; an unguarded alias introduced later is a new
  exposure, not covered by the original test.

## 6. Acceptance before opening writes

Run repository commands recorded in AGENTS.md and record PASS/FAIL/NOT RUN with
OS, version, command, time and artifact path. Never record a missing prerequisite
as PASS.

- [ ] Windows and Linux real filesystem/path/symlink checks pass. Missing link
  permissions must be visible, not silently accepted.
- [ ] HTTP checks prove old active/Temp/Deleted/cache URLs are inaccessible both
  anonymously and with JWT; sentinel files must exist for those tests.
- [ ] Avatar checks cover anonymous/invalid/expired JWT, valid raster bytes,
  `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, no path escape.
- [ ] Upload checks cover same alias across actors, failed replacement,
  cancellation/disk failure, restart, concurrent finalization and stable retry.
- [ ] End-to-end login, user create/update, avatar keep/replace/remove, failed DB
  save/retry and logout work through frontend/Gateway/SystemService/FileService.
  Old avatars remain until approved offline reconciliation.
- [ ] Prove real domain authorization denies unauthorized read/delete before
  RPC; no always-allow ACL stub. Missing BusinessService means its flows remain
  unavailable, not authorized by this hardening.
- [ ] Isolated DB tests only: localhost database
  `blocks_systemservice_cleanup_test`, random test schema, confirmed connection.
  Never use application DB credentials as a convenience.
- [ ] Confirm external clients send AvatarAction for replace/remove. Old clients
  omitting it now mean keep. Upload acknowledgement has no attachment Data.
- [ ] Confirm static download/video and SAR image embed are retired explicitly.
  Existing authorized previews use IDs; no raw-key URL fallback.
- [ ] Inspect current NuGet vulnerability graph and final image/base OS
  advisories separately. Do not suppress audit or infer image safety from NuGet.
- [ ] Deployment owner signs off network, backup/restore, mapping and mandatory
  checks before opening writes.

## 7. Avatar and orphan reconciliation

Run only with writes and finalization paused and separately approved data access.
Compare the complete inventory of User DB keys and every other confirmed consumer
against private storage. Export candidate unreferenced keys with reason and hash
for approval before any soft-delete or purge.

Do not delete based solely on cleanup logs, file age, a single DB query, a failed
save, or a finalized upload receipt. A crash after commit may lose cleanup logs;
concurrent/retried saves may reuse candidates. If reference status is uncertain,
keep the file. This release intentionally retains old/orphan avatars until
reconciliation and does not immediately revoke old avatar URLs.

## 8. Rollback

- [ ] Re-enter maintenance and drain writers; preserve new DB/volume state.
- [ ] Inventory writes since cutover and reconcile their keys with both DB and
  old/new layouts before changing versions.
- [ ] Restore only an approved consistent DB/volume pair or keep maintenance
  until reconciliation succeeds. Do not point legacy code at the new layout.
- [ ] Preserve network and static-file blocks throughout rollback. Never restore
  public static access as a compatibility fix.
- [ ] Re-run integrity/auth/network checks before reopening writes; retain
  evidence and both backups until approved retention ends.

## Repository verification record

Implementation-session results belong here with exact commands and limitations.
Deployment inventory, real copy, restore, firewall, quotas, external consumers,
and production smoke are **NOT RUN** until separately approved and evidenced.

### 2026-10-22 in-progress evidence

| Check | Result | Limits |
| --- | --- | --- |
| `dotnet list src/services/Blocks.FileService/Blocks.FileService.csproj package --vulnerable --include-transitive --no-restore` | PASS: no vulnerable package reported with current sources | Not a base-image or OS advisory scan |
| `dotnet test/SystemService.CleanupChecks/bin/Debug/net10.0/SystemService.CleanupChecks.dll auth` | 37 PASS, 2 NOT RUN | Fresh disposable PostgreSQL 17 fixture, random schema; file client fake proves orchestration, not full cross-service E2E |
| `grpc_permission_valid_allow` / `grpc_permission_valid_deny` in auth fixture | NOT RUN | Missing real permission function/operator fixture; must not substitute always-allow ACL |
| `npm --prefix src/apps/Blocks.Web test` | PASS: 66 files, 315 tests | Local behavior tests, not a real cross-service browser E2E |
| `npm --prefix src/apps/Blocks.Web run build` | PASS | Existing bundle-size/dynamic-import warnings remain; no dependency or bundle refactor |
| `npm --prefix src/apps/Blocks.Web run lint` | PASS exit 0: 0 errors, 17 warnings | Warnings remain visible; no blanket suppression or unrelated cleanup |

The DB fixture used loopback-only ephemeral port and tmpfs, not an application
database. Its schema and container were removed after the run. Code changes
after this evidence require covering checks again.

### 2026-10-23 completion evidence

| Check | Result | Limits |
| --- | --- | --- |
| `dotnet run --project test/FileService.RemovalChecks` (Windows) | 67 PASS, 0 FAIL, 3 NOT RUN | Windows symlink privilege absent; not silently counted as PASS |
| Release harness on Linux .NET 10 container, full suite | 70 PASS, 0 FAIL, 0 NOT RUN | Real filesystem links, native HTTP/2, gRPC-Web and YARP reload; isolated network namespace, tmpfs fixtures, readonly build-output mount |
| `npm --prefix src/apps/Blocks.Web test` | 66 suites, 316 tests PASS after final fix | Test-output act/aria warnings remain; no real browser multi-service E2E |
| `npm --prefix src/apps/Blocks.Web run build` | PASS | Bundle-size/dynamic-import warnings remain |
| `npm --prefix src/apps/Blocks.Web run lint` | Exit 0, 0 errors, 17 warnings | No blanket warning suppression |
| `dotnet build src/services/Blocks.SystemService/Blocks.SystemService.csproj --nologo` | PASS: 0 errors, 26 warnings on this rebuild | Existing nullable/obsolete warnings remain visible |
| `dotnet run --project test/SystemService.CleanupChecks -- contract` | PASS | No database connection |
| `dotnet run --project test/SystemService.CleanupChecks -- runtime` | PASS | Real local HTTP/gRPC startup, not application DB or deployment network |
| `& ./test/SystemService.BusinessDependency.Check.ps1` | PASS | Source-level dependency check only |
| `dotnet build src/services/Blocks.ApiGateway/Blocks.ApiGateway.csproj --nologo` | PASS: 0 errors, 0 warnings on incremental build | Not a firewall check |
| `dotnet publish src/services/Blocks.FileService/Blocks.FileService.csproj -c Release -o src/services/Blocks.FileService/bin/hardening-check-publish --nologo` | PASS; inspected output excludes `wwwroot`, retired libraries and fonts | Production target upgraded to .NET 10 (`net10.0`) in platform package upgrade |
| `docker build --target final -t blocks-fileservice-hardening-check:local -f src/services/Blocks.FileService/Dockerfile .` | PASS; inspected final image excludes historical uploads and retired assets | Not an OS vulnerability scan |
| Build-stage image inspection | PASS; excludes frontend, CatalogService, `.codex`, old uploads and fonts | Dockerfile-specific ignore rules, not deletion of source data |
| Isolated production-image smoke | PASS: anonymous application 401, JWT PNG bytes, no-store/nosniff | Random token/PNG, disposable loopback container, private tmpfs; no application storage |
| `dotnet list src/services/Blocks.FileService/Blocks.FileService.csproj package --vulnerable --include-transitive --no-restore` | PASS: no vulnerable package reported with current sources | OS/base-image advisories remain NOT RUN |

Linux used the complete Release build directory, not harness `dotnet publish`:
publishing the multi-web-project harness encounters duplicate referenced
appsettings/tool-manifest output (`NETSDK1152`). Production FileService publish
passed independently; no duplicate-output validation was disabled.

Reproduction for Linux checks, after building the harness in Release:

```powershell
$output = (Resolve-Path test/FileService.RemovalChecks/bin/Release/net10.0).Path
docker run --rm --network none --read-only --tmpfs /tmp --workdir /tmp -e HOME=/tmp `
  --mount "type=bind,source=$output,target=/checks,readonly" `
  --entrypoint dotnet mcr.microsoft.com/dotnet/aspnet:10.0 `
  /checks/FileService.RemovalChecks.dll
```

The recorded run used a cached local .NET 10 runtime image
`blocks-systemservice-security-check:local`; pull the official runtime separately
if no equivalent image is available. This command operates on fixture data only.

Logs, task briefs and independent review reports are retained locally under
`.superpowers/sdd/2026-10-22-fileservice-storage-hardening/` (ignored by Git).
They contain fixture evidence, not deployment authorization. Keep this evidence
while inspecting the agent workflow; do not infer production readiness from it.

## Agent execution record

The user requested native agent execution with visible delegation. Agents used
fresh contexts and inherited the configured model/provider. No worker could
delegate again, commit, change the Git index, or operate on application data.

| Agent | Assigned responsibility | Write boundary |
| --- | --- | --- |
| Galileo | Complete authenticated avatar blobs and save callers | Avatar hook, API/interceptor, components, adjacent tests |
| Pauli | Retire static readers and SAR image embeds | Upload-file, viewer, SAR editor and their tests |
| Harvey | Audit backend, then add genuine transport and reload checks | Gateway boundary and `FileBoundaryChecks.cs` only in implementation phase |
| Leibniz | Repair backend audit findings with regression checks | FileService storage, upload service, gRPC error mapping if needed, harness `Program.cs` |
| Russell | Independently review avatar implementation and scoped fixes | Read-only review |
| Confucius | Independently review retired readers and scoped fixes | Read-only review |
| Rawls | Continue boundary implementation after runtime recovery, then fix review findings | Gateway boundary and `FileBoundaryChecks.cs` only; isolated MSBuild outputs |
| Ptolemy | Review boundary implementation and scoped fixes | Read-only review |
| Linnaeus | Review storage/session/lifecycle repairs | Read-only review |
| Helmholtz | Final review across FileService, Gateway, SystemService, frontend and rollout evidence | Read-only whole-change review |
| Boole | One final-review fix wave: avatar-only JSON envelope handling | Frontend API/interceptor and their two adjacent test files |

Ready, non-overlapping implementation ran concurrently. Boundary tests used
isolated MSBuild artifacts while storage tests owned default outputs. The main
session owned migration fixtures, documentation, shared scheduling, integration
checks and scoped commits. A fresh spawn hit the runtime thread limit; completed
auditor Harvey was reused rather than changing model/provider or retrying the
same failing request. Completed implementers closed after review.
Leibniz later stopped with provider `503 Service Unavailable`; the main session
preserved partial edits and completed the storage repairs without changing
provider. After runtime recovery, Rawls received a fresh, narrow boundary brief.
No failed request was repeated under a different model alias.

Source decisions: continue the existing feature checkout to preserve partial
user work; keep external rollout/data gates explicitly NOT RUN; do not restore
missing BusinessService or static fallback for unavailable business previews.
If these assumptions change, re-evaluate writer isolation and consumer cutover
before deployment, not by adding a permissive read path.

### Dispatch pattern

Native `multi_agent_v1.spawn_agent` creates each independent worker/reviewer with
`fork_context: false`. The brief names its task, required interfaces, allowed
files, prohibited operations, check commands and report path. Model/provider
inherit from the parent; there is no override or recursive delegation.
For example, the final reviewer dispatch had this shape (message shortened):

```json
{
  "fork_context": false,
  "message": "Review review-whole-change.diff against approved spec. Read-only, no subagents or rerunning recorded suites. Write review-whole-change-result.md."
}
```

The actual dispatch returned Helmholtz,
`01a1667b-0c22-7483-859d-d6e56f52ca8d`. Its snapshot package excludes concurrent
Catalog/AGENTS changes. `send_input` resumes an existing owner for scoped fixes;
it does not create a duplicate implementer. The boundary fix resumed Rawls,
`01a1664e-cf8e-76d0-ae49-7c554a78dc41`; Ptolemy independently checked the resulting
fix diff. Integration waits for evidence and review, not merely a worker's
completion message.

### Final-review dispositions

The whole-change review found no Critical issue. Its generic JSON-blob concern
was corrected with explicit `unwrapBlobErrors` avatar-only opt-in so a real
downloaded JSON document cannot be mistaken for an API error based on its
contents. A genuine RED reproduced the 401-shaped document failure; GREEN
preserves both 401/403-shaped documents while avatar soft-401/403 and abort
behavior remain covered. Final integrated frontend tests: 66 suites/316 PASS;
build PASS, lint 0 errors/17 warnings.
The final scoped re-review passed spec and quality with no new breakage.
Implementation commits in this continuation: `3523c61`, `ec72a49`, `b2777b7`,
`192d7a5`. The documentation commit records this verification, not permission
to deploy.
Blank `FileProxy:ClusterId` deliberately denies all proxy traffic; fail-fast
startup validation or a dedicated unhealthy-readiness signal remains a later
operational improvement, not an excuse to forward an unknown renamed cluster.
The deployment configuration gate remains mandatory.

Minor follow-ups are deferred: resolver allocation overhead, warning logs for
failed orphan cleanup, replacing avatar selection's browser alert, and stricter
SystemService GUID length validation. Keep ancestor/root link checks and primary
failure preservation; never add raw filesystem paths to cleanup logs.
FileService still rejects invalid aliases before mutation. No data loss or
authorization requirement is deferred by these minor follow-ups.
