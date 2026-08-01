# Blocks UI Taste

Default taste: **Calm Productive Workbench**.

Blocks Web should feel like a serious work surface for repeated operational use: quiet, scannable, dense but readable, and clear about state and next action.

## Principles

- Prefer calm structure over decorative drama.
- Prefer scan density over marketing composition.
- Prefer consistent grammar for pages, tables, filters, forms, dialogs, and workbenches.
- Prefer semantic color over ornamental color.
- Prefer visible hierarchy through alignment, spacing, type scale, and grouping.
- Prefer shadcn primitives and project tokens over custom primitives.
- Prefer browser evidence over intuition.

## Good Blocks UI Feels Like

- The primary action is obvious without oversized hero treatment.
- The page can be scanned in repeated daily use.
- Related controls sit together and unrelated areas have enough separation.
- Tables have clear filters, row actions, empty states, loading states, and error states.
- Forms show labels, validation, disabled states, saving states, and clear cancel/save behavior.
- Dialogs and sheets focus the user on one decision or one edit flow.
- Icons reduce reading effort for common actions and statuses.
- The surface feels stable when data loads, errors, or changes.

## Anti-Patterns

- Marketing-style heroes for operational screens.
- Decorative gradients, glow effects, and oversized empty cards.
- Cards inside cards.
- Random Tailwind colors or one-off spacing values without local precedent.
- Dense panels with weak hierarchy.
- Low-density pages that force users to scroll for simple operational tasks.
- Icon-only buttons without accessible names.
- UI that only works at desktop width.
- Status communicated by color alone.
- Build-passing UI that has not been opened in a real browser.
- Login, shell, or account areas that look like static mockups instead of working product surfaces.
- Visible navigation entries that do not route or reveal expected children.
- App shells where page scroll pushes persistent account/avatar controls out of view.

## TradeLab Variant

TradeLab and analytical plugins may use a denser workbench variant with charts, split panels, toolbars, and data-heavy states. Keep that variant analytical and readable; do not let it turn the whole platform shell into a trading terminal.

## Review Questions

- Is the primary action obvious?
- Can the user understand the page in ten seconds?
- Does the visual hierarchy match the task hierarchy?
- Are repeated actions fast to find?
- Does the page preserve density without cramped text?
- Does the UI reduce avoidable input burden with defaults, presets, inferred values, or progressive disclosure?
- Are fields and controls grouped into a workflow rather than exposed as a raw list of inputs?
- Is feedback strong enough for loading, validation, saving, success, and error recovery?
- Do login, shell, sidebar, plugin navigation, and account/avatar controls behave like real product affordances?
- Can a user reach the page through visible navigation without knowing the URL?
- Are empty, loading, error, disabled, permission, long-content, desktop, and mobile states accounted for when relevant?
- Is any visual element decorative without helping the task?
- Does this screen look like part of Blocks, or like a generic generated UI?

## Experience Quality Result

- `PASS`: the UI works, the journey is usable, and the experience fits Blocks.
- `PASS WITH UX DEBT`: the UI is usable but has listed UX debt.
- `FAIL`: the UI works technically but the experience is not acceptable. Do not call the task complete.
