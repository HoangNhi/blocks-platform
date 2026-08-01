# Portable Protocol Core

## Mục đích

Đây là lớp protocol chuẩn của Blocks dành cho các AI agent làm việc trong repo này.

## Thứ tự ưu tiên

1. User instruction hiện tại.
2. `AGENTS.md` và context chính thức trong repo.
3. Các file trong `agents/protocol/`.
4. Runtime adapter đang dùng.
5. Hành vi mặc định của model hoặc tool.

## Quy tắc cốt lõi

- Repo là source of truth cho workflow cấp dự án.
- Không nhảy thẳng vào mutation khi chưa phân loại task và xác định context.
- Mọi task phải đi theo một workflow rõ ràng: brainstorm, spec, plan, execute, verify, review.
- Khi một domain đã có context hoặc tài liệu repository rõ ràng, task mới phải ưu tiên route theo tài liệu repository của area/service đó thay vì giữ ở `cross-service` do quán tính lịch sử.
- Nếu runtime có skill tương thích với Superpowers thì được dùng như lớp tăng tốc, không phải như nguồn chân lý duy nhất.
- Nếu runtime không có skill tương thích, phải quay về đọc protocol trong repo.

## Artifact tối thiểu

| Loại task | Artifact tối thiểu |
| --- | --- |
| Thiết kế hoặc kiến trúc | `spec.md` |
| Công việc nhiều bước | `plan.md` |
| Review hoặc self-review | `review.md` |
| UI có phương án tương tác | `mockup-ui.md` khi thực sự cần |
| Ghi chú trung gian | `notes.md` nếu có ích |
| Trạng thái thực thi durable cho task đang chạy | `execution.md` cho task không tầm thường |
