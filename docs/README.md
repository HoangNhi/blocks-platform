---
status: approved
owner: repository
last_reviewed: 2026-09-24
scope: knowledge-ownership
---

# Blocks Documentation

Repository documentation is canonical for public product behavior, contracts, and contributor workflow. Owner-approved private internal task records may live in the external vault at an explicitly supplied task path; they do not override public product documentation or repository-owned protocol.

## Reading Order

1. `AGENTS.md`
2. `README.md`
3. The relevant document under `docs/`
4. Active public task folder under `docs/tasks/`, or the exact private task path supplied by the owner
5. Generated context under `.agent-context/generated/` when historical context is useful

The external Obsidian vault holds working history and approved private task records. Read private task files only when the owner supplies the exact path and execution approval. Generated context is attributed input, not authority or permission.

## Areas

- `architecture/`: current system and ownership maps
- `decisions/`: approved durable decisions
- `specs/`: reviewable and approved specifications
- `plans/`: implementation plans
- `tasks/`: self-contained public contributor task folders (`docs/tasks/YYYY-MM-DD-<slug>/`)
- `audits/`: evidence and validation records
- `runbooks/`: repeatable operating procedures
- `releases/`: public release decisions and sanitized publication records
- `archive/`: superseded repository documents

Use `agents/tools/get-context.ps1` for bounded, attributed external context.
