---
status: approved
owner: repository
last_reviewed: 2026-07-26
scope: active-decisions
supersedes: obsidian-vault/architecture/active-decisions.md
---

# Active Decisions

## Knowledge Ownership

Approved implementation knowledge lives in repository `docs/`. The external Obsidian vault contains working notes, history, research, and unapproved alternatives. Repository docs win on conflict.

## Agent Assets

`agents/` is canonical. Harness skill catalogs are generated from `agents/skills-manifest.yaml` and verified for drift.

## Context Access

Implementation agents use repository docs first and bounded generated context second. Direct vault access is exceptional and read-only by default.

## Structural Refactors

Structure-only changes preserve product behavior and public identifiers. Optional naming normalization remains skipped unless evidence shows benefit greater than path churn.
