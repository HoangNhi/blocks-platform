# Codex Adapter

## Mục đích

Tài liệu này giải thích cách Codex áp dụng portable protocol của Blocks.

## Trình tự đọc

1. `AGENTS.md`
2. `agents/protocol/core.md`
3. `agents/protocol/context-routing.md`
4. Active public task folder under `docs/tasks/YYYY-MM-DD-<slug>/`, or the exact owner-supplied private task path resolved through `OBSIDIAN_VAULT_PATH`
5. protocol chuyên biệt theo task

For private internal work, require explicit owner approval and read the spec, plan, and current execution from that one path. If the path or required context is missing, mark `BLOCKED`; do not infer it from generated context.

## Khi có Superpowers

- Dùng skill tương ứng nếu nó giúp thực hiện workflow nhanh hơn.
- Không bỏ qua rule trong repo chỉ vì skill mặc định gợi ý khác.

## Khi không có Superpowers

- Đọc `agents/protocol/superpowers-compat.md`.
- Làm theo protocol tương ứng trong repo.

## Tooling

- Dùng `agents/tools/` cho các bước lặp hoặc bounded workflow.

## Browser Verification

- For UI functional testing and browser-based runtime verification, follow the repo's `browser-use-first` rule from `AGENTS.md`, `agents/protocol/verification.md`, and `docs/architecture/services/web.md`.
- Prefer `.agent-context/generated/` for historical context. Do not depend on unrestricted access to `OBSIDIAN_VAULT_PATH`.
- Do not treat Codex-native browser preferences or older Playwright habits as higher priority than the repo protocol.
