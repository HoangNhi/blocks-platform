# CatalogService: .NET 10, EF Core 10 và Oracle MySQL provider

Ngày: 2026-10-22

Trạng thái: Người dùng đã duyệt spec và yêu cầu triển khai plan bằng subagent ngày
2026-10-22, làm trên checkout hiện tại, không tạo worktree. Quyền triển khai code
không cấp quyền tạo fixture hoặc ghi DB; các điều kiện môi trường, E2E và license
bên dưới vẫn giữ nguyên.

## 1. Mục tiêu và phạm vi

Nâng riêng CatalogService từ .NET 8 lên .NET 10, EF Core 8 lên EF Core 10;
thay `Pomelo.EntityFrameworkCore.MySql` bằng `MySql.EntityFrameworkCore`
do Oracle/MySQL phát hành. Giữ EF Core, không chuyển sang ORM khác.

Giữ chức năng Phòng ban dựa trên `Faculty`: API, DTO, tên bảng/cột, UUID,
dữ liệu, tìm kiếm/phân trang, xóa mềm, JWT, quyền và audit. Thay provider
không được yêu cầu chuyển dữ liệu hoặc thay đổi schema ứng dụng.

Phạm vi gồm project service, đăng ký DB, mapping phụ thuộc provider, Dockerfile,
harness Catalog và tài liệu vận hành liên quan. Không nâng toàn solution,
FileService, Shared hoặc ServiceDefaults; không sửa AppHost đang tham chiếu
BusinessService/CollabService đã vắng mặt.

Đây là thay đổi nền tảng có kiểm thử tương thích, không chỉ đổi TargetFramework.
Build đạt không đủ chứng minh provider mới đọc/ghi được dữ liệu hiện có.

## 2. Hiện trạng và bằng chứng

Mốc phân tích: HEAD `70ec28ffaadd5cf2312bb0399b74bc4f539d6120` và working tree
ngày 2026-10-22. Đường dẫn trong tài liệu tính từ repository root.

Thay đổi có sẵn phải giữ nguyên: `AGENTS.md`, hai request DTO User của
SystemService, `test/SystemService.CleanupChecks/Program.cs` và plan FileService
chưa được track. Không gom chúng vào commit Catalog hoặc tài liệu này.

| Thành phần | Hiện trạng |
| --- | --- |
| `src/services/Blocks.CatalogService/Blocks.CatalogService.csproj` | `net8.0`; JwtBearer/EF Design/EF Tools `8.0.22`; Pomelo `8.0.3`. |
| `Configs/ConfigService.cs` của Catalog | `UseMySql` + `ServerVersion.AutoDetect`; `AuditInterceptor` gắn vào DbContext; hai gRPC client System và Audit còn dùng. |
| `Infrastructure/Data/CatalogContext.cs` của Catalog | Chỉ có Faculty; `.HasCharSet("utf8mb4")` và các convention/annotation phụ thuộc Pomelo. |
| `Entities/Faculty.cs` của Catalog | `Guid Id`, `DateTime CreatedAt`, `DateTime? UpdatedAt`, `bool? IsActived`, `bool IsDeleted`; không đổi public CLR types. |
| `Services/CoreFeature/Faculty/FacultyService.cs` của Catalog | LINQ/FindAsync/CountAsync/Skip/Take; tự gán UUID, actor và UTC timestamp; SaveChangesAsync cho audit. |
| `test/CatalogService.CleanupChecks` | `net8.0`, EF/Relational `8.0.22`; hai mode `contract`, `runtime`; contract dùng API Pomelo. |
| Dockerfile Catalog | Runtime và SDK image đều `8.0`; chạy bằng `$APP_UID`. |
| Shared và ServiceDefaults | `net8.0`; giữ nguyên target để không buộc consumer khác nâng cấp. |

Spec cleanup Faculty trước đó ghi nhận checks/build đạt nhưng CRUD/audit tích hợp
NOT RUN. Đây là kết quả lịch sử, không phải baseline mới đã chạy cho đợt nâng cấp.
Trong đợt viết spec chỉ đọc source, tài liệu và metadata DB; chưa restore/build/test
provider Oracle.

### 2.1. Metadata DB đã đọc

Đã dùng DBHub nguồn `blocks_catalog_dev`, xác nhận `DATABASE() = catalog`;
chỉ chạy tìm đối tượng và SELECT metadata, không đọc bản ghi ứng dụng.

Kết quả: bảng `faculty`, engine InnoDB, collation `utf8mb4_0900_ai_ci`,
primary key `PRIMARY(id)`. Server tự báo `VERSION() = 26.10.0`,
`@@version_comment = MySQL Community Server - GPL`; session/global timezone
`SYSTEM`, system timezone `UTC`. Đây là giá trị quan sát, không suy phiên bản
server từ package Connector/NET hoặc collation. Trước kiểm thử/deploy phải
xác minh lại engine/version thực, không tự nâng MySQL server.

| Cột | Kiểu thực | Nullable | Default thực |
| --- | --- | --- | --- |
| `id` | `char(36)` | Không | `uuid()` |
| `name` | `text` | Không | Không |
| `created_at` | `timestamp` | Không | `CURRENT_TIMESTAMP` |
| `created_by` | `varchar(255)` | Không | Không |
| `updated_at` | `timestamp` | Có | `CURRENT_TIMESTAMP` |
| `updated_by` | `varchar(255)` | Có | Không |
| `is_actived` | `tinyint(1)` | Không | `1` |
| `is_deleted` | `tinyint(1)` | Không | `0` |

Các cột chuỗi dùng `utf8mb4` / `utf8mb4_0900_ai_ci`. Không có
`ON UPDATE CURRENT_TIMESTAMP` trong metadata vừa đọc.
`Faculty.IsActived` nullable ở CLR nhưng cột DB NOT NULL: giữ hành vi hiện có,
không tự đổi entity hoặc schema để đồng nhất nullability.

## 3. Các phương án và quyết định

| Phương án | Đánh đổi và quyết định |
| --- | --- |
| **.NET 10 + EF Core 10 + Oracle provider** | Người dùng đồng ý đánh giá hướng này. Giữ kiến trúc EF/audit, nhưng đổi cả provider và ADO.NET driver; phải kiểm thử dữ liệu thật trên DB cô lập. |
| .NET 10, giữ EF Core 8 + Pomelo 8 | Diff nhỏ hơn, tránh đổi driver; không đạt mục tiêu EF Core 10. Không chọn cho spec này. |
| Dapper/LINQ to DB hoặc Devart | Hai lựa chọn đầu phải sửa lớp truy cập dữ liệu/audit; Devart thêm sản phẩm thương mại. Không có nhu cầu tương ứng để mở rộng phạm vi. |

Không thêm abstraction provider, repository mới, dual-provider runtime,
feature flag hoặc cơ chế tự fallback sang Pomelo.

### 3.1. Package đích

Đối chiếu NuGet chính thức ngày 2026-10-22:

| Thành phần | Đích thiết kế |
| --- | --- |
| Catalog và CleanupChecks | `net10.0`. |
| Oracle provider | `MySql.EntityFrameworkCore` `10.0.12`, stable phát hành 2026-10-21. |
| ADO.NET driver | `MySql.Data`, dependency của Oracle provider; metadata hiện yêu cầu ít nhất `26.10.0`. Không giữ MySqlConnector chỉ để tương thích API Pomelo. |
| Google.Protobuf của Catalog | `3.35.0`, nâng tối thiểu từ `3.33.2` do dependency group net10.0 của `MySql.Data` `26.10.0` yêu cầu >= `3.35.0`; không đổi protobuf contract hoặc package service khác. |
| Microsoft EF Core, Relational, Design và Tools đang khai báo | Đồng bộ `10.0.13`; runtime graph không lẫn EF 8/9. |
| JwtBearer của Catalog | `10.0.13`, đồng bộ dòng ASP.NET Core 10 đang dùng ở SystemService. |
| Docker SDK/runtime | Image chính thức `sdk:10.0` / `aspnet:10.0`. |

Với target `net10.0`, Oracle `10.0.12` khai báo EF Core/Relational >= `10.0.12`.
Đề xuất dùng Microsoft patch `10.0.13` là quyết định kỹ thuật trong spec,
chưa phải tổ hợp đã kiểm thử. Không suy rằng số patch provider phải bằng EF.

Giữ package khác ở phiên bản hiện có nếu không có lỗi tương thích do thay đổi.
AutoMapper `16.0.0` có advisory đã ghi ở spec trước: ghi riêng baseline, không
tuyên bố hết cảnh báo bảo mật hoặc âm thầm mở rộng thành đợt hardening.
Không dùng NoWarn, audit suppression, prerelease hoặc downgrade EF để ép xanh.
Nếu graph mới có advisory hoặc tổ hợp package không hoạt động, dừng và cập nhật
thiết kế trước khi đổi provider/version khác.

Oracle package công bố license `GPL-2.0-only WITH Universal-FOSS-exception-1.0`.
Chủ dự án phải xác nhận điều kiện sử dụng/phân phối phù hợp trước phát hành.
Lựa chọn kỹ thuật không thay thế rà soát license; không tự kết luận dự án
closed-source được hoặc không được dùng.

Làm rõ khi triển khai ngày 2026-10-22: dependency group `net10.0` trong
`https://api.nuget.org/v3-flatcontainer/mysql.data/26.10.0/mysql.data.nuspec`
xác nhận yêu cầu Google.Protobuf `3.35.0`. Đây là nâng dependency bắt buộc để tránh
NU1605, thuộc ngoại lệ tương thích bên trên, không phải đợt nâng package diện rộng.

## 4. Thiết kế chuyển provider

### 4.1. Đăng ký DB và cấu hình kết nối

Trong `Configs/ConfigService.cs`, thay `UseMySql(..., ServerVersion.AutoDetect(...))`
bằng API Oracle `UseMySQL(...)` trong đăng ký `AddDbContext<CatalogContext>`
hiện có. Giữ lifetime và `.AddInterceptors(...)`; không đưa kết nối vào
`OnConfiguring`, startup migration hoặc service singleton.

Giữ khóa `ConnectionStrings:Catalog` và nguồn secret hiện có. Dùng
`MySql.Data.MySqlClient.MySqlConnectionStringBuilder` để kiểm tra tương thích
các tùy chọn kết nối thay vì sửa chuỗi bằng regex hoặc log toàn bộ chuỗi.
Driver Oracle khác MySqlConnector; không giả định mọi connection option giống nhau.
Option không hỗ trợ phải được báo bằng tên option đã che giá trị, không tự bỏ qua.
Không đổi credentials, endpoint, database hoặc hạ TLS để làm kết nối thành công.
Nếu cần sửa local secret phải báo rõ trước và giữ ngoài Git/log/chat.

Không còn phụ thuộc `ServerVersion.AutoDetect`. Resolve DI/model và SQL generation
không được mở DB; kiểm chứng điều này trong harness với địa chỉ không kết nối được.
Lỗi kết nối thật tiếp tục đi qua xử lý lỗi hiện có, không trả dữ liệu giả.

### 4.2. Mapping database-first

Chỉ chỉnh mapping phụ thuộc provider trong `CatalogContext`; không scaffold đè
entity/context hiện có, không sửa schema hoặc tạo migration.
Giữ `OnModelCreatingPartial`, đúng một DbSet Faculty và tám thuộc tính.

- Thay `.HasCharSet` và annotation/getter Pomelo bằng API/metadata Oracle
  tương ứng. Oracle có `ForMySQLHasCharset` / `ForMySQLHasCollation`; xác nhận
  overload/namespace trong đúng package đã pin, không đoán từ casing trong docs.
- Xác minh triển khai: model `HasCharSet` ghi `MySQL:Charset`; model `UseCollation`
  gọi EF relational `SetCollation`, đọc bằng public `GetCollation()`, không đòi
  model annotation `MySQL:Collation`. `ToQueryString()` của Oracle nội suy giá trị
  chuỗi/phân trang để hiển thị; kiểm tra binding bằng public `CreateDbCommand()`
  không mở kết nối, thay vì suy command thực từ chuỗi chẩn đoán.
- Giữ `ToTable("faculty")`, primary key và tám tên cột snake_case.
  Giữ `text`, `varchar(255)`, `timestamp`, charset/collation ở đúng table/column;
  không xóa kiểm tra charset chỉ vì API cũ không còn.
- Khóa `Guid` phải đọc/ghi dạng `char(36)` hiện có. Oracle driver mặc định
  `OldGuids=false` dùng CHAR(36); không bật binary GUID hoặc đổi thứ tự byte.
  Chỉ thêm converter khi thử nghiệm chứng minh cần, không mặc định chuyển Guid
  thành string ở entity/API.
- Giữ ID do FacultyService cấp; không để provider ghi đè UUID client hợp lệ
  hoặc biến thành Guid.Empty. Default DB `uuid()` được giữ ở schema;
  không thêm value-generation convention mới chỉ để làm model giống scaffold mới.
- Giữ `tinyint(1)` cho hai cờ. Kiểm tra false/true và `IsActived=null`:
  null phải giữ semantics hiện có với default DB, không bị biến thành false
  ngoài ý muốn. Không đổi CLR `bool?` sang `bool` trong đợt này.
- Giữ `CURRENT_TIMESTAMP` và nullability của hai timestamp; không thêm
  tự cập nhật `UpdatedAt`, đổi thành datetime hoặc thay default bằng UTC function.
  UTC do service cấp và chuỗi JSON UTC+7 qua converter Shared phải không lệch giờ.

Nếu Oracle không biểu diễn được schema hiện tại mà phải chuyển dữ liệu/DDL,
không tiếp tục theo spec này; đưa bằng chứng và xin quyết định mới.

### 4.3. Query và ghi dữ liệu

Giữ LINQ và service hiện có trước; chỉ sửa expression nếu xác nhận Oracle
không dịch được và có test chứng minh semantics tương đương.

Kiểm thử chính xác các mẫu đang dùng: `FindAsync(Guid)`, so trùng tên với
`!IsDeleted`, loại ID đang sửa, `Name.Contains`, `CountAsync`, sắp xếp
`UpdatedAt.HasValue ? UpdatedAt : CreatedAt`, `Skip/Take`, combobox active.
Không đổi sang client evaluation, tải hết bảng rồi phân trang hoặc SQL ghép chuỗi.

Insert/update/delete-list tiếp tục gọi `SaveChangesAsync`; không thay bằng
bulk API hoặc ExecuteUpdate bỏ qua ChangeTracker/AuditInterceptor.
Batch delete lỗi giữa chừng không được persist một phần; SQL lỗi không được
phát audit thành công. Giữ xóa mềm, không phát DELETE vật lý.

Không gom sửa hành vi cũ như GetById/Update có thể tìm bản ghi xóa mềm,
quy tắc trùng tên/race condition hoặc thứ tự khi timestamp bằng nhau.
Nếu baseline có lỗi, ghi riêng; không viết test đòi hành vi khác rồi chữa
nghiệp vụ trong đợt đổi provider.

### 4.4. JWT, quyền và audit

Giữ sáu route Faculty, HTTP/application envelope `Success`, `StatusCode`,
`Data`, `Message`; HTTP 200 có thể chứa lỗi 401/403 như hiện có.
Không thay protobuf, field number, client gRPC-Web hoặc JWT forwarding.

Nâng JwtBearer phải kiểm tra raw claims `name` (user ID), `unique_name`
(username), `role` và `User.Identity.Name`. Permission filter và audit đọc
raw claims, FacultyService đọc Identity.Name; test hiện tại chưa chứng minh
chúng hoạt động trên request Faculty đã authorize.

Đề xuất cấu hình tường minh `MapInboundClaims=false`,
`NameClaimType=unique_name`, `RoleClaimType=role` theo contract token SystemService,
nhưng phải ghi nhận baseline trước sửa. Đây là thay đổi tương thích có chủ đích
để giữ raw claims và actor đúng, không được đổi issuer/audience/signing/lifetime
validation hoặc quyền ADD/UPDATE/DELETE để làm test đạt.

Giữ production AuditInterceptor và AuditActionFilter: mutation thành công có
old/new values, actor, entity ID; không audit success trước SaveChanges thành công.
Audit hiện gửi background gRPC với retry, không phải outbox hoặc bảo đảm giao nhận
đúng một lần. Không refactor độ tin cậy audit trong migration; test phải chờ
capture có timeout, không dùng sleep tùy ý hoặc suy từ HTTP response rằng đã
persist audit ở SystemService.

## 5. Ranh giới file

| File | Thay đổi dự kiến khi triển khai |
| --- | --- |
| `src/services/Blocks.CatalogService/Blocks.CatalogService.csproj` | Retarget, thay provider, đồng bộ Microsoft EF/JWT packages. |
| `src/services/Blocks.CatalogService/Configs/ConfigService.cs` | Đăng ký Oracle, giữ audit/DI/gRPC; kiểm tra option kết nối khi cần. |
| `src/services/Blocks.CatalogService/Infrastructure/Data/CatalogContext.cs` | Chuyển mapping phụ thuộc Pomelo, giữ schema contract. |
| `src/services/Blocks.CatalogService/Configs/ConfigureAuthentication.cs` | Cấu hình claim tường minh kèm regression test nếu baseline xác nhận cần. |
| `src/services/Blocks.CatalogService/Dockerfile` | SDK/runtime 10; giữ user, port và build context. |
| `test/CatalogService.CleanupChecks/CatalogService.CleanupChecks.csproj` | Retarget và đồng bộ EF/Relational. |
| `test/CatalogService.CleanupChecks/Program.cs` | Thay API Pomelo; mở rộng checks query/claims/provider integration. Có thể tách một file fixture test nếu Program khó đọc. |
| `test/CatalogService.Removal.Check.ps1` | Giữ checks cleanup; thêm guard target/provider nếu phù hợp, không thay assertions domain cũ. |
| `AGENTS.md` | Khi triển khai, chỉ cập nhật target Catalog/harness và lệnh mới; giữ thay đổi đang có. |

Không sửa `Entities/Faculty.cs`, DTO, controller hoặc service nếu chưa có bằng
chứng lỗi tương thích cần sửa. Không sửa SystemService, Shared, ServiceDefaults,
Gateway, AppHost, frontend, SQL lịch sử hoặc cấu hình chứa secret.
Không tạo bản copy thư viện dùng chung hoặc framework kiểm thử mới.

## 6. Kiểm thử và nghiệm thu

### 6.1. Baseline và DB-free bắt buộc

Khi được duyệt triển khai, ghi baseline bằng checks hiện tại trước đổi package.
Mở rộng console harness có sẵn, không thêm test framework:

| Nhóm | Điều kiện đạt |
| --- | --- |
| Source/graph | Catalog và harness net10.0; Oracle provider hiện diện; graph Catalog/harness không còn Pomelo/MySqlConnector và EF 8/9. Package khác còn advisory phải báo riêng. |
| Model | Đúng Faculty/tám cột/PK; CLR types, nullability/defaults và store types giữ contract. Kiểm tra charset/collation bằng metadata Oracle đúng cấp, không dựa annotation Pomelo. |
| SQL | Dịch được các query mục 4.3, gồm pagination/search và filter bool; assert cấu trúc/parameterization cần thiết, không snapshot toàn bộ SQL hoặc tên parameter. |
| Mapping/validation | Giữ AutoMapper, CreatedAt DTO nullable, thông báo Phòng ban và JSON timestamp hiện có. |
| Runtime | Startup, Swagger đủ sáu route; domain cũ 404 với JWT hợp lệ; thiếu/sai/hết hạn token giữ envelope lỗi; không mở DB. |
| Claims | JWT có user ID/username/role biết trước; endpoint chỉ thuộc fixture đọc principal sau auth, assert raw claims và Identity.Name. Không thêm endpoint debug vào production. |
| Hosting | Smoke production DI/health qua ServiceDefaults với cấu hình test; model resolution không kết nối DB. Không dùng ValidateOnBuild ép resolve mọi dependency DB. |

`contract` dùng Oracle `UseMySQL` với connection fixture không thể kết nối,
không AutoDetect/OpenConnection/EnsureCreated/SaveChanges.
`runtime` giữ DB-free và configuration in-memory, không nạp appsettings/user secrets.
Không thay các mode hiện có thành mode cần DB mà vẫn gọi DB-free.

### 6.2. MySQL provider integration bắt buộc trước nghiệm thu đầy đủ

Đề xuất mode mới `provider` trong cùng harness. Chỉ chạy sau khi người dùng
cho phép môi trường test cụ thể. Biến đầu vào
`CATALOGSERVICE_UPGRADE_TEST_CONNECTION`; không fallback sang cấu hình ứng dụng.

Mode này phải được thêm vào harness .NET 8 trước khi đổi package để có baseline
Pomelo chạy được, rồi tái sử dụng cùng assertions dưới Oracle. Trên baseline
dùng connection builder/driver MySqlConnector đã có; sau migration thay setup
bằng Oracle builder/driver. Không cài hai provider cùng lúc hoặc tạo project
baseline mới. Nếu chưa được phép chạy DB, vẫn có thể viết plan và chuẩn bị
DB-free/code migration, nhưng phải ghi baseline provider NOT RUN; không được
chốt nghiệm thu provider trước khi có so sánh trên hai revision và fixture riêng.

Guard trước mọi write: parse bằng Oracle connection builder; chỉ TCP localhost
(`127.0.0.1`, `::1` hoặc `localhost`), database chính xác
`blocks_catalogservice_upgrade_test`, credentials không in log.
Sau mở kết nối phải xác nhận lại DATABASE()/engine/version. Database phải được
provision trước, không tự tạo/drop DB; database ứng dụng `catalog` bị từ chối.

Fixture tạo bảng tên `faculty` theo DDL metadata mục 2.1 chỉ trong database test
trống đã được cho phép; nếu bảng đã tồn tại thì fail, không truncate/drop hoặc
chiếm dữ liệu sẵn có. Dọn chỉ bảng do chính lần chạy tạo, trong finally; không
drop database. Chạy tuần tự, không chia sẻ bảng giữa worker.
DDL test này không phải migration schema ứng dụng và không được chạy qua startup.

Nếu process bị kill để lại bảng `faculty`, lần sau vẫn phải fail; không thêm
`--force` hoặc tự DROP TABLE IF EXISTS. Báo rõ đối tượng còn sót, không log secret.
Chỉ dọn sau khi người dùng xác nhận đúng fixture và cho phép riêng; nếu không
xác minh được quyền sở hữu thì không xóa. Đây là bước phục hồi thủ công, không
phải khả năng tự chạy lại an toàn sau mọi loại crash.

Kiểm thử bằng production FacultyService, context registration và interceptor:

- Seed UUID/text/defaults bằng SQL parameterized trong fixture rồi đọc lại qua EF;
  insert qua service rồi kiểm tra raw SQL và context mới. Không kiểm tra round-trip
  chỉ bằng cùng ChangeTracker. Có case UUID do caller cấp và UUID tự sinh.
- True/false/null IsActived, IsDeleted, insert active/inactive và combobox;
  so sánh baseline cho default/sentinel, không đổi test để chấp nhận sai lệch.
- Tên tiếng Việt có dấu, so trùng tên theo collation, tìm kiếm Contains, count,
  phân trang và thứ tự với timestamp khác nhau; cập nhật không nhầm bản ghi.
- Timestamp cố định ở độ chính xác cột timestamp, UpdatedAt null/default;
  actor và JSON UTC+7 không lệch múi giờ. Ghi nhận timezone fixture tường minh.
- Insert/update/soft delete và batch lỗi không persist một phần; lỗi DB không
  phát audit success. Không physical delete dữ liệu qua API.
- AuditInterceptor thật chạy qua SaveChangesAsync; test có thể capture
  `AuditProtoClient` bằng CallInvoker test-only để assert payload/old/new values,
  action và actor. Capture này không chứng minh gRPC authorization hoặc audit
  persistence ở SystemService. Không thay interceptor bằng fake.

Không nạp hai provider EF vào cùng process để so sánh. Baseline Pomelo chạy
trước đổi package trên cùng loại fixture riêng; lưu kết quả/giá trị kỳ vọng
không chứa secret hay dữ liệu thật.

### 6.3. E2E phân quyền/audit và Docker

Trước rollout, kiểm thử HTTP Faculty thật với SystemService test cô lập có
user/role/quyền `faculty` và JWT tương ứng. Tài khoản đủ quyền tạo/sửa/xóa;
tài khoản thiếu quyền bị từ chối trước mutation; read endpoints giữ chính sách
hiện tại. Xác minh audit được nhận và persist qua gRPC production.

Môi trường SystemService phải có function phân quyền và schema audit thật của
fixture được cho phép; không tạo function luôn trả true hoặc tắt auth.
Không sửa source/config thật SystemService để phục vụ migration Catalog.
Thiếu môi trường thì ghi NOT RUN cùng prerequisites và chặn rollout;
không lấy capture CallInvoker hoặc DB-free runtime làm bằng chứng E2E.

E2E này là gate phát hành, không bắt buộc provision PostgreSQL/SystemService
trong task Catalog. Môi trường test và tài khoản do chủ dự án cung cấp riêng.
Có thể bàn giao code với trạng thái "DB-free/provider đã kiểm tra, E2E NOT RUN,
chưa được rollout" nếu đúng kết quả thực tế; không ghi "nghiệm thu toàn bộ".
Nếu muốn tự provision hệ thống hai DB, cần mở rộng phạm vi được duyệt riêng.

Build/publish trực tiếp Catalog và Docker từ repository root; smoke image với
cấu hình test riêng, non-root, cổng hiện có, health và Swagger trong Development.
Không dùng full-solution/AppHost làm acceptance.

Lệnh kiểm tra dự kiến, chưa chạy trong đợt viết spec:

```powershell
& ./test/CatalogService.Removal.Check.ps1
dotnet build src/services/Blocks.CatalogService/Blocks.CatalogService.csproj
dotnet run --project test/CatalogService.CleanupChecks -- contract
dotnet run --project test/CatalogService.CleanupChecks -- runtime
dotnet run --project test/CatalogService.CleanupChecks -- provider
dotnet list src/services/Blocks.CatalogService/Blocks.CatalogService.csproj package --include-transitive
dotnet list src/services/Blocks.CatalogService/Blocks.CatalogService.csproj package --vulnerable --include-transitive
dotnet publish src/services/Blocks.CatalogService/Blocks.CatalogService.csproj -c Release
docker build -f src/services/Blocks.CatalogService/Dockerfile -t blocks-catalogservice:net10-oracle .
```

Chỉ chạy `provider` khi fixture được cho phép và biến môi trường hợp lệ.
E2E và container smoke cần ghi lệnh/cấu hình test thực tế trong implementation
plan, không điền credentials hoặc JWT vào tài liệu.

## 7. Trình tự và rollback

Hướng thực hiện cho implementation plan sau duyệt:

1. Ghi baseline source/build/harness và metadata; thêm mode provider trên
   .NET 8/Pomelo rồi chạy khi được phép. Tách lỗi baseline khỏi lỗi migration;
   thiếu DB không chặn chuẩn bị code nhưng chặn nghiệm thu provider đầy đủ.
2. Retarget service/harness và đổi dependency/mapping/DI thành một thay đổi
   nhất quán; giữ provider cũ trong commit baseline, không giữ runtime fallback.
3. Chạy DB-free; sau đó provider integration, E2E và Docker theo prerequisites.
   Chỉ sửa lỗi tương thích được test chỉ ra, không sửa nghiệp vụ ngoài phạm vi.
4. Review graph, dữ liệu fixture và diff; cập nhật AGENTS; chỉ rollout khi các
   gate kỹ thuật, E2E và license được đáp ứng.

Rollback bằng artifact/commit baseline trước migration, cùng cấu hình driver cũ
đã giữ an toàn. Vì không đổi schema/dữ liệu ứng dụng, không có down migration.
Vẫn kiểm tra UUID/boolean/time round-trip trước rollout để tránh provider mới
ghi dữ liệu mà bản cũ đọc khác; không coi rollback code là cách chữa dữ liệu
đã ghi sai. Nếu phát hiện sai dữ liệu, dừng write và xin phương án phục hồi riêng.

## 8. Quyết định còn lại và điều kiện dừng

Đã chọn: hướng Oracle + EF Core 10, giữ kiến trúc EF và phạm vi Catalog.
Đã duyệt cùng spec: package matrix, claim mapping tường minh,
test mode/provider fixture, không scaffold và không đổi schema.

Chưa có quyền tạo fixture/ghi DB test; cần xác nhận môi trường trước khi chạy.
Chưa xác nhận license cho cách phân phối dự án; cần chủ dự án xử lý trước release.
Thiếu hai điều kiện này không cản viết plan/DB-free checks nhưng không được
tuyên bố nghiệm thu đầy đủ hoặc phát hành.

Dừng và cập nhật spec nếu cần đổi schema, đổi ORM/provider khác, sửa thư viện
dùng chung, viết lại audit, hạ TLS hoặc bỏ auth để tương thích.

Spec và plan đã được người dùng cho phép triển khai bằng subagent; không suy quyền
ghi DB từ việc duyệt tài liệu hoặc yêu cầu triển khai code.

## 9. Nguồn đối chiếu

Nguồn chính thức được đọc ngày 2026-10-22; metadata NuGet theo đúng target
net10.0 được ưu tiên khi bảng hướng dẫn tổng quan còn ghi bản preview cũ.

- Oracle provider và dependency groups:
  `https://www.nuget.org/packages/MySql.EntityFrameworkCore/10.0.12`
- EF Core patch và yêu cầu đồng bộ Microsoft EF packages:
  `https://www.nuget.org/packages/Microsoft.EntityFrameworkCore/10.0.13`
- JwtBearer:
  `https://www.nuget.org/packages/Microsoft.AspNetCore.Authentication.JwtBearer/10.0.13`
- Oracle cấu hình EF Core / UseMySQL:
  `https://dev.mysql.com/doc/connector-net/en/connector-net-entityframework-core.html`
- Oracle charset/collation:
  `https://dev.mysql.com/doc/connector-net/en/connector-net-entityframework-core-charset.html`
- Oracle connection options / OldGuids / TreatTinyAsBoolean:
  `https://dev.mysql.com/doc/connector-net/en/connector-net-8-0-connection-options.html`
- EF Core 10 breaking changes; cần đọc cả thay đổi EF Core 9 khi nâng từ 8:
  `https://learn.microsoft.com/en-us/ef/core/what-is-new/ef-core-10.0/breaking-changes`
- Quyết định cleanup Catalog:
  `docs/superpowers/specs/2026-10-22-catalogservice-faculty-only-design.md`
- Ranh giới Shared/ServiceDefaults và advisory baseline:
  `docs/superpowers/specs/2026-10-22-systemservice-security-hardening-design.md`
