---
name: blocks-ui-workflow
description: 'Use for Blocks Web frontend-facing UI/UX work in `apps/web/Blocks.Web`, including screens, layouts, dashboards, forms, tables, filters, navigation, dialogs, sheets, drawers, responsive states, accessibility, UI critique, redesign, and task specs or plans that shape frontend behavior.'
metadata:
  short-description: 'Guide Blocks Web UI work'
---

# Blocks UI Workflow

Use this repo-owned skill when working on Blocks Web UI. It turns the existing Obsidian UI workflow into an active process so agents design with taste, not just by assembling components.

## Required Reading

Before frontend-facing changes, read:

- `AGENTS.md`
- `docs/README.md`
- `docs/architecture/services/web.md`
- `agents/protocol/verification.md`
- the active `docs/tasks/YYYY-MM-DD-<slug>/` folder when one exists
- `.agent-context/generated/web-context.md` only when historical context is useful
- plugin context when the UI belongs to a plugin
- `apps/web/Blocks.Web/components.json`
- installed primitives in `apps/web/Blocks.Web/src/components/ui/`
- nearby route, layout, feature, and domain components
- `apps/web/Blocks.Web/DESIGN.md` when it exists

## Triage

Classify the request before coding:

- **L1:** small visual, copy, or layout fixes that do not introduce a new state model, interaction model, route, modal, form, dashboard, or navigation change.
- **L2:** new screens, new flows, new components, new interaction states, modals, forms, dashboards, navigation, plugin workbenches, major UX changes, or redesign work.

For L1, keep the change minimal, reuse shadcn/project components, run a focused micro user journey that reaches and exercises the changed UI, and run an experience quality spot check.

For L2, do not start production implementation until the design brief, shadcn component map, state coverage, and verification plan are clear. If the user is still brainstorming, stay in design mode and ask for approval before implementation.

## Specialist Routing

After the Blocks context read and task classification, route to at most one primary specialist by default.

- **Default implementation:** use `frontend-ui-engineering` for L1 fixes and most L2 product UI work.
- **Audit, polish, redesign:** use `impeccable` for critique, refinement, hierarchy cleanup, and redesign hardening.
- **Marketing or expressive surfaces:** use `taste-skill` for landing pages, promotional surfaces, and portfolio-like redesign slices.
- **Visual direction and concept generation:** use `ui-ux-pro-max` for early palette, typography, layout, and industry-direction exploration.

## Specialist Guardrails

- Use one primary specialist by default.
- Add one secondary specialist only when it clearly complements the primary.
- Route by phase, not by reflexively invoking every frontend skill.
- For L2 UI work, state the routing decision before implementation: primary specialist, optional secondary specialist, why this routing fits, and why the other specialists are being skipped.
- `taste-skill` is not the default for dense operational product UI, dashboards, or CRUD-heavy work surfaces.
- `ui-ux-pro-max` is not the final authority for shell UX, product interaction design, accessibility, verification, or experience-quality signoff.
- If a specialist skill conflicts with Blocks constraints, follow Blocks constraints.
- If a specialist skill is unavailable in the current runtime, keep `blocks-ui-workflow` as the authority and fall back to `frontend-ui-engineering` first when practical.

## Phase Ownership And Handoffs

Use this phase model:

- design research or system direction -> `ui-ux-pro-max` only when the design system or page direction is missing or genuinely ambiguous
- expressive visual direction -> `taste-skill` only for marketing, promotional, or intentionally brand-forward surfaces
- production implementation -> `frontend-ui-engineering` whenever code, responsive behavior, accessibility, state handling, or interaction behavior changes
- critique, hardening, and final polish -> `impeccable` after the UI works in code
- final signoff -> repo workflow gates, not a specialist skill

Required handoff outputs:

- `ui-ux-pro-max` hands off a short direction brief with the recommended visual thesis, typography, palette, layout direction, and explicit recommendation
- `taste-skill` hands off the approved art-direction slice and its trade-offs
- `frontend-ui-engineering` hands off the implementation plan and the shipped UI with states, responsive behavior, and accessibility-sensitive controls covered
- `impeccable` hands off a concrete audit result: pass, pass with UX debt, or fail, plus the blocking defects or polish items

Skip rules:

- skip `ui-ux-pro-max` when the design system is already clear and the task is ordinary product implementation
- skip `taste-skill` for dense operational screens, dashboards, CRUD-heavy surfaces, and normal workbench UI unless the brief explicitly calls for expressive visual direction
- skip `impeccable` on tiny L1 fixes unless audit or polish is part of the request
- do not invoke all four frontend specialists by default

If `impeccable`, browser verification, or the experience-quality gate finds a UI defect, ownership returns to `frontend-ui-engineering` until the issue is fixed. Then rerun the relevant audit and verification steps before claiming completion.

Browser-use verification, shell and navigation checks, and accessibility and experience-quality signoff remain repo workflow responsibilities even when a specialist skill is used.

## L2 Workflow

1. **UI Intake**
   - Identify user goal, route/surface, affected plugin or service, and current implementation.
   - Note missing context and stop for product decisions when required by `AGENTS.md`.

2. **UI Audit**
   - Inspect hierarchy, density, spacing, alignment, visual noise, copy, state coverage, responsive behavior, and accessibility risk.
   - Distinguish product intent issues from implementation polish issues.

3. **Design Brief**
   - Capture user goal, primary action, secondary actions, information hierarchy, layout strategy, component strategy, states, accessibility risks, and HUMAN_GATE decisions.

4. **shadcn Component Map**
   - Prefer installed shadcn/ui primitives.
   - Add official shadcn components only when needed.
   - Compose domain-specific components from shadcn primitives and project tokens.
   - Explain any non-shadcn UI dependency before implementation.

5. **Taste Check**
   - Use `references/blocks-taste.md` for visual direction, UI critique, redesign, or major polish.
   - The default Blocks taste is Calm Productive Workbench.

6. **Implementation Guardrails**
   - Keep scope narrow.
   - Avoid nested cards.
   - Avoid decorative surfaces that reduce scan density.
   - Avoid random colors, spacing, shadows, z-index values, and radii when tokens or local patterns exist.
   - Use lucide icons for recognizable actions and status.
   - Keep text from clipping or overlapping at desktop and mobile sizes.
   - Preserve API, service-layer, routing, and auth patterns.

7. **User Journey Verification Evidence**
   - Use `references/verification.md` before claiming UI work is complete.
   - Every UI-affecting task needs user-like browser verification.
   - Do not rely only on direct URL navigation unless there is a documented reason.
   - If normal UI navigation is broken and direct URL navigation is used for diagnosis, record the journey as FAIL.
   - Click through visible nav, plugin, account/avatar, menu, dialog, and sheet controls that are part of the story.
   - For login, shell, sidebar, menus, plugin entry points, and account controls, run the Visual Shell Gate.
   - Browser evidence must be PASS, NOT APPLICABLE, or BLOCKED with exact reason and next rerun action.

8. **Experience Quality Gate**
   - Functional pass does not equal UX pass.
   - Use `references/verification.md` and `references/blocks-taste.md` to judge whether the UI is actually usable.
   - Record Experience Quality as PASS, PASS WITH UX DEBT, or FAIL.
   - If Experience Quality is FAIL, the UI work is not complete.
   - Do not downgrade broken shell/navigation/account behavior to UX debt when it blocks a realistic user journey.

## Final Response For UI Work

Include:

- Summary
- Files Changed
- Context Used
- Testing
- Notes

For any UI-affecting work also include:

- user journey tested
- navigation method used
- whether direct URL navigation was used, and why
- user actions performed
- experience quality result
- UX debt or UX fixes made

For L2 work also include:

- shadcn components used or added
- UI states covered
- browser checks performed
- accessibility checks performed
- HUMAN_GATE decisions or remaining assumptions
