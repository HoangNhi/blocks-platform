# CatalogService Faculty Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xóa các chức năng Catalog đã bỏ, khôi phục build sau scaffold và giữ Faculty với nhãn nghiệp vụ Phòng ban.

**Architecture:** Giữ entity/context Faculty người dùng vừa scaffold làm đầu vào, không tạo lại database hoặc model cũ. Xóa các domain backend và Catalog gRPC server; giữ client SystemService cho phân quyền/audit. Frontend gỡ bốn màn hình, lọc menu tại sidebar và giữ các module còn được business import.

**Tech Stack:** .NET 8, EF Core 8.0.22, Pomelo 8.0.3, ASP.NET Core, PowerShell, React 19, TypeScript, TanStack Query, Vitest và Testing Library có sẵn.

**Spec:** `docs/superpowers/specs/2026-10-22-catalogservice-faculty-only-design.md`, bản đã duyệt tại commit `504fd4d`.

**Source Baseline:** HEAD `4988f13`; scaffold và SQL lịch sử đã được snapshot trong `e92415a`. Các thay đổi FileService ở `4988f13` nằm ngoài phạm vi. Khi rà soát plan, working tree chỉ còn file plan mới; mô tả scaffold dirty trong spec là trạng thái trước hai commit này.

## Global Constraints

- Giữ `Faculty`, đổi tên nghiệp vụ từ Khoa thành Phòng ban.
- Giữ nguyên database `catalog`, bảng thực `faculty` và toàn bộ dữ liệu.
- Không thực hiện thêm DDL/DML cho Catalog trong bước xóa chức năng.
- Không chạy lại SQL DROP, không scaffold lại và không sửa schema để chữa lỗi build.
- Giữ `DateTime` không nullable cho `Faculty.CreatedAt`, `ToTable("faculty")` và tám tên cột snake_case của scaffold mới.
- Giữ `/api/Faculty/...`, `/faculty`, khóa quyền `faculty`, payload và query key `faculties`; không đổi thành `Department`.
- Giữ JWT, quyền ADD/UPDATE/DELETE, chính sách đọc hiện có, audit và envelope `Success`, `StatusCode`, `Data`, `Message`.
- Giữ phiên bản EF Core 8.0.22 và Pomelo 8.0.3; không nâng dependency hoặc thêm framework kiểm thử.
- Giữ client `system.proto`, `audit.proto`, gRPC-Web client handler và `GrpcJwtInterceptor`.
- Không sửa AppHost, API Gateway, FileService, Shared hoặc ServiceDefaults; không phục hồi BusinessService/CollabService.
- Không xóa màn hình business hoặc giả lập backend để che việc API Catalog cũ không còn.
- Không sửa quyền của role, xóa Menu/Permission hoặc cập nhật SQL trực tiếp trong SystemService.
- Không expose/commit credentials, connection strings, tokens hoặc dump dữ liệu.
- Chỉ chạy CRUD kiểm thử trên môi trường cô lập được người dùng cho phép; không chạy trên `blocks_catalog_dev`.
- Giữ mọi thay đổi có sẵn. Không dùng `git add .`, `git reset --hard` hoặc `git checkout --`.

## Review Focus

1. JWT thiếu/sai và legacy route: giữ HTTP 200 với lỗi ứng dụng 401 cho Faculty; dùng JWT hợp lệ để chứng minh legacy route thật sự không còn. Test ở Task 1.
2. Scaffold đổi case/nullability: SQL phải nhắm `faculty`/snake_case, mapping DTO vẫn giữ UUID và `CreatedAt`; không tái tạo sáu entity. Test ở Task 1 và 2.
3. Menu cache cũ, controller khác hoa/thường và nhóm rỗng: ẩn đúng bốn mục ở mọi cấp mà không mất menu khác hoặc sửa permissions. Test ở Task 4.
4. Consumer business còn import module Catalog: frontend vẫn biên dịch, nhưng không ngụy tạo thành công cho HTTP tới endpoint đã bỏ. Test ở Task 3; xác nhận giới hạn khi nghiệm thu.
5. Menu Faculty không duy nhất, payload thiếu cờ hoặc audit chưa tới: không cập nhật nhầm ID/reset quyền; chỉ ghi nhận audit đạt khi tìm được log tương ứng. Test và điều kiện dừng ở Task 5.

---

## File Structure

Mọi đường dẫn tính từ repository root. Thư mục trong danh sách xóa chỉ gồm file thuộc domain được nêu, không bao gồm thư mục cha dùng chung.

| File hoặc nhóm | Trách nhiệm sau thay đổi | Task |
| --- | --- | --- |
| `src/services/Blocks.CatalogService/Entities/Faculty.cs` | Giữ nguyên scaffold, `CreatedAt` required. | 1 |
| `src/services/Blocks.CatalogService/Infrastructure/Data/CatalogContext.cs` | Giữ nguyên scaffold chỉ có `Faculties`. | 1 |
| Bốn controller và các thư mục domain backend trong Task 1 | Xóa toàn bộ chức năng cũ. | 1 |
| `src/services/Blocks.CatalogService/Program.cs` | Chỉ bỏ host Catalog gRPC; giữ pipeline REST/auth/audit. | 1 |
| `src/services/Blocks.CatalogService/Configs/ConfigService.cs` | Bỏ `AddGrpc`, giữ các client System/audit và cấu hình còn dùng. | 1 |
| `src/services/Blocks.CatalogService/Blocks.CatalogService.csproj` | Bỏ protobuf/server package hết dùng, giữ client và phiên bản. | 1 |
| `test/CatalogService.Removal.Check.ps1` | Check nguồn/đường dẫn/contract bị xóa, không truy cập DB. | 1 |
| `test/CatalogService.CleanupChecks/CatalogService.CleanupChecks.csproj` | Console `net8.0`, FrameworkReference `Microsoft.AspNetCore.App`, ProjectReference CatalogService; không thêm package. | 1 |
| `test/CatalogService.CleanupChecks/Program.cs` | Assert model/SQL, Swagger, auth envelope và mapping, không framework test. | 1, 2 |
| `src/services/Blocks.CatalogService/Services/CoreFeature/Faculty/FacultyService.cs` | Chỉ đổi thông báo trùng tên. | 2 |
| `src/services/Blocks.CatalogService/DTOs/CoreFeature/Faculty/Requests/FacultyRequest.cs` | Chỉ đổi thông báo validation. | 2 |
| `src/apps/Blocks.Web/src/features/catalog/routes/Faculty/columns.tsx`, `src/apps/Blocks.Web/src/features/catalog/routes/Faculty/PopupFaculty.tsx` | Đổi chuỗi Phòng ban, giữ hành vi/payload. | 2 |
| `src/apps/Blocks.Web/src/features/catalog/routes/Faculty/Faculty.test.tsx` | Kiểm tra cột, popup, validation và payload. | 2 |
| `src/apps/Blocks.Web/src/Router.tsx`, `src/apps/Blocks.Web/src/Router.catalog.test.ts` | Gỡ đúng bốn route; check cấu trúc bằng TypeScript parser có sẵn. | 3 |
| Các module frontend liệt kê tại Task 3 | Xóa phần độc lập; giữ dependencies của business. | 3 |
| `src/apps/Blocks.Web/src/components/layout/MainLayout/app-sidebar.tsx`, `src/apps/Blocks.Web/src/components/layout/MainLayout/app-sidebar.test.tsx` | Lọc menu cũ và nhóm rỗng; kiểm tra hành vi render thật. | 4 |
| `AGENTS.md` | Chỉ cập nhật mô tả Catalog và lệnh check mới, giữ chỉnh sửa FileService đang có. | 5 |
| Spec và plan hiện tại | Ghi trạng thái nghiệm thu, không sửa lịch sử DROP thành việc cần chạy. | 5 |

### Đầu vào và điều kiện trước thực thi

- [ ] Đọc `AGENTS.md`, spec và plan; kiểm tra `git status --short` và HEAD. Giữ snapshot scaffold `e92415a` và các commit FileService đã có, không revert hoặc gộp lại chúng vào commit Catalog.
- [ ] Dùng `superpowers:using-git-worktrees` khi bắt đầu thực thi. Nếu tạo worktree mới, dùng HEAD hiện tại có snapshot `e92415a`, không dùng mốc source ban đầu bảy DbSet. Nếu xuất hiện thay đổi scaffold chưa commit mới hơn, mang đúng patch liên quan đã review sang; không chuyển thay đổi ngoài Catalog.
- [ ] Lưu hash hai file scaffold trong phiên làm việc để so sánh sau Task 1; không lưu nội dung cấu hình bí mật. Hai file này đã được snapshot nên bình thường không cần xuất hiện trong commit Task 1.
- [ ] Ghi baseline bằng build trực tiếp CatalogService. Spec đã ghi 123 lỗi/38 cảnh báo; nếu kết quả hiện tại khác, dùng log mới, không ép số lỗi về baseline cũ.
- [ ] Nếu chưa có frontend dependencies, chạy `npm --prefix src/apps/Blocks.Web ci`. Chạy build/lint/test frontend trước sửa để ghi baseline riêng; không sửa lỗi ngoài phạm vi hoặc thay `package-lock.json`.
- [ ] Xác nhận không có writer/startup tự chạy SQL lịch sử. Không dùng full-solution/AppHost làm điều kiện đạt.

## Task 1: Xóa backend cũ và khôi phục build Faculty-only

**Files:**
- Create/Test: `test/CatalogService.Removal.Check.ps1`.
- Create/Test: `test/CatalogService.CleanupChecks/CatalogService.CleanupChecks.csproj`, `test/CatalogService.CleanupChecks/Program.cs`.
- Modify: `src/services/Blocks.CatalogService/Program.cs`, `src/services/Blocks.CatalogService/Configs/ConfigService.cs`, `src/services/Blocks.CatalogService/Blocks.CatalogService.csproj`.
- Preserve: `src/services/Blocks.CatalogService/Entities/Faculty.cs`, `src/services/Blocks.CatalogService/Infrastructure/Data/CatalogContext.cs`.
- Delete: `src/services/Blocks.CatalogService/Controllers/FileTypeController.cs`, `src/services/Blocks.CatalogService/Controllers/StakeholderController.cs`, `src/services/Blocks.CatalogService/Controllers/StandardController.cs`, `src/services/Blocks.CatalogService/Controllers/StandardSetController.cs`.
- Delete: toàn bộ file dưới `src/services/Blocks.CatalogService/Services/CoreFeature/FileType/`, `src/services/Blocks.CatalogService/Services/CoreFeature/Stakeholder/`, `src/services/Blocks.CatalogService/Services/CoreFeature/Standard/`, `src/services/Blocks.CatalogService/Services/CoreFeature/StandardSet/`.
- Delete: toàn bộ file dưới `src/services/Blocks.CatalogService/DTOs/CoreFeature/FileType/`, `src/services/Blocks.CatalogService/DTOs/CoreFeature/Stakeholder/`, `src/services/Blocks.CatalogService/DTOs/CoreFeature/Standard/`, `src/services/Blocks.CatalogService/DTOs/CoreFeature/StandardSet/`; Standard bao gồm DTO Criterion/Requirement.
- Delete: `src/services/Blocks.CatalogService/Entities/Criterion.cs`, `src/services/Blocks.CatalogService/Entities/CriterionRequirement.cs`, `src/services/Blocks.CatalogService/Entities/FileType.cs`, `src/services/Blocks.CatalogService/Entities/Stakeholder.cs`, `src/services/Blocks.CatalogService/Entities/Standard.cs`, `src/services/Blocks.CatalogService/Entities/StandardSet.cs`.
- Delete: `src/services/Blocks.CatalogService/Services/gRPC/CatalogGrpcService.cs`, `src/services/Blocks.CatalogService/Protos/catalog.proto`.
- Delete if unused: `src/services/Blocks.CatalogService/DTOs/Common/CommonEnum.cs`.

**Interfaces:**
- Consumes: `CatalogContext(DbContextOptions<CatalogContext> options)`, `DbSet<Faculty> Faculties`, scaffold hiện tại.
- Produces: CatalogService biên dịch, sáu REST endpoint Faculty nguyên trạng, không có Catalog gRPC server.
- Produces: `& ./test/CatalogService.Removal.Check.ps1`; console mode `contract` và `runtime`, exit 0 khi mọi assert đạt, exit khác 0 khi có lỗi.
- Harness dùng `static void Require(bool condition, string message)`, `void RunContractChecks()` và `Task RunRuntimeChecksAsync()` trong `Program.cs`; mode không hợp lệ phải fail. Không tạo test framework hoặc helper library dùng chung.

- [ ] **Step 1: Viết check nguồn thất bại trước khi xóa**

Theo mẫu `test/SystemService.BusinessDependency.Check.ps1`: resolve root từ `$PSScriptRoot`, parse `.csproj` bằng `[xml]`, chỉ scan `.cs/.csproj/.proto`, loại `bin/obj`. Dùng assert ném exception khi không đạt, với các điều kiện:

```powershell
# $catalogDir, $program, $config và $protos được đọc từ đúng CatalogService.
if (Test-Path (Join-Path $catalogDir 'Controllers\FileTypeController.cs')) {
    throw 'Retired controller remains: FileType'
}
if ($program -match 'MapGrpcService<CatalogGrpcService>|UseGrpcWeb') {
    throw 'Catalog gRPC server remains'
}
if ($config -notmatch 'AuditInterceptor' -or $config -notmatch 'AuditActionFilter') {
    throw 'Audit registration missing'
}
```

Mở rộng assert thành đủ bốn controller, sáu entity, bốn thư mục service/DTO, `catalog.proto`, `AddGrpc()` và reference `CatalogProto`. Assert hai client protobuf còn `GrpcServices="Client"` và đường dẫn tồn tại; assert hai đăng ký `AddGrpcClient` cùng audit filter/interceptor vẫn còn. Check nguồn không được đọc `appsettings` hoặc `.codex/.env`.

- [ ] **Step 2: Chạy check để chứng minh đỏ**

Run: `& ./test/CatalogService.Removal.Check.ps1`.
Expected: FAIL vì controller/service/gRPC cũ còn tồn tại. Build CatalogService cũng đang fail; đây không phải lý do thêm lại DbSet.

- [ ] **Step 3: Xóa đúng domain và registration đã liệt kê**

Bỏ Catalog server mapping/usings, `AddGrpc()`, protobuf server item và `Folder Include="Services\gRPC\"` đã rỗng. Bỏ `Grpc.AspNetCore`, `Grpc.AspNetCore.Web` khi không còn caller server; giữ `Grpc.Tools`, `Google.Protobuf`, `Grpc.Net.ClientFactory`, `Grpc.Net.Client.Web` cho client đang dùng. Xóa enum/using hết caller; giữ các converter ngày tháng và cấu hình chung còn dùng.

Giữ nguyên sáu endpoint Faculty, JWT, filter/interceptor, CORS, health, telemetry và exception middleware. So hash hai file scaffold với đầu vào. Với thao tác xóa đệ quy, kiểm tra đường dẫn tuyệt đối thuộc đúng thư mục domain được phép trước; dùng một shell PowerShell, không purge thư mục cha.

- [ ] **Step 4: Thêm check model và runtime không kết nối DB**

Console harness lấy mẫu assert/loopback Kestrel từ `test/SystemService.CleanupChecks/Program.cs`, không reference project SystemService `net10.0`. `contract` dựng context riêng bằng Pomelo với server version cố định `new MySqlServerVersion(new Version(8, 0, 0))` chỉ cho SQL fixture; không gọi `AutoDetect`, `OpenConnection`, `EnsureCreated`, migration hoặc `SaveChanges`.

```csharp
var entity = db.Model.FindEntityType(typeof(Faculty))!;
Require(db.Model.GetEntityTypes().Count() == 1, "Only Faculty is mapped");
Require(entity.GetTableName() == "faculty", "Lowercase faculty table retained");
Require(!entity.FindProperty(nameof(Faculty.CreatedAt))!.IsNullable, "CreatedAt is required");
var sql = db.Faculties.Where(x => !x.IsDeleted).ToQueryString();
Require(sql.Contains("`faculty`") && sql.Contains("`is_deleted`"), "Scaffold SQL retained");
```

Assert đủ tám tên cột, `Guid Id`, `CURRENT_TIMESTAMP`, timestamp, charset/collation như scaffold. Dùng EF metadata thay vì chỉ tìm chuỗi source.

`runtime` dựng host fixture loopback port 0, content root tạm, xóa nguồn cấu hình rồi chỉ dùng cấu hình test trong bộ nhớ: JWT key sinh trong test, issuer/audience `catalogservice-cleanup-checks`, MySQL/SystemService localhost port 1 không tồn tại. Dùng `ExecuteConfigService`, `ExecuteConfigAuthentication`, MVC application part chứa `FacultyController`, audit filter, exception middleware, Swagger và pipeline auth giống production. Không thay auth hoặc service Faculty bằng fake.

Không resolve `CatalogContext` qua production DI trong mode này: options production gọi `ServerVersion.AutoDetect`. Model test dùng context riêng ở trên; route đã bỏ và request unauthorized không được mở kết nối DB.

Test `faculty_missing_invalid_expired_jwt_keeps_401_envelope`: GET `/api/Faculty/get-all-combobox` với token thiếu, sai chữ ký, hết hạn phải HTTP 200, `Success=false`, `StatusCode=401`. Test `retired_routes_are_404_with_valid_jwt`: JWT đúng chữ ký gửi GET `/api/FileType/get-all-combobox`, `/api/Stakeholder/get-all-combobox`, `/api/Standard/get-all-combobox`, `/api/StandardSet/get-all-combobox`, expected HTTP 404. Swagger chỉ có sáu route Faculty trong controller nghiệp vụ, không có bốn controller cũ; kiểm kê endpoint không có Catalog RPC. Dừng/dispose host và dọn fixture trong `finally`.

- [ ] **Step 5: Chạy kiểm tra xanh**

```powershell
& ./test/CatalogService.Removal.Check.ps1
dotnet build src/services/Blocks.CatalogService/Blocks.CatalogService.csproj
dotnet run --project test/CatalogService.CleanupChecks -- contract
dotnet run --project test/CatalogService.CleanupChecks -- runtime
```

Expected: source check PASS, build không còn error, cả hai mode exit 0 và không mở DB. Ghi cảnh báo baseline riêng; không nâng AutoMapper 16.0.0 trong task này.

- [ ] **Step 6: Commit phần backend và checks**

Review `git diff`, stage chỉ file Catalog/checks của task; hai file scaffold đã có commit đầu vào phải giữ nguyên. Không stage FileService, AGENTS hoặc SQL lịch sử. Kiểm tra `git diff --cached --name-only`.
Commit: `git commit -m "refactor(catalog): remove retired domains and grpc server"`.

## Task 2: Đổi nhãn Phòng ban và giữ hợp đồng Faculty

**Files:**
- Modify: `src/services/Blocks.CatalogService/Services/CoreFeature/Faculty/FacultyService.cs`.
- Modify: `src/services/Blocks.CatalogService/DTOs/CoreFeature/Faculty/Requests/FacultyRequest.cs`.
- Modify: `test/CatalogService.CleanupChecks/Program.cs`.
- Modify: `src/apps/Blocks.Web/src/features/catalog/routes/Faculty/columns.tsx`, `src/apps/Blocks.Web/src/features/catalog/routes/Faculty/PopupFaculty.tsx`.
- Create/Test: `src/apps/Blocks.Web/src/features/catalog/routes/Faculty/Faculty.test.tsx`.

**Interfaces:**
- Consumes: Task 1 build; `FacultyRequestValidator`, `FacultyProfile`, `ModelFaculty`; `getColumns(showPopupDetail, deleteList): ColumnDef<Faculty>[]`.
- Consumes: `PopupFaculty({ faculty, isOpen, onOpenChange, saveChange })`, với `saveChange(faculty: Faculty, isAddMore: boolean): void`.
- Produces: chỉ đổi thông báo và nhãn; contract `Id/Name/IsEdit/IsActived`, query key, route và method service không đổi.
- Produces: mở rộng mode `contract` của Task 1, không thêm mode mới.

- [ ] **Step 1: Viết assert validation/mapping và test giao diện**

Trong console harness, thêm `faculty_empty_name_uses_department_message` và `faculty_mapping_keeps_uuid_and_nullable_dto_created_at`. Tạo mapper với `FacultyProfile` và `NullLoggerFactory.Instance`; chỉ test map thực dùng, không sửa profile để vượt toàn bộ `AssertConfigurationIsValid` của mapping cũ.

```csharp
var validation = new FacultyRequestValidator().Validate(new FacultyRequest { Name = "" });
Require(validation.Errors.Any(e => e.ErrorMessage == "Tên phòng ban không được để trống"),
    "Department validation copy retained");
var dto = mapper.Map<ModelFaculty>(faculty);
Require(dto.Id == faculty.Id && dto.CreatedAt == faculty.CreatedAt, "Identity and timestamp retained");
Require(typeof(ModelFaculty).GetProperty("CreatedAt")!.PropertyType == typeof(DateTime?),
    "DTO nullability unchanged");
```

Frontend dùng Testing Library/`fireEvent` sẵn có, render popup thật. Test tên `faculty_uses_department_copy_and_unchanged_payload`:

```tsx
const saveChange = vi.fn();
render(<PopupFaculty faculty={null} isOpen onOpenChange={vi.fn()} saveChange={saveChange} />);
expect(screen.getByRole("heading", { name: "Thêm mới Phòng ban" })).toBeInTheDocument();
fireEvent.click(screen.getByRole("button", { name: "Lưu" }));
expect(await screen.findByText("Tên phòng ban không được để trống")).toBeInTheDocument();
expect(saveChange).not.toHaveBeenCalled();
```

Thêm assert header `Name` bằng `"Tên phòng ban"` từ `getColumns`; popup edit dùng `"Cập nhật Phòng ban"`. Điền tên rồi lưu để assert payload vẫn có `Id` UUID, `Name`, `IsEdit`, `IsActived` và `isAddMore=false`; nút `"Lưu và thêm tiếp"` truyền `true`. Không gọi API thật trong Vitest.

- [ ] **Step 2: Chạy test đỏ**

Run: `dotnet run --project test/CatalogService.CleanupChecks -- contract`.
Run: `npm --prefix src/apps/Blocks.Web test -- src/features/catalog/routes/Faculty/Faculty.test.tsx`.
Expected: fail vì thông báo/header/title còn `"Khoa"`; check model/mapping vẫn đạt.

- [ ] **Step 3: Thay đúng chuỗi, không đổi logic**

Backend đổi `"Tên khoa đã tồn tại"` thành `"Tên phòng ban đã tồn tại"` ở cả Insert/Update; validator dùng `"Tên phòng ban không được để trống"`.
Frontend đổi header, label `"Tên phòng ban"`, validation và hai title nêu trên. Không sửa UUID assignment, `DateTime.UtcNow`, soft-delete, mapper, DTO, API/hooks/query invalidation hoặc kiểu `CreatedAt`.

- [ ] **Step 4: Chạy xanh và build**

Run lại hai lệnh Step 2, thêm `dotnet build src/services/Blocks.CatalogService/Blocks.CatalogService.csproj`.
Expected: exit 0; UI/validation test đạt. Trùng tên backend được kiểm tra qua service thật trên môi trường cô lập ở Task 5, không kết nối DB thật trong `contract`.

- [ ] **Step 5: Commit**

Stage chỉ hai file backend, hai file UI và hai file test của task.
Commit: `git commit -m "feat(catalog): relabel faculty as departments"`.

## Task 3: Gỡ màn hình cũ nhưng giữ dependencies của business

**Files:**
- Modify: `src/apps/Blocks.Web/src/Router.tsx`.
- Create/Test: `src/apps/Blocks.Web/src/Router.catalog.test.ts`.
- Delete: toàn bộ file trong `src/apps/Blocks.Web/src/features/catalog/routes/FileType/`, `src/apps/Blocks.Web/src/features/catalog/routes/Stakeholder/`, `src/apps/Blocks.Web/src/features/catalog/routes/Standard/`, `src/apps/Blocks.Web/src/features/catalog/routes/StandardSet/`.
- Delete: `src/apps/Blocks.Web/src/features/catalog/hooks/useFileType.ts`, `src/apps/Blocks.Web/src/features/catalog/hooks/useStakeholder.ts`, `src/apps/Blocks.Web/src/features/catalog/hooks/useStandard.ts`, `src/apps/Blocks.Web/src/features/catalog/hooks/useStandardSet.ts`, `src/apps/Blocks.Web/src/features/catalog/hooks/useCriterionRequirements.ts`, `src/apps/Blocks.Web/src/features/catalog/hooks/useStandardCriteria.ts` sau khi đối chiếu lại caller.
- Delete: `src/apps/Blocks.Web/src/features/catalog/api/stakeholder.api.ts`.
- Preserve: các API/types/hooks/components còn caller được liệt kê tại spec mục 6; cả `src/apps/Blocks.Web/src/constants/catalog.constants.ts` và endpoint constants còn dùng.

**Interfaces:**
- Consumes: default export `Router: FC`, module imports hiện có trong business.
- Produces: `/faculty` vẫn vào `FacultyPage`; `/filetype`, `/stakeholder`, `/standard`, `/standardset` không còn route/import.
- Produces: những API wrapper được giữ không thay URL hoặc giả response thành công.

- [ ] **Step 1: Viết test cấu trúc route và module giữ lại**

`Router.catalog.test.ts` dùng `// @vitest-environment node`, `node:fs`, `typescript` đã cài. Helper test-only `routePaths(source: string): string[]` duyệt JSX `Route` bằng TypeScript AST và đọc thuộc tính `path`; không regex JSX hoặc refactor Router chỉ để test.

```ts
const paths = routePaths(readFileSync(new URL("./Router.tsx", import.meta.url), "utf8"));
expect(paths).toContain("/faculty");
for (const retired of ["/filetype", "/stakeholder", "/standard", "/standardset"]) {
  expect(paths).not.toContain(retired);
}
expect(paths.filter((path) => !retiredPaths.includes(path)).sort()).toEqual(expectedKeptPaths.sort());
```

Trong test, định nghĩa `retiredPaths` là bốn đường dẫn trên; `expectedKeptPaths` là `["/login", "/survey/do-survey", "/", "/user", "/faculty", "/cycle", "/evidence", "/evidencecyclemap", "/systemgroup", "/menu", "/role", "/surveytemplate", "/surveycampaign", "/auditlog", "/criterionevaluation", "/sar", "/internalreview", "/externalreview", "/actionplan", "/taskexecution", "/unauthorized"]`.

Test `business_catalog_dependencies_remain` assert `existsSync` với: `api/filetype.api.ts`, `api/standard.api.ts`, `api/standardset.api.ts`, bốn file types, bốn hook options/criteria và hai component trong spec mục 6. Dùng tên cụ thể trong spec, không wildcard. Build frontend là check thực tế cho đồ thị import.

- [ ] **Step 2: Chạy test đỏ**

Run: `npm --prefix src/apps/Blocks.Web test -- src/Router.catalog.test.ts`.
Expected: fail vì bốn route vẫn hiện diện.

- [ ] **Step 3: Gỡ route và file hết caller**

Xóa đúng bốn import/Route trong Router và các file trong Files. Trước xóa hook orphan, chạy `rg` trên toàn frontend để chắc không có caller mới; nếu có, giữ file và ghi rõ vào báo cáo thay vì sửa business.
Giữ `stakeholder.types.ts`, không nhầm với `stakeholder.api.ts`. Không xóa wrappers/endpoint constants cho FileType/Standard/StandardSet hoặc `catalog.constants.ts` còn được business dùng.

- [ ] **Step 4: Chạy xanh và kiểm tra import**

Run lại Step 2; chạy `npm --prefix src/apps/Blocks.Web run build`.
Expected: route/module tests PASS, không có lỗi TypeScript mới do xóa file. So baseline trước Task 1; lỗi ngoài phạm vi phải được báo riêng, không chỉnh business để che lỗi. Không coi build đạt là business runtime đạt.

- [ ] **Step 5: Commit**

Stage chỉ Router, test và các file frontend bị xóa; kiểm tra danh sách staged không có business hoặc lockfile.
Commit: `git commit -m "refactor(web): remove retired catalog administration screens"`.

## Task 4: Ẩn menu cũ và nhóm rỗng trong sidebar

**Files:**
- Modify: `src/apps/Blocks.Web/src/components/layout/MainLayout/app-sidebar.tsx`.
- Create/Test: `src/apps/Blocks.Web/src/components/layout/MainLayout/app-sidebar.test.tsx`.
- Preserve: `src/apps/Blocks.Web/src/contexts/AuthContext.tsx`, `src/apps/Blocks.Web/src/components/layout/MainLayout/MainLayout.tsx`.

**Interfaces:**
- Consumes: `useAuth()` cung cấp `menu`, `systemGroup`, `permissions`, `user`; menu chứa `Controller`, `SystemGroupId`, `Name`, `Id`.
- Produces: cùng export `AppSidebar(props: React.ComponentProps<typeof Sidebar>)`; chỉ lọc tập menu phục vụ render, không mutate context.

- [ ] **Step 1: Viết test render sidebar thật**

Helper test-only `renderSidebar(menu, systemGroup, pathname): RenderResult` dùng `MemoryRouter` + `SidebarProvider`; mock `useAuth` bằng fixtures frozen và `useIsMobile` trả `false`, không mock chính `AppSidebar`. Mở từng Collapsible bằng `fireEvent.click` trước khi assert các link bên trong.

```tsx
expect(screen.queryByRole("link", { name: "Loại tài liệu" })).not.toBeInTheDocument();
expect(screen.getByRole("link", { name: "Phòng ban" })).toHaveAttribute("href", "/faculty");
expect(screen.getByRole("link", { name: "Người dùng" })).toHaveAttribute("href", "/user");
expect(screen.getByRole("link", { name: "Phòng ban" })).toHaveAttribute("data-active", "true");
expect(screen.queryByText("Nhóm chỉ có danh mục cũ")).not.toBeInTheDocument();
expect(authState.permissions).toEqual(originalPermissions);
```

Test riêng `cached_retired_controllers_are_hidden_case_insensitively`: fixture cũ có đủ bốn controller, gồm `"FileType"`/`"STANDARDSET"`, đặt ở menu trực tiếp và nhóm con. Test `empty_roots_and_subgroups_disappear_but_mixed_groups_remain`: gốc chỉ chứa nhóm con bị lọc, nhóm con rỗng, nhóm trộn Faculty/User và menu có `IsShowMenu=false` không thuộc bốn khóa. Menu không bị retire phải giữ hành vi cũ dù `IsShowMenu=false`. Test `remaining_link_keeps_active_state` và trường hợp mảng rỗng không crash.

- [ ] **Step 2: Chạy test đỏ**

Run: `npm --prefix src/apps/Blocks.Web test -- src/components/layout/MainLayout/app-sidebar.test.tsx`.
Expected: fail vì menu cũ hoặc header nhóm rỗng vẫn render.

- [ ] **Step 3: Lọc tại sidebar, không đổi AuthContext**

Dùng tập bốn khóa `filetype`, `stakeholder`, `standard`, `standardset`, so khớp `Controller?.toLowerCase()`. Từ tập menu đã lọc, tính direct menus, submenu, `hasChildren` và active state; root chỉ sống khi có direct menu còn giữ hoặc subgroup có menu còn giữ. Không thêm helper module/export/abstraction cho việc lọc này; không thêm bộ lọc `IsShowMenu` tổng quát.

- [ ] **Step 4: Chạy xanh**

Run lại Step 2, chạy `npm --prefix src/apps/Blocks.Web run build`.
Expected: các fixture đều PASS, link/active state còn đúng, context/permissions không bị sửa.

- [ ] **Step 5: Commit**

Stage đúng sidebar và test.
Commit: `git commit -m "fix(web): hide retired catalog menus and empty groups"`.

## Task 5: Đổi metadata menu và nghiệm thu có kiểm soát

**Files:**
- Modify: `AGENTS.md` chỉ hàng CatalogService và lệnh chạy check mới.
- Modify: spec/plan hiện tại chỉ trạng thái, checklist và bằng chứng kiểm tra.
- Reference only: `src/services/Blocks.SystemService/Controllers/MenuController.cs`, `src/services/Blocks.SystemService/DTOs/CoreFeature/Menu/Requests/MenuRequest.cs`, `src/services/Blocks.SystemService/Controllers/AuditLogController.cs`.
- Reference only: `src/apps/Blocks.Web/src/features/system/api/menu.api.ts`, `src/apps/Blocks.Web/src/features/system/types/menu.types.ts`.
- Không sửa code SystemService, không viết script SQL cập nhật menu.

**Interfaces:**
- Consumes: artifact Tasks 1–4; admin session có VIEW/UPDATE cho `menu` và VIEW cho `auditlog`; endpoint SystemService đã xác minh.
- Consumes: `POST /api/Menu/get-list`, `GET /api/Menu/get-by-id?Id=...`, `PUT /api/Menu/update`; response envelope hiện có.
- Produces: đúng một menu Faculty có `Name="Phòng ban"`; ID/controller/group/sort/flags và Permission giữ nguyên; kết quả kiểm tra phân biệt PASS/FAIL/NOT RUN.

- [ ] **Step 1: Chuẩn bị điều kiện kiểm thử tích hợp và điều kiện dừng**

Chỉ thực hiện CRUD khi người dùng cho phép môi trường cô lập: MySQL localhost tên `blocks_catalogservice_cleanup_test` đã có schema `faculty` khớp scaffold; SystemService dùng database test riêng, có user chỉ đọc và user đủ quyền Faculty cùng JWT/gRPC cấu hình tương ứng. Xác minh connection thực của từng host trước request ghi, không suy từ tên source MCP hoặc URL localhost.

Không dùng `blocks_catalog_dev`, `blocks_system_dev` hoặc tự tạo/drop/seed DB khi chưa được cho phép. Thiếu môi trường/tài khoản thì ghi `NOT RUN`, không chạy trên DB ứng dụng, không tuyên bố đủ nghiệm thu runtime và không bỏ qua bảo vệ.

- [ ] **Step 2: Kiểm tra Faculty qua HTTP thật trên môi trường cô lập**

Dùng PowerShell `Invoke-WebRequest`/`Invoke-RestMethod` và headers từ session hoặc biến môi trường, không in token. Các assert dưới đây là kiểm thử tích hợp, không thay production gRPC client bằng mock:

```powershell
if (-not $insert.Success) { throw 'Faculty insert failed' }
if ($insert.Data.Id -ne $fixtureId) { throw 'Faculty UUID changed' }
if ($duplicate.Success -or $duplicate.Message -ne 'Tên phòng ban đã tồn tại') {
    throw 'Duplicate department name contract changed'
}
if ($denied.Success -or $denied.StatusCode -ne 403) { throw 'Faculty write permission bypassed' }
```

Tạo `$fixtureId` bằng `[guid]::NewGuid()`, tên riêng có cùng suffix UUID, trạng thái active; ghi thời điểm trước request. Tạo thêm record đối chứng với UUID và tên khác để test Update trùng tên record khác, không nhầm với Update giữ nguyên tên của chính nó.

Dùng sáu endpoint trong spec: insert, get-by-id, get-list với `PageIndex=1`, `PageSize=10`, `TextSearch` bằng tên fixture, combobox, update rồi delete-list. Assert chỉ fixture xuất hiện khi search; đổi tên, deactivate/reactivate để check combobox; list sau soft-delete không trả fixture. Qua SELECT hẹp trên DB test, assert dòng còn tồn tại với `is_deleted=1`, UUID/audit fields/timestamp đúng; không thay bằng DELETE vật lý. Trong `finally`, soft-delete đúng hai UUID do test tạo qua API, không xóa theo tên hoặc xóa dữ liệu test khác.

Kiểm tra Insert và Update trùng tên dùng thông báo chính xác nêu trên; empty/null `Name` trả `"Tên phòng ban không được để trống"`. Token user chỉ đọc vẫn đọc được nhưng không ghi; token đúng của user đủ quyền ghi được. Không token/sai token giữ envelope Task 1; HTTP status đơn lẻ không chứng minh ứng dụng thành công.

- [ ] **Step 3: Xác minh audit thật, không dựa vào HTTP thành công**

Qua `POST /api/AuditLog/get-list` của SystemService test, lọc `ServiceName="CatalogService"`, `EntityName="Faculty"`, `UserId` fixture, action CREATE/UPDATE/DELETE, rồi đối chiếu `EntityId`, thời điểm và giá trị riêng của fixture. Poll tối đa 30 giây với khoảng 1 giây vì interceptor gửi gRPC bất đồng bộ. Expected: audit thành công chỉ sau save; duplicate request qua action filter có `IsSuccess=false` và thông báo trùng tên. Với log thất bại, đối chiếu `NewValues` và thời điểm thay vì yêu cầu `EntityId` vì filter hiện gửi chuỗi rỗng. Không đòi audit cho request bị authorization chặn trước filter.

Không có log trong timeout thì FAIL/điều tra gRPC; không đổi audit sang no-op, không nới quyền, không tăng timeout vô hạn. Dừng host kiểm thử sau khi poll xong, không tắt ngay sau response và kết luận audit mất.

- [ ] **Step 4: Xác định duy nhất menu Faculty trước khi ghi**

Đối với metadata menu ứng dụng, dùng admin API đã được spec cho phép, không dùng CRUD fixture Catalog ở Step 2. `POST /api/Menu/get-list` với `PageIndex=1`, `PageSize=100`, `TextSearch=""`, đọc hết các trang theo `TotalRow`; sau đó lọc `Controller` không phân biệt hoa/thường bằng `"faculty"`. Không giả định stored function tìm kiếm theo Controller khi truyền `TextSearch="faculty"`.

Expected: đúng một target. Nếu 0 hoặc nhiều hơn 1, hoặc response không `Success=true`, dừng để người dùng xác định ID; không chọn phần tử đầu tiên:

```powershell
if (@($facultyMatches).Count -ne 1) { throw 'Faculty menu ID is ambiguous or missing' }
```

Đọc đủ record bằng `GET /api/Menu/get-by-id?Id=...`, snapshot nội bộ các field giữ nguyên và snapshot quyền hiện tại; không ghi snapshot có token hoặc dữ liệu cá nhân vào Git.

- [ ] **Step 5: Đổi đúng Name qua API và đọc lại**

Payload `MenuRequest` lấy nguyên `Id`, `Controller`, `SystemGroupId`, `Sort`, `IsActived`, `IsEdit`, `CanView`, `CanAdd`, `CanUpdate`, `CanDelete`, `CanApprove`, `CanAnalyze`, `IsShowMenu`; chỉ đặt `Name="Phòng ban"`. Không bỏ `IsActived` hoặc các bool vì default có thể reset trạng thái.

Gọi `PUT /api/Menu/update`, assert HTTP 200, `Success=true`, `StatusCode=200`, `Data.Name="Phòng ban"`; GET lại để assert tất cả field giữ nguyên ngoài `Name` và `UpdatedAt`/`UpdatedBy` do API tự cập nhật. Nếu Name đã đúng, không PUT lại nhưng vẫn đọc/kiểm tra trạng thái. Không sửa bốn menu retire hoặc Permission.

```powershell
$preservedFields = @('Id', 'Controller', 'SystemGroupId', 'Sort', 'IsActived', 'IsEdit',
    'CanView', 'CanAdd', 'CanUpdate', 'CanDelete', 'CanApprove', 'CanAnalyze', 'IsShowMenu')
foreach ($field in $preservedFields) {
    if ($after.Data.$field -ne $before.Data.$field) { throw "Menu field changed: $field" }
}
```

Kiểm tra log `EntityName="Menu"`, action UPDATE của ID vừa đổi qua API audit với user đủ quyền. Đăng xuất/đăng nhập lại; kiểm tra sidebar và breadcrumb hiện Phòng ban. F5 không thay bước đăng nhập lại vì cache AuthContext.

- [ ] **Step 6: Chạy nghiệm thu tổng và ghi giới hạn**

```powershell
& ./test/CatalogService.Removal.Check.ps1
dotnet build src/services/Blocks.CatalogService/Blocks.CatalogService.csproj
dotnet run --project test/CatalogService.CleanupChecks -- contract
dotnet run --project test/CatalogService.CleanupChecks -- runtime
npm --prefix src/apps/Blocks.Web run build
npm --prefix src/apps/Blocks.Web run lint
npm --prefix src/apps/Blocks.Web test
git diff --check
```

Expected: check mới PASS và không có lỗi mới do thay đổi này. Ghi rõ lỗi baseline của toàn bộ frontend/lint thay vì âm thầm sửa ngoài phạm vi. Không coi auth fail ở legacy API là bằng chứng route đã xóa.

Nếu cần xác minh DB ứng dụng, chỉ metadata read-only nguồn `blocks_catalog_dev`; không yêu cầu số dòng mãi bằng 10 hoặc coi checksum lịch sử là checksum hiện tại. Không chạy SQL lịch sử.

Khi cần kiểm tra UI, dùng Vite với cấu hình `VITE_API_URL` đúng môi trường; chạy `npm --prefix src/apps/Blocks.Web run dev` trên port trống và báo URL. Kiểm tra desktop/mobile, popup, sidebar direct/subgroup và menu cache cũ. Ghi rõ business còn gọi retired API sẽ không hoạt động; không fake API hoặc tuyên bố toàn hệ thống đạt.

- [ ] **Step 7: Cập nhật tài liệu và commit có giới hạn**

Đổi mô tả Catalog trong `AGENTS.md` thành chỉ quản lý Phòng ban/Faculty, thêm ba lệnh check backend mới. Giữ mọi thay đổi FileService có sẵn trong guide. Cập nhật trạng thái spec/checkbox plan và ghi các mục PASS/FAIL/NOT RUN, kể cả metadata/integration chưa chạy.

Stage chỉ tài liệu của task. Nếu `AGENTS.md` xuất hiện thay đổi ngoài Catalog trong lúc thực thi, chỉ stage patch riêng của Catalog bằng `git apply --cached` sau review; nếu không tách được, để file unstaged và báo rõ, không stage cả file. Không đưa lại các thay đổi FileService đã commit vào commit mới. Kiểm tra `git diff --cached --name-only` và nội dung staged.
Commit: `git commit -m "docs(catalog): record faculty-only cleanup verification"`.

## Completion Gate

- [ ] Task 1–4 có kiểm tra đỏ/xanh và commit đúng phạm vi; scaffold Faculty/context không bị ghi đè.
- [ ] Không còn bốn controller, sáu entity hoặc Catalog server proto/DI registration cũ.
- [ ] Phòng ban giữ đủ sáu endpoint, quyền, JSON contract, UUID, audit và soft-delete.
- [ ] Route/menu cũ không render; nhóm rỗng bị ẩn, các module business còn caller vẫn tồn tại.
- [ ] Menu Faculty đã đổi đúng ID qua API hoặc được ghi rõ còn BLOCKED do thiếu ID/quyền; chưa đổi menu không được ghi hoàn tất toàn bộ.
- [ ] CRUD/audit cô lập đã có kết quả hoặc được ghi NOT RUN với lý do; các kiểm tra này chưa chạy thì chưa đủ nghiệm thu runtime.
- [ ] Báo cáo nêu rõ cảnh báo/lỗi baseline, giới hạn business, file/commit đã đổi và mọi bước chưa thực hiện; không gắn nhãn thành công toàn hệ thống.

## Execution Handoff

Plan có năm task phụ thuộc tuần tự ở backend; frontend có thể làm sau khi contract Faculty đã cố định. Đề xuất **Native** để giảm chi phí/context và tránh nhiều worker chỉnh chung harness; một reviewer độc lập kiểm tra toàn nhánh cuối cùng. **Subagent-driven** phù hợp khi cần reviewer mới sau từng task và chấp nhận chi phí cao hơn.

Người dùng cần duyệt plan và chọn phương thức thực thi trước khi bắt đầu sửa code.
