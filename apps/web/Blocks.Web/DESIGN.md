# Blocks Web Design Contract

This file gives coding agents a compact design contract for `apps/web/Blocks.Web/`.

Obsidian remains the project source of truth. Before changing frontend behavior, read:

- `docs/architecture/services/web.md`
- `agents/protocol/verification.md`
- the active task folder
- plugin context when the UI belongs to a plugin

## Product Feel

Default taste: **Calm Productive Workbench**.

Blocks Web is a platform/workbench UI for repeated operational use. It should feel quiet, scannable, dense but readable, and clear about state and next action.

Avoid marketing-page composition for internal work surfaces. Use visual polish to clarify workflow, not to decorate the page.

## shadcn First

Blocks Web uses shadcn/ui as the default component grammar.

Current setup:

- style: `radix-nova`
- base color: `neutral`
- CSS variables: enabled
- icon library: `lucide`
- UI alias: `@/components/ui`
- utility alias: `@/lib/utils`

Prefer installed primitives from `src/components/ui/`.

Installed primitives include:

- `Alert`
- `Avatar`
- `Badge`
- `Breadcrumb`
- `Button`
- `Card`
- `Checkbox`
- `Collapsible`
- `Dialog`
- `DropdownMenu`
- `Field`
- `Form`
- `Input`
- `ScrollArea`
- `Select`
- `Separator`
- `Sheet`
- `Sidebar`
- `Skeleton`
- `Table`

If a needed shadcn primitive exists but is not installed, add the official shadcn component instead of hand-writing a duplicate.

## Layout Grammar

Use stable, predictable operational layouts:

- Page header: title, concise description when useful, primary action, secondary actions.
- Filters: grouped near the data they affect, visually distinct without becoming a card stack.
- Tables: clear columns, row actions, empty state, loading state, error state, and pagination or scrolling when needed.
- Forms: labels, helper text when needed, validation messages, disabled/saving states, and stable save/cancel placement.
- Dialogs and sheets: one decision or edit flow per surface.
- Dashboards and plugin workbenches: prioritize task-relevant data over decorative summaries.

## Density And Spacing

Prefer dense but readable interfaces.

- Use spacing to reveal grouping and hierarchy.
- Avoid large empty decorative areas on operational pages.
- Keep repeated controls stable in size and position.
- Keep text readable at desktop and mobile widths.
- Avoid layouts that require excessive scrolling for simple operational tasks.

## Color, Shadow, Radius, And Motion

Use semantic color and project tokens.

- Use color for state, priority, and affordance.
- Do not introduce random one-off color palettes.
- Keep shadows restrained.
- Keep radius consistent with shadcn/project primitives.
- Use motion only when it clarifies state or transition.

## Icons

Use lucide icons for recognizable actions and statuses.

Icon-only buttons must have accessible names. Prefer icon plus text when the action is not obvious.

## Accessibility

Check:

- keyboard navigation
- visible focus states
- associated labels and validation messages
- dialog/sheet focus behavior
- icon-only button names
- status not communicated by color alone
- logical heading order
- mobile tap targets

Prefer shadcn primitives for accessibility-sensitive controls.

## Anti-Patterns

Avoid:

- marketing heroes on operational screens
- decorative gradients, glow effects, or oversized empty cards
- cards inside cards
- random Tailwind color, spacing, shadow, z-index, or radius values
- custom primitives that duplicate shadcn behavior
- low-density CRUD screens that waste vertical space
- dense screens with weak hierarchy
- clipped text, overlapping controls, and horizontal overflow
- browser-untested UI

## Verification Expectation

For every UI-affecting task, browser evidence must include user-like verification and must be recorded as `PASS`, `NOT APPLICABLE`, or `BLOCKED` with exact reason and next rerun action.

Prefer reaching the changed surface through the normal app entry point, login state, sidebar, menu, breadcrumb, account menu, plugin launcher, or link that a user would use. Do not rely only on opening the changed route by direct URL. Direct URL navigation is allowed only when the route is not reachable through current navigation, the task is explicitly about a deep-link state, or a technical state cannot be produced through normal UI actions. If direct URL navigation is used because the normal UI path is broken, the user journey result is `FAIL`; use the URL only for secondary diagnosis and explain the broken path in the final report.

For L1, run a focused micro user journey that reaches and exercises the changed UI. For L2, run a full primary user journey with real user-like actions such as click, type, select, check, tab, Enter/Escape, and dialog close actions.

Check desktop and mobile around 390px width. Verify no horizontal overflow, clipped text, or incoherent overlap. Check relevant loading, empty, error, disabled, permission, validation, long-content, and success states.

For login, authenticated shell, sidebar, menus, plugin entry points, and account/avatar controls, also run the Visual Shell Gate:

- accidental borders, rings, shadows, card outlines, or alignment issues that make the surface feel broken are UX defects
- shell height and scroll ownership must keep persistent account/avatar and navigation controls visible as intended
- visible navigation groups must route to the expected screen or reveal expected children
- visible account/avatar controls must open the expected menu or not appear interactive
- expected system and plugin navigation must be discoverable through the visible UI

## Experience Quality Gate

Functional pass does not equal UX pass. A screen can submit successfully and still fail Blocks UI standards if it behaves like a raw input form instead of a thoughtful workflow.

For every UI-affecting task, review:

- goal clarity
- primary action clarity
- input burden
- grouping and hierarchy
- progressive disclosure
- feedback quality
- recovery from errors
- scanability under repeated use
- Calm Productive Workbench taste

Record the result as `PASS`, `PASS WITH UX DEBT`, or `FAIL`. If the result is `FAIL`, the UI work is not complete even when tests, API calls, and the user journey succeed.
