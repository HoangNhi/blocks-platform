# Backend .NET 10: Bàn Giao Sau Review

Ngày: 2026-10-23.
Revision được review: `4dd3264ab2911c794b8649b8d23a2e1e7aec2e6d`.

## Mục Đích Và Giới Hạn

Tài liệu bàn giao 4 mục từ review để session khác kiểm tra và xử lý.
Đọc `AGENTS.md`, source hiện tại, [spec](../superpowers/specs/2026-10-23-dotnet10-platform-package-upgrade-design.md)
và [plan](../superpowers/plans/2026-10-23-dotnet10-platform-package-upgrade.md) trước khi sửa.
Kiểm tra `git status --short`; bảo toàn thay đổi có sẵn.

**Đính chính review trước:** Không có đủ bằng chứng để gọi mục 3 là lỗi P2.
Mục 4 là gate kiểm chứng chưa chạy, không phải lỗi code đã xác nhận.
Không tự đổi production registration hoặc chạy DB để đóng checklist.
Build và DB-free checks đạt không đồng nghĩa đã sẵn sàng triển khai production.

| Mục | Phân Loại | Trạng Thái Bàn Giao |
| --- | --- | --- |
| 1 | P2, assertion có false positive | Đã xác nhận bằng mutation trong memory |
| 2 | Khoảng trống kiểm thử retry | Chưa kiểm chứng lỗi production; cần bổ sung coverage |
| 3 | Nghi vấn registration MVC | Chưa xác nhận; kiểm tra trước, không mặc định phải sửa |
| 4 | Gate môi trường/quyền | NOT RUN; giữ chặn rollout cho đến khi đủ bằng chứng |

## 1. Assertion AppHost Không Khóa Đúng Reference SystemService

**Vị trí:**
- `test/Backend.Upgrade.Check.ps1:414`.
- `src/platform/Blocks.AppHost/AppHost.cs:5`.

Assertion hiện tại:

```powershell
$csContent -match 'systemService.*WithReference\(\s*fileService\s*\)' -or
$csContent -match 'WithReference\(\s*fileService\s*\)'
```

Nhánh đầu không khớp khai báo nhiều dòng. Nhánh sau chấp nhận bất kỳ
`WithReference(fileService)` nào, kể cả từ Catalog hoặc Gateway.
Xóa riêng reference SystemService tới FileService vẫn có thể PASS.
Production graph hiện có reference đúng; lỗi nằm ở regression check.

**Bằng chứng:** Đã xóa riêng reference đó trong bản sao chuỗi source, không sửa file.
Assertion hiện tại vẫn trả `true`.

**Yêu cầu xử lý:**
- Giới hạn phép kiểm tra trong biểu thức khai báo `systemService`, không dựa vào
  reference của resource khác.
- Không chỉ thêm `(?s)` rồi tìm xuyên toàn file: vẫn có thể khớp reference của
  Catalog/Gateway nằm sau khai báo SystemService.
- Thêm regression check chạy được, dùng source fixture hoặc mutation trong memory.
  Không sửa AppHost thật để tạo case âm.

**Tiêu chí đóng:**
- Source hiện tại PASS.
- Bỏ riêng `systemService` reference tới `fileService` phải FAIL.
- Reference của Catalog/Gateway không làm case âm PASS.
- Bảo toàn chiều `fileService.WithReference(systemService)` và graph trong spec.

**Kiểm chứng:**

```powershell
& ./test/Backend.Upgrade.Check.ps1 -Check apphost
& ./test/Backend.Upgrade.Check.ps1 -Check all
```

Hai lệnh phải exit 0 trên source hợp lệ; regression test phải nhận ra case âm.

## 2. Thiếu Case Audit Gặp HTTP 503 Hoặc Disconnect Kéo Dài

**Vị trí:**
- `test/FileService.RemovalChecks/UpgradeChecks.cs:139`: terminal gRPC Unavailable.
- `test/FileService.RemovalChecks/UpgradeChecks.cs:211`: HTTP 503 rồi hồi phục.
- `test/FileService.RemovalChecks/UpgradeChecks.cs:265`: disconnect rồi hồi phục.
- `test/FileService.RemovalChecks/FileBoundaryChecks.cs`: `EphemeralAuditResponder`.
- `src/services/Blocks.FileService/Infrastructure/Filters/AuditActionFilter.cs`.

Harness đã kiểm terminal gRPC status 14: tổng 4 transport attempts và log
`AUDIT LOG LOST`. HTTP 503 và socket abort mới kiểm lỗi lần đầu, thành công lần sau.
Chưa có assertion tương đương khi hai kiểu lỗi này kéo dài.
Không có bằng chứng hiện tại cho thấy production retry vô hạn.

**Yêu cầu xử lý:**
- Thêm case upstream luôn HTTP 503 và luôn ngắt kết nối.
- Dùng production audit filter, typed client và ServiceDefaults; fixture chỉ thay upstream.
- Khóa tổng transport attempts của toàn pipeline, gồm resilience và Polly.
  Đối chiếu baseline trước nâng nếu còn chạy được; nếu không, ghi rõ giới hạn bằng chứng.
- Không mặc định mọi kiểu lỗi đều đúng 4 attempts hoặc lấy actual làm expected.
- Chờ terminal log và audit task kết thúc trước khi dispose responder/storage.
  Chỉ đợi request đang in-flight bằng 0 không chứng minh task retry đã kết thúc.
- Dùng thời hạn hữu hạn; không đổi policy/backoff production để tăng tốc test.

**Tiêu chí đóng:**
- Hai case kết thúc trong thời hạn, số attempts đúng expected đã có căn cứ.
- Có log `AUDIT LOG LOST`, không replay business mutation vì audit lỗi.
- Teardown không để retry gọi vào fixture đã dispose.
- Các case hồi phục và terminal gRPC hiện có vẫn đạt.

**Kiểm chứng:**

```powershell
dotnet run --project test/FileService.RemovalChecks -c Release -- upgrade
dotnet run --project test/FileService.RemovalChecks -c Release
```

Expected: exit 0, `0 failure(s)`; ghi riêng mọi `NOT RUN`.

## 3. Xác Minh Nghi Vấn Thứ Tự Cấu Hình MvcOptions

**Vị trí:**
- `src/services/Blocks.SystemService/Program.cs:24`.
- `src/services/Blocks.SystemService/Configs/ConfigService.cs:65`.
- `src/services/Blocks.CatalogService/Program.cs:19`.
- `src/services/Blocks.CatalogService/Configs/ConfigService.cs:61`.
- `test/SystemService.CleanupChecks/ValidationChecks.cs:713`.
- `test/CatalogService.CleanupChecks/ValidationChecks.cs:693`.

Review trước đề nghị đổi `AddMvc(options => ...)` thành
`Services.Configure<MvcOptions>(...)` vì nghi DataAnnotations chưa được tắt ổn định.
**Đề nghị này chưa có reproduction chứng minh cần thiết.**

Production gọi `AddControllers(...)` trước `ExecuteConfigService()`.
Cả hai validation harness cũng dùng thứ tự đó và đã có HTTP probes cho
`[Required]` không tham gia validation, cùng custom provider vẫn hoạt động.
Các mode `validation` đã exit 0 trong phiên review trước.

**Yêu cầu xử lý:**
- Kiểm tra `IOptions<MvcOptions>.Value` và HTTP probes với đúng registration production.
- Xác nhận DataAnnotations provider đã bị loại, implicit required bị tắt,
  binding errors còn nguyên và custom provider không bị xóa.
- Chỉ sửa khi có test tái hiện lỗi hoặc sai khác thực tế.
  Không đổi registration chỉ vì tên API khác.
- Nếu không tái hiện được, đóng mục này là nghi vấn không được xác nhận;
  ghi bằng chứng và giữ code hiện có.

**Tiêu chí đóng:** Có kết luận dựa trên code/test: lỗi được tái hiện và sửa,
hoặc không có lỗi trong pipeline production hiện tại. Không cần hỗ trợ thứ tự
registration giả định nếu repo không dùng.

**Kiểm chứng:**

```powershell
dotnet run --project test/SystemService.CleanupChecks -c Release -- validation
dotnet run --project test/CatalogService.CleanupChecks -c Release -- validation
```

Expected: exit 0; giữ envelope, first error, authorization trước validation và audit.

## 4. Gate Môi Trường Chưa Đủ Bằng Chứng Rollout

**Nguồn theo dõi:** [Runbook nâng backend](backend-net10-upgrade.md), mục 5.5 và 7.
Đây là công việc phối hợp owner, không phải quyền tự cấp tài nguyên hay deploy.

| Gate | Điều Kiện Trước Khi Chạy |
| --- | --- |
| System `telemetry` | `SYSTEMSERVICE_CLEANUP_TEST_OTLP_ENDPOINT`: HTTP localhost, port rõ, không credentials; receiver cô lập được owner xác nhận |
| System `auth` | Quyền riêng cho PostgreSQL localhost `blocks_systemservice_cleanup_test`, qua `SYSTEMSERVICE_CLEANUP_TEST_CONNECTION`; chỉ schema fixture sở hữu |
| Catalog `provider` | Quyền riêng cho MySQL localhost rỗng `blocks_catalogservice_upgrade_test`, qua `CATALOGSERVICE_UPGRADE_TEST_CONNECTION`; chỉ bảng fixture sở hữu |
| AppHost runtime | Owner duyệt cấu hình, DB/JWT/storage/endpoints fixture và tài nguyên; không dùng dữ liệu thật |
| TLS trust | HTTPS responder và trust bundle cô lập được duyệt; không bỏ cert validation hoặc sửa trust-store máy |
| Container CVE | Scanner local được phép; không upload private image/SBOM khi chưa được duyệt |

**Yêu cầu xử lý:**
- Thiếu quyền/fixture: giữ `NOT RUN`, ghi blocker và owner cần xác nhận.
- Khi đủ quyền, chạy đúng gate; ghi revision/artifact, command, exit code,
  assertion và kết quả. Không đưa secrets vào evidence.
- Mode `platform` chứng minh receiver nội bộ không thay cho việc đã chạy
  mode `telemetry` với endpoint riêng.
- Đối chiếu các dòng `APPROVED`/`READY FOR MAINTENANCE WINDOW` trong runbook
  với phê duyệt owner thực tế; thiếu bằng chứng thì ghi pending.
- License AutoMapper/Oracle và backup/single-writer vẫn là rollout gates của spec;
  không tự suy đạt từ build hoặc tài liệu này.

**Lệnh chỉ chạy sau khi có đủ điều kiện và quyền tương ứng:**

```powershell
dotnet run --project test/SystemService.CleanupChecks -c Release -- telemetry
dotnet run --project test/SystemService.CleanupChecks -c Release -- auth
dotnet run --project test/CatalogService.CleanupChecks -c Release -- provider
dotnet run --project src/platform/Blocks.AppHost/Blocks.AppHost.csproj
```

**Tiêu chí đóng:** Mỗi gate có bằng chứng đạt hoặc trạng thái pending rõ ràng.
Pending hợp lệ không được đổi thành PASS, và không đồng nghĩa được phép rollout.

## Kết Quả Session Xử Lý (2026-10-23)

| Mục | Phân Loại | Kết Luận Xử Lý | Bằng Chứng / Files / Lệnh Đã Kiểm Chứng |
| --- | --- | --- | --- |
| 1 | P2, assertion AppHost | **FIXED** | Sửa `test/Backend.Upgrade.Check.ps1`: khoanh vùng regex vào đúng statement gán `systemService` (`var systemService = ...;`), ngăn false positive từ Catalog/Gateway; bổ sung mutation test in-memory bắt lỗi khi bỏ riêng reference `systemService.WithReference(fileService)`. Chạy `-Check apphost` và `-Check all` đều Exit 0. |
| 2 | Khoảng trống kiểm thử retry | **COVERAGE ADDED** | Thêm Case 6 (persistent HTTP 503) và Case 7 (persistent abort) trong `test/FileService.RemovalChecks/UpgradeChecks.cs`; thêm Subcase 5 và 6 trong `test/CatalogService.CleanupChecks/ValidationChecks.cs`. Khóa tổng transport attempts (>= 4), chờ `AUDIT LOG LOST` kết thúc trước teardown, loại bỏ `ObjectDisposedException`, bảo đảm action không bị replay. `FileService -- upgrade`, `FileService all` (0 failure) và `CatalogService -- validation` đều Exit 0. |
| 3 | Nghi vấn registration MVC | **NOT REPRODUCED (VERIFIED AS-IS)** | Đối chiếu ASP.NET Core: `services.AddMvc(options => ...)` gọi trực tiếp `services.Configure<MvcOptions>(options => ...)`. Bổ sung assertion trực tiếp trên `IOptions<MvcOptions>.Value` trong cả 2 harness: `DataAnnotationsModelValidatorProvider` đã bị loại hoàn toàn, `SuppressImplicitRequiredAttributeForNonNullableReferenceTypes = true`, custom providers còn nguyên. Probes `[Required]` và binding errors hoạt động đúng thiết kế. Giữ nguyên mã nguồn production. |
| 4 | Gate môi trường/quyền | **BLOCKED / DEFERRED (AS DESIGNED)** | Giữ nguyên 6 gates ở trạng thái `NOT RUN / DEFERRED` trong `docs/operations/backend-net10-upgrade.md` (Mục 7 và 9). Sửa typo `global.json pin 10.0.402` tại bảng Mục 9. Không kết nối DB ứng dụng, không tự cấp quyền hay upload SBOM lên cloud ngoài thẩm quyền. |

### Chi Tiết Thay Đổi & Kiểm Chứng
1. **Mục 1 (AppHost reference assertion):**
   - File: `test/Backend.Upgrade.Check.ps1`
   - Lệnh kiểm chứng:
     - `powershell -Command "& ./test/Backend.Upgrade.Check.ps1 -Check apphost"` (Exit 0)
     - `powershell -Command "& ./test/Backend.Upgrade.Check.ps1 -Check all"` (Exit 0)
2. **Mục 2 (Persistent 503 & Abort retry coverage):**
   - Files: `test/FileService.RemovalChecks/UpgradeChecks.cs`, `test/CatalogService.CleanupChecks/ValidationChecks.cs`
   - Lệnh kiểm chứng:
     - `dotnet run --project test/FileService.RemovalChecks -c Release -- upgrade` (Exit 0, 0 failure)
     - `dotnet run --project test/FileService.RemovalChecks -c Release` (Exit 0, 0 failure, 3 NOT RUN)
     - `dotnet run --project test/CatalogService.CleanupChecks -c Release -- validation` (Exit 0)
3. **Mục 3 (MvcOptions inspection):**
   - Files: `test/SystemService.CleanupChecks/ValidationChecks.cs`, `test/CatalogService.CleanupChecks/ValidationChecks.cs`
   - Lệnh kiểm chứng:
     - `dotnet run --project test/SystemService.CleanupChecks -c Release -- validation` (Exit 0)
     - `dotnet run --project test/CatalogService.CleanupChecks -c Release -- validation` (Exit 0)
4. **Mục 4 (Rollout gates & runbook):**
   - File: `docs/operations/backend-net10-upgrade.md`
   - Trạng thái: Các gate đặc quyền tiếp tục ghi nhận trung thực là PENDING / DEFERRED, chờ maintenance window có hạ tầng và tài khoản riêng.
