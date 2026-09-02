# Blocks Workspace Shell Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Blocks Web’s two-row shell chrome with a calm, route-driven, 44px IDE-like workspace header while preserving sidebar hierarchy, Home navigation, page content, and responsive behavior.

**Architecture:** Keep workspace state route-based in `workspace-tabs.ts`; derive tab metadata only from accessible navigation nodes. Render one fixed-height `WorkspaceTopChrome` containing sidebar toggle, horizontally scrollable text-first tabs, `+` route picker, and AI control. Keep Platform Overview (`/`) outside tab state, let `AppShell` own navigation/persistence, and let the sidebar logo navigate Home. Reuse installed shadcn primitives (`Dialog`, `ScrollArea`, `Tooltip`, `Sheet`, `Button`, `Input`) instead of adding dependencies.

**Tech Stack:** React 19, TypeScript, React Router 8, Tailwind CSS, shadcn/Radix primitives, Lucide icons, Vitest, Testing Library, Playwright fallback when browser-use is unavailable.

**Spec:** `docs/tasks/2026-08-24-system-area-refactor/spec.md`

## Global Constraints

- Header is exactly one `44px` row at every supported viewport; it never wraps.
- Header contains only sidebar collapse/expand, workspace tabs, `+` new-tab route picker, and AI Assistant; remove breadcrumbs, page chrome, system-service badge, and permanent `...` overflow control.
- Blocks logo navigates to `/` / Platform Overview; `/` never appears as a workspace tab and closing the final working tab returns to `/`.
- Tabs use actual route identity, never breadcrumb content; opening an existing route activates its tab and never duplicates it.
- Tabs are text-first; icons remain optional metadata and are not rendered by default for every tab.
- Active tabs use soft fill, stronger text, and subtle bottom accent; avoid browser-tab borders, heavy elevation, and card treatment.
- Tab rail remains one row and uses horizontal scrolling with edge fades where useful; `+` and AI controls stay fixed.
- Expanded sidebar is approximately `248px`; collapsed sidebar is approximately `64px`; auto-collapse below approximately `1180px`; mobile uses sheet behavior around approximately `820px`.
- AI uses desktop icon plus `AI`, icon-only at narrow widths, right-side desktop panel, and tablet/mobile overlay sheet.
- Page content starts immediately below header; preserve page heading, description, actions, filters, and existing content without adding navigation chrome.
- Preserve local-storage compatibility; do not store breadcrumb or presentation-only tab state.
- Use existing dependencies and primitives; do not add packages, pinning, all-tabs menu, or generic blank tabs.
- Preserve accessible names, visible focus, tab semantics, touch-safe close targets, reduced-motion behavior, and no document-level horizontal overflow.
- Do not modify individual page/table/form workflows except shell integration needed to keep existing content mounted.
- Do not commit or create branches; repository rules prohibit unrequested commits and branch changes.

## File Map

**Modify:**
- `apps/web/Blocks.Web/src/features/navigation/workspace-tabs.ts` — route-only workspace tab model, candidate filtering, persistence compatibility, open/close activation rules.
- `apps/web/Blocks.Web/src/features/navigation/workspace-tabs.test.ts` — pure state and serialization coverage for Home exclusion, dedupe, route opening, and close fallback.
- `apps/web/Blocks.Web/src/components/layout/workspace-top-chrome.tsx` — replace two-row tab/page chrome with one-row header, tab rail, route picker, and AI control.
- `apps/web/Blocks.Web/src/components/layout/workspace-top-chrome.test.tsx` — header rendering, picker, tab close/switch, keyboard behavior, and compact layout assertions.
- `apps/web/Blocks.Web/src/components/layout/app-shell.tsx` — remove breadcrumb derivation/prop, keep route-driven assistant context, integrate Home/tab transitions, and preserve persistence.
- `apps/web/Blocks.Web/src/components/layout/app-shell.test.tsx` — shell-level route, Home, tab, assistant, and sidebar integration assertions.
- `apps/web/Blocks.Web/src/components/layout/app-sidebar.tsx` — make Blocks logo a labeled Home link/button and tune expanded/collapsed dimensions to shell constants.
- `apps/web/Blocks.Web/src/components/layout/mobile-sidebar-sheet.tsx` — keep Blocks Home link available inside mobile navigation sheet and close the sheet after navigation.
- `apps/web/Blocks.Web/src/components/layout/app-sidebar-nav.tsx` — only focused selected-state, collapsed tooltip, and touch/readability adjustments required by the spec.
- `apps/web/Blocks.Web/src/components/layout/app-sidebar-nav.test.tsx` — expanded/collapsed navigation and logo-adjacent interaction coverage where existing tests do not cover it.
- `apps/web/Blocks.Web/src/features/assistant/assistant-drawer.tsx` — responsive desktop width and tablet/mobile sheet breakpoint/presentation without changing assistant API behavior.
- `apps/web/Blocks.Web/src/features/assistant/assistant-drawer.test.tsx` — preserve stream behavior while adding presentation attributes/classes and context expectations needed by responsive shell.

**Read-only references:**
- `apps/web/Blocks.Web/src/features/navigation/navigation-utils.ts` — route access and navigation flattening.
- `apps/web/Blocks.Web/src/features/navigation/types.ts` — `NavNode` and owner/icon metadata.
- `apps/web/Blocks.Web/src/features/navigation/sidebar-layout-state.ts` — `SidebarLayoutMode` and persisted mode helpers.
- `apps/web/Blocks.Web/src/components/ui/dialog.tsx`, `scroll-area.tsx`, `tooltip.tsx`, `sheet.tsx`, `button.tsx`, `input.tsx` — existing primitives.
- `docs/tasks/2026-08-24-system-area-refactor/workspace-shell-mockup.html` — approved visual and interaction reference.
- `agents/protocol/verification.md` and `docs/architecture/services/web.md` — required verification evidence and browser-use-first policy.

## Interfaces

The following contracts are the target interfaces shared across tasks:

```ts
export const DEFAULT_WORKSPACE_ROUTE = "/"

export type WorkspaceTab = {
  id: string
  route: string
  title: string
  owner: NavNode["owner"]
  ownerKey: string
  isDirty?: boolean
  icon?: NavNode["icon"]
}

export type WorkspaceTabsState = {
  tabs: WorkspaceTab[]
  activeRoute: string
  candidates: WorkspaceTab[]
}

type WorkspaceTopChromeProps = {
  tabs: WorkspaceTab[]
  candidates: WorkspaceTab[]
  activeRoute: string
  desktopSidebarMode: SidebarLayoutMode
  onSelectRoute: (route: string) => void
  onCloseRoute: (route: string) => void
  onOpenMobileSidebar: () => void
  onToggleDesktopSidebar: () => void
  assistantOpen: boolean
  onOpenAssistant: () => void
}
```

`WorkspaceTab.owner` and `ownerKey` remain internal route context for the assistant and future ownership-aware behavior. They must not render as a service badge or duplicate navigation label. `breadcrumb`, `pinned`, and the generated Overview tab are removed from the workspace tab contract.

## Task Decomposition

### Task 1: Lock route-only tab state with failing tests

**Files:**
- Modify: `apps/web/Blocks.Web/src/features/navigation/workspace-tabs.test.ts`
- Modify: `apps/web/Blocks.Web/src/features/navigation/workspace-tabs.ts`

**Interfaces:**
- Consumes: `NavNode[]`, `canAccessRoute`, `flattenNavigation`, `openWorkspaceTab`, `closeWorkspaceTab`, `resolveWorkspaceTabsState`, `serializeWorkspaceTabs`, `parseSerializedWorkspaceTabs`.
- Produces: route-only `WorkspaceTab`, `WorkspaceTabsState`, and existing exported helper signatures with `/` kept as Home fallback but excluded from `tabs` and `candidates`.

- [ ] **Step 1: Replace Overview-tab assertions with failing route-only assertions.**
  Add tests that assert `getWorkspaceTabCandidates(navigation)` excludes `/` and `Platform Overview`; `resolveWorkspaceTabsState({ routes: ["/", "/system/identity/users"], activeRoute: "/" })` returns `tabs` containing only Users and `activeRoute === "/"`; a direct `/plugins/tradelab` route opens as one working tab; and `openWorkspaceTab` called twice for the same route leaves one tab.

- [ ] **Step 2: Add failing close behavior tests.**
  Assert closing an active tab selects the nearest left tab, otherwise the next tab; closing an inactive tab keeps the current active route; closing the final working tab returns `tabs: []` and `activeRoute: DEFAULT_WORKSPACE_ROUTE`; and attempting to close `/` is a no-op because Home is not a tab.

- [ ] **Step 3: Add failing persistence compatibility tests.**
  Keep `SerializedWorkspaceTabs` version `1` unless implementation proves a version bump necessary. Parse stored routes containing `/`, duplicate routes, inaccessible routes, and malformed JSON; assert resolver drops `/` and duplicates while preserving valid route order. Assert serialization writes only route strings and active route, never breadcrumb/pinned presentation fields.

- [ ] **Step 4: Run focused tests and verify failure.**
  Run from `apps/web/Blocks.Web`:
  `npm test -- src/features/navigation/workspace-tabs.test.ts`
  Expected: FAIL only on new route-only expectations against current Overview/pinned/breadcrumb behavior.

- [ ] **Step 5: Implement minimal route-only model.**
  Remove `buildBreadcrumb`, `BreadcrumbItem`, `pinned`, and `breadcrumb` from `workspace-tabs.ts`; filter out `DEFAULT_WORKSPACE_ROUTE` when building candidates; remove `getDefaultWorkspaceTab`; resolve only valid non-Home routes; retain `/` only as `activeRoute` fallback; make close selection left-then-right and empty-to-Home; keep storage parser defensive and route-only.

- [ ] **Step 6: Run focused tests and inspect state invariants.**
  Run `npm test -- src/features/navigation/workspace-tabs.test.ts`. Expected: PASS. Confirm every returned `tabs` route is unique, accessible, non-`/`, and every `activeRoute` is either `/` or present in `tabs`.

### Task 2: Replace two-row chrome with one-row workspace header

**Files:**
- Modify: `apps/web/Blocks.Web/src/components/layout/workspace-top-chrome.tsx`
- Modify: `apps/web/Blocks.Web/src/components/layout/workspace-top-chrome.test.tsx`

**Interfaces:**
- Consumes: route-only `WorkspaceTab`, `WorkspaceTabsState` data, `SidebarLayoutMode`, existing `Dialog`, `ScrollArea`, `Tooltip`, `Button`, and `Input` primitives.
- Produces: `WorkspaceTopChrome` with target props from the Interfaces section; internal tablist and route picker that expose stable accessible names for shell tests.

- [ ] **Step 1: Add failing one-row structure tests.**
  Render `WorkspaceTopChrome` with Users, Roles, System Groups, and Menus tabs. Assert exactly one `tablist`; collapse control, tabs, `Open new page`, and `Open AI assistant` exist; no `Breadcrumb`, page-chrome text, service badge, or `Platform Overview` tab exists; and the header root has `h-11`/equivalent `44px` height class with no second chrome row.

- [ ] **Step 2: Add failing tab behavior tests.**
  Click inactive Users and assert `onSelectRoute("/system/identity/users")`; click active/inactive close buttons and assert `onCloseRoute(route)`; assert each close button name includes its page title; assert long titles render with truncation classes; assert unsaved example renders an amber dot with a non-color accessible label or title; assert icons are not required for text tabs.

- [ ] **Step 3: Add failing picker tests.**
  Click `Open new page`, assert labeled `Search pages...` input and actual candidates Users/Roles/System Groups/Menus. Type `roles`, assert only Roles result remains; select open Roles and assert `onSelectRoute` without duplicate creation; select closed Menus and assert route selection. Assert picker closes after selection and Escape returns focus to `Open new page`.

- [ ] **Step 4: Add failing keyboard and overflow tests.**
  Assert tab buttons expose `role="tab"`, active tab exposes `aria-selected="true"`, tablist has an accessible label, and keyboard focus is visible. Render 15 tabs, assert rail uses horizontal overflow and does not wrap; assert `+` and AI buttons remain separate from scrollable rail. Use `matchMedia`/coarse-pointer test setup or class assertions to verify close controls retain touch-safe sizing.

- [ ] **Step 5: Run focused tests and verify failure.**
  Run `npm test -- src/components/layout/workspace-top-chrome.test.tsx`. Expected: FAIL because current component renders a second page bar, breadcrumb, Overview/pinned behavior, and old quick-switcher semantics.

- [ ] **Step 6: Implement one-row header.**
  Remove breadcrumb imports and `WorkspacePageBar`. Render a `44px` flex row: collapse button at start, `min-w-0 flex-1` tab rail using `ScrollArea`/native horizontal overflow, fixed `+` button, and fixed AI button. Use text-first tab labels, optional unsaved dot, subtle active fill/bottom accent, close controls that show on desktop hover/focus but remain usable on coarse pointers, `min-w-[88px] max-w-[168px]` desktop and touch-safe minimum around `102px` where needed. Add left/right edge fades as non-interactive visual hints only; do not add `...`.

- [ ] **Step 7: Implement route picker.**
  Reuse `Dialog`, `DialogHeader`, `DialogTitle`, `Input`, and scrollable result list. Filter by candidate title and route, mark already-open routes with `Open`/selected state, call `onSelectRoute(route)` for both open and closed candidates, and close picker after selection. Do not add `/` to candidates or create generic tabs.

- [ ] **Step 8: Implement tab keyboard behavior and focus management.**
  Preserve native button activation; add ArrowLeft/ArrowRight to move focus between tab buttons, Home/End to focus first/last tab, Delete or close-button activation to request close, and Escape to close picker. Keep visible `focus-visible` rings and accessible close names. Respect `prefers-reduced-motion` by avoiding required animated scroll/width transitions.

- [ ] **Step 9: Run focused tests and inspect rendered structure.**
  Run `npm test -- src/components/layout/workspace-top-chrome.test.tsx`. Expected: PASS. Confirm no breadcrumb import/reference, no `pinned` branch, no permanent overflow menu, and one header row in source and test DOM.

### Task 3: Integrate route state and Home behavior in AppShell

**Files:**
- Modify: `apps/web/Blocks.Web/src/components/layout/app-shell.tsx`
- Modify: `apps/web/Blocks.Web/src/components/layout/app-shell.test.tsx`

**Interfaces:**
- Consumes: `resolveWorkspaceTabsState`, `openWorkspaceTab`, `closeWorkspaceTab`, `serializeWorkspaceTabs`, route navigation, `WorkspaceTopChrome` target props, and existing assistant context.
- Produces: shell behavior where `/` is Home-only, route navigation opens/activates working tabs, close transitions navigate correctly, and assistant context uses active route/tab title without breadcrumbs.

- [ ] **Step 1: Update shell tests to fail on Overview removal.**
  Change persisted-route and deep-link tests to assert no `Platform Overview` tab, Users/Strategy Lab tabs remain, and `/` renders Home content without a tab. Add a test that clicking Blocks Home returns to `/` and does not change working-tab count.

- [ ] **Step 2: Add failing route/close/assistant tests.**
  Assert sidebar navigation to Users twice produces one Users tab; closing active Strategy Lab activates Users; closing final Users navigates to `/` and leaves zero tabs; assistant context for `/system/identity/users` contains route, title, and owner key from active tab, with no breadcrumb dependency.

- [ ] **Step 3: Run focused shell tests and verify failure.**
  Run `npm test -- src/components/layout/app-shell.test.tsx`. Expected: FAIL on current Overview tab and `activeBreadcrumb` dependency.

- [ ] **Step 4: Remove breadcrumb state from AppShell.**
  Delete `buildBreadcrumb` import, `activeBreadcrumb` memo, breadcrumb prop passed to `WorkspaceTopChrome`, and breadcrumb title fallback in `assistantPageContext`. Use `activeWorkspaceTab?.title ?? "Current page"` for assistant title; keep `activeRoute` and `ownerKey` context intact.

- [ ] **Step 5: Update route transition functions.**
  Keep `selectWorkspaceRoute(route)` as the single route entry point: call `openWorkspaceTab`, persist `nextState.tabs.map(tab => tab.route)`, then navigate. Treat `/` as Home navigation without opening a tab. Keep `closeWorkspaceRoute(route)` persisting next tab routes and navigating only when `nextState.activeRoute !== activeRoute`; closing final working tab therefore navigates `/`.

- [ ] **Step 6: Pass target header props and preserve page placement.**
  Pass sidebar mode, route callbacks, assistant open state, and assistant opener to `WorkspaceTopChrome`; keep content container immediately after it. Do not add a new title/navigation row or change existing page content composition.

- [ ] **Step 7: Run focused shell tests.**
  Run `npm test -- src/components/layout/app-shell.test.tsx`. Expected: PASS. Verify local storage stores only working routes and no `/` injection is required for Home display.

### Task 4: Make sidebar logo Home and preserve hierarchy in both modes

**Files:**
- Modify: `apps/web/Blocks.Web/src/components/layout/app-sidebar.tsx`
- Modify: `apps/web/Blocks.Web/src/components/layout/mobile-sidebar-sheet.tsx`
- Modify: `apps/web/Blocks.Web/src/components/layout/app-sidebar-nav.tsx`
- Modify: `apps/web/Blocks.Web/src/components/layout/app-sidebar-nav.test.tsx`
- Modify: `apps/web/Blocks.Web/src/components/layout/app-shell.test.tsx`

**Interfaces:**
- Consumes: existing `AppSidebar` props and `onNavigate?: (route: string) => void`.
- Produces: labeled Blocks Home control invoking `onNavigate("/")`; expanded/collapsed sidebar widths of approximately `248px`/`64px`; selected navigation hierarchy and collapsed tooltips remain readable and non-competing with header tabs.

- [ ] **Step 1: Add failing logo and mode tests.**
  Render `AppSidebar` or shell in expanded and collapsed modes. Assert `Blocks` has an accessible Home link/button, activation calls `onNavigate("/")`, expanded mode exposes hierarchy labels, collapsed mode exposes icon controls with labels/tooltips, and active Users remains selected in both modes.

- [ ] **Step 2: Run focused sidebar tests and verify failure.**
  Run `npm test -- src/components/layout/app-sidebar-nav.test.tsx src/components/layout/app-shell.test.tsx`. Expected: FAIL on non-interactive logo and current width/tooltip assumptions where assertions are added.

- [ ] **Step 3: Implement clickable logo.**
  Replace the decorative logo-only `span` with a `Link` or labeled `button` using existing navigation callback. Preserve Blocks wordmark in expanded mode and provide `aria-label="Blocks home"`/tooltip in collapsed mode. Add the same labeled Home link to the mobile sheet header and close that sheet after activation. Ensure clicking Home does not create a tab through AppShell’s `/` handling.

- [ ] **Step 4: Tune sidebar dimensions and collapsed readability.**
  Change expanded width to `w-[15.5rem]` (`248px`) and collapsed width to `w-16` (`64px`); keep navigation landmark, selected state, nested indentation, collapsed child dropdowns, and tooltip labels. Remove excess decorative shadow/gradient if it competes with the light header; keep visual treatment calm and low-contrast.

- [ ] **Step 5: Run focused sidebar tests.**
  Run `npm test -- src/components/layout/app-sidebar-nav.test.tsx src/components/layout/app-shell.test.tsx`. Expected: PASS. Confirm collapsed controls remain touch-safe and expanded hierarchy remains the sole navigation context source.

### Task 5: Integrate AI Assistant responsive presentation

**Files:**
- Modify: `apps/web/Blocks.Web/src/features/assistant/assistant-drawer.tsx`
- Modify: `apps/web/Blocks.Web/src/features/assistant/assistant-drawer.test.tsx`
- Modify: `apps/web/Blocks.Web/src/components/layout/workspace-top-chrome.tsx`
- Modify: `apps/web/Blocks.Web/src/components/layout/app-shell.tsx`
- Modify: `apps/web/Blocks.Web/src/components/layout/app-shell.test.tsx`

**Interfaces:**
- Consumes: existing `AssistantDrawer` props, assistant API, `assistantOpen`, and active route context.
- Produces: AI button with icon plus `AI` on roomy desktop, icon-only presentation at narrower widths, `aria-expanded` state, desktop right-side panel around `336px`, and tablet/mobile overlay sheet without changing stream API.

- [ ] **Step 1: Add failing AI shell tests.**
  Assert AI button exposes `aria-expanded="false"`/`true`, toggles `onOpenAssistant`, shows text label in desktop-oriented render and retains accessible name when text is visually hidden at narrow widths. Assert assistant panel receives current route/title/owner context.

- [ ] **Step 2: Add failing drawer presentation tests.**
  Keep existing stream/error tests. Add assertions for desktop panel width class around `w-[336px]`, overlay/sheet semantics for narrow presentation, and labeled close control. Mock `matchMedia` consistently so tests can exercise desktop and coarse-pointer branches without changing API calls.

- [ ] **Step 3: Run focused assistant tests and verify failure.**
  Run `npm test -- src/features/assistant/assistant-drawer.test.tsx src/components/layout/app-shell.test.tsx`. Expected: FAIL only on new presentation/state assertions.

- [ ] **Step 4: Implement secondary AI control.**
  Render Lucide Sparkles icon with `AI` text that can be hidden via responsive utility classes while preserving accessible name. Use active/open styling no stronger than the active tab accent; set `aria-expanded`; keep control fixed after `+` and outside scroll rail.

- [ ] **Step 5: Implement responsive drawer sizing.**
  Keep desktop right drawer approximately `336px`; use existing `Sheet` for tablet/mobile overlay at the agreed breakpoint around `820px`. Ensure close, focus return, and Escape remain handled by primitives; do not add a second assistant implementation or modify streaming logic.

- [ ] **Step 6: Run focused assistant tests.**
  Run `npm test -- src/features/assistant/assistant-drawer.test.tsx src/components/layout/app-shell.test.tsx`. Expected: PASS.

### Task 6: Add responsive shell and accessibility regression coverage

**Files:**
- Modify: `apps/web/Blocks.Web/src/components/layout/workspace-top-chrome.test.tsx`
- Modify: `apps/web/Blocks.Web/src/components/layout/app-shell.test.tsx`
- Modify: `apps/web/Blocks.Web/src/components/layout/app-sidebar-nav.test.tsx`
- Modify: `apps/web/Blocks.Web/src/features/assistant/assistant-drawer.test.tsx`

**Interfaces:**
- Consumes: completed route model and shell components.
- Produces: regression coverage for desktop expanded, desktop collapsed, tablet, mobile, overflow, keyboard, focus, touch, and reduced-motion requirements.

- [ ] **Step 1: Add failing responsive assertions.**
  Assert component class/data-state contracts represent desktop expanded (`248px` sidebar), desktop collapsed (`64px` sidebar), tablet collapsed rail with overlay AI, and mobile sidebar sheet. Assert header height remains `44px`, header has no wrapping class, tab rail has horizontal overflow, and document-level horizontal overflow is not introduced by shell markup.

- [ ] **Step 2: Add failing accessibility assertions.**
  Assert navigation landmark and labels, tablist/tab selected state, named close buttons, named icon-only controls, route-picker dialog title/input, AI `aria-expanded`, visible focus classes, and non-color unsaved indicator label. Assert touch close controls meet the project’s practical `size-6`/coarse-pointer sizing contract.

- [ ] **Step 3: Add failing interaction sequence for 8–15 tabs.**
  Open or seed 15 valid routes, switch to middle and final tabs, close inactive and active tabs, and assert previous/next activation plus continued horizontal rail behavior without duplicate routes.

- [ ] **Step 4: Run all affected tests and verify failure.**
  Run `npm test -- src/features/navigation/workspace-tabs.test.ts src/components/layout/workspace-top-chrome.test.tsx src/components/layout/app-shell.test.tsx src/components/layout/app-sidebar-nav.test.tsx src/features/assistant/assistant-drawer.test.tsx`. Expected: FAIL until responsive and accessibility contracts are implemented.

- [ ] **Step 5: Implement only missing testable contracts.**
  Add stable `aria-*`, data-state, responsive utility classes, and bounded overflow styles where needed. Do not add production-only test hooks unless existing accessible roles/names/classes cannot express the requirement.

- [ ] **Step 6: Run all affected tests.**
  Run the same focused command. Expected: PASS with no unrelated test edits.

### Task 7: Run project validation and browser evidence

**Files:**
- Review: all files listed above plus `docs/tasks/2026-08-24-system-area-refactor/spec.md` and `docs/tasks/2026-08-24-system-area-refactor/workspace-shell-mockup.html`.
- Evidence: record verified results in the existing `.hermes/runs/` workflow location when required; never create fake telemetry or invent an evidence filename.

**Interfaces:**
- Consumes: completed shell implementation and focused tests.
- Produces: verified build/lint/test output and browser evidence with explicit `PASS`, `NOT APPLICABLE`, or `BLOCKED` status.

- [ ] **Step 1: Run affected unit/component tests.**
  From `apps/web/Blocks.Web`, run:
  `npm test -- src/features/navigation/workspace-tabs.test.ts src/components/layout/workspace-top-chrome.test.tsx src/components/layout/app-shell.test.tsx src/components/layout/app-sidebar-nav.test.tsx src/features/assistant/assistant-drawer.test.tsx`
  Expected: PASS.

- [ ] **Step 2: Run typecheck/build.**
  Run `npm run build` from `apps/web/Blocks.Web`. Expected: TypeScript and Vite production build PASS.

- [ ] **Step 3: Run lint.**
  Run `npm run lint` from `apps/web/Blocks.Web`. Expected: ESLint PASS. Fix only shell-related findings introduced by this work.

- [ ] **Step 4: Run browser verification using browser-use first.**
  Start the approved Blocks Web runtime using the repository’s documented command. Exercise: Home logo, expanded/collapsed sidebar, Users/Roles/System Groups/Menus navigation, tab switching, active/inactive close, final-tab Home fallback, `+` picker search/dedupe, 15-tab horizontal scroll, AI desktop panel, AI tablet/mobile sheet, and keyboard focus. Capture desktop expanded, desktop collapsed, tablet, and mobile evidence.

- [ ] **Step 5: Use Playwright only as explicit fallback.**
  If browser-use is unavailable or fails, record exactly: `Reason browser-use unavailable/failed`, `Fallback tool used: Playwright`, affected route/flow, and next rerun action. Do not treat unit tests/build alone as runtime evidence when shell behavior requires browser state.

- [ ] **Step 6: Check visual and structural acceptance.**
  Confirm `44px` header, one row/no wrapping, no breadcrumb, no Overview tab, no service badge, no permanent `...`, no page-chrome row, no document horizontal overflow, stable fixed controls, calm active state, collapsed-sidebar tooltips, and responsive AI presentation.

- [ ] **Step 7: Run final diff and placeholder checks.**
  Run `git diff --check`; run `rg -n "breadcrumb|Platform Overview.*tab|system-service|\.\.\." apps/web/Blocks.Web/src/components/layout apps/web/Blocks.Web/src/features/navigation apps/web/Blocks.Web/src/features/assistant` and inspect matches manually so legitimate route/content references are not removed accidentally. Do not commit.

## Acceptance Coverage Matrix

- One `44px` header with only collapse, tabs, `+`, AI: Task 2, Task 6, Task 7.
- No breadcrumbs or page chrome: Tasks 2–3, Task 7.
- Home logo and no Overview tab: Tasks 1, 3, 4, Task 7.
- Route identity, dedupe, persistence: Task 1, Task 3.
- Active/inactive tabs, close fallback, unsaved dot, truncation: Tasks 1–2, Task 6.
- 8–15 tab horizontal overflow without wrapping: Tasks 2, 6–7.
- Route picker search and existing-route activation: Task 2, Task 6–7.
- Sidebar hierarchy, selected state, collapsed tooltips: Task 4, Task 6–7.
- AI button state and desktop/tablet/mobile presentation: Task 5, Task 6–7.
- Page content directly below header, no page redesign: Task 3, Task 7.
- Keyboard, focus, touch, reduced motion, no document overflow: Tasks 2, 5–7.
- No dependencies, pinning, all-tabs menu, or decorative card redesign: Global Constraints and Tasks 2/6.

## Self-Review Before Handoff

- [x] Spec sections 1–3 map to Global Constraints, Tasks 1–3, and Task 7.
- [x] Spec sections 4–5 map to Tasks 1–4 and acceptance coverage.
- [x] Spec sections 6–8 map to Tasks 2, 4, and 5.
- [x] Spec sections 9–10 map to Tasks 5–7 and responsive/accessibility tests.
- [x] Spec sections 11–12 map to the acceptance matrix and Task 7 evidence.
- [x] Spec deferred decisions remain deferred: no all-tabs menu, pinning, or required per-tab icons.
- [x] Placeholder scan completed: no `TBD`, `TODO`, “implement later”, or “write tests for above” instructions.
- [x] Interface names and props are consistent across all tasks.
- [x] Repository rule honored: plan only; no production code, commit, or branch change.

## Execution Record

- Executed inline with `superpowers:executing-plans` on `codex/system-area-refactor`.
- Implemented route-only tabs, single-row chrome, responsive sidebar, Home navigation, and responsive AI presentation.
- Focused shell tests, build, lint, browser checks, diff check, and placeholder review completed.
- Full frontend suite has one unrelated invitation-expiry failure; see `.hermes/runs/2026-09-01-workspace-shell-redesign-execution.txt`.
