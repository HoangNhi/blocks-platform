# FileService: bảo vệ storage và sửa vòng đời upload

Ngày: 2026-10-22

Trạng thái: **Người dùng đã duyệt ngày 2026-10-22 và yêu cầu tạo implementation plan.**
Người dùng cho phép commit các thay đổi hiện tại trước khi lập plan.
Chưa cho phép triển khai hardening, đổi cấu hình thật, dữ liệu hoặc di chuyển file.

## 1. Mục tiêu và quyết định đã có

Người dùng muốn giữ FileService hiện tại, tự host hệ thống và có thể xây service
RAG sau khi dọn dự án. Không thay FileService bằng dịch vụ lưu trữ khác.
Watermark và chuyển Word/Excel sang PDF đã được bỏ vì thuộc Business logic cũ.

Spec này đề xuất xử lý:

- Giới hạn mọi thao tác filesystem trong đúng vùng được phép.
- Không công khai file tạm, tài liệu gốc, file đã xóa hoặc cache cũ qua static.
- Không mất batch upload trước khi batch thay thế hoàn tất.
- Sửa đổi/xóa avatar và đồng bộ với thao tác lưu user.
- Thống nhất contract upload giữa frontend, SystemService và FileService.
- Ngừng phục vụ luồng embed gắn riêng với SAR trong FileService.

Giới hạn đã duyệt: một FileService instance ghi vào một persistent volume riêng;
không có tiến trình khác sửa volume. Quyền đọc avatar và giới hạn gRPC tại mục 5
đã được người dùng chấp nhận cùng bản spec.

Không thêm DB cho FileService, object storage, message broker, thư viện xử lý ảnh,
watermark, Office conversion hoặc RAG trong đợt này.

## 2. Hiện trạng làm cơ sở

Đường dẫn FileService trong bảng tính từ `src/services/Blocks.FileService/`.
Working tree đã có thay đổi bỏ watermark/conversion; phải dùng source hiện tại,
không lấy HEAD cũ làm baseline và không ghi đè thay đổi CatalogService đang có.

| Vị trí | Vấn đề còn lại |
| --- | --- |
| `Services/CoreFeature/UploadFile/UploadFileService.cs`, `Insert` | Xóa thư mục cũ trước validation; tên client được dùng làm tên file vật lý. |
| Cùng file, `UploadData`, `DeleteData`, `UploadAvatar` | Nhiều thành phần đường dẫn chưa được ràng buộc; chưa gắn batch tạm với actor. |
| Cùng file, `PreviewFileAsync` | Kiểm tra prefix root thiếu ranh giới thư mục; đọc toàn bộ file vào bộ nhớ. |
| `Program.cs`, `UseStaticFiles` | File dưới web root được phục vụ trước xác thực. |
| Cùng service, `DeleteData` | Chỉ chuyển file vào `wwwroot/Deleted`, vẫn thuộc vùng static. |
| Cùng service, `InsertAndReturn` | Hardcode `sar-embeds/sar-embeds`, tự finalize không qua backend nghiệp vụ. |
| `Controllers/UploadFileController.cs`, `Post` | Upload tạm chỉ trả envelope thành công, không trả `Data`. |
| `src/apps/Blocks.Web/src/components/ui/upload-avatar.tsx` | Đợi `Data[0].FileUrl`; dùng `null` cho cả không đổi và upload lỗi. |
| `src/services/Blocks.SystemService/Services/CoreFeature/User/UserService.cs` | Map request trước khi giữ avatar cũ; thay file trước `SaveChangesAsync`. |
| `src/apps/Blocks.Web/src/features/file/api/uploadfile.api.ts` | Preview tài liệu vẫn gọi BusinessService không có trong checkout. |

Kiểm tra gần nhất ngày 2026-10-22: 11 checks của `test/FileService.RemovalChecks`
pass; audit package FileService trực tiếp/gián tiếp không báo package có lỗ hổng
theo nguồn hiện tại. Đây không phải bằng chứng đã xử lý các lỗi trên, kiểm chứng
phân quyền qua transport hoặc xác nhận image/runtime triển khai không có advisory.

Tham chiếu quyết định liên quan:

- `2026-10-21-systemservice-remove-businessservice-design.md`: giữ tích hợp avatar,
  audit và FileService client; không khôi phục BusinessService.
- `2026-10-22-systemservice-security-hardening-design.md`: giữ HTTP envelope,
  authentication và kiểm chứng consumer. Danh sách dependency trong tài liệu đó
  là lịch sử tại thời điểm viết, không thay cho graph hiện tại.

## 3. Các phương án

| Phương án | Đánh đổi |
| --- | --- |
| **Đề xuất: gia cố FileService, storage riêng và metadata batch trên đĩa** | Không thêm hạ tầng; sửa được lỗi đã nêu. Cần rollout đồng bộ storage, gateway và frontend; chỉ hỗ trợ một writer. |
| Chỉ sửa path và avatar, tiếp tục static hiện tại | Diff nhỏ nhưng không giải quyết truy cập trực tiếp vào tài liệu riêng tư. Không đủ nghiệm thu. |
| Thêm DB metadata/ACL và API quản lý tài liệu đầy đủ | Thuận lợi khi cần nhiều writer hoặc quản lý tài liệu độc lập, nhưng mở rộng thành subsystem mới. Chưa cần cho phạm vi này. |

Chọn phương án đầu làm nội dung đề xuất. Dùng API filesystem, JSON và cơ chế
đồng bộ sẵn có; không tạo repository abstraction, storage provider hoặc saga tổng quát.

## 4. Storage và ràng buộc đường dẫn

### 4.1. Storage riêng

Thêm cấu hình `FileStorage:RootPath`, bắt buộc trỏ đến thư mục tuyệt đối trên
persistent volume. Không mặc định về `wwwroot` khi thiếu hoặc cấu hình sai.

```text
<RootPath>/
  Temp/<actor-id>/<folder-id>/
    manifest.json
    batches/<batch-id>/<file-id>.<ext>
  Files/<service>/<module>/<related-id>/<file-id>.<ext>
  Avatars/<file-id>.<ext>
  Deleted/<deletion-id>/...
  LegacyQuarantine/...
```

`actor-id` lấy từ claim `name` chứa GUID User.Id do JWTHelper hiện tại phát hành,
không dùng username/`Identity.Name` làm ID và không lấy từ form/header tự khai báo.
Phải kiểm chứng claim sau token mapping ở cả HTTP và gRPC; thiếu/sai ID thì từ chối,
không đổi claim JWT dùng chung chỉ để phục vụ đợt này. FileService đặt
`MapInboundClaims=false` và `NameClaimType=unique_name` như SystemService để owner
đọc `name`, audit giữ username ở `unique_name`. `folder-id` là GUID client hiện
dùng trong `FolderName`, chỉ là alias của phiên upload, không phải bí mật hoặc bằng
chứng sở hữu. Tên vật lý do server sinh.

`manifest.json` chỉ lưu metadata của phiên upload: actor, folder, batch hiện hành,
thời điểm tạo, danh sách file/tên gốc/kích thước/loại, trạng thái finalize và kết
quả finalize. Không lưu JWT, thông tin đăng nhập hoặc đường dẫn tuyệt đối trả cho client.

Startup phải từ chối root chứa web root, nằm trong web root, trùng web root hoặc
đi qua symlink/junction chưa được phép. Cấp quyền OS cho tài khoản service và
quản trị viên cần thiết; không cho user khác ghi vào cây storage.
Không bật directory browsing hoặc mount storage bằng static file provider.

### 4.2. Một quy tắc resolve dùng chung

Áp dụng cho ghi, đọc, copy, move, delete, metadata và cleanup; không chỉ preview:

- Không nhận đường dẫn tuyệt đối, URL, UNC, drive-relative path, ADS hoặc segment
  `.`/`..`. Không decode URL thêm lần nữa trong storage layer.
- `service` và `module` chọn từ mapping server đã đăng ký, không coi chuỗi hợp lệ
  cú pháp là đủ quyền ghi. Ban đầu chỉ đăng ký namespace System cần cho caller thật.
- `related-id`, `folder-id`, `file-id` mới phải là GUID khác rỗng. Key cũ chỉ được
  dùng nếu đã kiểm kê/migrate hợp lệ; không thêm fallback nhận mọi chuỗi cũ.
- Tên gốc chỉ là metadata hiển thị. Từ chối control character và tên có thành phần
  đường dẫn; không dùng tên gốc để tạo hoặc xóa file. Không tin MIME client gửi.
- Canonicalize rồi kiểm tra containment theo ranh giới segment, đúng case semantics
  của OS. Root có tiền tố giống nhau như `storage-other` không được chấp nhận.
- Không đi theo symlink, junction hoặc reparse point trong các thành phần truy cập.
  Containment bằng chuỗi không tự giải quyết các trường hợp này.
- Tách resolver theo vùng được phép: đọc file chính không được đọc `Temp`,
  `Deleted`, manifest hoặc quarantine, kể cả vẫn nằm dưới storage root.

Chỉ cần helper cục bộ nhỏ trong FileService. Không chuyển quy tắc này sang Shared
khi chưa có consumer thứ hai.

### 4.3. Logical key và delete

Giữ logical key tương đối trong DB/DTO, không lưu địa chỉ máy chủ hay absolute path.
Ví dụ `System/Avatar/<uuid>.png` ánh xạ sang `Avatars/<uuid>.png`; key tài liệu
được ánh xạ sang `Files/...` qua mapping đã đăng ký, không combine tùy ý.
Tên `FileUrl` cũ vẫn giữ tương thích DTO nhưng không có nghĩa là URL static công khai.

Delete chỉ nhận key của vùng file chính đã được backend có quyền chọn. Chuyển sang
`Deleted` với deletion ID server sinh và lưu receipt đủ để phân biệt retry với
file chưa từng tồn tại. Chỉ trả thành công khi đã chuyển hoặc xác nhận receipt
đúng key; không mặc nhiên coi mọi file thiếu là đã xóa.
Batch delete có thể thành công một phần như contract hiện tại, phải trả false khi
còn lỗi và log kết quả từng phần, không nuốt lỗi mất dấu.

Không phục vụ hoặc tự purge `Deleted`/quarantine. Chính sách giữ và xóa vật lý thật
cần phê duyệt riêng; spec này không cho phép xóa dữ liệu lịch sử.

## 5. Quyền truy cập và HTTP/gRPC

### 5.1. Ranh giới tin cậy

JWT hiện tại xác thực người dùng; tên header `x-service-authorization` không chứng
minh request đến từ service. Không dùng CORS, header do client đặt hoặc việc
không tìm thấy caller frontend làm bằng chứng RPC là nội bộ.

Đề xuất giữ JWT hiện có, bổ sung ranh giới triển khai bắt buộc:

- FileService không mở cổng trực tiếp ra mạng người dùng/Internet.
- Gateway chỉ public các HTTP action đã chọn; từ chối toàn bộ đường dẫn FileProto,
  cả gRPC native và gRPC-Web, kể cả request có JWT hợp lệ. Package protobuf là
  `file`, service là `FileProto`: xét route `/file.FileProto/{method}` và các
  prefix/transform thực tế, không nhầm với C# namespace `Blocks.FileService.Protos`.
- Backend gọi RPC qua mạng riêng chỉ cho các backend được phép; frontend chỉ gọi
  qua Gateway. Không cho reverse proxy cấu hình catch-all đến FileService.
- Backend nghiệp vụ kiểm tra quyền đối tượng trước khi gửi key lấy từ DB sang
  RPC. FileService tiếp tục kiểm tra namespace, batch owner và filesystem boundary.
- RPC finalize lấy actor của JWT được forward để so với owner phiên upload.
  Thiếu actor hợp lệ hoặc không khớp phải bị từ chối trước thao tác file.

Validation RPC dùng status gRPC, không trả BaseResponse JSON thay message:
input sai là `InvalidArgument`, không xác thực là `Unauthenticated`, sai owner là
`PermissionDenied`, phiên thiếu/hỏng/không còn dùng được là `FailedPrecondition`,
vượt giới hạn là `ResourceExhausted`. Lỗi I/O không trả raw exception hoặc absolute
path. Kiểm chứng status qua request thật, không chỉ gọi method.

Giới hạn: đây không phải service identity hay ACL độc lập cho mọi file; backend
trên mạng tin cậy chịu trách nhiệm quyền đối tượng. Nếu không triển khai/kiểm chứng
được ranh giới này, **không nghiệm thu** phương án; cần sửa spec để thêm xác thực
service và authorization thích hợp, không hạ yêu cầu thành "có JWT là đủ".

### 5.2. Đọc tài liệu

Không mở HTTP endpoint tổng quát nhận raw path để đọc mọi file.
Backend có dữ liệu nghiệp vụ kiểm tra quyền, lấy key từ DB rồi gọi preview RPC.
Browser không được tự chọn đường dẫn thay cho kiểm tra quyền đó.

BusinessService hiện vắng nên các preview nghiệp vụ đó chưa được khôi phục trong
đợt này. Không viết backend giả hoặc public tài liệu để làm các màn hình cũ chạy.
Client ngoài repo đang gọi RPC phải được kiểm kê trước rollout.

Download trong `upload-file.tsx` và nhánh video của `file-viewer-dialog.tsx` cũng
đang dùng URL static trực tiếp. Đây là breaking change có chủ đích: bỏ fallback
`window.open`/direct URL cho private key và báo không hỗ trợ khi thiếu endpoint
nghiệp vụ có quyền. Không chuyển request qua bearer rồi coi đó là đủ authorization.
Không cam kết giữ phát video/range request trong đợt này; muốn giữ phải bổ sung
backend quyền đối tượng tương ứng vào spec trước khi triển khai.

Preview RPC trả bytes gốc và MIME, không chuyển Office sang PDF. Giới hạn đọc
50 MiB trong đợt này, từ chối quá giới hạn trước cấp phát toàn bộ file; không coi
giới hạn message gRPC là giới hạn cấp phát. Streaming lớn hơn để đợt sau khi cần.
Khi backend phục vụ tài liệu cho browser, dùng download attachment cho nội dung
không được phép inline; không tự render SVG/HTML do user tải lên như nội dung tin cậy.

### 5.3. Avatar

Đề xuất HTTP `GET /api/Avatar/{fileName}` tại FileService, qua prefix File của
Gateway. Chỉ nhận tên UUID và extension ảnh raster được hỗ trợ, chỉ resolve vùng
`Avatars`; không nhận full path hoặc URL.

Chính sách đề xuất: user có JWT hợp lệ được xem avatar chưa xóa trong hệ thống,
không cần quyền VIEW User. Đây là chính sách riêng cho ảnh hồ sơ, không áp dụng
cho tài liệu. Người dùng ẩn danh không được xem avatar.
Không kiểm tra trạng thái tài khoản theo DB ở mỗi request trong đợt này; giữ
giới hạn hiệu lực JWT của hệ thống hiện tại.

Frontend tải avatar bằng API client có bearer token, chuyển blob thành object URL.
Không nhét token vào query string, không đổi sang public chỉ để dùng `<img src>`.
Tái sử dụng phần tải ảnh nhỏ tại các caller avatar; hủy request và revoke object
URL khi đổi ảnh/unmount, xóa cache ảnh theo phiên khi logout/đổi tài khoản.
Response đặt `Cache-Control: no-store` và `X-Content-Type-Options: nosniff`.
Ảnh mặc định do ứng dụng cung cấp có thể giữ public, không phải file user upload.

## 6. Upload tạm không phá dữ liệu

Giữ `POST /api/UploadFile`, form `files` và `FolderName`.
Giữ giới hạn request 50 MiB hiện có; kiểm tra batch không rỗng, file không rỗng,
extension allowlist và tổng bytes thực ghi không vượt giới hạn.
Avatar lúc finalize chỉ nhận đúng một PNG/JPEG/WebP với header định dạng phù hợp;
không nhận SVG, file tài liệu hoặc nhiều file rồi lấy tùy ý file đầu.
Kiểm tra header không phải quét mã độc hoặc bảo đảm ảnh giải mã được.

Batch thay thế không ghi lên batch đang dùng:

1. Xác thực actor và phiên; validate toàn bộ metadata trước.
2. Ghi batch mới vào thư mục UUID riêng, dùng tên file UUID và không overwrite.
3. Copy lỗi, client hủy hoặc hết dung lượng: chỉ dọn batch mới chưa publish;
   batch cũ và manifest hiện hành không thay đổi.
4. Khi toàn bộ file hoàn tất, publish manifest mới bằng thay thế metadata trong
   cùng filesystem. Không coi hai thao tác rename thư mục là một transaction.
5. Chỉ batch được manifest trỏ tới mới được finalize. Batch cũ chưa tham chiếu
   có thể giữ để recovery; không xóa trước điểm publish thành công.

Trong một process, tuần tự hóa thay thế/finalize cùng actor và folder bằng cơ chế
đồng bộ có sẵn; giải phóng entry khóa khi không còn sử dụng. Hai actor có cùng
FolderName không nhìn thấy hoặc ghi đè dữ liệu nhau.
Không chạy nhiều writer dùng chung volume; khi cần phải duyệt lại thiết kế khóa
và metadata. Nếu code cần giải thích giới hạn này, dùng comment `ponytail:`.

Manifest bị thiếu/hỏng hoặc finalize đang dở không được coi là batch rỗng thành
công. Khi restart, chỉ dùng manifest đã publish hợp lệ; batch chưa publish không
được tự động trở thành dữ liệu hiện hành. Không hứa bảo đảm trước mất điện nếu
chưa có kiểm chứng durability của filesystem và cách flush thực tế.

Finalize lưu target, ID đích và trạng thái trước khi copy. Chỉ đánh dấu hoàn tất
khi toàn bộ file đích sẵn sàng; giữ nguồn khi lỗi. Retry cùng phiên, batch và target
phải dùng lại ID đích/kết quả cũ; không sinh bản sao mới. Target khác bị từ chối.
Phiên đã finalize không được thay batch để vô tình tái sử dụng kết quả cũ; muốn
upload tiếp phải tạo FolderName mới. Receipt trỏ đến file đã xóa/không còn khả dụng
phải trả lỗi yêu cầu upload lại, không trả key hỏng hoặc tự khôi phục file đã xóa.
Cleanup nguồn chỉ diễn ra sau receipt hoàn tất.

Không thêm job xóa file tạm tự động trong đợt này. Triển khai phải có volume quota,
cảnh báo dung lượng và quy trình dọn batch mồ côi đã kiểm kê; lỗi hết dung lượng
phải giữ dữ liệu hiện hành. Quota theo user và retention tự động là phạm vi sau,
không tuyên bố volume quota giải quyết lạm dụng theo từng tài khoản.

## 7. Contract upload và vòng đời avatar

### 7.1. Upload chỉ xác nhận staged

Giữ response `Success`, `StatusCode`, `Data`, `Message` và semantics HTTP hiện có.
`POST /api/UploadFile` tiếp tục không trả danh sách attachment hoặc URL cuối.
Frontend đổi kiểu trả về thành acknowledgement không có attachment Data; chỉ
coi staged thành công khi `Success=true`. Không trả URL tạm để lách contract.

Ref avatar trả kết quả phân biệt `unchanged`, `remove`, `staged`; lỗi upload phải
throw hoặc trả lỗi riêng buộc caller dừng save, không gộp thành `null`.
Sửa cả User popup và EditProfile popup; lỗi upload không được tiếp tục lưu user.
Component upload nhiều file giữ kiểu boolean nếu đã đủ cho caller của nó.

### 7.2. Ý định thay avatar rõ ràng

Thêm trường `AvatarAction` vào request user/profile, giá trị `keep`, `replace`,
`remove`, mặc định `keep`; validate tại trust boundary:

| Action | Hành vi |
| --- | --- |
| `keep` | Giữ key trong DB; không lấy avatar từ request, không đọc batch tạm. |
| `replace` | Yêu cầu FolderUpload có batch đúng owner và đúng loại avatar; thiếu/sai phải fail trước lưu DB, không âm thầm giữ ảnh cũ. |
| `remove` | Lưu avatar rỗng; dọn ảnh cũ sau khi DB commit, không yêu cầu file mới. |

Giữ trường `Avatar` để tương thích DTO nhưng không tin client cung cấp đường dẫn
đích hoặc đường dẫn cần xóa. Bỏ mapping tự động trường này ở request-to-entity;
giữ các mapping khác. Caller cũ không gửi AvatarAction chỉ còn hành vi keep;
phải thông báo và nâng client trước rollout nếu chúng cần thay/xóa ảnh.

### 7.3. Trình tự lưu và dọn ảnh

1. SystemService giữ avatar cũ từ entity DB trước mapping; kiểm tra quyền sửa user
   bằng luồng hiện có, không lấy ảnh cũ từ request.
2. Với replace, gọi UploadAvatar để tạo file mới bất biến từ batch owner đã kiểm
   tra. RPC này không xóa ảnh cũ dù request vẫn có trường `oldImage`.
3. Gán key server trả về rồi lưu DB. Với remove, lưu rỗng. Lỗi DB không được xóa
   ảnh cũ; không xóa ảnh mới khi chưa chắc transaction đã thất bại hay vẫn có
   request khác tham chiếu. Ghi nhận file ứng viên mồ côi để đối soát.
4. Chỉ sau DB commit thành công mới ghi nhận key ảnh cũ cần dọn, nếu key thật sự
   thay đổi. Đợt này không delete đồng bộ trong request save: kiểm tra reference
   một lần rồi delete vẫn có race với request khác đang dùng receipt finalize.
   Dọn qua quy trình đối soát khi tạm dừng ghi, xác nhận không còn bản ghi User
   hoặc consumer đã kiểm kê nào tham chiếu key. Chưa chứng minh được thì giữ file.
   Cleanup fail không biến một user đã lưu thành save failure.

Không có transaction chung giữa DB và filesystem. Crash sau DB commit có thể mất
ghi nhận cleanup; đối soát volume với DB là nguồn kiểm tra cuối, không dựa riêng
vào log. Spec chấp nhận giữ ảnh cũ/mồ côi đến kỳ đối soát, không bảo đảm dọn tức thời
hoặc thu hồi quyền đọc URL avatar cũ ngay khi save. Ưu tiên không làm mất ảnh đang
được DB tham chiếu. Tự động cleanup online cần thiết kế concurrency riêng.

Trong cùng request DB lỗi xác định được, retry finalize trả cùng key mới.
Với cập nhật đồng thời cùng user, không tự xóa file ứng viên chưa chắc không còn
tham chiếu; đối soát xử lý phần rác. Không mở rộng thành thiết kế concurrency
token cho toàn bộ User trong đợt này.

## 8. Logic cũ, protobuf và dependency

- Đề xuất ngừng `POST /api/UploadFile/embed`: trả envelope thất bại với
  `StatusCode=410`, không upload/finalize. Bỏ `InsertAndReturn` và hardcode SAR
  sau khi kiểm kê consumer; frontend SAR hiển thị tính năng không còn được hỗ trợ,
  không giả thành công hoặc tự chuyển sang upload tạm.
- Không xóa màn hình Business hoặc viết lại các API preview Business trong đợt
  này. Ghi nhận chúng là luồng không có backend trong checkout, không tuyên bố
  hardening FileService đã phục hồi các luồng đó.
- Giữ tên RPC, protobuf field number và các trường watermark/conversion cũ để
  tương thích wire. `WatermarkText` khác rỗng tiếp tục nhận `Unimplemented`;
  không khôi phục xử lý. Mark deprecated khi phù hợp, không tái dùng tag.
- Giữ audit, JWT, permission hiện có. Không dùng cách tắt filter/interceptor để
  test qua hoặc khởi động được.
- Audit lại package sau restore khi triển khai. Nếu phát sinh advisory, ghi rõ
  package, graph, mức độ và bản vá đã kiểm chứng trước khi đề nghị mở rộng phạm vi.
  Không nâng dependency không liên quan hoặc tắt audit để đạt nghiệm thu.

## 9. Migration và rollout

Việc di chuyển file thật không thuộc quyền thực thi của lượt tạo spec này.
Trước rollout phải có backup và phê duyệt thao tác dữ liệu riêng.

1. Kiểm kê volume thực tế và DB key bằng truy vấn read-only được cho phép; phân
   loại file chính, avatar, temp, Deleted, PDF cache và file không xác định.
   Kiểm kê consumer ngoài repo, route Gateway từ cấu hình triển khai thực tế.
2. Backup DB liên quan và volume, ghi manifest đường dẫn/kích thước/checksum;
   thử phục hồi mẫu. Không coi copy xong là đủ bằng chứng backup dùng được.
3. Dừng ghi và các thao tác lưu có thể finalize; chặn truy cập static file cũ tại
   mọi origin/proxy. Không giữ fallback static để duy trì tương thích.
4. Copy file chính/avatar sang root riêng, giữ logical key bằng mapping đã kiểm
   chứng. Không di trú temp cũ thành batch có owner suy đoán; yêu cầu upload lại,
   giữ bản cũ trong quarantine. Avatar cũ không đạt định dạng mới phải được kiểm
   kê và có quyết định thay thế trước cutover; không âm thầm bỏ file rồi tuyên bố
   avatar vẫn tương thích.
5. Đưa Deleted/cache/không rõ owner vào vùng riêng không phục vụ; chưa purge.
   Đối chiếu checksum, key DB và quyền volume. Không đưa bản backup vào web root.
6. Triển khai đồng bộ FileService, SystemService, frontend và ranh giới Gateway/
   network. Bản public/publish/image không chứa dữ liệu upload cũ trong `wwwroot`;
   bản còn giữ để rollback phải ở vùng không public.
7. Smoke test qua mạng người dùng và mạng backend; chỉ mở lại ghi khi tiêu chí
   bắt buộc đạt. Nếu có proxy/CDN từng cache file riêng tư, xử lý cache đó riêng;
   đổi storage không thu hồi bytes đã tải hoặc cache trước đó.

Rollback phải dừng ghi lại và đối soát file phát sinh sau cutover với key DB trước
khi đổi version. Không rollback bằng cách bật lại static công khai hoặc trỏ code
cũ vào layout storage mới. Khi chưa bảo đảm tính nhất quán, giữ chế độ bảo trì.

## 10. Ranh giới thay đổi dự kiến

| Phạm vi | Nội dung |
| --- | --- |
| FileService upload service/controller | Resolve key, validation, manifest phiên, publish/finalize/retry, delete receipt; bỏ luồng embed SAR. |
| FileService Program/config/HTTP avatar | Root riêng, startup guard, không phục vụ upload qua static, avatar yêu cầu JWT. |
| FileService gRPC | Giữ contract, truyền actor đã xác thực và áp dụng validation; không nhận browser qua Gateway. |
| SystemService user/profile, mapping và file wrapper | AvatarAction, giữ key cũ, ghi nhận cleanup sau DB commit, không nhận key xóa từ client. |
| Frontend file API/types, upload/avatar, user/profile/nav | Acknowledgement đúng kiểu, tách lỗi/ý định, tải avatar qua API client; sửa caller avatar thực sự liên quan. |
| Frontend upload-file/file-viewer-dialog | Bỏ direct/static fallback cho private key; báo luồng thiếu backend có quyền, không hứa giữ video streaming. |
| Frontend SAR caller | Báo embed đã ngừng hỗ trợ; không xóa màn hình hoặc refactor nghiệp vụ. |
| Gateway/deployment boundary | Allowlist HTTP cần thiết, chặn FileProto và đường static cũ; không sửa route service khác. |
| Tests và tài liệu vận hành | Mở rộng harness hiện có, test frontend tại chỗ, runbook copy/verify/rollback không tự chạy trên dữ liệu thật. |

Không sửa AppHost/solution, CatalogService, schema DB, Shared/ServiceDefaults hoặc
cấu hình bí mật thật. Nếu đổi shared DTO/protobuf vượt phạm vi tương thích nêu
trên thì phải điều chỉnh spec và kiểm tra mọi consumer trước.

## 11. Kiểm thử và tiêu chí nghiệm thu

Mở rộng `test/FileService.RemovalChecks`, tái sử dụng harness console thay vì thêm
test framework backend. Thêm Vitest cạnh code frontend liên quan.
Test lỗi filesystem bằng fixture temp riêng và điểm tiêm lỗi tối thiểu phục vụ
harness; không đổi quyền hoặc xóa file của môi trường ứng dụng thật.
Fixture avatar hiện dùng bytes giả có đuôi PNG phải đổi sang ảnh PNG nhỏ hợp lệ;
không hạ validation mới chỉ để giữ test đó xanh.

| Nhóm | Bằng chứng bắt buộc |
| --- | --- |
| Path | Traversal `/` và `\`, absolute/UNC/drive-relative, ADS, sibling prefix, namespace lạ, GUID sai, symlink/junction đều bị từ chối; file ngoài fixture không thay đổi. |
| Hệ điều hành | Chạy containment trên Windows và Linux; kiểm tra case và symlink tương ứng, không chỉ test chuỗi mô phỏng OS. |
| Owner | Hai JWT khác actor dùng cùng FolderName không đọc, thay thế hoặc finalize batch của nhau. Thiếu actor bị từ chối. |
| Batch | File thứ hai sai, copy lỗi giữa chừng, client hủy, hết dung lượng giữ nguyên batch cũ; không publish batch chưa đủ. |
| Đồng thời/restart | Thay batch đua với finalize không trộn dữ liệu; restart trước/sau publish có kết quả xác định; manifest hỏng fail closed. |
| Finalize | Lỗi giữa batch giữ nguồn; retry trả cùng keys, không tạo bản sao; target khác bị chặn; không tái sử dụng phiên đã finalize. |
| Static | HTTP thực không token và có token đều không tải được URL static cũ của file chính, Temp, Deleted hoặc cache; kể cả file có extension được hỗ trợ trước đó. |
| Avatar HTTP | Không JWT/JWT sai bị chặn theo envelope hiện có; JWT hợp lệ đọc đúng raster avatar, không đọc path khác hoặc SVG; headers/cache và blob lifecycle đúng. |
| Gateway/network | JWT hợp lệ vẫn không gọi FileProto native/gRPC-Web từ mạng người dùng; không truy cập trực tiếp cổng FileService. Backend nội bộ hợp lệ vẫn gọi được. |
| Domain quyền | Backend phải từ chối request không có quyền đối tượng trước khi gọi RPC đọc/xóa. Không có domain backend trong checkout phải ghi NOT RUN, không dựng ACL luôn true. |
| Avatar save | keep/replace/remove, thiếu batch, sai owner/loại, lưu DB thất bại và retry; ảnh cũ không bị xóa trong request, cleanup đối soát giữ mọi key còn tham chiếu. |
| Frontend | Upload thành công không cần Data; lỗi phải chặn save; unchanged/remove/staged không lẫn; avatar cũ/mới hiển thị qua bearer request, logout giải phóng ảnh. |
| Download/video cũ | Private key không còn được dùng cho fetch/link/video static hoặc window.open fallback; thiếu endpoint nghiệp vụ thì có lỗi rõ ràng, không giả thành công. |
| Legacy | Embed không ghi file và trả lỗi có chủ đích; watermark vẫn Unimplemented; Office preview trả bytes gốc. |
| Dependency/publish | Audit graph mới; publish không chứa package đã bỏ hoặc file upload lịch sử. Không tuyên bố audit NuGet bao quát OS/base image. |
| Migration fixture | Copy dữ liệu giả có manifest/checksum, logical key giữ đúng, cache/quarantine không đọc được; rehearsal rollback không bật static. |

Chạy build riêng FileService, SystemService và Gateway nếu có sửa. Chạy regression
removal, source check SystemService hiện có và test/build/lint frontend liên quan.
DB integration chỉ dùng database/schema test cô lập được xác nhận; không dùng
connection thật. Kiểm tra trực tiếp method không thay thế HTTP/gRPC/network test.
Build solution/AppHost không phải acceptance vì còn tham chiếu service đã vắng.

Báo riêng PASS/FAIL/NOT RUN và baseline failure. Thiếu môi trường mạng hoặc DB
không được chuyển tiêu chí bắt buộc thành đã đạt bằng source inspection.

## 12. Giới hạn và bước duyệt

Không xây RAG, ACL tài liệu tổng quát, signed URL, service identity mới, streaming
lớn, distributed lock, antivirus, quota từng user hoặc job purge trong đợt này.
Metadata phiên trên đĩa phục vụ owner/retry, không phải catalog tài liệu hay ACL DB.

RAG sau này phải nhận file qua backend có quyền, không quét trực tiếp volume hay
dùng URL static cũ. Cơ chế ingest, đồng bộ xóa, version tài liệu và quyền truy vấn
RAG cần spec riêng; không thêm event bus hoặc placeholder API để chuẩn bị trước.

Các đánh đổi đã duyệt: một writer; avatar cho mọi user có JWT;
gRPC chỉ backend qua ranh giới mạng đã kiểm chứng; ngừng embed SAR, các URL static/
video cũ không còn hoạt động; nâng client avatar theo contract mới.
Giữ ảnh cũ/mồ côi đến kỳ đối soát, không xóa đồng bộ trong request save.

Người dùng đã yêu cầu viết implementation plan chia theo bảo vệ
storage/đường dẫn, upload lifecycle, avatar/contract và rollout/verification.
Chưa sửa code hoặc thao tác dữ liệu trước khi plan được duyệt và chọn cách thực hiện.
