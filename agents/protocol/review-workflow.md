# Review Workflow

## Mục đích

Chuẩn hóa quy trình review artifact, kiểm tra tích hợp hai lớp (two-layer review), tiêu chuẩn đóng task và hướng dẫn đánh giá pilot.

## Artifact

| Tình huống | Artifact |
| --- | --- |
| Self-review hoặc code review | `review.md` |
| Workflow review định kỳ | `workflow-review.md` |
| Đề xuất cập nhật skill hoặc protocol | `skill-backlog.md` |
| Đánh giá migration | `migration-decision.md` |

## Quy tắc Review Hai Lớp (Two-Layer Review)

Mọi quy trình review phải tuân thủ nghiêm ngặt hai lớp theo thứ tự:

1. **Lớp 1 — Spec Compliance:** Kiểm tra mức độ đáp ứng requirement IDs, acceptance criteria, invariant constraints, write scope, và baseline contract revision. Nếu spec compliance chưa đạt, dừng ngay và không review chi tiết code quality.
2. **Lớp 2 — Code Quality:** Kiểm tra tính đúng đắn, xử lý lỗi, bảo mật, performance, concurrency, style và testing coverage.

Phân loại review theo rủi ro (risk level):
- **High Risk:** Các thay đổi chạm vào security boundary, concurrency, cross-workstream contracts hoặc kiến trúc bắt buộc phải do Strong review (hoặc owner review).
- **Medium/Low Risk:** Có thể do Medium review; không bắt Strong phải đọc mọi diff nhỏ.

### Điều kiện Hoàn Tất và Chặn Tiến Trình (Blocking Gates)

- **Cả hai lớp phải PASS:** Task chỉ được xem là hoàn tất (`complete`) khi đạt cả Lớp 1 (Spec Compliance) và Lớp 2 (Code Quality). Đạt Spec Compliance nhưng Code Quality còn lỗi thì task vẫn **chưa hoàn tất**.
- **Critical & Important Blocking:** Mọi finding ở mức `Critical` hoặc `Important` ở bất kỳ lớp nào đều lập tức chặn (`BLOCK`) tiến trình. Task không được phép đóng, commit hoặc merge cho đến khi tất cả finding Critical và Important được sửa triệt để và kiểm chứng lại (re-verified).
- **Không thay thế bằng test pass:** Báo cáo `tests pass` hay build pass tuyệt đối không thay thế cho việc đóng và giải quyết các finding blocking còn tồn đọng.

## Quy tắc Báo Cáo Findings

- **Findings phải đi trước summary:** Trình bày rõ các lỗi, độ lệch và điểm chưa đạt trước phần tóm tắt.
- **Không có finding:** Phải tuyên bố rõ ràng không có finding, nhưng bắt buộc nêu rõ residual risks hoặc testing gaps còn tồn đọng.
- Ưu tiên evidence gọn và bounded thay vì broad transcript load.

## Integration Gates và Tiêu Chuẩn Hoàn Tất Task

- **Integration Gate:** Kiểm tra tính tương thích contract (`contract compatibility`), revisions khớp nhau, bảo toàn invariants, phân định data ownership rõ ràng, và độ phủ requirement.
- **Tiêu chuẩn hoàn tất:** Không bao giờ đóng task chỉ vì `tests/build pass`. Các gate kiểm tra UI/AppHost/browser phải được đánh giá độc lập:
  - Phải có trạng thái rõ ràng: `PASS`, `NOT APPLICABLE` (với lý do rõ ràng, ví dụ task thuần tài liệu), hoặc `BLOCKED`.
  - Nghiêm cấm coi việc thiếu bằng chứng hoặc tests đơn vị pass là tương đương với runtime/UI verification pass.

## Chuẩn Walkthroughs (W1 – W7)

Bảy tình huống kiểm tra chuẩn dạng Input / Expected để tái sử dụng kiểm chứng hành vi workflow:

| Mã | Tình huống (Input) | Kết quả mong đợi (Expected Behavior) |
| --- | --- | --- |
| **W1** | Owner chỉ mới duyệt spec. | Chỉ được phép soạn plan; không được phép sửa đổi code repository hoặc đánh dấu execution approved. |
| **W2** | Task nhỏ (1 file) nhưng liên quan auth, concurrency, hoặc data consistency. | Không được mặc định giao model Weak; bắt buộc định tuyến Strong Owned hoặc Strong Guided dựa trên phân tích rủi ro. |
| **W3** | Task có link dẫn tới initiative/task cha hoặc task liên quan nằm ngoài approved path. | Không tự ý đọc thêm; báo `BLOCKED` đúng phần phụ thuộc và yêu cầu owner cấp quyền đúng path; không quét vault. |
| **W4** | Contract, repo baseline hoặc nội dung plan Knowledge thay đổi sau approval (dù commit repo giữ nguyên). | Dừng ngay các consumers bị ảnh hưởng, thực hiện impact review và chờ phê duyệt lại; không dùng riêng repo commit làm định danh approval Knowledge. |
| **W5** | Task UI có tests pass nhưng thiếu browser evidence, hoặc task có tests pass nhưng Code Quality còn finding Critical/Important. | Chưa hoàn tất (`INCOMPLETE` / `BLOCKED`); bắt buộc sửa và kiểm chứng lại finding; không đánh dấu PASS khi thiếu evidence hoặc còn lỗi chặn. |
| **W6** | Pilot initiative thiếu telemetry đo đạc token hoặc chi phí thực tế. | Bắt buộc ghi nhận `Unknown` hoặc `Not configured`; tuyệt đối không ghi 0 hoặc bịa đặt số liệu tiết kiệm giả. |
| **W7** | Hợp đồng liên workstream chỉ có tên và revision, thiếu provider/consumer/semantics/compatibility. | Chưa đạt điều kiện sẵn sàng (`BLOCKED` readiness); không được phép chuyển giao cho model thực thi. |

## Hướng Dẫn Pilot (Pilot Guidance)

- **Quyền hạn:** Pilot bắt buộc phải có task riêng và execution approval riêng từ owner.
- **Chỉ số đo lường thực tế:** Chỉ đánh giá hiệu quả dựa trên dữ liệu thực đo:
  - Số lần hỏi làm rõ (clarification questions).
  - Số lần escalation lên Strong/owner.
  - Số lượng review findings (chia theo Critical, Important, Minor).
  - Khối lượng rework và số vòng lặp sửa lỗi.
  - Thời gian thực thi (elapsed time).
  - Chi phí và token tiêu thụ thực tế đo được qua telemetry.
- **Trung thực về số liệu:** Nếu thiếu baseline tương đương để đối chiếu, cấm tuyên bố tỷ lệ phần trăm tiết kiệm. Nếu thiếu telemetry, ghi `Unknown`.
