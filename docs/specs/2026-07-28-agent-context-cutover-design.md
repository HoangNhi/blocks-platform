---
status: approved
owner: agent-workflow
created: 2026-07-28
scope: agent-context-cutover
---

# Agent Context Cutover Design

## Decision

Approved implementation task state is repository-canonical. External Obsidian remains the home for drafts, exploration, conversation history, and archived working notes.

## Problem

The repository-surface refactor preserved the external vault but changed the default agent context path from direct in-repository discovery to bounded generated projections. The current bridge covers only four areas, the current process can lack `OBSIDIAN_VAULT_PATH`, and active skills still contain obsolete repository-relative `obsidian-vault/...` reads.

This leaves agents able to follow most hard rules but unable to reliably discover active plans, execution state, and domain decisions without an explicit external-vault setup.

## Goals

- Make approved `spec.md`, `plan.md`, `execution.md`, and `review.md` available from Git with the code they govern.
- Keep external vault history optional and bounded rather than a hidden dependency for implementation.
- Preserve the external vault without bulk-copying historical material back into the repository.
- Remove stale repository-relative vault paths from active agent rules and published skills.
- Make context-area coverage and workflow-map declarations mechanically verifiable.
- Keep generated historical context read-only, attributed, bounded, and secret-safe.

## Non-Goals

- Do not migrate all external vault files into Git.
- Do not delete, rewrite, or reclassify archived external notes in bulk.
- Do not change product behavior, public APIs, database schemas, or deployment behavior.
- Do not require `OBSIDIAN_VAULT_PATH` for ordinary approved implementation work.
- Do not add a dependency for YAML parsing, a database, or a context service.

## Canonical Task Model

### Repository Task Folder

Approved implementation tasks use one folder:

```text
docs/tasks/YYYY-MM-DD-<slug>/
├── spec.md
├── plan.md
├── execution.md
├── review.md
├── mockup-ui.md       # optional
└── notes.md           # optional
```

The folder is the canonical source for the approved implementation boundary and current durable execution state. It is committed with the code changes it governs.

`execution.md` is concise and contains the current checkpoint, blockers, changed files, verification status, external evidence locations, and exact rerun commands. Large logs, screenshots, recordings, generated reports, and browser profiles remain external.

### External Vault

The external vault retains drafts before approval, exploration and research notes, conversation-derived context, large or transient evidence, and superseded task variants.

When an external task becomes approved, its external note records the repository task path, approved date, and status. This is a pointer, not a second authoritative execution ledger.

### Lifecycle

1. Create a draft in the external vault when exploratory work needs durable notes.
2. On approval, create `docs/tasks/YYYY-MM-DD-<slug>/` and promote the approved specification, plan, and current execution state.
3. Implement and verify against the repository task folder.
4. Keep durable external evidence paths in `execution.md` or `review.md`.
5. Mark the external draft as promoted or archived; do not duplicate subsequent live state there.

## Context Discovery Model

### Repository-First Reads

Agents read, in order:

1. `AGENTS.md` and applicable local agent instructions.
2. `docs/README.md` and relevant architecture, decision, and runbook documents.
3. The active folder under `docs/tasks/`.
4. Generated historical context only when a task needs it.

Repository material remains authoritative for approved work. External notes cannot override it.

### Bounded Historical Context Bridge

`agents/tools/get-context.ps1` remains a read-only bridge for optional historical context.

It supports manifest-defined areas for `core-service`, `file-service`, `shared`, `web`, `assistant`, `tradelab`, `ai-video`, `infrastructure`, `agent-workflow`, and `cross-service`.

The bridge accepts an optional vault-relative Markdown file or task folder only after resolving it under `OBSIDIAN_VAULT_PATH`. A task-folder request may include only `spec.md`, `plan.md`, `execution.md`, `review.md`, and `notes.md`; it never recursively copies arbitrary evidence. Absolute paths and traversal outside the vault fail closed. The requested external input remains subject to the existing file-type, redaction, and byte-limit rules.

Default output includes repository sources first and only manifest-defined external summaries. An explicitly requested external task or note is included only when history is required. `-RequireVault` is reserved for work that cannot proceed without that history.

### Freshness Contract

Generated context includes generation time, repository `HEAD`, source paths, and SHA-256 digests for every included source.

Consumers must not silently treat a previous generated file as current. A `-Verify` mode compares recorded repository/source metadata with current values and returns `stale-context` on a mismatch. Staleness is a warning unless the request explicitly requires vault history.

## Rule and Skill Alignment

### Root Guide and Protocols

`AGENTS.md` routes approved work to `docs/tasks/YYYY-MM-DD-<slug>/` instead of separate `docs/specs/` and `docs/plans/` paths. `docs/README.md` lists `tasks/` as the approved implementation-artifact area and points readers to the active task folder after the relevant architecture and decision documents.

`agents/protocol/core.md` replaces references to a service owner in Obsidian with approved repository ownership documents. External drafts and history remain available but do not own approved execution.

`agents/protocol/context-routing.md` lists the expanded bridge areas and routes active approved work to repository task folders before generated history.

### Workflow Map

`agents/manifests/workflow-map.yaml` declares a `context_area` for every workflow that may call `get-context.ps1`. Each declared value must exist in `.agent-context/context-manifest.yaml`.

An agent-workflow change uses `context_area: agent-workflow`; it no longer points to a tool invocation that cannot support its own workflow.

### Skills and Published Catalogs

The canonical `blocks-ui-workflow` source replaces required in-repository `obsidian-vault/...` paths with repository documentation and optional generated historical context.

The skill retains L1/L2 triage, shadcn-first composition, specialist routing, browser-use-first verification, experience-quality review, and accessibility review. Only the context location changes.

Run the existing skill sync process after changing canonical skill source so `.agents/skills/`, other runtime catalogs, and their checks receive the same corrected text.

## Task Scaffolding

`agents/tools/new-task.ps1` supports two explicit modes:

| Mode | Destination | Requirement |
| --- | --- | --- |
| `approved` | `docs/tasks/YYYY-MM-DD-<slug>/` | Repository write access |
| `draft` | External vault task location | Valid `OBSIDIAN_VAULT_PATH` |

`approved` is the default. It creates the standard folder and concise initial `execution.md`. `draft` preserves external-vault behavior but is never the automatic destination for approved implementation state.

## Migration

### Scope

Do not bulk-migrate historical notes. First produce a dry-run inventory of external task folders classified as `draft`, `approved-active`, `completed`, or `archived`.

Only `approved-active` tasks are candidates for repository promotion. The user reviews the inventory before any task-folder copy or move.

### Promotion

For each approved active task:

1. Create a repository task folder.
2. Copy the approved spec, plan, current execution state, and review when present.
3. Remove secrets and runtime-only evidence from the promoted material.
4. Add external evidence pointers and rerun commands to the repository ledger.
5. Mark the external task as promoted with its repository path.
6. Verify the repository task folder is self-sufficient for a new agent to continue the work.

Completed and archived tasks remain external unless a future approved decision requires their durable repository promotion.

## Verification

Add focused automated coverage for:

- every manifest context area generating bounded, attributed output;
- required-vault failure and repository-only fallback;
- rejection of absolute and traversal external task inputs;
- generated context freshness metadata and stale-output detection;
- every workflow-map `context_area` existing in the context manifest;
- `new-task.ps1` approved and draft destinations;
- absence of obsolete active `obsidian-vault/...` paths in root guides, active protocols, adapters, canonical skill source, and synchronized runtime skill catalogs;
- task-folder scaffold contents and BOM-safe output.

Manual verification covers one approved task continuation with no vault environment configured and one deliberate historical-context request with a valid vault environment.

## Acceptance Criteria

- An approved task can be resumed from a clean checkout using only repository files.
- A missing `OBSIDIAN_VAULT_PATH` does not block ordinary implementation work.
- A historical-context request fails clearly when the vault is required but unavailable.
- The bridge covers every declared workflow area and never reads outside configured roots.
- No active rule or published Blocks skill requires a deleted repository-relative `obsidian-vault/...` path.
- Generated context cannot be silently reused after recorded repository or source inputs change.
- The external vault remains intact; no bulk migration or deletion occurs.
- CI fails when context mappings, workflow declarations, or published skill paths drift.

## Delivery Order

1. Add repository task-folder contract and update root/protocol routing.
2. Extend context manifest and bridge validation/freshness behavior.
3. Repair canonical skills, adapters, and workflow-map declarations; synchronize catalogs.
4. Add focused tests and CI drift checks.
5. Produce the external-task dry-run inventory.
6. Promote only user-approved active tasks.
7. Run focused workflow verification and one no-vault continuation smoke check.

## Risks and Controls

| Risk | Control |
| --- | --- |
| Repository task docs become stale duplicates | Only approved tasks are repository-canonical; external notes receive pointers rather than parallel execution updates. |
| Historical context leaks secrets | Preserve existing redaction, file-type allowlist, root-bound path resolution, and byte cap. |
| Broad migration creates noisy history | Inventory first; promote only user-approved active tasks. |
| Skill catalogs drift after source repair | Sync catalogs and test canonical plus published copies. |
| Freshness checks block ordinary work | Treat stale generated history as a warning unless a request explicitly requires vault history. |
