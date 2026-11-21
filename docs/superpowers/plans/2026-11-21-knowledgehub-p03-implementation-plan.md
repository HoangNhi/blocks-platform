# KnowledgeHub P03: File Lifecycle And Document Repository - Implementation Plan

Date: 2026-11-21  
Status: PROPOSED - owner execution plan; review before starting  
Branch: feature/knowledgehub-learning  
Planning baseline: c99c8f389d89832c5d282638eb6dabf4c7740e6d  
Accepted specification: docs/superpowers/specs/2026-11-21-knowledgehub-p03-file-lifecycle-document-repository-design.md  
P02 UI guide: docs/superpowers/plans/2026-11-15-knowledgehub-p02-frontend-ui-implementation-guide.md  
Repository rules: AGENTS.md

## 0. Manual learning and safety contract

The owner writes and runs all production C#, Python, SQL, TypeScript/React, and tests. This plan explains what to learn, which files to create or edit, the exact responsibility of each edit, and how to verify the result. It is not permission for an agent to implement product code.

This plan authorizes none of the following:

- Applying SQL or changing database roles/grants.
- Creating a test database or schema.
- Changing SystemService menus or permissions.
- Installing or upgrading dependencies.
- Starting services, deploying, changing network exposure, or moving/purging real files.
- Marking live integration or visual acceptance PASS without owner-run evidence.

P00 explicitly rejects a separate KnowledgeHub test database. Keep DB-free unit, HTTP-contract, mocked-RPC, SQL-compilation, and React tests. Live database and cross-service checks remain NOT RUN until the owner separately authorizes a safe, disposable manual test.

The P03 specification is ACCEPTED by the owner. Product-code implementation remains owner-performed under the project learning workflow.

## 1. Outcome

Deliver a real document repository in the existing Blocks KnowledgeHub feature:

1. An authenticated user with KnowledgeHub ADD can stage one PDF, Markdown, or TXT file.
2. FileService checks KnowledgeHub ADD before MVC parses the multipart body and before FileService writes to managed Temp storage.
3. FileService finalizes the original under its private KnowledgeHub namespace and returns a trusted file ID, key, size, and SHA256.
4. KnowledgeHub registers the trusted reference against a document row in PostgreSQL.
5. The owner can list, search by metadata, filter, paginate, download, and logically delete their active documents.
6. A deleted collection retains its document rows and original files. P06, not P03, hard-deletes its vectors.
7. The UI uses the approved Stitch hierarchy and existing shadcn/Radix primitives. It shows real data and honest states, never fabricated documents or processing progress.

## 2. Why this plan is split into three workstreams

P03 spans three independently testable codebases. Keeping one giant task list would make the owner switch between .NET, Python/SQL, and React in every task. The three detailed plans each produce a testable subsystem, then the master plan coordinates integration.

| Workstream | Detailed plan | Independent result |
| --- | --- | --- |
| A. FileService storage and upload authorization | docs/superpowers/plans/2026-11-21-knowledgehub-p03a-fileservice-implementation-plan.md | FileService safely stages/finalizes/deletes KnowledgeHub documents; permission and regression harness passes. |
| B. KnowledgeHub database and backend API | docs/superpowers/plans/2026-11-21-knowledgehub-p03b-backend-implementation-plan.md | DB-free tested document lifecycle/API using a mocked FileService client; SQL reviewed but not applied without authorization. |
| C. React document repository | docs/superpowers/plans/2026-11-21-knowledgehub-p03c-frontend-implementation-plan.md | React feature works against mocked API contracts and preserves the approved layout. |

Do not run these as parallel edits. Workstream A and B both touch AppHost, and B must consume the FileService contract produced by A. C consumes the API contract from B.

## 3. Before the first edit

### 3.1. Read the project-specific sources

Read these in order:

1. AGENTS.md - especially backend, database-first, frontend, testing, and data/secrets rules.
2. Accepted P03 specification - source of truth for lifecycle and security.
3. docs/superpowers/specs/2026-10-27-knowledgehub-master-design.md.
4. P00 integration contracts and P01 runtime/identity specifications.
5. P02 specification and docs/knowledgehub/outcomes/P02.md.
6. docs/superpowers/plans/2026-11-15-knowledgehub-p02-frontend-ui-implementation-guide.md.
7. docs/superpowers/plans/2026-10-22-fileservice-storage-hardening.md and its design specification.
8. docs/knowledgehub/references/stitch_blocks_interface/screen.png, code.html, and DESIGN.md. The screenshot is the visual baseline; code.html is only a prototype reference.

### 3.2. Record the actual checkout before editing

Run from repository root in PowerShell:

~~~powershell
git status --short
git branch --show-current
git rev-parse HEAD
~~~

Expected branch: feature/knowledgehub-learning. Record pre-existing changes and untracked files. Do not discard, stage, or include unrelated changes. The plan's planning baseline is not a substitute for the owner's current HEAD.

### 3.3. Confirm the current source still matches the plan

Inspect the actual versions of the files listed in the three subplans. In particular, recheck:

- FileService's Insert, UploadDataAsync, DeleteDataAsync, PreviewFileAsync, UploadSessionStore, FileStorage, and FileGrpcService.
- SystemService's SystemProto.CheckPermission and JWT validation.
- KnowledgeHub's Settings, lifespan, PermissionClient, models, schemas, collections, and tests.
- AppHost's FileService/SystemService/KnowledgeHub references.
- React's RepositoryFrame, KnowledgeHubPage, API client, query keys, and existing UI primitives.

If a file has changed since planning, update the task before editing. Do not force an old patch onto a changed branch.

## 4. Confirmed implementation decisions

- Collection soft-delete retains document rows and original files. It never calls FileService DeleteData.
- P06 hard-deletes all vectors belonging to a soft-deleted collection and fences in-flight work.
- P04 owns durable worker identity/delegation and retry/reconciliation ownership for stale Temp and pending cleanup.
- FileService is the sole owner of original bytes.
- Namespace: KnowledgeHub/Documents/{documentId}/{fileId}.{extension}.
- Stage marker is the HTTP header X-Upload-Purpose: KnowledgeHubDocument, not a multipart field.
- FileService calls SystemProto.CheckPermission with JWT-derived actor, controller knowledgehub, action ADD=2 before MVC multipart model binding.
- Permission denial or SystemService outage fails closed. No Temp batch/manifest is created.
- Legacy uploads with no purpose header keep their existing behavior. Unknown non-empty purpose values fail closed.
- One file per upload session and one upload session per document.
- File size remains at most 50 MiB. The multipart/request envelope may be 51 MiB to allow framing; actual bytes remain capped at 50 MiB.
- KnowledgeHub accepts only .pdf, .md, .txt. Do not globally broaden unrelated legacy upload types.
- FileService uses its existing private Temp/Files/Deleted areas, manifest, SHA256, finalize, and deletion receipt.
- Add protobuf field source_sha256 = 9; never renumber fields 1-8.
- KnowledgeHub uses private TLS gRPC to FileService. Browser traffic goes only through Gateway.
- Use bounded unary PreviewFile for P03 MVP, with Python receive limit >=64 MiB and one concurrent download per API process initially.
- Database-first: owner-authored SQL, Git review, explicit authorization, authorized application, then SQLAlchemy mapping.
- No Alembic bootstrap, create_all(), startup DDL, separate test DB, or schema test.
- No new shadcn install/overwrite. Reuse checked-in Radix-based primitives.

## 5. Execution order and stop gates

Execution is sequential: preflight -> FileService -> SQL draft/review -> KnowledgeHub backend -> React -> integrated acceptance. The dependency gates below define when the next workstream may start.

| Order | Task group | Depends on | Stop condition |
| --- | --- | --- | --- |
| 0 | Owner preflight and source recheck | None | Stop if branch or local changes are not understood. |
| A | FileService namespace, ADD authorization, finalize metadata, tests | 0 | Do not start B's real FileService client until the new FileService wire contract builds and its DB-free harness passes. |
| B1 | Documents SQL draft and review | A contract understood; no SQL application | Stop after review. Applying SQL requires separate explicit authorization. |
| B2 | Python models, gRPC client, document services/routes, tests | B1 mapping gate; A contract | Without authorized schema application, keep model/query work DB-free and mark live persistence NOT RUN. |
| B3 | KnowledgeHub AppHost reference and runtime config | A and B2 | Verify endpoint/certificate configuration without exposing secrets. |
| C | React types/API/hooks/components/tests | B API contract | Use mocked API until owner-authorized Gateway integration. |
| I | Integrated acceptance and visual review | A+B+C | Report PASS/FAIL/NOT RUN per criterion; do not infer live acceptance from mocks. |

## 6. Cross-workstream file ownership

Some files are touched by more than one plan. Apply those edits in this order:

| Shared file | First edit | Later edit | Rule |
| --- | --- | --- | --- |
| src/platform/Blocks.AppHost/AppHost.cs | A: configure FileService -> SystemService HTTPS client endpoint. | B: add KnowledgeHub -> FileService endpoint and CA settings. | One owner edit at a time; inspect diff before B changes the same file. |
| FileService protobuf contract | A: add source_sha256 field 9. | B: regenerate Python stubs from the updated source proto. | B must not copy or hand-edit generated message descriptors. |
| docs/knowledgehub/outcomes/P03.md | Only after all acceptance is actually reviewed. | Same. | Do not create an outcome early or mark unrun checks PASS. |

## 7. Workstream A - FileService

Follow the detailed task sequence in:

docs/superpowers/plans/2026-11-21-knowledgehub-p03a-fileservice-implementation-plan.md

The main files are:

| Action | File | Required change |
| --- | --- | --- |
| Modify | src/services/Blocks.FileService/Blocks.FileService.csproj | Generate SystemProto client from the existing SystemService system.proto. |
| Modify | src/services/Blocks.FileService/Configs/ConfigService.cs | Register SystemProto client using existing gRPC-Web client pattern. |
| Modify | src/services/Blocks.FileService/Configs/ConfigureAuthentication.cs | Remove the insecure fallback JWT key; require configured issuer, audience, and key. |
| Modify | src/services/Blocks.FileService/Controllers/UploadFileController.cs | Attach pre-model-binding authorization filter and pass only its validated purpose to Insert. |
| Create | src/services/Blocks.FileService/Infrastructure/Filters/KnowledgeHubUploadPermissionFilter.cs | Check KnowledgeHub ADD through SystemService before form binding. |
| Modify | src/services/Blocks.FileService/Services/CoreFeature/UploadFile/IUploadFileService.cs | Carry optional upload purpose and finalized metadata contract. |
| Modify | src/services/Blocks.FileService/Services/CoreFeature/UploadFile/UploadFileService.cs | Target-specific validation, retry, namespace finalization, and SHA metadata. |
| Modify | src/services/Blocks.FileService/Infrastructure/Storage/UploadSessionStore.cs | Persist/validate purpose and KnowledgeHub Document target; preserve old manifests. |
| Modify | src/services/Blocks.FileService/Infrastructure/Storage/FileStorage.cs | Resolve exact KnowledgeHub/Documents key shape. |
| Modify | src/services/Blocks.FileService/Protos/file.proto | Add source_sha256 field 9. |
| Modify | src/services/Blocks.FileService/Services/gRPC/FileGrpcService.cs | Map source_sha256 into response. |
| Modify | src/platform/Blocks.AppHost/AppHost.cs | Set FileService's SystemService gRPC-Web endpoint to internal HTTPS. |
| Create | test/FileService.RemovalChecks/KnowledgeHubUploadPermissionChecks.cs | Permission filter and no-write tests. |
| Modify | test/FileService.RemovalChecks/Program.cs | Add permissions mode. |
| Modify | test/FileService.RemovalChecks/UpgradeChecks.cs | Assert protobuf field 9 and existing field numbers. |

Important: the purpose header must be checked by an IAsyncAuthorizationFilter before MVC parses the IFormFile form. This prevents MVC multipart model binding and FileStorage writes on denied requests. It does not guarantee the browser or reverse proxy has not already transmitted/buffered bytes at the network layer.

## 8. Workstream B - KnowledgeHub backend and database

Follow:

docs/superpowers/plans/2026-11-21-knowledgehub-p03b-backend-implementation-plan.md

The main files are:

| Action | File | Required change |
| --- | --- | --- |
| Create | docs/database/2026-11-21-knowledgehub-p03-documents.sql | Database-first documents table, constraints, triggers, and indexes. Draft/review only until separately authorized. |
| Modify | src/services/Blocks.KnowledgeHubService/src/knowledgehub/models.py | Add explicit DocumentModel mapping after SQL is applied with authorization. |
| Modify | src/services/Blocks.KnowledgeHubService/src/knowledgehub/schemas.py | Add upload intent, document DTO, list paging, and real DocumentCount mapping. |
| Create | src/services/Blocks.KnowledgeHubService/src/knowledgehub/rpc/file_pb2.py | Generated Python messages from FileService source file.proto. |
| Create | src/services/Blocks.KnowledgeHubService/src/knowledgehub/rpc/file_pb2_grpc.py | Generated Python client stub from FileService source file.proto. |
| Modify | src/services/Blocks.KnowledgeHubService/src/knowledgehub/config.py | Add FileService HTTPS URL, CA, and bounded timeout settings. |
| Create | src/services/Blocks.KnowledgeHubService/src/knowledgehub/file_service.py | Own secure gRPC channel, per-call JWT metadata, deadlines, RPC mapping, and lifecycle. |
| Create | src/services/Blocks.KnowledgeHubService/src/knowledgehub/documents.py | Owner/active-scoped SQL builders and document lifecycle persistence operations. |
| Create | src/services/Blocks.KnowledgeHubService/src/knowledgehub/document_routes.py | Upload intent, finalize, list, detail, download, and delete endpoints. |
| Modify | src/services/Blocks.KnowledgeHubService/src/knowledgehub/main.py | FileService lifespan, health, and router registration. |
| Modify | src/services/Blocks.KnowledgeHubService/src/knowledgehub/collections.py | Add one grouped active-document count query or delegate to documents.py. |
| Modify | src/platform/Blocks.AppHost/AppHost.cs | Add private KnowledgeHub -> FileService HTTPS endpoint and CA configuration. |
| Create | src/services/Blocks.KnowledgeHubService/tests/test_file_service.py | FileServiceClient TLS, metadata, deadline, cancellation, and status tests. |
| Create | src/services/Blocks.KnowledgeHubService/tests/test_documents.py | SQL compilation, owner predicates, lifecycle and idempotency tests. |
| Create | src/services/Blocks.KnowledgeHubService/tests/test_document_endpoints.py | FastAPI contracts with mocked DB and FileService client. |
| Modify | src/services/Blocks.KnowledgeHubService/tests/test_config.py | Validate new FileService settings. |
| Modify | src/services/Blocks.KnowledgeHubService/tests/test_database.py | Lifespan closes both clients and health includes FileService. |
| Modify | src/services/Blocks.KnowledgeHubService/tests/test_proto_stubs.py | Verify file protobuf stubs and SHA field 9. |
| Modify | src/services/Blocks.KnowledgeHubService/tests/test_schemas.py | Test document schemas and DocumentCount. |
| Modify | src/services/Blocks.KnowledgeHubService/tests/test_endpoints.py | Keep existing collection contracts green and test real DocumentCount mapping. |

Do not apply the SQL just because the file exists. P00 prohibits implicit test databases and automated schema mutation. The owner must separately authorize the exact target and DDL operation.

## 9. Workstream C - React

Follow:

docs/superpowers/plans/2026-11-21-knowledgehub-p03c-frontend-implementation-plan.md

The main files are:

| Action | File | Required change |
| --- | --- | --- |
| Modify | src/apps/Blocks.Web/src/config/constants.ts | Add document collection/list/finalize/download endpoints. |
| Modify | src/apps/Blocks.Web/src/lib/api.ts | Add multipart upload helper that removes JSON content type for FormData; add download timeout support. |
| Modify | src/apps/Blocks.Web/src/features/knowledgehub/types/collections.types.ts | Change DocumentCount comment from always zero to actual registered count. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/types/documents.types.ts | Document DTO, status union, upload intent, paging, delete response. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/api/documents.api.ts | Typed intent/stage/finalize/list/detail/download/delete calls. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/hooks/document-query-keys.ts | Actor- and collection-scoped document query keys. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/hooks/useDocuments.ts | Server list/search/filter/paging query. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/hooks/useDocumentMutations.ts | Actor-safe finalize/delete/download mutations and invalidation. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/hooks/useDocumentUploads.ts | Sequential queue, per-file intent/session, byte progress, registration state, retry. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/components/DocumentUploader.tsx | Accessible file picker/drop area for PDF/MD/TXT. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/components/UploadProgressList.tsx | Actual byte transfer progress and separate registration state. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/components/DocumentRepository.tsx | Search/filter/paging and real empty/loading/error states. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/components/DocumentRow.tsx | Filename, type, size, status, download/delete actions. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/components/DocumentDeleteDialog.tsx | Accessible confirmation with preserved errors and pending state. |
| Modify | src/apps/Blocks.Web/src/features/knowledgehub/components/RepositoryFrame.tsx | Replace P02 disabled upload/empty placeholder with real P03 components. |
| Modify | src/apps/Blocks.Web/src/features/knowledgehub/routes/KnowledgeHubPage.tsx | Pass selected collection, actor, and permission state into repository components. |
| Modify | src/apps/Blocks.Web/src/features/knowledgehub/components/RepositoryFrame.test.tsx | Replace placeholder assertions with actual repository behavior. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/api/documents.api.test.ts | API envelope, upload header/FormData, download blob errors. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/hooks/useDocuments.test.tsx | Actor/collection cache and server query behavior. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/hooks/useDocumentUploads.test.tsx | Sequential upload, real progress, retry, actor-switch safety. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/hooks/useDocumentMutations.test.tsx | Delete/finalize stale mutation and invalidation. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/components/DocumentUploader.test.tsx | File type/size/drop/keyboard behavior. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/components/DocumentRepository.test.tsx | Search/filter/page/empty/error/real rows. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/components/DocumentDeleteDialog.test.tsx | Correct target, pending lock, visible failure. |

Do not change the global MainLayout, router, theme, or existing shadcn component source. Existing checked-in Radix primitives are sufficient. Use ui/card, ui/button, ui/input, ui/progress, ui/badge, ui/table, ui/dialog, ui/skeleton, ui/sonner, and Lucide.

## 10. Integrated acceptance sequence

Run local, DB-free checks first. Run live integration only when the owner authorizes runtime and disposable records.

### 10.1. FileService

~~~powershell
dotnet build src/services/Blocks.FileService/Blocks.FileService.csproj
dotnet run --project test/FileService.RemovalChecks -- permissions
dotnet run --project test/FileService.RemovalChecks -- sessions
dotnet run --project test/FileService.RemovalChecks -- lifecycle
dotnet run --project test/FileService.RemovalChecks -- upgrade
dotnet run --project test/FileService.RemovalChecks -- all
~~~

### 10.2. KnowledgeHub Python

~~~powershell
uv run --locked --project src/services/Blocks.KnowledgeHubService python -m unittest discover -s src/services/Blocks.KnowledgeHubService/tests -v
~~~

### 10.3. Frontend

~~~powershell
npm --prefix src/apps/Blocks.Web test -- --run
npm --prefix src/apps/Blocks.Web run build
npm --prefix src/apps/Blocks.Web run lint
~~~

### 10.4. AppHost and platform

~~~powershell
dotnet build src/platform/Blocks.AppHost/Blocks.AppHost.csproj
& ./test/Backend.Upgrade.Check.ps1 -Check all
git diff --check
~~~

A successful build does not prove TLS, JWT key alignment, real SystemService permission, database grants, or Gateway forwarding. Record those as NOT RUN until tested through the actual authorized runtime.

### 10.5. Owner-authorized integration scenarios

- User with ADD can create intent, stage, finalize, list, and download own document.
- Valid JWT without KnowledgeHub ADD cannot stage with X-Upload-Purpose: KnowledgeHubDocument.
- SystemService denial/unavailability produces no FileStorage Temp artifacts.
- Legacy stage without the purpose header remains compatible.
- Actor B cannot register, list, detail, download, or delete Actor A's document.
- Retry after lost stage/finalize response does not duplicate file or document.
- Collection soft-delete racing with finalize produces the specified retained/non-active outcome and never calls DeleteData.
- Document delete makes the document immediately inaccessible; FileService cleanup failure remains PENDING/FAILED and retryable.
- Collection DocumentCount equals active registered documents only.
- A 50 MiB boundary file respects the HTTP/gRPC limits and the bounded download concurrency.
- Existing System Attachment, Avatar, P01, P02, and Gateway regressions remain green.

### 10.6. Visual acceptance

Compare against the tracked Stitch reference at 1280x1024, then 1440x900 and 390x844. Keep the existing MainLayout, header, selector, badge, and tab hierarchy. Capture:
- Empty collection with no fake documents.
- Real uploaded document row.
- Uploading byte progress.
- Registration-in-progress after transfer reaches 100%.
- Failed upload/finalize with retry guidance.
- Search/filter/pagination.
- Delete confirmation and cleanup-pending result.
- Mobile view without horizontal page overflow.

Keep evidence under docs/knowledgehub/evidence/p03/ if the owner chooses to commit screenshots. Do not modify the original Stitch assets.

## 11. Acceptance and handover

P03 is not complete because the code compiles. Complete means:

- All relevant DB-free suites and frontend tests/build/lint have actual results.
- FileService namespace and receipt behavior preserve System Attachment/Avatar behavior.
- SystemService ADD permission runs before MVC multipart model binding for KnowledgeHub-purpose uploads.
- Python FileService client is private TLS with per-call user metadata, bounded deadlines, and safe status mapping.
- Document ownership and active-parent predicates protect every document operation.
- Cross-service registration and deletion are retry-safe without distributed transactions.
- Collection deletion retains documents/original files and does not cascade to FileService.
- P06 vector hard-delete handoff remains explicit.
- Visual behavior follows the approved mockup hierarchy without fake content.
- Live checks are recorded PASS/FAIL/NOT RUN; unapproved or unavailable live checks remain NOT RUN.

Only after owner review should the owner write docs/knowledgehub/outcomes/P03.md and update docs/knowledgehub/README.md. Do not create an outcome that claims tests or live acceptance that were not run.

## 12. References

- Accepted P03 design: docs/superpowers/specs/2026-11-21-knowledgehub-p03-file-lifecycle-document-repository-design.md
- P02 manual UI guide: docs/superpowers/plans/2026-11-15-knowledgehub-p02-frontend-ui-implementation-guide.md
- Microsoft ASP.NET Core filters: https://learn.microsoft.com/en-us/aspnet/core/mvc/controllers/filters?view=aspnetcore-10.0
- Microsoft IAsyncAuthorizationFilter: https://learn.microsoft.com/en-us/dotnet/api/microsoft.aspnetcore.mvc.filters.iasyncauthorizationfilter?view=aspnetcore-10.0
- Microsoft gRPC client and deadlines: https://learn.microsoft.com/en-us/aspnet/core/grpc/client?view=aspnetcore-10.0
- PostgreSQL partial indexes: https://www.postgresql.org/docs/16/indexes-partial.html
