# Blocks Workspace Shell Redesign

**Date:** 2026-09-01
**Status:** Approved design baseline
**Scope:** Sections 1-13: original shared-shell design. Section 14: approved Roles UI and System Service extension, clarified September 5, 2026.
**Artifact:** `docs/tasks/2026-08-24-system-area-refactor/workspace-shell-mockup.html:1`

## 1. Purpose

Redesign Blocks main workspace shell around a lightweight IDE model. Keep navigation hierarchy in the sidebar, represent active work in compact workspace tabs, and remove duplicated navigation chrome.

Current shell problems:

- Tabs and page chrome render as separate rows.
- Breadcrumbs duplicate sidebar hierarchy.
- Platform Overview is treated as a workspace tab even though Blocks logo already owns Home navigation.
- Service identity appears as redundant shell metadata.
- Tabs do not preserve enough horizontal space when many pages are open.

## 2. Goals

- Keep shell compact, calm, enterprise-friendly, and developer-tool appropriate.
- Use one fixed-height workspace header row.
- Make sidebar the source of hierarchy and current-page context.
- Make tabs represent only actively opened work pages.
- Support 8–15 open tabs without wrapping the header.
- Keep behavior understandable without documentation.
- Support expanded, collapsed, tablet, and mobile layouts.
- Keep page content directly below workspace header.

## 3. Non-goals

- No breadcrumbs.
- No Platform Overview workspace tab.
- No system-service badge.
- No separate page-chrome or navigation row.
- Sections 1-13 do not redesign individual page content. Section 14 explicitly authorizes the Roles page and its supporting role API changes; other page redesigns remain out of scope.
- No permanent all-tabs menu; horizontal scrolling is the first overflow strategy.
- No tab pinning in first implementation.
- No required icon on every tab.
- No card-based application redesign.

## 4. Shell Model

### 4.1 Application hierarchy

The sidebar owns application hierarchy:

```text
Quản trị định danh
  Users
  Roles
  System Groups
  Menus
```

Sidebar selection identifies the current navigation location. It does not create breadcrumbs or duplicate hierarchy in workspace chrome.

### 4.2 Home navigation

- Blocks logo is Home / Platform Overview.
- Clicking logo opens Platform Overview.
- Platform Overview is never added to workspace tabs.
- Closing the last working tab displays Platform Overview without creating an Overview tab.

### 4.3 Workspace route identity

- Each opened page is identified by its workspace route, not breadcrumb content.
- Opening an already-open route activates its existing tab.
- The same route cannot produce duplicate tabs.
- Sidebar navigation and route picker use the same route identity.

## 5. Workspace Header

### 5.1 Structure

Header contains exactly these controls, in order:

1. Sidebar collapse/expand button.
2. Workspace tab rail.
3. New-tab button.
4. AI Assistant button.

Header remains one row at all widths. No breadcrumb, page title, service label, or second navigation row appears in header.

### 5.2 Dimensions

- Height: `44px`.
- Header controls: approximately `32px` high with visible focus state.
- Sidebar expanded width: `248px`.
- Sidebar collapsed width: `64px`.
- Tab minimum width: approximately `88px` desktop; approximately `102px` for coarse-pointer devices.
- Tab maximum width: approximately `168px`.

### 5.3 Tab styling

- Text-first presentation.
- Icons optional; not required by default.
- Inactive tab: transparent surface, muted text, quiet hover surface.
- Active tab: soft filled background, stronger text, subtle bottom accent.
- Avoid heavy borders, browser-tab silhouettes, and card-like elevation.
- Long titles truncate with ellipsis.
- Unsaved state uses a small amber dot before title.
- Close control remains separate from title and has a touch-safe target.
- Inactive close control appears on desktop hover/focus.
- Close control remains discoverable on touch devices.

### 5.4 Tab behavior

- Click tab: activate route.
- Click close on active tab: remove route and activate previous tab; if unavailable, activate next tab.
- Click close on inactive tab: remove route without changing active route.
- Close final tab: display Platform Overview outside tab model.
- Existing open route selected from sidebar or picker: activate existing tab.
- New route selected from sidebar or picker: append one tab and activate it.
- No generic blank tab.
- Tab rail supports horizontal scrolling and optional left/right edge fades.
- No permanent `...` overflow button.
- Overflow strategy keeps `+` and AI controls fixed while tab rail consumes available width.

### 5.5 New-tab picker

The `+` button opens a compact route/page picker.

Picker requirements:

- Search input placeholder: `Search pages...`.
- Lists actual available workspace routes, including `Users`, `Roles`, `System Groups`, and `Menus`.
- Indicates whether route is already open.
- Selecting open route activates existing tab.
- Selecting closed route creates and activates one tab.
- Includes an overflow test action that opens a representative 8–15 tab set in mockup/test environments.
- Escape closes picker.
- Clicking outside closes picker.
- Focus moves into search when picker opens.

### 5.6 Keyboard behavior

- `Ctrl/Cmd + T`: open route picker.
- `Ctrl/Cmd + W`: close active tab.
- `Ctrl/Cmd + Tab`: activate next tab.
- `Ctrl/Cmd + Shift + Tab`: activate previous tab.
- Arrow keys move tab focus.
- `Enter` or `Space` activates focused tab.
- `Delete` closes focused tab.
- Closing a tab with unsaved state must preserve existing product confirmation behavior when production flow supports it.
- Use visible focus rings and correct tab semantics; nested close buttons must remain independently keyboard reachable.

## 6. Sidebar

### 6.1 Expanded mode

- Shows full hierarchy labels.
- Parent groups remain visually distinct from children.
- Selected parent uses quiet filled surface.
- Selected child uses stronger text, light accent background, and clear indicator.
- Nested children remain indented and aligned.
- Sidebar visual weight stays below active workspace tab.

### 6.2 Collapsed mode

- Shows logo mark only.
- Shows navigation icons only.
- Hides child list and section labels from normal layout.
- Tooltips expose full context, for example `Quản trị định danh / Users`.
- Active icon retains selected styling.
- Collapse button remains usable from workspace header.

### 6.3 Responsive behavior

- Below approximately `1180px`, sidebar auto-collapses to icon rail.
- Below approximately `820px`, sidebar becomes a sheet/overlay opened by header button.
- Mobile sidebar opens without changing workspace route or tab state.
- Clicking Blocks logo from any sidebar mode returns Home.

## 7. AI Assistant

- Desktop presentation: sparkles icon plus `AI` label.
- Narrow presentation: icon only with tooltip.
- Button exposes active state through tinted background and `aria-expanded`.
- Desktop opens a secondary right-side panel of approximately `336px`.
- Tablet/mobile opens an overlay sheet with scrim.
- Panel remains visually quieter than active page and tabs.
- Panel includes close control and page-aware assistant content.
- AI state does not alter tab state.

## 8. Page Layout

Page content begins directly below the `44px` workspace header.

Canonical structure:

```text
Users                                      + Add user
Manage accounts and access...

[ Search users... ] [ Status ] [ Role ]

[ table / main page content ]
```

Rules:

- Keep page title because it identifies content itself.
- Keep description only when it adds useful orientation.
- Place page-specific primary action in heading row unless a page-specific approved design overrides it. Roles uses the Users-aligned toolbar defined in Section 14.
- Keep search and filters close to table/form.
- Do not repeat sidebar hierarchy, breadcrumbs, service labels, or route metadata.
- Preserve vertical space for tables, forms, and operational content.
- Do not wrap page heading into another navigation/context row.

## 9. Responsive Preview States

Standalone mockup exposes four state presets:

1. **Desktop expanded:** canonical reference; full sidebar and `AI` label.
2. **Desktop collapsed:** icon-only sidebar; full-width tab rail.
3. **Tablet:** collapsed icon rail; AI icon-only; right-side overlay panel.
4. **Mobile:** sidebar sheet; AI icon-only; truncated horizontally scrolling tabs; stacked page toolbar controls.

All states must retain:

- One `44px` header row.
- No header wrapping.
- Fixed new-tab and AI controls.
- Horizontal tab handling instead of tab wrapping.
- No document-level horizontal overflow.

## 10. Accessibility Requirements

- Sidebar uses navigation landmark and meaningful labels.
- Workspace header has an accessible label.
- Tab rail uses tablist/tab semantics or an equivalent accessible page-switching pattern.
- Active tab exposes selected state.
- Every icon-only button has an accessible name and tooltip.
- Close controls name the page being closed.
- Route picker behaves as a labeled dialog with managed focus.
- AI button exposes expanded/collapsed state.
- Color is not the only selected or unsaved-state signal.
- Focus remains visible against light surfaces.
- Touch targets remain usable on coarse-pointer devices.
- Reduced-motion preferences should disable or shorten width/scroll transitions in production.

## 11. Acceptance Criteria

- Header renders as one `44px` row containing only collapse, tabs, `+`, and AI controls.
- Breadcrumb component is absent from shell output and does not determine route/tab state.
- Platform Overview is reachable through Blocks logo and never appears as a tab.
- System-service badge and duplicate navigation metadata are absent.
- Users, Roles, System Groups, Menus, and representative work routes open as tabs.
- Opening same route twice leaves tab count unchanged.
- Active and inactive tab states are visually distinct but subtle.
- Active and inactive tabs can close; closing active tab activates previous/next route as defined.
- Unsaved dot appears on representative tab.
- Long titles truncate without header wrapping.
- Overflow test reaches 8–15 tabs and tab rail scrolls horizontally.
- New-tab picker searches routes and activates existing routes without duplicates.
- Desktop AI panel, tablet/mobile AI sheet, and active button state work.
- Expanded sidebar, collapsed sidebar, tablet rail, and mobile sheet work.
- All preview states retain `44px` header and zero document-level horizontal overflow.
- Keyboard actions and visible focus states work for header controls, tabs, picker, and AI panel.

## 12. Verification Plan

Before production signoff:

- Add focused tests for route-derived tab state, duplicate prevention, close activation, Home behavior, and picker selection.
- Run affected Blocks Web tests, typecheck, lint, and production build.
- Prefer `browser-use` for user-like runtime verification when available.
- If unavailable, use Playwright with explicit fallback note.
- Verify at desktop expanded, desktop collapsed, tablet, and mobile sizes.
- Capture evidence for header height, no wrapping, tab overflow, picker, AI panel/sheet, sidebar modes, keyboard focus, and document overflow.
- AppHost/browser runtime evidence must be recorded as `PASS`, `NOT APPLICABLE`, or `BLOCKED` with exact reason and rerun action.

## 13. Deferred Decisions

- Add all-tabs menu only if usability testing shows horizontal scrolling insufficient.
- Add tab pinning only when users demonstrate recurring need for persistent pages.
- Add page icons selectively where they provide meaningful distinction without increasing visual noise.
- Define production unsaved-change confirmation behavior against existing page workflows before implementation.

## 14. Roles And Permissions Page

### 14.1 Goal And Workflow

The Roles page is a CRUD-first administration page. The permission matrix must not permanently occupy the index page.

The approved workflow is:

1. Search, filter, review, create, edit, and delete roles from the index.
2. Open one shared role dialog from either `Sửa` or `Phân quyền`.
3. `Sửa` opens the `Thông tin` tab.
4. `Phân quyền` opens the `Phân quyền` tab.
5. Create mode contains role information only. Permission editing becomes available after creation.

This remains a single Roles-page workflow and does not introduce a separate primary permission-management route.

### 14.2 Index Layout

Follow the implemented Users page visual language:

- page title and description above the data surface
- search and collapsible filters on the left
- bulk delete and `Thêm vai trò` on the right
- paginated `SystemDataTable`
- sticky table header
- loading, filtered-empty, unfiltered-empty, error, and refresh states

Approved filters:

- status: all, active, inactive
- role type: all, system, custom
- registration eligibility: all, eligible, not eligible

Filters apply before server-side pagination. The filter trigger counts active structured filters, excluding search. `Đặt lại bộ lọc` clears structured filters, resets page to 1, clears selection, and preserves search and page size. Search has a separate clear action. Search, page, page-size, and structured-filter changes clear selection; selection is page-scoped. Default filters are expanded, matching Users.

Approved columns:

- selection
- role identity
- registration eligibility
- created date
- updated date
- status
- row actions

The role identity cell contains the role name, stable key, `[Hệ thống]`, and `[Mặc định đăng ký]` badges when applicable. Do not add separate stable-key and role-type columns unless measured usage shows the combined cell is insufficient.

Row actions are `Sửa` and `Phân quyền`.

The action trigger and selection checkbox must use the role name as accessible context. UUIDs must not appear as normal or accessible row labels.

### 14.3 Create And Edit Dialog

The dialog has a fixed header, scrollable content, and fixed footer.

Edit header context includes role name, stable key, system/protected badge, and default-registration badge.

Edit mode contains `Thông tin` and `Phân quyền`. Create mode contains only `Thông tin`.

The information tab contains role name, stable key, registration eligibility, active status, and concise explanations for disabled protected/default fields.

Stable key is editable during create and read-only during edit. System, protected, privileged, and default-registration restrictions must come from explicit role metadata rather than string checks inside the form.

### 14.4 Permission Matrix

Permission groups remain visible and use `PermissionGroupModel.systemGroup`. Do not flatten permissions into one undifferentiated list.

Permission search matches permission/menu name, stable permission key, and system group. When a system group matches, all permissions in that group remain visible.

The matrix preserves the capability contract:

- `canView`
- `canAdd`
- `canUpdate`
- `canDelete`
- `canApprove`
- `canAnalyze`

Supported actions render editable checkboxes. Unsupported actions render a quiet dash and accessible explanatory text. Unsupported actions must never become editable or be submitted as granted permissions.

The table header remains sticky during vertical scrolling. The permission-name column remains sticky during horizontal scrolling. Each system group uses an accessible row-group label.

Permission names and stable keys may be displayed. `menuId` UUID values must never be used as visible fallback content.

### 14.5 Loading And Error Isolation

Opening metadata editing must not depend on permission loading.

- Open the dialog immediately.
- Load role detail and permissions through separate state paths.
- Load permissions lazily when the permission tab is first requested.
- Direct `Phân quyền` opening starts permission loading immediately.
- Permission failure does not replace or hide the Roles index.
- Permission failure does not block metadata editing.
- Permission load errors provide an in-tab retry action.
- Detail-load, permission-load, detail-save, and permission-save errors remain distinct.

### 14.6 Unsaved Changes And Save Behavior

Track separate baselines for role information and permissions.

Derived state includes information dirty state, changed permission-cell count, changed permission-row set, and combined unsaved state.

The permission tab shows `Đã đồng bộ` when clean and a concrete count such as `3 thay đổi chưa lưu` when dirty. It also provides `Hoàn tác thay đổi`.

In edit mode Save is disabled when clean, invalid, role detail is unavailable, or submission is active. A permission-load failure does not block a metadata-only save. Create mode enables Save for a valid draft without requiring an edit baseline. Field validation is shown on blur/change so a disabled button does not hide the reason. Validate again on submit.

Closing through X, Escape, overlay click, route change, or `Hủy` requires discard confirmation when unsaved changes exist. Tab switching does not discard state and requires no confirmation.

Pressing Enter in permission search must not submit the form.

Role information and permission updates must use one transactional server operation that validates and persists the final combined state. Any validation or persistence failure rolls back both metadata and permission changes.

Success and error messages describe the scopes actually saved. Do not claim permissions changed when no permission changes existed.

### 14.7 Protected Roles And Deletion

The server is authoritative for whether a role can be edited, deactivated, used for registration, or deleted.

The role list/detail contract must expose explicit protection and deletion capability metadata, including a user-readable blocked reason when relevant.

At minimum:

- protected roles cannot be deleted
- default registration role cannot be deleted, deactivated, or made registration-ineligible
- roles assigned to users cannot be deleted without an approved reassignment workflow
- privileged roles cannot become registration eligible
- registration-eligible roles cannot receive protected instance-administration permissions
- protected/system stable keys cannot change

Rows that cannot be deleted are not selectable for bulk deletion. Select-all selects only eligible visible rows.

Bulk deletion uses an `AlertDialog`, shows selected names and count, and explains impact. Known blocked rows cannot be selected; their reason is available beside the checkbox. The server revalidates the complete selected batch. If any role became blocked, reject the entire batch, keep confirmation open, show the reason, and allow refreshing eligibility. Never silently delete only part of the selection.

### 14.8 Responsive And Accessibility Requirements

Desktop remains the primary layout. Tablet and mobile preserve the same workflow rather than switching to a separate card design.

- filters stack at narrow widths
- table content scrolls horizontally inside its data surface
- no document-level horizontal overflow
- dialog header and footer remain visible
- every permission action remains reachable around `390px`
- touch targets remain usable
- status and unsaved state are not communicated by color alone
- dirty-state updates use an appropriate live region
- focus returns to the invoking row action after dialog close
- validation and server-error summaries receive focus when appropriate

### 14.9 Component Boundaries

Keep orchestration and rendering separated:

- `roles-page.tsx`: list query, filters, selection, dialog launch, and refresh
- `role-form-dialog.tsx`: dialog shell, tabs, close guard, and footer
- role-details component: metadata fields and protected-role explanations
- shared role-permission-matrix component: search, groups, capability rendering, dirty state, and retry
- pure permission-state helpers: clone, filter, diff, changed rows, and changed cells

Extend shared components only with generally reusable behavior:

- `SystemDataTable`: row label and row-selectability callbacks
- `CrudDialogFooter`: explicit save-disabled state

Retire the unused standalone `permission-matrix-page.tsx` and replace its editor tests with shared matrix tests. Local `App.tsx` has no route referencing it as inspected September 5, 2026. Before removal, recheck the execution branch. If that branch exposes `/system/identity/permissions`, preserve it as a replace-navigation redirect to Roles, forwarding a validated `roleId` to open the permission tab. Never default an invalid target to another role. Do not introduce a new standalone editor or public deep-link feature when no compatibility route exists.

### 14.10 Acceptance Criteria

- Roles index matches Users page hierarchy and operational rhythm.
- Search covers role name and stable key.
- Approved filters apply before pagination.
- Protected/default role state is visible without prose-heavy cells.
- Create mode hides permission editing.
- Edit opens on the requested tab.
- Permission groups remain visible during search and scrolling.
- Unsupported actions remain quiet, inaccessible for editing, and explained to assistive technology.
- No UUID appears as user-facing or screen-reader row identity.
- Metadata editing survives permission-load failure.
- Unsaved changes cannot be discarded accidentally.
- Clean dialog cannot submit redundant saves.
- Final role and permission state is validated atomically by the server.
- Bulk delete excludes protected roles and uses a full confirmation dialog.
- Desktop and `390px` browser journeys pass with no document-level overflow.

### 14.11 Role API Contract

Use existing response envelopes, gateway routing, and legacy `isActived` spelling. No database schema migration or new package is authorized.

- Extend role list request with optional `isActived`, `isSystem`, and `isRegistrationEligible` booleans. Omitted means all; false is a real filter. Search name and key case-insensitively before count/pagination. Use deterministic name then ID ordering. Validate page index >= 1 and page size 1-100. Existing clients without filters retain their behavior.
- Add `PUT /api/Role/save` in System Service, exposed to web as `/api/system/Role/save`.
- Request: `{ id, details?, permissions? }`. `details` contains `{ name, key, isRegistrationEligible, isActived }`. `permissions` contains changed rows with existing permission ID, target role ID, menu ID, and all six grant booleans. Reject role-ID mismatch, duplicate menu rows, missing/deleted role/menu, and unsupported grants. Capability flags are server-owned, never trusted from the request.
- Omitted or null details means leave metadata unchanged. Omitted, null, or empty permissions means leave permissions unchanged, never revoke the catalog. Revocation requires explicit false booleans on a changed row. Reject a request with no detail scope and no changed permission rows.
- Metadata-only save requires `admin.roles` UPDATE. Permission-only save requires `admin.permissions` UPDATE. Combined save requires both, checked independently through existing functional authorization; authorization service failure is fail-closed. Retain separate VIEW checks on existing read endpoints. Do not require role UPDATE for a permission-only save.
- Return canonical saved role detail with protection metadata and `savedScopes: { details: boolean, permissions: boolean }` inside existing success envelope. Scope flags indicate actual persisted changes. Never return permission contents to metadata-only callers without permission VIEW.
- Load final state from persisted metadata/permissions plus requested changes. Validate once, persist once in one transaction; no-op scopes do not update timestamps. Do not call independently committing legacy methods sequentially.
- Existing metadata update and permission update endpoints remain compatible but call the same final-state safety logic. Legacy multi-role permission requests validate every affected role and remain all-or-nothing. No legacy path may bypass registration or deletion protection.
- Serialize role mutation and deletion with user assignment and default-role assignment checks using a consistent role-lock order within transactions. Recheck non-deleted user references and active instance settings at write time. Add PostgreSQL-backed concurrency coverage; EF InMemory tests alone cannot prove rollback or race safety.
- Duplicate/validation/business errors remain in the existing API error shape with actionable messages. Do not invent a second error envelope.

### 14.12 Protection Policy

Normalize role keys with trim and case-insensitive comparison when evaluating legacy safety. `isSystem` remains a classification, not caller authorization.

| Condition | Metadata/name | Stable key | Deactivation | Registration eligibility | Delete |
| --- | --- | --- | --- | --- | --- |
| `isSystem` or legacy key `member`/`administrator` | Allowed with caller permission | Locked | Blocked in this workflow | Member only, subject to final permission safety | Blocked |
| Current default registration role | Allowed | Locked in edit UI | Blocked | Cannot turn off | Blocked |
| Non-deleted users reference role, including inactive users | Allowed | Locked in edit UI | Allowed with impact explanation unless another rule blocks it | Subject to safety | Blocked |
| Other custom role | Allowed | Locked in edit UI | Allowed | Subject to safety | Allowed |

Combine restrictions: the most restrictive rule wins. Privileged means key `administrator`, `operator`, key prefix `admin.`, or a system role other than `member`. Privileged roles cannot be registration eligible. Protected does not mean permission editing is forbidden; member permissions remain editable within registration safety constraints.

Registration safety MUST reuse `RegistrationAuthorizationSafety.IsSafePermissionKey`, currently allowing only `workspace.home`. Do not replace this allowlist with an `admin.*` blacklist. Any granted action on an active, non-deleted menu with a non-safe key makes the final role ineligible for registration. All-false permission rows do not constitute grants. Do not expand the safe-key allowlist in this task.

Expose role restrictions on list/detail: `isProtected`, `canDeactivate`, `deactivationBlockedReason`, `canChangeRegistrationEligibility`, `registrationEligibilityBlockedReason`, `canDelete`, `deleteBlockedReason`. Reasons are nullable human-readable strings. These describe domain restrictions, not actor rights; UI must intersect them with caller authorization and server must enforce both. Existing custom-role key updates remain compatible on legacy API; edit UI sends the unchanged key. Protected-key mutations are rejected server-side.

### 14.13 Asynchronous State And Save Recovery

- Each dialog opening has a new session ID and role ID. Apply load/retry responses only to that live session; close/unmount invalidates outstanding responses. Use the same latest-request rule for list search and refresh.
- Search and tab switching only change presentation; never replace the full permission draft with filtered rows. Count differences per `(menuId, action)`, excluding unsupported actions. Reverting a cell removes its difference. Undo resets permissions only; metadata draft is preserved.
- During save, freeze metadata/permission inputs and prevent duplicate submit and dialog dismissal. On confirmed success, close or reset create-and-add-more as requested; then refresh list independently. If refresh fails, say save succeeded but list could not refresh, with Retry. Do not resend a successful mutation.
- A transport failure without server acknowledgement is an unknown outcome, not proof of rollback. Keep draft, explain uncertainty, offer reload/reconciliation before retry. Do not automatically replay create requests.
- Baselines update only from confirmed save/load. Never show `Đã đồng bộ` before permission load succeeds; show loading, unavailable, or error instead.
- Validation on a hidden tab activates that tab before focusing its summary. Close restores focus to the invoking row action, or page heading if row no longer exists.
- Guard app navigation, workspace-tab close, Back/Forward, X, overlay, Escape, and Hủy through one discard decision. Browser unload uses native beforeunload warning while dirty; it cannot promise custom copy. Do not globally replace BrowserRouter without a separate scope review; prove navigation interception against current shell before implementation proceeds.
- Concurrent edits to the same permission row use last committed write; cross-admin conflict resolution is not included. Send only changed rows/scopes to avoid overwriting unrelated permissions. Safety validation is still mandatory for every write.

### 14.14 Execution Boundary

Implement P0 and the selected P1 improvements specified here: dirty-cell count/markers, permission-only Undo, changed-row submission, stable Vietnamese date/time formatting, sticky names, semantic groups, and safe deletion explanations. Usage counts, sorting, group collapsing, new deep links, bulk permission grants, and virtualization remain deferred. No reassignment UI, schema migration, shell redesign, or deployment is included.

The reference HTML is a visual reference, not functional or runtime evidence. Tests must include permission-load denial, stale responses, pending-save dismissal, metadata-only saves, unknown save outcome, refresh-after-save failure, transactional rollback, mixed protected deletion, unsupported actions, filtered dirty state, navigation guards, and 390px access to all action columns.
