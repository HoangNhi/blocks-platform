---
status: approved
owner: web
last_reviewed: 2026-07-26
scope: apps/web/Blocks.Web
source: obsidian-vault/services/web/README.md
---

# Blocks Web

- App: `apps/web/Blocks.Web/`
- UI primitives: `apps/web/Blocks.Web/src/components/ui/`
- Domain features: `apps/web/Blocks.Web/src/features/` and `apps/web/Blocks.Web/src/plugins/`

Blocks Web is shadcn-first. UI runtime verification follows the browser-use-first policy in `AGENTS.md` and `agents/protocol/verification.md`.

## Interface responsibilities

- The workspace shell owns navigation, route-backed workspace tabs, responsive sidebar and assistant presentation. Page components own their data, forms and actions rather than duplicating shell navigation.
- Shared tables and toolbars live in `apps/web/Blocks.Web/src/components/data-table/`. They own rendering, one-based pagination, controlled toolbar layout, selection affordances and loading/error/empty presentation. Pages retain API calls, permission rules, filters, mutations and dialogs.
- Users and invitations belong to user administration; registration settings belong to System Overview. Roles and menu/action permissions form one administrative workflow.
- UI permissions never replace backend checks. Unsupported actions are unavailable; inaccessible permission data must not be presented as an empty successful load.
- Preserve keyboard access, visible focus, labeled controls and usable narrow layouts. Distinguish successful saves from subsequent list-refresh failures; do not automatically replay an ambiguous mutation.

Design iterations, mockups, unfinished acceptance gates and verification history live in Knowledge, not this product reference.
