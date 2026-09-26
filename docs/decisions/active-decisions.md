---
status: approved
owner: repository
last_reviewed: 2026-09-26
scope: active-decisions
supersedes: obsidian-vault/architecture/active-decisions.md
---

# Active Decisions

## Knowledge Ownership

Repository `docs/` owns product behavior, architecture, contracts, runbooks and sanitized results. All development task specs, plans, execution records, reviews and durable runtime evidence live only in Knowledge. This replaces the former public/private task-storage split. No task records or task projections are kept in the repository. Agent execution requires an exact owner-approved path through `OBSIDIAN_VAULT_PATH`; ordinary build/test/CI remains vault-independent.

## Agent Assets

`agents/` is canonical. Harness skill catalogs are generated from `agents/skills-manifest.yaml` and verified for drift.

## Context Access

Agents read product docs and the exact owner-approved Knowledge task; missing task access or required context is `BLOCKED` without repository fallback. Generated historical context is supplemental. Vault access is read-only by default; task/report writes require owner approval and filesystem boundary verification.

## Structural Refactors

Structure-only changes preserve product behavior and public identifiers. Optional naming normalization remains skipped unless evidence shows benefit greater than path churn.
