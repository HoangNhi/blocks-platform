# SystemService BusinessService Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Loại bỏ phụ thuộc BusinessService và hai RPC tài khoản ngoài trong SystemService mà không nới quyền của External Reviewer cũ.

**Architecture:** Xóa phụ thuộc trực tiếp trong project, DI và AuthService cùng một task để không để lại trạng thái không build được. Giữ điều kiện chặn role cũ tại AuthService, bảo vệ cả login và refresh; bỏ đúng hai RPC chuyên biệt, giữ API tổng quát và tích hợp còn dùng.

**Tech Stack:** C#/.NET 8, ASP.NET Core, EF Core 8.0.22, Npgsql, AutoMapper 16.0.0, gRPC/protobuf, PowerShell; chỉ dùng dependency hiện có.

**Spec:** `docs/superpowers/specs/2026-10-21-systemservice-remove-businessservice-design.md` đã được người dùng duyệt ngày 2026-10-21.

## Global Constraints

- Chỉ sửa code trong `src/services/Blocks.SystemService/` và bổ sung kiểm tra hồi quy trong `test/`.
- Không sửa AppHost, ApiGateway, CatalogService, FileService, frontend, solution hoặc `.gitignore`.
- Role External Reviewer: `551d1351-008e-4910-a39c-1fcdde409fdf`.
- Role cũ không được login hoặc refresh; không tạo access token hay refresh token mới.
- Không xóa user, role, permission, refresh token hoặc audit log trong DB.
- Không thêm adapter, fake BusinessService, feature flag, dependency hoặc lớp trung gian.
- Giữ chữ ký public của `IAuthService`, `LoginAsync` và `RefreshToken`.
- Giữ sáu RPC tổng quát, CheckPermission, AuditGrpcService, audit.proto và upload avatar.
- Không đổi package, namespace, tên RPC còn lại, kiểu message hay số field protobuf còn giữ.
- Không refactor thuật toán password, JWT hoặc toàn bộ refresh-token flow.
- Build project trực tiếp, không lấy build solution/AppHost làm điều kiện duy nhất.
- Không dùng DB thật của người dùng để tạo/xóa dữ liệu kiểm thử.
- Chặn cấp token mới không thu hồi JWT đã cấp; rollout phải kiểm tra phiên cũ và TTL.
- Người dùng đã yêu cầu bỏ ignore `docs/superpowers/` và commit spec/plan; tài liệu được theo dõi bằng git, không cần force-add.
- Chưa triển khai trước khi người dùng duyệt plan và chọn cách thực hiện.

## Review Focus

- External Reviewer active/inactive, đúng/sai mật khẩu: luôn bị từ chối và không ghi token mới; Task 2.
- Refresh token không tồn tại, hết hạn hoặc revoked: lỗi nghiệp vụ, không null-reference hoặc cấp token; Task 2.
- User thường hợp lệ: login và rotate refresh token vẫn hoạt động, không bị guard role cũ chặn nhầm; Task 2.
- Constructor AuthService qua DI: chỉ cần dependency nội bộ, không cần BusinessProtoClient hoặc địa chỉ BusinessService; Task 2.
- Regenerate protobuf: chỉ mất đúng hai RPC và bốn message riêng, field/message/audit còn giữ không đổi; Task 3.

---

## File Map

| Hành động | Đường dẫn | Trách nhiệm |
| --- | --- | --- |
| Modify | `src/services/Blocks.SystemService/Blocks.SystemService.csproj` | Bỏ protobuf BusinessService. |
| Modify | `src/services/Blocks.SystemService/Configs/ConfigService.cs` | Bỏ namespace và đăng ký BusinessProtoClient. |
| Modify | `src/services/Blocks.SystemService/Services/CoreFeature/Auth/AuthService.cs` | Bỏ client từ xa, chặn login/refresh của role cũ. |
| Modify | `src/services/Blocks.SystemService/Protos/system.proto` | Bỏ hai RPC và bốn message chuyên biệt. |
| Modify | `src/services/Blocks.SystemService/Services/gRPC/SystemGrpcService.cs` | Bỏ hai override và dependency riêng của chúng. |
| Create | `test/SystemService.BusinessDependency.Check.ps1` | Kiểm tra tham chiếu source và đường dẫn project/protobuf, không cần build hoặc DB. |
| Create | `test/SystemService.CleanupChecks/SystemService.CleanupChecks.csproj` | Console net8.0, project-reference SystemService, không PackageReference mới. |
| Create | `test/SystemService.CleanupChecks/Program.cs` | Assertion chạy thật với AuthService và kiểm tra descriptor gRPC; không test framework. |

Không tạo helper production mới, không sửa `IUserService`, `UserService`,
`IAuthService`, schema hoặc migration.

## Chuẩn bị khi bắt đầu thực hiện

- [ ] Đọc spec và plan đã được commit, dùng skill worktree để kiểm tra môi trường trước khi sửa code; xác nhận cả hai tài liệu có trong worktree thực thi.
- [ ] Ghi `git status --short` và commit nền bằng `git rev-parse HEAD`; giữ nguyên thay đổi có sẵn của người dùng.
- [ ] Ghi hash ban đầu của `audit.proto`, `IAuthService.cs`, `IUserService.cs`, `UserService.cs`, `AuthController.cs`, `Program.cs`, `ConfigureAuthentication.cs` để đối chiếu cuối; dùng diff/status so với baseline để kiểm tra phạm vi còn lại.
- [ ] Chạy `dotnet build src/services/Blocks.SystemService/Blocks.SystemService.csproj` và ghi lỗi baseline. Thiếu `business.proto` là lỗi đầu vào, không phải behavioral test đỏ.

SDK 9.0.318/10.0.401 và runtime .NET/ASP.NET Core 8.0.31 đã thấy trên máy
lúc viết plan; kiểm tra lại môi trường thực thi. Chưa chạy build ở bước viết plan.

## Task 1: Bỏ phụ thuộc BusinessService và giữ login an toàn

**Files:**
- Create/Test: `test/SystemService.BusinessDependency.Check.ps1`
- Modify: `src/services/Blocks.SystemService/Blocks.SystemService.csproj:34`
- Modify: `src/services/Blocks.SystemService/Configs/ConfigService.cs:1`
- Modify: `src/services/Blocks.SystemService/Configs/ConfigService.cs:99`
- Modify: `src/services/Blocks.SystemService/Services/CoreFeature/Auth/AuthService.cs:1`

**Interfaces:**
- Consumes: `SystemContext`, `IMapper`, `IHttpContextAccessor`, `IConfiguration`, `ExtRoleId` hiện có.
- Produces: `AuthService(SystemContext context, IMapper mapper, IHttpContextAccessor contextAccessor, IConfiguration config)`.
- Produces: `Task<LoginResponse> LoginAsync(LoginRequest request, string ipAddress)` và `ModelToken RefreshToken(RefreshTokenRequest request, string ipAddress)` giữ nguyên contract.
- Task 2 sở hữu guard refresh và behavioral tests; không phát hành trạng thái trung gian sau Task 1.

- [ ] **Step 1: Viết kiểm tra tham chiếu đỏ, không phụ thuộc build**

Script lấy root từ parent của `$PSScriptRoot`; `$ErrorActionPreference = 'Stop'`.
Đọc `.csproj` bằng `[xml]`, kiểm tra mọi `Protobuf`/`ProjectReference` còn giữ
đều trỏ đến file tồn tại. Quét `.cs`, `.csproj`, `.json`, `.proto` trong
SystemService, loại `bin`/`obj`; không quét spec hoặc toàn repo.
Các assertion bắt buộc:

```powershell
# $protos: Include của các node Protobuf; $sources: nội dung source đã lọc.
if ($protos -match 'Blocks\.BusinessService') { throw 'Business protobuf reference remains' }
if ($sources -match 'Blocks\.BusinessService|BusinessProto|business\.proto|GrpcClients:BusinessService|http://BusinessService|CheckExternalReviewerAccess') {
    throw 'BusinessService dependency remains'
}
if ($protos -notcontains '..\Blocks.FileService\Protos\file.proto') { throw 'FileService protobuf missing' }
if ($protos -notcontains 'Protos\system.proto') { throw 'System protobuf missing' }
if ($protos -notcontains 'Protos\audit.proto') { throw 'Audit protobuf missing' }
```

- [ ] **Step 2: Chạy kiểm tra trước sửa**

Run: `powershell -NoProfile -File test/SystemService.BusinessDependency.Check.ps1`

Expected: exit khác 0 vì tham chiếu BusinessService hoặc đường dẫn protobuf
bị thiếu. Không nhận lỗi syntax/đường dẫn script làm bằng chứng red.

- [ ] **Step 3: Xóa phụ thuộc và thay kiểm tra từ xa bằng từ chối**

Xóa mục `business.proto` trong `.csproj`, namespace BusinessService và
toàn bộ block đăng ký BusinessProtoClient trong ConfigService. Giữ nguyên
FileProtoClient, handler, JWT interceptor và package gRPC.

Trong AuthService, đổi constructor theo Interfaces, bỏ field/phép gán/client
và request gRPC. Tại nhánh `user.RoleId == ExtRoleId` sau kiểm tra mật khẩu,
thay lời gọi từ xa bằng `BusinessException("Tài khoản hoặc mật khẩu không đúng")`.
Giữ kiểm tra user/trạng thái/mật khẩu hiện có và role ID bảo vệ.
Không đổi `IAuthService`; nếu bỏ `async`, trả `Task.FromResult(data)` để giữ
kiểu trả về, không thêm `Task.Run` hoặc lời gọi async giả.

- [ ] **Step 4: Kiểm tra cấu trúc và build**

Run: `powershell -NoProfile -File test/SystemService.BusinessDependency.Check.ps1`

Expected: exit 0, `PASS BusinessService dependency checks`.

Run: `dotnet build src/services/Blocks.SystemService/Blocks.SystemService.csproj`

Expected: exit 0. Nếu xuất hiện lỗi không liên quan, ghi lỗi baseline mới;
không sửa module ngoài phạm vi hoặc dựng BusinessService giả để lách build.
Behavioral red của auth chưa thể chạy trên baseline thiếu protobuf;
ghi rõ giới hạn này, không gọi lỗi compiler là test hành vi.

- [ ] **Step 5: Commit task đã kiểm tra**

```powershell
git add test/SystemService.BusinessDependency.Check.ps1 src/services/Blocks.SystemService/Blocks.SystemService.csproj src/services/Blocks.SystemService/Configs/ConfigService.cs src/services/Blocks.SystemService/Services/CoreFeature/Auth/AuthService.cs
git commit -m "refactor(system): remove BusinessService dependency"
```

## Task 2: Kiểm thử auth và chặn refresh token của role cũ

**Files:**
- Create: `test/SystemService.CleanupChecks/SystemService.CleanupChecks.csproj`
- Create/Test: `test/SystemService.CleanupChecks/Program.cs`
- Modify: `src/services/Blocks.SystemService/Services/CoreFeature/Auth/AuthService.cs:93`

**Interfaces:**
- Consumes: constructor và public methods từ Task 1; profile thật `AuthProfile`, `UserProfile`, password/JWT helpers hiện có.
- Produces: `dotnet run --project test/SystemService.CleanupChecks -- auth`, exit 0 chỉ khi mọi case pass.
- Produces: local functions `void Assert(bool condition, string name)`, `Task ExpectBusinessExceptionAsync(Func<Task> action, string expectedMessage)` và `Task RunAuthChecksAsync()` trong Program.cs.
- Task 3 thêm mode `contract` không cần DB vào cùng console; không tạo test project khác.

- [ ] **Step 1: Tạo harness nhỏ và fixture DB an toàn**

Console target `net8.0`, `OutputType=Exe`, nullable/implicit usings bật;
ProjectReference `../../src/services/Blocks.SystemService/Blocks.SystemService.csproj`.
Dùng assertion ném exception thay `Debug.Assert` để Release cũng kiểm tra.
Mode không hợp lệ trả exit khác 0; `auth` thiếu DB phải báo thiếu prerequisite,
không tự chuyển thành PASS.

Chỉ đọc connection string từ `SYSTEMSERVICE_CLEANUP_TEST_CONNECTION`.
Trước khi mở connection hoặc thực hiện DDL, parse bằng
`NpgsqlConnectionStringBuilder` và bắt buộc host là `localhost`, `127.0.0.1`
hoặc `::1`, database là đúng `blocks_systemservice_cleanup_test`.
Không lấy connection từ appsettings/user secrets và không in password.

Database này phải được cấp riêng trước khi chạy. Mỗi lần chạy tạo schema
`cleanup_` cộng GUID dạng `N`, đặt `SearchPath` vào schema đó và tạo bảng bằng
`SystemContext.Database.GenerateCreateScript()`. Không dùng `EnsureDeleted`,
không drop database, không ghi vào schema `public`. Chỉ dọn schema tự tạo
trong `finally`, kiểm tra lại database/schema trước khi DROP; lỗi dọn cũng
làm run thất bại. Đặt Npgsql legacy timestamp switch giống Program.cs.

Seed role thường và role cũ; user thường active/inactive/deleted, External
Reviewer active/inactive; token còn hạn/hết hạn/revoked thuộc đúng user.
Dùng password fixture `cleanup-test-only`, salt/hash từ helper production.
Mỗi case mở DI scope/context và transaction riêng rồi rollback để độc lập.
Không đăng ký AuditInterceptor trong fixture auth; audit được smoke riêng.

Mapper dùng AuthProfile và UserProfile thật, logger factory rỗng. DI chỉ
đăng ký SystemContext, mapper, IHttpContextAccessor, IConfiguration và
`IAuthService, AuthService`; không BusinessProtoClient. Config JWT kiểm thử:
key 64 ký tự ASCII, issuer/audience `systemservice-cleanup-checks`,
`Jwt:Expiry=1`, `Jwt:ExpireRefreshToken=2`; IP `127.0.0.1`.

- [ ] **Step 2: Viết các case và assertion hành vi trước khi sửa refresh**

Trong `RunAuthChecksAsync`, mỗi case gọi service thật qua DI. Tên case:
`di_without_business_client`, `login_external_active_denied`,
`login_external_inactive_denied`, `login_external_wrong_password_denied`,
`login_normal_succeeds`, `login_wrong_password_denied`,
`login_missing_user_denied`, `login_deleted_user_denied`,
`login_inactive_user_denied`, `refresh_external_active_denied`,
`refresh_external_inactive_denied`, `refresh_missing_token_denied`,
`refresh_expired_token_denied`, `refresh_revoked_token_denied`,
`refresh_normal_rotates`.

Đối với login, dùng `LoginRequest` với Username/Password fixture:

```csharp
await ExpectBusinessExceptionAsync(
    () => auth.LoginAsync(externalLogin, "127.0.0.1"),
    "Tài khoản hoặc mật khẩu không đúng");
Assert(await db.RefreshTokens.CountAsync() == beforeCount, "no token on denied login");
```

Assert tương tự cho External Reviewer inactive và sai password. User thường
sai password dùng cùng lỗi; missing/deleted dùng `"Tài khoản không tồn tại"`,
inactive dùng `"Tài khoản đã bị vô hiệu"`. Case login thành công assert
`Id`, `RoleId` đúng fixture, AccessToken/RefreshToken khác rỗng, DB tăng
đúng một token thuộc user; đọc JWT kiểm tra claim `name`/`role` đúng ID.

Đối với External Reviewer có token còn hạn:

```csharp
await ExpectBusinessExceptionAsync(
    () => Task.FromResult(auth.RefreshToken(externalRefresh, "127.0.0.1")),
    "Token không hợp lệ");
Assert(await db.RefreshTokens.CountAsync() == beforeCount, "no new refresh token");
var stored = await db.RefreshTokens.AsNoTracking()
    .SingleAsync(t => t.Token == externalRefresh.RefreshToken);
Assert(stored.RevokedAt == null && stored.ReplacedByToken == null, "old token unchanged");
```

Token hết hạn/revoked thuộc user thường dùng lỗi `"Token không hợp lệ"`;
revoked fixture có `ReplacedByToken = null`. Missing token dùng chuỗi
`missing-token`, phải BusinessException thay NullReferenceException.
Các case từ chối không tăng số token. Refresh user thường assert AccessToken
khác rỗng, RefreshToken khác token cũ, DB tăng đúng một bản ghi và token cũ
có `RevokedAt != null`, `ReplacedByToken` trỏ đúng token mới. Đọc lại bằng
query AsNoTracking trong transaction; không assert trên entity cache.

- [ ] **Step 3: Chạy behavioral red**

Run: `dotnet run --project test/SystemService.CleanupChecks -- auth`

Expected: login và DI pass sau Task 1; `refresh_external_active_denied`
thất bại vì code hiện cấp token, `refresh_missing_token_denied` thất bại vì
null-reference. Harness báo từng tên case, tổng thất bại và exit khác 0.
Connection failure, thiếu fixture hoặc mapper lỗi không được tính là red.

- [ ] **Step 4: Thêm guard tối thiểu vào RefreshToken**

Giữ chữ ký `ModelToken RefreshToken(RefreshTokenRequest request, string ipAddress)`.
Ngay sau `getUserByRefreshToken`, trước đọc `user.RefreshTokens` và trước
mọi rotate/SaveChanges, kiểm tra `user == null || user.RoleId == ExtRoleId`;
ném `BusinessException("Token không hợp lệ")`. Không đổi thuật toán rotation,
revoke chain hoặc thêm policy service.

- [ ] **Step 5: Chạy lại kiểm tra**

Run: `dotnet run --project test/SystemService.CleanupChecks -- auth`

Expected: mọi case trong Step 2 PASS, exit 0, schema kiểm thử được dọn.
Nếu positive control phát hiện lỗi baseline khác, ghi riêng và chỉ hoàn tất
sau khi phân biệt được lỗi do thay đổi; không mở rộng refactor ngoài spec.

Run: `powershell -NoProfile -File test/SystemService.BusinessDependency.Check.ps1`

Expected: exit 0.

- [ ] **Step 6: Commit task**

```powershell
git add test/SystemService.CleanupChecks/SystemService.CleanupChecks.csproj test/SystemService.CleanupChecks/Program.cs src/services/Blocks.SystemService/Services/CoreFeature/Auth/AuthService.cs
git commit -m "fix(system): deny legacy reviewer token refresh"
```

## Task 3: Bỏ hai RPC chuyên biệt, kiểm tra tương thích và tích hợp

**Files:**
- Modify/Test: `test/SystemService.CleanupChecks/Program.cs`
- Modify: `src/services/Blocks.SystemService/Protos/system.proto:7`
- Modify: `src/services/Blocks.SystemService/Services/gRPC/SystemGrpcService.cs:14`

**Interfaces:**
- Consumes: console và assertion của Task 2, generated `SystemReflection.Descriptor`, `AuditReflection.Descriptor`.
- Produces: mode `contract`, chạy không cần DB; `void RunContractChecks()`.
- Produces: `SystemGrpcService(SystemContext context, IUserService userService)`.
- Produces: contract SystemProto còn đúng bảy RPC: CheckPermission và sáu RPC tổng quát trong spec.

- [ ] **Step 1: Viết contract test trước khi xóa RPC**

Lấy snapshot từ descriptor hiện tại trước sửa vào literal trong Program.cs:
tên đầy đủ, input/output, streaming flags của bảy RPC còn giữ; tên message
còn giữ và tuple tên/field number/type/repeated/message type của từng field;
snapshot tương tự cho audit.proto. Không tự sửa expected từ output sau khi
đã xóa RPC và không thêm thư viện parse `.proto`.

Trong `RunContractChecks()`:

```csharp
var descriptor = SystemReflection.Descriptor;
var service = descriptor.Services.Single();
var actual = service.Methods.Select(m => m.Name).OrderBy(x => x).ToArray();
var expected = new[] {
    "CheckPermission", "GetUsersByIds", "GetUsersByUsernames",
    "SetUsersActived", "GetUsersByIdsPaged", "UpdateUserProfile",
    "GetActiveUsersExceptRole"
}.OrderBy(x => x).ToArray();
Assert(service.FullName == "system.SystemProto", "service identity preserved");
Assert(actual.SequenceEqual(expected), "only seven retained RPCs");
var removed = new[] { "CreateExternalUserRequest", "CreateExternalUserResponse",
    "DeleteExternalUserRequest", "DeleteExternalUserResponse" };
Assert(!descriptor.MessageTypes.Any(m => removed.Contains(m.Name)), "specialized messages removed");
```

Assert snapshot của bảy RPC, mọi message còn giữ và audit vẫn bằng baseline;
dùng descriptor API và `Fields.InDeclarationOrder()`. Reflection trên
`SystemGrpcService` với public instance declared-only methods phải có đúng
bảy override và constructor đúng Interfaces, không còn reference guard.

- [ ] **Step 2: Chạy contract red**

Run: `dotnet run --project test/SystemService.CleanupChecks -- contract`

Expected: exit khác 0 vì vẫn có chín RPC, bốn message cần bỏ và constructor
cũ; không đòi DB trong mode này.

- [ ] **Step 3: Xóa đúng API đã duyệt**

Trong system.proto, xóa `CreateExternalUser`, `DeleteExternalUser` và bốn
message riêng trong Step 1. Không renumber field hoặc sửa message khác.
Trong SystemGrpcService, xóa hai override và `_referenceGuard`, tham số
constructor, phép gán, using validation/helper chỉ dùng bởi code đã bỏ.
Giữ `_context`, `_userService`, Authorize, bảy override còn lại và đăng ký
DI chung `ISystemReferenceGuard` trong ConfigService.

- [ ] **Step 4: Kiểm tra build lại và toàn bộ regression**

```powershell
dotnet build src/services/Blocks.SystemService/Blocks.SystemService.csproj --no-incremental
dotnet run --project test/SystemService.CleanupChecks -- contract
dotnet run --project test/SystemService.CleanupChecks -- auth
powershell -NoProfile -File test/SystemService.BusinessDependency.Check.ps1
git diff --check
```

Expected: từng lệnh exit 0. Đối chiếu hash file giữ nguyên và danh sách
file thay đổi với File Map; không sửa generated files trong `obj`.

- [ ] **Step 5: Smoke trên môi trường riêng khi đủ prerequisite**

Cần PostgreSQL kiểm thử có function phân quyền thật `fn_user_checkpermission`,
dữ liệu user/menu/permission cho user được phép và bị từ chối; Catalog DB,
FileService storage kiểm thử, cấu hình JWT đồng bộ và endpoint gRPC-Web.
Fixture schema auth ở Task 2 không thay thế môi trường này; không tạo
function trả kết quả giả rồi xem là đã kiểm chứng phân quyền.

Chạy ba service trực tiếp, không AppHost, bằng `dotnet run --project` với
project tương ứng và `--no-launch-profile --urls` trên ba port trống.
Cấp cấu hình kiểm thử qua biến môi trường; không sửa service khác hoặc
trỏ vào DB/storage thật. `ConnectionStrings__System`, `GrpcClients__FileService`
và `GrpcClients__SystemService` phải trỏ đúng service/DB kiểm thử tương ứng.

Xác nhận các trường hợp:

- Login user thường, refresh thành công; External Reviewer thất bại và DB
  không thêm token. HTTP body giữ BaseResponse, không chỉ kiểm tra HTTP 200.
- Audit login thành công/thất bại có Action LOGIN, IsSuccess và UserId đúng.
- Gọi `POST /api/Faculty/insert` trên CatalogService với JSON gồm `Name`
  duy nhất dạng `cleanup-<GUID>` và `IsActived: true`, bằng hai user có/không
  có quyền ADD cho controller `faculty`. User được phép nhận Success true
  và có bản ghi Faculty; user bị từ chối không tạo bản ghi, nhận lỗi quyền
  theo contract hiện tại. Xác nhận CheckPermission qua gRPC còn hoạt động,
  không bypass AttributePermission.
- Xác nhận thao tác thành công trên CatalogService và FileService có audit
  gửi về SystemService; chờ xử lý audit bất đồng bộ rồi đọc lại DB.
- Upload một PNG fixture qua `POST /api/UploadFile` với form `files` và
  `FolderName` là GUID mới. Gọi `PUT /api/User/edit-profile` bằng user thường,
  JSON gồm `FullName: "Cleanup Test"`, Email đang dùng của user fixture và
  `FolderUpload` bằng FolderName vừa upload; xác nhận Avatar trả về có prefix
  `System/Avatar/` và file ảnh thực tồn tại trong storage kiểm thử.

Ghi request/response đã bỏ token/secret và kết quả DB/storage. Thiếu môi
trường thì ghi NOT RUN cùng prerequisite còn thiếu; giữ Step 5 chưa hoàn
tất, không gọi source check hoặc descriptor check là integration PASS.

- [ ] **Step 6: Commit task và chốt điều kiện rollout**

```powershell
git add src/services/Blocks.SystemService/Protos/system.proto src/services/Blocks.SystemService/Services/gRPC/SystemGrpcService.cs test/SystemService.CleanupChecks/Program.cs
git commit -m "refactor(system): remove legacy external user RPCs"
```

Trước rollout, kiểm kê client ngoài repo của hai RPC đã bỏ và xác nhận
không còn JWT External Reviewer có hiệu lực hoặc đã chờ hết TTL thực tế.
Không đổi JWT key hoặc thêm thu hồi token tức thời trong đợt này.
Ghi rõ AppHost/solution và frontend BusinessService vẫn nằm ngoài phạm vi.

## Tự rà soát plan

- Spec 4.1: Task 1 xóa dependency build/DI; script và build kiểm chứng.
- Spec 4.2: Task 1 giữ login fail-closed, Task 2 kiểm tra login/refresh thật và guard null/role.
- Spec 4.3: Task 3 xóa đúng hai RPC/bốn message và dependency riêng.
- Spec 4.4: Task 3 đối chiếu descriptor/hash, giữ helper và tích hợp hiện có.
- Spec 6-7: Có structural red, behavioral red, contract red và positive control; không nhầm lỗi môi trường với red.
- Spec 8: Không sửa service khác, không xóa dữ liệu thật; thiếu smoke vẫn là phần chưa kiểm chứng.

## Bàn giao

Plan chờ người dùng duyệt và chọn cách thực hiện.

Đề xuất **Native** với `superpowers:executing-plans`: ba task tuần tự cùng
chạm auth/test harness, không có nhiều công việc độc lập để chia song song.
Thực hiện trong phiên hiện tại, rồi một reviewer độc lập rà toàn bộ diff
nếu công cụ hỗ trợ; công bố rõ nếu không có reviewer.

**Subagent-driven** dùng `superpowers:subagent-driven-development`: implementer
mới và reviewer mới cho từng task, rồi review toàn bộ; tốn nhiều context hơn
nhưng có kiểm tra độc lập trước mỗi task tiếp theo.
