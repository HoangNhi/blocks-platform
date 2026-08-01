# TDD & Debugging

## Mục đích

Tài liệu này xác định giao thức cốt lõi cho việc viết test và gỡ lỗi (debugging) trong Blocks, ánh xạ từ các skill `test-driven-development` và `systematic-debugging` của Superpowers.

## Test-Driven Development (TDD)

Quá trình phát triển bắt buộc áp dụng chu trình RED-GREEN-REFACTOR nếu có thể:
1. **RED**: Viết test mô tả hành vi cần thiết trước. Chạy thử và chứng kiến test thất bại.
2. **GREEN**: Viết lượng mã nguồn TỐI THIỂU để test vượt qua.
3. **REFACTOR**: Tối ưu hóa mã nguồn trong khi giữ cho test vẫn vượt qua.

*Lưu ý: Bất kỳ mã nguồn nào được viết ra trước khi có test đều vi phạm quy tắc trừ khi được loại trừ rõ ràng trong spec.*

## Systematic Debugging (Gỡ lỗi có hệ thống)

Gỡ lỗi phải tuân theo quy trình 4 pha (truy vết lỗi, phòng thủ chiều sâu, chờ theo điều kiện) thay vì đoán mò:
1. Xác nhận lỗi thực sự tồn tại (reproduce).
2. Viết test case chứng minh lỗi (RED test).
3. Đề xuất nguyên nhân gốc rễ và kiểm tra log/runtime state.
4. Sửa mã nguồn (chỉ sửa những phần chắc chắn liên quan) để pass test (GREEN).
5. Xác minh cẩn thận lại bằng công cụ `verification-before-completion`.
