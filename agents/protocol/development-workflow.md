# Development Workflow

## Mục đích

Tài liệu này mô tả workflow phát triển chuẩn của Blocks, mở rộng hỗ trợ phân tầng model và tầng initiative nhưng giữ nguyên tính gọn nhẹ, bảo mật và quyền kiểm soát của repository.

## Chuỗi chuẩn

Mọi thay đổi trong Blocks đều tuân thủ sáu bước chuẩn:

1. Brainstorm
2. Spec
3. Plan
4. Execute
5. Verify
6. Review: Tiến hành review chéo hai lớp (Spec Compliance trước, Code Quality sau). Các lỗi nghiêm trọng (Critical hoặc Important) ở bất kỳ lớp nào đều lập tức chặn (block) tiến trình; task không được phép hoàn tất cho đến khi các lỗi này được sửa triệt để và kiểm chứng lại.

## Tầng Initiative và Bộ Ba Tài Liệu

### Điều kiện áp dụng

- **Dùng initiative:** Khi công việc lớn, thay đổi nhiều capability/workstream hoặc có ownership/contracts xuyên phần. Initiative sử dụng bộ ba tài liệu trong thư mục Knowledge của initiative.
- **Bugfix cục bộ và task nhỏ:** Không bắt buộc dùng đủ bộ ba tài liệu, nhưng vẫn phải tuân thủ đầy đủ task gates (`spec.md`, `plan.md`, `execution.md`, `review.md`).

### Field Contracts Bộ Ba Tài Liệu

| Tài liệu | Field Contracts bắt buộc |
| --- | --- |
| `master-spec.md` | `goals`, `non-goals`, `requirement IDs` (ổn định), `rules/invariants`, `acceptance đo được` toàn hệ thống. |
| `workstream-decomposition.md` | `boundary`, `primary owner` (đúng một per requirement), `contributors`, `dependencies/readiness`, `contract references đầy đủ` (gồm contract owner, provider, consumer, approved revision, semantics, compatibility expectations), `risk`, `delivery sequence`, `integration gates`. |
| `architecture-decisions.md` (ADR) | Trạng thái mặc định `Proposed` (chỉ chuyển `Accepted` khi owner duyệt), `author`, `approver`, `revision`, `alternatives`, `rationale`, `consequences`, `validation`, `supersedes`. |

### Quan hệ với Task Artifacts

- `spec.md` tại task là entry point và định nghĩa scope của task, không sao chép lại toàn bộ `master-spec.md`.
- Một workstream có thể phân rã thành nhiều task; mỗi task giữ các artifact chuẩn: `spec.md`, `plan.md`, `execution.md`, `review.md`.
- ADR có giá trị bền vững phải được phản ánh vào repository docs thông qua thay đổi được phê duyệt; không sao chép nguyên trạng lịch sử task vào repo.

## Phân Tầng Model và Định Tuyến Rủi Ro

Mạnh (Strong), Vừa (Medium), Yếu (Weak) là các vai trò tương đối dựa trên năng lực quan sát, không phải tên model hay quyền hạn cố định.

### Planning Modes

| Planning Mode | Trách nhiệm áp dụng |
| --- | --- |
| **Strong Owned** | Model mạnh trực tiếp soạn spec/plan khi rủi ro kiến trúc, độ mơ hồ (ambiguity) hoặc phạm vi liên workstream cao. |
| **Strong Guided** | Model mạnh chốt constraints, architecture flows, invariants; model vừa cụ thể hóa chi tiết theo codebase. |
| **Medium Owned** | Model vừa soạn spec/plan khi ranh giới đã ổn định, scope cục bộ và pattern có sẵn. |

Đánh giá rủi ro dựa trên 6 chiều: (1) Architecture impact, (2) Ambiguity, (3) Cross-workstream impact, (4) Rework cost, (5) Security/data risk, (6) Existing-system complexity. **Quy tắc bất biến:** Không lấy điểm trung bình làm lu mờ rủi ro nghiêm trọng (ví dụ: security/data critical bắt buộc định tuyến Strong kể cả khi các chiều khác thấp).

### Phân công Implementation và Review

Implementation và Review được phân công độc lập với Planning mode:

- **Weak:** Chỉ nhận phần việc có acceptance rõ ràng, scope hẹp, pattern có sẵn trong codebase, verification xác định (deterministic), và không còn quyết định thiết kế bỏ ngỏ.
- **Medium:** Xử lý logic nhiều nhánh, tích hợp theo contract ổn định; thực hiện review spec compliance và code quality.
- **Strong:** Trực tiếp xử lý hoặc review các phần liên quan đến ownership, invariant, security boundary, concurrency, transaction semantics, hoặc khi có độ lệch kiến trúc.

## Hợp Đồng Bàn Giao (Handoff Contract)

Mỗi phần việc trong plan khi bàn giao cho agent thực thi phải có đủ các trường sau:

| Trường | Yêu cầu bắt buộc |
| --- | --- |
| **Mục tiêu** | Tiêu chí nghiệm thu (acceptance) rõ ràng và danh sách `requirement IDs`. |
| **Baseline** | Commit hash đã khảo sát và `artifact revision` của spec/contract được duyệt. |
| **Write scope** | Danh sách file/module dự kiến sửa và phạm vi cấm sửa. |
| **Context** | Đường dẫn file, symbols, patterns cần đọc trước khi viết code. |
| **Hành vi** | Input, output, validation rules, error handling, và edge cases. |
| **Dependencies** | Điều kiện sẵn sàng (readiness) và prerequisite checks trước khi chạy. |
| **Verification** | Lệnh kiểm chứng cụ thể, expected output, evidence destination, runtime checks (nếu có). |
| **Stop conditions** | Điều kiện phải dừng: contract thay đổi, thiếu context, vượt write scope, hoặc vi phạm invariant. |

Không chép toàn bộ source code vào plan. Task chưa đủ điều kiện bàn giao tuyệt đối không được chuyển xuống cho model yếu.

### Hợp Đồng Liên Workstream (Cross-Workstream Contract)

Mỗi contract giữa các workstream bắt buộc phải xác định rõ:
- **Contract Owner:** Workstream hoặc cá nhân chịu trách nhiệm duy trì contract.
- **Provider & Consumer:** Xác định rõ bên cung cấp dịch vụ/dữ liệu và bên tiêu thụ.
- **Approved Revision:** Phiên bản/revision được phê duyệt mà các bên cùng tham chiếu.
- **Semantics:** Quy định rõ ràng về hành vi, cấu trúc dữ liệu, error handling, và transaction/state semantics.
- **Compatibility Expectations:** Kỳ vọng về tính tương thích xuôi/ngược (forward/backward compatibility) và chiến lược versioning.

Các chi tiết chữ ký cụ thể (concrete signatures) có thể đặt tại feature spec hoặc repo contract chuẩn; không bắt buộc đóng băng toàn bộ signature từ giai đoạn brainstorm nhưng bắt buộc có semantics và compatibility rõ ràng trước khi bàn giao. Bàn giao task chỉ nêu tên contract và revision mà thiếu định nghĩa semantics/compatibility hoặc thiếu tham chiếu tới contract chuẩn thì xem như **chưa đạt điều kiện sẵn sàng (readiness)**, không được chuyển giao cho model thực thi.

## Quyền Hạn, Phê Duyệt và Escalation

### Tách biệt vai trò và Gates

- Tách bạch rõ ràng giữa `author`, `reviewer`, và `approver`. Model có thể đóng vai trò author hoặc reviewer; chỉ owner (hoặc đại diện được ủy quyền rõ ràng) mới có quyền approver.
- Phân biệt các gate phê duyệt: Duyệt ý tưởng (brainstorm) ≠ Duyệt spec ≠ Duyệt plan ≠ **Execution approval**.
- **Định danh phê duyệt bắt buộc:** Phê duyệt (spec/plan approval và execution approval) bắt buộc phải gắn với revision, hash (SHA-256) hoặc snapshot nội dung cụ thể của chính artifact Knowledge (`spec.md`, `plan.md`). Commit repository chỉ định danh baseline mã nguồn được khảo sát, tuyệt đối không được dùng riêng lẻ làm định danh thay thế cho approval của spec/plan trong Knowledge.
- Khi acceptance criteria, write scope, dependencies hoặc các bước thực hiện trong plan Knowledge thay đổi (dù commit repo không đổi), approval cũ lập tức mất hiệu lực; bắt buộc phải đánh giá impact và xin phê duyệt lại phần liên quan trước khi tiếp tục.

### Xử lý biến động (Drift & Escalation)

- Khi contract, ownership, invariant, write scope hoặc repo baseline thay đổi: **Dừng ngay** các phần việc bị ảnh hưởng.
- Thực hiện impact review và yêu cầu owner phê duyệt lại phần thay đổi.
- Tuyệt đối không tự ý bỏ qua requirement mâu thuẫn với ADR, không âm thầm sửa đổi kiến trúc hoặc tiếp tục với giả định cũ.

## Các Tình Huống Kiểm Tra Đặc Biệt (Walkthroughs W1 & W2)

- **W1 (Spec approval gate):** Khi chỉ mới có spec approval, agent chỉ được phép soạn plan, tuyệt đối không được cấp execution approval hay sửa đổi repository.
- **W2 (Risk-based routing):** Task nhỏ (dù chỉ thay đổi 1 file) nhưng chạm vào auth, security, concurrency hoặc data consistency thì không được mặc định giao cho model Weak; phải áp dụng Strong Owned hoặc Strong Guided.
