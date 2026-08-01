# Blocks Codex Workflow Evals

Promptfoo pilot for the Blocks Codex agent workflow.

## Purpose

This pilot checks four workflow contracts:

- TradeLab context routing uses Obsidian source-of-truth files before broad search.
- Workflow reviews use extractor summaries before raw session JSONL.
- UI/runtime closeout requires AppHost/browser evidence as `PASS`, `NOT APPLICABLE`, or `BLOCKED`.
- Tool choice stays bounded enough to reduce token waste.

## Provider

This pilot uses Promptfoo's `exec:` provider to call `codex exec` through the npm `codex.cmd` wrapper. That keeps the eval inside promptfoo while avoiding two local Windows issues in the built-in providers.

The app-server provider is still useful for richer Desktop-like protocol checks, but local Windows resolution currently hits the packaged WindowsApps `codex.exe`, which returns `EPERM` outside the Desktop shell. The SDK provider starts Codex, but promptfoo 0.121.12 fails to parse a Windows process cleanup line from Codex. Revisit built-in providers after a dedicated provider/path fix.

## Prerequisites

- Node.js available for `npx`.
- Promptfoo fetched by `npx promptfoo@latest`.
- Codex CLI installed and signed in, or `OPENAI_API_KEY` / `CODEX_API_KEY` set.
- Run commands from `D:/Workspace/Personal/Blocks`.

## Validate

```powershell
npx --yes promptfoo@latest validate -c tests/agent-workflow-evals/promptfooconfig.yaml
npx --yes promptfoo@latest validate -c tests/agent-workflow-evals/promptfooconfig.quick.yaml
```

## Quick Eval

Use quick eval for routine weekly workflow checks. It runs the two high-signal cases that caught the 2026-05-24 failures: extractor-first workflow review and token-budget/tool-choice discipline.

```powershell
npx --yes promptfoo@latest eval -c tests/agent-workflow-evals/promptfooconfig.quick.yaml --no-cache --max-concurrency 1
```

## Cost Guard

Before running full eval or broad workflow review commands, check command risk:

```powershell
python "$env:CODEX_HOME\skills\optimize-research-workflow\scripts\check-workflow-cost-risk.py" --command "npx --yes promptfoo@latest eval -c tests/agent-workflow-evals/promptfooconfig.yaml --no-cache --max-concurrency 1" --fail-on medium
```

A `full-promptfoo-eval` finding means use quick eval first unless full eval trigger conditions apply.

## Full Eval

Run full eval after changing `AGENTS.md`, optimize-research-workflow skill/reference files, promptfoo provider/assertions/schema, AppHost/browser closeout rules, or when quick eval fails.

```powershell
npx --yes promptfoo@latest eval -c tests/agent-workflow-evals/promptfooconfig.yaml --no-cache --max-concurrency 1
```

## Review Results

```powershell
npx --yes promptfoo@latest view
```

## Success Metrics

- All four eval rows pass.
- Output is constrained by `schemas/workflow-output.schema.json`.
- No eval row needs broad raw transcript loading.
- Command item count remains under the per-row cap in `promptfooconfig.yaml` when metadata is available.

## Current Baseline

- 2026-05-24 eval id: `eval-l3c-2026-05-24T03:47:07`.
- Result: 2 passed, 2 failed, 0 errors.
- Passed: `tradelab-context-routing`, `apphost-browser-closeout-gate`.
- Failed: `extractor-first-workflow-review`, `workflow-token-budget-tool-choice`.

## Current Routine Eval

- 2026-05-31 quick eval id: `eval-t7H-2026-05-31T06:22:20`.
- Result: 2 passed, 0 failed, 0 errors.
- Latency from promptfoo DB: 145.202s across 2 rows, about 2m25s. This replaces full weekly eval for routine checks unless trigger conditions above apply.

## Rollback

Delete `tests/agent-workflow-evals/` and remove related Obsidian notes.
