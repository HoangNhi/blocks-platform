# SystemService Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sửa bốn lỗi auth/gRPC của SystemService và loại nguồn cảnh báo dependency đã xác nhận, không đổi nghiệp vụ consumer.

**Architecture:** Giữ service, response và protobuf hiện có; thêm guard tại ranh giới đang lỗi, lọc user xóa mềm ngay trong query. Vá package ở project khai báo gốc, giữ Shared/ServiceDefaults net8.0. Mở rộng console harness hiện có; request HTTP/gRPC thật dùng DI production và dữ liệu cô lập.

**Tech Stack:** C#/.NET 10, ASP.NET Core, EF Core 10.0.13, Npgsql EF provider 10.0.3, PostgreSQL, Google.Protobuf, GrpcChannel/CallInvoker, PowerShell, Docker; không thêm dependency.

**Spec:** `docs/superpowers/specs/2026-10-22-systemservice-security-hardening-design.md`, người dùng duyệt ngày 2026-10-22; commit nội dung thiết kế `b360520`.

## Global Constraints

- Plan chờ người dùng duyệt và chọn cách thực hiện; lượt viết plan không triển khai.
- SystemService/CleanupChecks giữ net10.0; Shared/ServiceDefaults giữ net8.0; không retarget consumer.
- Giữ role chặn External Reviewer `551d1351-008e-4910-a39c-1fcdde409fdf`.
- Giữ HTTP envelope `Success`, `StatusCode`, `Data`, `Message`; lỗi authorization HTTP vẫn HTTP 200, application StatusCode 401/403.
- Giữ chữ ký public, bảy RPC SystemProto, audit.proto, số field protobuf, audit và avatar integration.
- Không sửa AppHost, solution, frontend, nghiệp vụ Gateway/Catalog/FileService, schema, migration hoặc cấu hình thật.
- Không thêm package, framework test, abstraction production, suppression hoặc tắt NuGet audit.
- AutoMapper SystemService: 16.1.1; OTLP exporter/Extensions.Hosting: 1.15.3; OpenTelemetry.Api resolve ít nhất 1.15.3 và không có advisory.
- Thay ba ASP.NET Core 2.2 PackageReference trong Shared bằng FrameworkReference Microsoft.AspNetCore.App.
- Giữ instrumentation OTel 1.9.0 nếu restore/audit/compatibility đạt; không tự nâng dependency khác khi gặp lỗi.
- Không dùng DB thật hoặc seed/migrate dữ liệu ứng dụng; chỉ localhost DB `blocks_systemservice_cleanup_test`, schema `cleanup_<GUID dạng N>`.
- Chỉ đọc connection kiểm thử từ `SYSTEMSERVICE_CLEANUP_TEST_CONNECTION` theo guard hiện có; không in connection, JWT hoặc refresh token.
- Snapshot/giữ nguyên thay đổi .NET 10 đang có; không tự stash/reset/revert hoặc gom chúng vào commit tài liệu.
- Case bắt buộc thiếu prerequisite ghi NOT RUN, không coi là PASS hoặc nghiệm thu đầy đủ.
- Chặn refresh không thu hồi JWT đã cấp. License và advisory ngoài phạm vi phải báo riêng, không né bằng cấu hình.

## Review Focus

- User vừa bị khóa/xóa nhưng token cũ còn hạn hoặc có chuỗi hậu duệ: từ chối trước mọi mutation token; Task 1.
- JWT hết hạn hoặc sai chữ ký: combobox không lộ dữ liệu; không kiểm tra chỉ HTTP 200; Task 2.
- Batch GUID trộn đúng/sai và dạng GUID hợp lệ khác D: từ chối toàn batch sai, vẫn nhận dạng N/B hợp lệ; Task 3.
- Batch chỉ có user đã xóa hoặc thao tác không đổi giá trị: không tạo audit mutation giả; Task 4.
- Telemetry bật/tắt, graph transitive và startup consumer net8.0 sau sửa Shared: không chỉ dựa vào build SystemService; Task 5.

---

## File Map

| File | Trách nhiệm | Task |
| --- | --- | --- |
| `src/services/Blocks.SystemService/Services/CoreFeature/Auth/AuthService.cs` | Guard refresh theo trạng thái user. | 1 |
| `src/services/Blocks.SystemService/Controllers/UserController.cs` | Bỏ anonymous ở combobox. | 2 |
| `src/services/Blocks.SystemService/Services/gRPC/SystemGrpcService.cs` | Validation hai RPC và lọc IsDeleted khi đổi trạng thái. | 3, 4 |
| `src/services/Blocks.SystemService/Blocks.SystemService.csproj` | Vá AutoMapper. | 5 |
| `src/platform/Blocks.Shared/Blocks.Shared.csproj` | Dùng ASP.NET shared framework thay package 2.2. | 5 |
| `src/platform/Blocks.ServiceDefaults/Blocks.ServiceDefaults.csproj` | Vá OTel tại nguồn. | 5 |
| `test/SystemService.CleanupChecks/Program.cs` | Fixture, local helper và runnable checks; không tách framework mới. | 1-5 |
| `AGENTS.md` | Ghi lệnh telemetry check và prerequisite kiểm thử mới. | 5 |

Chạy năm task theo thứ tự; chúng dùng chung Program.cs và helper từ task trước.
Các đường dẫn trong Files/Test bên dưới đều tính từ repository root.

## Chuẩn Bị Baseline

- [ ] Đọc AGENTS.md, spec và plan. Dùng using-git-worktrees khi bắt đầu thực thi để nhận diện môi trường; không tạo worktree thiếu các thay đổi .NET 10 đang có.
- [ ] Ghi `git status --short`, `git rev-parse HEAD`, staged paths và snapshot diff ban đầu. Baseline lúc lập plan: `b360520` cộng bảy file modified và Dockerfile.dockerignore untracked, chưa có security fix.
- [ ] Chốt ranh giới commit trước task đầu: nếu migration còn dirty trong Program.cs/project files/AGENTS.md, cần người dùng xác nhận commit migration riêng hoặc stage riêng diff của task. Không chạy lệnh git add toàn file bên dưới khi còn hunk baseline chưa tách; không tự commit code có sẵn.
- [ ] Ghi SDK bằng `dotnet --info`; kiểm tra Docker và DB kiểm thử khi cần. Không tự lấy connection từ appsettings/User secrets.
- [ ] Chạy baseline và ghi PASS/FAIL/NOT RUN từng lệnh:

```powershell
dotnet build src/services/Blocks.SystemService/Blocks.SystemService.csproj -c Release
dotnet run --project test/SystemService.CleanupChecks -c Release -- contract
dotnet run --project test/SystemService.CleanupChecks -c Release -- runtime
dotnet run --project test/SystemService.CleanupChecks -c Release -- auth
& ./test/SystemService.BusinessDependency.Check.ps1
```

Baseline trước lập plan đã từng đạt 16 auth/audit cases và build có warning;
đó không thay thế lần chạy tại execution. Lượt lập plan không chạy lại test/build.
Auth thiếu DB là thiếu prerequisite, không phải behavioral red.

## Task 1: Chặn Refresh Của User Vô Hiệu/Xóa Mềm

**Files:**
- Modify: `src/services/Blocks.SystemService/Services/CoreFeature/Auth/AuthService.cs:80`
- Test: `test/SystemService.CleanupChecks/Program.cs` (fixture và RunAuthChecksAsync).

**Interfaces:**
- Consumes: `ModelToken AuthService.RefreshToken(RefreshTokenRequest request, string ipAddress)`.
- Consumes: `Task ExpectBusinessExceptionAsync(Func<Task> action, string expectedMessage)` và `RunCaseAsync(string name, Func<IServiceProvider, Task> action)` hiện có.
- Produces: cùng chữ ký RefreshToken, thêm guard trạng thái trước mutation; không thêm API production.
- Produces: các case mới trong mode `auth`; fixture các task sau tiếp tục dùng `normalActiveUser`, `normalInactiveUser`, `normalDeletedUser`.

- [ ] **Step 1: Thêm fixture token và test hồi quy**

Trong seed hiện có, thêm `normalInactiveValidToken`, `normalDeletedValidToken`,
còn hạn một ngày, cùng bốn token tạo hai chuỗi root revoked/child active riêng
cho inactive và deleted. Root.ReplacedByToken trỏ đúng child.Token; token đã
revoked không dùng lại tên fixture `normalRevokedToken` đang thuộc active user.
Chạy bốn case `refresh_normal_inactive_denied`, `refresh_normal_deleted_denied`,
`refresh_inactive_revoked_chain_unchanged`, `refresh_deleted_revoked_chain_unchanged`.

Mỗi case snapshot các token bằng AsNoTracking, OrderBy(Id), scalar tuple
Id/UserId/Token/RevokedAt/RevokedByIp/ReasonRevoked/ReplacedByToken và tổng count;
sau lời gọi đọc lại từ DB, không so entity đang tracked.

```csharp
await ExpectBusinessExceptionAsync(
    () => Task.FromResult(auth.RefreshToken(request, "127.0.0.1")),
    "Token không hợp lệ");
Assert(beforeCount == await db.RefreshTokens.CountAsync(), "no new token");
Assert(beforeRows.SequenceEqual(afterRows), "tokens and descendants unchanged");
```

- [ ] **Step 2: Chạy behavioral red**

Run: `dotnet run --project test/SystemService.CleanupChecks -c Release -- auth`.
Expected: hai valid-token case thất bại vì chưa từ chối rotation, hai chain case
phát hiện child bị revoke; positive controls cũ đạt. Không nhận connection/seed
error làm red. Không log token khi báo failure.

- [ ] **Step 3: Sửa guard trong RefreshToken**

Sau getUserByRefreshToken, guard chính xác:
`user == null || user.IsDeleted || !user.IsActived || user.RoleId == ExtRoleId`.
Ném `BusinessException("Token không hợp lệ")` trước đọc/map token và SaveChanges.
Giữ phần rotation, revoke chain và login nguyên vẹn.

- [ ] **Step 4: Chạy green**

Run lại lệnh Step 2. Expected: mọi case auth, gồm 16 case cũ, đạt; inactive/deleted
không cấp token, chain không đổi; positive `refresh_normal_rotates` còn đạt.

- [ ] **Step 5: Commit riêng task sau kiểm tra diff/staging**

```powershell
git add -- src/services/Blocks.SystemService/Services/CoreFeature/Auth/AuthService.cs test/SystemService.CleanupChecks/Program.cs
git commit -m "fix(system): reject refresh for inactive and deleted users"
```

## Task 2: Bảo Vệ Combobox Và Host Kiểm Thử HTTP

**Files:**
- Modify: `src/services/Blocks.SystemService/Controllers/UserController.cs:73`
- Test: `test/SystemService.CleanupChecks/Program.cs` (runtime/auth và local host helper).

**Interfaces:**
- Consumes: `Task<IActionResult> UserController.GetAllForCombobox()`, ExecuteConfigService/ExecuteConfigAuthentication hiện có.
- Produces: local `Task<WebApplication> StartTestAppAsync(IConfiguration configuration, bool http2 = false)`.
- Produces: helper trả app đã start, một URL localhost động trong `app.Urls.Single()`; caller StopAsync/DisposeAsync trong finally.
- Produces: local trong RunAuthChecksAsync, `Task RunRequestCaseAsync(string name, Func<Task> action)`, dùng chung passed/failed nhưng không mở transaction.
- Produces: mode `runtime` vẫn DB-free; mode `auth` thêm HTTP positive checks ngoài transaction RunCaseAsync.

- [ ] **Step 1: Thêm host helper và test HTTP thật**

StartTestAppAsync dùng Production, clear Configuration.Sources rồi AddConfiguration
từ config fixture, ValidateScopes/ValidateOnBuild, MVC ApplicationPart của
UserController, AuditActionFilter, ephemeral DataProtection, Swagger, DI/auth
production, GlobalExceptionHandler và MapControllers/MapGrpcService<SystemGrpcService>.
Sau ExecuteConfigService, cấu hình endpoint localhost port 0: Http1 khi http2=false,
Http2-only khi true. Không dùng Http1AndHttp2 không TLS để chạy h2c.
Giữ các assertion SQL/DI/Swagger của runtime, tái dùng helper thay builder trùng.

Config kiểm thử: key `new string('x', 64)`, issuer/audience
`systemservice-cleanup-checks`, `Jwt:Expiry=1`, `Jwt:ExpireRefreshToken=2`,
FileService loopback port 1. Runtime dùng DB giả port 1; auth dùng scopedConnStr.
Tạo JWT synthetic bằng JwtSecurityToken/HmacSha256 với name=user GUID,
unique_name=username, role=normalRole.Id; token hợp lệ hết hạn sau một giờ,
token expired hết hạn trước năm phút với notBefore sớm hơn; wrong-signature
dùng key khác cùng độ dài. Không mock/bypass authentication.

Thêm runtime cases `combobox_anonymous_denied`, `combobox_invalid_token_denied`,
`combobox_wrong_signature_denied`, `combobox_expired_token_denied`.
Mỗi request GET `/api/User/get-all-combobox` kiểm tra:

```csharp
Assert(response.StatusCode == System.Net.HttpStatusCode.OK, "HTTP envelope");
Assert(!root.GetProperty("Success").GetBoolean(), "request denied");
Assert(root.GetProperty("StatusCode").GetInt32() == 401, "application 401");
Assert(!root.TryGetProperty("Data", out var data) ||
    data.ValueKind == JsonValueKind.Null, "no directory disclosed");
```

Trong auth thêm `combobox_authenticated_without_user_view_succeeds`.
Dùng normalActiveUser, không seed menu VIEW User. Assert Success=true, Data chỉ
chứa user active chưa xóa, Value đúng ID, Text đúng `[Username] - Fullname`,
thứ tự Username tăng dần; không có normalInactiveUser/normalDeletedUser.
Request host và query xác minh có scope riêng, chỉ dùng dữ liệu seed đã commit.
Dùng RunRequestCaseAsync cho các network case trong auth: đếm và báo case như
RunCaseAsync nhưng không bao transaction; lỗi phải tăng failed và làm run exit khác 0.

- [ ] **Step 2: Chạy red**

Run: `dotnet run --project test/SystemService.CleanupChecks -c Release -- runtime`.
Expected: combobox bị AllowAnonymous cho qua tới DB giả, không nhận envelope 401
mong đợi; host/Swagger/DI prerequisite vẫn đạt. Auth positive hiện tại có thể đã
đạt, không ép positive control thất bại.

- [ ] **Step 3: Sửa action**

Bỏ duy nhất `[AllowAnonymous]` ở GetAllForCombobox. Giữ
`[AttributePermission(Action = ActionType.NONE)]`, BaseController authorization,
route, DTO và UserService.GetAllForCombobox nguyên vẹn.

- [ ] **Step 4: Chạy green cả hai lớp**

```powershell
dotnet run --project test/SystemService.CleanupChecks -c Release -- runtime
dotnet run --project test/SystemService.CleanupChecks -c Release -- auth
```

Expected: bốn negative HTTP cases đạt không mở DB; positive không VIEW User
đạt trên PostgreSQL cô lập. Mọi request server đều stop/dispose trước dọn schema.

- [ ] **Step 5: Commit task**

```powershell
git add -- src/services/Blocks.SystemService/Controllers/UserController.cs test/SystemService.CleanupChecks/Program.cs
git commit -m "fix(system): require authentication for user combobox"
```

## Task 3: Kiểm Tra GUID Qua gRPC Thật

**Files:**
- Modify: `src/services/Blocks.SystemService/Services/gRPC/SystemGrpcService.cs:23`
- Test: `test/SystemService.CleanupChecks/Program.cs`.

**Interfaces:**
- Consumes: StartTestAppAsync từ Task 2; SystemProto message/Parser hiện có.
- Produces: local `Task<TResponse> CallSystemRpcAsync<TRequest, TResponse>(GrpcChannel channel, string methodName, TRequest request, MessageParser<TRequest> requestParser, MessageParser<TResponse> responseParser, string? accessToken = null)` với `where TRequest : class, IMessage<TRequest>` và `where TResponse : class, IMessage<TResponse>`.
- Produces: local `Task ExpectRpcExceptionAsync(Func<Task> action, Grpc.Core.StatusCode expectedStatus)`.
- Produces: giữ `Task<CheckActionResponse> CheckPermission(CheckPermissionRequest request, ServerCallContext context)` và `Task<GetUsersByIdsResponse> GetUsersByIds(GetUsersByIdsRequest request, ServerCallContext context)`.

- [ ] **Step 1: Thêm helper gọi RPC và matrix test**

CallSystemRpcAsync dùng MethodType.Unary, service `system.SystemProto`,
Marshallers.Create với ToByteArray/Parser.ParseFrom, channel.CreateCallInvoker(),
Metadata `authorization: Bearer <token>` khi có; dispose AsyncUnaryCall và deadline
10 giây. Không reflection/private descriptor, không generate client stub.
ExpectRpcExceptionAsync phải thất bại nếu action thành công hoặc nhận sai status.

Runtime host http2=true/DB port 1; JWT hợp lệ Task 2:
`grpc_permission_invalid_guid_denied` chạy UserId `""`, `"not-a-guid"` và
Guid.Empty.ToString(); assert response.Success=false.
`grpc_users_invalid_guid_rejected` chạy ID sai đơn lẻ, danh sách trộn GUID hợp lệ
với `"not-a-guid"`, Guid.Empty và string rỗng; mỗi lần assert InvalidArgument:

```csharp
await ExpectRpcExceptionAsync(async () =>
{
    await CallSystemRpcAsync(channel, "GetUsersByIds", request,
        GetUsersByIdsRequest.Parser, GetUsersByIdsResponse.Parser, validJwt);
}, Grpc.Core.StatusCode.InvalidArgument);
```

`grpc_without_token_unauthenticated` gọi cùng RPC không token, assert Unauthenticated.
Không gắn JWT sai rồi coi rejection authorization là validation pass.
Thông báo InvalidArgument không chứa input sentinel/token/SQL.

Auth host HTTP2/DB test thêm `grpc_users_valid_ids_preserved`: ID user active,
inactive chưa xóa, deleted, missing và lặp; assert đúng tập active+inactive chưa
xóa, không user deleted/missing, không lặp; UserInfo fields khớp DB.
`grpc_users_empty_returns_empty` assert Users.Count==0.
`grpc_users_guid_n_and_b_formats` thử ID dạng N/B, assert cùng user như dạng D.

- [ ] **Step 2: Chạy red**

Run: `dotnet run --project test/SystemService.CleanupChecks -c Release -- runtime`.
Expected: malformed GUID đang trả lỗi gRPC chưa xử lý thay vì false/InvalidArgument;
Guid.Empty còn đi tới DB giả. Không nhận lỗi thương lượng HTTP2 hoặc deadline
làm behavioral red; sửa host test nếu chưa thực sự tới method.

- [ ] **Step 3: Sửa hai RPC, không đổi proto**

CheckPermission: TryParse và từ chối Guid.Empty bằng response Success=false
trước IUserService.CheckPermission; GUID hợp lệ giữ flow cũ.
GetUsersByIds: parse và validate toàn bộ request trước GetByIds, ném
`RpcException(new Status(StatusCode.InvalidArgument, "UserIds không hợp lệ."))`
nếu có ID sai/empty. Giữ semantics rỗng/lặp/missing; không silently filter ID sai.

- [ ] **Step 4: Chạy green và contract**

```powershell
dotnet run --project test/SystemService.CleanupChecks -c Release -- runtime
dotnet run --project test/SystemService.CleanupChecks -c Release -- auth
dotnet run --project test/SystemService.CleanupChecks -c Release -- contract
```

Expected: validation status qua transport đạt, negative không mở DB, positive
lọc user đúng, descriptor không đổi.

Integration cases `grpc_permission_valid_allow` và `grpc_permission_valid_deny`
cần fn_user_checkpermission thật và fixture quyền cô lập do người vận hành cung
cấp. Fixture phải xác định hai user/role riêng, cùng Controller/Action đã grant
cho user allow nhưng không grant cho user deny; không thay normalRole dùng cho
combobox no-VIEW. Gửi cùng cặp Controller/Action qua CallSystemRpcAsync với
UserId/JWT tương ứng, assert:

```csharp
Assert(allowResponse.Success, "configured permission allowed");
Assert(!denyResponse.Success, "ungranted permission denied");
```

Repo hiện không có function SQL/fixture này. Thiếu prerequisite ghi NOT RUN
cho hai case, không tạo stub luôn true/false hoặc tự thao tác DB thật.
Đây là integration gate còn mở, không đánh dấu PASS.

- [ ] **Step 5: Commit task**

```powershell
git add -- src/services/Blocks.SystemService/Services/gRPC/SystemGrpcService.cs test/SystemService.CleanupChecks/Program.cs
git commit -m "fix(system): validate user IDs at gRPC boundaries"
```

## Task 4: Không Đổi Trạng Thái User Xóa Mềm

**Files:**
- Modify: `src/services/Blocks.SystemService/Services/gRPC/SystemGrpcService.cs:134`
- Test: `test/SystemService.CleanupChecks/Program.cs`.

**Interfaces:**
- Consumes: StartTestAppAsync, CallSystemRpcAsync, auth schema từ Task 1-3.
- Produces: giữ `Task<SetUsersActivedResponse> SetUsersActived(SetUsersActivedRequest request, ServerCallContext context)`; chỉ thêm bộ lọc IsDeleted.

- [ ] **Step 1: Thêm test batch và audit**

Thêm `grpc_set_active_excludes_deleted` và `grpc_set_inactive_excludes_deleted`.
Mỗi case seed user target riêng đã commit: user active/inactive chưa xóa và
user deleted có IsActived ngược giá trị request; actor là normalActiveUser
không nằm trong batch. Gọi RPC thật có JWT actor, batch gồm target, missing,
ID lặp và `"not-a-guid"`; response Success=true.

```csharp
Assert(response.Success, "batch contract preserved");
Assert(liveUsers.All(u => u.IsActived == requestedState), "live users changed");
Assert(deletedAfter.IsDeleted && deletedAfter.IsActived == deletedBefore.IsActived,
    "soft-deleted user unchanged");
Assert(audit.UserId == normalActiveUser.Id && audit.IsSuccess, "actor audit retained");
```

Đọc lại bằng scope mới/AsNoTracking; so cả UpdatedAt/UpdatedBy của deleted.
Audit OldValues/NewValues có user live thật sự thay đổi, không có deleted ID.
Không assert một audit row cho từng user: interceptor nhóm batch thành một row.
`grpc_set_only_deleted_no_audit`, `grpc_set_empty_no_audit`,
`grpc_set_noop_no_audit`: Success=true, số audit row không tăng.
Tách ID case để tránh mutation request ảnh hưởng các auth test cũ; không dùng
outer RunCaseAsync transaction để rollback server write hoặc giữ lock.

- [ ] **Step 2: Chạy red**

Run: `dotnet run --project test/SystemService.CleanupChecks -c Release -- auth`.
Expected: deleted IsActived bị đổi và/hoặc xuất hiện trong audit; bật và tắt
đều có target ban đầu ngược request để thực sự phát hiện lỗi.

- [ ] **Step 3: Sửa query**

Trong SetUsersActived thêm `!u.IsDeleted` vào Where lấy user.
Giữ parsing/filter/dedup ID, success rỗng/missing và SaveChangesAsync hiện có;
không đổi những RPC khác hoặc audit interceptor.

- [ ] **Step 4: Chạy green**

Run lại auth và contract như Task 3 Step 4.
Expected: user deleted giữ nguyên, audit live đúng actor, no-op không audit giả;
regression cũ đạt và schema được dọn.

- [ ] **Step 5: Commit task**

```powershell
git add -- src/services/Blocks.SystemService/Services/gRPC/SystemGrpcService.cs test/SystemService.CleanupChecks/Program.cs
git commit -m "fix(system): exclude deleted users from activation updates"
```

## Task 5: Vá Dependency Gốc Và Kiểm Tra Consumer

**Files:**
- Modify: `src/services/Blocks.SystemService/Blocks.SystemService.csproj:14`
- Modify: `src/platform/Blocks.Shared/Blocks.Shared.csproj:10`
- Modify: `src/platform/Blocks.ServiceDefaults/Blocks.ServiceDefaults.csproj:15`
- Test: `test/SystemService.CleanupChecks/Program.cs`.
- Modify: `AGENTS.md` (thêm mode telemetry và prerequisite, không viết lại guide).

**Interfaces:**
- Consumes: StartTestAppAsync và toàn bộ checks từ Task 1-4.
- Produces: runtime assertion graph package; local `Task RunTelemetryChecksAsync()`, CLI `dotnet run --project test/SystemService.CleanupChecks -c Release -- telemetry`.
- Produces: telemetry mode yêu cầu `SYSTEMSERVICE_CLEANUP_TEST_OTLP_ENDPOINT`, URI http localhost/127.0.0.1/::1 có port rõ, không credentials; thiếu/sai phải exit khác 0, không silently skip.

- [ ] **Step 1: Ghi audit trước vá và thêm regression graph**

Audit riêng SystemService, Shared, ServiceDefaults, ApiGateway, CatalogService,
FileService bằng lệnh sau với từng project path ở File Map/consumer:

```powershell
dotnet list src/services/Blocks.SystemService/Blocks.SystemService.csproj package --vulnerable --include-transitive --no-restore --format json --output-version 1
```

Ghi package/version/advisory cho baseline, không chỉ exit code: CLI có thể exit 0
khi còn lỗ hổng. Validate JSON có projects/frameworks và không có lỗi audit/feed.
Thêm vào runtime: parse `SystemService.CleanupChecks.deps.json` bằng JsonDocument,
lấy keys trong libraries thành `HashSet<string> libraries`, parse version
OpenTelemetry.Api thành `Version apiVersion`, rồi assert:

```csharp
Assert(libraries.Contains("AutoMapper/16.1.1"), "patched AutoMapper");
Assert(libraries.Contains("OpenTelemetry.Exporter.OpenTelemetryProtocol/1.15.3"),
    "patched OTLP exporter");
Assert(libraries.Contains("OpenTelemetry.Extensions.Hosting/1.15.3"), "patched hosting");
Assert(apiVersion >= new Version(1, 15, 3), "patched OpenTelemetry.Api floor");
Assert(!libraries.Any(n => n.StartsWith("Microsoft.AspNetCore.Mvc.Core/") ||
    n.StartsWith("Microsoft.AspNetCore.HttpOverrides/") ||
    n.StartsWith("Microsoft.AspNetCore.Http.Abstractions/")), "no legacy ASP.NET packages");
```

- [ ] **Step 2: Chạy graph red**

Run: `dotnet run --project test/SystemService.CleanupChecks -c Release -- runtime`.
Expected: graph assertions thất bại trên AutoMapper 16.0.0/OTel 1.9.0, không phải
lỗi đọc deps file. Audit baseline xác nhận đúng advisory trong spec.

- [ ] **Step 3: Đổi đúng ba project file**

AutoMapper SystemService lên 16.1.1; ServiceDefaults exporter và Hosting lên 1.15.3;
Shared bỏ ba ASP.NET 2.2 PackageReference, thêm FrameworkReference Microsoft.AspNetCore.App.
Giữ TFM và dependency khác. Không thêm API pin nếu transitive resolve đúng.
Nếu restore cảnh báo downgrade/incompatibility hoặc advisory mới, ghi bằng chứng
và dừng mở rộng để điều chỉnh spec/plan, không tự nâng cả dependency family.

- [ ] **Step 4: Restore/build từng project, kiểm tra audit mới**

```powershell
$projects = @(
    'src/platform/Blocks.Shared/Blocks.Shared.csproj',
    'src/platform/Blocks.ServiceDefaults/Blocks.ServiceDefaults.csproj',
    'src/services/Blocks.SystemService/Blocks.SystemService.csproj',
    'test/SystemService.CleanupChecks/SystemService.CleanupChecks.csproj',
    'src/services/Blocks.ApiGateway/Blocks.ApiGateway.csproj',
    'src/services/Blocks.CatalogService/Blocks.CatalogService.csproj',
    'src/services/Blocks.FileService/Blocks.FileService.csproj'
)
foreach ($project in $projects) {
    dotnet restore $project --force-evaluate
    if ($LASTEXITCODE -ne 0) { throw "Restore failed: $project" }
    dotnet build $project -c Release --no-restore
    if ($LASTEXITCODE -ne 0) { throw "Build failed: $project" }
}
```

Lặp lại audit JSON Step 1 sau restore. Expected: SystemService không advisory,
Shared không còn Newtonsoft.Json 9.0.1/Encodings.Web 4.5.0 và nguồn ASP.NET 2.2,
ServiceDefaults hết hai advisory OTel. Consumer không còn advisory do Shared/
ServiceDefaults; ghi riêng AutoMapper Catalog, ImageSharp/Pkcs FileService và
warning baseline khác. Không tuyên bố mọi consumer zero-vulnerability.

- [ ] **Step 5: Thêm kiểm tra telemetry/health và cập nhật lệnh guide**

Trong StartTestAppAsync thêm builder.AddServiceDefaults() và app.MapDefaultEndpoints().
Config luôn clear endpoint OTLP trừ case telemetry để không thừa hưởng endpoint thật.
Runtime assert `/alive`, `/health` thành công khi exporter tắt và không mở DB.
Thêm nhánh dispatch và usage cho mode `telemetry`, gọi RunTelemetryChecksAsync;
lỗi prerequisite hoặc assertion phải exit khác 0 như runtime/contract.
RunTelemetryChecksAsync tạo cùng app DB port 1 với endpoint đã validate, đặt
`OTEL_EXPORTER_OTLP_ENDPOINT` và `OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf`
trong config kiểm thử. Dùng collector localhost có OTLP HTTP receiver cô lập.

Tạo ActivitySource tên app.Environment.ApplicationName, activity
`systemservice-security-check`; assert activity khác null, gửi request health,
dừng activity rồi gọi TracerProvider.ForceFlush(10000), assert true; collector
phải nhận trace có tên này. ForceFlush=true chỉ xác nhận flush hoàn tất, không
chứng minh delivery: đối chiếu trace ID của lần chạy trong collector log/backend
cô lập trước khi ghi telemetry PASS, kể cả mode exit 0. Shutdown app trong finally,
không in JWT.
Không dùng HTTP listener giả trả 200 rồi xem là đã kiểm chứng collector.
Ghi mode mới và endpoint prerequisite vào AGENTS.md.

```powershell
dotnet run --project test/SystemService.CleanupChecks -c Release -- contract
dotnet run --project test/SystemService.CleanupChecks -c Release -- runtime
dotnet run --project test/SystemService.CleanupChecks -c Release -- auth
dotnet run --project test/SystemService.CleanupChecks -c Release -- telemetry
& ./test/SystemService.BusinessDependency.Check.ps1
```

Expected: mọi runnable check exit 0, trace đã xác nhận tại collector.
Không có collector thì telemetry NOT RUN, giữ acceptance mở; không tự chọn
endpoint trong appsettings hoặc trỏ telemetry ra dịch vụ thật.

- [ ] **Step 6: Smoke consumer an toàn**

Với cấu hình kiểm thử riêng, chạy từng consumer trên loopback port trống bằng
`dotnet run --project <consumer.csproj> -c Release --no-build --no-launch-profile --urls http://127.0.0.1:<port>`.
Override JWT synthetic, OTLP endpoint trống, gRPC endpoint loopback kiểm thử và
PORT đang thừa hưởng; lưu/khôi phục mọi biến môi trường trong finally.
Expected: `/alive` và `/health` thành công, không lỗi load assembly/DI.

Catalog DB dùng MySQL cô lập nếu cần resolve DbContext: ServerVersion.AutoDetect
có thể mở connection, không dùng connection thật. FileService phải chạy với CWD/
webroot/cache test riêng: PdfCacheCleanupJob tính cache từ Directory.GetCurrentDirectory()
và chạy cleanup ngay khi startup. Không khởi động từ storage ứng dụng thật;
không tắt hosted job để giả lập thành công. Thiếu môi trường ghi NOT RUN.

- [ ] **Step 7: Docker build/publish và startup SystemService**

```powershell
docker build -f src/services/Blocks.SystemService/Dockerfile -t blocks-systemservice-security-check:local .
```

Expected: restore/build/publish image thành công. Chạy container Production,
không mount DB/storage ứng dụng, publish chỉ loopback port động:

```powershell
$name = 'systemservice-security-' + [guid]::NewGuid().ToString('N')
$key = 'x' * 64
docker run --detach --rm --name $name --publish 127.0.0.1::8080 `
    --env PORT=8080 --env ASPNETCORE_ENVIRONMENT=Production `
    --env "ConnectionStrings__System=Host=127.0.0.1;Port=1;Database=unused;Username=unused" `
    --env "Jwt__Key=$key" --env Jwt__Issuer=systemservice-cleanup-checks `
    --env Jwt__Audience=systemservice-cleanup-checks `
    --env GrpcClients__FileService=http://127.0.0.1:1 `
    --env OTEL_EXPORTER_OTLP_ENDPOINT= blocks-systemservice-security-check:local
docker port $name 8080/tcp
```

Lấy port thực, GET `/alive`, `/health` phải thành công; GET combobox không token
phải HTTP 200/Success=false/StatusCode=401, không Data. Chờ readiness hữu hạn
30 giây, không sleep vô hạn. Stop đúng container vừa tạo trong finally.
Không coi image build là bằng chứng DB/auth positive integration.

- [ ] **Step 8: Review phạm vi và commit dependency task**

```powershell
git diff --check
git diff --stat
git add -- src/services/Blocks.SystemService/Blocks.SystemService.csproj src/platform/Blocks.Shared/Blocks.Shared.csproj src/platform/Blocks.ServiceDefaults/Blocks.ServiceDefaults.csproj test/SystemService.CleanupChecks/Program.cs AGENTS.md
git commit -m "fix(system): patch vulnerable shared dependencies"
```

Expected: chỉ diff task được stage, không secret/generated output hoặc code
migration có sẵn. Warning nullable/obsolete còn lại ghi riêng; không dọn ngoài scope.
Nếu còn test bắt buộc NOT RUN, commit không đồng nghĩa đủ điều kiện rollout.

## Tự Rà Soát Và Bàn Giao

- Spec 3.1: Task 1 kiểm tra cả token còn hạn và revoked chain trước mutation.
- Spec 3.2: Task 2 kiểm tra envelope, JWT expired/wrong signature và user không VIEW.
- Spec 3.3: Task 3 kiểm tra transport/status, GUID N/B, batch sai và contract.
- Spec 3.4: Task 4 kiểm tra bật/tắt, deleted/no-op, audit actor và cô lập request.
- Spec 4-6: Task 5 kiểm tra graph/audit mới, mọi consumer, health/telemetry và Docker.
- Spec 7: Giữ giới hạn JWT cũ, package riêng ngoài scope, function permission thiếu và warning baseline.

Chưa chọn execution method cho plan này. Đề xuất **Native** với executing-plans:
năm task tuần tự dùng chung harness, ít lợi ích khi đổi implementer mỗi task;
một reviewer độc lập rà toàn bộ diff cuối. **Subagent-driven** thêm reviewer
cho từng task, tốn context hơn nhưng phát hiện sai lệch sớm hơn.

Người dùng duyệt plan và chọn method trước khi triển khai. Handoff phải liệt kê
từng check PASS/FAIL/NOT RUN, residual advisory và prerequisite còn thiếu.
Rollout chỉ sau khi đủ mandatory checks, consumer biết combobox cần JWT và client
GetUsersByIds xử lý InvalidArgument. Không tuyên bố vô hiệu hóa JWT đã phát hành.

## Bàn Giao Sau Review Ngày 2026-10-22

Mục này ghi trạng thái thực tế sau triển khai; các checkbox và hướng dẫn execution
ở trên là nội dung kế hoạch ban đầu, không thay thế bằng chứng kiểm chứng dưới đây.

### Mốc Code Và Review

- Commit security hardening: `6fbb733247238cfaf712febb2a50ce952df058f1`.
- Commit sửa ba finding của review: `462230d70604c802a01719f2f9fe0596cf25cd89`.
- Review lại phạm vi `6fbb733..462230d`, có reviewer độc lập: không phát hiện lỗi
  mới cần sửa. Ba finding cũ đã được xử lý trong code: gọi trực tiếp
  `TracerProviderExtensions.ForceFlush`, kiểm tra endpoint OTLP có port tường minh
  và nhận IPv6 loopback, kiểm tra JSON audit OldValues/NewValues.
- Có thể chấp nhận commit về mặt code; chưa đóng nghiệm thu integration hoặc
  tuyên bố sẵn sàng rollout khi các gate bên dưới còn mở.

### Kết Quả Kiểm Chứng

Các lệnh chạy từ repository root. Lượt review lại dùng build Release mới, rồi chạy
các mode với `--no-build`.

| Check | Trạng thái trong review lại | Bằng chứng / giới hạn |
| --- | --- | --- |
| `dotnet build test/SystemService.CleanupChecks/SystemService.CleanupChecks.csproj -c Release --verbosity quiet` | PASS | 0 warning, 0 error. |
| `dotnet run --project test/SystemService.CleanupChecks -c Release --no-build -- contract` | PASS | Contract checks đạt. |
| `dotnet run --project test/SystemService.CleanupChecks -c Release --no-build -- runtime` | PASS | DB-free; gồm chín assertion endpoint OTLP mới. |
| `& ./test/SystemService.BusinessDependency.Check.ps1` | PASS | Kiểm tra source dependency, không chứng minh hành vi auth. |
| `git diff --check 6fbb733..462230d` | PASS | Không lỗi whitespace trong diff. |
| `dotnet run --project test/SystemService.CleanupChecks -c Release --no-build -- auth` | BLOCKED | Lệnh exit 1 trước khi chạy case: `Failed to connect to [::1]:5432`; không có listener PostgreSQL tại port 5432. Đây là thiếu prerequisite, chưa phải lỗi hành vi được tái hiện. |
| Telemetry tới collector cô lập | NOT RUN | Chưa đặt `SYSTEMSERVICE_CLEANUP_TEST_OTLP_ENDPOINT`; chưa xác nhận trace được nhận. |
| `grpc_permission_valid_allow` / `grpc_permission_valid_deny` | NOT RUN | Thiếu function `fn_user_checkpermission` và fixture quyền cô lập. |
| Docker build/startup và consumer startup smoke | NOT RUN trong các lượt review | Chưa có bằng chứng nghiệm thu được xác nhận trong review. |

Lịch sử auth cần giữ riêng: review trước tại `6fbb733` đã chạy độc lập 29/29 case
thành công và dọn schema test. Sau commit `462230d`, người dùng báo auth 29/29 PASS;
lượt review độc lập mới nhất bị chặn bởi kết nối DB, nên chưa xác nhận lại kết quả
đó tại commit mới. Không ghi BLOCKED thành PASS hoặc ghi đè kết quả lịch sử.

Review trước cũng đã restore/build Shared, ServiceDefaults, SystemService,
CleanupChecks, ApiGateway, CatalogService và FileService thành công. Audit sau
restore không báo advisory cho SystemService, Shared, ServiceDefaults và ApiGateway.
Catalog còn AutoMapper `16.0.0`; FileService còn ImageSharp `3.1.7` và Pkcs `8.0.1`.
Đây là dependency riêng ngoài phạm vi; không tuyên bố toàn repo hết lỗ hổng.

### Tiếp Tục Ở Phiên Sau

1. Kiểm tra HEAD và working tree trước khi tiếp tục; không sửa lại ba finding đã
   được review nếu không có bằng chứng hồi quy mới.
2. Khôi phục PostgreSQL kiểm thử cô lập và chạy lại mode `auth`. Chỉ dùng
   `SYSTEMSERVICE_CLEANUP_TEST_CONNECTION` với localhost database
   `blocks_systemservice_cleanup_test`; không dùng DB thật, không ghi connection
   hoặc token vào tài liệu/log.
3. Cấu hình collector OTLP HTTP cô lập, đặt
   `SYSTEMSERVICE_CLEANUP_TEST_OTLP_ENDPOINT`, chạy mode `telemetry` và đối chiếu
   trace ID cùng activity `systemservice-security-check` tại collector. Build đạt,
   exit 0 hoặc `ForceFlush=true` không tự chứng minh delivery.
4. Giữ gate permission allow/deny mở cho đến khi có function và fixture thật trong
   môi trường kiểm thử; không thay bằng stub luôn true/false.
5. Hoàn tất Docker/consumer smoke theo Task 5 Step 6-7 với DB/storage/cache cô lập,
   rồi cập nhật từng gate bằng kết quả thực tế trước khi đóng plan.
