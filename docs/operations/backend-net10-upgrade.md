# Backend .NET 10 Platform & Package Upgrade - Baseline & Tracking

Tài liệu này ghi lại kết quả thu thập baseline (Task 1) trước khi thực hiện nâng cấp package và target framework (Tasks 2–8) theo kế hoạch nâng cấp nền tảng backend.

---

## 1. Kết Quả Thu Thập Baseline (11 Lệnh Trước Nâng Cấp)

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
| Single Error Envelope (System) | Pass | HTTP 200, `Success = false`, `StatusCode = 400`, `Message = "Tên gọi không được để trống"` | HTTP 200, `Success: false`, `StatusCode: 400`, `Message: "Tên gọi không được để trống"` |
| Malformed JSON (`{"`) | Pass | HTTP 200, `Success = false`, `StatusCode = 400`, `Message` có giá trị | HTTP 200, `Success: false`, `StatusCode: 400`, `Message` thông báo lỗi parse |
| Empty Request Body (`""`) | Pass | HTTP 200, `Success = false`, `StatusCode = 400` | HTTP 200, `Success: false`, `StatusCode: 400` |
| Null Body (`null`) | Pass | HTTP 200, `Success = false`, `StatusCode = 400` | HTTP 200, `Success: false`, `StatusCode: 400` |
| Invalid GUID String Binding | Pass | HTTP 200, `Success = false`, `StatusCode = 400` | HTTP 200, `Success: false`, `StatusCode: 400` |
| Multiple Validation Errors (System) | Pass | Lấy đúng thông báo lỗi đầu tiên theo metadata/thứ tự thuộc tính (`Email không được để trống`) | HTTP 200, `Success: false`, `StatusCode: 400`, `Message = "Email không được để trống"` |
| Child Collection Validation (System) | Pass | Tự động validate phần tử con `Permissions[0].RoleId` thông qua `ImplicitlyValidateChildProperties = true` | HTTP 200, `Success: false`, `StatusCode: 400`, `Message = "Vai trò không được để trống"` |
| Permission Filter Ordering | Pass | Thứ tự bộ lọc ưu tiên: 401 khi thiếu/hết hạn/sai token JWT, 403 khi bị từ chối quyền, không lọt vào action | HTTP 200, `Success: false`, `StatusCode: 401/403`, 0 action mutation, 0 audit log |
| Valid Request Execution | Pass | Payload hợp lệ vượt qua validation và model binding, gọi action service chính xác 1 lần | HTTP 200, `Success: true`, `StatusCode: 200`, service gọi 1 lần duy nhất |
| DataAnnotations `[Required]` Inactive | Pass | `DisableDataAnnotationsValidation = true` khiến thuộc tính có `[Required]` không bị DataAnnotations tự động từ chối nếu thiếu FluentValidation rule | HTTP 200, `Success: true` |
| Implicit Value Type Binding | Pass | `int Count` thiếu trong payload được deserializer gán giá trị mặc định `0`, không gây lỗi validation | HTTP 200, `Success: true`, `Data = 0` |
| FromQuery Prefix Binding | Pass | Các DTO gắn `[FromQuery(Name = "...")]` bind độc lập theo tiền tố chỉ định | HTTP 200, `Success: true`, bind đủ keyword và page index |
| Audit Retry & Backoff (Catalog) | Pass | Polly retry 3 lần (tổng 4 transport attempts) khi gặp lỗi kết nối/mạng trước khi ghi nhận thất bại | 4 transport attempts, ghi log `AUDIT LOG LOST` khi thất bại toàn phần |
| Audit Retry & Backoff (FileService) | Pass | Polly retry 3 lần khi gRPC trả về `Unavailable`, hoặc HTTP 503 / ngắt kết nối socket | 4 transport attempts, ghi log `AUDIT LOG LOST after 3 retries for FileService/UPLOAD_FILE` |
| Audit Action Failure Capture (System) | Pass | Ghi nhận audit log khi action ném ngoại lệ `BusinessException`, lưu đầy đủ `Action = "CREATE"`, `IsSuccess = false`, `ErrorMessage` | `FakeAuditLogWriter` nhận đúng 1 bản ghi lỗi khớp với actor và exception |

---

## 4. Trạng Thái Các Hạng Mục Kiểm Tra Tương Lai (Tasks 2 - 8)

| Task | Tên Hạng Mục | Trạng Thái Hiện Tại | Ghi Chú |
|---|---|---|---|
| Task 2 | Nâng cấp Shared, ServiceDefaults & ApiGateway lên `net10.0` | **PENDING** | CHƯA CHẠY (dành cho Task 2) |
| Task 3 | Cập nhật FluentValidation & migrate sang pipeline tích hợp | **PENDING** | CHƯA CHẠY (dành cho Task 3) |
| Task 4 | Nâng cấp Entity Framework Core & Providers (Npgsql, MySQL) | **PENDING** | CHƯA CHẠY (dành cho Task 4) |
| Task 5 | Cập nhật AutoMapper & thay thế gói có lỗ hổng NU1903 | **PENDING** | CHƯA CHẠY (dành cho Task 5) |
| Task 6 | Hoàn thiện nâng cấp FileService lên `net10.0` | **PENDING** | CHƯA CHẠY (dành cho Task 6) |
| Task 7 | Nâng cấp Aspire AppHost & OpenTelemetry Instrumentation | **PENDING** | CHƯA CHẠY (dành cho Task 7) |
| Task 8 | Xác thực toàn diện, bảo mật & cập nhật tài liệu vận hành | **PENDING** | CHƯA CHẠY (dành cho Task 8) |
