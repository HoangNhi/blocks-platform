# FileService Storage Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Giữ FileService tự host, chặn truy cập filesystem ngoài quyền và sửa vòng đời upload/avatar mà không đưa BusinessService hoặc watermark trở lại.

**Architecture:** Dùng storage root riêng, logical key được resolve bằng mapping server và manifest JSON gắn owner cho batch tạm. Một FileService writer tuần tự hóa mutation; backend nghiệp vụ chịu trách nhiệm quyền đối tượng qua RPC nội bộ. Avatar dùng HTTP có JWT, frontend đọc blob qua API client.

**Tech Stack:** FileService .NET 8, SystemService/Gateway .NET 10, ASP.NET Core, System.Text.Json, filesystem, YARP, React/TypeScript, Axios, Vitest; không thêm package.

**Spec:** `docs/superpowers/specs/2026-10-22-fileservice-storage-hardening-design.md` đã duyệt ngày 2026-10-22.

**Trạng thái:** Người dùng yêu cầu tiếp tục bằng subagent từ phần đã làm dở.
Đã hoàn tất phần code, checks và review độc lập của Tasks 1–9; Task 9 bàn giao
các gate môi trường chưa chạy, không đánh dấu production-ready.
Không cho phép chuyển dữ liệu thật, sửa cấu hình triển khai thật hoặc deploy.

### Tiến Độ Đối Chiếu Code, 2026-10-23

Checkbox từng bước phía dưới ghi phần đã kiểm chứng khi tiếp tục. Các bước RED
không có log lịch sử vẫn để trống, không yêu cầu sửa ngược code để giả lập lịch sử.
Không suy diễn RED lịch sử từ GREEN hiện tại.

| Task | Trạng thái hiện tại | Bằng chứng |
| --- | --- | --- |
| 1–3 | Đã sửa bổ sung từ backend audit; task review đạt; canonical GUID có RED/GREEN | `194422a`, `c5e48e4`, `daf2b76`; paths/sessions/lifecycle/removal trong suite cuối |
| 4 | HTTP/gRPC/Gateway có checks thật; thiếu cluster config và OPTIONS đã vá, re-review đạt | `70ec28f`, `b2777b7`; 8 boundary cases, reload YARP thật; RED 3 FAIL, GREEN đạt |
| 5 | Hoàn tất code; quyền domain thật còn prerequisite | `823f4c2`; contract/runtime/source PASS; auth 37 PASS, 2 NOT RUN trên DB tạm cô lập |
| 6 | Hoàn tất | `526978c`; tests upload/save/retry, bổ sung caller trong Task 7 |
| 7 | Hoàn tất; opt-in JSON error cho avatar đã sửa và re-review đạt | `ec72a49`, `192d7a5`; frontend cuối 316 tests PASS, build PASS, lint 0 errors/17 warnings |
| 8 | Reader cũ đã bỏ; migration fixture và runbook đã thêm | `3523c61`; 4 migration checks PASS, gồm restore rehearsal riêng tư |
| 9 | Hoàn tất checks/review code và handoff; gate triển khai còn NOT RUN | Windows 67 PASS/0 FAIL/3 NOT RUN; Linux 70 PASS/0 FAIL/0 NOT RUN; frontend 316 PASS; publish/image .NET 8 smoke PASS |

Gate triển khai thật vẫn **NOT RUN**: firewall/private port, inventory consumer,
backup/restore dữ liệu thật, copy/checksum thực tế, quota/ACL volume, quyền domain
với fixture thật và browser E2E xuyên các service. Không deploy khi các gate bắt
buộc chưa được xác nhận.

## Global Constraints

- Baseline sau commit `4988f13`; Catalog snapshot WIP ở `e92415a`, không sửa Catalog trong plan này.
- Giữ FileService `net8.0`, SystemService/Gateway `net10.0`; không nâng dependency hoặc sửa Shared/ServiceDefaults.
- Không DB FileService, object storage, broker, antivirus, distributed lock, watermark, Office conversion hoặc RAG.
- Một FileService instance ghi vào một persistent volume riêng; không có writer khác sửa cây storage.
- `FileStorage:RootPath` bắt buộc là absolute path, không nằm trong/chứa/trùng web root; thiếu/sai phải fail startup.
- Giữ HTTP envelope `Success`, `StatusCode`, `Data`, `Message`, gồm lỗi ứng dụng có thể nằm trong HTTP 200.
- Giữ `POST /api/UploadFile`, form `files`/`FolderName`, giới hạn `52428800` bytes; response không có attachment Data.
- Actor lấy từ claim `name` là GUID khác rỗng; `MapInboundClaims=false`, `NameClaimType=unique_name`.
- File tạm gắn actor; FolderName chỉ là GUID alias, không phải bằng chứng sở hữu.
- Avatar mới chỉ nhận đúng một PNG/JPEG/WebP có header phù hợp; không SVG hoặc file tài liệu.
- Avatar HTTP yêu cầu JWT; mọi user có JWT hợp lệ được xem vùng avatar, không suy ra quyền đọc tài liệu.
- Giữ RPC/message/tag protobuf; `WatermarkText` khác rỗng tiếp tục `Unimplemented`.
- Preview nguyên bản tối đa `52428800` bytes; không đọc hết file lớn rồi mới kiểm tra.
- Không generic HTTP GET theo raw path; ngừng embed SAR và direct/static download/video fallback đã duyệt.
- Không delete ảnh cũ trong request save; chỉ ghi nhận sau DB commit và đối soát khi tạm dừng ghi.
- Không chạy SQL hiện có, migrations, cleanup, copy/move file thật hoặc đổi secret/config triển khai thật trong task code.
- Test filesystem dùng temp root ngẫu nhiên; trước recursive cleanup phải kiểm tra absolute path nằm trong fixture.
- Test DB chỉ khi có cấu hình cô lập được xác nhận: localhost, database `blocks_systemservice_cleanup_test`, schema ngẫu nhiên.
- Các commit task chỉ stage file của task; giữ mọi thay đổi người dùng phát sinh.

## Review Focus

- JWT refresh/HTTP 200 chứa JSON lỗi khi đang tải blob: không hiển thị JSON như ảnh, không bypass refresh; Task 7.
- Retry save sau khi file đã finalize nhưng DB thất bại: dùng lại key, không upload lại vào phiên đã finalize; Tasks 3, 5, 6.
- Logout/đổi user trong khi avatar request đang chạy: abort, revoke URL và không đưa ảnh phiên cũ vào phiên mới; Task 7.
- Route alias/transform hoặc reload YARP config đưa gRPC ra public: kiểm tra selected cluster, không chỉ prefix `/File`; Task 4.
- File đích/receipt bị mất sau restart hoặc đã soft-delete: retry không trả key hỏng, không phục hồi file đã xóa; Task 3.

## File Map

Các đường dẫn đầy đủ dưới đây là ranh giới dự kiến. Không tạo abstraction ngoài những unit được nêu.

| File | Trách nhiệm |
| --- | --- |
| `src/services/Blocks.FileService/Infrastructure/Storage/FileStorage.cs` (mới) | Root validation, vùng storage, resolve key, kiểm tra path/symlink và limit chung. |
| `src/services/Blocks.FileService/Infrastructure/Storage/UploadSessionStore.cs` (mới) | Manifest/receipt JSON, publish metadata và một write gate; model nội bộ nằm cùng file. |
| `src/services/Blocks.FileService/Services/CoreFeature/UploadFile/UploadFileService.cs` và `IUploadFileService.cs` | Stage/finalize/delete/preview, actor và avatar validation. |
| `src/services/Blocks.FileService/Configs/ConfigService.cs`, `Configs/ConfigureAuthentication.cs`, `Program.cs` | DI singleton storage, eager root check, raw claims, host production dùng lại được trong checks, không static upload. |
| `src/services/Blocks.FileService/Controllers/UploadFileController.cs`, `Controllers/AvatarController.cs` (mới), `Services/gRPC/FileGrpcService.cs` | Acknowledgement/retired embed, avatar có JWT và status gRPC. |
| `src/services/Blocks.FileService/Blocks.FileService.csproj`, `Dockerfile` | Không đóng gói dữ liệu `wwwroot`, volume ghi riêng. |
| `src/services/Blocks.FileService/Dockerfile.dockerignore` | Chỉ gửi source backend cần thiết vào Docker build context; không gửi upload cũ, frontend, output build hoặc cấu hình local. |
| `src/services/Blocks.ApiGateway/Program.cs`, `Middlewares/FileServiceBoundary.cs` (mới) | Chặn route đến FileService ngoài allowlist, giữ các pipeline proxy khác. |
| `src/services/Blocks.SystemService/DTOs/CoreFeature/User/Requests/UserRequest.cs`, `EditProfileRequest.cs` | AvatarAction và validation. |
| `src/services/Blocks.SystemService/Services/CoreFeature/User/UserProfile.cs`, `UserService.cs` | Ignore avatar client, keep/replace/remove, ghi nhận cleanup sau DB commit. |
| `src/services/Blocks.SystemService/Services/Commons/UploadFile/UploadFileService.cs` | Giữ protobuf client/wrapper; xác minh không phụ thuộc việc RPC xóa ảnh cũ. |
| `src/apps/Blocks.Web/src/features/file/api/uploadfile.api.ts`, `types/uploadfile.types.ts`, `src/config/constants.ts` | Acknowledgement, avatar API/types và endpoint đúng. Các đường dẫn frontend còn lại tính từ `src/apps/Blocks.Web/`. |
| `src/components/ui/upload-avatar.tsx`, `src/features/system/types/user.types.ts` | Ref result tách trạng thái, action type và session alias của selection. |
| `src/features/system/routes/User/PopupDetail.tsx`, `UserPage.tsx`, `src/features/system/hooks/useUser.ts` | Dừng save khi upload lỗi, await save, retry và reset sau thành công. |
| `src/components/layout/MainLayout/PopupEditProfile.tsx`, `NavUser.tsx` | Cùng contract cho sửa hồ sơ, truyền AvatarAction đầy đủ. |
| `src/features/file/hooks/useAvatarUrl.ts` (mới), `src/components/ui/avatar.tsx`, `src/lib/utils.ts`, `src/lib/api.ts` | Avatar blob, lifecycle URL, key mapping, cancellation và blob error envelope. |
| `src/components/ui/upload-file.tsx`, `file-viewer-dialog.tsx`, `src/features/business/routes/Sar/PopupSarEditor.tsx` | Ngừng direct/static fallback và embed SAR; không viết lại nghiệp vụ Business. |
| `test/FileService.RemovalChecks/Program.cs`, `FileService.RemovalChecks.csproj` | Reuse console harness; thêm mode paths, sessions, lifecycle, transport, gateway, migration. |
| `test/FileService.RemovalChecks/FileBoundaryChecks.cs` | Kiểm chứng transport bổ sung: native gRPC, Gateway config reload thật và static sentinel tại đúng web root; mode boundary dùng cùng harness. |
| `test/SystemService.CleanupChecks/Program.cs` | Thêm avatar cases vào auth fixture hiện có; không thêm framework. |
| Test Vitest cạnh từng file frontend bị sửa; `docs/operations/fileservice-storage-cutover.md` (mới), `AGENTS.md` | Regression, runbook và lệnh kiểm tra. |

Không thêm project test backend: đổi **riêng** `FileService.RemovalChecks` sang
`net10.0` và thêm ProjectReference Gateway khi Task 4 cần kiểm tra proxy trong
cùng process; FileService production vẫn `net8.0`. Không reference SystemService
vào harness này để tránh trùng protobuf client/server; test user DB ở harness System.

## Baseline Và Thứ Tự

Kiểm tra trước lúc tạo plan:

| Command | Kết quả |
| --- | --- |
| `dotnet run --project test/FileService.RemovalChecks` | PASS: 11 checks. Chỉ production DI và direct methods. |
| `dotnet build src/services/Blocks.SystemService/Blocks.SystemService.csproj --no-restore --nologo` | PASS: 0 errors, 21 warnings. |
| `dotnet build src/services/Blocks.CatalogService/Blocks.CatalogService.csproj --no-restore --nologo` | FAIL baseline: 123 errors, 38 warnings; service cũ gọi DbSet đã bỏ. Không xử lý ở đây. |

Tasks 1–4 là chuỗi storage/transport. Task 5 dùng contract Task 3; Task 6 dùng Task 5;
Task 7 dùng avatar HTTP Task 4 và UI Task 6. Tasks 8–9 đóng rollout.
Các commit trung gian không được deploy riêng; chỉ rollout đồng bộ sau nghiệm thu.

### Task 1: Root Riêng, Resolver Và Actor

**Files:** Tạo `FileStorage.cs` ở File Map; sửa FileService ConfigService,
ConfigureAuthentication, UploadFileService và harness `Program.cs`.

**Interfaces:**
- `public enum StorageArea { Temp, Files, Avatars, Deleted, LegacyQuarantine }`, cùng file FileStorage.
- `public sealed class FileStorage(IConfiguration configuration, IWebHostEnvironment environment)`.
- `public const long MaxFileBytes = 52428800`.
- `string Resolve(StorageArea area, params string[] segments)`, `string ResolveActiveKey(string key)`, `string ResolveSession(Guid actorId, Guid folderId)`, `string ResolveAvatar(string fileName)`.
- Constructor service ở task này: `UploadFileService(FileStorage storage, IHttpContextAccessor contextAccessor)`.
- `Guid GetActorId()` private trong UploadFileService; đọc principal qua IHttpContextAccessor, không nhận actor do client khai báo.
- Chỉ `System/Attachments` cho generic file và `System/Avatar` cho avatar được đăng ký ban đầu; Avatar RPC riêng mới được ghi vào vùng avatar.

- [x] **Step 1: Thêm regression `paths` vào harness trước sửa behavior**

Tái sử dụng `CheckAsync`/`Require`. Fixture có web root, private root, thư mục cạnh
và sentinel ngoài root; config/JWT là dữ liệu test, không đọc secret ứng dụng.
Viết các case `filename_traversal_does_not_escape`, `sibling_root_is_rejected`,
`absolute_unc_ads_are_rejected`, `unregistered_target_is_rejected`:

```csharp
Require(File.ReadAllBytes(sentinel).SequenceEqual(before), "outside file unchanged");
Require(!File.Exists(escapedFile), "no path escape");
Require(!File.Exists(Path.Combine(webRoot, "Files", "Temp", folderId)), "no user data in web root");
```

Case list thêm `C:\outside`, `C:relative`, `\\host\share`, `../x.txt`, `..\x.txt`,
`name.txt:stream`, URI, empty GUID; không truy cập UNC thật trong test.
Test mới phải từ chối trước bất kỳ network/filesystem access ngoài fixture.

- [ ] **Step 2: Chạy RED**

`dotnet run --project test/FileService.RemovalChecks -- paths`.
Expected: assertion phát hiện behavior cũ; không coi compile error hoặc fixture lỗi
là bằng chứng RED. Giữ checks removal cũ chạy riêng trong thời gian thay interface.

- [x] **Step 3: Thêm resolver và đăng ký singleton**

Validate root sớm trong ConfigService, không fallback wwwroot. Giới hạn mỗi segment,
full-path boundary, case của OS, ancestor symlink/reparse point và vùng đọc/ghi.
Không nhận URL hoặc decode lần hai. Logical key dùng `/`, GUID canonical `D`.
Generic key `System/Attachments/<related-id>/<file-id>.<ext>` ánh xạ vùng Files;
`System/Avatar/<file-id>.<ext>` ánh xạ Avatars, không phải URL static.
Tên gốc không được dùng làm tên vật lý.

Set MapInboundClaims/NameClaimType như Global Constraints; giữ issuer, audience,
signature, lifetime và challenge envelope. Missing/invalid actor là BusinessException
401; input sai 400, target không đăng ký 400. Không sửa JWT producer/Shared.

- [x] **Step 4: Kiểm tra GREEN và root guards**

Chạy lại mode `paths`; thêm startup/config cases thiếu/relative/overlap root.
Symlink/junction cases dùng link thực trên OS hỗ trợ; thiếu quyền phải báo NOT RUN,
không biến thành pass. FileSystem ngoài fixture không đổi.

- [x] **Step 5: Commit riêng**

Stage đúng FileStorage, ConfigService, ConfigureAuthentication, UploadFileService và
harness đã sửa; `git diff --cached --check`; commit
`fix(files): confine storage paths and bind upload actor`.

### Task 2: Batch Tạm Bất Biến Và Publish Manifest

**Files:** Tạo `UploadSessionStore.cs`; sửa FileService upload interface/service,
ConfigService, UploadFileController và harness.

**Interfaces:**
- `public sealed class UploadSessionStore(FileStorage storage)` đăng ký singleton.
- Constructor service đổi thành `UploadFileService(FileStorage storage, UploadSessionStore sessions, IHttpContextAccessor contextAccessor)`.
- `internal SemaphoreSlim WriteGate { get; } = new(1, 1)`; một gate cho mọi mutation trong instance.
- `internal Task<UploadSession?> ReadAsync(Guid actorId, Guid folderId, CancellationToken ct)`;
  `internal Task WriteAsync(UploadSession session, CancellationToken ct)` publish JSON cùng filesystem.
- Model nội bộ cùng file: `StoredUploadFile(Guid Id, string OriginalName, string Extension, long Length, string Sha256)`;
  `UploadTarget(string Kind, string Service, string Module, Guid? RelatedId)`;
  `UploadSession(Guid ActorId, Guid FolderId, Guid BatchId, DateTimeOffset CreatedAt, string State, List<StoredUploadFile> Files, UploadTarget? Target, List<ModelAttachment>? Result)`.
- State dùng `Staged`, `Finalizing`, `Finalized`; Target/Result chưa finalize để null.
  Target avatar có Kind=Avatar và RelatedId=null; generic có Kind=Attachment và GUID RelatedId khác rỗng.
- `Task Insert(List<IFormFile> files, string FolderName, CancellationToken cancellationToken = default)` giữ tên public method; controller truyền RequestAborted.

- [x] **Step 1: Viết case `sessions`**

`invalid_second_file_preserves_previous_batch`, `copy_failure_preserves_manifest`,
`cancel_preserves_manifest`, `same_folder_other_actor_is_isolated`,
`concurrent_replace_is_not_mixed`, `unpublished_batch_is_ignored_after_restart`,
`corrupt_manifest_fails_closed`.

```csharp
Require(File.ReadAllBytes(manifestPath).SequenceEqual(previousManifest), "manifest unchanged on failure");
Require(File.ReadAllBytes(previousFile).SequenceEqual(previousBytes), "previous batch retained");
Require(currentBatchHashes.Order().SequenceEqual(batchAHashes.Order()) ||
        currentBatchHashes.Order().SequenceEqual(batchBHashes.Order()), "no mixed batch");
```

Dùng hai batch A/B có nội dung khác nhau cho race test; currentBatchHashes phải
tính từ bytes file được manifest hiện hành trỏ tới, không chỉ đọc hash trong JSON.
Dùng stream test ném IOException/OperationCanceledException sau N bytes; tên file
vật lý luôn UUID. Lỗi disk-full mô phỏng chỉ chứng minh error path, không chứng
minh quota filesystem thực; ghi giới hạn đó trong output.

- [ ] **Step 2: Chạy RED**

`dotnet run --project test/FileService.RemovalChecks -- sessions`.
Expected: behavior xóa batch cũ/cross-owner hiện tại bị test bắt đúng.

- [x] **Step 3: Ghi version mới rồi publish**

Validate toàn bộ danh sách trước; reject batch/file rỗng và tổng bytes > limit.
Đo bytes thực ghi, không chỉ tin IFormFile.Length. Dùng FileMode.CreateNew,
batch UUID mới và original-name metadata. Tính SHA256 bằng API stdlib trên file đã
ghi để retry kiểm chứng file đích, không buffer bản copy thứ hai trong memory.
Không xóa thư mục session hiện hành.
Hoàn tất bytes mới publish manifest; giải phóng gate trong finally.

Gate singleton cố ý serialize mọi mutation để không có dictionary khóa tăng vô
hạn; comment `ponytail:` ghi ceiling một writer và nâng lên khóa theo phiên khi
đo được contention. Không biến gate thành static khóa mọi host test.
JSON đọc hỏng/không hợp lệ trả lỗi 409, không tự tạo manifest thay thế.
ReadAsync chỉ trả null khi phiên chưa tồn tại; session đã tồn tại nhưng thiếu
manifest phải fail closed, không lấy batch UUID bất kỳ làm dữ liệu hiện hành.

- [x] **Step 4: Chạy GREEN qua restart**

Mode `sessions` đạt; tạo DI/host mới cùng fixture root để kiểm chứng trạng thái
trên đĩa, không chỉ state trong memory. Inject publish failure bằng file/directory
conflict trong fixture, không sửa ACL của project. Batch cũ không mất.

- [x] **Step 5: Commit**

Stage UploadSessionStore, upload interface/service, ConfigService, controller và
harness; kiểm tra staged diff; commit `fix(files): publish staged batches without data loss`.

### Task 3: Finalize, Delete Receipts Và Avatar Bất Biến

**Files:** Sửa upload interface/service, UploadSessionStore, FileGrpcService,
UploadFileController và harness; không đổi protobuf.

**Interfaces:** Thay sync methods nội bộ, không đổi wire:

```csharp
Task<List<ModelAttachment>> UploadDataAsync(string relatedId, string servicePath, string folderName, string tempFolder, CancellationToken cancellationToken = default);
Task<bool> DeleteDataAsync(IEnumerable<string> filePaths, CancellationToken cancellationToken = default);
Task<string> UploadAvatarAsync(string folderUploadId, CancellationToken cancellationToken = default);
Task<ModelFilePreview> PreviewFileAsync(string fileUrl, CancellationToken cancellationToken = default);
Task<ModelFilePreview> PreviewAvatarAsync(string fileName, CancellationToken cancellationToken = default);
```

Giữ `Insert` Task 2. Bỏ `InsertAndReturn` và sync variants sau khi sửa toàn bộ
caller trong FileService/harness. SystemService wrapper vẫn gọi RPC như cũ.

- [x] **Step 1: Viết case `lifecycle`**

`partial_finalize_preserves_source`, `retry_returns_same_keys`,
`different_target_is_rejected`, `finalized_session_cannot_be_replaced`,
`deleted_or_missing_receipt_target_is_not_resurrected`, `delete_retry_is_distinguished_from_unknown_key`,
`avatar_rejects_multiple_or_non_raster_files`, `avatar_does_not_delete_old_image`.

```csharp
Require(first.Select(f => f.FileUrl).SequenceEqual(retry.Select(f => f.FileUrl)), "stable retry keys");
Require(first.Select(f => f.Id).SequenceEqual(retry.Select(f => f.Id)), "stable attachment IDs");
Require(File.Exists(oldAvatarPath), "old avatar untouched by finalize");
Require(!File.Exists(originalPath) && File.Exists(deletedPath), "delete moved private file");
```

Đích file thứ hai là directory cùng tên trong fixture để gây lỗi copy xác định.
Đổi fixture avatar bytes giả sang PNG thật nhỏ; thêm JPEG/WebP header và negative
case SVG/document dù client khai image MIME. Không gọi header check là antivirus.

- [ ] **Step 2: Chạy RED**

`dotnet run --project test/FileService.RemovalChecks -- lifecycle`.
Expected: retry sinh key mới, avatar nhận file tùy ý hoặc luồng cũ bị phát hiện.

- [x] **Step 3: Implement state machine tối thiểu**

Giữ nguồn; persist Target, Result dự kiến và State=Finalizing trước copy. Dùng ID
file đã có trong manifest cho tên đích/ModelAttachment.Id; RelatedId parse từ target.
Chỉ publish Finalized khi tất cả file đích đủ; retry không ghi đè file đích không
khớp length/SHA256 trong manifest, không đổi target và không tạo file mới.
Không xóa source trước receipt.
Nếu kết quả đã xóa/thiếu thì 409 yêu cầu upload mới; không phục hồi từ source cũ.

Delete resolve active key, không cho Temp/Deleted/quarantine. Receipt gồm key,
deletion ID, state và đích; index ở `Deleted/receipts/<SHA256(key)>.json`.
Ghi ý định trước move, đánh dấu hoàn tất sau move; cùng gate xử lý recovery khi
nguồn đã mất nhưng đích đúng receipt còn tồn tại. Unknown key không có receipt
là false; lỗi từng file log có correlation, không raw secret/path.

UploadAvatar dùng target avatar riêng gắn session/batch, không dùng oldImage để
xóa file. PNG: signature đúng; JPEG: SOI marker; WebP: RIFF/WEBP marker và header
length tối thiểu. Đây là bounded header validation, không decode/convert ảnh.
RPC vẫn nhận oldImage nhưng bỏ qua quyền xóa của trường đó.

Preview kiểm length trước và giới hạn bytes thực đọc trong khi đọc, tránh race file
tăng kích thước. Không đọc Temp/Deleted/receipt; generic preview `.unknown` vẫn có
MIME application/octet-stream nếu key hợp lệ và file thuộc vùng đã cho phép.

- [x] **Step 4: Giữ semantics HTTP/gRPC và retire embed**

RPC truyền CancellationToken; map BusinessException 400/401/403/404/409/413 sang
InvalidArgument/Unauthenticated/PermissionDenied/NotFound/FailedPrecondition/
ResourceExhausted. IOException khác thành Internal, không JSON/stack trace.
`WatermarkText` được từ chối trước đọc file như baseline.
Embed action trả `new BaseResponse(false, 410, ...)`, không đọc/ghi batch.

- [x] **Step 5: Chạy GREEN và commit**

Chạy modes `lifecycle`, `sessions` và removal đã điều chỉnh key/fixture cho root
mới. Giữ mọi assertion bytes/MIME/không conversion, không bỏ test để xanh.
Stage đúng các file task; commit `fix(files): make finalization retry-safe and retire SAR embeds`.

### Task 4: Transport Thật, Avatar HTTP Và Gateway Boundary

**Files:** Sửa Program.cs của FileService/Gateway, FileService csproj/Dockerfile,
tạo AvatarController, Gateway FileServiceBoundary; sửa FileService harness csproj/Program.

**Interfaces:**
- `Blocks.FileService.FileServiceHost.Build(string[] args) : WebApplication`
  và `Blocks.ApiGateway.GatewayHost.Build(string[] args) : WebApplication`, cùng
  Program.cs hiện có; entrypoint production gọi Build(args).Run(), không có test-only DI callback.
- Builder chỉ định ApplicationName assembly production để discover controller đúng
  khi entry assembly là harness; không copy startup sang fixture.
- AvatarController kế thừa BaseController, route `api/Avatar`, GET `{fileName}`,
  gọi `PreviewAvatarAsync`; content bytes/MIME và headers theo spec.
- Gateway middleware `FileServiceBoundary.InvokeAsync(HttpContext context)`;
  dùng selected cluster từ YARP proxy feature trong pipeline MapReverseProxy.
- Cấu hình deployment mới, không secret: `FileProxy:ClusterId` là ID cluster thực
  đã kiểm kê. Không giả định tên cluster từ appsettings được track.

- [x] **Step 1: Thêm listener fixture và case `transport`, `gateway`**

Retarget riêng harness sang net10.0; ProjectReference Gateway bên cạnh FileService.
Host production trên localhost port 0, content root/storage root temp; JWT key ngẫu
nhiên trong memory/args test, audit/OTLP chỉ loopback. Không đọc config ứng dụng thật.

Gọi RPC bằng GrpcChannel/CallInvoker, full method service `file.FileProto`, message
hiện có; không thêm client generator/package. Test HTTP token thiếu/sai/hết hạn,
token ownerA/B, gRPC native và gRPC-Web qua gateway, avatar bytes và headers.

```csharp
Require(envelope.StatusCode == 401 && !envelope.Success, "HTTP auth envelope");
Require(grpcStatus == StatusCode.FailedPrecondition, "foreign alias cannot resolve another actor's batch");
Require(downstreamCalls == 0, "blocked gateway request never forwarded");
```

Case bắt buộc: `legacy_static_urls_are_not_served`, `avatar_requires_jwt`,
`grpc_owner_is_raw_name_guid`, `file_cluster_alias_is_denied`,
`file_cluster_reload_cannot_expose_rpc`, `other_cluster_still_proxies`.
Đặt sentinel trong wwwroot/Temp/Deleted/cache để kiểm chứng không chỉ file thiếu.
Hai actor có cùng alias được quản lý hai phiên riêng; actor B không có phiên của
mình nhận FailedPrecondition, không scan phiên A để đoán owner. Manifest ActorId
không khớp actor/directory phải PermissionDenied; thêm case fixture tương ứng.

- [ ] **Step 2: Chạy RED**

Chạy `dotnet run --project test/FileService.RemovalChecks -- transport` và `-- gateway`.
Expected: static bypass hoặc proxy forwarding bị assertions bắt; gRPC test có JWT
hợp lệ để không nhầm Unauthenticated với path/owner validation.

- [x] **Step 3: Build production host và endpoint riêng**

Bỏ UseStaticFiles phục vụ upload; eager validate root trước app.Start. Avatar GET
chỉ UUID raster filename, thêm Cache-Control=no-store, X-Content-Type-Options=nosniff.
Không tạo route GET nhận raw path. Giữ middleware auth, CORS, audit và health.
Trong csproj loại toàn bộ `wwwroot/**` khỏi publish content; Docker COPY không
đưa file upload lịch sử vào image, không sửa/xóa chúng trên ổ thật.

- [x] **Step 4: Allowlist tại gateway theo destination đã chọn**

Với selected cluster bằng FileProxy:ClusterId, chỉ cho:
POST `/File/api/UploadFile`, POST `/File/api/UploadFile/embed` (để nhận lỗi 410),
GET `/File/api/Avatar/{uuid.ext}`. Mọi path/method khác, application/grpc* và route
`/file.FileProto/...` bị chặn, không forward; giữ CORS preflight do UseCors xử lý.
Prefix File đến cluster khác hoặc thiếu FileProxy:ClusterId cũng bị chặn.
Alias `/OtherPrefix/...` đến cùng File cluster không bypass allowlist.
Boundary bị từ chối dùng HTTP 200 + BaseResponse(false, 403, thông báo chung);
test đọc cả body, không chỉ HTTP status. Route không match proxy vẫn có thể 404.

Giữ các middleware mặc định session affinity/load balancing/passive health checks
khi dùng overload MapReverseProxy có custom pipeline; không làm đổi proxy service khác.
Chỉ cho transform `PathRemovePrefix=/File` ở route của File cluster, không cho
PathSet/PathPattern/Method hoặc header transform đổi Content-Type sau guard.
Kiểm tra selected route/cluster snapshot mỗi request để config reload không giữ
allowlist stale; thêm test reload đổi sang transform RPC bị từ chối.
Code không thể tự biết một cluster ID khác cũng trỏ đến FileService qua DNS alias:
runbook bắt buộc kiểm kê tất cả destination/route runtime; phát hiện alias chưa
được guard thì không rollout, kể cả cập nhật config sau cutover.
Không coi test gateway là chứng minh firewall.

- [x] **Step 5: GREEN, publish và commit**

Chạy transport/gateway modes; publish FileService vào `bin/hardening-check-publish`,
assert output không có sentinel upload hoặc thư viện watermark/Office đã bỏ.
Build Gateway/SystemService trực tiếp. Stage file task; commit
`fix(files): protect file transport and authenticated avatar delivery`.

### Task 5: AvatarAction Trong SystemService

**Files:** UserRequest, EditProfileRequest, UserProfile, UserService và SystemService
file wrapper ở File Map; test `test/SystemService.CleanupChecks/Program.cs`.

**Interfaces:**
- Cả hai request thêm `public string AvatarAction { get; set; } = "keep";`.
- Validators nhận đúng `keep`, `replace`, `remove`; replace yêu cầu FolderUpload
  GUID khác rỗng; null/giá trị lạ bị từ chối. Không thêm enum/converter shared.
- Giữ public signatures Insert/Update/EditProfile và UploadAvatarAsync wrapper.

- [x] **Step 1: Thêm avatar cases trong auth fixture**

Tái sử dụng guard DB/schema `RunAuthChecksAsync`, role fixture và context actor.
Recording IUploadFileService fake nằm trong test để chứng minh số lần gọi/key;
UserService, mapper, validation, DB save dùng thật. Không fake authorization luôn true.
Test SaveChangesInterceptor chỉ trong fixture gây lỗi xác định ở target case.

`avatar_keep_ignores_client_path`, `avatar_replace_uses_server_key`,
`avatar_remove_clears_db_without_delete_call`, `avatar_db_failure_keeps_old_key`,
`avatar_upload_failure_does_not_save`, `avatar_invalid_action_is_rejected`,
`avatar_retry_reuses_finalized_key`, `avatar_insert_keep_does_not_call_file_rpc`.

```csharp
Assert(saved.Avatar == expectedServerKey, "server-owned avatar key");
Assert(recording.DeleteCalls == 0, "no online avatar cleanup");
Assert(persistedAfterFailure.Avatar == oldKey, "DB failure preserves old reference");
```

Đọc lại DB bằng scope mới. Ghi rõ fake chỉ kiểm tra orchestration; file bytes và
RPC transport đã được kiểm ở Tasks 3–4, không gọi đây là full cross-service E2E.

- [ ] **Step 2: Chạy RED có DB cô lập**

`dotnet run --project test/SystemService.CleanupChecks -- auth`.
Expected: assertions phát hiện overwrite client path/unconditional RPC.
Nếu thiếu DB test: ghi NOT RUN; không chạy vào database ứng dụng hoặc kết luận đã đạt.

- [x] **Step 3: Sửa mapping và flow**

Ignore entity.Avatar ở hai reverse request maps; capture oldKey trước mapping.
keep không gọi file RPC, insert keep/remove khởi tạo rỗng. replace gọi RPC với
FolderUpload, dùng key response; empty/sai namespace response là lỗi trước save.
remove gán rỗng. Không tin request.Avatar hoặc dùng nó làm nguồn cleanup.

Sau SaveChangesAsync thành công mới log structured key cũ cần đối soát nếu đổi;
DB fail không delete ảnh cũ hoặc candidate. Không thêm outbox hoặc online delete.
Giữ password/role guard, auth, audit và nghiệp vụ user khác.

- [x] **Step 4: GREEN và hồi quy**

Chạy lại auth; `dotnet run --project test/SystemService.CleanupChecks -- contract`,
`-- runtime`, và `& ./test/SystemService.BusinessDependency.Check.ps1`.
Các case actor/audit production DI hiện có vẫn đạt; không bỏ interceptor.

- [x] **Step 5: Commit**

Stage đúng user requests/profile/service/wrapper nếu sửa và harness;
commit `fix(system): make avatar updates explicit and preserve stored files`.

### Task 6: Frontend Stage Result Và Save Intent

**Files:** File API/types, user types, upload-avatar, User popup/page/useUser,
EditProfile popup/NavUser ở File Map; thêm tests cạnh các component sửa.
Đường dẫn test frontend-relative: `src/components/ui/upload-avatar.test.tsx`,
`src/features/system/routes/User/PopupDetail.test.tsx`,
`src/features/system/hooks/useUser.test.tsx`,
`src/components/layout/MainLayout/PopupEditProfile.test.tsx` và `NavUser.test.tsx`
cùng thư mục.

**Interfaces:**

```typescript
type AvatarAction = "keep" | "replace" | "remove";
type AvatarUploadResult =
  | { kind: "unchanged" }
  | { kind: "remove" }
  | { kind: "staged"; folderUpload: string };
// UploadAvatarRef.upload(): Promise<AvatarUploadResult>; failure rejects.
// fileService.uploadFile(...): Promise<ApiResponse<void>>
// saveChange(user: User, isAddMore: boolean): Promise<boolean>
```

User/EditProfileRequest thêm AvatarAction optional khi đọc, bắt buộc caller save
mới gửi một giá trị hợp lệ. Backend vẫn có default keep cho client cũ.

- [x] **Step 1: Viết tests RED**

`upload-avatar.test.tsx`: `stages_without_attachment_data`, `failure_rejects`,
`unchanged_and_remove_are_distinct`, `save_retry_does_not_reupload_same_selection`.
User/Profile popup tests: `failed_upload_blocks_save`, `save_sends_avatar_action`,
`double_submit_is_blocked`, `save_and_add_more_uses_fresh_session`.

```typescript
expect(result).toEqual({ kind: "staged", folderUpload: expect.any(String) });
expect(saveChange).not.toHaveBeenCalled(); // failed upload
expect(uploadFile).toHaveBeenCalledTimes(1); // retry after DB save failure
```

- [ ] **Step 2: Chạy RED**

`npm --prefix src/apps/Blocks.Web test -- src/components/ui/upload-avatar.test.tsx`.
Chạy thêm hai popup tests khi tạo. Expected: thiếu Data khiến flow cũ không trả
staged hoặc vẫn save sau upload lỗi; không dùng snapshot nguồn thay interaction.

- [x] **Step 3: Minimal state cho selection và session**

UploadAvatar tạo GUID alias mới cho selection mới, ghi nhớ staged acknowledgement
cho đúng File object để retry save không Insert lại vào phiên đã finalize.
Ref result trả folderUpload cho caller; bỏ prop/default `"Avatars"` không hợp lệ.
Đổi selection/reset thành alias mới; remove trước save không gọi upload.
Upload bị reject trước acknowledgement thì retry dùng alias mới để không kẹt vào
phiên thiếu manifest; giữ nguyên selected File. Không đổi alias đã staged chỉ vì
DB save thất bại, vì retry đó phải dùng lại receipt.
Validate client PNG/JPEG/WebP và input accept tương ứng, server vẫn là nguồn quyết định.

Popups await upload, map unchanged/remove/staged thành keep/remove/replace và
FolderUpload đúng alias; không dùng FileUrl giả. Await saveChange boolean; false
giữ selection/alias cho retry, true reset. useUser và NavUser trả đúng boolean,
NavUser phải forward AvatarAction tới editProfile, không làm rơi field.
Trong UserPage key popup theo user.Id để “Lưu và thêm tiếp” remount form mới.
Disable submit trong pending và xử lý rejection có thông báo tiếng Việt.

- [x] **Step 4: GREEN và commit**

Chạy upload-avatar, hai popup, useUser/NavUser tests liên quan và upload-file.test.tsx.
`npm --prefix src/apps/Blocks.Web run build`; báo baseline riêng.
Stage files task và tests; commit `fix(web): separate staged avatar uploads from save intent`.

### Task 7: Avatar Blob Có JWT, Không Rò Phiên

**Files:** Tạo `src/features/file/hooks/useAvatarUrl.ts`; sửa API/constants/api.ts,
avatar.tsx, upload-avatar.tsx, utils.ts ở File Map; test cạnh hook/API/components.
Test frontend-relative: `src/features/file/hooks/useAvatarUrl.test.tsx`,
`src/lib/api.test.ts`, `src/components/ui/avatar.test.tsx`; mở rộng upload-avatar test của Task 6.

**Interfaces:**
- `fileService.getAvatarBlob(key: string, signal?: AbortSignal): Promise<Blob>` chỉ
  tạo endpoint từ key System/Avatar/UUID đã validate; không gửi bearer tới URL tùy ý.
- `useAvatarUrl(source?: string | null): string | undefined` dùng AuthContext hiện có.
- `ApiClient.downloadFile(url: string, config?: Pick<AxiosRequestConfig, "signal">)`
  giữ Axios response blob cho success, không bỏ interceptor token/refresh.

- [x] **Step 1: Viết tests RED**

`useAvatarUrl.test.tsx`: `jwt_blob_becomes_object_url`, `account_change_revokes_old_url`,
`logout_aborts_pending_avatar`, `stale_response_after_unmount_is_ignored`,
`external_url_never_receives_bearer`, `json_error_never_becomes_image`.
`api.test.ts`: `blob_soft_401_refreshes_once`, `blob_403_rejects_without_image`,
`json_document_without_error_envelope_is_preserved`, `signal_survives_retry`.

```typescript
expect(URL.revokeObjectURL).toHaveBeenCalledWith(oldObjectUrl);
expect(signal.aborted).toBe(true);
expect(URL.createObjectURL).not.toHaveBeenCalledWith(errorBlob);
expect(requestedUrl).not.toContain("access_token");
```

- [ ] **Step 2: Chạy RED**

`npm --prefix src/apps/Blocks.Web test -- src/features/file/hooks/useAvatarUrl.test.tsx src/lib/api.test.ts`.
Expected: lifecycle/soft401 cũ không đáp ứng, không coi mock trả bytes đúng là
bằng chứng request đã gắn bearer; kiểm tra request config.

- [x] **Step 3: Thêm hook và chuẩn hóa blob lỗi tối thiểu**

Hook nhận raw avatar key hoặc URL avatar cũ được getFileUrl tạo **đúng API origin/
prefix**, hoặc URL endpoint avatar mới của đúng API origin. Endpoint constant là
`API_ENDPOINTS.File.Avatar.GET(fileName)` dưới `/File/api/Avatar/`.
Không tùy tiện lấy filename cuối từ URL bên ngoài. Chỉ private avatar
được fetch; nguồn static/blob/data hợp lệ của UI không được gửi bearer đi ngoài API.
AuthContext đổi user hoặc null phải hủy request/revoke URL; response cũ không
được set state. Không cache blob toàn cục hoặc localStorage; không cần thêm query cache.

AvatarImage dùng hook tại chỗ tập trung; UploadAvatar dùng hook cho ảnh server và
tự revoke preview selection. Bỏ default NoPicture.png từ FileService, dùng fallback
icon/asset frontend. Rà caller avatar trong Nav/User và Business; các caller đã
qua AvatarImage không cần sửa riêng. SAR collaboration avatar không qua wrapper
phải dùng URL blob của hook; không viết lại logic collaboration.

Trong response interceptor hiện có, chỉ với responseType blob + MIME JSON, parse
JSON và nhận diện envelope `Success=false`/numeric StatusCode. Soft401 đi lại flow
refresh có _retry; lỗi khác reject; JSON không phải error envelope giữ nguyên blob.
Avatar API chỉ chấp nhận MIME PNG/JPEG/WebP ở success. Không refactor refresh queue.

- [x] **Step 4: GREEN, audit caller và commit**

Chạy tests hook/API/avatar, build frontend. Search remaining `getFileUrl(...Avatar)`
và kiểm tra không còn native img private URL chưa qua hook; không sửa static ảnh khác.
Stage đúng hook/callers/API/tests; commit `fix(web): fetch private avatars through authenticated blob requests`.

### Task 8: Ngừng Đường Đọc Cũ Và Viết Cutover Runbook

**Files:** upload-file.tsx, file-viewer-dialog.tsx, PopupSarEditor.tsx và tests;
tạo `docs/operations/fileservice-storage-cutover.md`; sửa AGENTS.md và harness.
Test frontend-relative: `src/components/ui/upload-file.test.tsx`,
`src/components/ui/file-viewer-dialog.test.tsx`,
`src/features/business/routes/Sar/PopupSarEditor.test.tsx`.

**Interfaces:**
- Không thêm backend download/streaming giả. Giữ preview theo ID qua API nghiệp vụ
  hiện có; khi không có backend thì lỗi rõ ràng, không fallback static/raw key.
- Runbook là tài liệu thao tác, không script tự động chạy migration.
- Harness thêm mode `migration` chỉ copy/đối chiếu dữ liệu fixture.

- [x] **Step 1: Viết tests RED cho client cũ**

`private_download_does_not_fetch_static_path`, `video_does_not_use_direct_file_url`,
`download_failure_does_not_open_static_fallback`, `sar_embed_is_explicitly_retired`.

```typescript
expect(window.open).not.toHaveBeenCalled();
expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining("/File/System/Attachments/"));
expect(editorInsertImage).not.toHaveBeenCalled(); // retired embed
```

Mode migration: old key giữ được bytes qua mapping mới; Deleted/cache/unowned temp
đến quarantine riêng, không thành phiên owner suy đoán; checksum mismatch chặn cutover.

- [ ] **Step 2: Chạy RED rồi bỏ fallback**

Chạy focused upload-file/file-viewer tests và SAR test mới. Thay direct fetch/link/
video static bằng thông báo trạng thái không hỗ trợ khi thiếu endpoint có quyền.
Giữ các preview đã dùng API nghiệp vụ; không xóa màn hình hoặc đổi quyền.
SAR không upload ảnh embed nữa, vẫn cho đọc nội dung/text theo khả năng backend còn có.

- [x] **Step 3: Viết runbook có gate và bằng chứng**

Runbook phải có checklist: inventory DB/volume/consumer; mapping key/namespace;
backup + restore thử; dừng ghi; chặn tất cả static origin; copy + checksum;
quarantine temp cũ/cache/Deleted; xử lý avatar cũ ngoài format; publish/image sạch;
FileProxy:ClusterId và tất cả DNS alias/route transforms; firewall không public port;
volume ACL/quota/disk alert; test từ mạng người dùng/backend; mở lại ghi.

Phần đối soát avatar chỉ chạy khi tạm dừng ghi: so toàn bộ DB key/consumer đã kiểm
kê với volume, xuất candidate list để duyệt riêng trước soft-delete/purge.
Không lấy thiếu log cleanup làm bằng chứng file không còn tham chiếu.
Rollback giữ bảo trì, đối soát file mới/DB trước đổi version, không bật lại static.
Tách rõ việc tạo/check fixture với quyền chạy data operation thật.

- [x] **Step 4: GREEN và commit**

Chạy focused frontend tests và `dotnet run --project test/FileService.RemovalChecks -- migration`.
Cập nhật AGENTS các mode/lệnh thật và vai trò FileService; không thay phần DB secret.
Stage files task; commit `chore(files): retire static readers and document private storage cutover`.

### Task 9: Verification Tổng Và Handoff Triển Khai

**Files:** Test harness, runbook/AGENTS và lỗi đúng phạm vi phát hiện khi kiểm chứng.
Không mở rộng sửa Catalog để làm build solution xanh.

**Interfaces:** No-args FileService harness chạy toàn bộ DB-free modes và exit khác
0 khi case bắt buộc fail; từng mode vẫn chạy riêng để điều tra.

- [x] **Step 1: Chạy suite trên Windows và Linux thật**

```powershell
dotnet run --project test/FileService.RemovalChecks
dotnet build src/services/Blocks.FileService/Blocks.FileService.csproj
dotnet build src/services/Blocks.SystemService/Blocks.SystemService.csproj
dotnet build src/services/Blocks.ApiGateway/Blocks.ApiGateway.csproj
& ./test/SystemService.BusinessDependency.Check.ps1
dotnet run --project test/SystemService.CleanupChecks -- contract
dotnet run --project test/SystemService.CleanupChecks -- runtime
```

Expected: zero failed checks/build errors; ghi riêng warning và baseline.
Linux có thể chạy cùng dotnet modes trong môi trường cô lập có SDK 10; không coi
chạy Linux Docker build là đã chạy Linux path/symlink tests.

- [x] **Step 2: Chạy frontend và dependency/publish**

```powershell
npm --prefix src/apps/Blocks.Web test
npm --prefix src/apps/Blocks.Web run build
npm --prefix src/apps/Blocks.Web run lint
dotnet list src/services/Blocks.FileService/Blocks.FileService.csproj package --vulnerable --include-transitive
dotnet publish src/services/Blocks.FileService/Blocks.FileService.csproj -c Release -o src/services/Blocks.FileService/bin/hardening-check-publish
```

Chỉ `npm ci` nếu dependency chưa cài; không sửa lockfile. Inspect publish/image
bytes/assets, không chỉ csproj. Không suppress advisory; phát hiện mới báo riêng.
Chưa chạy lệnh nào trong block này ở lượt viết plan.

- [ ] **Step 3: DB/transport E2E và vận hành có prerequisite riêng**

Chạy `dotnet run --project test/SystemService.CleanupChecks -- auth` chỉ với DB test
đã xác nhận. Smoke xuyên frontend/Gateway/SystemService/FileService: login, tạo user,
replace avatar, retry khi save lỗi, remove, đọc avatar có/không JWT, denied user
update không tạo file; giữ audit production.

Chứng minh object permission bằng chức năng quyền thật trong schema test; thiếu
function/môi trường thì NOT RUN, không dùng stub ACL luôn true để đánh dấu đạt.
Firewall/private port và volume quota cần bằng chứng từ deployment thật được cho
phép; listener localhost và stream ném IOException không thay thế được.

- [x] **Step 4: Review thay đổi và ghi coverage**

Đối chiếu từng hàng tiêu chí spec với task/check/result. Ghi PASS/FAIL/NOT RUN,
baseline, consumer ngoài repo chưa xác nhận, image chưa kiểm hoặc OS thiếu quyền
symlink. Không coi code complete là production-ready khi gate network/migration
hoặc DB mandatory chưa có bằng chứng.
`git diff --check`; không secret/generated output, không sửa ngoài phạm vi.

- [x] **Step 5: Commit kết quả xác minh**

Stage đúng test/runbook/AGENTS được cập nhật; commit
`test(files): verify private storage and avatar regression coverage`.
Nếu không có diff thì không tạo empty commit. Không push/deploy/migrate dữ liệu thật.

## Coverage Và Tự Rà Soát Plan

| Spec | Task |
| --- | --- |
| 1–3: giữ self-host, giới hạn hạ tầng | Global Constraints, 1–9. |
| 4: root/path/symlink/key/delete | 1, 3, 4, 8, 9. |
| 5: JWT/network/domain/preview/avatar | 1, 3, 4, 5, 7, 9. |
| 6: stage publish, cancel, concurrency, recovery/quota | 2, 3, 8, 9. |
| 7: acknowledgement, action, save/cleanup | 5, 6, 7, 8. |
| 8: legacy/protobuf/dependency | 3, 4, 8, 9. |
| 9: inventory/backup/copy/rollback | 8–9; thao tác thật cần quyền riêng. |
| 10–12: scope/checks/RAG ngoài phạm vi | File Map, Global Constraints, 9. |

Tự rà soát khi viết: signatures Task 3 dùng nhất quán ở RPC và harness; SystemService
wrapper không bị đổi nhầm sang chữ ký service nội bộ. Actor lấy claim ID, không username;
staged folder theo File selection, không theo key trong DB. Review Focus có test
ở đúng task. Không thêm library/DB và không coi offline cleanup là thu hồi ngay URL cũ.

Nguồn tham khảo API YARP cho Task 4, cần đối chiếu với package thực tế lúc triển khai:
`https://learn.microsoft.com/en-us/aspnet/core/fundamentals/servers/yarp/middleware?view=aspnetcore-10.0`

## Duyệt Plan Và Cách Thực Hiện

Người dùng đã yêu cầu **Subagent-driven** để phân tích phần đã làm và hoàn thiện
plan. Không chạy lại Tasks 1–6 chỉ vì checkbox chưa được cập nhật: kiểm tra ledger,
commit và code hiện tại trước. Các phần độc lập chạy song song với phạm vi file
không chồng lấn; phiên chính quản lý tích hợp, review và Git index.

Quyền triển khai code không bao gồm migration dữ liệu, cấu hình thật, push hoặc
deploy. Các gate cần DB cô lập, mạng triển khai hoặc dữ liệu thật phải ghi rõ
PASS/FAIL/NOT RUN và bằng chứng; không đánh dấu xong chỉ vì build thành công.

## Nghiệm Thu Khi Tiếp Tục, 2026-10-23

| Phạm vi | Kết quả |
| --- | --- |
| Private root, namespace, actor, path/symlink | PASS suite Windows/Linux; riêng 3 symlink checks Windows NOT RUN do quyền OS, Linux chạy đủ |
| Staged publish, bytes thực, failure/cancel/restart, owner | PASS; manifest hỏng hoặc whitespace GUID không được dùng như batch mới |
| Finalize/retry/delete/avatar | PASS; giữ target/result bất biến, kiểm length/SHA256, không hồi sinh file đã xóa |
| HTTP/gRPC/Gateway | PASS; listener thật, native HTTP/2/gRPC-Web, static sentinels, YARP reload và alias/transform/OPTIONS |
| AvatarAction và DB orchestration | 37 PASS/2 NOT RUN trên DB tạm cô lập; fake file client không chứng minh cross-service E2E |
| Frontend | 66 suites/316 tests PASS, build PASS, lint 0 errors/17 warnings; JSON tài liệu giống envelope 401/403 giữ nguyên bytes, avatar vẫn refresh |
| Migration/rollback fixture | 4 PASS; chỉ fixture, không copy/migrate dữ liệu thật |
| Publish/image/dependency | PASS publish/image .NET 8 và avatar smoke; NuGet không báo package vulnerable theo nguồn hiện tại; OS/base-image CVE NOT RUN |
| Review tổng | PASS spec/quality sau một fix wave và scoped re-review; JSON blob đã sửa; fail-closed khi thiếu Gateway config là đánh đổi vận hành đã ghi, 4 Minor deferred |
| Deploy/firewall/quota, external consumer, dữ liệu thật, quyền domain, browser E2E | NOT RUN; chặn mở ghi cho đến khi có bằng chứng và phê duyệt riêng |

Commit khi tiếp tục: `3523c61` bỏ static readers/SAR embed; `ec72a49` hoàn thiện
avatar JWT/blob và vòng đời phiên; `b2777b7` sửa storage recovery, canonical GUID,
Gateway boundary và checks tích hợp; `192d7a5` giới hạn JSON error unwrap cho
avatar. Giữ nguyên commit/thay đổi Catalog xen kẽ.

Các bước RED gốc để trống vì thiếu log trước implementation; không phải code
chưa được viết. Lượt tiếp tục đã ghi RED bổ sung thật: sessions/lifecycle phát
hiện lỗi receipt/state/metadata, paths/sessions bắt whitespace GUID, boundary
bắt thiếu cluster config và OPTIONS bypass. Không coi lỗi compile/fixture là RED.

Runbook lưu commands, kết quả, giới hạn và cách chia agent:
`docs/operations/fileservice-storage-cutover.md`. Brief/report/diff review và
log cục bộ nằm ở `.superpowers/sdd/2026-10-22-fileservice-storage-hardening/`.
Giữ nhánh `chore/project-cleanup`, không merge/push/deploy trong lượt này.
