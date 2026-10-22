# CatalogService chỉ giữ danh mục Phòng ban

Ngày: 2026-10-22

Trạng thái: Bản spec đề xuất để người dùng duyệt. Đã xác nhận xóa dữ liệu và
drop đúng sáu bảng bị loại, giữ database cùng bảng và dữ liệu `Faculty`.
Chưa triển khai code, chạy SQL hoặc kiểm tra bản sao lưu.

## 1. Mục tiêu và quyết định

CatalogService chỉ quản lý danh mục Phòng ban, kế thừa chức năng `Faculty`
hiện có. Loại bỏ loại tài liệu, đối tượng khảo sát, bộ tiêu chuẩn, tiêu chuẩn,
tiêu chí và yêu cầu minh chứng khỏi dịch vụ.

Các yêu cầu đã xác nhận:

- Giữ `Faculty`, đổi tên nghiệp vụ từ Khoa thành Phòng ban.
- Xóa dữ liệu và drop sáu bảng: `CriterionRequirement`, `Criterion`,
  `Standard`, `StandardSet`, `FileType`, `Stakeholder`.
- Giữ nguyên database, bảng `Faculty` và toàn bộ dữ liệu hiện có của bảng này.
- Không thực hiện `DROP DATABASE`.

Đề xuất kỹ thuật trong spec: giữ tên `Faculty`, DTO, URL, khóa quyền và tên
bảng hiện có; chỉ đổi tên hiển thị và thông báo nghiệp vụ. Việc đổi đồng bộ
sang `Department` không nằm trong đợt này.

Kết quả mong muốn là một CatalogService nhỏ hơn, không còn phục vụ các
danh mục bị bỏ, nhưng Phòng ban vẫn dùng được các quyền và dữ liệu cũ.

## 2. Hiện trạng và ảnh hưởng

Mốc source: `e2c5bf0ad87084c2050c9b902393501b1034402e`.
Các đường dẫn dưới đây tính từ repository root.

| Vị trí | Hiện trạng ảnh hưởng thiết kế |
| --- | --- |
| `src/services/Blocks.CatalogService/Infrastructure/Data/CatalogContext.cs` | Có bảy DbSet; model `Faculty` không có quan hệ tới sáu entity bị bỏ. Schema DB thực phải được kiểm tra riêng trước DDL. |
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

## 3. Các phương án

| Phương án | Đánh đổi |
| --- | --- |
| **Đề xuất: giữ tên kỹ thuật Faculty, bỏ sáu danh mục và bảng tương ứng** | Giữ hợp đồng Phòng ban và khóa quyền cũ; các API bị bỏ là breaking change có chủ đích. |
| Đổi cả code, API, khóa quyền và bảng thành Department | Tên kỹ thuật đúng nghiệp vụ mới hơn, nhưng phải chuyển schema và metadata quyền; tăng rủi ro mất tương thích không cần thiết. |
| Chỉ ẩn danh mục hoặc giữ bảng cũ | Ít tác động hơn nhưng không đáp ứng yêu cầu xóa dữ liệu và drop sáu bảng đã xác nhận. |

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

## 5. Loại bỏ mã Catalog không còn dùng

Trong `src/services/Blocks.CatalogService/`:

- Xóa controller, service, interface, profile và DTO riêng của `FileType`,
  `Stakeholder`, `StandardSet`, `Standard`; gồm DTO Criterion và Requirement.
- Bỏ sáu entity và mapping tương ứng; `CatalogContext` chỉ còn model Faculty
  trong nhóm bảy entity hiện tại.
- Bỏ `Services/gRPC/CatalogGrpcService.cs`, `Protos/catalog.proto` và mục
  protobuf server tương ứng trong `.csproj`.
- Bỏ `MapGrpcService<CatalogGrpcService>`, middleware gRPC-Web server và
  `AddGrpc` khi không còn server nào khác.
- Bỏ enum, using và helper chỉ phục vụ các domain bị xóa sau khi đối chiếu
  caller. Không dọn helper dùng chung theo tên hoặc theo phỏng đoán.

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

Các API, type, hook và component vẫn được `features/business` import phải
được giữ để frontend biên dịch. Ví dụ có `useFileTypeOptions`, `standard.api`,
`standardset.api`, `stakeholder.types`, `MultiStandardSetPanel` và
`StandardCriteriaTable`. Không di chuyển chúng chỉ để làm sạch tên thư mục;
không xóa cả `features/catalog`, `features/business` hay constants dùng chung.

Đây không phải chuyển các domain cũ sang service mới. Các luồng business còn
gọi API bị bỏ sẽ không hoạt động sau rollout; việc giữ mã consumer không có
nghĩa là giữ nghiệp vụ chạy được. Người dùng phải duyệt giới hạn này cùng
spec. Nếu cần duy trì chúng, phải tách thiết kế chuyển domain trước khi drop
bảng; không thể vừa xóa backend và dữ liệu vừa cam kết giữ các luồng đó.

Trong `app-sidebar.tsx`, loại đúng bốn khóa controller `filetype`,
`stakeholder`, `standard`, `standardset` khỏi tập menu dùng để render.
Áp dụng nhất quán cho menu trực tiếp và menu trong nhóm con, kể cả dữ liệu
menu cũ còn cache. Giữ tất cả menu khác và không thay đổi tập quyền trong
AuthContext. Không thêm bộ lọc IsShowMenu tổng quát cho mọi domain vì đó là
thay đổi hành vi ngoài phạm vi.

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

## 7. Xóa dữ liệu và drop bảng an toàn

### 7.1. Điều kiện bắt buộc

Ý định hủy dữ liệu sáu bảng đã được người dùng xác nhận. Việc đó không cho
phép xóa bảng khác, xóa database hoặc bỏ qua kiểm tra môi trường.

Trước khi chạy DDL:

1. Dùng DBHub `blocks_dbhub`, source `blocks_catalog_dev`; xác minh database
   thực, server, phiên bản MySQL, storage engine và sáu bảng đúng chữ hoa
   thường; xác nhận đây là base table, không phải view. Không đoán tên
   database từ tên service hoặc connection-string key.
2. Kiểm tra metadata và số hàng; không đưa email, dữ liệu cá nhân, credentials
   hoặc toàn bộ nội dung bảng vào log/chat. Chụp trạng thái schema và dữ liệu
   Faculty để so sánh nội bộ sau thao tác.
3. Kiểm kê foreign key, view, trigger, routine, scheduled event và consumer
   liên quan. Nếu có dependency từ ngoài sáu bảng hoặc từ Faculty, dừng và
   xử lý phạm vi riêng; không tự drop dependency bên ngoài.
4. Xác minh bản sao lưu đủ schema và dữ liệu để phục hồi, cùng bằng chứng
   restore được trên môi trường cô lập. Giữ backup ở nơi riêng có kiểm soát
   truy cập; không commit dump hoặc connection string vào Git.
5. Ngừng writer, job và các dịch vụ đang dùng các bảng này trong cửa sổ bảo
   trì. Không drop khi bản triển khai cũ vẫn xử lý request liên quan.
6. Ghi SQL được review vào Git trước khi áp dụng. Bản SQL chỉ được phép tác
   động đúng sáu bảng đã xác minh trong database đích.

Thiếu backup, thiếu xác minh đích hoặc thiếu quyền là điều kiện dừng thao
tác DB, không phải lý do đổi credentials, nguồn dữ liệu hay tắt bảo vệ.
Nếu DBHub không khả dụng, báo rõ và chỉ dùng fallback theo AGENTS.md.

### 7.2. Thao tác và thứ tự

Drop theo thứ tự phụ thuộc trong model hiện có, đối chiếu lại schema thực:

1. `CriterionRequirement`
2. `Criterion`
3. `Standard`
4. `StandardSet`
5. `FileType`
6. `Stakeholder`

`DROP TABLE` đã loại bỏ dữ liệu, không cần chạy DELETE hoặc TRUNCATE trước.
Không dùng `DROP DATABASE`, `FOREIGN_KEY_CHECKS=0`, lệnh wildcard hoặc drop
mọi bảng trừ Faculty.

MySQL DDL không được coi là transaction có thể rollback toàn bộ. Nếu lỗi
giữa chừng, ghi nhận trạng thái đã thực hiện, giữ bảo trì và đối chiếu trước
khi chạy tiếp. Không tự replay script hoặc che trạng thái thiếu bảng bằng
`IF EXISTS` rồi báo thành công.

Sau thao tác, database và Faculty phải còn nguyên; đúng sáu bảng không còn.
Không xóa bảng khác nếu database còn chứa đối tượng ngoài bảy bảng đã biết.

### 7.3. Đồng bộ model và phục hồi

Theo database-first, SQL phải được review, áp dụng trên đúng DB phát triển
đã cho phép, rồi mới scaffold model bị ảnh hưởng bằng EF/Pomelo đúng phiên
bản dự án. Chỉ chọn bảng Faculty; dùng `--no-onconfiguring`, không sinh
connection string vào code.

Review file sẽ bị ghi đè trước `--force`, giữ custom/partial code, không
purge thư mục entity. So sánh mapping và entity Faculty trước/sau; mọi thay
đổi schema hoặc dữ liệu ngoài phạm vi phải được loại khỏi diff.

Trong cửa sổ bảo trì, chỉ mở lại dịch vụ sau khi code đã đồng bộ schema,
build và các kiểm tra bắt buộc đạt. Không tự phục hồi các bảng bị drop bằng
migration, seed hoặc lúc ứng dụng khởi động.

Khi cần quay lại phiên bản cũ, code rollback không đủ vì bảng đã mất. Phải
restore schema và dữ liệu liên quan từ backup trước khi bật lại consumer
cũ; không restore đè Faculty hiện tại. Việc phục hồi dữ liệu cũng cần xác
nhận phạm vi đích và kiểm tra liên kết trước khi chạy.

## 8. Phạm vi file dự kiến

| Nhóm | Thay đổi |
| --- | --- |
| `src/services/Blocks.CatalogService/Controllers/`, `Services/CoreFeature/`, `DTOs/CoreFeature/`, `Entities/` | Bỏ sáu domain; giữ Faculty và đổi thông báo tên nghiệp vụ. |
| `src/services/Blocks.CatalogService/Infrastructure/Data/CatalogContext.cs` | Đồng bộ DB-first; giữ mapping Faculty, bỏ mapping domain cũ. |
| `src/services/Blocks.CatalogService/Services/gRPC/`, `Protos/catalog.proto`, `Program.cs`, `Configs/ConfigService.cs`, `.csproj` | Bỏ Catalog gRPC server; giữ client phân quyền và audit. |
| `src/apps/Blocks.Web/src/Router.tsx`, `features/catalog/` | Gỡ bốn màn hình quản trị, đổi nhãn Faculty; giữ mã còn được business import. |
| `src/apps/Blocks.Web/src/components/layout/MainLayout/app-sidebar.tsx` | Không render bốn menu đã bỏ ở các cấp; giữ hành vi menu khác và dữ liệu quyền. |
| `docs/database/2026-10-22-catalogservice-faculty-only.sql` | SQL hủy đúng sáu bảng, bổ sung ở bước triển khai sau preflight. |
| `test/`, frontend Faculty tests | Kiểm tra hồi quy tập trung; chọn cơ chế cụ thể khi lập kế hoạch, không thêm framework mới. |
| `AGENTS.md` | Cập nhật trách nhiệm CatalogService và lệnh kiểm tra nếu thay đổi. |

Metadata menu là thay đổi dữ liệu qua API hiện có, không phải lý do sửa
source SystemService. Không sửa cấu hình secrets, AppHost, API Gateway,
FileService, thư viện dùng chung hoặc dependency không liên quan.

## 9. Kiểm chứng và nghiệm thu

### 9.1. Backend và hợp đồng

- Build trực tiếp CatalogService sau restore cần thiết:
  `dotnet build src/services/Blocks.CatalogService/Blocks.CatalogService.csproj`.
- Có regression check chạy được chứng minh context chỉ còn Faculty trong
  nhóm entity đã dọn, bốn controller và bảy RPC bị bỏ không còn được đăng ký.
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

- Lưu bằng chứng preflight và xác minh backup trước khi thực hiện.
- Sau DDL, metadata xác nhận đúng sáu bảng đã mất, Faculty và database còn.
- Đối chiếu schema, số hàng và toàn bộ giá trị Faculty trước/sau bằng cơ chế
  so sánh nội bộ; chỉ bằng nhau về số hàng không đủ chứng minh dữ liệu giữ
  nguyên. Kiểm tra bảng ngoài phạm vi không bị thay đổi.
- Không chạy các ca kiểm thử CRUD tạo/xóa dữ liệu trên database ứng dụng.
- Không có `DROP DATABASE`, DDL Faculty hoặc tắt foreign-key checks trong SQL.

### 9.3. Frontend và menu

Chạy build, lint và test bằng lệnh trong AGENTS.md; ghi riêng lỗi baseline.
Thêm kiểm tra gần Faculty cho nhãn Phòng ban và validation, cùng kiểm tra
route của bốn màn hình bị gỡ. Kiểm tra sidebar với menu trực tiếp, menu nhóm
con, dữ liệu cache cũ và menu của domain khác.

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
duy trì các nghiệp vụ phụ thuộc phải có thiết kế riêng trước DDL.

Người dùng cần duyệt spec bằng file này, bao gồm tên kỹ thuật Faculty giữ
nguyên, breaking changes, phạm vi frontend và metadata menu. Sau đó mới lập
kế hoạch triển khai và chọn cách thực hiện. Duyệt ý định drop sáu bảng không
thay thế kiểm tra backup, môi trường và điều kiện bảo trì.

## 11. Tài liệu kỹ thuật

- MySQL 8.0 Reference Manual, DROP TABLE Statement: loại bỏ bảng, dữ liệu,
  trigger của bảng và gây implicit commit với bảng không phải temporary.
  `https://dev.mysql.com/doc/refman/8.0/en/drop-table.html`
- Microsoft Learn, EF Core Reverse Engineering: chọn bảng khi scaffold,
  dùng `--no-onconfiguring`, bảo vệ thay đổi khi dùng `--force`.
  `https://learn.microsoft.com/en-us/ef/core/managing-schemas/scaffolding/`

Khi triển khai, đối chiếu tài liệu với phiên bản MySQL và EF/Pomelo thực tế;
không giả định phiên bản server từ collation trong model.
