---
status: approved
owner: repository
last_reviewed: 2026-09-26
scope: knowledge-ownership
---

# Blocks Documentation

Repository documentation is canonical for product behavior, contracts, architecture, operating guidance and published results. All development task records live only in Knowledge at exact owner-approved paths; they do not override repository product contracts or security boundaries.

## Evidence Ownership

Durable task evidence belongs under `evidence/<run-id>/` of its exact Knowledge task; `execution.md` owns task state. Repository docs and CI may expose sanitized product results without reproducing task records. Inaccessible Knowledge is `BLOCKED` for agent-led development, never a repository fallback. Normal product build/test/CI remains independent of the vault.

## Reading Order

1. `AGENTS.md`
2. `README.md`
3. The relevant document under `docs/`
4. Exact Knowledge task path supplied or approved by the owner, including current spec, plan and execution
5. Generated context under `.agent-context/generated/` when historical context is useful

Knowledge holds all task artifacts and development history. Read only the exact approved task; missing access or approval blocks execution. Generated historical context is supplemental input, not a task mirror, authority or permission.

## Areas

- `architecture/`: current system and ownership maps
- `decisions/`: approved durable decisions
- `audits/`: sanitized product and security assessment results, not execution logs
- `runbooks/`: repeatable operating procedures
- `releases/`: public release decisions and sanitized publication records

Use `agents/tools/get-context.ps1` for bounded, attributed external context.
