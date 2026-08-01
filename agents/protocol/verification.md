# Verification

## Mục đích

Đảm bảo agent chỉ tuyên bố hoàn tất khi đã có bằng chứng phù hợp.

## Quy tắc theo loại task

### Docs hoặc workflow

- Có thể dùng `NOT APPLICABLE` cho AppHost/browser.
- Vẫn phải có self-review và path check.

### Backend

- Chạy build hoặc test phù hợp với phạm vi thay đổi.
- Nếu thay đổi ảnh hưởng runtime contract, cần ghi rõ phần chưa verify được.

### Frontend hoặc UI runtime

- Cần test/build phù hợp.
- Cần AppHost/browser evidence khi state runtime ảnh hưởng tính đúng sai của kết luận.
- Khi cần UI functional testing hoặc browser-based runtime verification, phải thử `browser-use` trước.
- Nếu phải fallback, phải ghi rõ `Reason browser-use unavailable/failed`, `Fallback tool used`, `Affected route or flow`, và `Next rerun action`.

## Cách báo blocker

Luôn dùng mẫu:

- Status:
- Reason:
- Affected route or service:
- Next rerun action:
