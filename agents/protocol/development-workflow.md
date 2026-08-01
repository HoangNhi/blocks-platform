# Development Workflow

## Mục đích

Tài liệu này mô tả workflow phát triển chuẩn của Blocks theo phong cách tham chiếu từ Superpowers.

## Chuỗi chuẩn

1. Brainstorm
2. Spec
3. Plan
4. Execute
5. Verify
6. Review

## Brainstorm

- Làm rõ mục tiêu, ràng buộc, và tiêu chí thành công.
- Không implement trước khi chốt design cho các thay đổi có tính kiến trúc, UX, hoặc workflow.

## Spec

- Ghi lại mục tiêu, phạm vi, ngoài phạm vi, nguyên tắc, kiến trúc, và tiêu chí thành công.

## Plan

- Chia thành task nhỏ.
- Mỗi task phải có file cụ thể, lệnh verify cụ thể, và đường đi rõ ràng.

## Execute

- Thực thi bám sát plan. Có thể sử dụng subagent để làm các task nhỏ (Subagent-Driven Development).
- Nếu dùng subagent, bắt buộc áp dụng quy trình review 2 bước (kiểm tra tuân thủ Spec trước, sau đó review chất lượng code).
- Không lấn sang phạm vi khác nếu chưa được duyệt.

## Verify

- Không tuyên bố xong nếu chưa có bằng chứng phù hợp với loại task.

## Review

- **Code Review:** Tiến hành review chéo so với plan trước khi qua bước tiếp theo. Lỗi nghiêm trọng (Critical) sẽ block (chặn) tiến trình cho đến khi sửa xong.
- Mọi yêu cầu (`requesting-code-review`) và phản hồi (`receiving-code-review`) cần bám sát tiêu chí của plan.
- Ghi lại finding, blocker, lệch context, hoặc thay đổi protocol cần cân nhắc.
