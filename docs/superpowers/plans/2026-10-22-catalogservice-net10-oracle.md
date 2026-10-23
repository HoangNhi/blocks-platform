# CatalogService .NET 10 And Oracle MySQL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nâng riêng CatalogService và CleanupChecks lên .NET 10, thay Pomelo bằng Oracle MySQL provider, giữ contract Faculty và dữ liệu hiện có.

**Architecture:** Ghi baseline trên .NET 8/Pomelo trước, sau đó retarget service/harness và chuyển provider cùng một task nhất quán. Giữ production DI, FacultyService, AuditInterceptor và schema; kiểm tra DB-free, fixture MySQL được cấp quyền riêng, rồi E2E/Docker. Không thêm lớp repository, dual-provider hoặc migration.

**Tech Stack:** .NET 10, EF Core/Relational/Design/Tools `10.0.13`, JwtBearer `10.0.13`, `MySql.EntityFrameworkCore` `10.0.12`, transitive `MySql.Data` >= `26.10.0`, console regression harness, PowerShell, Docker.

**Spec:** `docs/superpowers/specs/2026-10-22-catalogservice-net10-oracle-design.md` (đã duyệt ngày 2026-10-22).

## Global Constraints

- Catalog và CleanupChecks đích `net10.0`; Docker `sdk:10.0` / `aspnet:10.0`; không còn Pomelo, MySqlConnector hoặc EF 8/9 trong runtime graph hai project.
- Giữ API/DTO/protobuf/envelope, UUID `char(36)`, tám cột Faculty, `tinyint(1)`, timestamp/default/nullability, `utf8mb4` / `utf8mb4_0900_ai_ci`, soft delete, permission và audit.
- Không migrations, rescaffold, DDL/DML database ứng dụng, binary GUID, đổi credentials/endpoint/TLS hoặc startup schema mutation.
- Không sửa SystemService, Shared, ServiceDefaults, Gateway, AppHost, frontend hoặc nghiệp vụ Faculty ngoài lỗi tương thích có test chứng minh.
- Giữ package khác. Ghi advisory AutoMapper `16.0.0` riêng; không suppression, blanket upgrade, prerelease hoặc downgrade ép xanh. Graph mới có advisory mới hoặc tổ hợp không tương thích thì dừng, cập nhật spec.
- Provider input chỉ `CATALOGSERVICE_UPGRADE_TEST_CONNECTION`; TCP host chính xác `localhost`, `127.0.0.1`, `::1`; database chính xác `blocks_catalogservice_upgrade_test`. Không fallback app config.
- Chỉ ghi fixture sau quyền riêng cho database test đã provision; không tự tạo/drop database. Từ chối database không trống và bảng `faculty` có sẵn; chỉ dọn bảng chính lần chạy đã tạo. Crash leftovers cần xác nhận riêng; không `--force`/`DROP TABLE IF EXISTS`.
- Không log connection string, JWT, mật khẩu, keys hoặc exception chứa giá trị secret. SQL fixture dùng parameters; output kết quả không chứa dữ liệu ứng dụng.
- Thiếu DB/E2E thì ghi `NOT RUN`, không giả PASS. Full provider acceptance cần cả Pomelo và Oracle cùng bộ assertions; rollout còn cần E2E và chủ dự án xác nhận license `GPL-2.0-only WITH Universal-FOSS-exception-1.0`.
- Đọc source và `git status --short` trước sửa; giữ thay đổi có sẵn. Không dùng full-solution build/AppHost làm acceptance; chạy trực tiếp Catalog.

## Review Focus

1. Connection trỏ nhầm DB, nhiều host, named pipe/unix socket hoặc fixture còn sót: từ chối trước write, không chiếm/xóa bảng có sẵn. Task 1, guard checks và lifecycle checks.
2. `IsActived=false/null`, UUID do caller và timestamp khác timezone: không mất false, đổi UUID hoặc lệch UTC+7 khi đổi driver. Task 1 baseline/provider; Task 2 chạy lại.
3. Unicode và ký tự `%`, `_`, dấu nháy trong search: giữ Contains, collation, count và paging phía server; không SQL injection hoặc LIKE wildcard ngoài ý muốn. Task 1 provider; Task 2 SQL checks.
4. Batch thiếu ID hoặc SaveChanges lỗi: không persist một phần, không audit success; capture background audit không gây false positive. Task 1 provider; Task 4 E2E.
5. JWT user ID khác username, sai issuer/audience hoặc thiếu quyền: actor/claims đúng, token bị từ chối đúng envelope, mutation không lọt permission. Task 3 runtime; Task 4 E2E.

---

## File Responsibilities

| File | Trách nhiệm |
| --- | --- |
| `test/CatalogService.CleanupChecks/Program.cs` | Dispatch modes; contract/model/SQL, runtime/claims/health DB-free. Giữ helper hiện có. |
| `test/CatalogService.CleanupChecks/ProviderChecks.cs` (mới) | Guard offline, lifecycle fixture, production DI/service/audit integration; capture CallInvoker test-only trong cùng file. |
| `test/CatalogService.CleanupChecks/CatalogService.CleanupChecks.csproj` | Retarget và EF/Relational version. Không thêm framework test. |
| `src/services/Blocks.CatalogService/Blocks.CatalogService.csproj` | Target framework, Oracle provider, EF Design/Tools và JWT versions. |
| `src/services/Blocks.CatalogService/Configs/ConfigService.cs` | Oracle registration/connection-option validation, giữ interceptor/lifetime/DI/gRPC. |
| `src/services/Blocks.CatalogService/Infrastructure/Data/CatalogContext.cs` | Oracle mapping đúng schema hiện có, giữ partial hook. |
| `src/services/Blocks.CatalogService/Configs/ConfigureAuthentication.cs` | Tường minh raw claims, username và role; giữ token validation/events. |
| `src/services/Blocks.CatalogService/Dockerfile` | Chỉ đổi SDK/runtime sang 10.0, giữ user/ports/build context. |
| `src/services/Blocks.CatalogService/Dockerfile.dockerignore` | Allowlist Catalog, Shared, ServiceDefaults và hai proto tiêu thụ; loại secret local/output build khỏi context. |
| `test/CatalogService.Removal.Check.ps1` | Giữ checks cleanup; thêm target/provider/Docker source guards. |
| `AGENTS.md` | Chỉ sửa target Catalog/harness và lệnh provider/prerequisites; giữ chỉnh sửa người dùng. |
| Tài liệu plan này | Ghi baseline revision, kết quả từng gate, blockers và rollback artifact khi thực thi. Không ghi secrets. |

Không sửa entity/DTO/controller/service mặc định. Nếu query/mapping không tương thích,
thêm test tái hiện trước; thay đổi service chỉ ở expression gây lỗi, không đổi nghiệp vụ.

## Execution Order

Task 1 → Task 2 → Task 3 → Task 4. Không chạy đồng thời build cùng output hoặc hai
provider fixtures. Có thể review source và chuẩn bị runbook song song bằng worker
read-only; không chia hai worker sửa `Program.cs` hoặc đổi provider giữa lúc baseline chạy.
Thiếu quyền DB vẫn làm DB-free/code; giữ commit Task 1 để sau này chạy baseline bằng
worktree riêng, tuần tự với Oracle, không nạp hai provider trong một process.

### Task 1: Baseline Pomelo And Safe Provider Fixture

**Files:**
- Modify/Test: `test/CatalogService.CleanupChecks/Program.cs`
- Create/Test: `test/CatalogService.CleanupChecks/ProviderChecks.cs`
- Record: `docs/superpowers/plans/2026-10-22-catalogservice-net10-oracle.md`

**Interfaces:**
- Consumes: `ConfigService.ExecuteConfigService(WebApplicationBuilder)`, production `CatalogContext`, `IFacultyService`, `IHttpContextAccessor`, `AuditInterceptor`; existing `Require(bool, string)` remains local to Program.
- Produces: `internal static class ProviderChecks` with `internal static void RunGuardChecks()`, `internal static string ValidateIsolatedConnection(string? connectionString)`, `internal static Task RunAsync()`. `RunGuardChecks` never opens DB; `RunAsync` reads only named environment input and throws sanitized failures.
- Produces: mode `provider`; Program catches failure without printing connection/inner exception and returns nonzero. Success prints `PASS provider checks`. `contract` calls `ProviderChecks.RunGuardChecks()` and remains DB-free.
- Produces: existing `CreateJwt(string key, string issuer, string audience, DateTime? expires = null, DateTime? notBefore = null)` appends optional `string? userId = null, string? userName = null, string? roleId = null`. Fixture-only authenticated `GET /__checks/claims`, excluded from Swagger, records raw `name`/`unique_name`/`role`, Identity.Name and IsInRole before package changes.
- Produces: baseline commit/revision and observations for same assertions under Oracle; no runtime provider switch.

- [x] **Step 1: Record existing baseline before test/package changes.**

Run separately from repository root:

```powershell
git status --short
git rev-parse HEAD
dotnet --list-sdks
& ./test/CatalogService.Removal.Check.ps1
dotnet build src/services/Blocks.CatalogService/Blocks.CatalogService.csproj
dotnet run --project test/CatalogService.CleanupChecks -- contract
dotnet run --project test/CatalogService.CleanupChecks -- runtime
dotnet list src/services/Blocks.CatalogService/Blocks.CatalogService.csproj package --include-transitive
dotnet list src/services/Blocks.CatalogService/Blocks.CatalogService.csproj package --vulnerable --include-transitive
```

Expected: record actual exit codes, existing PASS messages and warnings; net8/Pomelo graph.
Separate baseline failures from migration regressions. SDK/runtime missing is prerequisite,
not permission to silently install/change machine configuration.

- [x] **Step 2: Add failing fixture guards and dispatch checks, then run `contract`.**

Use local assert helper in ProviderChecks; do not make Program helpers public.
Name checks `connection_guard_rejects_unsafe_target_before_open` and
`connection_guard_accepts_only_isolated_tcp_target`:

```csharp
// For each string: ValidateIsolatedConnection must throw before any Open.
// null; ""; malformed string; Server=remote;Database=blocks_catalogservice_upgrade_test
// Server=127.0.0.1;Database=catalog
// Server=127.0.0.1,remote;Database=blocks_catalogservice_upgrade_test
// Local-looking host with non-TCP protocol; missing database.
var safe = "Server=127.0.0.1;Port=1;Database=blocks_catalogservice_upgrade_test;Uid=x;Pwd=x;";
Require(ValidateIsolatedConnection(safe) == safe, "Safe input retained without opening DB");
```

Also accept each of three allowed hosts with fixture database; reject wrong-case database
name, near-match hosts and all unsupported/malformed protocol options. Guard errors must
not contain distinctive test password. Supported modes usage includes `provider`.
Expected RED: missing ProviderChecks/guard; do not fake red by changing production behavior.

- [x] **Step 3: Implement guard and owned-table lifecycle using current MySqlConnector.**

Use installed driver connection builder, not regex. Validate nonempty input, single exact
loopback host/database and actual TCP protocol. No requirement to change authentication
or reject a supported passwordless fixture. Open only after guard and explicit environment
authorization; verify `DATABASE()`, server version/comment and timezone. Reject any existing
table/view before `CREATE TABLE faculty`; use exact schema from spec §2.1, including
`DEFAULT (uuid())`, no `ON UPDATE`, engine/charset/collation. Do not infer server version
from driver version or repair an unsupported server.

Track successful create immediately. In `finally`, recheck target database and drop only
owned `faculty`; never run cleanup after preexisting-table failure. If cleanup fails,
report leftover table and nonzero exit without losing original failure or leaking secrets.
Include lifecycle assertions: wrong database writes nothing; second attempt with table
present fails and original row/table remains. Probe refusal inside current owned
fixture; probe must not acquire ownership or clean original table. Do not create extra
tables for tests. No `EnsureCreated`/migrations.

- [x] **Step 4: Add provider characterization assertions and execute baseline when authorized.**

Keep `RunAsync` orchestration and private helpers in ProviderChecks, no generic fixture
framework. Build temporary WebApplicationBuilder with Sources.Clear/in-memory config,
call production `ExecuteConfigService`; only provider mode may let Pomelo AutoDetect open
validated isolated DB. Resolve production IFacultyService/context/interceptor in fresh
scopes. Set DefaultHttpContext with explicit raw claims and NameClaimType `unique_name`;
set path and `Items["AuditAction"]` for CREATE/UPDATE/DELETE to emulate production filter.
Do not claim direct-service checks tested HTTP permission or AuditActionFilter.

Replace only `AuditProto.AuditProtoClient` with test-only `CapturingAuditInvoker : CallInvoker`
using production generated constructor. Handle `WriteAuditLogRequest`, return
`WriteAuditLogReply { Success = true }`; all other methods fail loudly. Store cloned
payloads in Channel/queue and await capture with five-second cancellation deadline.
Catch timeout cancellation explicitly for negative checks; cancellation is not a
`WaitToReadAsync` result of false. Drain expected prior success captures first; failed
save gets a fresh scope/request and a bounded one-second no-success observation window.
This proves observed interceptor behavior, not guaranteed delivery or SystemService persistence.

Extend runtime with Task 1 claims endpoint/helper, create token with distinct user ID,
username and role ID, and record .NET 8 principal observations without enforcing desired
claim mapping yet. No production debug endpoint.

Implement named checks with these assertions, using SQL parameters and fresh-context/raw reads:

```csharp
// uuid_sql_to_ef_and_service_to_sql
Require(loaded.Id == seededId, "Raw char(36) UUID read unchanged");
Require(inserted.Id == callerId, "Caller UUID retained");
Require(generated.Id != Guid.Empty, "Empty request ID generated");
// flags_defaults_null_and_timestamp_roundtrip
Require(inactive.IsActived == false, "Explicit false survives DB default true");
Require(defaulted.IsActived == true, "Omitted/default active retains baseline");
// unicode_search_paging_and_duplicate_name
Require(page.TotalRow == 3 && page.Data.Count == 1, "Count independent of page size");
// failed_batch_and_failed_save_never_succeed
Require(!reloaded.IsDeleted, "Missing second ID persisted no first-row delete");
Require(!failureAudit.Any(x => x.IsSuccess), "Failed DB save emitted no success audit");
```

Pin fixture data: three raw-seeded active/nondeleted rows with UUIDs
`00000000-0000-4000-8000-000000000001`, `00000000-0000-4000-8000-000000000002`,
`00000000-0000-4000-8000-000000000003`, names `Phòng Công nghệ`, `Phòng Đào tạo`,
`Phòng Kế toán`. CreatedAt respectively `2026-10-22T00:00:01Z`, `00:00:02Z`,
`00:00:03Z`; UpdatedAt NULL for rows 1/3, `00:00:02Z` for row 2.
For TextSearch `Phòng`, PageIndex=2/PageSize=1 require second UUID and TotalRow=3.
Seed separate name `100%_O'Reilly` to check literal `%`, `_`, `'` without adding a
matching `Phòng` row. Exercise GetById/FindAsync, Contains literal characters,
duplicate name/collation, update excluding own ID, count, conditional timestamp ordering,
combobox active-only/order and deleted-row exclusion. No tie-order assumptions.
Check raw stored flag values 0/1 and active/inactive combobox entries.
Test entity `IsActived=null` through context because request IsActived is nonnullable;
observe/pin existing default outcome, do not invent a DTO null state.
Seed explicit UpdatedAt NULL and omitted UpdatedAt separately; record defaults and
UTC/session behavior. Serialize DTO through production MVC JsonOptions and assert
fixed `2026-10-22T00:00:00Z` becomes `"2026-10-22T07:00:00"`.
No arbitrary DateTime.Kind expectation when DB retains no Kind.

Verify CREATE/UPDATE/DELETE audit payload ID/user/action, old/new values; soft delete
retains raw row. Force real duplicate-PK DbUpdateException using fresh context/unique
name, not same-tracker duplicate; assert raw row unchanged and no success audit.
Use one context per failed scenario and dispose without later SaveChanges.
Record existing legacy behavior separately rather than modifying service rules.

Run guard `contract`, existing `runtime`, then authorized `provider` separately:

```powershell
dotnet run --project test/CatalogService.CleanupChecks -- contract
dotnet run --project test/CatalogService.CleanupChecks -- runtime
dotnet run --project test/CatalogService.CleanupChecks -- provider
```

Expected GREEN: contract/runtime PASS; authorized provider PASS and owned table absent
after run. Missing permission/config: provider NOT RUN in record, never call it successful.
Assertions added to characterize existing behavior may start green; only missing guard/
dispatch should provide initial red. If baseline differs, record evidence and resolve
against spec before fixing expected values; do not bless migration regressions.

- [x] **Step 5: Commit only baseline harness and recorded nonsecret results.**

Commit message: `test(catalog): add guarded MySQL provider baseline`.
Record commit SHA in execution log. Do not retarget or install Oracle in this commit.

### Task 2: Retarget And Replace Provider As One Change

**Files:**
- Modify: `src/services/Blocks.CatalogService/Blocks.CatalogService.csproj`
- Modify: `src/services/Blocks.CatalogService/Configs/ConfigService.cs`
- Modify: `src/services/Blocks.CatalogService/Infrastructure/Data/CatalogContext.cs`
- Modify/Test: `test/CatalogService.CleanupChecks/CatalogService.CleanupChecks.csproj`
- Modify/Test: `test/CatalogService.CleanupChecks/Program.cs`
- Modify/Test: `test/CatalogService.CleanupChecks/ProviderChecks.cs`
- Modify/Test: `test/CatalogService.Removal.Check.ps1`

**Interfaces:**
- Consumes: Task 1 ProviderChecks signatures/assertions and Pomelo baseline revision.
- Produces: same public service/DI/context/DTO interfaces, Oracle `UseMySQL(...)`;
  ProviderChecks signatures unchanged, using MySql.Data driver instead of MySqlConnector.
- Produces: DB-free contract/model/SQL and production DI resolution on unreachable DB.

- [x] **Step 1: Add failing target/provider guards to existing PowerShell check.**

Use current XML parsing, preserve removal/protobuf/audit assertions. Assert both csproj
TargetFramework `net10.0`, Oracle `10.0.12`, declared Microsoft EF packages `10.0.13`,
Catalog JwtBearer `10.0.13`, no direct Pomelo. Name diagnostics
`catalog_targets_net10_and_oracle` and `cleanup_harness_targets_net10`.
Run `& ./test/CatalogService.Removal.Check.ps1`; expected RED on net8/Pomelo.
Transitive graph is verified after restore, not guessed from source XML.

- [x] **Step 2: Change target/package/mapping/fixture setup together.**

Use exact package matrix in Global Constraints; retain existing PrivateAssets,
IncludeAssets, project/proto links and UserSecretsId. No explicit MySql.Data package
unless actual NuGet resolution demands it; no MySqlConnector retained for test helpers.
Compatibility ruling confirmed in spec: bump Catalog-only Google.Protobuf to `3.35.0`
because MySql.Data `26.10.0` net10 nuspec requires >= `3.35.0`; do not change proto
contracts or another service. Extend source-version guard for this required dependency.
Switch production AddDbContext to Oracle UseMySQL with existing AuditInterceptor.
Keep `ConnectionStrings:Catalog`, lifetime and gRPC registration unchanged.

Validate connection syntax/options with `MySql.Data.MySqlClient.MySqlConnectionStringBuilder`;
unsupported keyword reports only keyword, invalid values report no value/inner exception.
Do not drop options or rewrite local secret. Add negative fixture option checks with
distinctive secret and require sanitized error. Resolve DI/model/ToQueryString at
`127.0.0.1:1` without OpenConnection/AutoDetect; this is DB-free proof.

Use pinned Oracle extension APIs, not Pomelo namespace or legacy docs casing.
Reference source tag `mysql/mysql-connector-net/26.10.0`, files
`EFCore/src/Extensions/MySQLModelBuilderExtensions.cs` and
`EFCore/src/Metadata/Internal/MySQLAnnotationNames.cs`: namespace
`MySql.EntityFrameworkCore.Extensions`, `MySQLModelBuilderExtensions.HasCharSet(ModelBuilder, string)`,
`UseCollation(ModelBuilder, string)`, annotations `MySQL:Charset` / `MySQL:Collation`.
Inspect resolved package API if it differs; stop rather than guessing old
`ForMySQLHasCharset` overloads. Prefer explicit static call if EF UseCollation conflicts.
Use public FindAnnotation on design model, not internal provider constants.

Keep one Faculty DbSet/eight properties and OnModelCreatingPartial. Explicitly retain
Guid store `char(36)`, bool store `tinyint(1)` and required IsActived, strings and
timestamp types/defaults. Set charset/collation through Oracle at effective model/
table/string-column levels matching spec; assert resolved mapping rather than demanding
annotation duplication on each property. No new UUID generation/default convention.
No converter unless raw SQL cross-read test proves one needed.
Replace only driver-specific construction in ProviderChecks; preserve data/assertions.

- [x] **Step 3: Expand contract and runtime checks for Oracle mapping and SQL.**

Name checks `oracle_model_preserves_faculty_schema`,
`oracle_queries_translate_with_parameters`, `oracle_di_model_resolution_is_db_free`.
Retain existing validator/AutoMapper/nullability assertions. Pin model/design metadata:

```csharp
Require(idProp.ClrType == typeof(Guid) && idProp.GetColumnType() == "char(36)", "UUID schema retained");
Require(isActivedProp.ClrType == typeof(bool?) && !isActivedProp.IsNullable, "CLR/DB nullability retained");
Require(isActivedProp.GetColumnType() == "tinyint(1)", "Active flag store type retained");
Require(designModel.FindAnnotation("MySQL:Charset")?.Value as string == "utf8mb4", "Oracle charset retained");
Require(designModel.GetCollation() == "utf8mb4_0900_ai_ci", "Oracle collation retained");
```

Assert all eight column names/types, PRIMARY, string lengths, both timestamp defaults/
nullability, IsActived default `'1'`, IsDeleted bool mapping. Do not add model DB defaults
not in baseline solely to imitate scaffold.
ToQueryString covers Find predicate, duplicate/exclude-ID predicate, bool filters,
Contains, conditional ordering, Skip/Take and combobox source query. Assert WHERE,
ORDER BY, limit/offset and parameterized search/Guid predicates without snapshotting
whole SQL/parameter names. CountAsync and FindAsync execution remain provider tests,
not fake ToQueryString proof. No client evaluation replacing server filtering/paging.

In runtime fixture, after Sources.Clear configure AddServiceDefaults/MapDefaultEndpoints,
leave `OTEL_EXPORTER_OTLP_ENDPOINT` absent so existing exporter condition stays false, resolve production
CatalogContext/model in scope and generate SQL against unreachable fixture connection.
Assert `/health` and `/alive` HTTP 200/`Healthy`, Swagger and existing route/auth checks;
never ValidateOnBuild every service or read real appsettings/user secrets.

- [x] **Step 4: Run direct checks and record provider baseline comparison as NOT RUN.**

```powershell
& ./test/CatalogService.Removal.Check.ps1
dotnet build src/services/Blocks.CatalogService/Blocks.CatalogService.csproj
dotnet run --project test/CatalogService.CleanupChecks -- contract
dotnet run --project test/CatalogService.CleanupChecks -- runtime
dotnet list src/services/Blocks.CatalogService/Blocks.CatalogService.csproj package --include-transitive
dotnet list test/CatalogService.CleanupChecks/CatalogService.CleanupChecks.csproj package --include-transitive
dotnet run --project test/CatalogService.CleanupChecks -- provider
```

Expected: source/model/runtime PASS; graphs resolve EF10/Oracle/MySql.Data, no old
provider/driver/EF8/9. Authorized provider matches Task 1 raw UUID/flags/timestamp/query/
audit assertions. Missing DB authorization remains NOT RUN; preserve baseline revision
for later comparison. Any schema conversion requirement stops task, not a hidden DDL fix.

- [x] **Step 5: Commit scoped migration.**

Commit message: `feat(catalog): upgrade to net10 and Oracle MySQL provider`.
Include only listed code/test changes; record actual checks, provider comparison and
compatibility exceptions in execution log. No unrelated package fixes.

### Task 3: Pin JWT Claims And Actor Compatibility

**Files:**
- Modify/Test: `test/CatalogService.CleanupChecks/Program.cs`
- Modify: `src/services/Blocks.CatalogService/Configs/ConfigureAuthentication.cs`

**Interfaces:**
- Consumes: Task 1 `CreateJwt` signature including optional userId/userName/roleId,
  `/__checks/claims` response and .NET 8 principal observations.
- Produces: desired raw-claims/Identity.Name assertions on same fixture endpoint,
  plus fixture-only role-protected endpoint exercising production OnForbidden.
  Both excluded from Swagger; production service has neither endpoint.

- [x] **Step 1: Capture current claims, then add desired failing assertions.**

Reuse known ID/username/role token and endpoint from Task 1. Compare current principal
with .NET 8 observations before changing auth; do not attribute all mapping changes
to .NET10. Fixture endpoint uses RequireAuthorization; add role-protected endpoint
to exercise OnForbidden without external SystemService.
Name checks `jwt_raw_claims_and_identity_use_system_contract`,
`jwt_wrong_issuer_audience_and_missing_role_are_denied`:

```csharp
Require(rawName == userId && rawUniqueName == userName && rawRole == roleId, "Raw System token claims retained");
Require(identityName == userName && isInRole, "Service actor is username, role recognized");
Require(httpStatus == HttpStatusCode.OK && !success && statusCode == 403, "Forbidden envelope retained");
```

Also wrong issuer/wrong audience yield HTTP200/application401. Keep missing/signature/
expired tests, six Faculty routes and retired-route 404. Run `runtime`; record actual
RED and baseline principal, never assume red if assertions already pass.

- [x] **Step 2: Set explicit claim mapping in production auth registration.**

Set `options.MapInboundClaims = false`,
TokenValidationParameters.NameClaimType `unique_name`, RoleClaimType `role`.
Keep issuer/audience/signing/lifetime behavior, ClockSkew zero, x-service-authorization
gRPC path, OnChallenge/OnForbidden and envelopes. Do not change permission filter.

- [x] **Step 3: Run runtime/contract; record unauthorized provider tests as NOT RUN.**

```powershell
dotnet run --project test/CatalogService.CleanupChecks -- runtime
dotnet run --project test/CatalogService.CleanupChecks -- contract
dotnet run --project test/CatalogService.CleanupChecks -- provider
```

Expected: claims/raw role/Identity.Name/envelopes PASS; fixture debug endpoints absent
from production and six-route Swagger unchanged. Provider asserts CreatedBy/UpdatedBy
username and audit UserId/UserName independently. Direct principal setup does not prove
HTTP permission or JWT forwarding; those remain Task 4 external gate.

- [x] **Step 4: Commit claim compatibility checks/config.**

Commit message: `fix(catalog): preserve raw JWT claims and audit actor`.

### Task 4: Docker, External Gates And Handoff

**Files:**
- Modify/Test: `src/services/Blocks.CatalogService/Dockerfile`
- Modify/Test: `test/CatalogService.Removal.Check.ps1`
- Modify: `AGENTS.md` (only own Catalog-related hunks)
- Record: `docs/superpowers/plans/2026-10-22-catalogservice-net10-oracle.md`

**Interfaces:**
- Consumes: Tasks 1-3 checks; production `/health`, `/alive`, Swagger, Faculty HTTP routes.
- Produces: image `blocks-catalogservice:net10-oracle`, non-root runtime, documented PASS/
  FAIL/NOT RUN gate matrix and retained baseline rollback artifact.
- External inputs: owner-authorized isolated E2E services, JWTs and users/roles with
  real `faculty` ADD/UPDATE/DELETE permissions and `auditlog` VIEW permission.
  No SystemService/PostgreSQL provisioning or permission-function replacement.

- [x] **Step 1: Add Docker image-version guards; prove RED, then change only tags.**

PowerShell source guard asserts exact `mcr.microsoft.com/dotnet/aspnet:10.0` and
`mcr.microsoft.com/dotnet/sdk:10.0`, retains USER `$APP_UID`, exposed 8080/8081,
entrypoint and copy paths. Existing 8.0 tags must fail. Change tags, rerun source guard
for GREEN; do not restructure Docker stages.

- [x] **Step 2: Publish/build and smoke image without connecting real DB.**

```powershell
dotnet publish src/services/Blocks.CatalogService/Blocks.CatalogService.csproj -c Release
docker build -f src/services/Blocks.CatalogService/Dockerfile -t blocks-catalogservice:net10-oracle .
```

Expected exit 0; no new NU1605/provider graph warnings. Docker unavailable: record
NOT RUN, never use local publish as container proof.
Use process-local test config only; set test-only `Jwt__Key` to `('k' * 64)`.
Set `Jwt__Issuer`/`Jwt__Audience` to `catalogservice-upgrade-smoke`,
`ConnectionStrings__Catalog` to unreachable dummy `Server=127.0.0.1;Port=1;Database=nonexistent;Uid=x;Pwd=x;`,
`GrpcClients__SystemService` to `http://127.0.0.1:1`; save/restore prior process env values
in finally. No env-file committed, no printing environment/docker inspect Config.Env.

```powershell
docker run --rm -d --name catalogservice-upgrade-smoke -p 127.0.0.1::8080 `
  --env ASPNETCORE_ENVIRONMENT=Development --env PORT=8080 `
  --env Jwt__Key --env Jwt__Issuer --env Jwt__Audience `
  --env ConnectionStrings__Catalog --env GrpcClients__SystemService blocks-catalogservice:net10-oracle
$binding = docker port catalogservice-upgrade-smoke 8080/tcp
$base = "http://$binding"
Invoke-WebRequest "$base/health"
Invoke-WebRequest "$base/alive"
Invoke-WebRequest "$base/swagger/v1/swagger.json"
docker exec catalogservice-upgrade-smoke id -u
docker exec catalogservice-upgrade-smoke dotnet --list-runtimes
docker stop catalogservice-upgrade-smoke
```

Check native exit codes; bounded readiness polling (30s) before HTTP assertions.
Wrap lifecycle in try/finally, stop only container created by this run; reject name
collision rather than stopping someone else's container. Assert health/alive Healthy,
Swagger six Faculty routes, UID nonzero, installed ASP.NET/Core runtime 10.0.x and
unauthenticated Faculty HTTP200/application401. No dummy DB connection needed.

- [x] **Step 3: Run authorized external HTTP permission/audit gate or record NOT RUN.**

Prerequisites: owner confirms E2E endpoints/DBs are isolated and permits fixture
mutations; real SystemService auth/permission/audit and gRPC route work; dedicated test
user IDs/username/roles and tokens. `CATALOG_E2E_URL`, `SYSTEM_E2E_URL`,
`CATALOG_E2E_ALLOWED_TOKEN`, `CATALOG_E2E_DENIED_TOKEN`, `CATALOG_E2E_AUDIT_TOKEN`
come from authorized local environment, never tracked or echoed. Audit token needs
`auditlog` VIEW. No synthetic always-allow permission, no auth bypass.

Use actual FacultyRequest shape, not removed `facultyCode`/`facultyName`.
After validating prerequisites, execute template requests with `Invoke-RestMethod`;
assert both HTTP and body `Success`, `StatusCode`, `Data`, `Message`.

```powershell
$allowed = @{ Authorization = "Bearer $env:CATALOG_E2E_ALLOWED_TOKEN" }
$denied = @{ Authorization = "Bearer $env:CATALOG_E2E_DENIED_TOKEN" }
$audit = @{ Authorization = "Bearer $env:CATALOG_E2E_AUDIT_TOKEN" }
$id = [guid]::NewGuid().ToString()
$name = "Catalog upgrade $id"
$body = @{ Id = $id; Name = $name; IsActived = $true } | ConvertTo-Json
$created = Invoke-RestMethod "$env:CATALOG_E2E_URL/api/Faculty/insert" -Method Post -Headers $allowed -ContentType application/json -Body $body
$deniedCreate = Invoke-RestMethod "$env:CATALOG_E2E_URL/api/Faculty/insert" -Method Post -Headers $denied -ContentType application/json -Body (@{ Id = [guid]::NewGuid().ToString(); Name = "Denied $id" } | ConvertTo-Json)
$body = @{ Id = $id; Name = "$name updated"; IsActived = $false } | ConvertTo-Json
$deniedUpdate = Invoke-RestMethod "$env:CATALOG_E2E_URL/api/Faculty/update" -Method Put -Headers $denied -ContentType application/json -Body $body
$updated = Invoke-RestMethod "$env:CATALOG_E2E_URL/api/Faculty/update" -Method Put -Headers $allowed -ContentType application/json -Body $body
$deleteBody = @{ Ids = @($id) } | ConvertTo-Json
$deniedDelete = Invoke-RestMethod "$env:CATALOG_E2E_URL/api/Faculty/delete-list" -Method Delete -Headers $denied -ContentType application/json -Body $deleteBody
$deleted = Invoke-RestMethod "$env:CATALOG_E2E_URL/api/Faculty/delete-list" -Method Delete -Headers $allowed -ContentType application/json -Body $deleteBody
$auditBody = @{ ServiceName = "CatalogService"; EntityName = "Faculty"; PageIndex = 1; PageSize = 100; UserId = $env:CATALOG_E2E_ALLOWED_USER_ID } | ConvertTo-Json
$logs = Invoke-RestMethod "$env:SYSTEM_E2E_URL/api/AuditLog/get-list" -Method Post -Headers $audit -ContentType application/json -Body $auditBody
```

Owner supplies `CATALOG_E2E_ALLOWED_USER_ID` matching token. Before requests validate
token/user metadata locally without logging JWT. After EACH denied mutation verify
no row/change via authorized get-by-id/get-list; denied requests keep application403
and Success=false, not a hidden transport-only pass. Add authorized get-list
`{ TextSearch=$name; PageIndex=1; PageSize=10 }`, get-by-id `?Id=$id` and
get-all-combobox before/after inactive update and soft delete; read policies unchanged.
Assert created/updated actor username from token, known ID, and deleted row absent from
list/combobox. Do not demand GetById reject deleted rows; legacy behavior out of scope.

Poll AuditLog get-list with 30-second deadline/250ms interval, paginate if needed;
filter returned `Data.Data` by EntityId `$id`, ServiceName/EntityName/actor. Require
persisted successful CREATE/UPDATE/DELETE with old/new values consistent with mutations.
Verify denied mutations produced no successful audit; failure audit may exist.
Mutation HTTP success alone or capturing CallInvoker cannot satisfy persistence gate.
Do not physically purge E2E rows/audits; cleanup beyond approved soft delete needs
separate permission. Failure mid-test: report owned IDs and remaining fixture state.

- [x] **Step 4: Run final direct checks and record every gate.**

Rerun source check, Catalog build/publish, contract/runtime, both transitive graphs,
vulnerability scan for service AND harness; provider only when authorized. Compare
Task 1 revision results with Oracle, recording server/version/timezone observations.
Keep DB-free PASS, Pomelo provider PASS/NOT RUN, Oracle provider PASS/NOT RUN, HTTP E2E
PASS/NOT RUN, Docker build/smoke PASS/NOT RUN, license owner confirmation separately.
Never mark full acceptance if either provider revision, E2E, Docker or license gate
remains unmet. Code handoff may state exact partial status without rollout approval.

- [x] **Step 5: Update guide, review diff and commit own changes.**

AGENTS: Catalog/harness `net10.0`, Oracle provider, provider command and isolated-DB
authorization guard; preserve existing user edits. Review `git diff --check`,
`git status --short`, diff of owned paths and staged paths. No generated artifacts,
secret files, unrelated changes or broad `git add .`.
Commit message: `build(catalog): verify net10 container and migration gates`.
Stage only owned hunks in already-dirty AGENTS; if safe separation is unavailable,
leave guide edit uncommitted and disclose rather than committing user changes.

Retain Task 1 baseline commit and pre-upgrade artifact/config securely. Rollback uses
old artifact with old driver config, no down migration. Bad writes are not repaired
by code rollback: stop writes, obtain separate recovery decision; never automatic
reverse SQL. Do not deploy as part of implementation-plan execution.

## Execution Log

2026-10-22: Người dùng yêu cầu subagent triển khai trên checkout hiện tại, không tạo
worktree. Initial HEAD `526978ce927b7d9297dbb67d6bb25b0bf1035ef8`, branch
`chore/project-cleanup`. Giữ nguyên thay đổi ngoài Catalog. Docker server `29.7.2`
khả dụng. Không có quyền riêng cho DB fixture hoặc E2E; chưa chạy ghi DB.

Kết quả theo task sẽ được ghi ở đây: revision, command, exit code,
PASS/FAIL/NOT RUN, cảnh báo baseline và blockers; không ghi connection strings/tokens.

### Task 1 Evidence

- Baseline code: `526978ce927b7d9297dbb67d6bb25b0bf1035ef8`; harness commits
  `3f5e09c`, `7bd47fa`. Review độc lập và scoped re-review đã đạt; live DB vẫn NOT RUN.
- SDK `10.0.401`, runtime ASP.NET/Core `8.0.31` có thể chạy baseline net8;
  không cài thêm SDK hoặc đổi cấu hình máy.
- Source removal, Catalog build, contract, runtime, package graph và vulnerability
  scan baseline đều exit 0. Graph Pomelo `8.0.3` / MySqlConnector `2.3.5`.
- RED contract exit 1 do chưa có ProviderChecks; GREEN contract/runtime exit 0.
  Bản sửa sau review cũng contract/runtime exit 0; không chạy live provider.
- Provider missing-env refusal exit 1 chỉ chứng minh guard, không phải PASS DB.
  Pomelo live integration **NOT RUN**: chưa có quyền/fixture test cụ thể.
- Cảnh báo có sẵn: AutoMapper `16.0.0`, NU1903, GHSA-rvv3-g6hj-g44x; thêm
  obsolete FluentValidation APIs và cảnh báo compiler CS0108/CS8603/CS8604.
  Không suppression hoặc nâng package ngoài tương thích bắt buộc.
- Fixture JWT net8: `name` user ID vẫn có raw claim; `unique_name`/`role` raw null,
  Identity.Name là username, IsInRole=true. Đây là baseline trước claim fix,
  không quy toàn bộ hành vi này cho .NET 10.
- Required compatibility clarification: Catalog Google.Protobuf sẽ nâng tối thiểu
  `3.33.2` lên `3.35.0` do MySql.Data `26.10.0` yêu cầu, không sửa proto contracts.

### Tasks 2-4 Evidence

Ngày thực thi tiếp: 2026-10-23, timezone Asia/Bangkok.

- Migration commit `4321329`; JWT commit `56a89d5`. Chỉ service/harness Catalog;
  Shared/ServiceDefaults vẫn net8. Không đổi entity/DTO/FacultyService/protobuf.
- Source-version guard từ chối XML net8 baseline. Contract guard bắt được lỗi
  Oracle chuẩn hóa PipeName thành `pipe`; đã sửa và bỏ diagnostic output.
- Production connection validation RED trên input rỗng; GREEN sau parse structured,
  kiểm tra keyword bằng Oracle builder, lỗi không giữ value/inner exception.
- Model/schema, actual command parameters và production DI/model/SQL tại endpoint
  không thể kết nối đều đạt mà không mở DB. Oracle `UseCollation` dùng relational
  metadata; `ToQueryString()` nội suy chuỗi để hiển thị nên dùng `CreateDbCommand()`
  xác minh parameter binding thực.
- Runtime trước claim fix giữ cùng quan sát net8. Desired raw username assertion RED;
  sau `MapInboundClaims=false`, NameClaimType/RoleClaimType tường minh, runtime GREEN:
  raw ID/username/role, Identity.Name, role authorization, issuer/audience/signature/
  expiration 401 và missing-role 403 envelope. Swagger chính xác sáu route Faculty.
- Docker guard RED với aspnet8; GREEN sau đổi hai image tags sang10.0.
  Release publish và Docker build exit0. Thêm Dockerfile-specific allowlist vì repo
  không có root ignore; context cuối5.86kB thay vì gửi cả thư mục ngoài phạm vi.
- Docker smoke exit0: `/health`, `/alive` đều Healthy, sáu route Swagger, anonymous
  HTTP200/application401, UID1654 không phải root, ASP.NET/Core runtime10.0.x.
  Bind host127.0.0.1 với port động; cấu hình giả, không mở DB. Container riêng đã
  dừng/xóa; biến môi trường process được khôi phục.
- Hai graph resolve EF/Relational10.0.13, Oracle10.0.12, MySql.Data26.10.0 và
  Google.Protobuf3.35.0; không Pomelo/MySqlConnector/EF8/9. Hai vulnerability scans
  chỉ báo baseline AutoMapper16.0.0/GHSA-rvv3-g6hj-g44x, không suppression.
- Native worker Task2 lỗi503 `[antigravity/gemini-3.8-flash-high] Unavailable`;
  không retry request, đổi model/provider hoặc config máy. Tiếp tục inline.
  Final review dùng documented `codex exec --sandbox read-only` riêng, cấu hình
  mặc định, không model/provider override, không delegate đệ quy hoặc chạy DB.
- Review CLI không xác nhận production regression/Critical; nêu bốn Important gaps
  trong fixture. Đã bổ sung source: metadata engine/version trước DDL; timestamp ghi
  qua EF/service đối chiếu UNIX_TIMESTAMP raw, sessionUTC và+07; audit IsSuccess,
  old/new fields và failed-batch no-success; wildcard distractors, từng ký tự search,
  duplicate khác case/accent. Guard metadata offline RED/GREEN; các assertion DB mới
  **chưa chạy live**, không ghi review đã sạch hoàn toàn hoặc nghiệm thu dữ liệu.
- Final rerun sau bổ sung fixture: source check, build, publish Release, contract,
  runtime, hai graph và hai vulnerability scans đều exit0; scoped diff check exit0.
  Không chạy mode provider vì không có quyền ghi fixture. AGENTS được stage đúng
  ba hunk Catalog; thay đổi delegation/FileService của người dùng được để nguyên.

### Acceptance Gates

| Gate | Kết quả |
| --- | --- |
| Source, build, publish, contract, runtime | PASS; final rerun sau chỉnh fixture được ghi bên dưới. |
| Hai package graphs/vulnerability scans | PASS về matrix; advisory AutoMapper có sẵn vẫn tồn tại. |
| Docker build và DB-free smoke | PASS. |
| Pomelo live baseline tại `7bd47fa` | NOT RUN: thiếu quyền/fixture riêng. |
| Oracle live provider | NOT RUN: thiếu quyền/fixture riêng. |
| So sánh provider với assertions được tăng cường sau review | NOT RUN; cần cùng assertions ở hai revision, chỉ port setup driver. |
| Real HTTP permission/JWT forwarding/audit persistence E2E | NOT RUN: thiếu môi trường và quyền fixture. |
| Chủ dự án xác nhận license Oracle | PENDING. |
| Deploy, merge, push | Không thực hiện. |

Không đổi schema/data ứng dụng hoặc local secret. Handoff chỉ là code và kiểm tra
DB-free/container, **chưa cho rollout**. Giữ baseline `3f5e09c`/`7bd47fa` để chạy
đối chứng sau khi có quyền; rollback dùng artifact/driver cũ, không reverse SQL.

### Execution Decisions

1. Làm tại checkout hiện tại theo yêu cầu, không worktree; dùng diff/commit giới hạn
   Catalog để giữ thay đổi song song. Rủi ro còn lại là thiếu cách ly checkout.
2. SDK10 có thể build net8 với runtime8 đã cài; kiểm chứng bằng build, không tự cài
   SDK hoặc coi thiếu SDK8 là blocker.
3. Controller sở hữu plan/spec/ledger; workers chỉ commit file được giao. Rủi ro nếu
   sai ranh giới được giảm bằng review staged paths, không broad staging.
4. Duyệt code/spec không cấp quyền DB/E2E; giữ các gate NOT RUN. Chi phí là chưa
   chứng minh tương thích dữ liệu/permission/audit thực.
5. Giữ model/provider được cấu hình; native503 dùng fallback CLI được tài liệu hóa,
   không sửa cấu hình hoặc giả native delegation. Review khác process không thay
   bằng chứng build/test/DB.
6. Nâng riêng Google.Protobuf3.35.0 vì MySql.Data yêu cầu; chi phí là dependency
   tương thích bắt buộc, không đổi contract hoặc service khác.
7. Giữ concurrent frontend/FileService commits; review và stage chỉ Catalog.
8. Native lỗi thì hoàn tất phần phụ thuộc chặt inline; final fresh-context CLI
   review bù độc lập, không có reviewer riêng cho từng task còn lại.
9. Dùng `GetCollation()` và actual `CreateDbCommand()` theo API Oracle thực; không
   sửa production query chỉ để làm diagnostic SQL giống giả định plan.
10. Thêm Dockerfile-specific ignore vì context thiếu giới hạn; chi phí thêm một file
    build thuộc Catalog, không thay stage hoặc hành vi ứng dụng.
11. Preflight fixture yêu cầu MySQL hỗ trợ expression defaults từ8.0.13, từ chối
    MariaDB/engine không rõ; đây không chứng nhận mọi server tương lai tương thích.
12. Bàn giao source fixture sau review nhưng không giả live verification; metadata
    guard được test offline, timestamp/audit/search live phải chạy khi được phép.
13. Những điểm reviewer để ngoài đánh giá: dữ liệu thật và E2E giữ NOT RUN; legacy
    reads/races/tie-order không đổi; controller xác minh Docker/graphs/scans riêng;
    license vẫn do chủ dự án xác nhận. Chi phí là các gate chưa đóng trước release.
14. Giữ branch/checkout hiện tại theo yêu cầu, không merge/push/deploy. Giữ scratch
    review log của riêng plan trong thư mục ignored vì live follow-up chưa xác minh;
    không xóa artifacts hoặc workspace của công việc khác.

## Plan Review

- Spec coverage: §1-5 vào Tasks 1-3 và file map; §6 vào Tasks 1-4; §7 rollback/sequence
  và §8 DB/license/stop gates vào Global Constraints, Task 4.
- Step scan: đường dẫn, interfaces, fixture data, assertions, commands và expected
  outcomes được chỉ định; không yêu cầu viết lại service hoặc provision subsystem khác.
- Type consistency: ProviderChecks API giữ nguyên qua đổi driver; FacultyRequest.Name/
  IsActived, DeleteListRequest.Ids, GetListPagingResponse.TotalRow/Data và
  WriteAuditLogRequest/Reply đối chiếu source hiện có.
- Review Focus: năm rủi ro đều gắn named check và owning task; E2E không bị thay bằng
  fixture capture hoặc health.
- Proportion: chỉ thêm một file harness; giữ task theo deliverable review được, không
  thêm framework, abstraction hoặc toàn bộ implementation vào tài liệu.
