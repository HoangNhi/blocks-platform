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

## Roles Planning Checkpoint - 2026-09-05

**Status:** Approved Roles design; specification and detailed implementation plan updated. Product implementation not started by this documentation pass.

- Section 14 now specifies transactional save scopes, authorization, registration allowlist reuse, restriction reasons, batch deletion safety, assignment race coordination, asynchronous recovery and bounded navigation guard requirements.
- Plan now orders R0-R7 with file ownership, failing-test/implementation/verification loops, API and PostgreSQL gates, browser evidence and acceptance coverage.
- [ ] R0: Resolve execution baseline and navigation feasibility.
- [ ] R1: List filters and restriction metadata.
- [ ] R2: Atomic save, authorization and deletion safety.
- [ ] R3: Web contracts and permission draft helpers.
- [ ] R4: Shared controls and grouped matrix.
- [ ] R5: Roles index and single dialog.
- [ ] R6: Dirty navigation and legacy editor removal.
- [ ] R7: Full verification and evidence.

**Baseline caveat:** Git was unavailable through PATH during planning; local product sources differ from previously reviewed remote state. Historical abbreviated remote SHA `8acaf3a` is not a freshly verified execution baseline. R0 must establish exact branch, full HEAD and upstream comparison before product edits.

**Next action:** On separate execution request, start R0. Broader router changes require scope review if bounded interception cannot meet requirements.

**Evidence boundary:** AppHost/browser verification is NOT APPLICABLE to this documentation-only pass. Product tests/build were not run for this pass. Historical Users tests and mocked browser results above are not Roles evidence; R7 requires fresh authenticated runtime and relational transaction results.

### R0 Result - 2026-09-05

- [x] Git executable resolved at `C:\Users\hoang\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe`.
- [x] Branch `codex/system-area-refactor` fast-forwarded from local `a5f361c7b3fe7ff011726964495b76f33a6e919c` to upstream `8acaf3a089c634c8a10765346d5cadea49086aee`; `HEAD...origin` is `0 0`.
- [x] Existing planning edits preserved; only `spec.md`, `plan.md`, and `execution.md` remain modified before product implementation.
- [x] Frontend preflight passed: 7 files, 29 tests using focused Roles/admin/layout/navigation command.
- [x] Backend authorization preflight passed: 26 tests using `AuthorizationAdministrationTests` and `RegistrationAdminServiceTests` filter.
- [x] `permission-matrix-page.tsx` and its test have no production route/reference outside their own files; `/system/identity/roles` is sole Roles route.
- [x] React Router package exposes `useBlocker` and `useBeforeUnload`; bounded guard is feasible without global `BrowserRouter` replacement. Workspace-tab close must defer tab-state mutation until blocker confirmation; R6 owns this proof.

**R0 gate:** PASS. R1 and R3 may proceed. Product implementation remains incomplete until R2/R4-R7 gates pass.
