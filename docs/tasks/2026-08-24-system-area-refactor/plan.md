# System Area Page-by-Page Refactor Plan

**Status:** Users page implemented; Roles specification and execution plan revised 2026-09-05; Roles implementation not started  
**Branch:** `codex/system-area-refactor`  
**Scope:** Blocks Web System administration area; approved Roles extension includes System Service authorization and transactional persistence.

> **For agentic workers:** Use `executing-plans` task-by-task. This document authorizes no code execution, commit, branch creation, or deployment by itself.

**Architecture:** Users-aligned Roles index and one edit dialog with independent metadata and grouped-permission drafts. Save changed scopes through one authorized, transactional endpoint; preserve existing capability and registration-safety contracts.

**Tech stack:** Existing React/TypeScript, shadcn/ui, Vitest, .NET, EF Core, PostgreSQL, and xUnit. No new dependency or database schema required.

**Spec:** `docs/tasks/2026-08-24-system-area-refactor/spec.md`, Section 14 for Roles; Sections 1-13 remain shared shell context.

## Goal

Refactor System area one page at a time. Do not change a page until its workflow, functionality, states, and visual direction are analyzed and approved.

## Working Rules

- Keep each page independently reviewable and testable.
- Analyze and approve one page before implementation starts.
- Preserve existing routes and API contracts unless page analysis explicitly approves a change.
- Use installed shadcn/ui primitives and existing Blocks Web tokens.
- Cover loading, empty, error, success, disabled, and permission-denied states where applicable.
- Verify desktop and mobile behavior after each page.
- Use `browser-use` first for user-journey verification.
- Record implementation status and evidence in this task folder when execution begins.

## Page Sequence

### 0. Shared System Area Baseline

- [ ] Audit System navigation, page shell, headings, spacing, responsive behavior, and shared table/form patterns.
- [ ] Decide shared changes that should land before individual pages.
- [ ] Confirm page order after dependency review.

### 1. System Overview — `/system/overview`

- [ ] Analyze user goal and current registration-settings workflow.
- [ ] Define required workflow and functionality changes.
- [ ] Approve layout, states, responsive behavior, and accessibility behavior.
- [ ] Implement approved changes with focused tests.
- [ ] Run browser verification and record result.

### 2. Audit Log — `/system/audit-log`

- [ ] Analyze search, filtering, event inspection, pagination, and evidence needs.
- [ ] Define required workflow and functionality changes.
- [ ] Approve layout, states, responsive behavior, and accessibility behavior.
- [ ] Implement approved changes with focused tests.
- [ ] Run browser verification and record result.

### 3. Users And Invitations — `/system/identity/users`

- [x] Analyze account management and invitation workflows.
- [x] Define required workflow and functionality changes.
- [x] Approve layout, states, responsive behavior, and accessibility behavior.
- [x] Implement approved changes with focused tests.
- [x] Run browser verification and record result.

### 4. Roles And Permissions — `/system/identity/roles`

- [x] Analyze role lifecycle and permission-assignment workflow.
- [x] Define required workflow and functionality changes.
- [x] Approve layout, states, responsive behavior, and accessibility behavior.
- [ ] Implement approved changes with focused tests.
- [ ] Run browser verification and record result.

### 5. Menus — `/system/identity/menus`

- [ ] Analyze menu hierarchy, permission mapping, and editing workflow.
- [ ] Define required workflow and functionality changes.
- [ ] Approve layout, states, responsive behavior, and accessibility behavior.
- [ ] Implement approved changes with focused tests.
- [ ] Run browser verification and record result.

### 6. System Groups — `/system/identity/system-groups`

- [ ] Analyze group hierarchy and editing workflow.
- [ ] Define required workflow and functionality changes.
- [ ] Approve layout, states, responsive behavior, and accessibility behavior.
- [ ] Implement approved changes with focused tests.
- [ ] Run browser verification and record result.

### 7. Cross-Page Completion

- [ ] Review shared navigation and page-to-page consistency.
- [ ] Run affected frontend tests and production build.
- [ ] Run complete System-area browser journey at desktop and mobile sizes.
- [ ] Complete accessibility and experience-quality review.
- [ ] Record final PASS, NOT APPLICABLE, or BLOCKED evidence.

## Per-Page Analysis Template

Complete this before editing each page:

1. Primary user and goal.
2. Current pain points.
3. Required workflow changes.
4. Required functionality changes.
5. Information hierarchy and primary action.
6. Loading, empty, error, success, and permission states.
7. Desktop and mobile layout.
8. Accessibility requirements.
9. API or backend impact.
10. Acceptance criteria and browser journey.

## Current Boundary

Users and Invitations page is approved and implemented, with real-runtime verification debt recorded separately. Roles design is approved; detailed execution steps follow. Product execution requires a separate request and starts at R0, not UI edits.

## Roles Execution Rules

- Execute R0-R7 in order. Within each behavior: add focused failing test, run it to verify intended failure, make smallest change, rerun focused tests, record result in execution.md. Do not mark downstream tasks complete from mocked or historical evidence.
- L2 routing: primary `frontend-ui-engineering`; optional final `impeccable` quality review. Skip `taste-skill` and `ui-ux-pro-max`: approved dense admin workflow needs consistency, not new visual direction.
- Frontend commands run from `apps/web/Blocks.Web`; Git and dotnet commands run from repository root. Paths below are repository-relative unless a base is explicitly declared.
- Reuse installed primitives and existing admin API/normalizer patterns. Shared component props stay optional. No generic CRUD framework, global router rewrite, schema migration, or unrelated page redesign.
- Backend suite: `dotnet test tests/system-service/Blocks.SystemService.Tests/Blocks.SystemService.Tests.csproj`. Focus by test class using `--filter FullyQualifiedName~ClassName` during red/green loops.

### R0: Establish Baseline And Navigation Feasibility

Files: read task spec/plan/execution, `agents/adapters/codex.md`, `docs/architecture/services/web.md`, `docs/architecture/services/system-service.md`, `agents/protocol/verification.md`, applicable AGENTS.md, and current shell sources. Update only execution.md evidence.

- [ ] Resolve Git executable; inspect status, remotes, branch, upstream and full HEAD. Fetch/prune and compare upstream; pull `--ff-only` only when clean. Preserve current documentation edits. Stop product edits if requested branch or baseline cannot be resolved.
- [ ] Compare Users, Menus, System Groups, Roles, shared table/footer, and approved local mockup `C:\Users\hoang\Downloads\roles-ui-mockup.html`. Record unavailable references rather than inventing visual evidence.
- [ ] Check production references to permission-matrix-page.tsx. Current inspection found no route; verify again on execution baseline before removal.
- [ ] Prove bounded dirty-navigation interception for sidebar, workspace-tab close, Back/Forward and dialog exits under current BrowserRouter. If reliable blocking needs a broader router change, stop and obtain scope approval; do not promise a guard implemented with unreliable history repair.
- [ ] Run baseline admin/layout/navigation tests and backend authorization suite. Record pre-existing failures separately, exact SHA, branch and navigation approach. Gate: known baseline and feasible scoped navigation guard before R1.

### R1: Role List Filters And Restriction Metadata

Modify under `services/system-service/Blocks.SystemService/`: `Controllers/RoleController.cs`, `Services/CoreFeature/Role/IRoleService.cs`, `Services/CoreFeature/Role/RoleService.cs`, `DTOs/CoreFeature/Role/Dtos/ModelRole.cs`, `DTOs/CoreFeature/Role/Dtos/ModelRoleGetListPaging.cs`.
Create `DTOs/CoreFeature/Role/Requests/RoleGetListPagingRequest.cs` under that service. Create `tests/system-service/Blocks.SystemService.Tests/Admin/RoleServiceGetListTests.cs`; extend existing `Admin/AuthorizationAdministrationTests.cs` in that test project.

- [ ] Add failing tests for optional true/false filters, case-insensitive name/key search, validated page bounds, count before pagination and deterministic name/ID ordering. Fixture: 25 matches, page 2 at size 20 returns 5 rows and total 25.
- [ ] Implement Section 14.11 query contract without changing legacy callers. Derive restriction fields from protected/default status, registration safety and nondeleted user assignments, including inactive users; avoid per-row database queries.
- [ ] Test Section 14.12 domain restrictions independently from caller permissions. System/default roles cannot deactivate/delete; normalized legacy protected keys behave identically. Verify existing registration-safe allowlist remains unchanged.
- [ ] Run focused list and authorization tests, then backend suite. Gate: server filters and canonical restriction reasons ready for web consumption.

### R2: Atomic Save, Authorization And Deletion Safety

Modify R1 controller/service/interface. Create service DTOs `DTOs/CoreFeature/Role/Requests/RoleSaveRequest.cs` and `DTOs/CoreFeature/Role/Dtos/ModelRoleSave.cs`. Create `tests/system-service/Blocks.SystemService.Tests/Admin/RoleSaveTests.cs` and `RoleTransactionTests.cs` in that same Admin directory.
Inspect and modify only necessary assignment coordination in service files `Services/CoreFeature/User/UserService.cs`, `Services/CoreFeature/Registration/RegistrationAdminService.cs`, and `Services/CoreFeature/Registration/RegistrationService.cs`.

- [ ] Test `Save(RoleSaveRequest)` scope authorization: details requires admin.roles UPDATE, permissions requires admin.permissions UPDATE, combined requires both. Keep VIEW scopes separate and response free of unauthorized permission contents.
- [ ] Test omitted/null details and omitted/null/empty permissions as unchanged; reject requests with neither effective scope. Explicit all-false changed rows revoke grants. Reject cross-role/menu IDs, duplicate rows and unsupported grants.
- [ ] Add transactional endpoint and canonical response with savedScopes per Section 14.11. Validate resulting state once: making eligible while revoking unsafe grants succeeds; retaining/adding unsafe grants while eligible fails. Reuse RegistrationAuthorizationSafety.IsSafePermissionKey, not a replacement blacklist.
- [ ] Route legacy mutation endpoints through equivalent safety without independent commits. Revalidate entire delete batch: any blocked/missing target rejects whole batch; no partial deletion.
- [ ] Coordinate role writes/deletes and user/default-role assignment using consistent role locking/order. Add real PostgreSQL rollback and assignment-versus-delete tests using configured local test resources, never production or committed credentials. Mark database verification BLOCKED with rerun action if unavailable; in-memory tests do not satisfy this gate.
- [ ] Run focused save/transaction tests and backend suite. Gate: scope authorization, final-state validation, rollback and concurrency protection proven before dialog integration.

### R3: Web Contracts And Permission Draft Helpers

Base: `apps/web/Blocks.Web/src/features/admin/`. Modify `types.ts`, `system-admin-api.ts`, `admin-normalizers.ts`, `system-list-state.ts` and adjacent existing tests. Create `role-permission-state.ts`, `role-permission-state.test.ts`, and `role-save-api.test.ts` under that base.

- [ ] Add typed RolePagingRequest, RoleSaveRequest and RoleSaveResult contracts plus adminApi.saveRole using existing HTTP/error conventions. Test false filter serialization, omitted unchanged scopes, response normalization and server validation errors.
- [ ] Add minimal pure clone/filter/diff helpers over PermissionGroupModel, preserving systemGroup and complete unfiltered draft. Diff returns changedCellCount and changedRows; count changed supported action cells, not merely rows.
- [ ] Test name/key/group search, groups with no matches, hidden dirty rows, reverting to baseline, unsupported actions, and cloned state isolation. Minimal executable invariant: `expect(diffPermissionGroups([], [])).toEqual({ changedCellCount: 0, changedRows: [] })`.
- [ ] Run `npm test -- src/features/admin/role-permission-state.test.ts src/features/admin/role-save-api.test.ts src/features/admin/system-list-state.test.ts`. Gate: pure state behavior and API contract independently verified.

### R4: Shared Controls And Controlled Permission Matrix

Base: `apps/web/Blocks.Web/src/features/admin/components/`. Modify `system-data-table.tsx`, its existing test, and `crud-dialog-footer.tsx`. Create `crud-dialog-footer.test.tsx`, `role-permission-matrix.tsx`, and `role-permission-matrix.test.tsx` under that base.

- [ ] Test optional table getRowLabel/isRowSelectable hooks and footer isSaveDisabled; preserve all existing callers and loading behavior. Header selection affects only selectable rows on current page and exposes correct indeterminate state.
- [ ] Build matrix controlled by full groups/baseline, loading/error/disabled state and onChange/onRetry/onUndo callbacks; keep API calls in dialog. Use native semantic table and installed shadcn controls, sticky action header and permission-name column within bounded scroll area.
- [ ] Test visible systemGroup headings, six capability columns, quiet accessible unsupported cells, no UUID fallback, labeled row/action controls and mixed-language name/key search. Search Enter must not submit dialog.
- [ ] Test dirty count live announcement, synchronized label only after successful load, permission-only Undo, read-only authorization and filtered edits surviving search changes.
- [ ] Run focused component tests plus Users/Menus/System Groups regressions. Gate: shared behavior unchanged and matrix usable without dialog lifecycle dependencies.

### R5: Roles Index And Single Create/Edit Dialog

Base: `apps/web/Blocks.Web/src/features/admin/`. Modify `pages/roles-page.tsx`, `components/role-form-dialog.tsx` and existing Roles/admin tests. Create `components/role-details-form.tsx` and `components/role-form-dialog.test.tsx`.

- [ ] Test Users-aligned toolbar, real server search/filters, result count and pagination, badges for system/default/registration status, stable key and localized dates via Intl. Missing dates remain unavailable, never fabricated.
- [ ] Keep list/query/selection state in page; dialog owns role/session identity, metadata baseline/draft, permission baseline/draft, load errors and save lifecycle. Load permissions lazily when tab opens; reject stale responses by session and role identity.
- [ ] Test Sửa and Phân quyền opening same dialog on respective tabs; create exposes metadata only. Editing key remains locked. Restricted controls show server reasons intersected with actor authorization, not blanket read-only system roles.
- [ ] Test metadata-only save despite permission-load failure, permission-only save without metadata mutation, combined atomic save, clean/invalid/pending disabled Save and valid create without edit-baseline requirement. Replace old tests that expect metadata update during permission-only saves.
- [ ] Freeze inputs and dismissal during save. Preserve drafts on validation/transport failure; focus invalid tab and summary. Distinguish confirmed save plus list-refresh failure from unknown network outcome; reconciliation must not replay successful writes or automatically recreate roles.
- [ ] Add bulk confirmation using existing AlertDialog. Clear page-scoped selection on query/filter/page/page-size changes; filter reset preserves search/page size. Revalidate blocked targets server-side and correct pagination after deletion.
- [ ] Run `npm test -- src/features/admin` and typecheck. Gate: isolated failures, stale-response safety, all changed scopes and destructive actions covered before navigation wiring.

### R6: Dirty Navigation And Legacy Editor Removal

Modify only shell paths proven necessary in R0: `apps/web/Blocks.Web/src/components/layout/app-shell.tsx`, `workspace-top-chrome.tsx` in that layout directory and their tests. `apps/web/Blocks.Web/src/App.tsx` changes only if execution baseline reveals a reachable legacy matrix route requiring compatibility redirect.
Delete `apps/web/Blocks.Web/src/features/admin/pages/permission-matrix-page.tsx` and adjacent test only after production references are checked; replacement matrix coverage belongs to R4.

- [ ] Implement R0-approved bounded interception for every dirty exit, including workspace-tab close and Back/Forward; native beforeunload warning for document exit. One discard decision preserves original navigation intent and executes it once.
- [ ] Test stay preserves route, active tab and both drafts; discard clears session and follows requested destination. Pending save blocks internal dismissal; browser-unload limitations remain explicit. Restore focus to initiating row action or list heading when row disappeared.
- [ ] Remove unused standalone editor. If legacy route exists, redirect to Roles with validated role target and requested tab; missing/unauthorized role must show recoverable failure, never select another role.
- [ ] Run affected admin/layout/navigation and App.lazy-routes tests. Gate: no bypass path or duplicate editor remains, no global BrowserRouter replacement slipped into scope.

### R7: Full Verification And Evidence

Update `docs/tasks/2026-08-24-system-area-refactor/execution.md`; create adjacent `review.md`. Save runtime evidence under `.hermes/runs/<run-id>/` using actual run identifier.

- [ ] Run frontend `npm test`, `npm exec tsc -- -b --pretty false`, `npm run lint`, and `npm run build`; run full backend suite and PostgreSQL transaction tests. Record exact commands/results and unrelated baseline failures.
- [ ] Verify real authenticated AppHost journey with browser-use first. If unavailable/failing, record exact reason and substitute browser tool. Mocked API tests alone cannot close runtime gate.
- [ ] Check desktop, tablet, 390px mobile and 200% zoom: no document overflow, six action columns reachable, sticky headers, dialog/footer usable, keyboard-only edits, focus trap/return, screen-reader names and dirty/error announcements.
- [ ] Exercise create/edit, both action entry points, grouped search, hidden changes, Undo, clean/combined/permission-only saves, forbidden/unsupported grants, protected/default/assigned deletion, batch atomicity, no results, loading/retry, stale requests, failed refresh and unknown save outcome.
- [ ] Review consistency with Users/Menus/System Groups; optional impeccable pass reports defects for frontend-ui-engineering to fix and rerun. Record PASS, NOT APPLICABLE or BLOCKED with exact reason and next rerun action for AppHost/browser evidence.
- [ ] Check Section 14 acceptance coverage and publish review evidence in task folder. Do not claim complete with unresolved safety/navigation/database/runtime gates; do not commit or deploy without separate request.

## Roles Coverage And Deferred Scope

| Specification | Execution coverage |
| --- | --- |
| 14.1-14.3 workflow/index/dialog | R1, R4, R5 |
| 14.4 permission matrix | R3, R4 |
| 14.5-14.6 errors/dirty/save | R2-R6 |
| 14.7 protection/deletion | R1, R2, R5 |
| 14.8 accessibility/responsiveness | R4-R7 |
| 14.9 component boundaries | R3-R6 |
| 14.10 acceptance | R7 |
| 14.11 API contract | R1-R3, R5 |
| 14.12 policy | R1, R2, R5 |
| 14.13 asynchronous/recovery/navigation | R0, R3, R5, R6 |
| 14.14 execution boundary | R0-R7 |

Deliver P0 and selected P1 in Section 14. Defer sorting, group collapse, new navigation links, usage counts, bulk permission grants, virtualization, reassignment, schema changes and shell redesign. Cross-admin same-row writes retain explicitly accepted last-write-wins ceiling; changed-row payloads reduce unrelated overwrites, not same-row conflicts. Do not add optimistic concurrency schema or claim conflict detection in this phase.
