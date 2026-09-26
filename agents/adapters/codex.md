# Codex Adapter

## Mục đích

Tài liệu này giải thích cách Codex áp dụng portable protocol của Blocks.

## Trình tự đọc

1. `AGENTS.md`
2. `agents/protocol/core.md`
3. `agents/protocol/context-routing.md`
4. Exact owner-approved Knowledge task path resolved through `OBSIDIAN_VAULT_PATH`
5. protocol chuyên biệt theo task

For all development tasks, require Knowledge access, an exact owner-approved path and execution approval. Read spec, plan and execution from that one path. Missing context is `BLOCKED`; never use generated history or a repository task folder as fallback. Product docs and ordinary build/test/CI remain repository-local.

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
- Generated history is supplemental; read the required task directly from its approved Knowledge path. Do not broaden filesystem access.
- Do not treat Codex-native browser preferences or older Playwright habits as higher priority than the repo protocol.
