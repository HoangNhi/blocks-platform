# KnowledgeHub P03-A: FileService Namespace And Upload Authorization - Implementation Plan

Date: 2026-11-21  
Status: PROPOSED - owner execution plan; review before starting  
Branch: feature/knowledgehub-learning  
Accepted specification: docs/superpowers/specs/2026-11-21-knowledgehub-p03-file-lifecycle-document-repository-design.md  
Parent plan: docs/superpowers/plans/2026-11-21-knowledgehub-p03-implementation-plan.md  
Repository rules: AGENTS.md

## Goal

Extend the existing Blocks FileService without creating a second storage system. A KnowledgeHub-purpose upload must be authorized by SystemService before MVC parses the multipart form and before FileService writes a session, batch, file, or manifest into its managed Temp area. Authorized files can then be finalized under the exact KnowledgeHub/Documents namespace, previewed, and deleted through the existing private storage lifecycle.

This workstream must leave legacy System Attachment and Avatar behavior unchanged.

## Architecture

~~~text
Browser
  |
  | POST /File/api/UploadFile
  | Authorization: Bearer <user JWT>
  | X-Upload-Purpose: KnowledgeHubDocument
  v
FileService authentication middleware
  |
  v
KnowledgeHubUploadPermissionFilter (IAsyncAuthorizationFilter)
  |
  | SystemProto.CheckPermission
  | x-service-authorization: Bearer <same current JWT>
  v
SystemService
  |
  | success=true only for KnowledgeHub ADD (2)
  v
MVC multipart model binding -> UploadFileController -> UploadFileService.Insert
  |
  v
Private Temp + actor-bound manifest
  |
  | internal authenticated gRPC UploadData
  v
KnowledgeHub/Documents/<document-id>/<file-id>.<ext>
  |
  +--> PreviewFile
  |
  +--> DeleteData -> private Deleted + retry receipt
~~~

The authorization filter runs before MVC model binding. It can prevent MVC from parsing/buffering IFormFile form fields and can prevent FileStorage Temp writes on denial. It cannot guarantee that the browser, Kestrel, or a reverse proxy has not already received/transmitted bytes at the network layer. Request-size limits remain mandatory.

## Tech Stack

- .NET 10 / C#.
- ASP.NET Core MVC authorization filters.
- Existing SystemProto gRPC contract via gRPC-Web client.
- Existing JWT bearer authentication.
- Existing FileStorage, UploadSessionStore, SHA256 manifest, finalize, and deletion receipts.
- Existing executable DB-free harness: test/FileService.RemovalChecks.

Do not add NuGet packages. Grpc.AspNetCore.Web, Grpc.Net.Client.Web, Grpc.Net.ClientFactory, Grpc.Tools, and Google.Protobuf already exist in Blocks.FileService.csproj.

## Specification

Read the accepted P03 specification, especially sections 4, 7, 17, 18, and 19. The owner-approved option A requires SystemService CheckPermission with:

- user_id = actor GUID derived from the validated JWT name claim.
- controller = "knowledgehub".
- action = 2 (ADD).
- metadata x-service-authorization: Bearer <current request JWT>.
- private HTTPS SystemService endpoint.
- bounded deadline and request cancellation.
- fail closed on false, unauthenticated, timeout, unavailable, or unexpected RPC failure.
- no managed Temp write or MVC form binding when permission fails.

Stage purpose is the HTTP header X-Upload-Purpose: KnowledgeHubDocument. Do not put the purpose marker in multipart form data.

## Global Constraints

- Do not modify the source SystemService system.proto contract; CheckPermission already exists.
- Generate the client from src/services/Blocks.SystemService/Protos/system.proto, not C# obj output.
- Do not expose SystemProto through API Gateway. FileProto remains blocked by FileServiceBoundary.
- Do not accept actor ID, controller, action, or bearer token from form/query fields.
- Derive actor ID from HttpContext.User after JWT authentication.
- Do not trust UploadPurpose as authorization by itself. It only selects the purpose-specific validation/permission path.
- No permission cache and no fail-open fallback.
- No new static/public storage path or physical purge.
- Keep the actual file-byte cap at 50 MiB. Only the HTTP/multipart envelope may rise to 51 MiB.
- Do not add .md to the global CommonConst allowlist if that would broaden unrelated upload targets. Add target-specific KnowledgeHub extension validation.
- Preserve older JSON manifests whose purpose field is absent.
- Preserve existing System/Attachments and System/Avatar behavior.
- Preserve audit logging. Authorization-filter short-circuiting can bypass action filters; explicitly test denied-attempt audit behavior.
- The owner writes all product code and tests.

## Review Focus Before Coding

1. Confirm all FileServiceHost.Build test fixtures supply JWT issuer, audience, and key. ConfigureAuthentication currently has a fallback key when Jwt:Key is absent; remove it so the service cannot silently authenticate with a test-only default.
2. Check actual local FileService and SystemService JWT issuer/audience/key configuration without printing or committing secrets. They must validate the same user tokens. Do not put secret values in AppHost.cs.
3. FileService already has fileService.WithReference(systemService) in AppHost and an AuditProto gRPC-Web client. The new SystemProto client should reuse the same private endpoint setting. Changing that setting also changes the existing audit client transport; regression-test audit delivery.
4. The permission filter must be an IAsyncAuthorizationFilter attached to UploadFileController.Post. Do not access Request.Form or bind IFormFile inside the filter. Read only the request header, authenticated principal, and Authorization header.
5. ASP.NET Core authorization filters run before MVC model binding. If the filter returns a result, the action and form binding must not execute. Handle expected errors inside the filter and set context.Result; do not throw from the authorization filter and assume an exception filter will catch it.
6. The existing AuditActionFilter is an action filter. A pre-model-binding authorization short-circuit may bypass it. Denied attempts must still be auditable through the existing AuditProto path without logging the JWT, file bytes, or storage key.
7. UploadSessionStore.WriteGate serializes staging/finalize/delete mutations globally. Keep P03 uploads sequential; do not redesign locks without a separate measured need.
8. ReceiptKeyHash currently has only Avatar and System Attachments canonicalization. A KnowledgeHub key must get its own explicit canonicalization branch.

## Task FS-00 - Preflight and inspect current call sites

**Learn:** MVC filter order, ASP.NET Core request pipeline, FileService private storage areas, and the existing RemovalChecks harness.

**Read:**
- src/services/Blocks.FileService/Controllers/UploadFileController.cs
- src/services/Blocks.FileService/Services/CoreFeature/UploadFile/IUploadFileService.cs
- src/services/Blocks.FileService/Services/CoreFeature/UploadFile/UploadFileService.cs
- src/services/Blocks.FileService/Infrastructure/Storage/UploadSessionStore.cs
- src/services/Blocks.FileService/Infrastructure/Storage/FileStorage.cs
- src/services/Blocks.FileService/Configs/ConfigService.cs
- src/services/Blocks.FileService/Configs/ConfigureAuthentication.cs
- src/services/Blocks.FileService/Protos/file.proto
- src/services/Blocks.SystemService/Protos/system.proto
- src/services/Blocks.SystemService/Services/gRPC/SystemGrpcService.cs
- src/services/Blocks.FileService/Infrastructure/Filters/AuditActionFilter.cs
- src/platform/Blocks.AppHost/AppHost.cs
- test/FileService.RemovalChecks/Program.cs
- test/FileService.RemovalChecks/UpgradeChecks.cs

**Do:**
1. Search all call sites of IUploadFileService.Insert and UploadDataAsync before changing signatures.
2. Search all FileServiceHost.Build invocations in test/FileService.RemovalChecks.
3. Record current RequestSizeLimit, MultipartBodyLengthLimit, FileStorage.MaxFileBytes, gRPC message limits, and FileProto field numbers.
4. Inspect whether the Gateway CORS policy allows X-Upload-Purpose preflight. Do not change FileServiceBoundary route rules for this header.
5. Record pre-existing test failures before P03 edits.

**Files:** no product files changed.

**Checkpoint:** you can explain the HTTP stage path, actor binding, manifest structure, finalize path, preview/delete path, and test harness modes.

## Task FS-01 - Generate the existing SystemProto client

**Learn:** how Grpc.Tools generates client code from a source .proto and how this repository links proto files between services.

**Modify:** src/services/Blocks.FileService/Blocks.FileService.csproj.

In the existing Protobuf ItemGroup, add a client generation entry for the existing source file:

~~~xml
<Protobuf Include="..\Blocks.SystemService\Protos\system.proto"
          GrpcServices="Client"
          Link="Protos\system.proto" />
~~~

Do not copy system.proto into FileService. Do not edit SystemService's wire contract. Keep the existing audit.proto client entry and file.proto server entry unchanged.

**Verify:**

~~~powershell
dotnet build src/services/Blocks.FileService/Blocks.FileService.csproj
~~~

Expected generated client namespace/type: Blocks.SystemService.Protos.SystemProto.SystemProtoClient, including CheckPermissionAsync.

**Done when:** the FileService project compiles and the new client is generated from the source proto.

## Task FS-02 - Configure the private SystemService endpoint and fail-closed JWT settings

### FS-02.1 - Register SystemProto client

**Modify:** src/services/Blocks.FileService/Configs/ConfigService.cs.

The file already registers AuditProto.AuditProtoClient with:
- configuration key GrpcClients:SystemService;
- HTTP/1.1 exact version;
- GrpcWebHandler(GrpcWebMode.GrpcWeb, new HttpClientHandler()).

Register SystemProto.SystemProtoClient using the same private endpoint, HTTP version policy, and gRPC-Web handler. Do not create a public Gateway route and do not use a hard-coded host.

Keep the existing AuditProto registration. Avoid duplicating incompatible channel settings.

### FS-02.2 - Supply the HTTPS endpoint through Aspire

**Modify:** src/platform/Blocks.AppHost/AppHost.cs.

The existing graph already contains:
- SystemService references FileService.
- FileService references SystemService.

Extend the FileService -> SystemService reference so the configuration key GrpcClients:SystemService resolves to systemService.GetEndpoint("https"). In Aspire environment naming, use GrpcClients__SystemService.

This address is shared by the new SystemProto permission client and the existing AuditProto client. Do not remove the existing service reference.

### FS-02.3 - Remove the FileService fallback JWT key

**Modify:** src/services/Blocks.FileService/Configs/ConfigureAuthentication.cs.

The current code substitutes "default_key_for_test_if_missing" when Jwt:Key is absent. Remove that fallback.

Before configuring TokenValidationParameters:
- require non-empty Jwt:Key;
- require non-empty Jwt:Issuer;
- require non-empty Jwt:Audience;
- fail startup with a safe configuration error if any are missing;
- use the configured key/issuer/audience without silently replacing them.

Do not log the key. Do not hard-code secrets in AppHost or appsettings.json. The owner must configure local secrets/environment so FileService validates the same JWTs as SystemService.

### FS-02.4 - Regression

Run the existing gRPC-Web audit test and FileService upgrade checks. Verify AuditProto still reaches SystemService using the configured HTTPS endpoint and still forwards expected service authorization metadata where applicable.

**Checkpoint:** FileService starts only with configured JWT trust and can create both gRPC-Web clients. No secret appears in tracked files.

## Task FS-03 - Add the pre-model-binding KnowledgeHub ADD authorization filter

### FS-03.1 - Create the filter

**Create:** src/services/Blocks.FileService/Infrastructure/Filters/KnowledgeHubUploadPermissionFilter.cs.

Implement IAsyncAuthorizationFilter. Inject:
- SystemProto.SystemProtoClient;
- ILogger<KnowledgeHubUploadPermissionFilter>;
- the configured permission timeout (or a validated options object);
- the existing AuditProto client if required for denied-attempt audit.

In OnAuthorizationAsync:

1. Read only Request.Headers["X-Upload-Purpose"].
2. If absent/empty, leave the request alone. This is the legacy upload path; no SystemService permission RPC is called.
3. If non-empty and not exactly KnowledgeHubDocument, short-circuit with the existing BaseResponse envelope and application StatusCode 400.
4. For KnowledgeHubDocument, require an authenticated ClaimsPrincipal.
5. Read the name claim and parse a nonzero canonical GUID exactly as UploadFileService.GetActorId currently does.
6. Read the Authorization header; require Bearer token. Never accept a token or actor ID from multipart/query values.
7. Build CheckPermissionRequest with user_id=actor GUID, controller=knowledgehub, action=2.
8. Send per-call metadata x-service-authorization: Bearer <current request JWT>.
9. Call CheckPermissionAsync with a bounded deadline (initial default 3 seconds, matching the existing KnowledgeHub permission timeout) and RequestAborted cancellation.
10. If response.Success is false, short-circuit with application 403.
11. Map UNAUTHENTICATED to 401, PERMISSION_DENIED to 403, and UNAVAILABLE/DEADLINE_EXCEEDED/INTERNAL/unknown RPC failures to safe 503.
12. On success, set HttpContext.Items["ValidatedUploadPurpose"] = "KnowledgeHubDocument". The controller/service must consume this server-set marker, not trust a form field.

Do not cache permission decisions. Do not retry a failed permission RPC. Do not log the bearer token.

Expected error shape follows FileService's existing HTTP-200 application-envelope convention:
- BaseResponse(false, 401, safe message)
- BaseResponse(false, 403, safe message)
- BaseResponse(false, 503, safe message)

Set context.Result to an appropriate ObjectResult/OkObjectResult. Do not throw expected permission errors from the authorization filter.

### FS-03.2 - Register and attach the filter

**Modify:** src/services/Blocks.FileService/Configs/ConfigService.cs.

Register KnowledgeHubUploadPermissionFilter with the correct scoped lifetime so it can use the injected gRPC client and logger.

**Modify:** src/services/Blocks.FileService/Controllers/UploadFileController.cs.

Attach [ServiceFilter(typeof(KnowledgeHubUploadPermissionFilter))] to Post only. Do not attach the KnowledgeHub-specific filter to Embed, Avatar, or unrelated controllers.

The filter must run before MVC model binding reads List<IFormFile> and FolderName.

### FS-03.3 - Audit behavior

**Inspect/modify if needed:** src/services/Blocks.FileService/Infrastructure/Filters/AuditActionFilter.cs and KnowledgeHubUploadPermissionFilter.cs.

A short-circuited authorization filter may prevent the action filter from running. Verify the current audit behavior. If denied purpose-specific stage attempts bypass existing audit, write a narrow failed audit event through the existing AuditProto client from the permission filter.

Audit fields may include actor ID, username, action UPLOAD_FILE, service name, outcome, safe error category, IP, and correlation ID. Never include JWT, multipart body, original file bytes, or storage key. Audit failure must not convert a denied upload into an allowed upload or mask the 401/403/503 response.

### FS-03.4 - CORS preflight

Verify the browser's X-Upload-Purpose header is allowed by the current Gateway/FileService CORS configuration. If not, add only the required header to the existing allowed-header policy. Do not widen Gateway FileService route exposure or allow FileProto gRPC.

**Tests to add in FS-07:** no SystemService call for legacy requests; exact CheckPermission request for purpose requests; false/timeout/unavailable fail closed; unknown purpose rejected; action/form binding does not run on denial; no managed Temp artifacts.

**Done when:** the authorization decision is complete before MVC form model binding and is derived only from the validated JWT.

## Task FS-04 - Persist purpose and make KnowledgeHub staging retry-safe

### FS-04.1 - Update the stage contract

**Modify:** src/services/Blocks.FileService/Controllers/UploadFileController.cs.

Keep the existing multipart fields:
- files
- FolderName

Do not add UploadPurpose to the form. Read the purpose only from HttpContext.Items["ValidatedUploadPurpose"] set by the authorization filter. Pass that validated value into the service.

Increase the request envelope limits from 50 MiB to 51 MiB:
- RequestSizeLimit = 51 * 1024 * 1024.
- MultipartBodyLengthLimit = 51 * 1024 * 1024.

The service still enforces actual file bytes <= FileStorage.MaxFileBytes (50 MiB). Update tests that currently assert the 50 MiB request envelope. Do not increase MaxFileBytes.

### FS-04.2 - Extend Insert without breaking legacy callers

**Modify:** src/services/Blocks.FileService/Services/CoreFeature/UploadFile/IUploadFileService.cs and UploadFileService.cs.

Add an optional purpose parameter to Insert after the existing cancellation parameter, or add a backward-compatible overload. Search/update every call site found in FS-00.

Behavior:
- null/absent purpose follows the existing legacy validation and behavior.
- exact KnowledgeHubDocument purpose accepts exactly one file.
- KnowledgeHub extensions are exactly .pdf, .md, .txt, case-insensitive.
- Do not globally add .md to CommonConst._fileTaiLieuValid; keep this target-specific.
- actual bytes remain <= 50 MiB.
- validate original filename as a basename, reject slash/backslash/colon/traversal/control characters, and cap at 255 Unicode scalar values to match PostgreSQL varchar(255).
- normalize stored extension to lowercase.
- content type will later be derived by the KnowledgeHub API from extension; do not trust browser MIME.

### FS-04.3 - Persist purpose in the manifest

**Modify:** src/services/Blocks.FileService/Infrastructure/Storage/UploadSessionStore.cs.

Extend UploadSession with a nullable purpose field appended with a default of null. Existing JSON manifests without this property must still deserialize as legacy sessions.

Validate:
- purpose null means legacy.
- purpose KnowledgeHubDocument means exactly one PDF/MD/TXT file.
- unknown non-empty purpose is invalid.
- Staged sessions still have Target=null and Result=null.
- Finalizing/Finalized KnowledgeHub sessions must have Target Kind=Document, Service=KnowledgeHub, Module=Documents, and nonzero RelatedId.
- Existing System Attachment and Avatar target validation remains unchanged.
- A legacy session with no purpose cannot be finalized into KnowledgeHub/Documents.

Add a fixture representing a pre-P03 manifest with no Purpose field and prove it still reads as legacy.

### FS-04.4 - Idempotent stage retry

**Modify:** UploadFileService.Insert and its session helpers.

For KnowledgeHubDocument only:
- If UploadSessionId does not exist, stage and write the manifest with Purpose=KnowledgeHubDocument.
- If an existing session has the same actor, purpose, one original filename, byte length, and SHA256, return an acknowledgement without replacing its manifest or creating another published batch.
- If purpose, filename, size, hash, or actor differs, return a safe 409 conflict and preserve the old manifest/batch.
- If the existing session is Finalizing/Finalized and the same staged identity is submitted, return idempotent acknowledgement; never replace it.
- Hash the incoming file content before deciding identity. If a new temporary batch was used to compute the hash, delete only that unpublished new batch after comparison; never delete the original session's batch.
- Keep all manifest mutation under the existing WriteGate.

Legacy upload retry behavior remains unchanged.

**Checkpoint:** KnowledgeHub purpose is persisted, old manifests still load, same-content retry is idempotent, and different-content retry cannot replace an existing session.

## Task FS-05 - Add the KnowledgeHub/Documents active storage key and finalize path

### FS-05.1 - Resolve the exact key

**Modify:** src/services/Blocks.FileService/Infrastructure/Storage/FileStorage.cs.

Extend ResolveActiveKey with one explicit branch for exactly four slash-separated segments:

~~~text
KnowledgeHub/Documents/<document-guid>/<file-guid>.<extension>
~~~

Validate:
- exact namespace spelling/case policy;
- nonzero canonical document GUID;
- filename GUID equals the FileId in the manifest;
- extension is lowercase/canonical and one of .pdf, .md, .txt;
- no extra segment, traversal, slash, backslash, colon, or arbitrary path.

Resolve to the existing private StorageArea.Files root under KnowledgeHub/Documents/documentId/fileName. Do not add a web-root/static path or new storage area.

### FS-05.2 - Validate and finalize the KnowledgeHub target

**Modify:** src/services/Blocks.FileService/Services/CoreFeature/UploadFile/UploadFileService.cs.

Extend UploadDataAsync target validation to allow only:
- legacy System/Attachments with legacy Attachment-purpose manifest;
- new KnowledgeHub/Documents with Purpose=KnowledgeHubDocument and exactly one file.

For KnowledgeHub:
- RelatedId is the server-created DocumentId.
- tempFolder is the actor-bound UploadSessionId.
- Target becomes Document/KnowledgeHub/Documents/RelatedId.
- final key is KnowledgeHub/Documents/{RelatedId}/{FileId}.{lowercase extension}.
- existing staged manifest actor binding must match the JWT actor.
- existing same-target Finalizing/Finalized retry verifies destination length and SHA256 and returns the same result.
- different target, missing session, wrong purpose, or wrong actor fails closed.
- source Temp bytes are preserved when finalize fails or destination verification fails.
- RejectDeletedTarget is checked before creating a new destination.

### FS-05.3 - Fix deletion receipt canonicalization

**Modify:** UploadFileService.ReceiptKeyHash and RejectDeletedTarget.

Current ReceiptKeyHash treats every non-Avatar key as System/Attachments. Add explicit branches for:
- System/Avatar/<file>
- System/Attachments/<related>/<file>
- KnowledgeHub/Documents/<document>/<file>

Reject unknown key shapes instead of indexing arbitrary segments. Normalize case only according to the existing OS-specific policy. The same canonicalization must be used by DeleteDataAsync and RejectDeletedTarget so a receipt blocks resurrection of the exact KnowledgeHub target.

PreviewFileAsync and DeleteDataAsync already call ResolveActiveKey. They should work for KnowledgeHub keys after the resolver and receipt changes; do not duplicate file read/move logic.

**Tests:** valid/invalid namespace, traversal, wrong GUID, wrong extension, same-target retry, wrong-target conflict, corrupted destination, partial finalize preserving source, delete receipt retry, reject deleted target, legacy Attachment/Avatar regression.

## Task FS-06 - Return trusted SHA256 without changing shared DTOs

### FS-06.1 - Add a FileService-specific result type

**Create:** src/services/Blocks.FileService/DTOs/CoreFeature/UploadFile/FinalizedAttachment.cs (or the nearest existing FileService DTO folder).

Define a FileService-specific result containing:
- the existing Blocks.Shared ModelAttachment;
- SourceSha256 from the trusted staged manifest.

Do not add KnowledgeHub-only fields to Blocks.Shared ModelAttachment.

### FS-06.2 - Preserve the existing internal method while exposing metadata to gRPC

**Modify:** IUploadFileService.cs and UploadFileService.cs.

Add UploadDataWithMetadataAsync returning the FileService-specific finalized result. Refactor the current finalization implementation so the new method returns each ModelAttachment plus the matching StoredUploadFile.Sha256 normalized with ToLowerInvariant(), because the PostgreSQL source_sha256 contract stores lowercase hexadecimal.

Keep the existing UploadDataAsync signature as a compatibility wrapper that calls the metadata method and returns only ModelAttachment values. This avoids breaking existing internal test callers.

### FS-06.3 - Add protobuf field 9

**Modify:** src/services/Blocks.FileService/Protos/file.proto.

Inside ModelAttachmentProto, append:

~~~protobuf
string source_sha256 = 9;
~~~

Do not change or reuse field numbers 1-8. Do not add a new RPC.

**Modify:** src/services/Blocks.FileService/Services/gRPC/FileGrpcService.cs.

UploadData must call UploadDataWithMetadataAsync and map SourceSha256 to ModelAttachmentProto.SourceSha256. Keep all existing field mappings intact.

**Tests:** verify the source hash is 64 hex characters and matches the staged manifest; verify FileProto field 9 exists and fields 1-8 remain unchanged; verify an old consumer can ignore the additive field.

## Task FS-07 - Add deterministic permission, storage, and compatibility tests

**Create:** test/FileService.RemovalChecks/KnowledgeHubUploadPermissionChecks.cs.

Use the existing executable harness style, temporary private storage roots, synthetic JWTs, and an ephemeral gRPC-Web SystemService responder. The responder should:
- handle /system.SystemProto/CheckPermission;
- decode and capture CheckPermissionRequest;
- capture HTTP protocol and x-service-authorization metadata;
- return success=true, success=false, UNAUTHENTICATED, UNAVAILABLE, and deadline/abort cases;
- never call a real SystemService or database.

Minimum cases:
1. Missing X-Upload-Purpose uses the legacy path and makes zero permission RPCs.
2. Exact KnowledgeHubDocument calls CheckPermission with JWT-derived user ID, controller knowledgehub, action 2.
3. The RPC receives x-service-authorization with the current bearer token; tokens from concurrent users never cross.
4. success=false returns application 403.
5. UNAUTHENTICATED returns application 401.
6. UNAVAILABLE/DEADLINE_EXCEEDED/INTERNAL returns safe 503.
7. Unknown purpose returns application 400 and does not call SystemService.
8. Denial and RPC failure short-circuit before MVC form binding/action execution.
9. Denial and RPC failure create no FileStorage Temp session directory, batch, file, or manifest.
10. Authorized purpose stages one PDF/MD/TXT file successfully.
11. KnowledgeHub purpose rejects two files, unsupported extension, empty file, and >50 MiB actual bytes.
12. Same-session/same-content retry is idempotent; different content/actor/purpose is 409.
13. Old manifest without Purpose still deserializes.
14. Legacy System Attachment and Avatar upload/finalize/delete/preview still pass.
15. A denied upload attempt is audited once through the existing AuditProto mechanism if the authorization short-circuit bypasses AuditActionFilter; no token or body is logged.

**Modify:** test/FileService.RemovalChecks/Program.cs.
- Add "permissions" to knownModes.
- Invoke KnowledgeHubUploadPermissionChecks.RunAsync(CheckAsync) for permissions/all.

**Modify:** test/FileService.RemovalChecks/UpgradeChecks.cs.
- Assert source_sha256 is field 9.
- Keep existing FileProto method names and fields 1-8 unchanged.
- Update request/multipart envelope expectation to 51 MiB while actual FileStorage.MaxFileBytes remains 50 MiB.

Run:

~~~powershell
dotnet build src/services/Blocks.FileService/Blocks.FileService.csproj
dotnet run --project test/FileService.RemovalChecks -- permissions
dotnet run --project test/FileService.RemovalChecks -- sessions
dotnet run --project test/FileService.RemovalChecks -- lifecycle
dotnet run --project test/FileService.RemovalChecks -- upgrade
dotnet run --project test/FileService.RemovalChecks -- all
git diff --check
~~~

If a harness mode is named differently in the current checkout, use the actual Program.cs mode list rather than renaming unrelated tests.

**Done when:** all new permission tests pass; all legacy FileService regressions pass; project builds; no real service or database was needed.

## Task FS-08 - Owner review and handoff to backend

Before B consumes the contract, review the diff for:
- no public gRPC route or direct storage exposure;
- no secret in tracked files;
- no fallback JWT key;
- no global .md allowlist expansion;
- no source Temp deletion on uncertain finalize;
- receipt hash canonicalization for KnowledgeHub;
- additive protobuf field 9 only;
- SystemService audit client still works with the new HTTPS endpoint;
- Gateway CORS preflight permits the new header without widening routes.

Record test commands and actual PASS/FAIL/NOT RUN. Do not mark live SystemService permission/TLS acceptance PASS from the mocked responder.

Handoff to P03-B:
- exact finalized key format;
- FileService RPC request/response and source_sha256 field 9;
- stage header and ADD check behavior;
- actual configured HTTPS endpoint/CA names (never secret values);
- test harness evidence and any NOT RUN items.
