# Users And Invitations Execution

**Date:** 2026-08-31
**Branch:** `codex/system-area-refactor`
**Route:** `/system/identity/users`
**Status:** Implemented with UX debt limited to real authenticated runtime verification.

## Changes

- Moved page title and description above tabs.
- Added mockup-aligned max-width and page spacing.
- Reordered toolbar: search, filters, refresh on left; bulk delete and add on right.
- Opened filters by default and styled open filter state.
- Added plus icon to `Thêm tài khoản`.
- Preserved API contracts, invitations tab, CRUD dialog, bulk-delete confirmation, table states, and pagination.

## Verification

- `npm test -- src/features/admin/pages/users-page.test.tsx`: 6 passed.
- `npm test`: 88 files, 544 tests passed.
- `npm exec tsc -- -b --pretty false`: passed.
- `npm run build`: passed; existing Vite config and chunk-size warnings remain.
- `npm run lint`: passed.
- Browser fallback: Chrome + Playwright with mocked API session; desktop 1440px and mobile 390px passed toolbar order, filter toggle, search input, and no document-level horizontal overflow.

## Runtime Boundary

- `browser-use` unavailable in environment; fallback documented in `.hermes/runs/2026-08-31-users-page-grid-toolbar/browser-check.txt`.
- Real AppHost/authenticated backend route remains blocked. Rerun browser journey with AppHost and normal login before production signoff.
