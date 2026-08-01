# Claude Code Adapter

## Mục đích

Tài liệu này giải thích cách Claude Code áp dụng portable protocol của Blocks.

## Trình tự đọc

1. `AGENTS.md`
2. `agents/protocol/core.md`
3. `agents/protocol/context-routing.md`
4. protocol chuyên biệt theo task

## Khi có Superpowers

Claude Code có Superpowers plugin (v5.1.0) với đầy đủ 14 skill:

| Superpowers skill | Protocol tương ứng |
|---|---|
| `brainstorming` | `development-workflow.md` |
| `writing-plans` | `development-workflow.md` |
| `executing-plans` | `development-workflow.md` |
| `subagent-driven-development` | `development-workflow.md` |
| `dispatching-parallel-agents` | `development-workflow.md` |
| `test-driven-development` | `tdd-debugging.md` |
| `systematic-debugging` | `tdd-debugging.md` |
| `verification-before-completion` | `verification.md` |
| `requesting-code-review` | `review-workflow.md` |
| `receiving-code-review` | `review-workflow.md` |
| `finishing-a-development-branch` | `branch-workflow.md` |
| `using-git-worktrees` | `branch-workflow.md` |
| `using-superpowers` | `core.md` |
| `writing-skills` | N/A (meta) |

- Dùng skill tương ứng nếu nó giúp thực hiện workflow nhanh hơn.
- Không bỏ qua rule trong repo chỉ vì skill mặc định gợi ý khác.
- Repo protocol của Blocks luôn thắng nếu có khác biệt.

## Tooling Differences from Codex

| Codex tool | Claude Code equivalent |
|---|---|
| `exec_command` | `Bash` tool |
| `shell_command` | `Bash` tool |
| `write_stdin` | `Write` / `Edit` tools |
| `update_plan` | `TaskUpdate` tool (via Superpowers plan mode) |
| `js` (REPL) | `ripple` MCP (Node.js adapter) |
| `browser_*` (navigate, click, snapshot, etc.) | `playwright` MCP |
| `rg` (ripgrep) | `Grep` / `Glob` tools |
| `read_file` | `Read` tool |
| `grep` / `glob` | Built-in `Grep` / `Glob` tools |

## MCP Servers

Claude Code uses the following MCP servers for this project:

| Server | Package | Purpose |
|---|---|---|
| `playwright` | `@playwright/mcp` | Browser automation (25 tools) |
| `ripple` | `@ytsuda/ripple` | Node.js REPL + bash/pwsh/Python adapters |
| `shadcn` | `shadcn@latest mcp` | shadcn/ui component registry |
| `context7` | `@monotool/context7-mcp` | Library documentation lookup |

MCP config lives in `%USERPROFILE%\.claude\mcp.json`. Use `agents/mcp.example.json` as the pinned project example; do not commit active runtime configuration.

## Scripts

- Normal work reads repository docs and `.agent-context/generated/`.
- Direct vault research uses `agents/tools/launch-claude.ps1 -WithVault`, which passes `--add-dir` only after validating `OBSIDIAN_VAULT_PATH`.
- Vault access remains read-only by policy.

- Dùng `agents/tools/` cho các bước lặp hoặc bounded workflow.
- PowerShell scripts được gọi qua `Bash` tool với `pwsh -File <script>`.

## Durable Pacing & Verification Details

### 1. Repo-Sync Preflight
- Tránh push/commit đè nhau: trước khi bắt đầu branch hay checkout, chạy check trạng thái repo.
- Thực hiện `git fetch` và kiểm tra sự phân kỳ (divergence).
- Chỉ được chạy `git pull --ff-only` khi working directory hoàn toàn sạch (clean).

### 2. Image-First UI Review Loop
- Khi kiểm thử giao diện (UI work), luôn ưu tiên quan sát trực quan bằng hình ảnh (snapshots/screenshots) trước khi phân tích DOM hay log.
- Đối chiếu thiết kế thực tế so với ảnh reference trước khi tuyên bố hoàn tất.

### 3. Evidence Ladder
- Bằng chứng thực thi (verification evidence) phải đi từ rây lọc thấp đến cao:
  1. Tĩnh (Type check & Lint)
  2. Đơn vị (Unit tests)
  3. Tích hợp (Smoke tests / Integration tests)
  4. Trực quan (Browser screenshots/use)
- Không dùng bằng chứng cấp thấp để suy luận cho cấp cao hơn.

### 4. Exact Skill/Tool Reporting
- Khi gọi Skill, phải báo cáo chính xác tên skill và tool được dùng.
- Không tự chế hay bịa tên skill/tool không có trong danh sách hỗ trợ hoặc cấu hình của harness.

### 5. No Fabricated Telemetry
- Nghiêm cấm bịa đặt các chỉ số đo lường (telemetry), hiệu năng (metrics), số lượng phiên (session counts), hoặc phiên bản (versions) không có thực.
- Nếu không truy xuất được dữ liệu thực tế thông qua bridge/CLI, bắt buộc hiển thị `Unknown` hoặc `Not configured` hoặc `No recent data`.

### 6. Phase Checkpoints & Completion Artifacts
- Cuối mỗi phase thực thi, phải ghi lại checkpoint thực tế dưới dạng file `.hermes/runs/YYYY-MM-DD/hermes-overview-r2-semantics-docs-checkpoint.md` (hoặc path tương ứng) ghi rõ các file thay đổi, quyết định kiến trúc, và kết quả test/build.
- Trả về đúng tín hiệu kết thúc pha (`HERMES_PHASE_SEMANTICS_DOCS_DONE`).

### 7. Bounded Context to Avoid Exhaustion
- Giới hạn số lượng file đọc đồng thời (tối đa 10 files tiêu điểm) và kích thước đọc để tránh cạn kiệt token hoặc tràn ngữ cảnh (context exhaustion).
- Dùng `Grep`/`Glob` thu hẹp phạm vi trước khi gọi `Read`.
