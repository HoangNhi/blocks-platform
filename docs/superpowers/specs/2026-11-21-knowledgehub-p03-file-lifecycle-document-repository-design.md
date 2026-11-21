# KnowledgeHub P03: File Lifecycle And Document Repository

Date: 2026-11-21  
Status: DRAFT - owner approval pending  
Prerequisites: approved Master Design; P00 ACCEPTED; P01 ACCEPTED; P02 ACCEPTED  
Master: docs/superpowers/specs/2026-10-27-knowledgehub-master-design.md  
P00: docs/superpowers/specs/2026-10-27-knowledgehub-p00-integration-contracts-design.md  
P01: docs/superpowers/specs/2026-10-27-knowledgehub-p01-runtime-gateway-identity-design.md  
P02: docs/superpowers/specs/2026-11-01-knowledgehub-p02-collections-react-frame-design.md  
P02 outcome: docs/knowledgehub/outcomes/P02.md

This is a design document, not an implementation plan. It authorizes no product-code edits, dependency installation, database provisioning or mutation, menu/permission changes, service startup, deployment, or physical file cleanup.

The owner writes product code and SQL. The agent analyzes, explains, prepares the manual implementation plan after approval, and reviews owner implementation.

## 1. Intent

Deliver the first real KnowledgeHub document lifecycle by reusing Blocks FileService for private original bytes and KnowledgeHub PostgreSQL for document metadata.

A user must be able to:

1. Select an active collection they own.
2. Create an upload intent bound to that collection and their verified actor.
3. Upload one supported original file through the existing authenticated FileService HTTP staging route.
4. Finalize the staged upload through authenticated internal FileService gRPC.
5. Register a trusted file reference and metadata in KnowledgeHub.
6. List, search, filter, and page through documents in the selected collection.
7. Download an original file only after KnowledgeHub authorizes the document and its active parent collection.
8. Logically delete a document, with a retry-safe FileService move to its private Deleted area.
9. Preserve documents and original files when their parent collection is soft-deleted.

The main engineering problem is coordinating two independent systems without a distributed transaction:

- FileService owns bytes, upload manifests, storage namespaces, and file-level deletion receipts.
- KnowledgeHub owns collections, document metadata, authorization through collection ownership, and the relationship between a document and its original file.

A browser-provided UUID or storage path is never proof of ownership.

## 2. Confirmed Decisions

### 2.1. Owner-confirmed in this P03 discussion

**Collection deletion uses the retain-originals policy (option B):**

- Soft-delete the collection row.
- Keep its document rows.
- Keep its original files in FileService.
- Do not call FileService DeleteData as a consequence of collection deletion.
- Do not cascade-delete document rows or original files.
- No collection restore UI or restore endpoint is introduced in P03.

**Vectors retain the previously selected P02 policy:**

- Vectors belonging to a soft-deleted collection are hard-deleted by P06.
- P03 does not create or delete vectors.
- P04 must prevent in-flight jobs from publishing new processing state for a deleted collection.
- P08 defines historical answer and citation behavior.

### 2.2. Inherited approved decisions

- Integrated vertical slice inside Blocks; no standalone KnowledgeHub application.
- Python/FastAPI owns KnowledgeHub APIs and PostgreSQL persistence.
- React uses the existing Blocks shell, API client, TanStack Query, and installed UI primitives.
- FileService remains the only owner of original file bytes.
- Database-first SQL: reviewed SQL in Git, owner-authorized application, then explicit SQLAlchemy mappings.
- No Alembic bootstrap, ORM-driven schema creation, dedicated test database, or create_all().
- Collection ownership is private to the verified actor. Administrators have no cross-owner bypass.
- Platform action permission and collection ownership are both required.
- The standard JSON response envelope remains Success, StatusCode, Data, Message.
- Agents do not implement product code under this learning workflow.

### 2.3. Proposed defaults in this draft

These are design proposals for owner approval, not earlier owner decisions:

- File namespace: KnowledgeHub/Documents/{documentId}/{fileId}.{extension}.
- One file per upload session and one upload session per document.
- Create a durable document/upload-intent row before staging bytes.
- Client generates an opaque UploadSessionId; server generates DocumentId.
- Upload .pdf, .md, and .txt; maximum original file size is 50 MiB.
- Upload multiple selected files sequentially in the first version.
- Reuse the existing unary PreviewFile RPC for bounded downloads; do not introduce a streaming RPC in P03.
- Limit concurrent KnowledgeHub original downloads to one per API process initially.
- Keep registration lifecycle, document deletion lifecycle, and future processing lifecycle separate.

Approval of this document accepts these proposed defaults together, unless the owner asks for a specific amendment.

## 3. Approaches Considered

### 3.1. Original-file storage

| Approach | Trade-off | Decision |
| --- | --- | --- |
| Extend the existing FileService namespace and lifecycle | Reuses actor-bound staging, SHA256 manifests, finalize, preview, delete receipts, private storage, and existing Gateway boundary. Requires a carefully scoped namespace extension. | **Selected.** Matches the approved Master and P03 brief. |
| Proxy file bytes through FastAPI and store them in KnowledgeHub | Adds a second byte-transfer hop and makes Python responsible for buffering/forwarding files that FileService already handles. Complicates progress and memory behavior. | Not selected. |
| Add a separate KnowledgeHub storage directory, object store, or direct filesystem access | Creates a second storage authority and bypasses FileService security/operations. | Rejected. |

### 3.2. Registration consistency

| Approach | Trade-off | Decision |
| --- | --- | --- |
| Create the document row only after FileService finalization | A lost response or database failure can leave a finalized original with no durable KnowledgeHub record to retry against. | Not selected. |
| Create an upload-intent/document row first, then stage, finalize, and update that same row | Gives the flow a stable document ID and upload-session idempotency key. Requires explicit intermediate states and retry handling. | **Selected.** |

### 3.3. Original download transport

| Approach | Trade-off | Decision |
| --- | --- | --- |
| Reuse the existing bounded unary PreviewFile RPC | Smallest compatible change. FileService already limits reads to 50 MiB and configures a 128 MiB gRPC message limit. It buffers bytes, so concurrency and Python receive-message size must be bounded. | **Selected for P03 MVP**, with a one-download-per-process default and explicit memory checks. |
| Add a new server-streaming FileService RPC | Better for large files and concurrency, but adds a new protobuf contract, stream lifecycle, mid-stream error behavior, and more implementation/testing work. | Deferred unless measured memory/latency proves unary preview insufficient. |

## 4. Current Source Baseline

Read-only inspection of branch feature/knowledgehub-learning, head 990e307be1e2850a1a0792fdb094299f8e18c268:

### 4.1. FileService staging and storage

- src/services/Blocks.FileService/Controllers/UploadFileController.cs
  - Authenticated POST /api/UploadFile.
  - Multipart fields currently include files and FolderName.
  - Both request and multipart limits are currently 50 MiB.
- src/services/Blocks.FileService/Services/CoreFeature/UploadFile/UploadFileService.cs
  - Insert derives ActorId from the validated JWT name claim.
  - Staging writes a private Temp batch and records file ID, original name, extension, byte length, and SHA256 in the manifest.
  - Actual bytes are bounded by FileStorage.MaxFileBytes (50 MiB).
  - The current Insert can replace an existing Staged manifest; it does not yet guarantee same-session/same-content retry semantics.
  - UploadDataAsync finalizes only System/Attachments today.
  - DeleteDataAsync moves an active file to the private Deleted area and writes a retry receipt; it does not permanently purge the bytes.
  - PreviewFileAsync reads the original into a bounded byte array.
- src/services/Blocks.FileService/Infrastructure/Storage/FileStorage.cs
  - Root is an absolute private path, outside web root.
  - ResolveActiveKey recognizes only System Avatar and System Attachments namespaces.
  - MaxFileBytes is 50 MiB.
- src/services/Blocks.FileService/Infrastructure/Storage/UploadSessionStore.cs
  - Manifest is actor-bound and validated.
  - Current target validation only permits System Attachment or Avatar.
  - A singleton WriteGate serializes session mutations. The source comment explicitly defers per-session locks until contention is measured.
- src/services/Blocks.FileService/DTOs/Common/CommonConst.cs
  - Current document allowlist does not include .md.
- src/services/Blocks.FileService/Protos/file.proto
  - UploadData, DeleteData, and PreviewFile RPCs already exist.
  - ModelAttachmentProto currently uses fields 1-8 and does not return the manifest SHA256.
- src/services/Blocks.FileService/Configs/ConfigService.cs
  - FileService gRPC server send/receive message limits are currently 128 MiB.
- src/services/Blocks.FileService/Services/gRPC/FileGrpcService.cs
  - RPC methods are authenticated.
  - The service maps business failures to gRPC status codes.
  - PreviewFile copies the buffered bytes into a protobuf ByteString.

### 4.2. Existing security and routing boundaries

- src/services/Blocks.FileService/Configs/ConfigureAuthentication.cs accepts the internal x-service-authorization bearer metadata.
- src/services/Blocks.ApiGateway/Middlewares/FileServiceBoundary.cs permits selected HTTP FileService routes and blocks FileProto gRPC through the public Gateway. P03 must preserve this boundary.
- The existing browser upload endpoint is exposed through the /File Gateway prefix. Browser code must not call a private FileService host.
- src/services/Blocks.KnowledgeHubService/src/knowledgehub/identity.py validates the existing HS256 JWT and derives ActorId from the name claim.
- src/services/Blocks.KnowledgeHubService/src/knowledgehub/permission.py forwards the current user token to SystemService through per-request x-service-authorization metadata.
- src/platform/Blocks.AppHost/AppHost.cs already hosts FileService, SystemService, KnowledgeHub, Gateway, and Web. KnowledgeHub currently has a SystemService gRPC reference but no FileService client configuration/reference.
- src/services/Blocks.KnowledgeHubService/src/knowledgehub/schemas.py still returns DocumentCount=0.
- src/apps/Blocks.Web/src/lib/api.ts has a 30-second Axios default timeout, a JSON default content type, a generic post, and a blob-oriented downloadFile helper. Multipart upload must explicitly let the browser/Axios generate the boundary. The download helper currently exposes only a narrow subset of request options.

### 4.3. P02 handoff requirements

P02 outcome explicitly hands off these requirements:

- Every document read, write, download, and registration resolves through an active, owned collection (owner_id and deleted_at IS NULL).
- Define coordination/compensation when collection soft-delete races with FileService stage/finalize.
- Do not physically delete uncertain originals.
- Replace the hard-coded DocumentCount=0 with a real active-document count.

## 5. Scope

### Included

- Approved KnowledgeHub FileService namespace.
- .md support and target-specific PDF/Markdown/TXT validation.
- Authenticated Python-to-FileService gRPC client over TLS.
- Stage/finalize/register upload lifecycle.
- Trusted file references and source SHA256.
- Owner-scoped document persistence and active-collection predicates.
- Document list, metadata search, filters, and pagination.
- Real browser upload progress.
- Authorized original download.
- Document-level logical deletion and persisted file-cleanup outcome.
- Collection deletion race handling without cascading to original files.
- Real collection DocumentCount.
- React repository and upload UI using installed shadcn/Radix primitives.
- DB-free unit/contract tests and explicitly authorized live acceptance.

### Excluded

- PDF parsing, Markdown/TXT parsing, OCR, extraction, normalization, chunking, embeddings, keyword content search, summaries, Ask, Research, citations, and document processing.
- Durable worker implementation, job claiming, leases, retries, and worker service identity. These belong to P04.
- Physical purge of files in FileService Deleted.
- Automatic purge of abandoned Temp sessions.
- Collection restore, sharing, workspaces, and administrator cross-owner access.
- Public/static file URLs, direct filesystem/storage access, or a second storage service.
- Uploading arbitrary office formats, ZIP/RAR, images, audio, or video into KnowledgeHub.
- New generic upload framework or global UI rewrite.

## 6. Domain And Lifecycle Contract

### 6.1. Three independent lifecycles

P03 must not overload one status field for unrelated operations.

1. **Registration lifecycle** says whether the original file has been staged, finalized, and registered in KnowledgeHub.
2. **Document deletion lifecycle** says whether the document has been logically deleted and whether FileService has completed the file-level move to Deleted.
3. **Processing lifecycle** belongs to P04/P05 and later. P03 must not claim READY or invent parsing progress.

P03 does not add a processing status column unless the owner approves a specific need. P04 owns that extension.

### 6.2. Registration states

Proposed registration_status values:

| State | Meaning | Visible in an active collection repository? |
| --- | --- | --- |
| AWAITING_UPLOAD | Intent exists; browser staging may not have completed. | Yes |
| REGISTERING | A registration attempt owns a short lease and is finalizing with FileService. | Yes |
| REGISTRATION_FAILED | The last attempt failed; same intent/session can be retried. | Yes |
| REGISTERED | Trusted FileService reference and metadata are committed in KnowledgeHub. | Yes |
| BLOCKED_PARENT_DELETED | Parent collection was deleted before FileService finalization; no active document was registered. | No; parent is deleted |
| PARENT_DELETED_RETAINED | FileService finalization completed, but collection deletion won before registration commit. Trusted reference is recorded for retention/reconciliation; it is not an active repository document. | No; parent is deleted |

Transitions:

~~~text
AWAITING_UPLOAD
      |
      v
REGISTERING -------> REGISTERED
      |
      +------------> REGISTRATION_FAILED
      |
      +------------> BLOCKED_PARENT_DELETED
      |
      +------------> PARENT_DELETED_RETAINED
~~~

A stale REGISTERING attempt may be reclaimed after its registration lease expires. Only the attempt that owns the current attempt ID may commit its result.

### 6.3. Document deletion states

Use deleted_at as the document logical-deletion marker. Do not add a second boolean such as is_deleted.

Proposed cleanup_status values:

- NOT_REQUESTED: document has not been explicitly deleted.
- PENDING: logical deletion committed; FileService DeleteData has not been confirmed.
- COMPLETED: FileService confirms the active key has been moved to its private Deleted area.
- FAILED: last cleanup attempt failed; the trusted key remains stored for reconciliation.

Document-level deletion is not physical purge. FileService DeleteData moves the active original into its private Deleted area and records a receipt. P03 never permanently removes bytes from Deleted.

Only a REGISTERED document in an active collection can be explicitly deleted through the P03 user API. Pending upload/registration rows must not expose a delete action that would silently strand a staged session.

### 6.4. Collection deletion policy

When a collection is soft-deleted:

- collections.deleted_at is set by the existing P02 behavior.
- Do not set documents.deleted_at as a cascade.
- Do not change document cleanup_status.
- Do not call FileService DeleteData.
- Do not remove original files from the active FileService namespace.
- All normal document APIs must immediately stop resolving documents through that parent collection.
- P04 observes the deleted parent and cancels/fences processing.
- P06 hard-deletes all vector versions belonging to the deleted collection.
- P08 defines historical answer/citation retention and rendering.
- No restore endpoint is introduced.

A document can therefore remain REGISTERED with deleted_at IS NULL while being inaccessible because its parent collection is deleted. This is intentional retention, not a repository leak.

## 7. FileService Contract

### 7.1. Namespace

Proposed canonical logical key:

~~~text
KnowledgeHub/Documents/{documentId}/{fileId}.{extension}
~~~

Example shape only:

~~~text
KnowledgeHub/Documents/<document-guid>/<file-guid>.pdf
~~~

Rules:

- documentId is generated by KnowledgeHub, never supplied as a storage path.
- fileId is generated by FileService.
- Both IDs must be nonzero canonical GUIDs.
- Extension is lowercase and one of .pdf, .md, .txt.
- No slashes, backslashes, drive prefixes, traversal segments, or client-controlled physical filenames.
- The key is an internal trusted reference, not a URL and not returned to the browser.

FileService changes must be narrowly scoped:

1. FileStorage.ResolveActiveKey recognizes exactly the KnowledgeHub Documents shape and maps it to the existing private Files area.
2. UploadSessionStore.ValidateSessionShape permits the exact target tuple Kind=Document, Service=KnowledgeHub, Module=Documents, with one file and a nonzero RelatedId.
3. UploadFileService.UploadDataAsync accepts the KnowledgeHub/Documents target only when the staged session has the matching KnowledgeHub upload purpose.
4. ReceiptKeyHash canonicalizes KnowledgeHub keys independently; it must not fall through to the existing System Attachments canonicalization.
5. RejectDeletedTarget uses the same canonical key as deletion receipts, preventing a deleted target from being resurrected by finalize retry.
6. Existing System Attachment and Avatar behavior remains compatible.

### 7.2. Stage HTTP contract

Continue using the existing Gateway-exposed HTTP endpoint:

~~~text
POST /File/api/UploadFile
Content-Type: multipart/form-data
Authorization: Bearer <current user token>
~~~

P03 multipart fields:

- files: exactly one file for a KnowledgeHub document.
- FolderName: the UUID UploadSessionId returned/registered by the KnowledgeHub upload-intent API.
- UploadPurpose: fixed value KnowledgeHubDocument.

UploadPurpose is a restrictive scope marker for validation, not an authorization credential. Persist it in the upload-session manifest so finalization can verify that the staged purpose matches the requested namespace. FileService must still bind the staged session to the ActorId from the verified JWT. Only KnowledgeHub backend gRPC finalization can turn the staged session into an active KnowledgeHub key.

**Authorization boundary requiring owner confirmation:** the existing generic stage HTTP endpoint authenticates the user but does not itself call KnowledgeHub CheckPermission. Under the proposed MVP default, the upload-intent and finalize APIs enforce KnowledgeHub ADD (2), while stage remains an actor-bound, temporary-only operation; public Gateway still blocks FileProto gRPC, so staging alone cannot publish a document. This means an authenticated user without KnowledgeHub ADD could still allocate bounded Temp storage by calling the generic stage route directly. If that residual resource-abuse path is unacceptable, P03 must add a purpose-specific SystemService ADD check in FileService before writing Temp, or design a one-time upload grant. Do not treat UploadPurpose as proof of ADD permission.

The FileService stage endpoint currently accepts multiple files and has a 50 MiB request-body limit including multipart framing. Proposed P03 behavior:

- KnowledgeHub purpose accepts exactly one file.
- Actual file bytes remain limited to 50 MiB.
- Increase the multipart/request envelope limit to 51 MiB to leave room for multipart headers and boundaries; do not increase the actual file-byte limit.
- Validate filename length and reject path/control characters consistently in Python and FileService.
- Validate .pdf, .md, .txt case-insensitively for KnowledgeHub purpose.
- Browser MIME is untrusted. FileService/server derives stored content type from the validated extension; parsing later validates the actual content.

Existing callers that omit UploadPurpose retain their existing behavior. Unknown purpose values fail closed.

### 7.3. Stage retry semantics

The current Insert implementation can replace an existing Staged manifest. P03 must make retries safe for the KnowledgeHub purpose.

For an existing UploadSessionId:

- If actor, purpose, original filename, actual byte length, and SHA256 match, return an acknowledgement without replacing the manifest or creating a second batch.
- If any of those values differ, return a conflict (409 application/business semantics).
- If the session is Finalizing or Finalized and the same staged identity is presented, return an idempotent acknowledgement; never replace it.
- A different actor cannot inspect or replace another actor's session.

This makes a browser retry after a lost HTTP acknowledgement safe. The UploadSessionId is an idempotency identifier only; it does not authorize access.

### 7.4. Finalize RPC and trusted response

Reuse the existing internal RPC:

~~~protobuf
rpc UploadData (UploadDataRequest) returns (UploadDataResponse);
~~~

KnowledgeHub supplies server-owned values:

~~~text
related_id   = document.id
service_path = KnowledgeHub
folder_name  = Documents
temp_folder  = document.upload_session_id
~~~

The browser never supplies service_path, folder_name, related_id, or a storage key to the finalization RPC.

The returned attachment must be checked against the intent row:

- Expected document RelatedId.
- Exactly one attachment.
- Nonzero FileId.
- Expected KnowledgeHub/Documents key prefix and document ID.
- Expected filename and extension.
- Actual size equals the staged/declared size and is within the limit.
- SHA256 is 64 hexadecimal characters.
- No unrecognized namespace or arbitrary path is accepted.

The current ModelAttachmentProto has fields 1-8 and the staged manifest already stores SHA256. Proposed additive wire change:

~~~protobuf
message ModelAttachmentProto {
  // Existing fields 1-8 remain unchanged.
  string source_sha256 = 9;
}
~~~

FileService should expose a FileService-specific finalized result containing the existing attachment metadata plus the manifest SHA256. Avoid changing the shared Blocks.Shared ModelAttachment solely to carry this KnowledgeHub-specific trust metadata. Existing SystemService consumers may ignore the new additive field; generated protobuf consumers and compatibility checks must be updated and tested.

### 7.5. Delete and preview RPCs

Reuse:

~~~protobuf
rpc DeleteData (DeleteDataRequest) returns (DeleteDataResponse);
rpc PreviewFile (PreviewFileRequest) returns (PreviewFileResponse);
~~~

- DeleteData receives only a storage key loaded from the KnowledgeHub database after authorization.
- PreviewFile receives only a storage key loaded from the KnowledgeHub database after authorization.
- Never accept file_url or file_paths from a browser request.
- FileService's actor authentication does not replace KnowledgeHub collection ownership checks.
- Preserve existing FileService receipt behavior and error mapping.

### 7.6. Download size and memory boundary

Current FileService limits original reads to 50 MiB and its gRPC server is configured for 128 MiB messages. PreviewFile is unary and buffers the file in FileService before returning bytes.

For the P03 MVP:

- Keep the maximum file size at 50 MiB.
- Configure the Python gRPC channel receive limit to at least 64 MiB for PreviewFile responses.
- Keep the FileService 128 MiB server limit and test the actual Python-to-.NET call.
- Use a bounded gRPC deadline and propagate request cancellation.
- Limit concurrent KnowledgeHub PreviewFile calls to one per API process initially.
- Return the bytes as a private, non-cacheable HTTP attachment; do not expose a static FileService URL.
- Add a memory/large-file check to acceptance. If measured memory is unacceptable, stop and approve a streaming RPC design rather than silently raising limits or removing bounds.

## 8. Python Runtime And Authenticated RPC

### 8.1. Configuration and lifecycle

Add required settings following P01's validated configuration pattern:

- KNOWLEDGEHUB_FILE_GRPC_URL: internal HTTPS FileService endpoint.
- KNOWLEDGEHUB_FILE_GRPC_CA_FILE: absolute public CA PEM path.
- A bounded FileService RPC timeout setting, with separate operation overrides if needed.

AppHost must:

- Add the FileService reference to the KnowledgeHub resource.
- Supply the internal HTTPS endpoint and CA configuration without embedding secret values.
- Preserve existing SystemService endpoint/configuration.
- Keep FileService gRPC private; do not add a public Gateway route.

Create one grpc.aio secure channel and FileService stub during FastAPI lifespan. Close the owned channel on shutdown even if another resource cleanup fails. /health should include a bounded FileService channel readiness check in addition to the existing SystemService and database checks; /alive remains independent.

### 8.2. Per-request token forwarding

For synchronous user-initiated FileService RPCs, forward the currently authenticated user's token as per-call metadata:

~~~text
x-service-authorization: Bearer <current validated user token>
~~~

Rules:

- Use the token from AuthenticatedUser produced by P01.
- Add metadata per RPC call, not as mutable channel-global metadata.
- Never store the JWT in documents, upload manifests, jobs, logs, or retry records.
- Use TLS and the configured CA.
- Set a deadline for every RPC.
- Propagate FastAPI request cancellation to the RPC.
- Map gRPC status to safe application errors: Unauthenticated -> 401; PermissionDenied -> 403; NotFound -> 404; InvalidArgument -> 400; FailedPrecondition -> 409; ResourceExhausted -> 413; Unavailable/DeadlineExceeded/Internal -> safe 503.
- Do not turn timeout or transport failure into permission success.

Microsoft's gRPC guidance documents bearer metadata on calls and recommends explicit deadlines/cancellation for bounded calls. See the references at the end of this document.

### 8.3. Worker identity is not solved here

P03 RPCs are synchronous and initiated by an authenticated user request. P04 must separately define durable worker access after the user's JWT expires.

P04 must not:

- Store user JWTs for later use.
- Fabricate an actor or use a default identity.
- Reuse a stale request token.
- Mount/read FileService storage directly.
- Treat a storage key as authorization.

Service identity/delegation is a P04/P03-P04 gate, not an implicit consequence of forwarding the current user's token.

## 9. Database Design

### 9.1. Database-first sequence

Propose one reviewed SQL file under docs/database/ for public.documents.

- Owner writes SQL.
- Agent reviews SQL before application.
- Record the reviewed SQL in Git.
- Owner explicitly authorizes the exact target database and operation.
- Apply only after authorization.
- Owner writes explicit SQLAlchemy mappings matching the actual schema.
- Do not use Alembic bootstrap, create_all(), startup DDL, or a dedicated test database.

No live database mutation is authorized by this spec.

### 9.2. Proposed documents table

Proposed columns:

| Column | Type | Rule |
| --- | --- | --- |
| id | UUID | Primary key; generated by KnowledgeHub. |
| collection_id | UUID | NOT NULL FK to collections(id) with ON DELETE RESTRICT; never cascade. |
| upload_session_id | UUID | NOT NULL, unique; client-generated idempotency identifier bound to this row and actor-owned collection. |
| title | VARCHAR(255) | Server-derived from validated original filename without extension. No rename feature in P03. |
| original_filename | VARCHAR(255) | Required, validated basename; never a storage path. |
| file_extension | VARCHAR(10) | Lowercase .pdf, .md, or .txt. |
| content_type | VARCHAR(127) | Server-derived from extension; informational, not authorization evidence. |
| declared_size_bytes | BIGINT | Positive and at most 50 MiB; supplied at upload intent and checked against finalization. |
| file_id | UUID NULL | FileService-generated ID; populated only after trusted finalization. |
| storage_key | TEXT NULL | Internal canonical FileService key; never returned to browser. |
| size_bytes | BIGINT NULL | Actual size from FileService manifest. |
| source_sha256 | CHAR(64) NULL | Trusted SHA256 from FileService manifest, lowercase hexadecimal. |
| registration_status | VARCHAR(40) | One of the registration states in section 6.2. |
| cleanup_status | VARCHAR(20) | One of the cleanup states in section 6.3. |
| registration_attempt_id | UUID NULL | Fences concurrent/stale finalization attempts. |
| registration_lease_until | TIMESTAMPTZ NULL | Expiry of the current registration attempt lease. |
| last_error_code | VARCHAR(64) NULL | Safe stable category; never raw exception text or storage path. |
| last_error_at | TIMESTAMPTZ NULL | Last failed registration/cleanup time where applicable. |
| created_at | TIMESTAMPTZ | Database-generated. |
| updated_at | TIMESTAMPTZ | Database-maintained on mutation. |
| registered_at | TIMESTAMPTZ NULL | Set only after successful active-collection registration. |
| deleted_at | TIMESTAMPTZ NULL | Document-level logical deletion only; collection deletion does not set it. |

Ownership is resolved by joining the document to its parent collection. Do not accept owner_id in request bodies. Do not add a duplicate owner column unless a concrete query/performance need is demonstrated and a consistency constraint is designed.

### 9.3. Constraints and indexes

Propose:

- Primary key on id.
- FK collection_id -> collections.id ON DELETE RESTRICT; no ON DELETE CASCADE.
- Unique upload_session_id.
- Unique partial index on file_id WHERE file_id IS NOT NULL.
- Unique partial index on storage_key WHERE storage_key IS NOT NULL.
- Check declared_size_bytes > 0 AND declared_size_bytes <= 52428800.
- When present, check size_bytes > 0 AND size_bytes <= 52428800.
- Check extension is one of .pdf, .md, .txt.
- Check SHA256 is exactly 64 hexadecimal characters when present.
- Check registration and cleanup states against their allowed values.
- Active collection repository index on (collection_id, created_at DESC, id DESC) WHERE deleted_at IS NULL.
- Recovery index for stale REGISTERING/REGISTRATION_FAILED rows.
- Cleanup index for cleanup_status IN ('PENDING','FAILED') on logically deleted documents.

PostgreSQL partial indexes are appropriate for indexes over active rows, but the query predicate must match the index predicate. See PostgreSQL documentation reference below.

### 9.4. DocumentCount

Replace P02's hard-coded DocumentCount=0 with a real aggregate.

Count only documents satisfying all of:

- The collection is active and owned by the verified actor.
- documents.deleted_at IS NULL.
- registration_status = REGISTERED.

Do not count upload intents that have not been registered. Do not issue one count query per collection; use a grouped aggregate or correlated subquery in the collection list/detail query.

A soft-deleted collection is not returned by normal collection APIs. Its retained document rows do not appear in active collection counts.

## 10. Upload And Registration API

All JSON endpoints remain under /api/knowledgehub and use the standard response envelope. The browser calls Gateway, never a hard-coded Python or FileService host.

### 10.1. Create upload intent

~~~text
POST /api/knowledgehub/collections/{collection_id}/documents/upload-intents
Permission: knowledgehub ADD (2)
~~~

Request:

~~~json
{
  "UploadSessionId": "nonzero UUID generated once by the browser",
  "OriginalFileName": "architecture-notes.pdf",
  "DeclaredSizeBytes": 123456
}
~~~

Rules:

- Validate JWT and ADD permission before database access.
- Derive actor only from the verified JWT.
- Resolve an active collection owned by that actor.
- Validate UUID, filename, extension, and declared size.
- The browser-supplied UploadSessionId is only an idempotency key and FileService Temp folder ID; it is not actor identity or proof of access.
- Generate DocumentId on the server.
- Insert an AWAITING_UPLOAD row bound to collection and UploadSessionId before FileService staging.
- A repeated request with the same UploadSessionId, actor, collection, filename, and declared size returns the same DocumentId.
- Reusing that UploadSessionId with different metadata/collection returns a safe conflict; do not reveal another actor's row.
- No storage key or FileService path is accepted.

Successful Data:

~~~json
{
  "DocumentId": "server-generated UUID",
  "UploadSessionId": "same upload session UUID",
  "RegistrationStatus": "AWAITING_UPLOAD"
}
~~~

### 10.2. Browser stage upload

After receiving the intent, the browser posts one file to /File/api/UploadFile through Gateway with:

- files: selected File.
- FolderName: UploadSessionId.
- UploadPurpose: KnowledgeHubDocument.

The existing authenticated Blocks API client supplies the user's bearer token. The frontend must use multipart FormData and must not hard-code the multipart boundary. Because the shared Axios instance defaults to JSON, the upload adapter must explicitly allow Axios/browser FormData handling rather than sending a JSON content type.

The stage response is only an acknowledgement. It does not mean the document is registered or READY.

### 10.3. Finalize and register

~~~text
POST /api/knowledgehub/documents/{document_id}/finalize
Permission: knowledgehub ADD (2)
~~~

No storage path or upload session is accepted in the request body. The backend loads both from the document intent row.

Flow:

1. Validate JWT and ADD permission.
2. Load the document intent by ID through its parent collection owner. A missing or foreign-owned intent returns the uniform 404. If the owned parent collection is already soft-deleted, set BLOCKED_PARENT_DELETED, do not call FileService, and return a safe unavailable/not-found result. Otherwise continue only when collection.deleted_at IS NULL.
3. Atomically claim a registration attempt by setting REGISTERING, a fresh attempt ID, and a lease expiry. A concurrent active attempt returns a pending/conflict result; a stale lease can be reclaimed.
4. Commit the attempt claim before the external RPC. Do not hold a database transaction over gRPC.
5. Call FileService UploadData with server-fixed target KnowledgeHub/Documents, RelatedId equal to DocumentId, and TempFolder equal to UploadSessionId.
6. Validate the returned trusted attachment and SHA256 against the intent.
7. Open a new database transaction. Lock/recheck the parent collection row and verify it is still active and owned by the actor.
8. If the collection is still active, persist file_id, storage_key, actual size, SHA256, content type, REGISTERED, and registered_at. Clear attempt/error fields.
9. If the collection became deleted while FileService was finalizing, persist the trusted returned reference and mark PARENT_DELETED_RETAINED. Do not expose it through normal repository APIs and do not call FileService DeleteData.
10. Commit before returning success.

Idempotency:

- Repeating finalize for an already REGISTERED document returns the same DTO; it does not create a new file reference.
- If FileService finalizes successfully but the KnowledgeHub DB commit fails, keep the intent and retry the same UploadData request with the same DocumentId and UploadSessionId. FileService's same-target finalized retry must return the same trusted key and metadata.
- Never generate a new DocumentId on retry.
- A target mismatch is a conflict.
- On a FileService error, if the attempt ID still matches, set REGISTRATION_FAILED, persist a safe error code, and clear the lease. A timeout is an uncertain result; retry with the same IDs.
- If FileService reports a partial/corrupt destination, preserve the Temp source and trusted intent; fail closed and require reconciliation. Do not delete an uncertain original.

### 10.4. Registration concurrency and leases

The database attempt ID fences late responses:

- Only the request holding the current registration_attempt_id may update the row.
- A request that lost its lease must not overwrite a newer attempt's result.
- Lease duration must exceed the configured FileService finalize RPC deadline.
- A timed-out call is an uncertain result, not proof that FileService did nothing.
- Retry reuses the same session and target, relying on FileService idempotency.

This is request-level registration recovery, not the P04 durable worker or a general job framework.

## 11. Collection Deletion And Finalization Race

This is a mandatory cross-service consistency case.

### 11.1. Normal ordering

- Upload intent checks active owned collection.
- Finalize checks active owned collection before calling FileService.
- FileService finalizes outside the DB transaction.
- The final KnowledgeHub transaction locks/rechecks the parent collection before registering the file reference.
- The existing P02 collection soft-delete update also locks/updates the collection row.

### 11.2. Race outcomes

**Finalize wins the final collection-row lock first:**

- Document registration commits as REGISTERED.
- Collection deletion may commit afterward.
- The collection is then hidden; the document row and original file remain retained.
- No FileService DeleteData call occurs.

**Collection deletion wins first:**

- Final registration sees deleted_at IS NOT NULL.
- If FileService has not been finalized, mark BLOCKED_PARENT_DELETED; do not finalize an active document. The staged Temp session may remain for later reconciliation.
- If FileService finalization already completed, persist the returned trusted reference and mark PARENT_DELETED_RETAINED. This records the retained original without publishing an active repository document.
- Do not call FileService DeleteData. This is required by the selected collection-retention policy.

In both outcomes, no normal document API can access the deleted collection or its documents.

## 12. Document Repository APIs

### 12.1. List/search/filter

~~~text
GET /api/knowledgehub/collections/{collection_id}/documents
Permission: knowledgehub VIEW (1)
Query:
  q
  registration_status
  page_index (default 1, minimum 1)
  page_size (default 20, range 1-100)
~~~

- Search only metadata: title and original_filename.
- Escape LIKE wildcard characters; use parameterized SQL.
- Do not search file content in P03. Content keyword search belongs to P05.
- Filter only the defined registration statuses.
- Include active registration rows so upload/finalize errors are visible.
- Exclude document deleted_at IS NOT NULL.
- Resolve through an active collection owned by the verified actor.
- Deterministic ordering: created_at DESC, id DESC.
- Out-of-range pages return an empty list, not a 404.
- Response paging shape follows P02 collection paging.

### 12.2. Document detail

~~~text
GET /api/knowledgehub/documents/{document_id}
Permission: knowledgehub VIEW (1)
~~~

Return only an active document whose parent collection is active and owned by the actor. A missing, deleted, or foreign-owned resource has the same 404 behavior.

### 12.3. Document DTO

Proposed public DTO:

- Id
- CollectionId
- Title
- OriginalFileName
- FileExtension
- ContentType
- SizeBytes
- RegistrationStatus
- CreatedAt
- UpdatedAt
- RegisteredAt

Do not expose file_id, storage_key, SHA256, upload manifest details, local paths, actor tokens, or cleanup receipt paths in the public DTO.

## 13. Authorized Original Download

~~~text
GET /api/knowledgehub/documents/{document_id}/download
Permission: knowledgehub VIEW (1)
~~~

Required order:

1. Validate JWT and VIEW permission.
2. Query the document by ID, deleted_at IS NULL, registration_status='REGISTERED', and join to an active collection owned by the verified actor.
3. Load the storage key from the database only.
4. Call FileService PreviewFile over private TLS gRPC with the current request token and bounded deadline.
5. Return raw bytes with:
   - Content-Disposition: attachment and a safely encoded original filename.
   - Server-derived content type.
   - Cache-Control: private, no-store.
   - X-Content-Type-Options: nosniff.
6. Never return a static/private FileService URL or storage key.

The download is a binary response, not the standard JSON envelope. Errors before response bytes are sent must preserve the existing safe application/transport behavior. The frontend blob helper must detect and unwrap soft JSON error envelopes even when the transport status is HTTP 200.

Because PreviewFile is buffered:

- Enforce the 50 MiB file limit end to end.
- Configure Python gRPC receive size to at least 64 MiB.
- Keep one concurrent original download per KnowledgeHub API process initially.
- Use a longer bounded download timeout than the ordinary 30-second JSON API timeout.
- Test a near-limit file and verify memory does not grow without bound.

If streaming is later required, design a separate FileService streaming RPC and its mid-stream failure contract; do not expose FileService storage directly.

## 14. Document Logical Deletion And File Cleanup

~~~text
DELETE /api/knowledgehub/documents/{document_id}
Permission: knowledgehub DELETE (4)
~~~

Required order:

1. Validate JWT and DELETE permission.
2. Resolve the document through its active owned collection.
3. Require registration_status='REGISTERED'.
4. Atomically set document deleted_at and cleanup_status='PENDING' while retaining file_id, storage_key, size, and SHA256.
5. Commit the KnowledgeHub transaction before FileService RPC.
6. Call FileService DeleteData with the one trusted storage key loaded from the database.
7. If FileService confirms success, update cleanup_status to COMPLETED.
8. If FileService fails or times out, retain PENDING/FAILED, preserve the trusted reference, and report that logical deletion succeeded but file cleanup is pending.

Consequences:

- The document is immediately inaccessible to all normal KnowledgeHub reads/downloads after the database commit.
- A failed FileService call does not resurrect the document.
- A retry uses the same key and relies on FileService deletion receipts.
- If FileService moved the file but the cleanup-status DB update failed, a retry can safely repeat DeleteData.
- No physical purge of the FileService Deleted area occurs in P03.

P03 persists the cleanup state and retry-safe operation. It does not add a durable background worker. P04 must decide whether the durable worker owns cleanup retries or whether a separate authorized operational reconciliation process is required. Do not leave pending cleanup as an untracked log-only condition.

## 15. Error And Response Semantics

JSON endpoints preserve the P01/P02 envelope:

- Ordinary validation, auth, permission, ownership, and business errors use the established application status/envelope convention.
- Expected FileService unavailable/deadline errors become safe application 503.
- Invalid file type/size maps to 400/413.
- Session/target mismatch maps to 409.
- Missing/foreign/deleted parent or document maps uniformly to 404.
- Unexpected programming/schema failures remain real HTTP 500 with a safe envelope.
- Gateway inability to reach KnowledgeHub remains a real transport failure.

Never expose raw exception text, SQL, storage paths, receipt filenames, JWTs, or gRPC metadata.

## 16. Frontend Contract And Mockup Fidelity

P03 turns the P02 Repository placeholder into a real repository while preserving the approved KnowledgeHub mockup hierarchy and existing Blocks MainLayout.

Proposed feature files under src/apps/Blocks.Web/src/features/knowledgehub/:

~~~text
api/
  documents.api.ts
types/
  documents.types.ts
hooks/
  document-query-keys.ts
  useDocuments.ts
  useDocumentMutations.ts
  useDocumentUploads.ts
components/
  DocumentUploader.tsx
  UploadProgressList.tsx
  DocumentRepository.tsx
  DocumentRow.tsx
  DocumentDeleteDialog.tsx
~~~

Reuse existing primitives; do not create a new generic design system or overwrite shadcn components:

- ui/card, ui/button, ui/input
- ui/progress, ui/badge
- ui/table / ui/data-table
- ui/dialog, ui/skeleton, ui/sonner
- Lucide icons

### 16.1. Upload interaction

- Accept .pdf,.md,.txt in the file picker and drop zone.
- Allow selecting multiple files, but create one upload intent/session per file.
- Queue uploads sequentially in P03 because FileService's current singleton WriteGate serializes staging/finalize/delete mutations globally. Do not show concurrent progress that is actually blocked behind the same gate.
- Use Axios onUploadProgress for bytes transferred to the Gateway/FileService.
- When byte transfer reaches 100%, switch to a separate “Đang đăng ký” state while finalization/DB registration runs. Do not fabricate a combined percentage.
- Use the same UploadSessionId for retries.
- AbortController cancels the browser request, but abort is not proof the server did not receive or stage the file. Refetch/retry the same intent before claiming failure.
- Do not mark success until the registration endpoint returns a persisted REGISTERED document.
- A page refresh must recover document registration state from the API, not a local array of fake documents.
- If the file bytes are no longer present in the browser after refresh, retry finalize first; only ask the user to reselect the file if FileService confirms the session is missing.

### 16.2. Repository interaction

- Search by filename/title only.
- Filter by actual registration status.
- Paginate from the server.
- Show real file size, filename, registration status, and timestamps.
- Download and delete actions are available only for registered, active documents.
- Pending/failed registration rows show truthful retry/reselect guidance.
- No page count, parser status, chunk count, READY badge, embedding status, or fake processing percentage in P03.
- DocumentCount comes from the real selected collection DTO; do not locally increment it optimistically.
- Actor and collection identity remain part of query keys. Preserve P02 cache-boundary and stale-mutation protections.
- On actor switch or collection change, cancel stale reads and do not render another actor's cached documents.
- Use accessible labels, keyboard-operable dialogs, pending-state protection, and visible server errors.

### 16.3. API client integration

- Use existing src/lib/api.ts and API_ENDPOINTS.
- Add a narrowly scoped multipart upload helper/configuration; do not duplicate token refresh logic.
- Let Axios/browser set the multipart boundary.
- Extend the download helper narrowly to support the required timeout and blob-envelope handling.
- Keep the browser on Gateway URLs only. The browser never receives the internal FileService gRPC endpoint.

## 17. Acceptance Requirements

| ID | Requirement | Required evidence |
| --- | --- | --- |
| P03-01 | KnowledgeHub namespace is accepted and System namespaces remain compatible. | FileService path/session/receipt tests. |
| P03-02 | .pdf, .md, .txt accepted; unsupported extensions and multiple files per KnowledgeHub session rejected. | FileService validation tests. |
| P03-03 | Stage retry with same session and same content is idempotent; changed content/actor/target is rejected. | FileService session tests. |
| P03-04 | Finalize returns stable FileId/key/SHA256 for same session and target; wrong target is rejected. | FileService lifecycle tests and proto contract tests. |
| P03-05 | FileService RPC is TLS-authenticated and current user token metadata is isolated per call. | Python mocked RPC tests and real private gRPC verification. |
| P03-06 | Upload intent and registration require ADD and active collection ownership. | Python endpoint/SQL predicate tests and two-actor live check. |
| P03-07 | Failed finalize or DB commit can be retried with the same IDs without duplicate document/file references. | Failure-injection and idempotency tests. |
| P03-08 | Collection-delete/finalize race has both defined outcomes; no uncertain original is deleted. | Transaction/SQL tests and controlled integration test when authorized. |
| P03-09 | List/detail/search/filter/paging and DocumentCount use active owner-scoped data. | SQL compilation and endpoint tests. |
| P03-10 | Cross-actor download and delete fail before FileService is called. | Two-actor negative tests; assert zero unauthorized RPCs. |
| P03-11 | Download returns original bytes only for an authorized active document; response headers prevent caching/sniffing. | Mocked and real FileService gRPC download tests. |
| P03-12 | Document deletion commits logical removal first; FileService failure remains visible as pending cleanup and is retry-safe. | Transaction/failure tests and deletion receipt tests. |
| P03-13 | Collection soft-delete preserves document rows and original files; no FileService DeleteData call occurs. | SQL and FileService call-count tests. |
| P03-14 | Upload progress reflects actual transferred bytes; registration has a separate pending state. | React tests using progress events and deferred API responses. |
| P03-15 | Repository UI uses actual data, existing shadcn primitives, and honest empty/loading/error states. | Vitest, build/lint, desktop/mobile browser captures. |
| P03-16 | Existing P01/P02, FileService, Gateway, and SystemService regressions remain green. | Relevant DB-free regression suites and owner-authorized live checks. |

### 17.1. Required negative and race cases

At minimum:

- Actor B cannot finalize Actor A's upload session.
- Actor B cannot register, list, download, detail, or delete Actor A's document.
- A valid token without the relevant KnowledgeHub action permission cannot register or delete.
- A guessed document UUID does not bypass ownership.
- A guessed storage key is never accepted from the browser.
- Collection soft-delete before upload intent prevents intent creation.
- Collection soft-delete before finalize prevents registration.
- Collection soft-delete racing after FileService finalize retains the original and records a non-active parent-deleted state.
- Retry after FileService finalize but before DB commit returns the same key and hash.
- Partial finalize preserves the Temp source; corrupted destination fails closed.
- FileService unavailable/timeout does not create false success.
- FileService DeleteData success followed by DB cleanup-state failure remains retryable.
- Deleted documents cannot be downloaded even while cleanup is pending.
- Collection deletion does not set document deleted_at or call FileService DeleteData.
- A 50 MiB boundary file does not exceed gRPC receive limits or create unbounded concurrent memory use.
- Existing System Attachment and Avatar flows remain unchanged.

## 18. Verification And Authorization Boundaries

DB-free tests can cover:

- SQL compilation and owner/active predicates.
- Mocked FileService RPC metadata, deadlines, cancellation, and error mapping.
- FastAPI request/response contracts.
- Registration state transitions and idempotency.
- FileService private filesystem fixtures and gRPC listeners.
- Gateway boundary behavior.
- React upload progress, API envelope, cache isolation, and repository states.

Real database/AppHost/Gateway/FileService acceptance requires owner-authorized disposable records and configuration. P00 explicitly declines a dedicated test database. Do not substitute the application database for an isolated test database or mutate live data without authorization.

Do not claim real permission, TLS, FileService, DB, or Gateway acceptance from mocked tests alone. Record PASS, FAIL, and NOT RUN separately.

## 19. Risks And Deferred Contracts

1. **Global FileService WriteGate:** staging/finalize/delete operations serialize. P03 frontend queues one upload at a time. A per-session lock redesign is not included without measured contention and a separate review.
2. **Buffered PreviewFile:** 50 MiB unary response has memory cost in FileService and Python. P03 bounds size, receive-message limit, timeout, and concurrency. Streaming is a future design if measurements require it.
3. **Multipart overhead:** request envelope must be larger than the actual file-byte cap; preserve the 50 MiB file limit.
4. **Stage-session retention:** an abandoned or parent-deleted Temp session may remain. P03 records the intent/state and never deletes uncertain data. P04/P11 must define safe Temp reconciliation.
5. **Pending document file cleanup:** P03 persists cleanup state and retry-safe operation; P04/P11 must assign the durable worker or authorized operational reconciliation owner.
6. **Worker access after JWT expiry:** P04 service identity/delegation is mandatory before asynchronous original reads.
7. **Collection deletion:** P04 cancels/fences processing; P06 hard-deletes all vector versions; P08 defines historical sessions/citations. P03 does not perform those operations.
8. **FileService single-writer deployment:** preserve the existing one-writer/private-persistent-volume assumption. Do not scale FileService horizontally against separate local storage roots.
9. **FileService JWT configuration:** verify the real AppHost FileService signing key/issuer/audience configuration matches SystemService. Missing/mismatched configuration must fail closed; never rely on a test fallback key in real runtime.
10. **Untrusted content:** P03 stores and downloads originals only. It does not parse, render, or execute uploaded content.

## 20. Learning Outcomes

The owner should be able to explain:

- Why upload acknowledgement is not document registration.
- Why an upload intent is persisted before FileService finalization.
- Why a stable UploadSessionId and DocumentId are necessary for retry.
- Why the database transaction must not remain open across gRPC.
- Why FileService token authentication does not replace KnowledgeHub collection ownership.
- Why document deletion and collection deletion have different file-retention behavior.
- How a partial cross-service failure is represented without deleting uncertain originals.
- Why real upload progress and registration progress are different states.

## 21. Next Part Dependencies

- **P04:** durable worker/job lifecycle; observe collection soft deletion, cancel/fence work, define worker identity/delegation after user token expiry, and decide how to reconcile stale registration/cleanup/temp states.
- **P05:** parse text PDF first, then Markdown/TXT; preserve source provenance; do not mark READY before usable indexed content exists.
- **P06:** hard-delete every vector version belonging to a soft-deleted collection; fence in-flight work so vectors cannot be reintroduced.
- **P08:** define historical answer/citation retention after source or parent collection deletion.
- **P11/P12:** integrated reliability, security, visual parity, and local acceptance.

## 22. External References

- Microsoft Learn, Authentication and authorization in gRPC for ASP.NET Core: https://learn.microsoft.com/en-us/aspnet/core/grpc/authn-and-authz
- Microsoft Learn, Reliable gRPC services with deadlines and cancellation: https://learn.microsoft.com/en-us/aspnet/core/grpc/deadlines-cancellation
- PostgreSQL documentation, Partial Indexes: https://www.postgresql.org/docs/16/indexes-partial.html

## 23. Approval Boundary

This document is DRAFT until the owner approves it.

After approval, use Superpowers writing-plans to prepare a manual, small-step implementation plan. The plan must cover:

- Concepts to learn before each workstream.
- Exact files/callers to inspect and create/update.
- Observable behavior for each small task.
- DB-free tests and commands.
- Owner-authorized live verification gates.
- Expected results and common traps.

Do not execute the implementation plan, edit product code, install dependencies, apply SQL, alter permissions, deploy, or start a worker as part of the planning step.
