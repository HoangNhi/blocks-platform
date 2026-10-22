# CatalogService chỉ giữ danh mục Phòng ban

Ngày: 2026-10-22

Trạng thái: Đã hoàn thành Task 1-4 (xóa backend cũ, khôi phục build, đổi nhãn Phòng ban, gỡ route, lọc sidebar).
Kiểm tra tĩnh/harness/build/test PASS. Metadata API và CRUD/audit tích hợp ghi nhận NOT RUN (chờ môi trường cô lập).

| Hạng mục | Trạng thái |
| --- | --- |
| Database `catalog` | Đã drop `Council`, `Cycle`, `EvaluationSchedule`, `Stakeholder`; chỉ còn `faculty`. |
| Dữ liệu `faculty` | Giữ nguyên dữ liệu; checksum và schema bảo toàn. |
| Scaffold của người dùng | Context chỉ có `Faculties`; `Faculty.CreatedAt` required; bảo toàn hash file. |
| Code backend và build | Đã xóa 6 domain và Catalog gRPC server; `Blocks.CatalogService` build đạt (0 lỗi, 1 cảnh báo AutoMapper baseline). |
| Nhãn Phòng ban | Đã cập nhật copy/validation backend và UI; contract giữ nguyên. |
| Màn hình & route web | Đã gỡ 4 route quản trị; giữ nguyên các dependency của business. |
| Sidebar | Đã lọc 4 controller đã bỏ và ẩn nhóm rỗng; không sửa context/permissions. |
| Metadata Menu API & CRUD tích hợp | NOT RUN (yêu cầu môi trường cô lập và tài khoản admin). |

Phạm vi triển khai còn lại là code, giao diện, menu và kiểm thử.
Không chạy lại SQL DROP, không scaffold lại và không sửa schema để chữa lỗi build.

## 1. Mục tiêu và quyết định

CatalogService chỉ quản lý danh mục Phòng ban, kế thừa chức năng `Faculty`
hiện có. Loại bỏ loại tài liệu, đối tượng khảo sát, bộ tiêu chuẩn, tiêu chuẩn,
tiêu chí và yêu cầu minh chứng khỏi dịch vụ.

Các yêu cầu đã xác nhận:

- Giữ `Faculty`, đổi tên nghiệp vụ từ Khoa thành Phòng ban.
- Xóa chức năng của sáu domain trong source: `CriterionRequirement`,
  `Criterion`, `Standard`, `StandardSet`, `FileType`, `Stakeholder`.
- Giữ nguyên database `catalog`, bảng thực `faculty` và toàn bộ dữ liệu.
- Không thực hiện thêm DDL/DML cho Catalog trong bước xóa chức năng.

Đề xuất kỹ thuật trong spec: giữ tên `Faculty`, DTO, URL, khóa quyền và tên
bảng thực `faculty`; chỉ đổi tên hiển thị và thông báo nghiệp vụ. Việc đổi đồng bộ
sang `Department` không nằm trong đợt này.

Kết quả mong muốn là một CatalogService nhỏ hơn, không còn phục vụ các
danh mục bị bỏ, nhưng Phòng ban vẫn dùng được các quyền và dữ liệu cũ.

## 2. Hiện trạng và ảnh hưởng

Mốc source ban đầu: `e2c5bf0ad87084c2050c9b902393501b1034402e`.
Bản cập nhật dựa trên working tree ngày 2026-10-22, bao gồm scaffold chưa
commit của người dùng tại `Faculty.cs` và `CatalogContext.cs`. Phải giữ các
thay đổi này; không khôi phục model cũ từ Git.
Các đường dẫn dưới đây tính từ repository root.

| Vị trí | Hiện trạng ảnh hưởng thiết kế |
| --- | --- |
| `src/services/Blocks.CatalogService/Infrastructure/Data/CatalogContext.cs` | Chỉ còn DbSet `Faculties` và mapping `Faculty` tới `faculty` với cột snake_case; không có `OnConfiguring` chứa connection string. |
| `src/services/Blocks.CatalogService/Entities/` | Vẫn có bảy file entity. Scaffold đã cập nhật `Faculty.cs`, chưa xóa sáu file entity cũ. |
| `src/services/Blocks.CatalogService/Services/CoreFeature/`, `Services/gRPC/` | Service cũ còn gọi `FileTypes`, `Stakeholders`, `StandardSets`, `Standards`, `Criteria`, `CriterionRequirements` đã mất khỏi context. |
| `src/services/Blocks.CatalogService/Controllers/FacultyController.cs` | Có sáu endpoint danh sách, chi tiết, thêm, sửa, xóa mềm và combobox. |
| `src/services/Blocks.CatalogService/Helpers/AttributePermission.cs` | Khóa kiểm tra quyền lấy từ tên controller viết thường; đổi controller sẽ ảnh hưởng khóa `faculty`. |
| `src/services/Blocks.CatalogService/Protos/catalog.proto` | Cả bảy RPC chỉ phục vụ các danh mục bị loại, không có RPC Faculty. |
| `src/services/Blocks.CatalogService/Configs/ConfigService.cs` | gRPC client SystemService phục vụ phân quyền và audit, vẫn cần sau khi bỏ server Catalog. |
| `src/apps/Blocks.Web/src/Router.tsx` | Có năm route quản trị danh mục. |
| `src/apps/Blocks.Web/src/features/business/` | Còn import API, kiểu dữ liệu, hook và component của các danh mục bị bỏ. Không thể xóa toàn bộ frontend Catalog theo thư mục. |
| `src/apps/Blocks.Web/src/components/layout/MainLayout/` | Tên menu và tiêu đề phụ thuộc dữ liệu menu từ SystemService. Chỉ đổi chuỗi trong popup không đổi đủ tên hiển thị. |
| `src/apps/Blocks.Web/src/components/layout/MainLayout/app-sidebar.tsx`, `src/apps/Blocks.Web/src/contexts/AuthContext.tsx` | Sidebar không tự lọc IsShowMenu; menu được cache trong localStorage và không tự tải mới khi F5. |

Không thấy project trong checkout link `catalog.proto` làm client. Trước
rollout vẫn phải kiểm kê consumer ngoài repo; không coi kết quả tìm kiếm
source là bằng chứng không có tích hợp bên ngoài.

Baseline kiểm tra sau scaffold:

```powershell
dotnet build src/services/Blocks.CatalogService/Blocks.CatalogService.csproj --no-restore --nologo --verbosity quiet
```

Kết quả ngày 2026-10-22: exit code 1, 123 lỗi và 38 cảnh báo. Có lỗi `CS1061`
do service/gRPC cũ gọi DbSet đã bị scaffold loại bỏ, kèm lỗi suy luận kiểu
phát sinh từ các biểu thức đó. Mục tiêu là loại bỏ code chức năng cũ để build
lại; không thêm lại DbSet, mapping hoặc bảng cũ. Cảnh báo baseline gồm
`NU1903` của AutoMapper 16.0.0 và các cảnh báo nullable/obsolete; không nâng
dependency hoặc sửa cảnh báo ngoài phạm vi chỉ để làm sạch đầu ra.

## 3. Các phương án

| Phương án | Đánh đổi |
| --- | --- |
| **Đề xuất: giữ scaffold Faculty mới, xóa code sáu domain cũ** | Khớp DB hiện tại, giữ hợp đồng Phòng ban và khóa quyền cũ; các API bị bỏ là breaking change có chủ đích. |
| Đổi cả code, API, khóa quyền và bảng thành Department | Tên kỹ thuật đúng nghiệp vụ mới hơn, nhưng phải chuyển schema và metadata quyền; tăng rủi ro mất tương thích không cần thiết. |
| Chỉ ẩn giao diện hoặc thêm lại DbSet cũ | Không giải quyết đầy đủ việc bỏ chức năng; truy vấn cũ vẫn nhắm tới bảng không còn tồn tại. |

Không thêm service thay thế, adapter, feature flag, API giả hoặc dependency
mới để duy trì các nghiệp vụ đã bị loại.

## 4. Phòng ban giữ nguyên hợp đồng

Giữ `FacultyController`, `IFacultyService`, `FacultyService`, `FacultyProfile`,
`FacultyRequest`, `ModelFaculty`, entity `Faculty` và DbSet `Faculties`.

Giữ các endpoint:

| Method | Route |
| --- | --- |
| POST | `/api/Faculty/get-list` |
| GET | `/api/Faculty/get-by-id` |
| POST | `/api/Faculty/insert` |
| PUT | `/api/Faculty/update` |
| DELETE | `/api/Faculty/delete-list` |
| GET | `/api/Faculty/get-all-combobox` |

Frontend giữ route `/faculty`, `API_ENDPOINTS.Catalog.Faculty`, kiểu dữ liệu,
payload và query key `faculties`. Không tự thay prefix Gateway.

Đổi các thông báo nghiệp vụ và giao diện:

- `Tên khoa không được để trống` thành `Tên phòng ban không được để trống`.
- `Tên khoa đã tồn tại` thành `Tên phòng ban đã tồn tại`.
- Popup thêm và cập nhật, tiêu đề cột và tên menu dùng Phòng ban.

Giữ UUID, tên từng bản ghi, trạng thái, audit fields và cờ xóa mềm của dữ liệu
Faculty hiện có. Không đổi tên toàn bộ bản ghi, seed phòng ban mẫu, truncate
hoặc tạo lại bảng.

Giữ JWT, quyền ADD/UPDATE/DELETE, chính sách đọc hiện có, audit và envelope
`Success`, `StatusCode`, `Data`, `Message`. Không đổi HTTP 200 chứa lỗi ứng dụng
thành một hợp đồng mới. Không gom sửa các lỗi Faculty khác vào đợt dọn này.

### 4.1. Bảo toàn model sau scaffold

| Thành phần | Hợp đồng cần giữ |
| --- | --- |
| `Faculty` và `Faculties` | Giữ tên C#, `Guid Id`, `Name`, `CreatedBy`, `UpdatedAt`, `UpdatedBy`, `IsActived`, `IsDeleted`; không đổi thành `Department`. |
| `Faculty.CreatedAt` | Giữ `DateTime` không nullable theo scaffold mới; không sửa lại nullable để khớp model cũ. |
| Mapping bảng | `ToTable("faculty")`, không đổi lại `"Faculty"`. |
| Mapping cột | `id`, `name`, `created_at`, `created_by`, `updated_at`, `updated_by`, `is_actived`, `is_deleted`. |
| Timestamp | Giữ mapping `timestamp` và default `CURRENT_TIMESTAMP` của scaffold; không thay bằng default `utc_timestamp()` cũ. |
| Cấu hình model | Giữ charset/collation hiện được scaffold và `OnModelCreatingPartial`; không chép lại cấu hình ID của model cũ. |

`FacultyService.Insert` đang tự gán UUID và `CreatedAt = DateTime.UtcNow`;
giữ hành vi này. Kiểm tra AutoMapper vẫn map được entity mới tới
`ModelFaculty`; giữ kiểu `CreatedAt` nullable được kế thừa từ `BaseModel`
trong DTO, không sửa Shared hoặc hợp đồng JSON vì entity đổi nullability.
Không ghi connection string vào context hoặc tài liệu.

## 5. Loại bỏ mã Catalog không còn dùng

Trong `src/services/Blocks.CatalogService/`:

- Xóa controller, service, interface, profile và DTO riêng của `FileType`,
  `Stakeholder`, `StandardSet`, `Standard`; gồm DTO Criterion và Requirement.
- Xóa đúng sáu file entity `Criterion.cs`, `CriterionRequirement.cs`,
  `FileType.cs`, `Stakeholder.cs`, `Standard.cs`, `StandardSet.cs` sau khi bỏ
  caller. Không purge thư mục `Entities/`; giữ `Faculty.cs` người dùng vừa scaffold.
- Giữ `CatalogContext` mới chỉ có `Faculties`; không cần xóa mapping cũ
  lần nữa vì scaffold đã loại bỏ chúng.
- Bỏ `Services/gRPC/CatalogGrpcService.cs`, `Protos/catalog.proto` và mục
  protobuf server tương ứng trong `.csproj`.
- Bỏ `MapGrpcService<CatalogGrpcService>`, middleware gRPC-Web server và
  `AddGrpc` khi không còn server nào khác.
- Bỏ enum, using và helper chỉ phục vụ các domain bị xóa sau khi đối chiếu
  caller. Không dọn helper dùng chung theo tên hoặc theo phỏng đoán.

Việc xóa service phải loại cả AutoMapper profile và đăng ký tự động
`[RegisterClassAsTransient]` của các domain cũ. Xóa các using Catalog proto
và Common đã hết dùng; không thay service cũ bằng stub hoặc đăng ký DI giả.
Không xóa helper ngày tháng hoặc cấu hình mapper dùng chung chỉ vì bỏ Standard.

Giữ protobuf client `system.proto`, `audit.proto`, JWT interceptor, cấu hình
client, gRPC-Web client handler và các package còn cần cho client. Chỉ bỏ
package server nếu không còn sử dụng; không nâng phiên bản package.

Giữ Shared, ServiceDefaults, CORS, telemetry, health, exception middleware,
DI, cơ chế audit và cấu hình kết nối hiện có. Không sửa AppHost hoặc phục hồi
BusinessService/CollabService đang vắng mặt.

Các REST endpoint bị bỏ không còn trong routing hoặc Swagger. Bảy RPC
Catalog không còn được phục vụ. Không dựng response thành công giả hoặc giữ
endpoint trả danh sách rỗng để che việc ngừng hỗ trợ.

## 6. Frontend và metadata menu

Gỡ route và các màn hình quản trị `/filetype`, `/stakeholder`, `/standard`,
`/standardset`; giữ `/faculty` với nhãn Phòng ban. Xóa hook, API hoặc kiểu dữ
liệu riêng của các màn hình bị bỏ chỉ khi không còn caller.

Danh sách dưới đây tính từ `src/apps/Blocks.Web/src/features/catalog/`.
Đối chiếu lại import khi triển khai để không xóa caller mới xuất hiện.

| Nhóm | Xử lý |
| --- | --- |
| `routes/FileType/`, `routes/Stakeholder/`, `routes/Standard/`, `routes/StandardSet/` | Xóa các màn hình và import/route tương ứng trong `Router.tsx`. |
| `hooks/useFileType.ts`, `hooks/useStakeholder.ts`, `hooks/useStandard.ts`, `hooks/useStandardSet.ts` | Xóa cùng các màn hình quản trị là caller duy nhất hiện thấy. |
| `hooks/useCriterionRequirements.ts`, `hooks/useStandardCriteria.ts` | Xóa nếu kiểm kê lại vẫn không còn caller. |
| `api/stakeholder.api.ts` | Xóa sau `useStakeholder.ts`; giữ `types/stakeholder.types.ts` vì business còn import. |
| `api/filetype.api.ts`, `api/standard.api.ts`, `api/standardset.api.ts` | Giữ vì business và các hook/component còn dùng. |
| `types/filetype.types.ts`, `types/standard.types.ts`, `types/standardset.types.ts`, `types/stakeholder.types.ts` | Giữ các kiểu còn được import trực tiếp hoặc gián tiếp. |
| `hooks/useFileTypeOptions.ts`, `hooks/useStandardSetOptions.ts`, `hooks/useMultiStandardSets.ts`, `hooks/useStandardsWithCriteria.ts` | Giữ cho các luồng business hiện có. |
| `components/MultiStandardSetPanel.tsx`, `components/StandardCriteriaTable.tsx` | Giữ vì business còn import. |
| `routes/Faculty/`, `api/faculty.api.ts`, `hooks/useFaculty.ts`, `types/faculty.types.ts` | Giữ chức năng Phòng ban; chỉ đổi chuỗi giao diện liên quan. |

Không di chuyển các phần giữ lại chỉ để làm sạch tên thư mục; không xóa
cả `features/catalog` hoặc `features/business`. Giữ
`src/apps/Blocks.Web/src/constants/catalog.constants.ts` vì business còn
dùng. Trong `src/config/constants.ts`, giữ endpoint Faculty và các endpoint
FileType/Standard/StandardSet mà API wrapper giữ lại đang tham chiếu.

Chuỗi Phòng ban cần đổi tại `routes/Faculty/columns.tsx` và
`routes/Faculty/PopupFaculty.tsx`: tên cột, nhãn trường, validation và tiêu
đề thêm/cập nhật. Giữ API client, query key, payload và invalidation hiện có.

Đây không phải chuyển các domain cũ sang service mới. Các luồng business còn
gọi API bị bỏ sẽ không hoạt động sau rollout; việc giữ mã consumer không có
nghĩa là giữ nghiệp vụ chạy được. DB đã bị dọn nên các luồng đó đã mất điều
kiện hoạt động với dữ liệu cũ. Người dùng phải duyệt giới hạn này cùng spec.
Nếu cần khôi phục nghiệp vụ, phải có thiết kế và nguồn phục hồi riêng;
không tái tạo bảng hoặc fake response trong đợt xóa chức năng này.

Trong `app-sidebar.tsx`, loại đúng bốn khóa controller `filetype`,
`stakeholder`, `standard`, `standardset` khỏi tập menu dùng để render.
So khớp không phân biệt hoa thường bằng giá trị `Controller` chuyển về
lowercase. Áp dụng tập menu đã lọc nhất quán cho menu trực tiếp, nhóm con,
trạng thái active và kiểm tra `hasChildren`, kể cả dữ liệu menu cũ còn cache.
Không hiển thị nhóm con hoặc nhóm gốc rỗng chỉ vì vẫn tồn tại bản ghi
SystemGroup. Nhóm chứa menu khác phải tiếp tục hiển thị. Giữ mọi menu khác
và không thay đổi tập quyền trong AuthContext. Không thêm bộ lọc IsShowMenu
tổng quát cho mọi domain vì đó là thay đổi hành vi ngoài phạm vi.

Với menu Faculty, xác định đúng Menu ID rồi đổi duy nhất tên nghiệp vụ thành
`Phòng ban` qua API quản trị SystemService hiện có, bằng tài khoản đủ quyền.
Giữ Controller `faculty`, ID, SystemGroupId, các cờ quyền và liên kết
Permission. Không xóa vật lý Menu hoặc Permission, không đổi quyền của role
và không sửa metadata của bốn menu đã ẩn.

Không suy đoán ID từ tên hiển thị hoặc cập nhật hàng loạt mọi menu trùng
Controller. Nếu không xác định được đúng menu Faculty, dừng bước metadata
để xác nhận đích. Không sửa code SystemService hoặc dùng SQL trực tiếp để né
permission, validation và audit của API.

Sau cập nhật tên menu, đăng xuất rồi đăng nhập lại để luồng hiện có xóa
cache và tải menu mới; xác nhận cả sidebar và tiêu đề trang. F5 hoặc chuyển
trang không đủ vì AuthContext tái sử dụng localStorage. Không viết lại
AuthContext hay thay đổi cơ chế xác thực để đổi nhãn.

## 7. Database đã dọn và scaffold đã hoàn tất

### 7.1. Lịch sử thao tác

MCP `blocks_catalog_dev` đã xác nhận database đích là `catalog`. Tại thời
điểm kiểm tra, schema thực có năm bảng: `faculty`, `Council`, `Cycle`,
`EvaluationSchedule`, `Stakeholder`; không phải bảy bảng theo source ban đầu.
Năm bảng `CriterionRequirement`, `Criterion`, `Standard`, `StandardSet`,
`FileType` không xuất hiện trong metadata được tài khoản MCP phép đọc.

Sau khi người dùng mở rộng phạm vi thành chỉ giữ `faculty`, đã DROP đúng
bốn bảng `Council`, `Cycle`, `EvaluationSchedule`, `Stakeholder`. File
`docs/database/2026-10-22-catalogservice-faculty-only.sql` là bản ghi thao
tác đã thực hiện, không phải migration hoặc bước cần chạy lại.

Kiểm tra sau DROP thấy database vẫn còn, chỉ còn bảng `faculty`; schema,
10 dòng và checksum mở rộng `2754119180` khớp trước/sau. Metadata lúc đó
không thấy routine, trigger hoặc event; không chạy lệnh DROP các đối tượng
này. Các số liệu trên là bằng chứng tại thời điểm DROP, không phải số dòng
bắt buộc cố định mãi về sau.

Người dùng đã yêu cầu tiếp tục khi chưa xác minh backup. Không có bằng
chứng backup đã khôi phục thử thành công; không coi việc quay lại commit cũ
là cách phục hồi dữ liệu đã xóa.

### 7.2. Giới hạn bước triển khai còn lại

- Không chạy lại DROP, DELETE, TRUNCATE, migration hoặc seed trên `catalog`.
- Không thay đổi schema, dữ liệu, tên bảng hoặc tên cột của `faculty`.
- Không scaffold lại hoặc dùng `--force` ghi đè scaffold người dùng vừa tạo.
- Không tái tạo bảng hoặc thêm DbSet cũ để làm build hết lỗi.
- Không xóa dữ liệu hoặc đối tượng của SystemService hay database khác.

Kiểm tra schema nếu cần chỉ dùng metadata read-only qua MCP đúng nguồn.
Chỉ chạy CRUD trên DB kiểm thử cô lập, không trên database ứng dụng.
Mở lại service sau khi phần code còn lại build và kiểm tra bắt buộc đạt;
không tự bật lại consumer cũ hoặc tự phục hồi bảng khi startup.

### 7.3. Phục hồi

Rollback code không phục hồi các bảng đã DROP. Nếu cần phục hồi nghiệp vụ
cũ, phải xác định nguồn backup thực tế, xin xác nhận phạm vi và kiểm tra
khả năng restore riêng; không ghi đè dữ liệu `faculty` hiện tại và không
cam kết có thể khôi phục khi chưa có nguồn phục hồi được xác minh.

## 8. Phạm vi file dự kiến

| Nhóm | Thay đổi |
| --- | --- |
| `src/services/Blocks.CatalogService/Controllers/`, `Services/CoreFeature/`, `DTOs/CoreFeature/`, `Entities/` | Bỏ bốn nhóm controller/service/DTO và sáu entity cũ; giữ Faculty và đổi thông báo tên nghiệp vụ. |
| `src/services/Blocks.CatalogService/Entities/Faculty.cs`, `Infrastructure/Data/CatalogContext.cs` | Giữ scaffold mới của người dùng; kiểm tra mapping/nullability, không scaffold hoặc phục hồi model cũ. |
| `src/services/Blocks.CatalogService/Services/gRPC/`, `Protos/catalog.proto`, `Program.cs`, `Configs/ConfigService.cs`, `.csproj` | Bỏ Catalog gRPC server; giữ client phân quyền và audit. |
| `src/apps/Blocks.Web/src/Router.tsx`, `features/catalog/` | Gỡ bốn màn hình quản trị, đổi nhãn Faculty; giữ mã còn được business import. |
| `src/apps/Blocks.Web/src/components/layout/MainLayout/app-sidebar.tsx` | Không render bốn menu đã bỏ ở các cấp; giữ hành vi menu khác và dữ liệu quyền. |
| `docs/database/2026-10-22-catalogservice-faculty-only.sql` | Giữ làm lịch sử DROP bốn bảng đã chạy; không đưa vào startup hoặc chạy lại. |
| `test/CatalogService.Removal.Check.ps1`, frontend tests | Bổ sung check nguồn theo mẫu PowerShell có sẵn và Vitest gần phần bị đổi; không thêm framework mới. |
| `AGENTS.md` | Cập nhật trách nhiệm CatalogService và lệnh kiểm tra nếu thay đổi. |

Metadata menu là thay đổi dữ liệu qua API hiện có, không phải lý do sửa
source SystemService. Không sửa cấu hình secrets, AppHost, API Gateway,
FileService, thư viện dùng chung hoặc dependency không liên quan.

## 9. Kiểm chứng và nghiệm thu

### 9.1. Backend và hợp đồng

- Build trực tiếp CatalogService sau restore cần thiết:
  `dotnet build src/services/Blocks.CatalogService/Blocks.CatalogService.csproj`.
- Có regression check chạy được chứng minh context chỉ còn Faculty trong
  nhóm entity đã dọn, sáu entity cũ đã được xóa, bốn controller và bảy RPC
  bị bỏ không còn được đăng ký. Check nguồn PowerShell không thay thế kiểm
  tra runtime hoặc phân quyền.
- Kiểm tra model/SQL generation không mở DB: bảng `faculty`, tám tên cột
  snake_case, `CreatedAt` required, không có entity cũ trong EF model.
- Kiểm tra mapping `Faculty` mới sang `ModelFaculty`, giữ hợp đồng JSON
  và hành vi tự gán UUID/thời gian của service. Không sửa Shared để chữa
  thay đổi nullability nội bộ entity.
- Swagger còn đủ sáu endpoint Faculty; không còn endpoint domain bị loại.
- HTTP thật với token hợp lệ xác nhận routing domain cũ không còn phục vụ,
  không nhầm kết quả từ chối xác thực với kết quả loại bỏ route.
- Không token hoặc token sai vẫn bị từ chối theo envelope hiện có; tài khoản
  đủ quyền dùng được Faculty, tài khoản thiếu quyền ghi bị từ chối.
- Với DB kiểm thử cô lập, kiểm tra tạo, sửa, đọc, tìm kiếm, phân trang,
  combobox, xóa mềm và thông báo trùng tên/thiếu tên Phòng ban.
- Kiểm tra phân quyền và audit qua production DI cùng SystemService kiểm
  thử. Không thay function quyền bằng hàm luôn cho phép để báo đạt.

### 9.2. Database và dữ liệu

- Không có thao tác ghi DB trong đợt xóa code; giữ bằng chứng DROP ở mục 7.
- Không có DDL, DML, scaffold hoặc sửa mapping `faculty` ngoài scaffold mới.
- Không chạy các ca kiểm thử CRUD tạo/xóa dữ liệu trên database ứng dụng.
- Nếu xác minh DB bằng MCP, chỉ đọc metadata của `catalog`; không dump dữ
  liệu cá nhân, credentials hoặc toàn bộ bản ghi vào log/chat.

### 9.3. Frontend và menu

Chạy build, lint và test bằng lệnh trong AGENTS.md; chạy `npm ci` khi chưa
có dependencies, giữ `package-lock.json` và ghi riêng lỗi baseline.
Hiện chưa có test riêng trong `features/catalog`; bổ sung Vitest gần
`routes/Faculty/` cho nhãn Phòng ban và validation, cùng kiểm tra route
của bốn màn hình bị gỡ. Không coi việc không có test là kết quả test đạt.

Kiểm tra sidebar với menu trực tiếp, nhóm con, dữ liệu cache cũ, controller
khác hoa/thường, nhóm chỉ chứa menu đã bỏ và nhóm trộn với menu còn giữ.
Nhóm rỗng phải biến mất; menu khác và trạng thái active vẫn đúng.

Frontend biên dịch, không có import hỏng do dọn Catalog. Faculty hiển thị
Phòng ban ở bảng, popup, validation, sidebar và tiêu đề sau tải lại menu.
URL `/faculty`, API contract, quyền và UUID vẫn giữ nguyên.

Bốn menu cũ không còn hiển thị ngay cả khi cache chưa được tải lại; không
lọc nhầm Faculty hoặc menu của domain khác. Tên menu Faculty đổi sau đăng
xuất và đăng nhập lại. Không có thay đổi ngoài phạm vi metadata menu nêu
ở mục 6. Không tuyên bố các luồng business phụ thuộc danh mục cũ vẫn hoạt
động.

## 10. Giới hạn và bước duyệt

Các lỗi hiện có không phục vụ việc dọn này, cảnh báo dependency, cấu hình
Gateway và các tham chiếu service đã mất trong AppHost không được gom sửa.
Full-solution build hoặc AppHost startup không phải acceptance check.

Không tạo mới backend nghiệp vụ, chuyển dữ liệu sáu domain sang service
khác, xóa dữ liệu SystemService hoặc xóa màn hình business. Mọi yêu cầu
khôi phục các nghiệp vụ phụ thuộc phải có thiết kế riêng, không làm trong
đợt xóa chức năng.

Người dùng cần duyệt spec bằng file này, bao gồm tên kỹ thuật Faculty giữ
nguyên, breaking changes, phạm vi frontend và metadata menu. Sau đó mới lập
kế hoạch triển khai và chọn cách thực hiện. DB và scaffold đã hoàn tất;
duyệt bản cập nhật này không yêu cầu thực hiện lại hai bước đó.

## 11. Tài liệu kỹ thuật

- MySQL 8.0 Reference Manual, DROP TABLE Statement: loại bỏ bảng, dữ liệu,
  trigger của bảng và gây implicit commit với bảng không phải temporary.
  `https://dev.mysql.com/doc/refman/8.0/en/drop-table.html`
- Microsoft Learn, EF Core Reverse Engineering: chọn bảng khi scaffold,
  dùng `--no-onconfiguring`, bảo vệ thay đổi khi dùng `--force`.
  `https://learn.microsoft.com/en-us/ef/core/managing-schemas/scaffolding/`

Tài liệu DROP chỉ giải thích thao tác lịch sử, không phải yêu cầu chạy DDL
thêm. Giữ phiên bản EF Core 8.0.22 và Pomelo 8.0.3 trong `.csproj`; không
giả định phiên bản server từ collation trong model.
