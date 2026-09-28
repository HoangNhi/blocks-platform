# Verification

## Mục đích

Đảm bảo agent chỉ tuyên bố hoàn tất khi đã có bằng chứng phù hợp, không tạo PASS giả.

## Quy tắc theo loại task

### Docs hoặc workflow

- Dùng `-Mode docs` cho `verify-runtime.ps1`.
- Kết quả hợp lệ là `NOT APPLICABLE`.
- Bị `BLOCKED` nếu yêu cầu browser evidence (`-RequireBrowserEvidence`).
- Vẫn phải có self-review và path check.

### Backend

- Dùng `-Mode backend -AppHostUrl <url> -Route <route>`.
- `AppHostUrl` phải là URL HTTP hoặc HTTPS tuyệt đối hợp lệ, không chứa userinfo/credential.
- Kiểm tra liveness bằng HTTP HEAD không follow redirect (`-MaximumRedirection 0`).
- Nếu 200 OK và không yêu cầu browser evidence: trả `PASS` với ghi chú rõ `liveness-only; Route unverified`.
- Nếu endpoint lỗi hoặc connection refused: trả `BLOCKED` kèm next rerun action.

### Frontend hoặc UI runtime

- Dùng `-Mode ui-runtime -AppHostUrl <url> -Route <route> -TaskPath <rel-path> -RunId <run-id>`.
- `TaskPath`, `RunId`, `Route` và vault hợp lệ luôn bắt buộc, kể cả khi truyền `-BrowserEvidencePath`; đường dẫn tùy chọn vẫn phải nằm trong exact run. Report và mọi ancestor của report/artifact không được là symlink/reparse point.
- Bắt buộc phải có báo cáo browser tại `evidence/<run-id>/browser.json`.
- Thao tác browser thật ưu tiên `browser-use` trước.
- Schema báo cáo:
  - `schemaVersion`: 1
  - `runId`: phải khớp chính xác (case-sensitive) RunId invocation
  - `appHostUrl`: phải khớp AppHostUrl input
  - `route`: phải khớp chính xác (case-sensitive) Route input
  - `status`: phải là `PASS`
  - `checks`: mảng không rỗng các object `{ name, status }` với name là string không rỗng, tất cả status phải là `PASS`
  - `artifacts`: mảng không rỗng các đường dẫn relative bên trong cùng thư mục run, file phải tồn tại và không phải symlink/reparse point
- Bất kỳ sai lệch metadata, schema, file thiếu hoặc kiểm tra không PASS đều trả `BLOCKED` và exit code 1.

## Evidence artifacts

- Mọi durable task evidence chỉ được ghi vào `evidence/<run-id>/` của exact Knowledge task đã được owner duyệt.
- Repo hoặc CI chỉ công bố kết quả sản phẩm đã sanitize; không giữ task spec/plan/execution/review hoặc raw runtime logs.
- `execution.md` của task giữ trạng thái durable. Knowledge destination không truy cập được là `BLOCKED`, không tạo evidence record thay thế.

## Cách báo blocker

Luôn dùng mẫu:

- Status:
- Reason:
- Affected:
- NextRerunAction:
