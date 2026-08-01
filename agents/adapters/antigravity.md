# Antigravity Adapter

## Mục đích

Tài liệu này giúp Antigravity làm việc với Blocks theo phong cách tương thích với Superpowers mà không phụ thuộc vào Codex runtime.

## Trình tự đọc

1. `AGENTS.md`
2. `agents/protocol/core.md`
3. `agents/protocol/context-routing.md`
4. `agents/protocol/superpowers-compat.md`
5. protocol chuyên biệt theo task

## Cách áp dụng

- Dùng protocol trong repo như workflow chính.
- Dùng mapping trong `superpowers-compat.md` để mô phỏng hành vi skill tương ứng.
- Gọi script trong `agents/tools/` khi có thể thay cho suy luận tự do.

## Capability fallback

- Nếu không có browser capability, phải báo giới hạn verify UI.
- Nếu không có script execution, phải nêu rõ bước nào cần người dùng hoặc runtime khác hỗ trợ.
- Nếu có artifact system riêng, có thể dùng để đính kèm plan hoặc review nhưng không thay đổi cấu trúc artifact chuẩn của repo.
