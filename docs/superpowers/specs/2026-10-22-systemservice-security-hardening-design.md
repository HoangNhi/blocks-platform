# SystemService: sửa lỗi auth, gRPC và cảnh báo bảo mật

Ngày: 2026-10-22

Trạng thái: Người dùng đã duyệt bản spec ngày 2026-10-22 và yêu cầu viết
implementation plan.
Chưa cho phép triển khai code, đổi package hoặc thao tác DB thật.

## 1. Mục tiêu và phạm vi đã duyệt

Sửa bốn lỗi còn tồn tại sau đợt dọn SystemService và nâng .NET 10:
refresh token không kiểm tra trạng thái user; combobox user cho truy cập ẩn danh;
GUID sai gây exception chưa xử lý trong hai RPC; RPC đổi trạng thái sửa cả user
đã xóa mềm. Đồng thời xử lý các dependency có advisory đã xác nhận của
SystemService tại nơi khai báo gốc.

Người dùng đã chọn phương án sửa trong SystemService và thư viện dùng chung
`Blocks.Shared`, `Blocks.ServiceDefaults`, thay vì chỉ sửa cục bộ rồi để lại
nguồn cảnh báo. Combobox yêu cầu đăng nhập, không yêu cầu quyền `VIEW User`.

Giữ thiết kế hiện có, không thêm service chính sách, adapter, feature flag,
test framework hoặc abstraction production mới. Dùng harness console hiện có
trong `test/SystemService.CleanupChecks`.

Mốc phân tích: HEAD `d86daa5` cùng thay đổi nâng .NET 10 chưa commit trong
working tree. Khi triển khai phải giữ và sử dụng các thay đổi đó, không lấy HEAD
chưa có migration làm baseline tương đương. Commit tài liệu không gom code
migration hoặc thay đổi có sẵn.

## 2. Bằng chứng và mức độ xác nhận

Đường dẫn source trong bảng tính từ `src/services/Blocks.SystemService/`.

| Phát hiện | Bằng chứng source hiện tại | Tác động xác nhận được |
| --- | --- | --- |
| Refresh thiếu kiểm tra trạng thái user | `Services/CoreFeature/Auth/AuthService.cs:83` chỉ chặn null và role External Reviewer; query lấy token không lọc trạng thái user. | User thường inactive hoặc deleted có thể đi tiếp vào rotation với token còn hiệu lực. |
| Combobox công khai | `Controllers/UserController.cs:74` có `[AllowAnonymous]`; `UserService.GetAllForCombobox` trả username, fullname, ID của user active, chưa xóa. | Bỏ qua yêu cầu JWT của BaseController, lộ danh sách tài khoản cho caller ẩn danh. |
| GUID không được kiểm tra | `Services/gRPC/SystemGrpcService.cs:27,40` dùng `Guid.Parse` trong CheckPermission và GetUsersByIds. | Input sai gây exception từng lời gọi; không có bằng chứng làm sập tiến trình hoặc fail-open. |
| Đổi trạng thái user đã xóa | `Services/gRPC/SystemGrpcService.cs:154` chỉ lọc theo ID. | Có thể đổi IsActived của bản ghi IsDeleted=true; không tự xóa cờ IsDeleted. |

Caller combobox trong repo: `src/apps/Blocks.Web/src/features/system/api/user.api.ts`
và `src/apps/Blocks.Web/src/features/business/routes/Cycle/hooks/useCycleForm.ts`.
API client chung gắn bearer token khi có token. Không tìm thấy yêu cầu công khai
endpoint trong source; không suy ra rằng không có consumer ngoài repo.

Catalog gọi CheckPermission tại
`src/services/Blocks.CatalogService/Helpers/AttributePermission.cs`.
Caller này phân biệt response Success=false với RpcException; lựa chọn trả false
cho UserId sai tránh biến lỗi input quyền thành thông báo dịch vụ bảo trì.

Audit ngày 2026-10-22 dùng `dotnet list <project.csproj> package --vulnerable
--include-transitive --no-restore`, dựa trên dependency graph đã restore:

| Graph | Cảnh báo liên quan |
| --- | --- |
| SystemService net10.0 | AutoMapper 16.0.0: High, GHSA-rvv3-g6hj-g44x; OpenTelemetry.Api 1.9.0: Moderate, GHSA-g94r-2vxg-569j; OTLP exporter 1.9.0: Moderate, GHSA-4625-4j76-fww9. |
| Blocks.Shared net8.0 | Newtonsoft.Json 9.0.1: High, GHSA-5crp-9r3c-p9vr; System.Text.Encodings.Web 4.5.0: Critical, GHSA-ghhp-997w-qr28, qua package ASP.NET Core 2.2. |
| CatalogService và FileService | Cùng chịu ảnh hưởng OTel và System.Text.Encodings.Web qua thư viện dùng chung; còn dependency riêng ngoài phạm vi. |

System.Text.Encodings.Web 4.5.0 không còn được báo trong audit SystemService
net10.0. Chưa kiểm tra assembly thực nạp trong deployment. Không đồng nhất cảnh
báo dependency graph với bằng chứng khai thác runtime.

## 3. Thiết kế hành vi

### 3.1. Refresh token

Ngay sau khi tìm user bằng refresh token, từ chối nếu user không tồn tại,
`IsDeleted=true`, `IsActived=false`, hoặc có role External Reviewer
`551d1351-008e-4910-a39c-1fcdde409fdf`.

Kiểm tra phải chạy trước rotation, revoke chain hoặc SaveChanges. Trả
`BusinessException("Token không hợp lệ")` theo flow hiện có, không tiết lộ trạng
thái tài khoản. Khi bị chặn vì trạng thái user, không cấp access token, không
thêm refresh token, không thay đổi token cũ hoặc token hậu duệ.

User thường active, chưa xóa vẫn refresh như cũ. Giữ xử lý token thiếu, hết hạn,
revoked và cơ chế phát hiện tái sử dụng token hiện có. Không refactor password,
JWT, rotation hoặc sửa mọi vấn đề tiềm năng khác trong auth.

Chặn refresh không thu hồi JWT đã cấp. Thu hồi tức thời và kiểm tra trạng thái
user trên từng request nằm ngoài phạm vi; rollout phải ghi rõ giới hạn này.

### 3.2. Combobox user

Bỏ `[AllowAnonymous]` ở đúng action `GET /api/User/get-all-combobox`.
Giữ JWT authorization kế thừa từ BaseController và `ActionType.NONE`.
Không đổi route, DTO, bộ lọc user hoặc thứ tự dữ liệu.

Caller chưa đăng nhập hoặc JWT không hợp lệ bị chặn trước khi truy vấn danh
sách. Giữ response hiện tại: HTTP 200, `Success=false`, `StatusCode=401`;
không trả danh sách trong Data. Không đổi sang HTTP 401 riêng cho endpoint này.

Caller có JWT hợp lệ dùng được endpoint mà không cần quyền VIEW của màn hình
quản trị User, vì combobox cũng phục vụ chọn user ở màn hình nghiệp vụ khác.
Không mở rộng thành thiết kế phân quyền mới.

### 3.3. GUID tại hai RPC

Giữ `[Authorize]` hiện có, tên RPC, message, field number và protobuf descriptor.
Kiểm tra input trước khi gọi service hoặc DB:

| RPC | Input sai | Kết quả |
| --- | --- | --- |
| CheckPermission | UserId không parse được hoặc bằng Guid.Empty. | Trả CheckActionResponse với Success=false, không gọi DB kiểm tra quyền. |
| GetUsersByIds | Bất kỳ ID nào không parse được hoặc bằng Guid.Empty. | Ném RpcException với StatusCode.InvalidArgument; từ chối toàn bộ request, không trả kết quả một phần hoặc truy vấn DB. |

Dùng Guid.TryParse, giữ các dạng GUID hợp lệ vốn được Guid.Parse chấp nhận.
GetUsersByIds với danh sách rỗng vẫn trả danh sách rỗng; ID lặp không tạo user
lặp; ID hợp lệ nhưng không tồn tại vẫn không có trong kết quả. Positive control
phải chứng minh user chưa xóa được trả về, user xóa mềm bị loại như trước.
CheckPermission với GUID hợp lệ tiếp tục flow phân quyền thật.

Lỗi gRPC không đưa vào HTTP BaseResponse và không chứa raw input, token, SQL
hoặc exception nội bộ trong thông báo. Không đổi validation của năm RPC còn lại
trong đợt này.

### 3.4. SetUsersActived và xóa mềm

Thêm điều kiện `!u.IsDeleted` vào query chọn user cần sửa. Giữ hành vi hiện có
với ID không tồn tại, ID sai bị lọc, ID lặp và danh sách rỗng; không thay đổi sang
chế độ từ chối toàn bộ batch.

Batch gồm user còn tồn tại và user đã xóa chỉ đổi IsActived của user chưa xóa.
Giữ response Success=true như cũ, không thêm count hoặc trường protobuf mới.
Không đổi IsDeleted, không khôi phục bản ghi, không ghi audit mutation cho user
đã xóa bị loại khỏi query. Audit của thay đổi hợp lệ vẫn hoạt động.

## 4. Dependency: sửa đúng nơi khai báo

| File | Thay đổi dự kiến |
| --- | --- |
| `src/services/Blocks.SystemService/Blocks.SystemService.csproj` | AutoMapper 16.0.0 lên 16.1.1, bản vá cùng major cho advisory đã biết. |
| `src/platform/Blocks.ServiceDefaults/Blocks.ServiceDefaults.csproj` | OTLP exporter và OpenTelemetry.Extensions.Hosting lên 1.15.3; graph OpenTelemetry.Api phải resolve ít nhất 1.15.3, không ở vùng bị ảnh hưởng. |
| `src/platform/Blocks.Shared/Blocks.Shared.csproj` | Bỏ Microsoft.AspNetCore.Mvc.Core 2.2.5, HttpOverrides 2.2.0, Http.Abstractions 2.2.0; thay bằng FrameworkReference Microsoft.AspNetCore.App. |

Giữ instrumentation OTel ở phiên bản hiện có nếu restore, audit và kiểm tra
tương thích đạt yêu cầu; không ép mọi package mang cùng số patch vì các package
không phát hành đồng bộ. Không thêm PackageReference OpenTelemetry.Api chỉ để
ghi đè cảnh báo nếu dependency đã resolve đúng.

Shared và ServiceDefaults giữ net8.0 để không buộc Catalog/FileService nâng
runtime. Không nâng gRPC, EF, resilience, service discovery hoặc dependency khác
không liên quan. Không dùng NoWarn, NuGetAuditSuppress hoặc tắt audit để đạt
nghiệm thu. Thay ASP.NET 2.2 bằng framework reference là thiết kế cần kiểm chứng
bằng build và runtime, không phải cam kết tương thích đã được thử.

Advisory AutoMapper liên quan recursion trên graph sâu; chưa chứng minh input
ứng dụng chạm đường khai thác. OTel.Api liên quan allocation khi xử lý propagation
header. Advisory exporter cần bật disk retry, thiếu thư mục retry riêng và quyền
truy cập temp của kẻ tấn công cục bộ; source chưa chứng minh đủ điều kiện này.
Vẫn vá dependency, không coi việc chưa có bằng chứng khai thác là miễn xử lý.

Nếu restore mới phát hiện advisory khác hoặc bản vá nêu trên không còn đủ, ghi
rõ bằng chứng và điều chỉnh spec/plan trước khi mở rộng phạm vi. Không thay
AutoMapper bằng thư viện khác hoặc né yêu cầu license trong đợt này.

## 5. File và ranh giới thay đổi

Ngoài ba project file ở mục 4, chỉ dự kiến sửa:

- `src/services/Blocks.SystemService/Services/CoreFeature/Auth/AuthService.cs`.
- `src/services/Blocks.SystemService/Controllers/UserController.cs`.
- `src/services/Blocks.SystemService/Services/gRPC/SystemGrpcService.cs`.
- `test/SystemService.CleanupChecks/Program.cs`: thêm kiểm tra hành vi, tái sử dụng fixture.
- Tài liệu spec/plan và AGENTS.md nếu cần cập nhật lệnh kiểm tra thực tế.

Không đổi source nghiệp vụ của Gateway, Catalog hoặc FileService; chỉ build,
audit và smoke consumer bị ảnh hưởng. Không sửa AppHost, solution, frontend,
protobuf, schema, migration hoặc cấu hình thật. Không khôi phục BusinessService
hay hai RPC external user đã bị loại. Giữ audit, avatar FileService integration,
HTTP envelope và cơ chế permission hiện có.

## 6. Kiểm thử và nghiệm thu

Mở rộng harness console hiện có, không thêm framework. Mỗi lỗi phải có test
hồi quy thất bại vì đúng hành vi chưa sửa trước khi dùng kết quả xanh làm bằng
chứng; positive control phải tiếp tục đạt:

| Nhóm | Kiểm tra bắt buộc |
| --- | --- |
| Refresh | Token còn hạn của user thường inactive và deleted đều bị từ chối; token cũ, token hậu duệ và số bản ghi token không đổi. Giữ positive control user thường, chặn External Reviewer và các case thiếu/hết hạn/revoked hiện có. |
| Combobox | Request HTTP thật không token, token sai, token hết hạn đều nhận envelope lỗi 401, không lộ danh sách. JWT hợp lệ không có VIEW User vẫn truy cập được; chỉ trả user active, chưa xóa. |
| GUID gRPC | CheckPermission: rỗng, sai định dạng, Guid.Empty đều false trước DB. GetUsersByIds: ID sai đơn lẻ, trộn đúng/sai, Guid.Empty đều InvalidArgument, không partial result; rỗng, lặp, đúng và không tồn tại giữ semantics ở mục 3.3. Xác nhận status qua lời gọi gRPC thật, không chỉ gọi method trực tiếp. |
| Xóa mềm | Batch lẫn user active/inactive, deleted và ID không tồn tại; chỉ user chưa xóa được đổi trạng thái. Kiểm tra cả bật và tắt, batch rỗng, ID lặp; audit hợp lệ còn hoạt động. |
| Hồi quy | Các mode contract, runtime, auth hiện có và SystemService.BusinessDependency.Check.ps1 tiếp tục đạt; production DI/audit không tái xuất hiện cycle hoặc lỗi lifetime. |
| Dependency | Sau restore mới, SystemService không còn advisory trong graph; Shared không còn hai advisory mục 2 và ba package ASP.NET 2.2. Không phát sinh advisory mới do thay đổi; consumer còn cảnh báo riêng phải báo tách biệt. |

Kiểm tra GUID bị từ chối dùng DB không kết nối được để chứng minh không chạm DB.
DB checks khác chỉ dùng localhost database `blocks_systemservice_cleanup_test`,
schema ngẫu nhiên riêng do fixture tạo và dọn; không lấy connection string từ
cấu hình ứng dụng, không ghi vào public hoặc log secret.

Phân tách fixture và cách chạy trong cùng harness:

- Mode `runtime` giữ DB-free: kiểm tra combobox không token/token sai/hết hạn
  và GUID bị từ chối qua HTTP/gRPC listener localhost tạm thời.
- Mode `auth` dùng DB cô lập: thêm refresh token còn hạn cho user thường
  inactive/deleted; thêm token revoked có hậu duệ để chứng minh guard trạng
  thái chạy trước mọi thay đổi token. Positive combobox và GetUsersByIds chạy
  qua listener tạm thời trỏ vào schema test, không dùng connection giả của runtime.
- Test GUID qua gRPC phải gắn JWT kiểm thử hợp lệ để vượt authorization trước
  khi tới validation. Thêm negative control không token bị Unauthenticated,
  không nhầm status này với kết quả kiểm tra GUID.
- SystemService chỉ generate server stub. Dùng GrpcChannel/CallInvoker và
  protobuf message hiện có cho request test thật; không cần generate lại message,
  sửa system.proto, reflection vào method private hoặc thêm dependency.
- Test audit SetUsersActived phải dùng DI production cùng actor chưa xóa có
  claim `name` hợp lệ. Fixture auth cơ bản hiện không gắn AuditInterceptor,
  nên không dùng fixture đó để khẳng định audit được ghi.
- Request server có scope/context riêng; rollback transaction trong RunCaseAsync
  không hoàn tác write của request đó. Tách dữ liệu mutation theo case và dọn
  schema test trong finally; không dựa vào transaction bên caller để cô lập.

CheckPermission với GUID hợp lệ cần function phân quyền thật và fixture quyền
riêng. Nếu thiếu function/môi trường, ghi NOT RUN cùng prerequisite; không dựng
function luôn trả true rồi tuyên bố đã kiểm chứng phân quyền. Authentication
và gRPC authorization phải giữ bật trong kiểm tra request thật.

Build trực tiếp Shared, ServiceDefaults, SystemService, ApiGateway,
CatalogService, FileService và CleanupChecks. Không dùng full-solution/AppHost
làm acceptance vì còn tham chiếu service đã mất. Smoke SystemService, HTTP,
gRPC, audit, health và telemetry với cấu hình kiểm thử riêng; kiểm tra khởi động
telemetry cả khi không có và khi có OTLP endpoint trỏ vào collector cô lập.
Kiểm tra Docker build/publish và startup/liveness của image SystemService.

Build không thay thế integration test. Thiếu môi trường consumer/collector phải
ghi NOT RUN, không tuyên bố toàn hệ thống hoạt động hoặc nghiệm thu đầy đủ khi
còn tiêu chí bắt buộc chưa chạy. Runtime check DB-free vẫn phải thực sự không
mở kết nối DB. Review diff cuối để loại secret/generated output và xác nhận
không gom thay đổi có sẵn ngoài phạm vi.

## 7. Giới hạn và việc tách riêng

- Không tuyên bố toàn repo hết lỗ hổng: AutoMapper riêng của CatalogService,
  ImageSharp và Pkcs của FileService không thuộc phạm vi nâng package lần này.
- Không sửa nullable warning đại trà, using thừa, constructor không dùng,
  Kestrel config trùng hoặc dọn DTO không liên quan.
- FluentValidation.AspNetCore đã ngừng hỗ trợ; chuyển validation thủ công cần
  spec riêng để giữ lỗi validation và response contract, không nâng mù lên 12.
- Không xử lý DB data cleanup, thu hồi JWT tức thời, phân quyền mới cho toàn bộ
  gRPC, hoặc thay đổi các consumer bên ngoài repo.
- Siết combobox là thay đổi truy cập có chủ đích; trước rollout phải thông báo
  consumer ẩn danh cần JWT. GetUsersByIds thay lỗi chưa xử lý bằng InvalidArgument;
  client phải xử lý status này. Không cần protobuf/schema migration.

## 8. Nguồn và bước duyệt tiếp theo

Advisory chính thức đã đối chiếu ngày 2026-10-22:

- AutoMapper GHSA-rvv3-g6hj-g44x:
  `https://github.com/LuckyPennySoftware/AutoMapper/security/advisories/GHSA-rvv3-g6hj-g44x`
- OpenTelemetry.Api GHSA-g94r-2vxg-569j:
  `https://github.com/open-telemetry/opentelemetry-dotnet/security/advisories/GHSA-g94r-2vxg-569j`
- OTLP exporter GHSA-4625-4j76-fww9:
  `https://github.com/open-telemetry/opentelemetry-dotnet/security/advisories/GHSA-4625-4j76-fww9`
- Microsoft CVE-2021-26701 / System.Text.Encodings.Web:
  `https://github.com/dotnet/announcements/issues/178`
- FluentValidation.AspNetCore, thông báo ngừng hỗ trợ:
  `https://github.com/FluentValidation/FluentValidation.AspNetCore`
- API gRPC CallInvoker dùng cho request test không cần typed client:
  `https://grpc.github.io/grpc/csharp/api/Grpc.Core.CallInvoker.html`

Spec đã được duyệt ngày 2026-10-22. Plan nằm tại
`docs/superpowers/plans/2026-10-22-systemservice-security-hardening.md`.
Duyệt spec không cho phép triển khai; cần duyệt plan và chọn cách thực hiện
trước khi sửa code.
