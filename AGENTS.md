# Blocks AI Agent Guide

This file is the entry point for AI agents working in the Blocks workspace.

Keep this file short. Approved product, service, API, UI, and technical context lives in repository `docs/`. Task records live only in Knowledge through `OBSIDIAN_VAULT_PATH`. Optional historical summaries in `.agent-context/generated/` never replace those records.

## 1. Project Identity

Blocks is a .NET Aspire based workspace with backend services, frontend apps, shared code, and future plugin modules.

Current code layout:

- `platform/apphost/Blocks.AppHost/`: Aspire orchestration.
- `platform/service-defaults/Blocks.ServiceDefaults/`: shared Aspire service defaults.
- `services/system-service/Blocks.SystemService/`: core backend service.
- `services/file-service/Blocks.FileService/`: file backend service.
- `apps/web/Blocks.Web/`: React/Vite frontend app.
- `platform/shared/Blocks.Shared/`: shared .NET contracts/common code.
- `plugins/`: future plugin modules.
- `docs/`: approved repository knowledge, specifications, decisions, audits, and runbooks.
- Knowledge: all development task records and task evidence; no task folders are stored in the repository.
- `.agent-context/generated/`: ignored, bounded historical context; not an execution record or an alternative to Knowledge.

The scalable source layout is now active. Keep new code in the matching top-level area.

Local smoke-test credentials must be resolved from configured local secret store or environment. Never place credential values in this file, Obsidian, Skills, or committed test artifacts.

## 2. Repository Docs Are Source Of Truth

Before coding, identify the active service, app, plugin, or cross-service task.

Read context from:

- `docs/README.md`
- the relevant `docs/architecture/services/<service>.md` document
- relevant approved decisions and runbooks under `docs/`
- `.agent-context/generated/<area>-context.md` when bounded historical context was generated
- the exact owner-approved Knowledge task specification, plan, and execution record

For non-trivial active tasks, read the provided specification, plan, and execution state before broad search. Repository docs remain authoritative over generated or external context.

For cross-service work, read:

- `docs/architecture/overview.md`
- the exact Knowledge task specification and plan; generated context is supplemental

Current TradeLab repository context lives in `docs/architecture/plugins/tradelab.md` and `docs/runbooks/tradelab-research-prompt.md`. Use generated `tradelab` context only when historical notes are relevant.

Current assistant context lives in `docs/architecture/services/assistant-service.md`. Read the exact Knowledge task specification before broader search.

For TradeLab phase/status questions such as what remains, how many steps are left, or whether a named plan is done, use the bounded TradeLab status summarizer or the named plan/review first. Treat AppHost/browser checks as not applicable unless the user asks for runtime evidence or fresh runtime state decides the answer.

Current agent workflow context lives in `agents/protocol/`, `agents/adapters/`, and `docs/runbooks/agent-context.md`. Generated external context is supplemental.

For workflow-review or transcript-review tasks, use extractor summaries before raw session JSONL. Prefer targeted indexes, README files, latest task reviews, and bounded `rg` searches before broad vault scans.
### Agent Workflow Rules
- Before coding, fetch/prune and compare upstream.
- Run `git pull --ff-only` only when working tree is clean.
- For UI tasks, inspect reference images and screenshots first.
- Detailed Claude workflow lives in `agents/adapters/claude.md`.
- No fake telemetry; show `Unknown` or `Not configured` if not verified.
- Save durable task evidence only under the exact approved Knowledge task's `evidence/<run-id>/`. Its `execution.md` owns state. Repository docs and CI may publish sanitized feature results, not task history.

If context is missing:

- For new features, UX changes, API changes, or architecture changes: stop and ask before coding.
- For every development task, including small bugfixes: missing Knowledge access, exact task path, approval, or required task context means `BLOCKED`; never create a repository fallback.

## Portable Protocol

Blocks lưu workflow portable cấp dự án trong `agents/`.

Khi runtime hỗ trợ, agent có thể dùng skill tương thích với Superpowers như lớp tăng tốc. Tuy nhiên source of truth cho workflow của dự án vẫn là:

- `agents/protocol/`
- `agents/adapters/<runtime>.md`
- `agents/manifests/`
- `agents/tools/`

Ưu tiên hiện tại:

- Codex đọc `agents/adapters/codex.md`
- Antigravity đọc `agents/adapters/antigravity.md`

Nếu có khác biệt giữa runtime skill/plugin và protocol của repo, protocol của repo thắng.

## 3. Superpowers Workflow

When the user invokes Superpowers, follow the relevant Superpowers skill workflow.

Project preference:

### Knowledge-only tasks

- Store every development task in Knowledge: spec, plan, execution, review, task mockups and durable evidence. There is no public/private storage split and no repository task projection.
- Resolve Knowledge through `OBSIDIAN_VAULT_PATH`; use only the exact task path supplied or approved by the owner. Read its current spec, plan and execution before broad search; keep one authoritative execution record.
- Missing vault access, exact task path, approval, or required context is `BLOCKED`. Do not guess another task, broaden worker access, or save task records in the repository.
- New task scaffolding uses `agents/tools/new-task.ps1` with an exact vault-relative `-TaskPath`. Scaffolding is not approval to execute or overwrite an existing task.
- Repository docs retain product behavior, architecture, contracts, decisions, runbooks and sanitized results. Extract durable product knowledge before moving task history; never replace product explanations with private links.
- Ordinary build/test/CI uses repository code and configuration without Knowledge. Agent-led development requires Knowledge; read-only product documentation does not authorize a task.
- Skills' default task/spec/plan locations are overridden by this rule. No new task records under docs or runtime-specific repo folders.

Expected task artifacts:

- `spec.md`
- `plan.md`
- `execution.md` for non-trivial active tasks
- `mockup-ui.md` if UI is involved
- `notes.md` if useful
- `review.md` if review findings or self-review are useful

If a Superpowers skill requires a conflicting path, pause and explain the conflict before proceeding.

## 4. Task Classification

Classify every task before coding:

- Backend service task
- Frontend app task
- Plugin task
- Cross-service task
- Documentation/Obsidian task
- Refactor/migration task
- Bugfix

Frontend-facing work must be triaged:

- L1: small visual/copy/layout fix, can proceed after reading source.
- L2: new UI, new flow, new state, modal, form, dashboard, navigation, or major UX change. Must stop and follow `docs/architecture/services/web.md` and `agents/protocol/verification.md` before coding.

For UI/runtime closeout, AppHost/browser evidence must be `PASS`, `NOT APPLICABLE`, or `BLOCKED` with exact reason and next rerun action. For UI functional testing and browser-based runtime verification, prefer `browser-use` first so the agent performs visible user-like actions on the real interface. Use another browser tool only when `browser-use` is unavailable or failing in the current environment, and report the fallback reason plus substitute tool in the final response. Do not treat tests/build alone as complete runtime evidence when AppHost/browser state matters.

`blocks-ui-workflow` is the repo-owned authority for Blocks Web UI workflow. When runtime-supported frontend skills are available, route:

- default implementation to `frontend-ui-engineering`
- audit, polish, or redesign to `impeccable`
- marketing or expressive surfaces to `taste-skill`
- visual direction or concept exploration to `ui-ux-pro-max`

Use one primary specialist by default and at most one optional secondary specialist. Choose specialists by phase, not by invoking every frontend skill on the same task.

Before implementation for L2 UI work, state the routing decision:

- primary specialist
- optional secondary specialist
- why this routing fits the task
- why the other frontend specialists are being skipped

Final completion is still owned by the repo workflow gates. No specialist skill replaces browser-use verification, shell and navigation checks, accessibility review, or the experience-quality signoff.

If a polish or verification pass finds UI defects, ownership returns to `frontend-ui-engineering` until the issue is fixed and the relevant checks are rerun. Repo rules win on conflict.

## 5. Plugin Rules

Future plugins should use this shape unless a task says otherwise:

- Backend-only plugin: `plugins/<plugin-name>/service/`
- Plugin with UI: backend in `plugins/<plugin-name>/service/`; UI in `apps/web/Blocks.Web/src/plugins/<plugin-name>/` unless explicitly designed as standalone.
- Optional shared plugin contracts: `plugins/<plugin-name>/contracts/`

Do not create `web/` or `contracts/` folders for a plugin unless there is an actual need.

## 6. Coding Rules

Keep changes minimal and scoped.

Do not:

- hardcode secrets
- change database schema without explicit request
- change API contract without checking Obsidian context
- introduce large dependencies without explaining why
- rewrite unrelated files
- update long-term Obsidian context unless the user asks

Prefer:

- existing project patterns
- service layer for API calls
- typed request/response contracts
- small focused components
- clear error handling
- tests or a clear explanation when tests cannot be run

Deployment and branch rules:

- Production branch is `master`; production PRs, CI/CD targets, and deployment checks use `master` unless user explicitly changes branch strategy.
- For this lab-style deployment, apply requested non-secret production settings directly in the owning service's `appsettings.Production.json` before introducing external secret infrastructure.
- Secret values remain outside committed configuration and documentation.

PowerShell/path hygiene:

- Resolve candidate paths with `rg --files`, `Get-ChildItem`, or `Test-Path` before reading guessed files.
- Do not use wildcards with `-LiteralPath`; resolve matches first, then read exact paths.
- Avoid long quoted one-liners when a short command or focused script is less error-prone.

Blocks Web UI is shadcn-first:

- Prefer installed shadcn/ui primitives from `apps/web/Blocks.Web/src/components/ui/`.
- If shadcn has the needed primitive but it is not installed, add the official shadcn component instead of hand-writing a duplicate.
- Build domain-specific components by composing shadcn/ui primitives and project tokens.
- Use other UI libraries or custom primitives only when shadcn and existing project components do not cover the need, and explain why.

Database table convention:

- New mutable domain/config tables should include `created_at`, `created_by`, `updated_at`, `updated_by`, `is_active`, and `is_deleted`.
- API/frontend models may expose those fields as `createdAt`, `createdBy`, `updatedAt`, `updatedBy`, `isActive`, and `isDeleted`.
- Use `is_active`, not `is_actived`.
- Append-only event, log, history, result, and market-data fact tables may omit active/delete/update fields when immutability matters. Document the exception in the relevant Obsidian spec or plan.

## 7. After Implementation

Final response must include:

- Summary
- Files Changed
- Context Used
- Testing
- Notes

Also mention:

- Obsidian updates that should be made
- missing context
- conflicts between code and Obsidian notes
- tests that were not run
## Performance Guard

- **Batch-read rule**: Cache file reads in a session, avoid duplicate reads.
- **Token-budget guard**: Stop a skill if total token usage exceeds 2 M per week.
