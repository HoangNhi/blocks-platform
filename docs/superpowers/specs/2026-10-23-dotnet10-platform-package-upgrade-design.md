# Backend: .NET 10 LTS và cập nhật package toàn nền tảng

Ngày: 2026-10-23

Trạng thái: **Dự thảo chờ người dùng duyệt.** Người dùng đã chọn phạm vi toàn
backend trong một spec; chưa duyệt thiết kế cụ thể, chưa cho phép triển khai.
Tài liệu này không cấp quyền ghi DB, di chuyển file thật hoặc deploy.

## 1. Mục tiêu và phạm vi

Đưa toàn bộ backend hiện có lên `net10.0`, cập nhật dependency lên phiên bản
stable mới nhất tương thích với .NET/EF Core 10, đồng thời giữ hợp đồng và dữ liệu.
Một spec quản lý toàn bộ thay đổi; triển khai vẫn chia thành các bước có kiểm chứng,
không gom tất cả thành một lệnh cập nhật package.

Phạm vi gồm bốn service `Blocks.FileService`, `Blocks.SystemService`,
`Blocks.CatalogService`, `Blocks.ApiGateway`; ba project nền tảng `Blocks.Shared`,
`Blocks.ServiceDefaults`, `Blocks.AppHost`; ba harness backend, Dockerfile hiện có,
tool manifest và hướng dẫn vận hành liên quan trực tiếp.

Theo [chính sách Microsoft](https://dotnet.microsoft.com/en-us/platform/support/policy/dotnet-core),
.NET 10 là LTS, patch hiện tại `10.0.13`, hỗ trợ đến **2028-11-14**;
.NET 8 hết hỗ trợ **2026-11-10**. Tại **2026-10-23**, .NET 11 mới ở
[RC2](https://dotnet.microsoft.com/en-us/download/dotnet/11.0), chưa GA.
Chọn .NET 10 không đồng nghĩa mọi package phải mang major version 10.

### Các phương án đã cân nhắc

| Phương án | Đánh đổi | Quyết định |
| --- | --- | --- |
| Chỉ FileService và hai thư viện chung | Nhỏ hơn; AppHost và phần dependency khác vẫn cũ, graph thiếu đồng bộ. | Không chọn. |
| Toàn backend hiện có trong một spec, gồm AppHost | Phạm vi lớn hơn; kiểm chứng được cả consumer và orchestration, giải quyết tham chiếu service vắng mặt. | **Người dùng chọn.** |
| Nâng từng service qua các spec độc lập | Dễ chia đợt phát hành nhưng lặp quyết định dependency chung và quản lý trạng thái chuyển tiếp. | Không chọn cho lần này. |

**Không làm:** nâng frontend/package npm, đổi ORM/provider, nâng DB server, đổi schema,
scaffold entity, khôi phục BusinessService/CollabService, thêm object storage/broker,
khôi phục watermark/Office conversion/SAR, thiết kế lại auth/audit/retry, tạo Gateway
Dockerfile hoặc hệ thống CI mới khi chưa cần.

**Không được coi là thành công:** build đạt nhưng validation biến mất; đổi HTTP
envelope; mở rộng proxy trust; mất file; thử nghiệm dùng storage/DB ứng dụng;
che warning/license; bỏ test để graph mới chạy được.

## 2. Hiện trạng và ràng buộc

Baseline source: HEAD `f52af50`, working tree sạch khi bắt đầu viết spec.
Chưa chạy restore/build/test/audit dependency trong phiên thiết kế này.
Kết quả trong spec cũ là lịch sử, không phải bằng chứng nghiệm thu mới.

| Project | Target hiện tại | Thay đổi target |
| --- | --- | --- |
| FileService, Shared, ServiceDefaults, AppHost | `net8.0` | `net10.0` |
| SystemService, CatalogService, ApiGateway | `net10.0` | Giữ |
| FileService.RemovalChecks, SystemService.CleanupChecks, CatalogService.CleanupChecks | `net10.0` | Giữ |

File/System/Catalog tham chiếu Shared và ServiceDefaults; Gateway chỉ tham chiếu
Shared. Gateway có package ServiceDiscovery.Yarp nhưng source hiện chưa đăng ký
tích hợp discovery cho reverse proxy; không giả định có discovery đang hoạt động.

AppHost dùng Aspire `9.5.0`, còn ProjectReference tới BusinessService và resource
CollabService đã vắng mặt. Đây là lỗi baseline của full solution/AppHost.
Phạm vi mới cho phép xóa các tham chiếu orchestration này, không phục hồi service.
Trước khi sửa AppHost, build từng project là baseline phù hợp; sau sửa,
`Blocks.slnx` phải build được.

Spec này thay thế giới hạn lịch sử “giữ Shared/Defaults/File ở net8”, các pin
dependency cũ và “không sửa AppHost” trong các spec trước. Các quyết định về
storage, auth, provider, dữ liệu và ranh giới dịch vụ vẫn giữ:

- [FileService storage hardening](2026-10-22-fileservice-storage-hardening-design.md).
- [SystemService security hardening](2026-10-22-systemservice-security-hardening-design.md).
- [Catalog .NET 10 và Oracle provider](2026-10-22-catalogservice-net10-oracle-design.md).
- [Catalog Faculty-only](2026-10-22-catalogservice-faculty-only-design.md).
- [System bỏ BusinessService](2026-10-21-systemservice-remove-businessservice-design.md).
- [FileService storage cutover](../../operations/fileservice-storage-cutover.md).

## 3. Chính sách phiên bản

Các quyết định kỹ thuật dưới đây là **đề xuất của người viết**, chờ duyệt cùng spec:

- Dùng stable mới nhất **tạo thành graph tương thích**, không preview/RC,
  floating version, .NET 11 hoặc EF Core 11. Không chạy nâng major hàng loạt.
- Giữ pin trực tiếp trong `.csproj`; chưa thêm Central Package Management hay
  `Directory.Build.*`. Không thêm PackageReference cho mọi dependency transitive.
- Thêm `global.json`: SDK `10.0.402`, `rollForward: latestPatch`,
  `allowPrerelease: false`. Đây là
  [SDK stable hiện tại](https://dotnet.microsoft.com/en-us/download/dotnet/10.0);
  máy đang có `10.0.401`, nên cần chuẩn bị SDK mới trước khi dùng pin.
  Thiếu SDK phải báo rõ, không tự sửa cấu hình máy hoặc fallback sang SDK 11.
- Đồng bộ EF Core/Relational/Design/Tools ở patch 10 đã chọn; provider có version
  riêng. Không ép Oracle provider hoặc Npgsql mang cùng số patch với EF.
- Trước triển khai, làm mới metadata NuGet, advisory và dependency bounds.
  Ghi lại phiên bản chọn, dependency thực resolve và lý do mọi ngoại lệ.
  Patch stable mới cùng hướng thiết kế có thể thay snapshot sau khi kiểm chứng;
  đổi provider, license model hoặc hành vi public cần xin duyệt lại.
- Không dùng `--force`, `NoWarn`, downgrade hoặc bỏ audit để vượt xung đột.
  Dependency không còn được duy trì thì bỏ nếu không dùng; nếu đang dùng, thay
  tích hợp tối thiểu có kiểm thử. Không mặc định giữ package deprecated.

### 3.1. Snapshot package đã xác minh ngày 2026-10-23

Tên trong bảng liên kết tới metadata NuGet chính thức. “Giữ” nghĩa phiên bản hiện
tại đã là stable mới nhất tại mốc kiểm tra, không có nghĩa bỏ qua audit.

| Package | Hiện tại | Đích |
| --- | --- | --- |
| [FluentValidation](https://www.nuget.org/packages/FluentValidation) | Shared `11.9.0` | `12.2.0` |
| [FluentValidation.DependencyInjectionExtensions](https://www.nuget.org/packages/FluentValidation.DependencyInjectionExtensions) | Qua tích hợp cũ | `12.2.0`, trực tiếp tại System/Catalog |
| FluentValidation.AspNetCore | File `11.3.0`, System/Catalog `11.3.1` | Bỏ; xem mục 4 |
| [Grpc.Net.Client](https://www.nuget.org/packages/Grpc.Net.Client) | Shared `2.60.0` | `2.84.0` |
| [Grpc.AspNetCore](https://www.nuget.org/packages/Grpc.AspNetCore) | File/System `2.71.0` | `2.84.0` |
| [Grpc.AspNetCore.Web](https://www.nuget.org/packages/Grpc.AspNetCore.Web) | File/System `2.76.0` | `2.84.0` |
| [Grpc.Net.Client.Web](https://www.nuget.org/packages/Grpc.Net.Client.Web) | File/System/Catalog `2.76.0` | `2.84.0` |
| [Grpc.Net.ClientFactory](https://www.nuget.org/packages/Grpc.Net.ClientFactory) | File/Catalog `2.76.0` | `2.84.0` |
| [Grpc.Tools](https://www.nuget.org/packages/Grpc.Tools) | File/Catalog `2.76.0` | `2.84.0` |
| [Google.Protobuf](https://www.nuget.org/packages/Google.Protobuf) | File `3.33.2`, Catalog `3.35.0` | `3.36.2` |
| [JwtBearer](https://www.nuget.org/packages/Microsoft.AspNetCore.Authentication.JwtBearer) | File `8.0.22`, System/Catalog `10.0.13` | `10.0.13` |
| [AutoMapper](https://www.nuget.org/packages/AutoMapper) | System `16.1.1`, Catalog `16.0.0` | `16.2.0` |
| [Swashbuckle.AspNetCore](https://www.nuget.org/packages/Swashbuckle.AspNetCore) | File/System/Catalog `6.6.2` | `10.3.1` |
| [Polly](https://www.nuget.org/packages/Polly) | File/Catalog `8.5.2` | `8.8.0` |
| [Containers.Tools.Targets](https://www.nuget.org/packages/Microsoft.VisualStudio.Azure.Containers.Tools.Targets) | File/System/Catalog `1.22.1` | `1.23.0` |
| [Newtonsoft.Json](https://www.nuget.org/packages/Newtonsoft.Json) | File/System/Catalog `13.0.4` | Giữ |
| [Stax.AutoDependencyInjectionRegistration](https://www.nuget.org/packages/Stax.AutoDependencyInjectionRegistration) | File/System/Catalog `4.0.0` | Giữ, kiểm chứng DI |
| [Microsoft.Extensions.Http.Resilience](https://www.nuget.org/packages/Microsoft.Extensions.Http.Resilience) | Defaults `9.9.0` | `10.11.0` |
| [Microsoft.Extensions.ServiceDiscovery](https://www.nuget.org/packages/Microsoft.Extensions.ServiceDiscovery) | Defaults `9.5.0` | `10.11.0` |
| [Microsoft.Extensions.ServiceDiscovery.Yarp](https://www.nuget.org/packages/Microsoft.Extensions.ServiceDiscovery.Yarp) | Gateway `10.0.0` | `10.11.0` |
| [OpenTelemetry.Exporter.OpenTelemetryProtocol](https://www.nuget.org/packages/OpenTelemetry.Exporter.OpenTelemetryProtocol) | Defaults `1.15.3` | `1.20.1` |
| [OpenTelemetry.Extensions.Hosting](https://www.nuget.org/packages/OpenTelemetry.Extensions.Hosting) | Defaults `1.15.3` | `1.20.1` |
| [OpenTelemetry.Instrumentation.AspNetCore](https://www.nuget.org/packages/OpenTelemetry.Instrumentation.AspNetCore) | Defaults `1.9.0` | `1.20.1` |
| [OpenTelemetry.Instrumentation.Http](https://www.nuget.org/packages/OpenTelemetry.Instrumentation.Http) | Defaults `1.9.0` | `1.20.1` |
| [OpenTelemetry.Instrumentation.Runtime](https://www.nuget.org/packages/OpenTelemetry.Instrumentation.Runtime) | Defaults `1.9.0` | `1.20.1` |
| [Microsoft.EntityFrameworkCore.Design](https://www.nuget.org/packages/Microsoft.EntityFrameworkCore.Design/10.0.13) | System/Catalog `10.0.13` | Giữ |
| [Microsoft.EntityFrameworkCore.Tools](https://www.nuget.org/packages/Microsoft.EntityFrameworkCore.Tools/10.0.13) | Catalog `10.0.13` | Giữ |
| [Microsoft.EntityFrameworkCore](https://www.nuget.org/packages/Microsoft.EntityFrameworkCore/10.0.13) và [Relational](https://www.nuget.org/packages/Microsoft.EntityFrameworkCore.Relational/10.0.13) | Trực tiếp trong harness và qua provider | `10.0.13` thống nhất |
| [Npgsql.EntityFrameworkCore.PostgreSQL](https://www.nuget.org/packages/Npgsql.EntityFrameworkCore.PostgreSQL/10.0.3) | System `10.0.3` | Giữ |
| [MySql.EntityFrameworkCore](https://www.nuget.org/packages/MySql.EntityFrameworkCore/10.0.12) | Catalog `10.0.12` | Giữ Oracle provider |
| [Yarp.ReverseProxy](https://www.nuget.org/packages/Yarp.ReverseProxy) | Gateway `2.3.0` | Giữ |
| [Aspire.AppHost.Sdk](https://www.nuget.org/packages/Aspire.AppHost.Sdk) | AppHost `9.5.0` | `13.6.3` |
| [Aspire.Hosting.AppHost](https://www.nuget.org/packages/Aspire.Hosting.AppHost) | AppHost `9.5.0` | `13.6.3` |
| [Aspire.Hosting.NodeJs](https://www.nuget.org/packages/Aspire.Hosting.NodeJs) | AppHost `9.5.0` | Bỏ, package deprecated |
| [Aspire.Hosting.JavaScript](https://www.nuget.org/packages/Aspire.Hosting.JavaScript/13.6.3) | Chưa có | `13.6.3`, thay NodeJs |
| Aspire.Hosting.PostgreSQL | AppHost `9.5.0` | Bỏ, không có resource dùng |
| [dotnet-ef](https://www.nuget.org/packages/dotnet-ef/10.0.13) | Hai service-level manifest `10.0.5` | `10.0.13` |

NuGet gallery JavaScript không gắn version có thể trả cache `13.6.1`;
đã đối chiếu version `13.6.3` trong
[NuGet flat-container index](https://api.nuget.org/v3-flatcontainer/aspire.hosting.javascript/index.json)
và [registration metadata](https://api.nuget.org/v3/registration5-gz-semver2/aspire.hosting.javascript/13.6.3.json):
`listed=true`, phát hành `2026-10-21`.
Snapshot không được suy ra bằng cách ép mọi Aspire integration cùng patch.

Với asset `net10.0`, Npgsql provider yêu cầu EF từ `10.0.4` đến trước `11.0.0`;
Oracle provider yêu cầu EF ít nhất `10.0.12`. EF `10.0.13` nằm trong giao tương thích.
Giữ driver transitive theo bounds provider; kiểm tra `MySql.Data` dòng `26.10.0`,
Npgsql dòng `10.0.3` và Protobuf thực resolve. Không thêm pin driver tùy tiện.

Hai `dotnet-tools.json` đang ở thư mục File/Gateway, không phải
`.config/dotnet-tools.json`; cập nhật pin hiện có nhưng không di chuyển/xóa trong
đợt này. Nếu dùng tooling phải truyền `--tool-manifest` đúng đường dẫn.
Không cài/update global tool, không chạy migration/scaffold khi chỉ xác minh version.

Giữ `PrivateAssets`/`IncludeAssets` của Grpc.Tools và EF tooling; protobuf vẫn
generate từ source/link hiện tại, không sửa file dưới `obj/`. Graph transitive
Grpc/Protobuf, OpenTelemetry.Api/SDK và EF phải nhất quán; nếu dependency tối thiểu
khác snapshot, giải quyết bằng metadata/restore, không suy từ số major.

Catalog AutoMapper `16.0.0` nằm trong advisory
[GHSA-rvv3-g6hj-g44x](https://github.com/LuckyPennySoftware/AutoMapper/security/advisories/GHSA-rvv3-g6hj-g44x);
`16.1.1` đã vá, đích là `16.2.0`. Owner vẫn phải xác nhận điều kiện license
AutoMapper/Oracle trước rollout; tắt log license không thay cho xác nhận.

## 4. Validation: thay tích hợp, không thay hợp đồng

`FluentValidation.AspNetCore` đã
[ngừng phát triển](https://github.com/FluentValidation/FluentValidation.AspNetCore).
Đọc [hướng dẫn v12](https://docs.fluentvalidation.net/en/latest/upgrading-to-12.html),
không giữ MVC adapter 11 rồi giả định tương thích core 12.

Hiện System/Catalog cấu hình `AddMvc().AddFluentValidation`, scan assembly service,
`ImplicitlyValidateChildProperties=true`, `DisableDataAnnotationsValidation=true`.
`InvalidModelStateResponseFactory` trả HTTP 200 với `Success=false`,
`StatusCode=400`; `CommonFunc.GetModelStateAPI` chỉ lấy lỗi đầu tiên từ ModelState,
không trả danh sách lỗi. File không dùng tích hợp này.

**Thiết kế đề xuất:** bỏ package AspNetCore ở cả ba service. System/Catalog dùng
DI extensions v12, giữ scan đúng assembly service và một `IAsyncActionFilter`
nhỏ trong Shared, chỉ đăng ký tại hai service này. Không thêm thư viện adapter khác,
không thêm base controller/validation framework mới.

Filter chạy sau authorization, trước `ModelStateInvalidFilter` của MVC và trước
audit/action. Dùng `Order` nhỏ hơn `-2000`, validate các action argument đã bind,
resolve `IValidator<T>` theo kiểu parameter, gọi `ValidateAsync` với
`HttpContext.RequestAborted`. Thêm lỗi theo property path vào ModelState rồi dùng
chính `InvalidModelStateResponseFactory` hiện có; không ném BusinessException
thay cho lỗi binding/validation và không biến exception hạ tầng thành lỗi input.
Không validate root null bằng cách tạo DTO giả; giữ lỗi binding/null body của MVC.

Giữ JSON naming policy, converters ngày giờ Việt Nam, nội dung tiếng Việt,
thứ tự lỗi đầu tiên quan sát được và trạng thái HTTP/body. Giữ DataAnnotations
không tham gia validation, kể cả implicit required của nullable metadata; không
xóa ModelState hay bỏ lỗi deserialize/binding để đạt kiểm thử.

Không tự scan thêm Shared: `DeleteListRequestValidator` và
`GetByIdDeleteRequestValidator` chưa nằm trong scan hiện tại. Không vô tình kích
hoạt rule mới cho tất cả consumer. Chỉ thêm `SetValidator`/`RuleForEach` rõ ràng cho
graph thực sự được tích hợp cũ validate, thay implicit traversal. Đặc biệt phải
characterize `UpdatePermissionsRequest.Permissions` và
`PermissionRequestValidator` trước khi bỏ adapter; không bỏ child validation,
không chạy hai lần. Lỗi hiện có “rule Menu kiểm tra RoleId” không được sửa lẫn
trong upgrade này.

Kiểm thử trước/sau phải bao phủ HTTP thật qua đăng ký MVC production:
malformed JSON, body rỗng/null, DTO thiếu trường, nhiều lỗi, child collection,
request hợp lệ, cancellation và async validator. Khóa ít nhất một lỗi tiếng Việt
đầu tiên và toàn bộ envelope; validator unit check riêng không đủ.
Với route có quyền như `POST /api/User/insert`, `POST /api/Faculty/insert`,
phải giữ authorization filter thật. Dùng dependency boundary giả tại test để
cho phép/từ chối quyền; không gỡ attribute hoặc thêm AllowAnonymous vào production.
Xác nhận request không có quyền bị chặn trước action validation/business mutation.

## 5. Các điểm nâng cấp khác

### Shared và forwarded headers

Đổi API obsolete `KnownNetworks`/`Microsoft.AspNetCore.HttpOverrides.IPNetwork`
sang `KnownIPNetworks`/`System.Net.IPNetwork` theo
[hướng dẫn .NET 10](https://learn.microsoft.com/en-us/aspnet/core/breaking-changes/10/ipnetwork-knownnetworks-obsolete?view=aspnetcore-10.0).
Giữ mạng tin cậy `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, hai loopback
và `ForwardLimit` từng caller. Không để danh sách trust rỗng rồi tin mọi proxy.
Đây là đổi API tương đương, không mở đợt thiết kế lại cách lấy client IP.

### ServiceDefaults và Gateway

Giữ discovery/standard resilience của HttpClient, health `/health`, `/alive`
trong các môi trường hiện tại; giữ application source, logs/scopes, metrics/traces,
lọc health khỏi trace và chỉ bật OTLP khi endpoint không rỗng.
Không thêm ServiceDefaults vào Gateway chỉ để đồng nhất project reference.

File/Catalog vẫn có Polly retry cho audit RPC ngoài resilience handler mặc định.
Kiểm tra số lần gọi, timeout, cancellation và mất kết nối bằng upstream cô lập;
không đổi policy tổng thể hoặc tăng retry âm thầm. Không chấp nhận retry mutation
nhiều hơn baseline. Nếu phát hiện lỗi có sẵn, ghi rõ baseline và tách quyết định sửa.

Gateway giữ routes, transforms, cluster ID/aliases, session affinity, load balancing,
passive health và `FileServiceBoundary`, kể cả khi config reload. Không thêm route
cho service vắng mặt, không đổi cách resolve destination ngoài phạm vi tương thích.
Nâng package discovery không được quảng bá thành tính năng discovery đã bật.

### gRPC, authentication và file

Giữ route/DTO/protobuf descriptor và field number. Giữ HTTP/1.1
`RequestVersionExact` của gRPC-Web client, header `x-service-authorization`
do `GrpcJwtInterceptor` chuyển từ bearer token, authentication/permission/audit.
Không đổi JWT raw claim `name` là GUID actor, `unique_name` là username;
không tái bật inbound claim mapping.

Giữ giới hạn file 50 MiB và gRPC 128 MiB tại ranh giới hiện có; không suy từ
giới hạn multipart 120 MiB của Gateway rằng mọi file 120 MiB được nhận.
Giữ một writer trên private persistent volume, `FileStorage:RootPath` tuyệt đối,
ngoài webroot, chặn symlink/junction/traversal. Không phục vụ uploads bằng static.
Giữ owner của batch, receipt immutable, retry finalize và rollback/lifecycle avatar;
không xóa avatar cũ trước khi lưu DB thành công.

### Swagger/OpenAPI và mapping

Swashbuckle 6 lên 10 có thay đổi API do Microsoft.OpenApi v2+;
[migration guide](https://raw.githubusercontent.com/domaindrivendev/Swashbuckle.AspNetCore/master/docs/migrating-to-v10.md)
là căn cứ sửa namespace/schema/filter cần thiết. Giữ Swagger UI và document
OpenAPI 3.0 hiện có, không tự chuyển sang 3.1 hoặc thay bằng built-in OpenAPI.
Kiểm tra document JSON, schema multipart/IFormFile, security và sáu route Faculty.
AutoMapper phải resolve cấu hình thực, map DTO/date converters, không bỏ profile.

### EF và dữ liệu

Giữ Npgsql cho System, Oracle MySql.EntityFrameworkCore cho Catalog, database-first,
mapping UUID/date/bool/nullability/soft-delete và audit interceptors hiện có.
Không dùng upgrade package làm lý do scaffold lại toàn entity hoặc đổi connection
string. Kiểm tra DI/model/SQL translation không mở DB trước; tích hợp provider
chỉ chạy với fixture cô lập và quyền riêng tại mục 7.

## 6. AppHost, SDK và container

AppHost sau nâng cấp chỉ chứa File, System, Catalog, Gateway và Web.
Xóa ProjectReference/resource/WithReference của BusinessService; xóa
CollabService AddNpmApp. Không xóa frontend business screens.
Giữ File tham chiếu System cho audit; System tham chiếu File; Catalog tham chiếu
System/File; Gateway tham chiếu System/Catalog/File; Web tham chiếu Gateway.
Không biến vòng discovery File/System thành vòng `WaitFor` gây startup deadlock.

Thay NodeJs bằng JavaScript `13.6.3`, dùng
`AddJavaScriptApp("Web", "../../apps/Blocks.Web", "dev")` theo
[API JavaScript chính thức](https://aspire.dev/reference/api/csharp/aspire.hosting.javascript/javascripthostingextensions/).
Giữ Web path, script `dev`, endpoint port `5173`, env `VITE_DEV_PORT` và visibility.
Không dùng `AddViteApp` trong đợt này để tránh thay cách cấp port/CLI arguments
khi `vite.config.ts` đã đọc `VITE_DEV_PORT`. Không đổi package manager/lockfile;
nếu cấu hình install hook của Aspire thì dùng npm `ci`, không npm `install`.
Không thêm DB resource, migration/seed, credentials hoặc fallback cấu hình.
Hosting PostgreSQL không được dùng trong source AppHost thì bỏ dependency,
không tạo PostgreSQL container để hợp thức hóa package.

Giữ `<Sdk Name="Aspire.AppHost.Sdk" ... />` ở version `13.6.3` cùng Hosting.AppHost,
giữ UserSecretsId hiện có; không ép Aspire version bằng runtime version.
Build AppHost/solution là kiểm chứng cấu trúc, không chứng minh launch đầy đủ.
Smoke orchestration cần cấu hình DB/JWT/storage và Node/container prerequisites
đã được owner kiểm tra, không tự khởi chạy ứng dụng với dữ liệu thật.

File Docker runtime/sdk chuyển từ 8.0 sang 10.0. System/Catalog đã dùng 10.0,
vẫn rebuild/kiểm tra image. Dùng image Microsoft .NET 10 stable đã vá;
ghi digest image thực kiểm thử để triển khai/rollback, không chỉ ghi tag nổi.
Thêm `global.json` vào Docker context allowlist và COPY trước restore ở cả ba
Dockerfile, giữ layout hiện có và các linked protobuf cần thiết.

Default Linux .NET 10 image
[chuyển từ Debian sang Ubuntu 24.04](https://learn.microsoft.com/en-us/dotnet/core/compatibility/containers/10.0/default-images-use-ubuntu).
Phải kiểm tra `$APP_UID`, private volume ownership, case-sensitive paths,
symlinks, TLS/CA, globalization/date handling và HTTP/gRPC ports.
Không khắc phục quyền volume bằng root hoặc world-writable directory.

Publish riêng từng service vào thư mục riêng; không vô hiệu
`ErrorOnDuplicatePublishOutputFiles`. Harness File tham chiếu hai web project có
thể vướng `NETSDK1152` khi publish chung; dùng Release build output để chạy harness
Linux, production publish/image được kiểm tra riêng.

## 7. Chiến lược kiểm chứng và cổng nghiệm thu

Tất cả mục sau là **phải chạy khi triển khai**, chưa phải kết quả PASS.
Ghi riêng baseline failure, regression, NOT RUN và lý do; không nhận toàn hệ thống
từ DB-free checks. Dùng harness console hiện có, thêm assert/check tối thiểu cho
logic mới; không thêm test framework.

| Nhóm | Kiểm chứng bắt buộc |
| --- | --- |
| Toolchain/graph | SDK .NET 10 đúng pin; restore từng project; direct/transitive outdated, deprecated và vulnerability audit; không NU1605/NU1608; không legacy ASP.NET Core 2.2 quay lại. |
| Build | Build trực tiếp Shared, Defaults, bốn service, AppHost và ba harness; sau dọn AppHost build `Blocks.slnx` Release. Không dùng AppHost baseline lỗi để bỏ qua lỗi mới. |
| Source checks | `test/SystemService.BusinessDependency.Check.ps1`, `test/CatalogService.Removal.Check.ps1`. |
| File | Toàn bộ FileService.RemovalChecks: mặc định toàn bộ; các nhóm `paths`, `sessions`, `lifecycle`, `transport`, `gateway`, `boundary`, `migration`. Chỉ temp fixture riêng. |
| System | CleanupChecks `contract`, `runtime`; validation HTTP production và mapping/JWT/gRPC bổ sung; `telemetry` với collector cô lập. |
| Catalog | CleanupChecks `contract`, `runtime`; validation HTTP production, nested graph nơi có dùng; Oracle model/SQL và Swagger sáu route. |
| Shared/Defaults | Consumer checks ở cả bốn service; proxy trusted/untrusted, DI, discovery resolve, bounded retry/cancel, OTLP export và shutdown flush. Gateway không có Defaults thì không áp giả định OTLP của Defaults. |
| AppHost | Không reference/resource tới project vắng mặt; build và cấu trúc resource/endpoint đúng. Launch với fixture/cấu hình được phép là cổng riêng. |
| Artifact/OS | Standalone publish của từng service; image hiện có build và smoke trên Linux; File DB-free checks trên Windows/Linux, production File startup với root fixture riêng. Scan CVE image riêng với NuGet audit. |

Các assertion đang khóa pin cũ phải được cập nhật có chủ đích:
`test/SystemService.CleanupChecks/Program.cs` khóa AutoMapper/OTel và security floor;
`test/CatalogService.Removal.Check.ps1` khóa Oracle/JWT/Protobuf/EF/Docker.
Đổi expected version theo graph đã chọn, giữ mục đích kiểm tra; không xóa assertion
security/provider để đạt PASS. Harness csproj có EF trực tiếp phải cùng patch đã chọn.

Validation tests phải chứng minh không gọi business mutation/audit khi input bị
chặn, đồng thời không bypass production authentication/permission. Test seam chỉ
thay dependency ngoài process/DB bằng fixture, không thay auth filter.
Nếu baseline child-validation hoặc lỗi đầu tiên khác dự đoán ở mục 4, cập nhật
characterization và bảo toàn hành vi quan sát được trước khi đổi tích hợp.

### Cổng cần cấu hình/quyền riêng

- System `telemetry`: `SYSTEMSERVICE_CLEANUP_TEST_OTLP_ENDPOINT`, URI http localhost
  tuyệt đối có port rõ, không credentials; receiver cô lập, không gửi vào collector thật.
- System `auth`: chỉ khi được cấp quyền cho localhost DB
  `blocks_systemservice_cleanup_test` qua `SYSTEMSERVICE_CLEANUP_TEST_CONNECTION`;
  harness tạo/xóa schema duy nhất nó sở hữu.
- Catalog `provider`: chỉ khi được cấp quyền cho localhost DB rỗng
  `blocks_catalogservice_upgrade_test` qua `CATALOGSERVICE_UPGRADE_TEST_CONNECTION`;
  từ chối object có sẵn, chỉ tạo/xóa `faculty` fixture nó sở hữu.
- Provider comparison, CRUD thật, permission/audit persistence E2E, AppHost runtime,
  external consumer compatibility, deployment firewall/volume và owner license
  approval là cổng rollout, không tự suy từ build hay test double.

Không dùng connection/storage từ appsettings làm fallback cho test. Thiếu fixture
hoặc quyền thì ghi NOT RUN và giữ cổng chưa đạt; không tự tạo DB, đổi permissions,
đọc dữ liệu thật hoặc nhận “nâng cấp production hoàn tất”.

## 8. Triển khai và rollback

Sau khi spec được duyệt mới viết implementation plan. Thứ tự phụ thuộc:
ghi baseline và graph; nâng target/SDK cùng Shared/Defaults và validation adapter;
nâng consumer/provider/Swagger; sửa AppHost; cập nhật artifact/harness/docs;
chạy toàn bộ cổng khả dụng, ghi rõ phần còn chặn.
Một spec không yêu cầu mọi bước cùng một commit hay mọi process cùng deploy.

Chỉ release khi có manifest phiên bản/graph, kết quả checks, image digest, config
inventory không secrets và owner sign-off các cổng môi trường. Không thay schema
hay file format trong đợt này. Nếu dependency buộc đổi persistence contract,
dừng và xin sửa spec, không thêm migration ngầm.

Trước rollout lưu artifact/config trước nâng cấp và kiểm chứng backup/khả năng
đọc metadata storage hiện có. FileService phải dừng writer cũ rồi mới chạy writer
mới; không rolling hai writer trên cùng volume. Thực hiện smoke bằng file riêng
được phép, không chạy harness trên storage triển khai.

Rollback dùng artifact và config đã kiểm chứng tương thích, cùng nguyên tắc một
writer; không xóa Temp/Files/Avatars/Deleted, không rollback DB bằng script tự phát.
Không mặc định rollback về Catalog AutoMapper `16.0.0` có advisory; cần artifact
dự phòng đã vá hoặc owner xử lý rủi ro bảo mật riêng.

## 9. Quyết định còn giao cho builder

Builder chọn tên file/helper/filter nhỏ, vị trí các assert trong harness hiện có,
thứ tự commit và fixture ephemeral ports. Có thể bỏ dependency thực sự không dùng
nếu chứng minh bằng source/callers/graph và consumer checks; không dọn rộng.
Không thêm abstraction, caching/reflection framework hoặc adapter package mới.
Nếu cần simplification trong code, comment `ponytail:` nêu giới hạn và khi nào
cần mở rộng; không dùng comment để miễn trừ security, validation hoặc accessibility.

Không còn câu hỏi về phạm vi: toàn backend hiện có, không backend đã bị xóa.
License, quyền DB cô lập và môi trường deploy là điều kiện phát hành cần owner
xác nhận, không phải quyền được ngầm cấp bởi việc duyệt thiết kế.

## 10. Rà soát thiết kế

Builder review độc lập ngày 2026-10-23: **không còn câu hỏi quan trọng trước khi
lập plan**. Đã rà validation ordering/child traversal, SDK/Docker/AppHost,
dependency graph và phân biệt kiểm chứng cô lập với các cổng môi trường.
Review này không thay việc người dùng duyệt spec và không chứng minh runtime.

Kiểm chứng tài liệu: 6 liên kết nội bộ tồn tại; tất cả package trực tiếp của
10 `.csproj` đã nằm trong inventory; kiểm tra whitespace bằng Git trước commit.
Chỉ thêm spec này. Chưa thay product code/package; chưa restore/build/test hoặc
truy cập DB. Chờ người dùng duyệt, sau đó mới viết implementation plan.
