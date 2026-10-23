# Backend .NET 10 Platform & Package Upgrade - Baseline & Tracking

Tài liệu này ghi lại kết quả thu thập baseline (Task 1) trước khi thực hiện nâng cấp package và target framework (Tasks 2–8) theo kế hoạch nâng cấp nền tảng backend.

---

## 1. Kết Quả Thu Thập Baseline (16 Lệnh Trước Nâng Cấp)

Các lệnh kiểm tra được thực thi trên nhánh sạch trước bất kỳ thay đổi nào về package hay target framework:

| # | Lệnh Thực Thi | Kết Quả Thực Tế | Ghi Chú Kỹ Thuật |
|---|---|---|---|
| 1 | `dotnet --info` | **PASS (Thành công)** | .NET SDK 10.0.100, Runtimes: Microsoft.AspNetCore.App 10.0.0, Microsoft.NETCore.App 10.0.0, OS: Windows 10 Home (10.0.19045) |
| 2 | `dotnet build Blocks.slnx` | **FAIL (Dự kiến)** | Lỗi `MSB3202`: Không tìm thấy project `Blocks.BusinessService.csproj` (đã chủ động lược bỏ khỏi repo, tham chiếu còn lại trong `Blocks.AppHost.csproj` theo `AGENTS.md`) |
| 3 | `dotnet build src/platform/Blocks.Shared/Blocks.Shared.csproj` | **PASS (Exit 0)** | Target `net8.0`, không lỗi, 0 warning |
| 4 | `dotnet build src/platform/Blocks.ServiceDefaults/Blocks.ServiceDefaults.csproj` | **PASS (Exit 0)** | Target `net8.0`, không lỗi, 0 warning |
| 5 | `dotnet build src/services/Blocks.ApiGateway/Blocks.ApiGateway.csproj` | **PASS (Exit 0)** | Target `net10.0`, không lỗi, 0 warning |
| 6 | `dotnet build src/services/Blocks.SystemService/Blocks.SystemService.csproj` | **PASS (Exit 0)** | Target `net10.0`, không lỗi, 0 warning |
| 7 | `dotnet build src/services/Blocks.CatalogService/Blocks.CatalogService.csproj` | **PASS (Exit 0)** | Target `net10.0`, 1 warning bảo mật NU1903 (`AutoMapper` 16.0.0) |
| 8 | `dotnet build src/services/Blocks.FileService/Blocks.FileService.csproj` | **PASS (Exit 0)** | Target `net8.0`, không lỗi, 0 warning |
| 9 | `powershell -File test/SystemService.BusinessDependency.Check.ps1` | **PASS (Exit 0)** | Xác nhận không còn mã nguồn hay tham chiếu trực tiếp đến `BusinessService` trong `SystemService` |
| 10 | `powershell -File test/CatalogService.Removal.Check.ps1` | **PASS (Exit 0)** | Xác nhận các controller / DTO đã dọn dẹp không còn hiện diện trong `CatalogService` |
| 11 | `dotnet list package --vulnerable --include-transitive` | **COMPLETED** | Phát hiện 1 lỗ hổng bảo mật mức High: `AutoMapper` 16.0.0 (GHSA-rvv3-g6hj-g44x) trong `CatalogService` |
| 12 | `dotnet run --project test/FileService.RemovalChecks -- all` | **PASS (Exit 0)** | 0 failure(s), 0 NOT RUN (kiểm tra toàn diện paths, sessions, lifecycle, transport, gateway, boundary, migration) |
| 13 | `dotnet run --project test/SystemService.CleanupChecks -- contract` | **PASS (Exit 0)** | System contract checks pass, 0 error |
| 14 | `dotnet run --project test/SystemService.CleanupChecks -- runtime` | **PASS (Exit 0)** | System runtime checks pass (EF/Npgsql SQL gen, startup, unauthorized envelope, Swagger) |
| 15 | `dotnet run --project test/CatalogService.CleanupChecks -- contract` | **PASS (Exit 0)** | Catalog contract checks pass (Oracle Faculty mapping, SQL translation, validation guards) |
| 16 | `dotnet run --project test/CatalogService.CleanupChecks -- runtime` | **PASS (Exit 0)** | Catalog runtime checks pass (DI resolution, health, JWT raw claims, 401/403 envelopes, Swagger) |

---

## 2. Snapshot 10 Project Trong Kho Mã Nguồn

| # | Project | Target Framework (TFM) | Loại Project | Dependencies Chính & Tham Chiếu Nội Bộ |
|---|---|---|---|---|
| 1 | `Blocks.Shared` | `net8.0` | Class Library | FluentValidation 11.9.2, Grpc.AspNetCore 2.67.0, AutoMapper 12.0.1, BCrypt.Net-Next 4.0.3 |
| 2 | `Blocks.ServiceDefaults` | `net8.0` | Class Library | OpenTelemetry (1.9.0/1.10.0), Microsoft.Extensions.ServiceDiscovery (8.2.2/9.0.0), Microsoft.Extensions.Http.Resilience (8.10.0/9.0.0) |
| 3 | `Blocks.ApiGateway` | `net10.0` | Web Service | Yarp.ReverseProxy 2.2.0, Tham chiếu: `Blocks.ServiceDefaults` |
| 4 | `Blocks.SystemService` | `net10.0` | Web Service | Npgsql.EntityFrameworkCore.PostgreSQL 10.0.0-preview.1, FluentValidation.AspNetCore 11.3.0, AutoMapper 12.0.1, Tham chiếu: `Blocks.Shared`, `Blocks.ServiceDefaults` |
| 5 | `Blocks.CatalogService` | `net10.0` | Web Service | MySql.EntityFrameworkCore 10.0.0-preview.1, FluentValidation.AspNetCore 11.3.0, AutoMapper 16.0.0, Tham chiếu: `Blocks.Shared`, `Blocks.ServiceDefaults` |
| 6 | `Blocks.FileService` | `net8.0` | Web Service | Grpc.AspNetCore 2.67.0, Tham chiếu: `Blocks.Shared`, `Blocks.ServiceDefaults` |
| 7 | `Blocks.AppHost` | `net10.0` | Aspire AppHost | Aspire.Hosting.AppHost 10.0.0-preview.1, Tham chiếu: các service projects |
| 8 | `SystemService.CleanupChecks` | `net10.0` | Test Harness (Exe) | Npgsql 10.0.0-preview.1, OpenTelemetry, Tham chiếu: `Blocks.SystemService` |
| 9 | `CatalogService.CleanupChecks` | `net10.0` | Test Harness (Exe) | MySql.EntityFrameworkCore 10.0.0-preview.1, Tham chiếu: `Blocks.CatalogService` |
| 10 | `FileService.RemovalChecks` | `net10.0` | Test Harness (Exe) | Microsoft.AspNetCore.TestHost, Tham chiếu: `Blocks.FileService` |

---

## 3. Baseline MVC Validation Rules & HTTP Response Envelopes

Kết quả thu thập và khóa hành vi qua các bài kiểm tra characterization độc lập (`-- validation` và `-- upgrade`):

| Trường Hợp Kiểm Thử | Trạng Thái Baseline | Expected (Khóa) | Actual (Ghi Nhận Thực Tế) |
|---|---|---|---|
| Single Error Envelope (Catalog) | Pass | HTTP 200, `Success = false`, `StatusCode = 400`, `Message = "Tên phòng ban không được để trống"` | HTTP 200, `Success: false`, `StatusCode: 400`, `Message: "Tên phòng ban không được để trống"` |
| Single Error Envelope (System) | Pass | HTTP 200, `Success = false`, `StatusCode = 400`, `Message` tiếng Việt chính xác ("Tên tài khoản không được để trống" với User, "Tên gọi không được để trống" với Role) | HTTP 200, `Success: false`, `StatusCode: 400`, message chính xác, 0 side effect, 0 audit |
| Malformed JSON (`{"`) | Pass | HTTP 200, `Success = false`, `StatusCode = 400`, `Message` có giá trị | HTTP 200, `Success: false`, `StatusCode: 400`, `Message` thông báo lỗi parse |
| Empty Request Body (`""`) | Pass | HTTP 200, `Success = false`, `StatusCode = 400` | HTTP 200, `Success: false`, `StatusCode: 400` |
| Null Body (`null`) | Pass | HTTP 200, `Success = false`, `StatusCode = 400` | HTTP 200, `Success: false`, `StatusCode: 400` |
| Invalid GUID String Binding | Pass | HTTP 200, `Success = false`, `StatusCode = 400` | HTTP 200, `Success: false`, `StatusCode: 400` |
| Multiple Validation Errors (System) | Pass | Lấy đúng thông báo lỗi đầu tiên theo metadata/thứ tự thuộc tính (`Email không được để trống`) | HTTP 200, `Success: false`, `StatusCode: 400`, `Message = "Email không được để trống"` |
| Nested Permissions Scenarios (System) | Pass | Khóa 3 scenario: (a) `Permissions=[]` -> từ chối cấp root ("Danh sách phân quyền không được rỗng"); (b) `RoleId=empty` -> từ chối cấp con ("Vai trò không được để trống"); (c) list hợp lệ -> vượt qua validation, gọi action 1 lần | HTTP 200, `Success: false` cho (a) và (b) với message chính xác; `Success: true` cho (c) với 1 action call |
| Unregistered Shared Validator (System) | Pass | `DELETE /api/User/delete-list` với `Ids=[]`: `DeleteListRequestValidator` từ `Blocks.Shared` không được đăng ký trong SystemService nên không từ chối, request đi tiếp vào service | HTTP 200, `Success: true`, `StatusCode: 200`, service gọi đúng 1 lần |
| Permission Filter Ordering | Pass | Thứ tự bộ lọc ưu tiên: 401 khi thiếu/hết hạn/sai token JWT, 403 khi bị từ chối quyền, không lọt vào action | HTTP 200, `Success: false`, `StatusCode: 401/403`, 0 action mutation, 0 audit log |
| Valid Request Execution | Pass | Payload hợp lệ vượt qua validation và model binding, gọi action service chính xác 1 lần | HTTP 200, `Success: true`, `StatusCode: 200`, service gọi 1 lần duy nhất |
| DataAnnotations `[Required]` Inactive | Pass | `DisableDataAnnotationsValidation = true` khiến thuộc tính có `[Required]` không bị DataAnnotations tự động từ chối nếu thiếu FluentValidation rule | HTTP 200, `Success: true` |
| Implicit Value Type Binding | Pass | `int Count` thiếu trong payload được deserializer gán giá trị mặc định `0`, không gây lỗi validation | HTTP 200, `Success: true`, `Data = 0` |
| FromQuery Prefix Binding | Pass | Các DTO gắn `[FromQuery(Name = "...")]` bind độc lập theo tiền tố chỉ định | HTTP 200, `Success: true`, bind đủ keyword và page index |
| Audit Retry & Backoff (Catalog) | Pass | Polly retry 3 lần (tổng 4 transport attempts) khi gặp lỗi kết nối/mạng trước khi ghi nhận thất bại | 4 transport attempts, ghi log `AUDIT LOG LOST` khi thất bại toàn phần |
| Audit Retry & Backoff (FileService) | Pass | Polly retry 3 lần khi gRPC trả về `Unavailable`, hoặc HTTP 503 / ngắt kết nối socket | 4 transport attempts, ghi log `AUDIT LOG LOST after 3 retries for FileService/UPLOAD_FILE` |
| Audit Action Failure Capture (System) | Pass | Ghi nhận audit log khi action ném ngoại lệ `BusinessException`, lưu đầy đủ `Action = "CREATE"`, `IsSuccess = false`, `ErrorMessage` | `FakeAuditLogWriter` nhận đúng 1 bản ghi lỗi khớp với actor và exception |

---

## 4. Trạng Thái Các Hạng Mục Kiểm Tra Nâng Cấp (Tasks 2 - 8)

| Task | Tên Hạng Mục | Trạng Thái Hiện Tại | Ghi Chú |
|---|---|---|---|
| Task 2 | Nâng cấp Shared, ServiceDefaults & ApiGateway lên `net10.0` | **COMPLETED** | Hoàn thành trong commit fc69930 |
| Task 3 | Cập nhật FluentValidation & migrate sang pipeline tích hợp | **COMPLETED** | Hoàn thành trong commit ce55b46 |
| Task 4 | Nâng cấp Entity Framework Core & Providers (Npgsql, MySQL) | **COMPLETED** | Hoàn thành trong commit 636dd5a |
| Task 5 | Cập nhật AutoMapper & thay thế gói có lỗ hổng NU1903 | **COMPLETED** | Hoàn thành trong commit 636dd5a |
| Task 6 | Hoàn thiện nâng cấp FileService lên `net10.0` | **COMPLETED** | Hoàn thành trong commit 948fbb8 |
| Task 7 | Nâng cấp Aspire AppHost & OpenTelemetry Instrumentation | **COMPLETED** | Hoàn thành trong commit 73c1870 |
| Task 8 | Xác thực toàn diện, bảo mật & cập nhật tài liệu vận hành | **COMPLETED** | Hoàn thành với `test/Backend.ArtifactChecks.ps1`, standalone smoke và Linux container smoke |

---

## 5. Kết Quả Xác Thực Task 8 (Standalone Publish & Linux Container Smoke)

### 5.1 Guard & Negative Path Rejection Tests
- **Guard Path Check**: Lệnh `powershell -ExecutionPolicy Bypass -File ./test/Backend.ArtifactChecks.ps1 -PublishRoot ./src` bị từ chối ngay lập tức với exit code 1 (`Guard rejection: PublishRoot must be an absolute fully-qualified path`) trước khi khởi chạy bất kỳ tiến trình hay tạo fixture nào.
- **Negative Startup Tests (FileService)**:
  - Relative storage root (`./relative-storage`): Bị từ chối khởi động (Exit code: `-532462766` / fatal startup exception).
  - Storage root under webroot (`<webroot>/storage`): Bị từ chối khởi động (Exit code: `-532462766`).
  - Symlink storage root: Bị từ chối khởi động qua file link guard (Exit code: `-532462766`).

### 5.2 Standalone Published Artifact Smoke Tests
Xác thực 4 service được publish độc lập (`dotnet publish -c Release /p:UseAppHost=false`) trên các cổng loopback tạm:
- **Runtime Target**: Cả 4 file `.runtimeconfig.json` (`FileService`, `SystemService`, `CatalogService`, `ApiGateway`) yêu cầu runtime major `10` (`Microsoft.NETCore.App` và `Microsoft.AspNetCore.App` 10.0.0).
- **Health Endpoints**: Cả 4 service trả về HTTP 200 trên `/health` và `/alive`.
- **JWT Application Envelope**: Khi thiếu token JWT, `FileService`, `SystemService`, và `CatalogService` trả về HTTP 200 với application envelope `{ "Success": false, "StatusCode": 401 }` kèm header `Cache-Control: no-store` và `X-Content-Type-Options: nosniff`.
- **Gateway Isolation**: `ApiGateway` không áp dụng JWT downstream hay phơi bày Swagger nội bộ của service (`/swagger/v1/swagger.json` trả về 404).
- **Swagger 3.0**: Development Swagger 3.0 tải thành công; FileService multipart schema đầy đủ và không chứa trường đã gỡ bỏ.
- **Avatar & Static Sentinels**: Endpoint Avatar của `FileService` trả về HTTP 200 với đúng bytes và content-type `image/png`. File tĩnh trong webroot và storage trả về 404, không truy cập được trực tiếp.

### 5.3 Linux Container Smoke Tests
Xác thực 3 image Docker Linux (`blocks-net10-check/fileservice:local`, `systemservice:local`, `catalogservice:local`):
- **Non-Root Execution**: Cả 3 container chạy dưới user `app` với UID `1654` và GID `1654`, biến môi trường `APP_UID=1654`. Không sử dụng `--user root`.
- **Volume ACL**: Thư mục tạm gắn kết được chuẩn bị quyền sở hữu `chown -R 1654:1654` và `chmod 750`, không dùng `chmod 777`.
- **Network & Ports**: Cổng chỉ bind loopback `127.0.0.1:<temp_port>`.
- **Endpoints**: `/health`, `/alive` trả về 200; missing JWT trả về HTTP 200 + application envelope 401.

| Image | Base Image Digest | Image ID | Runtime User / UID | Endpoint Smoke |
|---|---|---|---|---|
| `blocks-net10-check/fileservice:local` | `mcr.microsoft.com/dotnet/aspnet@sha256:8af87eba5e7cdafb1514d7388be287365da97c132509e84dfe252ffd552398ca` | `sha256:64fcb1645664a12328ae484bb4fc79b2c887f2e92ba962a5ac1940f40c3fe877` | `app` / `1654` | PASS (/health, /alive, 401 envelope) |
| `blocks-net10-check/systemservice:local` | `mcr.microsoft.com/dotnet/aspnet@sha256:8af87eba5e7cdafb1514d7388be287365da97c132509e84dfe252ffd552398ca` | `sha256:b0bf264bfd6393a2b9852990447d6afa93a5d052b7b09683a6c73e45a4df5cc8` | `app` / `1654` | PASS (/health, /alive, 401 envelope) |
| `blocks-net10-check/catalogservice:local` | `mcr.microsoft.com/dotnet/aspnet@sha256:8af87eba5e7cdafb1514d7388be287365da97c132509e84dfe252ffd552398ca` | `sha256:93686f6449b3462640917241163a40b9a4c6810da607bc37f62e12c81053d2fc` | `app` / `1654` | PASS (/health, /alive, 401 envelope) |

### 5.4 Linux Container Harness Execution
Chạy 3 harness trên môi trường Linux .NET 10 (`mcr.microsoft.com/dotnet/sdk:10.0`) với mã nguồn mount read-only và thư mục output ghi riêng biệt:
- `CatalogService.CleanupChecks`:
  - `contract`: PASS
  - `runtime`: PASS
  - `validation`: PASS
- `SystemService.CleanupChecks`:
  - `contract`: PASS
  - `runtime`: PASS
  - `validation`: PASS
  - `platform`: PASS
- `FileService.RemovalChecks`:
  - `all`: PASS (0 failure(s), 0 NOT RUN)

### 5.5 Gate Status
- **TLS Trust Gate**: `NOT RUN` (Do chưa cung cấp HTTPS responder fixture và trust bundle riêng đã được duyệt; script không tự sinh PKI).
- **Local CVE Scanner Gate**: `NOT RUN / DEFERRED` (Docker scout yêu cầu upload SBOM lên cloud, không được phép thực hiện với private image mà chưa có duyệt).
- **Windows Host Symlink Gate**: Được kiểm tra qua negative startup test và chạy native trong môi trường Linux; trên Windows host đòi hỏi quyền quản trị viên đặc quyền (Developer Mode / SeCreateSymbolicLinkPrivilege).
