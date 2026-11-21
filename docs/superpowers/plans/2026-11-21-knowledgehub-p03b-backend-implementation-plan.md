# KnowledgeHub P03-B: KnowledgeHub Database And Backend API - Implementation Plan

Date: 2026-11-21  
Status: PROPOSED - owner execution plan; review before starting  
Branch: feature/knowledgehub-learning  
Accepted specification: docs/superpowers/specs/2026-11-21-knowledgehub-p03-file-lifecycle-document-repository-design.md  
Parent plan: docs/superpowers/plans/2026-11-21-knowledgehub-p03-implementation-plan.md  
Prerequisites: P03-A FileService contract; P00/P01/P02 accepted  
Repository rules: AGENTS.md

## Goal

Add document metadata and lifecycle APIs to the existing FastAPI KnowledgeHub service. KnowledgeHub owns document records and authorization through the active parent collection. FileService remains the only owner of original bytes.

The backend must handle upload intent, FileService finalization, retry/idempotency, active-owner repository queries, original download, document logical deletion, and the P02 collection DocumentCount without distributed transactions.

This plan does not apply SQL. The owner writes and reviews the SQL file, commits it to Git, and separately authorizes the exact target database/operation before application. Only then should the owner write the SQLAlchemy mapping against the applied schema.

## Architecture

~~~text
React / Blocks API Gateway
  |
  v
FastAPI /api/knowledgehub
  |
  +--> JWT identity + SystemService CheckPermission
  |
  +--> PostgreSQL knowledgehub
  |      collections
  |      documents
  |
  +--> FileServiceClient (private TLS gRPC)
         UploadData
         PreviewFile
         DeleteData
~~~

Browser never receives a storage key, file ID, FileService gRPC endpoint, or local path. FastAPI resolves the document through an active collection owned by the JWT actor before it calls FileService.

## Tech Stack

- Python 3.12.
- FastAPI and Pydantic v2.
- SQLAlchemy async and asyncpg.
- PostgreSQL database knowledgehub.
- grpcio / grpc.aio and generated Python stubs.
- Aspire AppHost private HTTPS endpoint.
- Existing unittest-based DB-free test suite.

Do not add Alembic, use create_all(), add a second database, or add dependencies unless the owner separately approves a design change.

## Specification

Read accepted P03 sections 8-15, 17-19 and P00 database/permission rules. P03-A must complete the FileService contract first:

- Upload purpose header: X-Upload-Purpose: KnowledgeHubDocument.
- FileService checks KnowledgeHub ADD before staging.
- Finalize target: KnowledgeHub/Documents.
- Finalized response includes source_sha256 at protobuf field 9.
- File key shape: KnowledgeHub/Documents/{documentId}/{fileId}.{extension}.
- PreviewFile and DeleteData receive only keys loaded from the KnowledgeHub database.
- FileService RPCs use the current validated user's token as per-call x-service-authorization metadata.

## Global Constraints

- No separate test database, test schema, automatic DDL, startup migrations, Alembic, or create_all().
- Do not apply the proposed SQL without explicit owner authorization of the exact database and operation.
- Do not change SystemService roles, menus, grants, or permission records.
- Use SystemService CheckPermission through the existing PermissionClient for KnowledgeHub HTTP APIs.
- Derive actor only from AuthenticatedUser produced by P01. Never accept owner_id from the request.
- Action permission and collection ownership are both required.
- All document reads/writes/downloads/finalization resolve through an active collection with owner_id=actor and deleted_at IS NULL.
- Do not store JWTs in documents, upload manifests, jobs, logs, or browser storage.
- Do not return file_id, storage_key, source_sha256, manifest, local path, or gRPC metadata in public DTOs.
- No parsing, chunking, embeddings, READY state, or content search in P03.
- No durable worker in P03. P04 owns worker identity and durable retry/reconciliation.
- Collection soft-delete retains document rows and original files. No FileService DeleteData call is made by collection deletion.
- P06 hard-deletes vectors; P03 does not touch vectors.
- Use the existing response envelope for JSON endpoints. Download is a binary response.
- The owner writes all Python and SQL.

## Review Focus Before Coding

1. The current Python service already has PermissionClient, SystemProto stubs, lifespan management, strict Settings validation, and health checks. Reuse these patterns; do not create a second JWT/permission implementation.
2. The current PermissionClient forwards the user JWT per RPC call as x-service-authorization metadata. FileServiceClient must do the same, but use file.FileProto methods.
3. FileService Python calls must use native gRPC over the private HTTPS endpoint, not the public Gateway and not gRPC-Web.
4. Python stubs must be generated from the source file.proto in Blocks.FileService, not from C# obj output and not from a copied proto file.
5. The existing FileService PreviewFile is unary and buffers up to 50 MiB. Set Python gRPC max receive message length to at least 64 MiB and limit concurrent preview calls to one per API process initially.
6. The current collections schema response hard-codes DocumentCount=0. Replace it with one grouped aggregate, not an N+1 query.
7. The collection soft-delete operation is an UPDATE that takes a PostgreSQL row lock. Final registration must lock/recheck the parent collection row after FileService finalize so delete and registration serialize.
8. A FileService timeout is an uncertain result. Retry the same document ID and upload session; never create a new document ID to retry finalize.
9. The existing P00 contract rejects automated DB-mutating tests and a separate test DB. SQL compilation is not proof of live FK/lock behavior.
10. The current API error envelope uses HTTP 200 for ordinary business/auth/permission errors. Preserve this behavior and do not treat HTTP 200 as application success.
11. AppHost is also modified by P03-A. Do not edit it concurrently; first complete the FileService SystemService endpoint change, then add KnowledgeHub's FileService endpoint.
12. Keep a sessionStorage correlation for UploadSessionId only if needed for retry after page refresh. Never store JWT, file bytes, file key, or user secrets. Server state remains the source of truth.

## Task BE-00 - Preflight and inspect current contracts

**Learn:** Pydantic schemas, SQLAlchemy Select/Update builders, async session transaction boundaries, FastAPI dependencies, grpc.aio, and the existing P01 PermissionClient.

**Read:**
- src/services/Blocks.KnowledgeHubService/src/knowledgehub/config.py
- src/services/Blocks.KnowledgeHubService/src/knowledgehub/identity.py
- src/services/Blocks.KnowledgeHubService/src/knowledgehub/permission.py
- src/services/Blocks.KnowledgeHubService/src/knowledgehub/database.py
- src/services/Blocks.KnowledgeHubService/src/knowledgehub/models.py
- src/services/Blocks.KnowledgeHubService/src/knowledgehub/schemas.py
- src/services/Blocks.KnowledgeHubService/src/knowledgehub/collections.py
- src/services/Blocks.KnowledgeHubService/src/knowledgehub/main.py
- src/services/Blocks.KnowledgeHubService/src/knowledgehub/rpc/system_pb2_grpc.py
- src/services/Blocks.KnowledgeHubService/tests/test_config.py
- src/services/Blocks.KnowledgeHubService/tests/test_permission.py
- src/services/Blocks.KnowledgeHubService/tests/test_database.py
- src/services/Blocks.KnowledgeHubService/tests/test_endpoints.py
- docs/database/2026-11-01-knowledgehub-p02-collections.sql
- docs/superpowers/specs/2026-10-27-knowledgehub-p00-integration-contracts-design.md
- src/platform/Blocks.AppHost/AppHost.cs

**Do:**
1. Confirm P03-A has added protobuf field 9 and its FileService tests pass.
2. Record current Python unittest baseline.
3. Inspect the exact Pydantic naming/alias conventions and response envelope helpers.
4. Inspect current collection SQL and DocumentCount mapping.
5. Confirm the current AppHost HTTPS endpoint names and CA parameter usage without printing secret values.

**Files:** no product files changed.

## Task BE-01 - Draft the documents SQL (do not apply)

**Learn:** PostgreSQL constraints, partial indexes, triggers, FK delete actions, and why schema-first differs from ORM create_all.

**Create:** docs/database/2026-11-21-knowledgehub-p03-documents.sql.

Use docs/database/2026-11-01-knowledgehub-p02-collections.sql as the style reference. Create only public.documents and its required trigger/indexes. Do not create jobs, chunks, embeddings, vectors, or future tables.

Proposed columns from the accepted specification:

| Column | SQL type | Rule |
| --- | --- | --- |
| id | UUID | Primary key, nonzero. |
| collection_id | UUID | NOT NULL, FK to public.collections(id) ON DELETE RESTRICT. Never cascade. |
| upload_session_id | UUID | NOT NULL, unique, nonzero. |
| title | VARCHAR(255) | Server-derived from filename without extension. |
| original_filename | VARCHAR(255) | Validated basename, no path. |
| file_extension | VARCHAR(10) | .pdf, .md, or .txt. |
| content_type | VARCHAR(127) | Server-derived from extension. |
| declared_size_bytes | BIGINT | >0 and <=52428800. |
| file_id | UUID | NULL until FileService finalize. |
| storage_key | TEXT | NULL until FileService finalize; private internal key. |
| size_bytes | BIGINT | NULL until trusted finalize result. |
| source_sha256 | CHAR(64) | NULL until trusted finalize result; 64 hex chars. |
| registration_status | VARCHAR(40) | AWAITING_UPLOAD, REGISTERING, REGISTRATION_FAILED, REGISTERED, BLOCKED_PARENT_DELETED, PARENT_DELETED_RETAINED. |
| cleanup_status | VARCHAR(20) | NOT_REQUESTED, PENDING, COMPLETED, FAILED. |
| registration_attempt_id | UUID | NULL; fences late finalize responses. |
| registration_lease_until | TIMESTAMPTZ | NULL; bounded finalize lease. |
| last_error_code | VARCHAR(64) | NULL; stable safe category only. |
| last_error_at | TIMESTAMPTZ | NULL. |
| created_at | TIMESTAMPTZ | NOT NULL DEFAULT CURRENT_TIMESTAMP. |
| updated_at | TIMESTAMPTZ | NOT NULL DEFAULT CURRENT_TIMESTAMP. |
| registered_at | TIMESTAMPTZ | NULL. |
| deleted_at | TIMESTAMPTZ | NULL; document-level soft delete only. |

Add:
- nonzero ID checks;
- size checks;
- extension check;
- source SHA256 format check when non-null;
- registration_status and cleanup_status allowlists;
- FK ON DELETE RESTRICT;
- unique upload_session_id;
- unique partial index on file_id when non-null;
- unique partial index on storage_key when non-null;
- active repository index on (collection_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;
- recovery index for stale REGISTERING/REGISTRATION_FAILED rows;
- cleanup index for deleted documents with PENDING/FAILED cleanup;
- updated_at trigger and rollback comments.

Do not add owner_id to documents. Ownership is resolved through the parent collection join. Do not add grants until the actual runtime role name and privileges are confirmed by the owner.

**Review checklist:**
1. No ON DELETE CASCADE.
2. No physical file deletion or vectors in SQL.
3. Every index supports a query in this plan.
4. Constraint names are stable and explicit.
5. SQL is narrowly scoped and has rollback comments.
6. No DSN, password, or secret is present.

**Database gate:** commit/review the SQL draft first. Stop here until the owner explicitly authorizes the exact database and DDL operation. Do not run this SQL as an automated test. Do not create a test DB/schema.

## Task BE-02 - Add the SQLAlchemy DocumentModel after schema authorization

**Learn:** mapping an existing PostgreSQL schema without ORM-driven schema creation.

**Modify:** src/services/Blocks.KnowledgeHubService/src/knowledgehub/models.py.

After the owner has applied the authorized SQL:
- add DocumentModel using the existing declarative Base and Mapped/mapped_column style;
- map every documents column with exact SQL type/nullability/default;
- map collection_id FK with ondelete="RESTRICT";
- add only relationships needed by current queries; avoid cascade delete configuration;
- map partial indexes only if they match the applied SQL exactly;
- do not call create_all or add startup schema creation.

**Tests:** DB-free metadata inspection and SQL compilation. Live column/constraint inspection is owner-run and only after authorization.

If SQL application has not been authorized, leave this mapping task BLOCKED rather than guessing at the live schema.

## Task BE-03 - Add document schemas and request validation

**Learn:** Pydantic v2 model validation, aliases, UUID validation, and response envelope conventions.

**Modify:** src/services/Blocks.KnowledgeHubService/src/knowledgehub/schemas.py.

Add request/response types following existing PascalCase JSON field conventions:
- DocumentUploadIntentRequest: UploadSessionId, OriginalFileName, DeclaredSizeBytes.
- DocumentUploadIntentResponse: DocumentId, UploadSessionId, RegistrationStatus.
- DocumentResponse: Id, CollectionId, Title, OriginalFileName, FileExtension, ContentType, SizeBytes, RegistrationStatus, CreatedAt, UpdatedAt, RegisteredAt.
- DocumentPageResponse: Data, TotalRow, PageIndex, PageSize.
- DocumentDeleteResponse: Id and CleanupStatus.

Validation:
- UploadSessionId is a nonzero UUID.
- OriginalFileName is a basename, not a path; reject slash, backslash, colon, traversal, control chars, blank names, and >255 Unicode scalar values.
- Extension allowlist is exactly .pdf, .md, .txt case-insensitively.
- DeclaredSizeBytes is >0 and <=52428800.
- Do not trust browser Content-Type; derive from extension.
- No owner_id, file_id, storage_key, SHA256, FileService URL, local path, or JWT field in request/response schemas.

DocumentCount:
- Change CollectionResponse.from_model to accept document_count (default 0 for tests/callers that do not yet supply it).
- Remove the comment/assumption that DocumentCount is always zero.
- The actual list/detail routes must supply the grouped count in BE-10.

**Tests:** valid PDF/MD/TXT; invalid UUID, filename traversal, control chars, unsupported extension, zero/oversize file, extra fields, and public DTO exclusion of internal storage fields.

## Task BE-04 - Generate Python FileProto stubs from the source proto

**Learn:** grpcio-tools and generated Python gRPC stub imports.

**Create generated files:**
- src/services/Blocks.KnowledgeHubService/src/knowledgehub/rpc/file_pb2.py
- src/services/Blocks.KnowledgeHubService/src/knowledgehub/rpc/file_pb2_grpc.py

Generate from src/services/Blocks.FileService/Protos/file.proto. Do not copy the .proto into KnowledgeHub and do not generate from C# obj output.

From repository root, use the existing locked dev dependency:

~~~powershell
uv run --locked --project src/services/Blocks.KnowledgeHubService --group dev python -m grpc_tools.protoc -I src/services/Blocks.FileService/Protos --python_out=src/services/Blocks.KnowledgeHubService/src/knowledgehub/rpc --grpc_python_out=src/services/Blocks.KnowledgeHubService/src/knowledgehub/rpc src/services/Blocks.FileService/Protos/file.proto
~~~

After generation, inspect the generated file_pb2_grpc.py import. Match the existing package import convention in system_pb2_grpc.py (from knowledgehub.rpc import file_pb2 as file__pb2). Do not hand-edit generated descriptors/messages.

**Modify:** src/services/Blocks.KnowledgeHubService/tests/test_proto_stubs.py.

Add imports and assertions for:
- FileProtoStub import;
- UploadDataRequest fields 1-4;
- ModelAttachmentProto fields 1-9;
- source_sha256 is field 9;
- DeleteData, PreviewFile messages and existing field numbers.

**Do not modify uv.lock or add dependencies** unless the owner separately approves a dependency change.

## Task BE-05 - Add validated FileService runtime configuration

**Modify:** src/services/Blocks.KnowledgeHubService/src/knowledgehub/config.py.

Add settings:
- file_grpc_url from KNOWLEDGEHUB_FILE_GRPC_URL;
- file_grpc_ca_file from KNOWLEDGEHUB_FILE_GRPC_CA_FILE;
- file_rpc_timeout_seconds with a finite positive bounded default (initially 10 seconds);
- file_download_timeout_seconds with a finite positive bounded default (initially 60 seconds).

Validate:
- URL is HTTPS, has host and explicit nonzero port, and has no credentials/query/fragment/non-root path.
- CA path is absolute, exists, is a valid PEM certificate bundle, and contains no private key.
- timeout values are finite, positive, and capped.
- missing configuration fails startup; no insecure HTTP fallback.

Reuse the existing P01 Settings validation style. Do not expose secrets in errors.

**Modify:** tests/test_config.py.
- Add valid FileService URL/CA/timeouts to valid_env.
- Add missing/HTTP URL/invalid port/credentials/path/missing CA/relative CA/nonexistent CA/invalid PEM/timeout invalid cases.
- Confirm diagnostics never print secret contents.

## Task BE-06 - Implement the private FileServiceClient

**Create:** src/services/Blocks.KnowledgeHubService/src/knowledgehub/file_service.py.

Implement one lifespan-owned client with:
- grpc.aio secure channel using file_grpc_url and file_grpc_ca_file;
- FileProtoStub from knowledgehub.rpc.file_pb2_grpc;
- channel option grpc.max_receive_message_length >= 64 * 1024 * 1024;
- a one-at-a-time asyncio.Semaphore for PreviewFile initially;
- check_channel_health() with a short bounded timeout;
- close() that closes the owned channel.

Methods:

**finalize_upload(user, document_id, upload_session_id):**
- call UploadData with related_id=document_id, service_path=KnowledgeHub, folder_name=Documents, temp_folder=upload_session_id;
- attach per-call metadata x-service-authorization: Bearer <user.token>;
- set file_rpc_timeout_seconds and propagate coroutine cancellation;
- require exactly one attachment;
- parse nonzero file ID and related ID;
- require related_id equals document_id;
- require canonical KnowledgeHub/Documents key containing the expected document ID and file ID;
- require extension matches the upload intent;
- require actual file size matches declared size and <=50 MiB;
- require source_sha256 is 64 hex characters, then normalize it to lowercase before persistence to match the SQL contract;
- return an internal typed result, never a public DTO.

**preview_file(user, storage_key):**
- accept only a key loaded from DocumentModel by the authorized route;
- call PreviewFile with per-call user metadata and file_download_timeout_seconds;
- limit concurrent calls to one per process;
- return bytes/content metadata to the route;
- do not expose the key to the browser.

**delete_file(user, storage_key):**
- accept only a key loaded from the authorized document row;
- call DeleteData with one key and per-call metadata;
- return true only when response.Success is true.

Map gRPC statuses safely:
- UNAUTHENTICATED -> 401;
- PERMISSION_DENIED -> 403;
- NOT_FOUND -> 404;
- INVALID_ARGUMENT -> 400;
- FAILED_PRECONDITION -> 409;
- RESOURCE_EXHAUSTED -> 413;
- UNAVAILABLE/DEADLINE_EXCEEDED/INTERNAL -> safe 503.

Never log the JWT, storage key, raw gRPC metadata, or file content.

**Create:** tests/test_file_service.py.
Use injected fake stubs/channels to test request fields, per-call metadata, deadline, cancellation, receive limit, response validation, and status mapping. No live FileService is required for these tests.

## Task BE-07 - Register FileService client in FastAPI lifespan and Aspire

### BE-07.1 - FastAPI lifespan

**Modify:** src/services/Blocks.KnowledgeHubService/src/knowledgehub/main.py.

Current lifespan creates PermissionClient and DB engine/session factory. Extend it to:
- create FileServiceClient from Settings;
- store it as app.state.file_service_client;
- close it on shutdown;
- ensure both FileServiceClient and PermissionClient close even if one close raises;
- preserve DB engine disposal and app.state cleanup.

Add get_file_service_client dependency in file_service.py or a small dependency module. It must fail if lifespan did not initialize the client.

Update /health to check:
- SystemService PermissionClient channel;
- FileService channel;
- DB health.

Keep /alive independent and fast.

### BE-07.2 - AppHost

**Modify:** src/platform/Blocks.AppHost/AppHost.cs.

After P03-A's FileService -> SystemService change is complete:
- add .WithReference(fileService) to the KnowledgeHub Uvicorn resource;
- set KNOWLEDGEHUB_FILE_GRPC_URL from fileService.GetEndpoint("https");
- set KNOWLEDGEHUB_FILE_GRPC_CA_FILE using the existing trusted CA parameter only if that CA validates FileService's HTTPS certificate too;
- if the certificate chain differs, add a distinct protected parameter for FileService CA rather than assuming trust;
- keep the FileService endpoint private and do not add it to Gateway routes.

Do not put certificate/key contents in tracked AppHost code.

**Tests:** mocked lifespan tests verify both clients created, health dependency, and both clients closed. Real TLS trust remains owner-authorized runtime acceptance.

## Task BE-08 - Implement document persistence and owner-scoped query builders

**Create:** src/services/Blocks.KnowledgeHubService/src/knowledgehub/documents.py.

Follow collections.py's pure SQL builder + async repository pattern.

Add functions/builders for:

1. Create upload intent:
   - resolve active collection by id + owner_id + deleted_at IS NULL;
   - enforce unique upload_session_id;
   - if the same actor/collection/session/name/declared size already exists, return the same DocumentId;
   - if session ID is reused with different metadata or another owner, return a safe conflict without revealing the existing row;
   - generate DocumentId server-side;
   - initial registration_status=AWAITING_UPLOAD and cleanup_status=NOT_REQUESTED.

2. Load document intent:
   - join to parent collection;
   - resolve owner through CollectionModel.owner_id;
   - use the same 404 behavior for missing/foreign resources.

3. Claim registration:
   - lock/recheck parent collection active and owned;
   - atomically set REGISTERING, new registration_attempt_id, registration_lease_until;
   - a non-expired REGISTERING attempt returns pending/conflict;
   - expired REGISTERING and REGISTRATION_FAILED can be retried;
   - commit the claim before calling FileService.

4. Mark registration failed:
   - only update if registration_attempt_id still matches;
   - set REGISTRATION_FAILED, safe last_error_code/last_error_at;
   - clear the lease;
   - never store raw exception text.

5. Commit finalized reference:
   - open a new transaction after FileService RPC;
   - lock the parent collection row with SELECT FOR UPDATE;
   - if still active, persist file_id, storage_key, size_bytes, source_sha256, content_type, REGISTERED, registered_at;
   - if collection became deleted while FileService finalized, persist the trusted reference and mark PARENT_DELETED_RETAINED;
   - if collection was already deleted before RPC, mark BLOCKED_PARENT_DELETED and do not call FileService;
   - only the current registration_attempt_id can commit.

6. List documents:
   - join active parent collection owned by actor;
   - exclude document deleted_at IS NOT NULL;
   - include AWAITING_UPLOAD, REGISTERING, REGISTRATION_FAILED, REGISTERED;
   - filter by registration_status if supplied;
   - q searches title and original_filename only;
   - escape LIKE wildcards and parameterize;
   - order created_at DESC, id DESC;
   - page_index >=1, page_size 1-100.

7. Detail/download lookup:
   - require active parent collection and owner;
   - detail can return active registration states;
   - download additionally requires registration_status=REGISTERED and document deleted_at IS NULL.

8. Logical delete:
   - atomically set document deleted_at and cleanup_status=PENDING only for a REGISTERED document in an active owned collection;
   - retain file_id/storage_key/size/hash;
   - commit before FileService DeleteData.

9. Cleanup state:
   - update cleanup_status to COMPLETED or FAILED only against the retained deleted document;
   - preserve the trusted storage key;
   - expose an internal retry-safe cleanup function for future P04 reconciliation, but do not add a worker.

10. DocumentCount:
   - grouped count by collection_id;
   - count only deleted_at IS NULL and registration_status=REGISTERED;
   - no N+1 query.

**Create:** tests/test_documents.py.
Test generated SQL for every owner/active predicate, no ON DELETE CASCADE, deterministic paging, escaped search, status filters, count predicate, registration attempt fencing, and delete-first state updates. Use mock AsyncSession or SQL compilation; no database connection.

## Task BE-09 - Implement document API routes

**Create:** src/services/Blocks.KnowledgeHubService/src/knowledgehub/document_routes.py.

Create an APIRouter under /api/knowledgehub. Keep all routes inside the existing FastAPI service and standard response helpers.

### POST /collections/{collection_id}/documents/upload-intents

- Depends on require_permission("knowledgehub", 2).
- Validate active owned collection.
- Validate UploadSessionId, original filename, extension, and declared size.
- Create/reuse the idempotent intent.
- Return DocumentId, UploadSessionId, AWAITING_UPLOAD.
- Do not accept owner_id or storage path.

### POST /documents/{document_id}/finalize

- Depends on require_permission("knowledgehub", 2).
- Load intent through parent owner.
- If parent already deleted: mark BLOCKED_PARENT_DELETED and do not call FileService.
- Claim attempt and commit before gRPC.
- Call FileServiceClient.finalize_upload using database document ID/session ID.
- Validate trusted result against intent.
- In a new transaction lock/recheck parent and commit REGISTERED or PARENT_DELETED_RETAINED.
- On RPC failure, mark REGISTRATION_FAILED only if attempt ID still matches.
- Timeout is uncertain; retry same IDs and target.
- Do not hold a DB transaction over gRPC.

### GET /collections/{collection_id}/documents

- Depends on require_permission("knowledgehub", 1).
- Require active owned collection.
- Support q, registration_status, page_index default 1, page_size default 20 max 100.
- Return the P02 paging shape and DocumentResponse DTOs.
- Do not search document contents.

### GET /documents/{document_id}

- Depends on VIEW.
- Return only an active document under an active owned collection.
- Missing, foreign, deleted parent, or deleted document returns uniform 404.

### GET /documents/{document_id}/download

- Depends on VIEW.
- Resolve the active registered document through active owned collection.
- Load storage_key from DB only.
- Call PreviewFile through FileServiceClient.
- Return raw bytes with safe Content-Disposition, server-derived Content-Type, Cache-Control: private, no-store, and X-Content-Type-Options: nosniff.
- Never return a FileService URL or storage key.
- This is unary/buffered; use the 50 MiB cap, 64 MiB Python gRPC receive limit, bounded timeout, and one-call semaphore.

### DELETE /documents/{document_id}

- Depends on require_permission("knowledgehub", 4).
- Resolve active registered document through active owned collection.
- Commit deleted_at and cleanup_status=PENDING before calling FileService.
- Call DeleteData with the DB-loaded storage key.
- If success, set COMPLETED.
- If false/timeout/unavailable, preserve PENDING/FAILED and return logical-delete success with cleanup state; never resurrect the document.
- Do not physically purge Deleted.
- Do not cascade this operation from collection deletion.

**Create:** tests/test_document_endpoints.py.
Override get_db_session, get_permission_client, and get_file_service_client. Verify response envelope, permission codes, uniform 404, no unauthorized FileService RPCs, and correct upload/finalize/download/delete calls.

## Task BE-10 - Wire router and replace DocumentCount=0

**Modify:** src/services/Blocks.KnowledgeHubService/src/knowledgehub/main.py.

- Import document_router and include it alongside the existing collection api_router.
- Do not move or rewrite the existing P02 collection routes unnecessarily.

**Modify:** src/services/Blocks.KnowledgeHubService/src/knowledgehub/collections.py or delegate to documents.py.

- Add one grouped query for counts by collection IDs.
- Keep existing collection list/detail owner predicates.
- Do not issue one query per collection.

**Modify:** src/services/Blocks.KnowledgeHubService/src/knowledgehub/schemas.py.

- CollectionResponse.from_model accepts document_count and maps it to DocumentCount.

**Modify:** main.py collection list/detail endpoints.

- Fetch counts in one grouped query for list.
- Fetch one count for detail.
- Count only active, registered, non-deleted documents.
- A soft-deleted collection is not returned by normal collection APIs.

**Tests:** update test_endpoints.py and test_schemas.py for nonzero counts, zero counts, deleted documents excluded, pending documents excluded, and no N+1 pattern.

## Task BE-11 - Test collection-delete/finalize race and cleanup semantics

**Modify/create tests:** test_documents.py and test_document_endpoints.py.

Mocked deterministic cases:
1. Parent active at initial check; finalize commits before collection delete obtains row lock -> document REGISTERED, later collection deletion hides it, original remains.
2. Collection delete commits first -> finalize sees deleted parent and does not publish an active document.
3. Collection becomes deleted while FileService finalize is in flight -> trusted key is persisted as PARENT_DELETED_RETAINED; no DeleteData call.
4. FileService finalizes but KnowledgeHub DB commit fails -> retry same DocumentId/UploadSessionId returns same FileId/key/hash.
5. Registration lease expires -> new attempt ID fences late response from old attempt.
6. FileService DeleteData fails after logical delete -> document inaccessible, cleanup remains pending/failed.
7. FileService moves file but cleanup-status DB update fails -> same-key retry remains safe.
8. Collection deletion never sets document deleted_at and never calls FileService DeleteData.

A fake session cannot prove real PostgreSQL row-lock ordering. Mark actual DB race verification NOT RUN until an owner-authorized safe environment exists.

## Task BE-12 - Python verification and handoff

Run from repository root:

~~~powershell
uv run --locked --project src/services/Blocks.KnowledgeHubService python -m unittest discover -s src/services/Blocks.KnowledgeHubService/tests -v
git diff --check
~~~

Also run focused tests while coding:
- test_config.py
- test_proto_stubs.py
- test_file_service.py
- test_documents.py
- test_document_endpoints.py
- test_database.py
- test_endpoints.py

Review:
- no JWT persisted;
- no browser-controlled storage path;
- no owner_id request field;
- all document queries join active owned collection;
- no gRPC call occurs before permission/ownership checks;
- no DB transaction remains open across FileService RPC;
- no SQL was applied without authorization;
- no fake DocumentCount;
- no P03 processing/READY state;
- no FileService public endpoint.

Handoff to P03-C:
- exact API paths, methods, query parameters, DTO fields, and response envelope;
- binary download behavior and headers;
- upload stage header and multipart fields;
- registration status values;
- delete response cleanup status;
- all mock test evidence and live checks still NOT RUN.

## Done Criteria

P03-B is locally ready when Python tests pass, schemas/SQL/query builders are reviewed, mocked FileService calls are correct, and every endpoint enforces permission plus active parent ownership. Real database schema, grants, TLS, and Gateway behavior remain separate owner-authorized acceptance items.
