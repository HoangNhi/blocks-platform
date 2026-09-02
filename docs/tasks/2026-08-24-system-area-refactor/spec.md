# Blocks Workspace Shell Redesign

**Date:** 2026-09-01
**Status:** Approved design baseline
**Scope:** Shared Blocks Web application shell and workspace navigation
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
- No redesign of individual page content, tables, forms, or domain workflows.
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
- Place page-specific primary action in heading row.
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
