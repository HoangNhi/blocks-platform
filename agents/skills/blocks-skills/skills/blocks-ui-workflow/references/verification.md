# Blocks UI Verification

Use this checklist before claiming Blocks Web UI work is complete.

## Command Verification

Run the narrowest useful commands first, then broaden when the change touches shared UI:

- `npm run lint`
- `npm run test`
- `npm run build`
- route-specific Playwright smoke tests when available

Run commands from:

- `apps/web/Blocks.Web`

## User Journey Evidence

For every UI-affecting task, verify the real rendered UI through user-like browser actions.

Definitions:

- **User story:** the user's goal and reason for the change.
- **User journey:** the real UI path the user takes to complete that goal.
- **User journey verification:** the browser check that follows that path through user-like actions.
- **Visual shell verification:** the browser check that confirms login, app chrome, sidebar, menu, plugin entry points, account/avatar, height, and scroll behavior support the journey.

Rules:

- L1 requires a focused micro journey that reaches and exercises the changed UI.
- L2 requires a full primary user journey.
- Prefer starting from the normal app entry point, login state, dashboard, sidebar, menu, breadcrumb, or link that a user would use.
- Do not rely only on opening the changed route by direct URL.
- Direct URL navigation is allowed only when the route is not reachable through current navigation, the task is explicitly about a deep-link state, or a technical state cannot be produced through normal UI actions.
- If direct URL navigation is used because normal UI navigation is broken, record the journey as `FAIL`, explain the broken path, then use the URL only for secondary diagnosis.
- Use semantic user actions such as click, type, fill, select, check, tab, press Enter/Escape, and dialog close actions.
- Use mouse movement, hover, drag, or coordinate-level actions when the UX depends on hover, drag/drop, chart interaction, canvas interaction, context menus, or pointer positioning.

Required checks:

- journey starts from the closest practical user entry point
- changed surface is reached through real navigation when practical
- primary affected action is performed
- visible sidebar, top navigation, plugin launcher, account/avatar, menus, dropdowns, dialogs, and sheets involved in the story are clicked or keyboard-tested
- visible navigation groups either route to an expected screen or reveal expected children
- visible account/avatar controls open the expected account menu or do not appear interactive
- authenticated shell owns the viewport height when it is intended to be full-height; persistent shell controls are not pushed below the visible viewport by page scroll
- content pane and shell pane have clear scroll ownership
- desktop layout
- mobile layout around 390px width
- no horizontal overflow
- no clipped text
- no incoherent overlap
- no accidental borders, rings, shadows, card outlines, or alignment issues that make the surface feel broken
- primary action is visible
- loading, empty, and error states when practical
- success, validation, disabled, and permission states when practical
- long content when practical

Record browser evidence as:

- `PASS`: checked and acceptable
- `NOT APPLICABLE`: explain why the check does not apply
- `BLOCKED`: explain the exact blocker and next rerun action

## Visual Shell Gate

Run this gate for login, authenticated shell, sidebar, menus, plugin entry points, account/avatar controls, and any page inside the app shell.

The gate fails when:

- login or shell surfaces show accidental rings, borders, card outlines, shadows, or spacing that undermine trust
- shell height exceeds the viewport and pushes persistent controls such as account/avatar below the visible screen
- page scroll and content scroll ownership are unclear
- a visible account/avatar affordance does not open a menu, dialog, or route when clicked
- expected system, platform, or plugin navigation is missing from the visible nav model
- a visible nav group only changes active styling when a user would expect navigation or child items
- a plugin entry cannot be reached from visible UI even though the route exists
- desktop or 390px mobile layouts hide, clip, overlap, or visually orphan primary controls

If this gate fails, record `Experience Quality = FAIL` unless the task explicitly scoped the broken shell behavior out and the final report lists it as a release blocker.

## Accessibility Evidence

Check:

- keyboard navigation
- visible focus states
- form labels and validation messages
- icon-only button accessible names
- dialog, sheet, drawer focus behavior
- status not communicated by color alone
- logical heading order
- usable mobile tap targets

Use shadcn primitives for accessibility-sensitive controls such as dialogs, sheets, dropdowns, selects, tooltips, fields, and forms.

## Experience Quality Evidence

Functional pass does not equal UX pass. A UI can submit successfully and still fail if it feels like a raw database form instead of a usable Blocks workflow.

Review every UI-affecting task for:

- **Goal clarity:** the user can tell what the screen is for and what outcome they are working toward.
- **Primary action clarity:** the main action is obvious, well placed, and not competing with secondary actions.
- **Input burden:** the UI does not ask for avoidable manual input; defaults, presets, inferred values, or progressive disclosure are used when appropriate.
- **Grouping and hierarchy:** related fields, controls, tables, and panels are grouped by meaning and priority.
- **Progressive disclosure:** advanced, risky, or rarely used controls are not exposed too early unless the task requires them.
- **Feedback quality:** loading, validation, success, error, saving, and disabled states explain what is happening and what the user can do next.
- **Recovery:** errors are actionable and do not strand the user.
- **Scanability:** repeated-use screens can be scanned quickly without reading every label top-to-bottom.
- **Blocks taste:** the UI follows Calm Productive Workbench and avoids generic generated UI.
- **Shell trust:** app chrome, navigation, and account controls behave like a coherent product, not a static mock.
- **Journey continuity:** the user can move from entry point to target screen and back without hidden URLs, dead nav items, or unclear active states.

Record the result as:

- `PASS`: functional behavior, journey, and experience quality are acceptable.
- `PASS WITH UX DEBT`: the UI is usable and shippable, but known UX debt remains and must be listed.
- `FAIL`: the UI works technically but has UX friction severe enough that the task is not complete.

If Experience Quality is `FAIL`, fix the UX issue before final delivery. For audit-only tasks, report the failure clearly and do not downgrade it to `PASS WITH UX DEBT`.

## Final Report Additions For UI Work

Include:

- user story or user goal
- user journey tested
- navigation method used
- whether direct URL navigation was used, and why
- user actions performed
- experience quality result
- UX debt or UX fixes made
- browser checks performed
- accessibility checks performed
- skipped checks with exact reason

For L2 also include:

- shadcn components used or added
- UI states covered
- HUMAN_GATE decisions or remaining assumptions
