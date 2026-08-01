# TradeLab Workflow

## Mục đích

Chuẩn hóa cách agent làm việc với TradeLab trong mọi runtime.

## Context bắt buộc

Đọc:

- `docs/architecture/plugins/tradelab.md`
- `docs/runbooks/tradelab-research-prompt.md`
- task folder hiện hành nếu user chỉ rõ
- review hoặc spec gần nhất nếu đang trả lời câu hỏi phase/status

## Quy tắc phase/status fast path

Cho câu hỏi như "còn gì", "đã xong chưa", "bước tiếp theo là gì":

- ưu tiên file README, task liên quan, review gần nhất;
- không bắt buộc AppHost/browser nếu user không yêu cầu runtime evidence mới.

## Quy tắc runtime/UI

Nếu task chạm tới UI hoặc runtime:

- closeout phải phân loại `PASS`, `NOT APPLICABLE`, hoặc `BLOCKED`;
- nếu `BLOCKED`, phải nói rõ lý do và bước rerun tiếp theo;
- build/test không tự động thay thế cho AppHost/browser evidence khi runtime state là quan trọng.

## Pilot Command Runbook (Autonomous Research Pilot)

### Các câu lệnh vận hành và kiểm thử chính:

```bash
# Chạy toàn bộ unit tests và kiểm thử ràng buộc contract
uv run --python 3.12 --with pytest python -m pytest \
  tests/agent-workflow/test_tradelab_pilot_contract.py \
  tests/agent-workflow/test_tradelab_pilot_controller.py \
  tests/agent-workflow/test_tradelab_pilot_tools.py \
  tests/agent-workflow/test_tradelab_pilot_ops.py -q

# Thiết lập các profile bị giới hạn (isolated profiles)
python -m agents.tools.tradelab_pilot_ops setup-profiles

# Chạy thử nghiệm một agent an toàn (one-agent safety smoke)
python -m agents.tools.tradelab_pilot_ops smoke

# Chạy chiến dịch nghiên cứu thực tế gồm ba agent (chạy, chờ và thu thập kết quả)
python -m agents.tools.tradelab_pilot_ops run
```

### Các câu lệnh kiểm tra và giám sát Kanban Board:

```bash
# Liệt kê các thẻ công việc trên bảng tradelab-research
hermes kanban --board tradelab-research list

# Xem chi tiết một thẻ công việc
hermes kanban --board tradelab-research show <task-id>

# Xem lịch sử các lượt chạy (attempts) của công việc
hermes kanban --board tradelab-research runs <task-id>

# Xem nhật ký (logs) của worker chạy công việc đó
hermes kanban --board tradelab-research log <task-id>
```

## Operator Safety Protocol

### 1. Safety-First Execution Order
- Configure isolated no-secret environment configuration (e.g. NINE_ROUTER_API_KEY).
- Run unit test regression suite.
- Run one-agent one-trial smoke test.
- Inspect `task-receipts.json` and worker tool usage trace.
- Dispatch concurrent campaigns using specific `--agents` parameter.

### 2. Safety Hard Stop Criteria (Stop Campaign Immediately If):
- **Capability Mismatch / Forbidden Tool**: Any worker configured with forbidden tool namespaces like `terminal`, `code_execution`, `process`, or `browser`.
- **Malformed Artifact**: Errors found in `accepted-trials.jsonl`, `rejected-manifests.jsonl`, or `agent-assessments.jsonl`.
- **Duplicate Run ID**: Repeated backtest run IDs found in the accepted trials.
- **Trade Count Mismatch**: Dissonance between trade summary closed/open count vs result bot run total trades.
- **Forbidden Route**: Attempt to POST or GET to paper, testnet, or live trading endpoints.
- **Stranded Card**: Selected Kanban board task cards stuck in non-terminal state.

### 3. Reporting Restrictions
- All generated reports are research-only.
- Never claim guaranteed monthly return. 2% is a parameter search target, not fixed interest.
