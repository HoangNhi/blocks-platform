# Shared Data Table and Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the existing admin table into reusable Web components and share toolbar layout across Users and Roles without moving domain behavior.

**Architecture:** Move generic table rendering and selection helpers into `src/components/data-table/`. Add a controlled toolbar slot component for search, filter trigger/content, and page-owned actions. Keep API state, filters, mutations, permissions, dialogs, and selection-reset rules in each page.

**Tech Stack:** React 19, TypeScript, Vite, shadcn/ui, Tailwind CSS, Vitest, Testing Library.

**Spec:** `docs/tasks/2026-09-06-shared-data-table/spec.md`

## Global Constraints

- Preserve one-based pagination and current visual behavior.
- Keep filters, actions, data loading, and domain rules page-owned.
- No sorting, export, column visibility, generic CRUD framework, data-fetching hook, new dependency, API change, or database change.
- Preserve loading, error, empty, disabled-selection, and success states.
- Support keyboard access, visible focus, accessible labels, and approximately 390px width without horizontal overflow.
- Use existing shadcn primitives and project patterns.

---

### Task 1: Establish baseline and shared file map

**Files:**
- Read: `docs/tasks/2026-09-06-shared-data-table/spec.md`
- Read: `apps/web/Blocks.Web/src/features/admin/components/system-data-table.tsx`
- Read: `apps/web/Blocks.Web/src/features/admin/components/system-data-table.test.tsx`
- Read: `apps/web/Blocks.Web/src/features/admin/system-list-state.ts`
- Read: `apps/web/Blocks.Web/src/features/admin/pages/users-page.tsx`
- Read: `apps/web/Blocks.Web/src/features/admin/pages/roles-page.tsx`

- [ ] **Step 1: Confirm clean baseline and upstream parity**
Run the repository Git executable resolved by `AGENTS.md` workflow:
```powershell
& 'C:\Users\hoang\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe' status --short
& 'C:\Users\hoang\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe' fetch --prune
& 'C:\Users\hoang\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe' rev-parse HEAD
```
Expected: no unrelated working-tree edits; record any pre-existing task edits and do not overwrite them.

### Task 2: Add shared selection and table modules

**Files:**
- Create: `apps/web/Blocks.Web/src/components/data-table/data-table.tsx`
- Create: `apps/web/Blocks.Web/src/components/data-table/data-table.test.tsx`
- Create: `apps/web/Blocks.Web/src/components/data-table/selection-state.ts`
- Modify: `apps/web/Blocks.Web/src/features/admin/components/system-data-table.tsx`
- Modify: `apps/web/Blocks.Web/src/features/admin/components/system-data-table.test.tsx`

**Interfaces:**
- Produce `DataTable<TItem>` with current `SystemDataTableProps<TItem>` behavior and exported `DataTableColumn<TItem>`.
- Produce `SelectionState` with `selectedIds: string[]` and `onSelectedIdsChange(nextIds: string[]): void`.
- Produce `toggleSelectedId`, `toggleAllSelectedIds`, and `areAllVisibleSelected` from shared `selection-state.ts`.

- [ ] **Step 1: Copy current table tests to shared location and change imports/names**
- [ ] **Step 2: Run focused tests and confirm they fail because shared modules do not exist**
```powershell
Set-Location apps/web/Blocks.Web
npm test -- src/components/data-table/data-table.test.tsx
```
Expected: FAIL with missing shared module.
- [ ] **Step 3: Move generic table implementation with minimum edits**
Rename `SystemDataTable` to `DataTable`, `SystemColumn` to `DataTableColumn`, and replace relative admin selection import with shared `selection-state.ts`.
- [ ] **Step 4: Run focused shared tests**
```powershell
npm test -- src/components/data-table/data-table.test.tsx
```
Expected: PASS.
- [ ] **Step 5: Keep a compatibility wrapper only if existing consumers require staged migration**
If used, wrapper re-exports shared types and renders `DataTable`; do not duplicate table logic.

### Task 3: Build controlled shared toolbar

**Files:**
- Create: `apps/web/Blocks.Web/src/components/data-table/data-table-toolbar.tsx`
- Create: `apps/web/Blocks.Web/src/components/data-table/data-table-toolbar.test.tsx`

**Interfaces:**
```ts
type DataTableToolbarProps = {
  searchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  searchAriaLabel?: string
  filterOpen?: boolean
  onFilterOpenChange?: (open: boolean) => void
  activeFilterCount?: number
  filterContent?: ReactNode
  actions?: ReactNode
  children?: ReactNode
  className?: string
}
```

- [ ] **Step 1: Write tests for search, filter count/toggle, action slot, and keyboard labels**
- [ ] **Step 2: Run toolbar tests and verify failure**
```powershell
npm test -- src/components/data-table/data-table-toolbar.test.tsx
```
Expected: FAIL with missing component.
- [ ] **Step 3: Implement toolbar using existing `Input`, `Button`, `Badge`, and `Collapsible` patterns**
Keep filter controls in `filterContent`; render `actions` without interpreting them.
- [ ] **Step 4: Run toolbar tests**
Expected: PASS.

### Task 4: Migrate admin consumers

**Files:**
- Modify: `apps/web/Blocks.Web/src/features/admin/pages/users-page.tsx`
- Modify: `apps/web/Blocks.Web/src/features/admin/pages/roles-page.tsx`
- Modify: `apps/web/Blocks.Web/src/features/admin/pages/system-groups-page.tsx`
- Modify: `apps/web/Blocks.Web/src/features/admin/pages/menus-page.tsx`
- Modify: `apps/web/Blocks.Web/src/features/admin/pages/audit-log-page.tsx`
- Modify: related page tests where imports or selectors change

- [ ] **Step 1: Replace table imports with shared `DataTable` and `DataTableColumn`**
- [ ] **Step 2: Replace Users and Roles duplicated toolbar layout with `DataTableToolbar`**
Pass existing search state, filter state/content, active count, and buttons unchanged.
- [ ] **Step 3: Preserve page-owned callbacks and selection resets**
Do not move API calls, `apply*Filters`, delete handlers, permission checks, or dialogs into shared components.
- [ ] **Step 4: Migrate remaining three table consumers**
Keep their current surrounding layout; change only shared table and selection imports unless toolbar structure matches.
- [ ] **Step 5: Run affected tests**
```powershell
npm test -- src/features/admin/pages/users-page.test.tsx src/features/admin/pages/roles-page.test.tsx src/features/admin/components/system-data-table.test.tsx src/components/data-table/data-table.test.tsx src/components/data-table/data-table-toolbar.test.tsx
```
Expected: PASS.

### Task 5: Remove obsolete admin table implementation and verify

**Files:**
- Delete: `apps/web/Blocks.Web/src/features/admin/components/system-data-table.tsx` when no imports remain
- Delete: `apps/web/Blocks.Web/src/features/admin/components/system-data-table.test.tsx` when shared test fully replaces it
- Delete: `apps/web/Blocks.Web/src/features/admin/system-list-state.ts` when no admin imports remain
- Modify: `docs/tasks/2026-09-06-shared-data-table/execution.md`

- [ ] **Step 1: Confirm no stale imports**
```powershell
rg -n 'SystemDataTable|SystemColumn|system-data-table|system-list-state' apps/web/Blocks.Web/src
```
Expected: no production references; test references only if intentionally retained.
- [ ] **Step 2: Run full Web validation**
```powershell
Set-Location apps/web/Blocks.Web
npm test
npm run build
npm run lint
```
- [ ] **Step 3: Run browser journey**
Use browser-use first. Navigate through normal shell/sidebar to Users and Roles; exercise search, open/close filters, filter controls, row action, selection, pagination, refresh, and mobile width near 390px.
- [ ] **Step 4: Record evidence**
Record test results, browser status, navigation method, actions, accessibility checks, and any blocker in `execution.md`. AppHost/browser status must be `PASS`, `NOT APPLICABLE`, or `BLOCKED` with exact rerun action.

## Self-Review

- Spec coverage: shared table, toolbar ownership, five consumers, states, accessibility, tests, and browser verification mapped above.
- Placeholder scan: no `TBD`, `TODO`, or vague implementation step remains.
- Type consistency: `DataTable<TItem>`, `DataTableColumn<TItem>`, and `SelectionState` names remain stable across migration tasks.

