# SystemService: loại bỏ phụ thuộc BusinessService

Ngày: 2026-10-21

Trạng thái: Người dùng đã duyệt ngày 2026-10-21 và yêu cầu viết kế hoạch.
Chưa cho phép triển khai code trước khi duyệt kế hoạch và chọn cách thực hiện.

## 1. Mục tiêu và giới hạn

Yêu cầu đã xác nhận: tập trung xử lý `SystemService`, tạo spec loại bỏ phần
liên quan service không còn trong dự án, trước hết là `BusinessService`.

Kết quả mong muốn: `SystemService` không cần source, protobuf, cấu hình hoặc
kết nối đến `BusinessService` để build và xử lý đăng nhập. Giữ hoạt động của
quản trị hệ thống, phân quyền, audit log và upload avatar.

Các quyết định đã duyệt:

- Loại bỏ hai RPC chuyên biệt `CreateExternalUser` và `DeleteExternalUser`.
- Từ chối cấp token mới cho tài khoản External Reviewer cũ, thay vì chuyển
  chúng sang đăng nhập thông thường.
- Giữ các RPC tổng quát chưa tìm thấy caller; không suy diễn rằng chúng đều
  thuộc `BusinessService`.

Chỉ thay đổi code trong `src/services/Blocks.SystemService/` và bổ sung kiểm
tra hồi quy cần thiết. Không sửa `AppHost`, `ApiGateway`, `CatalogService`,
`FileService`, frontend, solution hoặc `.gitignore`.

## 2. Bằng chứng từ source hiện tại

| Vị trí | Hiện trạng |
| --- | --- |
| `Blocks.slnx`, `src/services/` | Có ApiGateway, SystemService, CatalogService, FileService; không có BusinessService. |
| `Blocks.SystemService.csproj:34` | Link `..\Blocks.BusinessService\Protos\business.proto`; file không tồn tại. |
| `Configs/ConfigService.cs:99` | Đăng ký `BusinessProto.BusinessProtoClient`, đọc `GrpcClients:BusinessService`, mặc định `http://BusinessService`. |
| `Services/CoreFeature/Auth/AuthService.cs:26` | Constructor và field phụ thuộc BusinessProtoClient. |
| `Services/CoreFeature/Auth/AuthService.cs:66` | Login của External Reviewer gọi `CheckExternalReviewerAccessAsync`. |
| `Services/gRPC/SystemGrpcService.cs:171` | `CreateExternalUser` tạo tài khoản qua gRPC. |
| `Services/gRPC/SystemGrpcService.cs:282` | `DeleteExternalUser` chỉ chấp nhận role External Reviewer hard-code. |
| `Protos/system.proto:12`, `Protos/system.proto:15` | Khai báo contract hai RPC chuyên biệt trên. |
| `Services/CoreFeature/Auth/AuthService.cs:93` | Refresh token hiện chưa kiểm tra role External Reviewer. |

Role External Reviewer hiện tại:
`551d1351-008e-4910-a39c-1fcdde409fdf`.

Không tìm thấy caller của tám RPC user ngoài chính phần server trong source
hiện tại. Đây không phải bằng chứng rằng không có client ngoài repo.

Các tích hợp có consumer và phải giữ:

- `CatalogService/Helpers/AttributePermission.cs`: gọi `CheckPermissionAsync`.
- `CatalogService` và `FileService`: gọi `WriteAuditLogAsync`.
- `SystemService/Services/CoreFeature/User/UserService.cs`: gọi
  `UploadAvatarAsync` khi tạo/sửa user và sửa hồ sơ.

## 3. Các phương án

| Phương án | Đánh đổi |
| --- | --- |
| **Đề xuất: bỏ phụ thuộc trực tiếp và hai RPC tài khoản ngoài** | Dọn phần gắn rõ với luồng đã mất; giữ API tổng quát; có breaking change với client đang gọi hai RPC bị bỏ. |
| Chỉ bỏ phụ thuộc trực tiếp, giữ toàn bộ RPC | Ít thay đổi contract hơn, nhưng giữ API tạo/xóa tài khoản của luồng không còn backend nghiệp vụ. |
| Bỏ cả tám RPC không thấy caller và helper kéo theo | Dọn nhiều hơn nhưng thiếu bằng chứng về consumer; tăng rủi ro phá tích hợp ngoài repo. |

Người dùng đã duyệt phương án đầu. Không thêm adapter, fake
BusinessService, feature flag, dependency hoặc lớp trung gian.

## 4. Thay đổi đề xuất

### 4.1. Loại bỏ phụ thuộc build và đăng ký client

Trong `Blocks.SystemService.csproj`:

- Xóa duy nhất mục protobuf trỏ đến `Blocks.BusinessService`.
- Giữ protobuf server `system.proto`, `audit.proto` và client `file.proto`.
- Giữ project reference đến `Blocks.Shared` và `Blocks.ServiceDefaults`.
- Không xóa package gRPC/gRPC-Web: FileService client và gRPC server vẫn dùng.

Trong `Configs/ConfigService.cs`:

- Xóa `using Blocks.BusinessService.Protos`.
- Xóa toàn bộ đăng ký `BusinessProto.BusinessProtoClient`, gồm cấu hình
  channel và handler chỉ thuộc client đó.
- Không còn đọc `GrpcClients:BusinessService` hoặc dùng địa chỉ mặc định
  `http://BusinessService`.
- Giữ nguyên FileService client, JWT interceptor, DI, DB, mapper và CORS.

`appsettings.json` được kiểm tra hiện không chứa cấu hình BusinessService;
không tạo thay đổi cấu hình nếu không có khóa thực tế cần xóa.

### 4.2. Đăng nhập và tài khoản External Reviewer cũ

Trong `Services/CoreFeature/Auth/AuthService.cs`:

- Xóa namespace, field, tham số constructor và phép gán BusinessProtoClient.
- Xóa lời gọi `CheckExternalReviewerAccessAsync` và request tương ứng.
- Giữ chữ ký public của `IAuthService`, `LoginAsync` và `RefreshToken`.
- Giữ kiểm tra tài khoản tồn tại, mật khẩu, trạng thái tài khoản, định dạng
  response và cơ chế tạo token của tài khoản thông thường.

**Chính sách bảo mật đã duyệt:** tài khoản có role External Reviewer cũ
không được đăng nhập hoặc refresh token, kể cả khi `IsActived = true`.
Không xóa điều kiện từ xa rồi mặc nhiên cho tài khoản đó đi tiếp.

Giữ role ID trên như điều kiện chặn tương thích dữ liệu cũ, không phải
phụ thuộc BusinessService. Không tạo role mới hoặc tự chuyển role.
Đặt kiểm tra ngay trong `AuthService`, không thêm service chính sách riêng.

- Login bị chặn phải đi qua `BusinessException`, dùng thông báo lỗi xác thực
  chung hiện có; không tạo access token hoặc refresh token.
- Refresh token của role cũ phải bị chặn trước khi rotate, ghi token mới
  hoặc cấp access token; dùng lỗi token không hợp lệ hiện có.
- Nếu token không tìm thấy user, trả lỗi token không hợp lệ trước khi đọc
  role; không phát sinh null-reference từ nhánh kiểm tra mới.
- Giữ cơ chế audit login thành công/thất bại tại `AuthController`.
- Không refactor thuật toán password, JWT hoặc toàn bộ refresh-token flow.

Không xóa user, role, permission, refresh token hoặc audit log trong DB.
Việc xóa dữ liệu và loại bỏ role ID bảo vệ chỉ xét ở đợt riêng sau khi
xác nhận không còn tài khoản, token hoặc tích hợp sử dụng.

**Giới hạn phiên đang tồn tại:** chặn login/refresh không tự thu hồi JWT đã
cấp. JWT cũ vẫn có thể hợp lệ đến hết hạn tại các consumer. Khi triển khai,
phải xác nhận không có phiên External Reviewer còn hiệu lực hoặc chờ chúng
hết hạn theo cấu hình TTL thực tế. Nếu cần thu hồi tức thời, phải duyệt
thiết kế thu hồi token riêng; không tuyên bố bản dọn này đáp ứng yêu cầu đó.

### 4.3. Loại bỏ RPC chuyên biệt

Trong `Protos/system.proto`, xóa:

- RPC `CreateExternalUser` và `DeleteExternalUser`.
- Message `CreateExternalUserRequest`, `CreateExternalUserResponse`,
  `DeleteExternalUserRequest`, `DeleteExternalUserResponse`.

Trong `Services/gRPC/SystemGrpcService.cs`, xóa hai override tương ứng
và dependency chỉ dùng bởi hai override đó nếu không còn nơi dùng trong
class. Hiện `_referenceGuard` chỉ phục vụ `CreateExternalUser`; bỏ field,
tham số constructor và namespace validation tại class này nếu vẫn đúng
khi triển khai. Không xóa `ISystemReferenceGuard` hoặc đăng ký DI chung:
các luồng khác vẫn cần.

Đây là breaking change có chủ đích với hai RPC bị bỏ. Không đổi package,
namespace, tên RPC còn lại, kiểu message hay số field protobuf còn giữ.
Client ngoài repo gọi hai RPC cũ sẽ không còn được phục vụ và thông thường
nhận trạng thái gRPC `Unimplemented`; cần kiểm kê consumer trước rollout.

### 4.4. Những phần giữ nguyên

Giữ sáu RPC tổng quát:

- `GetUsersByIds`
- `GetUsersByUsernames`
- `GetUsersByIdsPaged`
- `GetActiveUsersExceptRole`
- `SetUsersActived`
- `UpdateUserProfile`

Giữ các helper phục vụ chúng trong `UserService` và `IUserService`, gồm
`GetByIds`, `GetByUsernames`, `GetByIdsPaged`, `UpdateUserProfileById`.
Chỉ xem xét xóa sau khi xác nhận phạm vi consumer và có duyệt riêng.

Giữ `CheckPermission`, `AuditGrpcService`, toàn bộ `audit.proto`, upload
avatar, CRUD user/role/menu/system group, schema DB và contract HTTP.
Không mở rộng đợt này sang hardening chung các RPC còn giữ.

## 5. File dự kiến thay đổi

Các đường dẫn dưới đây tính từ `src/services/Blocks.SystemService/`:

| File | Nội dung |
| --- | --- |
| `Blocks.SystemService.csproj` | Bỏ protobuf client của BusinessService. |
| `Configs/ConfigService.cs` | Bỏ namespace và đăng ký BusinessProtoClient. |
| `Services/CoreFeature/Auth/AuthService.cs` | Bỏ client/lời gọi từ xa; chặn cấp token cho role cũ. |
| `Protos/system.proto` | Bỏ hai RPC chuyên biệt và bốn message riêng. |
| `Services/gRPC/SystemGrpcService.cs` | Bỏ hai override và dependency chỉ dùng bởi chúng. |

Bổ sung kiểm tra hồi quy nhỏ, chạy được dưới `test/`. Thư mục này hiện
không có test project. Chọn cơ chế cụ thể ở bước lập kế hoạch; không thêm
test framework hoặc dựng hệ thống kiểm thử lớn chỉ để phục vụ đợt dọn này.

## 6. Tiêu chí nghiệm thu

- Không còn tham chiếu BusinessService, BusinessProto, business.proto hoặc
  CheckExternalReviewerAccess trong source/cấu hình project SystemService.
- Build riêng project SystemService thành công mà không cần thư mục
  BusinessService. Không dùng build toàn solution làm điều kiện duy nhất.
- DI tạo được AuthService mà không đăng ký BusinessProtoClient.
- Tài khoản thông thường hợp lệ vẫn login và refresh token theo contract cũ.
- Mật khẩu sai, user không tồn tại và user bị vô hiệu vẫn bị từ chối.
- Role External Reviewer cũ bị từ chối login và refresh; không sinh token mới.
- Hai RPC bị bỏ không còn trong contract được generate và server override.
- Sáu RPC tổng quát, CheckPermission, audit và FileService client còn nguyên.
- Không thay đổi hoặc xóa dữ liệu DB; không sửa file ngoài phạm vi đã nêu.

## 7. Kiểm chứng khi triển khai code

1. Ghi nhận baseline build riêng SystemService trước sửa, gồm lỗi đầu vào
   protobuf hoặc lỗi khác nếu có. Không quy mọi lỗi baseline cho BusinessService.
2. Thêm kiểm tra hồi quy chạy được cho trường hợp role cũ bị từ chối cấp
   token và trường hợp tài khoản thường không bị chặn nhầm; xác nhận kiểm
   tra phát hiện được hành vi chưa sửa trước khi dùng làm bằng chứng.
3. Chạy build trực tiếp:
   `dotnet build src/services/Blocks.SystemService/Blocks.SystemService.csproj`.
4. Kiểm tra không còn tham chiếu BusinessService trong phạm vi project,
   và kiểm tra contract chỉ mất đúng hai RPC cùng message riêng.
5. Với PostgreSQL và cấu hình JWT kiểm thử riêng, xác nhận login/refresh,
   không ghi token khi từ chối, audit, CheckPermission và upload avatar.
   Không dùng DB thật của người dùng để tạo/xóa dữ liệu kiểm thử.
6. Báo rõ bước nào chạy thành công, bước nào thiếu môi trường hoặc gặp lỗi
   baseline. Kiểm tra chuỗi source không thay thế kiểm thử hành vi auth.

## 8. Ngoài phạm vi và điều kiện triển khai

- AppHost vẫn tham chiếu BusinessService và CollabService không tồn tại;
  hoàn thành spec này không đồng nghĩa solution/AppHost chạy được.
- Frontend vẫn có luồng External Reviewer và BusinessService; không sửa
  frontend trong đợt này.
- Không sửa vấn đề auth/refresh token khác ngoài các nhánh cần để thực hiện
  chính sách được duyệt.
- Không xóa sáu RPC tổng quát chỉ vì chưa tìm thấy caller trong repo.
- Không triển khai code trước khi người dùng duyệt spec, duyệt kế hoạch
  triển khai và chọn cách thực hiện.

Duyệt spec chấp nhận việc ngừng phục vụ hai RPC chuyên biệt và ngừng cấp
token mới cho External Reviewer cũ; không cho phép xóa dữ liệu hoặc thay
đổi service khác. Bước tiếp theo là duyệt kế hoạch và chọn cách thực hiện.
