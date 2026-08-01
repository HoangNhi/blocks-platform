---
status: approved
owner: repository
last_reviewed: 2026-07-26
scope: knowledge-ownership
---

# Blocks Documentation

Repository documentation is the canonical source for approved, implementation-relevant Blocks knowledge.

## Reading Order

1. `AGENTS.md`
2. `README.md`
3. The relevant document under `docs/`
4. The current task specification or plan
5. Generated context under `.agent-context/generated/` when historical context is useful

The external Obsidian vault is working and historical knowledge. It cannot override approved repository documents.

## Areas

- `architecture/`: current system and ownership maps
- `decisions/`: approved durable decisions
- `specs/`: reviewable and approved specifications
- `plans/`: implementation plans
- `tasks/`: repository-canonical approved task folders (`docs/tasks/YYYY-MM-DD-<slug>/`)
- `audits/`: evidence and validation records
- `runbooks/`: repeatable operating procedures
- `releases/`: public release decisions and sanitized publication records
- `archive/`: superseded repository documents

Use `agents/tools/get-context.ps1` for bounded, attributed external context.
