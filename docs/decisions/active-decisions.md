---
status: approved
owner: repository
last_reviewed: 2026-09-24
scope: active-decisions
supersedes: obsidian-vault/architecture/active-decisions.md
---

# Active Decisions

## Knowledge Ownership

Public product behavior, contracts, contributor guidance, and project protocol live in repository `docs/`. Approved private internal task specs, plans, and execution checkpoints may live in the owner's external vault task path when explicitly assigned. Private task files do not override public contracts, security boundaries, or repository protocol; contributors do not require vault access.

## Agent Assets

`agents/` is canonical. Harness skill catalogs are generated from `agents/skills-manifest.yaml` and verified for drift.

## Context Access

Agents read repository docs first, then the exact owner-supplied private task path when applicable; bounded generated context is supplemental. Vault access is read-only by default. A separate report output is writable only after owner approval and an actual boundary check.

## Structural Refactors

Structure-only changes preserve product behavior and public identifiers. Optional naming normalization remains skipped unless evidence shows benefit greater than path churn.
