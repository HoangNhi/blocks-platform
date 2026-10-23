# Backend .NET 10 And Package Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa toàn backend hiện có lên .NET 10 LTS với dependency stable tương thích, giữ nguyên hợp đồng, bảo mật và dữ liệu.

**Architecture:** Giữ bốn service và hai thư viện chung; thay riêng MVC validation adapter đã ngừng phát triển bằng một async action filter nhỏ. Nâng consumer cùng graph dependency, dọn AppHost cho đúng checkout, kiểm chứng production artifact riêng với harness.

**Tech Stack:** .NET SDK `10.0.402`, ASP.NET Core/EF Core `10.0.13`, Npgsql `10.0.3`, Oracle MySQL provider `10.0.12`, FluentValidation `12.2.0`, gRPC `2.84.0`, OpenTelemetry `1.20.1`, Aspire `13.6.3`, console assertions và PowerShell.

**Spec:** [2026-10-23-dotnet10-platform-package-upgrade-design.md](../specs/2026-10-23-dotnet10-platform-package-upgrade-design.md), người dùng duyệt ngày 2026-10-23.

## Global Constraints

- Đây là plan chờ review, không phải quyền triển khai. Mọi checkbox dưới đây chưa chạy; không suy PASS từ lịch sử.
- Đọc `AGENTS.md`, spec và source hiện tại; chạy `git status --short`, giữ mọi thay đổi có sẵn. Tạo/chọn worktree chỉ khi bắt đầu thực thi theo skill phù hợp, không tạo trong bước viết plan.
- Tất cả production/harness target `net10.0`; `global.json`: `10.0.402`, `rollForward: latestPatch`, `allowPrerelease: false`. Thiếu SDK thì báo blocker; không tự sửa SDK/model/provider trên máy.
- Dùng đúng snapshot mục 3.1 của spec, làm mới metadata/advisory trước khi sửa; không preview/RC, floating version, .NET/EF 11, Central Package Management, downgrade hoặc tắt warning/audit.
- EF Core/Relational/Design/Tools `10.0.13`; giữ Npgsql `10.0.3`, Oracle MySql.EntityFrameworkCore `10.0.12`, không đổi provider/schema/scaffold/server.
- Giữ `PrivateAssets`/`IncludeAssets`, protobuf nguồn và field numbers; không commit `bin/`, `obj/`, artifact hoặc lockfile npm thay đổi.
- HTTP 200 có thể chứa lỗi ứng dụng: giữ `Success`, `StatusCode`, `Data`, `Message`, thông báo Việt, converters và BusinessException flow.
- Giữ JWT raw `name` GUID, `unique_name` username, permission/audit/soft-delete; gRPC-Web HTTP/1.1 `RequestVersionExact`, `x-service-authorization`, 50 MiB/file, 128 MiB/gRPC.
- Proxy trust giữ `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, hai loopback; `ForwardLimit=1` Gateway, `2` File/System/Catalog. Không tin mọi proxy.
- File chỉ một writer/private volume, root tuyệt đối ngoài webroot, không symlink/junction/static uploads; giữ batch owner, receipt, retry và thứ tự lưu avatar/DB.
- Không frontend upgrade, service đã xóa, infrastructure mới, redesign retry/auth, DB thật, migration/seed, file migration hoặc deploy. Không log secrets.
- Mỗi task kiểm chứng consumer chịu ảnh hưởng; không build/test đồng thời trên cùng `bin/obj`, port hoặc fixture. Chỉ stage đúng file đã sửa; không dùng `git add .`.
- Khi chưa có quyền/fixture, ghi `NOT RUN` và giữ rollout gate chưa đạt; không bỏ assertion hoặc đổi điều kiện để có PASS. License AutoMapper/Oracle vẫn cần owner xác nhận.

## Review Focus

- **Authorization + input sai:** JWT/permission phải chặn trước validation/action; không trả lỗi validation thay cho từ chối quyền. Test Task 1/3.
- **Null/binding/nested validation:** JSON hỏng, root null, child collection và lỗi đầu tiên phải giữ baseline; không kích hoạt validator Shared vốn chưa đăng ký. Test Task 1/3.
- **Mất kết nối/cancellation:** retry audit không tăng, mutation không bị lặp, shutdown không để nền tiếp tục gọi fixture đã dọn. Test Task 4/5.
- **Proxy/config reload:** header từ IP không tin cậy và transform/alias thay đổi không vượt FileServiceBoundary hoặc mở private file. Test Task 2/6.
- **Artifact/OS khác harness:** production assembly phải target10; image non-root đọc/ghi đúng volume, root/link sai bị từ chối, private file không thành static. Test Task 5/8.

---

## File Structure Và Lịch Thực Hiện

Một plan vì các phần dùng chung có phụ thuộc chặt. Task 1 ghi baseline; Task 2
đổi target/toolchain; Task 3 thay validation; Task 4 nâng Defaults; Task 5 nâng
ba service; Task 6 Gateway; Task 7 AppHost; Task 8 artifact; Task 9 nghiệm thu.
Mỗi task sau chỉ bắt đầu khi prerequisite đã đạt.
Không tiếp tục task phụ thuộc khi blocker khiến chưa có baseline hoặc chưa kiểm
chứng được prerequisite; ghi blocker không thay cho việc vượt gate.

Quy ước đường dẫn trong Files: Shared = `src/platform/Blocks.Shared`,
Defaults = `src/platform/Blocks.ServiceDefaults`; File/System/Catalog/Gateway =
`src/services/Blocks.FileService`, `src/services/Blocks.SystemService`,
`src/services/Blocks.CatalogService`, `src/services/Blocks.ApiGateway`.
`<Name>.csproj` luôn nằm tại thư mục project cùng tên; File/System/Catalog harness =
`test/FileService.RemovalChecks`, `test/SystemService.CleanupChecks`,
`test/CatalogService.CleanupChecks`. Path rút gọn trong task nối với đúng gốc này.

| File | Vai trò / task |
| --- | --- |
| `global.json` (mới) | Khóa SDK, Task 2. |
| `src/platform/Blocks.Shared/Blocks.Shared.csproj`, `Common/HttpContextExtensions.cs` | Target/core validation/gRPC/proxy API, Task 2/3/5. |
| `src/platform/Blocks.Shared/Common/FluentValidationActionFilter.cs` (mới) | Async MVC filter dùng tại System/Catalog, Task 3. |
| `src/platform/Blocks.ServiceDefaults/Blocks.ServiceDefaults.csproj`, `Extensions.cs` | Target, discovery/resilience/OTel; chỉ sửa Extensions để tương thích và giữ hành vi, Task 2/4. |
| Bốn `src/services/Blocks.<Name>/Blocks.<Name>.csproj` | Pin service graph, Task 2/3/5/6; Name = FileService, SystemService, CatalogService, ApiGateway. |
| System/Catalog `Configs/ConfigService.cs` | Bỏ adapter cũ, đăng ký filter/validators; giữ DB/JSON/gRPC, Task 3. |
| `src/services/Blocks.SystemService/DTOs/CoreFeature/Permission/Requests/UpdatePermissionsRequest.cs` | Explicit child rules chỉ khi baseline xác nhận đã validate, Task 3. |
| File/System/Catalog `Dockerfile`, `Dockerfile.dockerignore` | .NET10, SDK pin, context/linked proto, Task 2/8. |
| File/Gateway `dotnet-tools.json` | `dotnet-ef 10.0.13`, không di chuyển manifest, Task 2. |
| `src/platform/Blocks.AppHost/Blocks.AppHost.csproj`, `AppHost.cs` | Aspire/JavaScript và xóa stale resource/reference, Task 7. |
| System/Catalog harness `Program.cs`, `ValidationChecks.cs` (mới) | Dispatch `validation`, production MVC parity, Task 1/3/5. |
| `test/SystemService.CleanupChecks/PlatformChecks.cs` (mới) | Dispatch `platform`: proxy/discovery/resilience checks, Task 2/4. |
| File harness `Program.cs`, `UpgradeChecks.cs` (mới), `FileBoundaryChecks.cs` | Retry baseline và dispatch `upgrade` Task 1; artifact TFM/Swagger Task 5; giữ boundary Task 6. |
| Ba harness `.csproj` | Giữ net10; EF direct pin đồng bộ; không thêm framework, Task 4/5. |
| `test/Backend.Upgrade.Check.ps1` (mới) | Source-only modes `runtime`, `containers`, `packages`, `apphost`, `all`; không start process/DB, Task 2/5/6/7. |
| `test/Backend.ArtifactChecks.ps1` (mới) | Smoke publish/image cô lập, fail-fast/cleanup process, Task 8. |
| `test/CatalogService.Removal.Check.ps1` | Cập nhật expected Protobuf; giữ provider/security assertions, Task 5. |
| `docs/operations/backend-net10-upgrade.md` (mới) | Baseline, graph/check evidence, rollout/rollback gates; không secrets, Task 1/9. |
| `AGENTS.md`, `docs/operations/fileservice-storage-cutover.md` | Đồng bộ trạng thái/commands, giữ giới hạn dữ liệu, Task 9. |

Không cần sửa controllers/routes/protos/entity/Program production để thêm test seam.
Chỉ sửa source ngoài bảng nếu dependency API thật sự buộc đổi và ghi lý do.

## Task 1: Khóa Baseline Và HTTP Validation Hiện Có

**Files:**
- Create: `test/SystemService.CleanupChecks/ValidationChecks.cs`.
- Create: `test/CatalogService.CleanupChecks/ValidationChecks.cs`.
- Modify: `test/SystemService.CleanupChecks/Program.cs` (mode dispatch).
- Modify: `test/CatalogService.CleanupChecks/Program.cs` (mode dispatch).
- Create: `test/FileService.RemovalChecks/UpgradeChecks.cs`.
- Modify: `test/FileService.RemovalChecks/Program.cs` (mode dispatch), `FileBoundaryChecks.cs` (responder test-only).
- Create: `docs/operations/backend-net10-upgrade.md` (evidence, mọi target check còn NOT RUN).

**Interfaces:**
- Consumes: `ConfigService.ExecuteConfigService(WebApplicationBuilder)`, `ExecuteConfigAuthentication(WebApplicationBuilder)`, `AddServiceDefaults<TBuilder>()`, production controllers/auth/audit filters.
- Produces: mỗi harness có `internal static class ValidationChecks` với `public static Task RunAsync()`; CLI `-- validation`, exit0 chỉ khi mọi assertion đạt, exception làm exit khác0.
- Produces: baseline HTTP/validation/child behavior và dependency graph đã resolve; không sửa rule.
- Produces: File `internal static class UpgradeChecks`, `internal static Task RunAsync(Func<string, Func<Task>, Task> check)`; mode `upgrade` và `all` cùng gọi. Task 1 chỉ có retry characterization, Task 5 mở rộng.
- Produces: responder overload `public static Task<EphemeralAuditResponder> StartAsync(Func<int, Grpc.Core.StatusCode> statusForCall)`; call index bắt đầu1, giữ overload không tham số trả OK cho callers cũ.

- [x] **Step 1: Ghi baseline có thể tái lập.**

Từ repo root chạy từng lệnh dưới đây, ghi exit code/case count và commit thực.
Đọc guard của từng mode trước; không chạy `auth`/`provider`.

```powershell
git status --short
dotnet --list-sdks
dotnet build src/services/Blocks.FileService/Blocks.FileService.csproj -c Release
dotnet build src/services/Blocks.SystemService/Blocks.SystemService.csproj -c Release
dotnet build src/services/Blocks.CatalogService/Blocks.CatalogService.csproj -c Release
dotnet build src/services/Blocks.ApiGateway/Blocks.ApiGateway.csproj -c Release
& ./test/SystemService.BusinessDependency.Check.ps1
& ./test/CatalogService.Removal.Check.ps1
dotnet run --project test/FileService.RemovalChecks -c Release
dotnet run --project test/SystemService.CleanupChecks -c Release -- contract
dotnet run --project test/SystemService.CleanupChecks -c Release -- runtime
dotnet run --project test/CatalogService.CleanupChecks -c Release -- contract
dotnet run --project test/CatalogService.CleanupChecks -c Release -- runtime
```

Inventory đúng 10 `.csproj` trong bảng spec, không quét `bin/obj`. Với từng project
restore được, ghi package audit `--include-transitive` theo Task 9 Step 2. AppHost
restore/build có thể lỗi missing BusinessService: ghi riêng, không phục hồi service
và không suy rằng lỗi ở service khác cũng là baseline. Không chạy solution để
thay baseline từng project.

- [x] **Step 2: Viết characterization qua MVC production.**

`ValidationChecks.RunAsync()` tạo Kestrel `http://127.0.0.1:0`, config in-memory
đè JWT/connection/gRPC, OTLP rỗng; DB string chỉ localhost port1, không mở kết nối.
Dùng production registration/auth/middleware/filter và controller assembly.
System thay boundary `IUserService`, `IRoleService`, `IAuditLogWriter` bằng
recording doubles; Catalog thay `IFacultyService`, dùng gRPC responder localhost
cho permission/audit. Không thay authentication scheme hoặc authorization filter.
Permission responder hỗ trợ allow/deny; valid JWT ký bằng key fixture riêng.

Giữ helper/fake trong `ValidationChecks.cs`, không tạo reusable test library.
Thêm dispatch `validation` vào switch/usage hiện có. Mỗi case có tên và assertion:

| Case | Route/input | Điều kiện khóa |
| --- | --- | --- |
| `single_error_keeps_vietnamese_envelope` | User insert chỉ Username rỗng; Faculty insert Name rỗng; các field còn lại hợp lệ | HTTP200, Success=false, StatusCode400, Message chính xác bên dưới; không mutation/audit. |
| `binding_errors_keep_baseline` | POST insert với `{`, body rỗng, `null`, GUID sai kiểu | HTTP/body/Message trước đổi được ghi và assert lại sau đổi; không gọi action. |
| `multiple_errors_keep_first_message` | `{}` tại hai insert | Ghi chính xác lỗi đầu tiên, không đổi thành mảng/ProblemDetails. |
| `permission_precedes_validation` | Cùng input sai, JWT thiếu/expired/sai key; JWT hợp lệ nhưng deny | Envelope 401/403, không mutation/validation side effect/audit. |
| `valid_request_reaches_action_once` | Insert hợp lệ, permission allow | Success=true, mutation đúng1, actor raw name đúng; audit đã drain trước teardown. |
| `nested_permissions_keep_baseline` | PUT `/api/Role/update-permissions`, list rỗng; một Permission RoleId rỗng; list hợp lệ | Khóa baseline root/child/first-error và số lần gọi; chưa thêm RuleForEach. |
| `unregistered_shared_validator_stays_inactive` | DELETE `/api/User/delete-list`, `Ids=[]`, quyền allow | Giữ baseline, không tự đăng ký DeleteListRequestValidator từ Shared. |

Probe MVC test-only với ApiExplorer IgnoreApi ghi thêm baseline `[Required]`,
implicit required và hai DTO `[FromQuery]` có prefix riêng; không thêm controller
production. Task 3 dùng lại probe này, chỉ thêm async/cancellation cases.

Assertion cốt lõi (helper `Require(bool condition, string message)` local ném
`InvalidOperationException`; `body` là JsonElement của response):

```csharp
Require(response.StatusCode == HttpStatusCode.OK, "HTTP envelope retained");
Require(!body.GetProperty("Success").GetBoolean(), "invalid request rejected");
Require(body.GetProperty("StatusCode").GetInt32() == 400, "application 400");
Require(body.GetProperty("Message").GetString() == "Tên tài khoản không được để trống",
    "User single error retained");
// Catalog case uses: "Tên phòng ban không được để trống".
Require(mutationCalls == 0 && auditCalls == 0, "invalid input has no action side effects");
```

Thêm `audit_retry_success_and_terminal_failure_keep_baseline` tại File UpgradeChecks
và Catalog ValidationChecks ngay trong task này. Đi qua production AuditActionFilter
và typed client; responder HTTP1.1 lần lượt trả grpc-status14 rồi0, sau đó case
luôn14. Ghi tổng transport attempts, action calls, actor và terminal log
`AUDIT LOG LOST`; không đoán tổng attempts bằng số retry Polly.
Catalog phải cho boundary `IFacultyService` trả business failure sau input hợp lệ,
vì filter này chỉ audit action thất bại; không dùng successful insert để chờ audit.
Thêm case upstream HTTP503 rồi200 và ngắt kết nối để đo cả resilience lẫn Polly.
File mở rộng responder theo overload trên; Catalog giữ fixture trong file của nó.
Không sửa production backoff; timeout180s chỉ là guard. Chờ audit success hoặc
terminal log rồi drain trước teardown; action không được replay vì audit lỗi.
Lưu số đo cụ thể vào assertions trước commit, không tính expected từ chính result.

- [x] **Step 3: Chạy characterization trên adapter cũ.**

```powershell
dotnet run --project test/SystemService.CleanupChecks -c Release -- validation
dotnet run --project test/CatalogService.CleanupChecks -c Release -- validation
dotnet run --project test/FileService.RemovalChecks -c Release -- upgrade
```

Expected: PASS trên behavior hiện có. Đây là characterization, không cố tạo RED
cho hành vi đang đúng. Nếu baseline khác giả định, sửa expected theo bằng chứng,
ghi vào evidence; không sửa production để hợp thức hóa baseline.

- [x] **Step 4: Commit chỉ tests/baseline.**

Stage đúng file trong task; commit `test: characterize backend validation and audit before upgrade`.

## Task 2: SDK, Target10, Proxy API Và Docker Context

**Files:**
- Create: `global.json`, `test/Backend.Upgrade.Check.ps1`, `test/SystemService.CleanupChecks/PlatformChecks.cs`.
- Modify: Shared/Defaults/File `.csproj`; Shared `Common/HttpContextExtensions.cs`.
- Modify: File/System/Catalog `Dockerfile`, `Dockerfile.dockerignore`.
- Modify: File/Gateway `dotnet-tools.json`; System harness `Program.cs`.

**Interfaces:**
- Consumes: baseline Task 1; `AddTrustedForwardedHeaders(this IServiceCollection services, int forwardLimit = 1)` giữ chữ ký.
- Produces: sáu production project ngoài AppHost target10, SDK pin; CLI `& ./test/Backend.Upgrade.Check.ps1 -Check runtime|containers`.
- Produces: `PlatformChecks.RunAsync(): Task`, mode System `platform`; scope Task 2 chỉ proxy/options/TFM, Task 4 bổ sung Defaults.

- [x] **Step 1: Thêm source/runtime checks kỳ vọng target mới.**

PowerShell dùng `[xml]`/`ConvertFrom-Json`, `$PSScriptRoot` resolve repo,
`$ErrorActionPreference='Stop'`; `-Check` ValidateSet `runtime,containers,packages,apphost,all`.
Chỉ mode đã triển khai mới chạy ở task tương ứng; mode không hợp lệ exit khác0.
`runtime` assert SDK pin, 6 target ngoài AppHost và 3 harness net10, tool manifest
10.0.13; `containers` assert 3 image .NET10, non-root, global.json COPY trước restore,
linked proto không bị bỏ, không suppression duplicate publish. AppHost mode Task 7.

`PlatformChecks` đăng ký Shared extension thật, resolve `IOptions<ForwardedHeadersOptions>`;
assert đúng3 `KnownIPNetworks`, đúng2 KnownProxies, ForwardLimit1/2.
Chạy `ForwardedHeadersMiddleware` với DefaultHttpContext remote IP giả cho trusted
và untrusted; không dùng GetClientIp làm oracle vì helper còn đọc raw header.
Trusted remote đổi `Connection.RemoteIpAddress`/scheme theo giới hạn; untrusted giữ
remote/scheme. Có IPv4-mapped IPv6 và nhiều-hop không vượt ForwardLimit.

- [x] **Step 2: Chạy RED đúng lý do.**

```powershell
& ./test/Backend.Upgrade.Check.ps1 -Check runtime
& ./test/Backend.Upgrade.Check.ps1 -Check containers
```

Expected: lỗi thiếu global.json/net8/File image8, không phải lỗi parser hoặc test setup.
Test `KnownIPNetworks` chỉ chạy được sau source target10; lỗi compile trước đó không
thay cho RED assertion source.

- [x] **Step 3: Đổi target và toolchain cùng lượt.**

Thêm global.json đúng Global Constraints; đổi Shared/Defaults/File net10 cùng lượt
để File không tham chiếu thư viện target cao hơn. Chưa nâng FV core/package Defaults.
Đổi KnownNetworks sang KnownIPNetworks và `new System.Net.IPNetwork(...)`,
giữ trusted set/ForwardLimit. Pin hai dotnet-ef manifest `10.0.13`.
File FROM aspnet/sdk `10.0`; cả ba Dockerfile thêm
`COPY ["global.json", "./"]` sau WORKDIR `/src`, trước RUN restore.
Thêm `!global.json` sau exclude phù hợp tại File/Catalog ignore; System context
đã cho root file đi qua, xác minh không cần churn ngoài yêu cầu.

- [x] **Step 4: Chạy GREEN và consumer checks.**

Nếu SDK10.0.402 chưa có, dừng task tại prerequisite, không ghi GREEN/commit như hoàn tất.

```powershell
dotnet --version
& ./test/Backend.Upgrade.Check.ps1 -Check runtime
& ./test/Backend.Upgrade.Check.ps1 -Check containers
dotnet run --project test/SystemService.CleanupChecks -c Release -- platform
dotnet run --project test/SystemService.CleanupChecks -c Release -- validation
dotnet run --project test/CatalogService.CleanupChecks -c Release -- validation
dotnet run --project test/FileService.RemovalChecks -c Release
```

Expected: SDK `10.0.402` hoặc later patch trong cùng feature band; các check exit0.
Build trực tiếp Shared/Defaults/bốn service và System/Catalog contract/runtime
như Task 1; AppHost vẫn baseline lỗi tới Task 7.

- [x] **Step 5: Commit phạm vi Task 2.**

Stage từng path trong Files; commit `build: target backend runtime and containers on net10`.

## Task 3: FluentValidation12 Và Async MVC Filter

**Files:**
- Create: `src/platform/Blocks.Shared/Common/FluentValidationActionFilter.cs`.
- Modify: Shared/File/System/Catalog `.csproj`, System/Catalog `Configs/ConfigService.cs`.
- Modify: System `DTOs/CoreFeature/Permission/Requests/UpdatePermissionsRequest.cs` chỉ nếu baseline child cần.
- Test: hai `ValidationChecks.cs` của Task 1.

**Interfaces:**
- Consumes: Task 1 `ValidationChecks.RunAsync()`, Task 2 net10; existing InvalidModelStateResponseFactory và validators.
- Produces: `Blocks.Shared.Common.FluentValidationActionFilter : IAsyncActionFilter, IOrderedFilter`.
- Constructor: `public FluentValidationActionFilter(IOptions<ApiBehaviorOptions> apiBehaviorOptions)`.
- Members: `public int Order => -2001`; `public Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)`.
- Produces: System/Catalog scan scoped validators chỉ assembly service, filter scoped; File không đăng ký filter.

- [x] **Step 1: Thêm test async/cancellation và provider compatibility.**

Trong từng ValidationChecks mở rộng test-only controller Task 1 (ApiExplorer IgnoreApi),
DTO/validator đăng ký DI rõ ràng, không scan test assembly trong production.
`async_validator_is_awaited_once`: MustAsync có await thực, đếm1, lỗi envelope400,
action0. `request_abort_reaches_validator`: validator báo token cancelled qua
TaskCompletionSource, client cancel, action0, task không treo.
`validator_infrastructure_error_is_not_input400`: validator ném InvalidOperationException,
giữ middleware error flow, không trả Message lỗi rule.
`dataannotations_stay_disabled`: probe `[Required]` và string non-nullable không có
FV rule vẫn như baseline; custom model-validator provider test-only vẫn được giữ.
Hai root arguments cùng DTO phải resolve theo declared parameter type, lỗi theo
parameter/property prefix quan sát baseline, không double-validation. Probe dùng
hai `[FromQuery]` với prefix riêng, không để ApiController suy ra hai body parameters.

```csharp
Require(asyncRuleCalls == 1 && mutationCalls == 0, "async rule awaited once");
Require(cancelledTokenObserved && mutationCalls == 0, "request cancellation propagated");
Require(body.GetProperty("StatusCode").GetInt32() != 400, "infrastructure failure not input error");
```

- [x] **Step 2: Chạy RED trên adapter11.**

Run hai lệnh `-- validation` Task 1. Expected async case fail do MVC sync validation,
không phải giả token/permission hoặc DB. Giữ mọi characterization cũ GREEN.

- [x] **Step 3: Nâng package và thay registration/filter atomically.**

Shared FluentValidation `12.2.0`; bỏ FluentValidation.AspNetCore ở File/System/Catalog.
System/Catalog thêm DI extensions `12.2.0`, `AddValidatorsFromAssemblyContaining`
đúng UserRequestValidator/FacultyRequestValidator; không scan Shared.

Filter lấy validator `IValidator<T>` theo ActionDescriptor parameter type và
RequestServices; non-null argument gọi async với RequestAborted, append errors
vào ModelState đúng prefix. Dùng InvalidModelStateResponseFactory nếu invalid,
otherwise await next; không catch-all validation exceptions, không tự tạo root DTO.
Không cache/reflection framework, không walk graph tổng quát.

Trong AddMvc options thêm scoped filter; suppress implicit required; loại riêng
DataAnnotations model-validator provider, giữ provider khác và binding ModelState.
Nếu type provider là internal, xác định bằng full name
`Microsoft.AspNetCore.Mvc.DataAnnotations.DataAnnotationsModelValidatorProvider`,
không reference inaccessible type và không Clear toàn provider collection.
Giữ factory/GetModelStateAPI/JSON converters và thứ tự authorization/audit.

Nếu Task 1 xác nhận child list được validate, dùng constructor injection
`UpdatePermissionRequestValidator(IValidator<PermissionRequest> permissionValidator)`
và `RuleForEach(x => x.Permissions).SetValidator(permissionValidator)`.
Nếu baseline không validate list đó thì không thêm rule mới; ghi rõ trần này.
Không sửa typo RoleId/MenuId trong PermissionRequestValidator.

- [x] **Step 4: Chạy GREEN.**

Run hai mode `validation`, System/Catalog `contract`, `runtime`, File toàn bộ.
Expected: cả baseline và async/cancel pass, không còn adapter deprecated trong
source/graph sau restore, malformed JSON/null body vẫn envelope cũ.
Các service resolve production DI không cần DB.

- [x] **Step 5: Commit phạm vi Task 3.**

Commit `refactor: replace legacy MVC validation with async FluentValidation12 filter`.

## Task 4: ServiceDefaults, Discovery, Resilience Và Telemetry

**Files:**
- Modify: `src/platform/Blocks.ServiceDefaults/Blocks.ServiceDefaults.csproj`.
- Modify only for API/default behavior compatibility: `src/platform/Blocks.ServiceDefaults/Extensions.cs`.
- Test: `test/SystemService.CleanupChecks/PlatformChecks.cs`, `Program.cs`.
- Test: `test/CatalogService.CleanupChecks/ValidationChecks.cs` (retry boundary fixture).
- Test: `test/FileService.RemovalChecks/UpgradeChecks.cs` (retry baseline Task 1).
- Modify: File/Catalog `.csproj` cho Polly `8.8.0` trong cùng graph.

**Interfaces:**
- Consumes: Task 2 `PlatformChecks.RunAsync()`, các chữ ký public của `Blocks.ServiceDefaults.Extensions` giữ nguyên.
- Produces: Http.Resilience/ServiceDiscovery `10.11.0`, năm OTel package `1.20.1`; `platform` thêm discovery/resilience, `telemetry` giữ guard endpoint hiện có.
- Produces: baseline retry-count/final-error log của audit File/Catalog trong evidence Task 1; post-upgrade không nhiều hơn baseline.

- [x] **Step 1: Thêm characterization Defaults và retry upstream.**

`PlatformChecks.RunAsync()` dùng `AddServiceDefaults` thật:
config `services:fixture:http:0=<ephemeral localhost URL>` rồi HttpClient gọi
`http://fixture/probe`; assert resolve đúng responder, không DNS/DB ngoài máy.
Gọi `/health`, `/alive` ở Development và Production; cả hai200.
OTLP rỗng/whitespace không export. Test export chạy receiver Kestrel sở hữu bởi
PlatformChecks tại `127.0.0.1:0`, không dùng endpoint ngoài máy.
Receiver nhận OTLP `http/protobuf` tại `/v1/traces`, `/v1/metrics`, `/v1/logs`,
trả protobuf response rỗng hợp lệ; counters/body được giữ trong memory.
Test-only activity processor quan sát span sau instrumentation filtering;
đọc trace payload bằng `Google.Protobuf.CodedInputStream` sẵn có: request field1
ResourceSpans, field2 ScopeSpans, field2 Span, Span fields1/2/5 là trace_id/span_id/name.
Đối chiếu [schema OTLP chính thức](https://github.com/open-telemetry/opentelemetry-proto/blob/main/opentelemetry/proto/trace/v1/trace.proto),
không tạo generated protocol code riêng.
Skip unknown fields, không tìm chuỗi trong binary hoặc thêm OTLP package.
Phát activity/log/meter fixture, ForceFlush providers; assert receiver nhận
đúng trace/span ID và marker, metrics/logs không rỗng; health/alive không trong
processor spans. Dispose/drain trước dọn receiver.

Responder 503 rồi200: ghi số attempt của standard resilience trước nâng.
Responder chờ cancellation: caller cancel thì upstream cancellation được quan sát,
không có request muộn sau drain. Dùng bounded wait, không sleep tùy ý.
Không đổi policy production để làm test nhanh.

Retry File/Catalog dùng lại characterization Task 1, không viết baseline mới sau
nâng dependency. Bổ sung case failed-action nếu chưa có: permission allow, action
thất bại không bị replay, raw actor đúng; audit lỗi phải drain như Task 1.
Các case trong `platform` khóa assertion bằng code:

```csharp
Require(resolvedRequests == 1, "discovery reaches isolated responder");
Require(traceIdMatched && spanIdMatched && markerMatched, "OTLP span delivered");
Require(metricPayloadBytes > 0 && logPayloadBytes > 0, "metrics and logs delivered");
Require(!healthSpanObserved && !aliveSpanObserved, "health traces excluded");
Require(cancellationObserved && lateRequests == 0, "cancel and drain bounded");
```

- [x] **Step 2: Ghi GREEN baseline, thêm RED version assertions.**

Run System `platform`, Catalog `validation`, File `upgrade` trước nâng; so với
baseline Task 1 và ghi attempt/count/log. Trường hợp target10 Task 2 đã làm đổi
retry thì ghi regression/blocker trước khi nâng Defaults, không ghi đè baseline.
Trong System `Program.cs` runtime deps assertions đổi OTel exporter/hosting sang
`1.20.1`, OTel.Api floor `new Version(1, 20, 1)`; giữ AutoMapper expected16.1.1
tới Task 5 và kiểm tra không legacy ASP.NET2.2.
Run `-- runtime`: expected RED đúng exporter/hosting pin cũ.

- [x] **Step 3: Nâng Defaults và Polly theo snapshot.**

Đổi 2 Microsoft.Extensions package sang10.11.0, cả5 OTel package sang1.20.1,
Polly trực tiếp File/Catalog sang8.8.0. Restore kiểm tra bounds thực;
không pin transitive tùy tiện. Giữ endpoint gating/health filtering/logs/scopes/
metrics/application source/HttpClient defaults. Extensions.cs không cần đổi thì
không sửa. RetryPolicy số3 và backoff `2^attempt` giây không đổi.

- [x] **Step 4: Chạy post-upgrade và telemetry evidence.**

Run System `platform`, `runtime`, Catalog `validation`, `runtime`, File toàn bộ.
Assert parity attempts, không thêm mutation/retry, shutdown drain hoàn tất.
`platform` phải tự chứng minh delivery/flush qua receiver nó sở hữu.
Mode `telemetry` hiện có **không tự tạo receiver**; giữ check bổ sung riêng:

```powershell
dotnet run --project test/SystemService.CleanupChecks -c Release -- telemetry
```

Chỉ chạy khi `SYSTEMSERVICE_CLEANUP_TEST_OTLP_ENDPOINT` thỏa localhost/http/explicit
port/no credentials và owner xác nhận đó là receiver cô lập; không sửa env hiện có
một cách mù quáng. Giữ protocol `http/protobuf`, ForceFlush timeout10000ms;
không coi ForceFlush=true là bằng chứng endpoint ngoài đã nhận đủ tín hiệu.
Thiếu endpoint: không invoke mode, ghi NOT RUN. Guard hiện ném exception/exit khác0
khi thiếu hoặc sai endpoint; không đổi guard thành skip thành công.

- [x] **Step 5: Commit phạm vi Task 4.**

Commit `build: update shared discovery resilience and OpenTelemetry packages`.

## Task 5: Package Ba Service, gRPC, Swagger Và Mapping

**Files:**
- Modify: `src/platform/Blocks.Shared/Blocks.Shared.csproj`.
- Modify: File/System/Catalog `.csproj`; ba harness `.csproj` nếu direct EF pin cần đổi.
- Modify: `test/FileService.RemovalChecks/UpgradeChecks.cs` đã tạo tại Task 1.
- Modify: File harness `Program.cs`, `FileBoundaryChecks.cs`; System harness `Program.cs`.
- Test/Modify: hai `ValidationChecks.cs`; `test/CatalogService.Removal.Check.ps1`.
- Modify: `test/Backend.Upgrade.Check.ps1` thêm mode `packages`.

**Interfaces:**
- Consumes: Tasks 1-4; `FileServiceHost.Build(string[] args): WebApplication`, `FileBoundaryChecks.EphemeralAuditResponder.StartAsync(): Task<EphemeralAuditResponder>`, `CheckAsync(string name, Func<Task> check): Task`.
- Produces: `internal static class UpgradeChecks`, `internal static Task RunAsync(Func<string, Func<Task>, Task> check)`; CLI File `-- upgrade`, cũng chạy trong `all`.
- Produces: package graph ba service theo spec; `-Check packages` kiểm tra pin trực tiếp bằng XML, không restore và không đoán graph transitive.

- [x] **Step 1: Thêm test version/artifact/Swagger/transport trước nâng.**

Trong source checker thêm expected map đúng từng project từ spec3.1, bao gồm
package giữ nguyên, adapter đã bỏ và PrivateAssets. Không chỉ grep version tồn tại
ở bất kỳ project. `packages` ở Task 5 tạm chỉ kiểm Shared/Defaults/ba service;
Gateway/AppHost assertions được thêm đúng task của chúng.
System runtime đổi expected AutoMapper sang16.2.0; Catalog source check Protobuf
3.35.0 thành3.36.2, giữ Oracle10.0.12/JWT/EF10.0.13 và Docker contract.

Trong UpgradeChecks thêm:

```csharp
Require(typeof(FileServiceHost).Assembly
    .GetCustomAttribute<TargetFrameworkAttribute>()?.FrameworkName
    == ".NETCoreApp,Version=v10.0", "production File assembly targets10");
Require(Environment.Version.Major == 10, "harness runtime10");
Require(swagger.GetProperty("openapi").GetString()!.StartsWith("3.0."),
    "OpenAPI3.0 retained");
```

`file_swagger_multipart_schema` start FileServiceHost Development ở root fixture,
HTTPS redirect chỉ test với HTTPS port không cấu hình hoặc route Swagger trước
redirect; không sửa middleware production. GET `/swagger/v1/swagger.json` phải200,
upload route POST `/api/UploadFile` có multipart files binary/array và FolderName,
không watermark/conversion schema quay lại.
`file_limits_and_descriptor_unchanged` assert RequestSizeLimit52428800 và gRPC
MaxSend/Receive134217728 qua production DI; snapshot protobuf descriptor/field
numbers trước/sau không đổi.

`grpc_web_auth_header_and_version` dùng System/Catalog production registered typed
client dưới HttpContext JWT fixture, responder kiểm HTTP1.1 và
`x-service-authorization` đúng; không chỉ gọi interceptor trực tiếp.
File audit test tái dùng Task 1/4: status14 rồi0, đúng actor/username,
action mutation không replay, terminal retry bounded và drain trước teardown.
Không đổi expected transport attempts đã khóa trước nâng Defaults/Polly.

Hai validation fixtures kiểm AutoMapper thực map User/Faculty và DateOnly/DateTime
nullable converters; System/Catalog runtime giữ Swagger routes/security/schema,
Catalog đúng6 Faculty routes. Không fake IMapper.

- [x] **Step 2: Chạy RED version check và ghi characterization.**

```powershell
& ./test/Backend.Upgrade.Check.ps1 -Check packages
dotnet run --project test/SystemService.CleanupChecks -c Release -- runtime
```

Expected RED package/AutoMapper cũ, không dependency restore lỗi do test sai.
Các behavior test có thể đã GREEN; lưu descriptor trước bump và so retry với
baseline Task 1, không tái định nghĩa retry baseline.

- [x] **Step 3: Cập nhật đúng direct reference và API thật sự bị ảnh hưởng.**

Shared Grpc.Net.Client2.84.0; tất cả direct Grpc.* tại ba service2.84.0;
File/Catalog Google.Protobuf3.36.2; File JwtBearer10.0.13;
AutoMapper System/Catalog16.2.0; Swashbuckle ba service10.3.1;
Containers.Tools.Targets ba service1.23.0.
Giữ Newtonsoft13.0.4, Stax4.0.0, provider/EF theo Global Constraints;
Polly8.8.0 đã làm Task 4. Không thêm direct reference chỉ vì package đó có trong
graph transitive của service khác.
Sửa namespace/OpenAPI API khi compiler yêu cầu, giữ document3.0 và Swagger UI,
không dùng built-in OpenAPI để né migration. Không sửa generated proto.

- [x] **Step 4: Chạy GREEN và audit graph consumer.**

```powershell
& ./test/Backend.Upgrade.Check.ps1 -Check packages
& ./test/CatalogService.Removal.Check.ps1
& ./test/SystemService.BusinessDependency.Check.ps1
dotnet run --project test/FileService.RemovalChecks -c Release -- upgrade
dotnet run --project test/FileService.RemovalChecks -c Release
dotnet run --project test/SystemService.CleanupChecks -c Release -- validation
dotnet run --project test/SystemService.CleanupChecks -c Release -- contract
dotnet run --project test/SystemService.CleanupChecks -c Release -- runtime
dotnet run --project test/CatalogService.CleanupChecks -c Release -- validation
dotnet run --project test/CatalogService.CleanupChecks -c Release -- contract
dotnet run --project test/CatalogService.CleanupChecks -c Release -- runtime
```

Expected exit0, File summary0 failures; NOT RUN phải ghi riêng. Build Shared/Defaults
và bốn service trực tiếp; inspect resolved assets/deps cho EF10/Grpc/Protobuf/OTel,
không NU1605/NU1608 hoặc legacy ASP.NET2.2. Audit security theo Task 9.

- [x] **Step 5: Commit phạm vi Task 5.**

Commit `build: align service packages and verify grpc swagger compatibility`.

## Task 6: Gateway Package Và File Boundary Sau Reload

**Files:**
- Modify: `src/services/Blocks.ApiGateway/Blocks.ApiGateway.csproj`.
- Test: `test/FileService.RemovalChecks/FileBoundaryChecks.cs`, `Program.cs`.
- Modify: `test/Backend.Upgrade.Check.ps1` mở rộng `packages` tới Gateway.
- Read only unless API requires: Gateway `Program.cs`, `Middlewares/FileServiceBoundary.cs`.

**Interfaces:**
- Consumes: `GatewayHost.Build(string[] args): WebApplication`, `FileBoundaryChecks.RunAsync(Func<string, Func<Task>, Task> check)`, mode `boundary/gateway`.
- Produces: ServiceDiscovery.Yarp10.11.0, Yarp.ReverseProxy2.3.0 giữ nguyên; behavior routing/boundary không đổi.

- [x] **Step 1: Thêm regression boundary và RED direct pin.**

Giữ các case `boundary_runtime_config_reload_blocks_malicious_transform`,
`boundary_native_http2_and_grpc_web_rpc_blocked_at_gateway`.
Thêm `boundary_reload_destination_alias_never_exposes_private_path`:
reload config destination/alias và transform, thử `/Temp`, `/Files`, `/Deleted`,
RPC và nativeHTTP2; blocked request phải downstreamCalls0, legitimate avatar
vẫn JWT/no-store, cluster ngoài File vẫn route như baseline.
Proxy untrusted/trusted kiểm trong Task 2; không giả rằng GetClientIp chống spoof.
Trong từng blocked case sau reload:

```csharp
Require(downstream.TotalRequests == 0, "reload cannot bypass private boundary");
Require(downstream.RpcRequests == 0, "reload cannot expose RPC");
```

`packages` assert Gateway ServiceDiscovery.Yarp10.11.0 và không có ProjectReference
tới Defaults. Run source checker: expected RED pin10.0.0.

- [x] **Step 2: Nâng package Gateway, không bật feature mới.**

Đổi ServiceDiscovery.Yarp10.11.0; giữ Yarp2.3.0 và registration LoadFromConfig
hiện có. Không thêm AddServiceDefaults/AddServiceDiscoveryDestinationResolver,
route business/collab hoặc sửa deployment config.

- [x] **Step 3: Chạy GREEN boundary qua real listeners.**

```powershell
& ./test/Backend.Upgrade.Check.ps1 -Check packages
dotnet build src/services/Blocks.ApiGateway/Blocks.ApiGateway.csproj -c Release
dotnet run --project test/FileService.RemovalChecks -c Release -- gateway
dotnet run --project test/FileService.RemovalChecks -c Release -- boundary
```

Expected exit0; reload test phải chờ change token/condition bounded, không sleep
rồi đoán config đã áp dụng. Giữ session affinity/load balancing/passive health.

- [x] **Step 4: Commit phạm vi Task 6.**

Commit `build: update gateway integration and lock file boundary behavior`.

## Task 7: Aspire13 Và AppHost Đúng Checkout

**Files:**
- Modify: `src/platform/Blocks.AppHost/Blocks.AppHost.csproj`, `AppHost.cs`.
- Modify: `test/Backend.Upgrade.Check.ps1` hoàn thiện `apphost`, `packages`, `all`.

**Interfaces:**
- Consumes: Task 2 runtime10, Tasks 3-6 consumer graph; project resource names FileService/SystemService/CatalogService/ApiGateway.
- Produces: AppHost net10, Aspire.AppHost.Sdk/Hosting.AppHost/Hosting.JavaScript13.6.3; source check `-Check apphost`.
- Produces: resource Web via `AddJavaScriptApp("Web", "../../apps/Blocks.Web", "dev")`, endpoint VITE_DEV_PORT5173.

- [x] **Step 1: Viết RED structural check.**

XML assert đúng4 ProjectReference, mỗi path tồn tại, net10, SDK/package13.6.3,
không NodeJs/PostgreSQL/BusinessService. Source assert chỉ4 AddProject + Web,
không Collab/Business/AddNpmApp/AddViteApp/WaitFor, đúng reference edges trong spec6.
Giữ UserSecretsId, Web WithReference(gateway)/external endpoint.
Check chỉ đọc source, không `dotnet run` hoặc start resources.

```powershell
& ./test/Backend.Upgrade.Check.ps1 -Check apphost
```

Expected RED stale ProjectReference/resource và net8/Aspire9.

- [x] **Step 2: Sửa AppHost theo contract trên.**

Đổi target/SDK/package; bỏ NodeJs/PostgreSQL, thêm JavaScript13.6.3;
xóa Business ProjectReference/resource/WithReference và Collab resource.
Giữ File/System discovery vòng hai chiều, không thêm WaitFor.
Đổi Web AddNpmApp thành AddJavaScriptApp; nếu cấu hình Npm hook dùng `ci`,
không install/đổi lockfile trong structural build. Không thêm DB/resource/credentials.

- [x] **Step 3: Chạy GREEN source và full build.**

```powershell
& ./test/Backend.Upgrade.Check.ps1 -Check all
dotnet build src/platform/Blocks.AppHost/Blocks.AppHost.csproj -c Release
dotnet build Blocks.slnx -c Release
```

Expected exit0, không missing project reference. Lúc này stale AppHost không còn
là lý do miễn trừ solution build. Không nhận orchestration runtime đã PASS từ build.
Launch chỉ ở gate riêng Task 9 với cấu hình/fixture được phép.

- [x] **Step 4: Commit phạm vi Task 7.**

Commit `build: upgrade Aspire and remove absent AppHost resources`.

## Task 8: Standalone Publish Và Linux Image Smoke

**Files:**
- Create: `test/Backend.ArtifactChecks.ps1`.
- Test/Modify only when required: ba Dockerfile/ignore và File `UpgradeChecks.cs`.
- Evidence: `docs/operations/backend-net10-upgrade.md`.

**Interfaces:**
- Consumes: Tasks 2-7; bốn publish directory tên `FileService`, `SystemService`, `CatalogService`, `ApiGateway`.
- Produces: `& ./test/Backend.ArtifactChecks.ps1 -PublishRoot <absolute-path> [-ImageTagPrefix blocks-net10-check]`.
- Không ImageTagPrefix: chạy4 published DLL trên host. Có prefix: chạy thêm3 image `${prefix}/fileservice:local`, `${prefix}/systemservice:local`, `${prefix}/catalogservice:local`; Gateway không có Dockerfile.
- Script exit0 chỉ khi mọi case được yêu cầu đạt; thiếu publish/Docker/fixture permission phải fail rõ, không silently skip.

- [x] **Step 1: Viết smoke script có guard và assertion.**

Script chỉ đọc PublishRoot đã chỉ định; tự tạo fixture riêng dưới temp, không nhận
storage/DB connection từ caller. Validate absolute/non-link path và đầy đủ DLL/
runtimeconfig trước start. Không xóa PublishRoot hoặc thư mục ứng dụng.
Mỗi service chạy child process riêng, working/content root fixture; command args
và env riêng đè JWT bằng random test key, DB localhost port1, gRPC loopback,
OTLP rỗng; xóa PORT/OTLP signal overrides kế thừa trong child.
Không đọc user secrets, launch profile hay fallback appsettings ứng dụng.
`Start-Process` phải Hidden; nếu dùng ProcessStartInfo thì UseShellExecute=false,
CreateNoWindow=true, env riêng. Giới hạn startup60s, giữ process/container ID nó tạo,
finally stop/wait/drain rồi chỉ dọn fixture đã kiểm tra containment.

Assert cả4 `.runtimeconfig.json` yêu cầu major10; `/health`, `/alive`200.
Ở File/System/Catalog kiểm endpoint JWT thiếu vẫn HTTP200/application401,
Development Swagger3.0 load được, File multipart schema đúng; Gateway không áp
JWT/Swagger của service. File dùng avatar fixture random test key, kiểm bytes/
nosniff/no-store; sentinel webroot/storage không truy cập static.
Thêm negative startup File root tương đối, root dưới webroot, root qua symlink:
process phải từ chối, không tạo file ngoài fixture. OS không tạo link được thì
ghi gate NOT RUN riêng; không nhận cả nhóm path checks đạt.

Image case inspect runtime USER và resolved UID khác0, giữ `$APP_UID`;
volume fixture ACL/owner đúng UID trước start, không `--user root`, chmod777 hoặc
gắn volume thật. Publish ports chỉ `127.0.0.1` với port tạm.
Không tự tải scanner, cài package vào container hoặc push image.

- [x] **Step 2: Chạy negative guard.**

```powershell
& ./test/Backend.ArtifactChecks.ps1 -PublishRoot ./src
```

Expected exit khác0: relative/non-artifact root bị từ chối trước khi start process,
không có filesystem/DB mutation ngoài temp. Đây là guard test, không báo là service failure.

- [x] **Step 3: Publish production riêng, không publish harness File.**

```powershell
$publishRoot = Join-Path ([IO.Path]::GetTempPath()) ("blocks-net10-artifacts-" + [Guid]::NewGuid().ToString("N"))
foreach ($name in @('FileService', 'SystemService', 'CatalogService', 'ApiGateway')) {
    dotnet publish "src/services/Blocks.$name/Blocks.$name.csproj" -c Release -o (Join-Path $publishRoot $name) /p:UseAppHost=false
    if ($LASTEXITCODE -ne 0) { throw "Publish failed: $name" }
}
& ./test/Backend.ArtifactChecks.ps1 -PublishRoot $publishRoot
```

Expected4 publish thành công, standalone smoke exit0. Không dùng
ErrorOnDuplicatePublishOutputFiles=false; nếu gặp NETSDK1152 phải giải quyết output
ownership thật, không tắt detection. Trước publish/build kiểm config không đóng gói
credentials thật; chỉ ghi tên key/path, không giá trị.

- [x] **Step 4: Build image và chạy smoke Linux.**

```powershell
docker build --pull -f src/services/Blocks.FileService/Dockerfile -t blocks-net10-check/fileservice:local .
docker build --pull -f src/services/Blocks.SystemService/Dockerfile -t blocks-net10-check/systemservice:local .
docker build --pull -f src/services/Blocks.CatalogService/Dockerfile -t blocks-net10-check/catalogservice:local .
& ./test/Backend.ArtifactChecks.ps1 -PublishRoot $publishRoot -ImageTagPrefix blocks-net10-check
```

Chạy từng lệnh, kiểm exit code ngay; không tiếp tục sau build lỗi.
Nếu Docker thiếu hoặc không chuẩn bị được ACL fixture non-root, ghi BLOCKED/NOT RUN
đúng gate; không đổi production sang root. Ghi base digest, image ID/digest, OS/UID,
kiểm TLS trust-store với HTTPS responder cô lập có cert test được trust rõ ràng
(không callback bỏ cert validation), Unicode/date converters và content types.
Không gọi public endpoint hoặc tự cài CA vào trust-store máy.
TLS là gate riêng: dùng fixture HTTPS đã được owner duyệt, trust bundle riêng
cho child/container, không sửa trust-store host/base image. Kiểm cert hợp lệ
được nhận và cert không tin cậy bị từ chối qua production typed client.
Thiếu responder/trust fixture thì ghi TLS NOT RUN, không tự thêm hạ tầng cấp cert
hoặc tuyên bố image smoke đã chứng minh TLS. Script trên không tự dựng PKI.

- [x] **Step 5: Chạy harness trên Linux đúng output type.**

Build Release riêng3 harness; chạy output build trong môi trường Linux .NET10
với source checkout path/working directory test phù hợp. File `all`, System
`contract/runtime/validation/platform`, Catalog `contract/runtime/validation`.
Không dùng artifact Windows RID trên Linux; nếu không có Linux runner, dùng
Microsoft SDK10 container với checkout chỉ đọc và project output writable riêng,
không share bin/obj giữa OS/chạy đồng thời.
File harness là build output, không `dotnet publish` chung2 web project.
Expected mọi case bắt buộc đạt; ghi rõ symlink/case-sensitive cases và NOT RUN.
Scan CVE bằng local scanner đã được phép, ghi scanner/database date; không upload
private image/SBOM để lấy kết quả nếu chưa được duyệt.

- [x] **Step 6: Commit script/evidence và sửa artifact tối thiểu nếu cần.**

Commit `test: verify standalone net10 artifacts and Linux containers`.
Không stage publishRoot, image tar, logs raw hoặc test credentials.

## Task 9: Nghiệm Thu Toàn Graph Và Handoff Rollout

**Files:**
- Modify: `docs/operations/backend-net10-upgrade.md`, `AGENTS.md`.
- Modify: `docs/operations/fileservice-storage-cutover.md` chỉ cập nhật tham chiếu/runtime/check commands, không sửa gate dữ liệu.
- Track: checkbox plan và evidence theo kết quả thực; không thay source chỉ để xanh.

**Interfaces:**
- Consumes: tất cả deliverable Tasks 1-8, exact snapshot/exception list và artifact IDs.
- Produces: evidence phân biệt PASS/FAIL/BASELINE FAILURE/NOT RUN, gate owner sign-off và rollback artifact đã vá.

- [x] **Step 1: Chạy build/source checks cuối cùng theo thứ tự.**

```powershell
& ./test/Backend.Upgrade.Check.ps1 -Check all
& ./test/SystemService.BusinessDependency.Check.ps1
& ./test/CatalogService.Removal.Check.ps1
dotnet build src/platform/Blocks.Shared/Blocks.Shared.csproj -c Release
dotnet build src/platform/Blocks.ServiceDefaults/Blocks.ServiceDefaults.csproj -c Release
dotnet build src/services/Blocks.FileService/Blocks.FileService.csproj -c Release
dotnet build src/services/Blocks.SystemService/Blocks.SystemService.csproj -c Release
dotnet build src/services/Blocks.CatalogService/Blocks.CatalogService.csproj -c Release
dotnet build src/services/Blocks.ApiGateway/Blocks.ApiGateway.csproj -c Release
dotnet build src/platform/Blocks.AppHost/Blocks.AppHost.csproj -c Release
dotnet build Blocks.slnx -c Release
```

Expected exit0 từng lệnh; build3 harness bởi các run ở Step 3.
Kiểm exitcode ngay khi chạy, không chỉ nhìn lệnh cuối. Không che warning mới.

- [x] **Step 2: Audit đúng10 project đã restore.**

Với từng `.csproj` của7 production+3 harness, lần lượt chạy:

```powershell
dotnet list <project.csproj> package --outdated --include-transitive --no-restore
dotnet list <project.csproj> package --deprecated --include-transitive --no-restore
dotnet list <project.csproj> package --vulnerable --include-transitive --no-restore
```

`<project.csproj>` thay bằng path thật, không chạy nguyên placeholder. CLI audit có
thể exit0 dù có advisory: đọc findings, không dùng exit0 làm oracle bảo mật.
Ghi direct pin/resolved transitive/bounds, advisory ID/severity và ngoại lệ approved.
Không preview/EF11/legacy ASP.NET2.2, NU1605/NU1608, deprecated adapter/NodeJs.
Package giữ nguyên phải có lý do latest-compatible, không bị coi là chưa nâng.
Advisory chưa xử lý hoặc license chưa được duyệt giữ rollout gate chưa đạt.

- [x] **Step 3: Chạy DB-free matrix và so baseline.**

File chạy `all` (không args), rồi mode riêng chỉ khi cần điều tra:
`removal/paths/sessions/lifecycle/transport/gateway/boundary/migration/upgrade`.
System chạy `contract/runtime/validation/platform`; Catalog
`contract/runtime/validation`. Lệnh mẫu:

```powershell
dotnet run --project test/FileService.RemovalChecks -c Release
dotnet run --project test/SystemService.CleanupChecks -c Release -- validation
dotnet run --project test/SystemService.CleanupChecks -c Release -- platform
dotnet run --project test/CatalogService.CleanupChecks -c Release -- validation
```

Mode còn lại dùng đúng pattern từ Tasks 1/5. Expected exit0 và đầy đủ case mới,
File `0 failure(s)`; NOT RUN vẫn liệt kê. So baseline envelopes, retry counts,
descriptor, mapping/SQL, clocks/converters, JWT/gRPC headers. Không lấy runtime
major của harness thay TFM/artifact smoke Task 8.

- [x] **Step 4: Thực hiện hoặc ghi chưa chạy các gate cần quyền riêng.**

Chỉ invoke sau khi owner cấp quyền đúng fixture:

```powershell
dotnet run --project test/SystemService.CleanupChecks -c Release -- telemetry
dotnet run --project test/SystemService.CleanupChecks -c Release -- auth
dotnet run --project test/CatalogService.CleanupChecks -c Release -- provider
```

Telemetry endpoint: `SYSTEMSERVICE_CLEANUP_TEST_OTLP_ENDPOINT` localhost HTTP
explicit port/no credentials, collector cô lập. System auth:
`SYSTEMSERVICE_CLEANUP_TEST_CONNECTION` tới localhost DB
`blocks_systemservice_cleanup_test`, owned schema duy nhất. Catalog provider:
`CATALOGSERVICE_UPGRADE_TEST_CONNECTION` tới localhost DB rỗng
`blocks_catalogservice_upgrade_test`, chỉ owned faculty table; refuse existing objects.
Không fallback appsettings hay tự cấp quyền/tạo DB.

AppHost launch chỉ sau owner chấp thuận cấu hình/resources: `dotnet run --project
src/platform/Blocks.AppHost/Blocks.AppHost.csproj`. Kiểm4 service+Web port5173,
reference graph và không WaitFor deadlock; không migrations/seed. Trước launch,
chặn/thay toàn bộ endpoint ứng dụng thật bằng fixture được phép; không cần thì
ghi NOT RUN. Provider comparison/CRUD/permission-audit E2E/external consumers/
firewall/volume/license vẫn cần evidence riêng.

- [x] **Step 5: Hoàn thiện runbook và trạng thái hướng dẫn.**

Evidence ghi baseline revision, SDK/pins/graph, command/exit/case counts/OS,
receiver delivery và external ForceFlush khác nhau, publish/image digests,
mọi ngoại lệ và người chịu trách nhiệm gate. Không ghi values secrets/raw DB rows.
AGENTS cập nhật File/Shared/Defaults/AppHost net10 và modes validation/platform/
upgrade cùng ArtifactChecks; bỏ mô tả stale AppHost sau khi build đã xác nhận.
Giữ giới hạn frontend absent backend và quyền test DB.

Runbook release/rollback giữ một File writer: backup/config/artifact trước nâng
đã kiểm chứng, dừng/drain writer cũ rồi mới start mới, không xóa storage,
không đổi schema/metadata format, không rollback về Catalog AutoMapper16.0.0.
Thiếu backup, compatible patched fallback, owner license hoặc runtime gate thì
không deploy. Plan này không thực hiện deploy hoặc di chuyển dữ liệu.

- [x] **Step 6: Rà diff, commit evidence và gửi review cuối nhánh.**

```powershell
git diff --check
git status --short
```

Stage đúng docs hướng dẫn/checkbox/evidence đã thay; commit
`docs: record backend net10 verification and rollout gates`.
Theo execution method đã chọn, review cuối nhánh độc lập với model/provider hiện
có; không tự đổi model để vượt lỗi delegation. Báo chính xác phần PASS/FAIL/NOT RUN,
không tuyên bố production-ready khi các gate môi trường còn thiếu.

## Self-Review Và Handoff

Người viết plan tự rà trước handoff, không giao self-review cho subagent:

- Spec1-3: scope/version/SDK/graph được Task 1/2/4/5/6/7/9 bao phủ.
- Spec4: baseline, async filter, nested behavior, DataAnnotations và auth order ở Task 1/3.
- Spec5: proxy, Defaults/telemetry/retry, gRPC/JWT/file, Swagger/mapping/EF ở Task 2/4/5/6.
- Spec6: SDK/container/AppHost ở Task 2/7/8; giữ reference cycle không WaitFor.
- Spec7-8: DB-free, explicit fixtures, artifact/OS, CVE/license, rollout/rollback ở Task 8/9.
- Năm Review Focus đều có task/test; chữ ký RunAsync/filter/modes và package pins nhất quán.
- Chỉ thêm một production filter và global.json; không thêm production abstraction,
  framework/package ngoài spec. Test helper chia theo harness, không tạo framework chung.

Trạng thái viết plan: chưa thực thi checkbox; chưa restore/build/test/DB.
Sau review, người dùng chọn **Subagent-driven** hoặc **Native** rồi mới bắt đầu.
Đề xuất Subagent-driven vì validation, dependency chung và artifact có rủi ro
khác nhau; từng task cần review độc lập, đổi lại tốn thêm context/review.
