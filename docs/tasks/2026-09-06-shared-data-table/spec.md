# Shared Data Table and Toolbar

**Date:** 2026-09-06  
**Status:** Design approved in chat; awaiting spec review  
**Scope:** Blocks Web admin list screens

## Goal

Make existing `SystemDataTable<TItem>` reusable across list pages while
removing duplicated toolbar layout from Users and Roles. Keep filters,
actions, data loading, and domain rules page-owned.

## Current State

`SystemDataTable` is already used by Users, Roles, System Groups, Menus, and
Audit Log. It owns generic table rendering, pagination, selection, loading,
error, empty, row-action, scrolling, and card/embedded behavior. It currently
lives under the admin feature and imports admin-specific selection helpers.

## Design

### Shared components

- `apps/web/Blocks.Web/src/components/data-table/data-table.tsx`
  - Promote current generic table implementation.
  - Preserve typed columns, optional selection, blocked-row explanations,
    pagination, refresh, loading/error/empty states, row actions, sticky
    headers, scrolling, and `card`/`embedded` variants.
  - Preserve one-based pagination and current visual behavior.
- `apps/web/Blocks.Web/src/components/data-table/data-table-toolbar.tsx`
  - Own responsive toolbar layout only.
  - Accept controlled search value/change callback, search label and
    placeholder, filter open state/change callback, active-filter count,
    filter content, and action content.
  - Render no API calls, filter semantics, mutations, or dialogs.
- Move generic selection helpers next to shared table. Keep admin request and
  filter helpers feature-owned.

### Page ownership

Users and Roles provide filter controls, action buttons, columns, request
state, fetch/refresh callbacks, selection reset rules, permissions, and
dialogs. System Groups, Menus, and Audit Log migrate table imports without
forced toolbar redesign; adopt shared toolbar only where layout matches.

### Non-goals

No sorting, export, column visibility, generic CRUD framework, data-fetching
hook, new dependency, API change, or database change.

## States and accessibility

Retain existing loading, error, empty, disabled-selection, and success states.
Toolbar controls remain keyboard reachable, expose accessible labels, preserve
visible focus, and avoid horizontal overflow around 390px width.

## Testing

- Move and retain existing `system-data-table` tests.
- Add focused toolbar tests for search rendering, filter toggle/count, action
  slot rendering, and keyboard reachability.
- Run affected admin tests, frontend build, and lint if available.
- Browser verification must use normal navigation to Users and Roles, exercise
  search/filter/actions/pagination, and check desktop plus approximately 390px.

## Evidence boundary

No implementation or runtime verification occurs during brainstorming. AppHost
and browser evidence is required during implementation closeout.

