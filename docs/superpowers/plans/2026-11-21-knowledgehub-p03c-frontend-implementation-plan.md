# KnowledgeHub P03-C: React Document Repository - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:executing-plans only after owner approval of execution. Steps use checkbox syntax for tracking. The owner writes React code and tests.

**Goal:** Replace the P02 Repository placeholder with real upload, progress, search/filter/paging, download, and logical delete while preserving the approved Stitch layout and existing Blocks shell.

**Architecture:** KnowledgeHubPage passes actor, selected collection, and permission state to RepositoryFrame. New typed document APIs and actor-scoped TanStack Query hooks drive the uploader and repository components through the existing Axios/Gateway path.

**Tech Stack:** React 19, TypeScript, TanStack Query v5, Axios, existing Radix-based shadcn primitives, Vitest, React Testing Library, Lucide, Sonner.

**Spec:** docs/superpowers/specs/2026-11-21-knowledgehub-p03-file-lifecycle-document-repository-design.md

## Detailed global constraints

- Preserve the Stitch hierarchy, existing MainLayout, collection selector/count badge, and tabs.
- Do not install shadcn, run its CLI, add dependencies, or overwrite checked-in UI primitives.
- Use the existing Axios instance and Gateway; browser never calls private FileService/Python endpoints.
- One file per upload intent/session; queue selected files sequentially.
- Use actual onUploadProgress bytes. 100% stage transfer is not registration success.
- Search title/original_filename only; no content search.
- Only active REGISTERED documents have download/delete actions.
- No READY, parser progress, page count, chunk count, embeddings, or fake sample rows.
- Query keys include actor and collection; preserve P02 stale-session protections.
- Browser storage may hold only a short-lived UploadSessionId correlation; never JWT, bytes, storage key, or hash.
- Backend remains authoritative for permission, ownership, file type, and size.
- The owner writes all React code and tests.

## Review Focus

- FormData must remove the Axios JSON Content-Type default so the browser sets the boundary; X-Upload-Purpose is a header.
- Actual byte progress and registration state are separate; never fabricate a combined percentage.
- A late mutation from actor A must not toast, invalidate, or render into actor B's cache.
- Download must unwrap soft JSON error envelopes returned as blobs and use a bounded timeout.
- Visual review must preserve the Stitch hierarchy and work at 390px without horizontal page overflow.

---



Date: 2026-11-21  
Status: PROPOSED - owner execution plan; review before starting  
Branch: feature/knowledgehub-learning  
Accepted specification: docs/superpowers/specs/2026-11-21-knowledgehub-p03-file-lifecycle-document-repository-design.md  
Parent plan: docs/superpowers/plans/2026-11-21-knowledgehub-p03-implementation-plan.md  
Prerequisite: P03-B API contracts and mocked endpoint tests  
Repository rules: AGENTS.md and docs/superpowers/plans/2026-11-15-knowledgehub-p02-frontend-ui-implementation-guide.md

## Outcome details

Replace the P02 Repository placeholder with a real upload and document repository while preserving the approved Stitch hierarchy, existing Blocks MainLayout, collection selector, count badge, and tabs.

The UI must show real API data, actual browser upload byte progress, a separate registration state, metadata search/filter/paging, authorized download, and logical delete. It must never show fake documents, fake percentages, READY, parser progress, page counts, chunks, or embedding state in P03.

## Component flow

~~~text
KnowledgeHubPage
  |
  +--> selected collection / actor / permission
  |
  +--> RepositoryFrame
         |
         +--> DocumentUploader
         |      |
         |      +--> useDocumentUploads
         |              |
         |              +--> upload intent API
         |              +--> FileService stage via Gateway
         |              +--> finalize API
         |
         +--> UploadProgressList
         |
         +--> DocumentRepository
                |
                +--> useDocuments
                +--> DocumentRow
                +--> DocumentDeleteDialog
                +--> useDocumentMutations
~~~

Use the existing Axios API client and Gateway endpoints. Browser never calls Python's internal port or FileService's private gRPC endpoint.

## Tooling details

- React 19 / TypeScript.
- TanStack Query v5.
- Existing Axios client in src/lib/api.ts.
- Existing Radix-based shadcn components in src/components/ui.
- Vitest and React Testing Library.
- Lucide icons and Sonner toasts.

Do not install shadcn, run shadcn CLI, add dependencies, or overwrite checked-in UI primitives.

## Detailed specification contract

Read accepted P03 sections 10, 12-16, 17, and the P02 UI implementation guide.

API contract to consume from P03-B:

| Method | Path | Purpose |
| --- | --- | --- |
| POST | /api/knowledgehub/collections/{id}/documents/upload-intents | Create/reuse a document intent. |
| POST | /api/knowledgehub/documents/{id}/finalize | Finalize and register the staged file. |
| GET | /api/knowledgehub/collections/{id}/documents | List/search/filter/page documents. |
| GET | /api/knowledgehub/documents/{id} | Detail. |
| GET | /api/knowledgehub/documents/{id}/download | Authorized binary original download. |
| DELETE | /api/knowledgehub/documents/{id} | Logical delete; cleanup may remain pending. |
| POST | /File/api/UploadFile | Existing FileService HTTP stage route through Gateway. |

Stage contract:
- Multipart files = one selected File.
- Multipart FolderName = UploadSessionId.
- Header X-Upload-Purpose = KnowledgeHubDocument.
- Current bearer token is supplied by the existing Axios interceptor.
- Do not set multipart boundary manually.

## Global Constraints

- Preserve the approved Stitch visual hierarchy and existing Blocks MainLayout.
- Keep RepositoryFrame inside the existing KnowledgeHubPage tab.
- Use the current UI components: card, button, input, progress, badge, table, dialog, skeleton, sonner, select.
- Do not edit generic UI primitives unless a verified defect blocks P03.
- Use one upload session per file and one document per session.
- Queue selected files sequentially because FileService's current WriteGate serializes staging/finalize/delete mutations.
- Use Axios onUploadProgress for actual bytes transferred. When stage reaches 100%, show a separate registration state; do not invent a combined progress percentage.
- Keep the 50 MiB limit in the UI as early feedback; backend/FileService remains authoritative.
- Search only title/original_filename metadata. No content search.
- Only REGISTERED active documents have download/delete actions.
- No READY, parsing, page count, chunk count, embedding status, or AI progress in P03.
- Query keys must include actor and collection. Preserve P02 actor-switch/stale-mutation protections.
- Do not store JWT, file bytes, storage key, SHA256, or FileService endpoint in browser storage.
- If sessionStorage is used, store only the UploadSessionId correlation keyed by actor/document for retry after ordinary page refresh; server API remains source of truth.
- The owner writes all React code and tests.

## Detailed review focus before coding

1. The current RepositoryFrame is an honest disabled placeholder. Replace only its contents/props; do not add fake seed documents.
2. KnowledgeHubPage already computes actorId, canView, canCreate, canEdit, canDelete, selectedId, and selected collection. Reuse those values.
3. The collection badge already renders selected.DocumentCount. P03 backend makes it real; do not locally increment it.
4. The current Axios instance defaults Content-Type to application/json. A FormData request must remove that default at request time so the browser/Axios sets the multipart boundary.
5. The generic fileService.uploadFile helper currently sets multipart/form-data explicitly. Do not blindly reuse it without correcting the boundary behavior; prefer a narrow API-client postMultipart method used by documents.api.ts.
6. api.downloadFile already supports blob error-envelope unwrapping, but DownloadFileConfig currently does not pass timeout. Extend it narrowly.
7. Existing DataTable uses a custom legacy TanStack adapter and a default viewport-height container. For this compact repository use the checked-in ui/table primitives and explicit server pagination unless the mockup/available page width demonstrates that DataTable is a better fit. Do not modify DataTable globally for P03.
8. The current useCollectionMutations uses KnowledgeHubCacheBoundary session identity. New document mutations/uploads must use the same guard so a late response from actor A cannot invalidate, toast, or update actor B's view.
9. Use a deliberate retry path. Re-finalize the same DocumentId first. If FileService confirms the staged session is missing, ask the user to reselect the same original file and reuse the stored UploadSessionId when available. Never generate a new UploadSessionId for an existing intent silently.
10. UI permission checks are usability only. Backend ADD/VIEW/DELETE checks and collection ownership remain authoritative.

## File Map

| Action | File | Responsibility |
| --- | --- | --- |
| Modify | src/apps/Blocks.Web/src/config/constants.ts | Add KnowledgeHub document endpoints. |
| Modify | src/apps/Blocks.Web/src/lib/api.ts | Multipart helper, FormData header handling, download timeout. |
| Modify | src/apps/Blocks.Web/src/features/knowledgehub/types/collections.types.ts | DocumentCount now represents actual registered count. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/types/documents.types.ts | Document/status/intent/page/delete DTO types. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/api/documents.api.ts | Typed document API and FileService stage call through Gateway. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/hooks/document-query-keys.ts | Actor/collection-scoped query keys. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/hooks/useDocuments.ts | Server-side list/search/filter/paging. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/hooks/useDocumentMutations.ts | Finalize/download/delete and cache invalidation. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/hooks/useDocumentUploads.ts | Sequential upload queue and truthful progress/retry. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/components/DocumentUploader.tsx | Accessible picker/drop zone. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/components/UploadProgressList.tsx | Byte progress and separate registration state. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/components/DocumentRepository.tsx | Search/filter/paging/table states. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/components/DocumentRow.tsx | Metadata/status/download/delete actions. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/components/DocumentDeleteDialog.tsx | Accessible delete confirmation. |
| Modify | src/apps/Blocks.Web/src/features/knowledgehub/components/RepositoryFrame.tsx | Compose real P03 components in the existing frame. |
| Modify | src/apps/Blocks.Web/src/features/knowledgehub/routes/KnowledgeHubPage.tsx | Pass actor/collection/permissions into RepositoryFrame. |
| Modify | src/apps/Blocks.Web/src/features/knowledgehub/components/RepositoryFrame.test.tsx | Replace placeholder tests with real composition. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/api/documents.api.test.ts | API envelope, FormData/header, download tests. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/hooks/useDocuments.test.tsx | Query key and server query tests. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/hooks/useDocumentUploads.test.tsx | Sequential queue, progress, retry, actor race tests. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/hooks/useDocumentMutations.test.tsx | Mutation and cache invalidation tests. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/components/DocumentUploader.test.tsx | File selection/validation/drop tests. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/components/DocumentRepository.test.tsx | Repository states/search/filter/page tests. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/components/DocumentRow.test.tsx | Status and action gating tests. |
| Create | src/apps/Blocks.Web/src/features/knowledgehub/components/DocumentDeleteDialog.test.tsx | Delete dialog/error/pending tests. |

## Task FE-00 - Preflight and inspect existing UI

**Learn:** TanStack Query query keys/cancellation, controlled forms, Axios interceptors, Radix Dialog, Progress, Table, and the P02 cache boundary.

**Read:**
- src/apps/Blocks.Web/src/features/knowledgehub/routes/KnowledgeHubPage.tsx
- src/apps/Blocks.Web/src/features/knowledgehub/components/RepositoryFrame.tsx
- src/apps/Blocks.Web/src/features/knowledgehub/components/RepositoryFrame.test.tsx
- src/apps/Blocks.Web/src/features/knowledgehub/components/CollectionState.tsx
- src/apps/Blocks.Web/src/features/knowledgehub/hooks/KnowledgeHubCacheBoundary.tsx
- src/apps/Blocks.Web/src/features/knowledgehub/hooks/collection-query-keys.ts
- src/apps/Blocks.Web/src/features/knowledgehub/hooks/useCollectionMutations.ts
- src/apps/Blocks.Web/src/features/knowledgehub/api/collections.api.ts
- src/apps/Blocks.Web/src/features/knowledgehub/types/collections.types.ts
- src/apps/Blocks.Web/src/lib/api.ts
- src/apps/Blocks.Web/src/config/constants.ts
- src/apps/Blocks.Web/src/components/ui/card.tsx
- src/apps/Blocks.Web/src/components/ui/button.tsx
- src/apps/Blocks.Web/src/components/ui/input.tsx
- src/apps/Blocks.Web/src/components/ui/progress.tsx
- src/apps/Blocks.Web/src/components/ui/badge.tsx
- src/apps/Blocks.Web/src/components/ui/table.tsx
- src/apps/Blocks.Web/src/components/ui/dialog.tsx
- src/apps/Blocks.Web/src/components/ui/skeleton.tsx
- src/apps/Blocks.Web/src/components/ui/sonner.tsx
- docs/knowledgehub/references/stitch_blocks_interface/screen.png
- docs/knowledgehub/references/stitch_blocks_interface/DESIGN.md

**Do:**
1. Record current branch, git status, and frontend test/build/lint baseline.
2. Confirm exact API DTO field casing from P03-B before writing TypeScript types.
3. Confirm whether the current Gateway origin permits X-Upload-Purpose preflight.
4. Inspect the P02 cache boundary and test helper before writing mutation hooks.
5. Record the reference screenshot dimensions and viewport/zoom conditions.

**Files:** no product files changed.

**Interfaces:**
- Consumes: P02 UI frame, cache boundary, Axios API client, and existing UI primitives.
- Produces: baseline notes and verified P03 API field names from P03-B.

- [ ] Step 1: Record branch, HEAD, git status, and frontend test/build/lint baseline.
- [ ] Step 2: Inspect the current component props, cache session identity, API client, and Stitch reference.
- [ ] Step 3: Confirm exact API response casing from P03-B; do not invent DTO fields.
- [ ] Step 4: Commit no product changes; proceed when the baseline is understood.

## Task FE-01 - Add document types, endpoints, and API adapter

### FE-01.1 - Add types

**Create:** src/apps/Blocks.Web/src/features/knowledgehub/types/documents.types.ts.

Define:
- DocumentRegistrationStatus union: AWAITING_UPLOAD, REGISTERING, REGISTRATION_FAILED, REGISTERED.
- DocumentDto matching P03-B public DTO exactly: Id, CollectionId, Title, OriginalFileName, FileExtension, ContentType, SizeBytes, RegistrationStatus, CreatedAt, UpdatedAt, RegisteredAt.
- DocumentPageDto: Data, TotalRow, PageIndex, PageSize.
- DocumentListParams: q, registration_status, page_index, page_size.
- DocumentUploadIntentRequest: UploadSessionId, OriginalFileName, DeclaredSizeBytes.
- DocumentUploadIntentDto: DocumentId, UploadSessionId, RegistrationStatus.
- DocumentDeleteDto: Id, CleanupStatus.

Do not add file_id, storage_key, source_sha256, FileService URL, owner_id, or JWT fields.

### FE-01.2 - Add endpoint constants

**Modify:** src/apps/Blocks.Web/src/config/constants.ts.

Inside API_ENDPOINTS.KnowledgeHub, keep COLLECTIONS unchanged and add:
- DOCUMENTS base = /api/knowledgehub/documents;
- COLLECTION_DOCUMENTS(collectionId) = /api/knowledgehub/collections/{encoded id}/documents;
- COLLECTION_UPLOAD_INTENTS(collectionId) = /api/knowledgehub/collections/{encoded id}/documents/upload-intents;
- DOCUMENT_FINALIZE(documentId) = /api/knowledgehub/documents/{encoded id}/finalize;
- DOCUMENT_DETAIL(documentId) = /api/knowledgehub/documents/{encoded id};
- DOCUMENT_DOWNLOAD(documentId) = /api/knowledgehub/documents/{encoded id}/download.

Use encodeURIComponent for IDs. Keep the File.UploadFile.POST constant as the existing Gateway stage route.

### FE-01.3 - Add a safe multipart helper

**Modify:** src/apps/Blocks.Web/src/lib/api.ts.

The Axios instance has a default JSON Content-Type. Add a narrow postMultipart<T>(endpoint, formData, config) method that uses the same axiosInstance and therefore the same Authorization/refresh interceptors.

In the request interceptor, when config.data is FormData, remove the default Content-Type header from the final AxiosHeaders object. Let the browser set multipart/form-data with the correct boundary. Do not manually build a boundary.

The method must accept AbortSignal, timeout, headers, and onUploadProgress through AxiosRequestConfig. Do not duplicate token refresh logic.

Extend DownloadFileConfig to include timeout and pass it through downloadFile while preserving unwrapBlobErrors and signal behavior.

Do not change the behavior of ordinary JSON get/post/put/delete.

### FE-01.4 - Create documents API module

**Create:** src/apps/Blocks.Web/src/features/knowledgehub/api/documents.api.ts.

Follow collections.api.ts:
- define DocumentApiError with application StatusCode;
- add unwrap<T>(ApiResponse<T>) that rejects Success=false even when HTTP status is 200;
- list(collectionId, params, signal);
- detail(documentId, signal);
- createUploadIntent(collectionId, body);
- stage(uploadSessionId, file, onUploadProgress, signal);
- finalize(documentId);
- download(documentId, signal) using api.downloadFile with timeout and unwrapBlobErrors=true;
- remove(documentId).

Stage implementation:
1. create FormData;
2. append one file under files;
3. append FolderName = UploadSessionId;
4. call api.postMultipart to API_ENDPOINTS.File.UploadFile.POST;
5. set X-Upload-Purpose: KnowledgeHubDocument as an HTTP header;
6. pass onUploadProgress and an upload timeout;
7. unwrap the standard BaseResponse envelope.

Download returns a Blob and must reject a soft JSON error envelope. Never construct a URL from storage_key.

**Tests:** create api/documents.api.test.ts for exact URLs, PascalCase request/response, soft 400/403/404/503 envelope rejection, stage FormData fields/header/progress callback, and download blob-error handling.

**Interfaces:**
- Produces: documentsApi.createUploadIntent(collectionId, input), stage(uploadSessionId, file, onProgress, signal), finalize(documentId), list(collectionId, params, signal), detail(documentId, signal), download(documentId, signal), and remove(documentId).
- Produces: postMultipart<T> and DownloadFileConfig.timeout in src/lib/api.ts.

- [ ] Step 1: Add failing API tests for endpoint URLs, error envelopes, stage header/FormData, progress, and blob errors.
- [ ] Step 2: Run the focused API test and confirm the new methods are absent/failing.
- [ ] Step 3: Add document types and endpoint constants.
- [ ] Step 4: Add postMultipart using the existing Axios instance; remove JSON Content-Type for FormData in the final request interceptor.
- [ ] Step 5: Extend downloadFile timeout and implement documents.api.ts.
- [ ] Step 6: Run documents.api.test.ts and existing API client tests; commit.

## Task FE-02 - Add actor/collection-scoped query keys and read hooks

### FE-02.1 - Query keys

**Create:** src/apps/Blocks.Web/src/features/knowledgehub/hooks/document-query-keys.ts.

Follow collection-query-keys.ts. Define:
- all;
- actor(actorId);
- collection(actorId, collectionId);
- list(actorId, collectionId, params);
- detail(actorId, documentId).

No document key may omit actor identity. List key must include collection and search/filter/page params.

### FE-02.2 - List hook

**Create:** src/apps/Blocks.Web/src/features/knowledgehub/hooks/useDocuments.ts.

Use useQuery or useInfiniteQuery consistent with the chosen page UI. P03 backend uses page_index/page_size; a simple page query is sufficient.

Inputs:
- actorId;
- collectionId;
- canView;
- q;
- registrationStatus;
- pageIndex;
- pageSize.

Enable only when actorId, active selected collection, and VIEW permission exist. Pass TanStack Query signal to API. retry=false for permission/business failures. Reset page to 1 when q/status/collection changes.

Use useKnowledgeHubSession where a pending async operation can outlive the current actor.

**Tests:** two actors and two collections produce different keys; no request without actor/collection/VIEW; changing collection cancels/stops stale result from rendering.

**Interfaces:**
- Produces: documentKeys.all/actor/collection/list/detail.
- Produces: useDocuments({ actorId, collectionId, canView, q, registrationStatus, pageIndex, pageSize }).

- [ ] Step 1: Add failing tests for actor/collection query key isolation and disabled query states.
- [ ] Step 2: Run focused hook tests and confirm the new query keys/hooks are absent.
- [ ] Step 3: Implement document-query-keys.ts and useDocuments.ts using the existing TanStack Query conventions.
- [ ] Step 4: Add cancellation and stale-result assertions.
- [ ] Step 5: Run useDocuments.test.tsx and existing collection hook tests; commit.

## Task FE-03 - Implement sequential upload orchestration and real progress

**Create:** src/apps/Blocks.Web/src/features/knowledgehub/hooks/useDocumentUploads.ts.

Responsibilities:
- accept a list of browser File objects;
- validate extension and size <=50 MiB for early UX feedback;
- create one UploadSessionId using crypto.randomUUID() per file;
- create one upload intent per file;
- stage one file/session through the Gateway endpoint;
- update progress only from Axios onUploadProgress loaded/total bytes;
- after stage succeeds, change status to REGISTERING and call finalize;
- mark complete only when finalize returns persisted REGISTERED;
- process the selected files sequentially, never Promise.all;
- keep retry on the same DocumentId and UploadSessionId;
- invalidate document list and selected collection detail after completion;
- use the P02 KnowledgeHubCacheBoundary session guard before toasts/cache writes/navigation;
- abort via AbortController but treat abort as uncertain; refetch/retry same intent before claiming the server did nothing.

State model per file:
- queued;
- creating-intent;
- uploading with loadedBytes/totalBytes/percent;
- registering (no fabricated percent);
- registered;
- failed with safe message and retry action.

Retry behavior:
- Re-finalize by DocumentId first. FileService finalize is idempotent for the same target/session.
- If FileService confirms the staged session is missing, ask the user to reselect the same original file and reuse the saved UploadSessionId if available.
- A sessionStorage entry may map actorId + documentId to UploadSessionId across an ordinary page refresh. Store no JWT, file bytes, storage key, or other secrets. Clear it after registration. Do not treat sessionStorage as the source of document state.
- If no session correlation remains, do not silently generate a new session for the same DocumentId; show a safe recovery message and require a new upload intent if the user chooses to upload again.

**Tests:** create hooks/useDocumentUploads.test.tsx.
- Multiple selected files stage sequentially.
- Each file gets its own intent/session.
- Progress is derived from actual progress events.
- Stage 100% transitions to registering, not overall success.
- Success waits for finalize REGISTERED.
- 403/413/503 and timeout show truthful errors.
- Retry reuses same IDs.
- Actor A pending -> actor B login -> A response resolves: no B cache invalidation or toast.
- Abort does not claim server rollback.
- Upload purpose header is present.

**Interfaces:**
- Produces: useDocumentUploads({ actorId, collectionId, canAdd }) with enqueueFiles(files), retry(documentId), cancel(), and per-file queue state.
- Produces: one intent/session/document per file, sequential stage/finalize calls, and invalidation of document list + selected collection detail.

- [ ] Step 1: Add deferred-promise tests for sequential queue, real progress, registration, retry, abort, and actor switch.
- [ ] Step 2: Run the hook tests and confirm the queue behavior is missing.
- [ ] Step 3: Implement the hook with one UploadSessionId per file and a single active queue worker.
- [ ] Step 4: Add the sessionStorage correlation for UploadSessionId only; clear it after registration.
- [ ] Step 5: Run hook tests and confirm no late actor-A mutation touches actor-B cache/toasts; commit.

## Task FE-04 - Build the uploader and progress UI

### FE-04.1 - Uploader

**Create:** src/apps/Blocks.Web/src/features/knowledgehub/components/DocumentUploader.tsx.

Build the approved dashed upload card inside the current RepositoryFrame:
- file picker accept=".pdf,.md,.txt";
- drag/drop for the same types;
- accessible button and keyboard access to file picker;
- early validation for extension and 50 MiB;
- no fake processing copy;
- disabled/pending state while the sequential queue is running;
- use existing Card, Button, Input, and Lucide components.

Do not create a generic upload framework or edit shadcn source.

### FE-04.2 - Progress list

**Create:** src/apps/Blocks.Web/src/features/knowledgehub/components/UploadProgressList.tsx.

For each selected file show:
- filename and file size;
- queued/uploading/registering/registered/failed state;
- Progress component only while actual bytes are transferring;
- numeric progress based on loaded bytes and total bytes;
- separate spinner/text for registration after upload transfer finishes;
- retry only where the hook can safely reuse the same intent/session.

Do not show READY, parsing, embedding, chunking, or fake 100% while registration is pending.

**Tests:** create components/DocumentUploader.test.tsx and cover file type/size, keyboard activation, drag/drop, pending state, and progress/registering copy.

**Interfaces:**
- DocumentUploader receives accept/disabled/onFilesSelected and renders the existing upload-card hierarchy.
- UploadProgressList receives the queue state from useDocumentUploads; Progress is rendered only for active byte transfer.

- [ ] Step 1: Add component tests for file picker, drag/drop, keyboard, type/size validation, and upload/registering states.
- [ ] Step 2: Run the tests and confirm the components do not exist.
- [ ] Step 3: Build DocumentUploader with existing Card/Button/Input primitives.
- [ ] Step 4: Build UploadProgressList with Progress/Badge/Skeleton/Sonner; keep transfer and registration states separate.
- [ ] Step 5: Run component tests and review the Stitch visual hierarchy; commit.

## Task FE-05 - Build the repository table, row actions, and delete dialog

### FE-05.1 - Repository

**Create:** src/apps/Blocks.Web/src/features/knowledgehub/components/DocumentRepository.tsx.

Use existing ui/table primitives rather than modifying the global DataTable. Columns:
- document/title and original filename;
- extension/type;
- formatted size;
- registration status;
- created/registered date;
- actions.

Add:
- search input for title/original filename only;
- status filter for AWAITING_UPLOAD, REGISTERING, REGISTRATION_FAILED, REGISTERED;
- server-side page_index/page_size;
- loading skeleton;
- empty state;
- API error state;
- refresh/retry affordance.

Do not add content search, page count, parser status, or AI features.

### FE-05.2 - Document row

**Create:** src/apps/Blocks.Web/src/features/knowledgehub/components/DocumentRow.tsx.

Show truthful status labels:
- AWAITING_UPLOAD -> waiting for upload;
- REGISTERING -> registering;
- REGISTRATION_FAILED -> upload/registration failed;
- REGISTERED -> stored/registered.

Download/delete actions appear only for REGISTERED rows and are gated by the UI permission props. Backend remains authoritative.

Download:
- call documentsApi.download(documentId);
- create a Blob URL and download with the original filename;
- revoke the object URL after use;
- never read or construct a storage key.

### FE-05.3 - Delete confirmation

**Create:** src/apps/Blocks.Web/src/features/knowledgehub/components/DocumentDeleteDialog.tsx.

Use existing Radix Dialog components:
- show the correct document title;
- prevent duplicate submit;
- do not close while pending;
- preserve visible error on failure;
- on success remove the row from normal list and show cleanup status;
- if logical delete succeeded but FileService cleanup is pending/failed, show a warning toast that the document is deleted from the repository while file cleanup remains pending.

**Tests:** create DocumentRepository.test.tsx, DocumentRow.test.tsx, and DocumentDeleteDialog.test.tsx. Test server paging/search/filter, all states, action gating, correct document ID, pending close prevention, error preservation, and cleanup-pending toast.

**Interfaces:**
- DocumentRepository receives actorId, collectionId, canView, canDelete and uses useDocuments/useDocumentMutations.
- DocumentRow receives one DocumentDto and callbacks; only REGISTERED exposes download/delete.
- DocumentDeleteDialog receives the selected DocumentDto, pending state, confirm, and error.

- [ ] Step 1: Add failing tests for empty/loading/error, server search/filter/page, row status/actions, and delete dialog behavior.
- [ ] Step 2: Run the component tests and confirm the repository components are absent.
- [ ] Step 3: Implement DocumentRepository with ui/table and server pagination; do not modify global DataTable.
- [ ] Step 4: Implement DocumentRow and DocumentDeleteDialog with existing Badge/Button/Dialog/Sonner.
- [ ] Step 5: Run component tests and confirm cleanup-pending is not misrepresented as delete failure; commit.

## Task FE-06 - Integrate into the existing KnowledgeHub page

**Modify:** src/apps/Blocks.Web/src/features/knowledgehub/components/RepositoryFrame.tsx.

Current file:
- returns CollectionState for non-ready collection state;
- renders a disabled upload placeholder;
- renders a hard-coded empty repository message.

Replace only the ready-state content with:
1. DocumentUploader;
2. UploadProgressList;
3. DocumentRepository.

Add props for actorId, collectionId, canAdd, canView, and canDelete. Keep CollectionState behavior for none/loading/denied/outage/unavailable. Keep the current card hierarchy and spacing aligned to the Stitch reference.

**Modify:** src/apps/Blocks.Web/src/features/knowledgehub/routes/KnowledgeHubPage.tsx.

It already computes actorId, canView, canCreate, canDelete, selectedId, and selected collection. Pass these into RepositoryFrame. Do not reimplement collection selection, route parsing, tabs, dialogs, or MainLayout.

Preserve:
- collection selector and DocumentCount badge;
- repository and research tabs;
- AskResearchFrame unchanged;
- P02 actor-keyed page boundary;
- existing collection CRUD controls.

**Modify:** src/apps/Blocks.Web/src/features/knowledgehub/types/collections.types.ts.

Change DocumentCount comment from "Always 0 in P02" to a real count of active REGISTERED documents. Do not locally increment/decrement it; invalidate/refetch the collection detail after upload/delete.

**Modify:** src/apps/Blocks.Web/src/features/knowledgehub/components/RepositoryFrame.test.tsx.

Replace disabled-placeholder assertions with real repository/uploader composition assertions. Preserve non-ready CollectionState tests.

**Optional test updates:** KnowledgeHubPage.test.tsx and renderKnowledgeHub.tsx only if the current harness needs the P02 cache boundary or outlet permission context. Do not rewrite the test helper unnecessarily.

**Interfaces:**
- RepositoryFrame props: actorId, collectionId, canAdd, canView, canDelete plus the existing collection state.
- KnowledgeHubPage passes its existing selected collection, actor, and permission values; AskResearchFrame remains unchanged.

- [ ] Step 1: Update RepositoryFrame tests to preserve all non-ready CollectionState branches.
- [ ] Step 2: Replace only the ready-state placeholder with DocumentUploader, UploadProgressList, and DocumentRepository.
- [ ] Step 3: Pass actor/collection/permission props from KnowledgeHubPage; keep selector, count badge, tabs, and shell unchanged.
- [ ] Step 4: Update DocumentCount comment and invalidate/refetch collection detail after mutations.
- [ ] Step 5: Run KnowledgeHubPage/RepositoryFrame tests and commit integration.

## Task FE-07 - Verify API client, cache isolation, responsive layout, and mockup fidelity

### FE-07.1 - API client behavior

Add or extend focused tests for postMultipart:
- Content-Type default is removed for FormData;
- browser sets the multipart boundary;
- Authorization interceptor still adds the current token;
- token refresh behavior remains the existing ApiClient behavior;
- onUploadProgress and AbortSignal are passed;
- downloadFile passes timeout and unwrapBlobErrors.

Do not change ordinary JSON API requests.

### FE-07.2 - Actor/cache races

Use deferred promises in useDocumentUploads/useDocumentMutations tests:
- actor A upload pending -> actor B login -> A response resolves;
- actor A delete pending -> actor B selects another collection;
- actor A logout/login A again while old mutation pending;
- late response must not toast or invalidate another session's cache.

### FE-07.3 - Visual review

Compare the actual implementation with docs/knowledgehub/references/stitch_blocks_interface/screen.png:
- 1280x1024 baseline;
- 1440x900 desktop;
- 390x844 mobile.

Capture:
1. selected collection with empty real repository;
2. upload card/drop state;
3. real uploaded document row;
4. byte upload progress;
5. separate registration-pending state;
6. failed/retry state;
7. search/filter/page;
8. delete dialog and cleanup-pending message.

Keep existing Blocks MainLayout, collection selector/count badge, and tab hierarchy. Do not copy prototype fake documents, fake progress, AI answer modal, or second sidebar. No horizontal page overflow at 390px.

### FE-07.4 - Commands

**Interfaces:**
- Consumes: all P03 API/hooks/components and P02 visual reference.
- Produces: passing frontend tests/build/lint and visual evidence for desktop/mobile.

- [ ] Step 1: Run focused API, hook, and component tests.
- [ ] Step 2: Run the complete frontend test suite.
- [ ] Step 3: Run production build and lint; fix only P03-related failures.
- [ ] Step 4: Capture desktop/mobile states and compare with the Stitch reference.
- [ ] Step 5: Inspect git diff for fake data, unsupported READY/parser states, new dependencies, or global UI changes.
- [ ] Step 6: Record PASS/FAIL/NOT RUN and commit the frontend workstream.

Run from repository root:

~~~powershell
npm --prefix src/apps/Blocks.Web test -- --run
npm --prefix src/apps/Blocks.Web run build
npm --prefix src/apps/Blocks.Web run lint
git diff --check
~~~

Also run focused KnowledgeHub tests during implementation:

~~~powershell
npm --prefix src/apps/Blocks.Web test -- src/features/knowledgehub
~~~

Record actual PASS/FAIL/NOT RUN and the branch revision. Do not remove unrelated failing tests to obtain a green run.

## Done Criteria

P03-C is locally ready when:
- all new API/hooks/components tests pass;
- build and lint pass;
- upload queue is sequential and progress is based on actual bytes;
- registration is separate from transfer progress;
- actor and collection cache boundaries are preserved;
- only real backend data is rendered;
- existing shadcn components are reused without CLI/install;
- visual comparisons at desktop/mobile are reviewed;
- no real Gateway/DB/FileService acceptance is claimed from mocked UI tests.

Handoff:
- record actual test/build/lint commands and results;
- list screenshots and visual deviations;
- keep live Gateway/TLS/permission checks NOT RUN until owner authorization;
- provide P03-B with any API contract mismatch before integrated acceptance.
