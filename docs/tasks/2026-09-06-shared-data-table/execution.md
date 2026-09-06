
## Shared Data Table Execution - 2026-09-06

- [x] Added shared `apps/web/Blocks.Web/src/components/data-table/data-table.tsx` and `selection-state.ts`.
- [x] Added controlled `data-table-toolbar.tsx` with page-owned filter and action slots.
- [x] Migrated Users, Roles, System Groups, Menus, and Audit Log table imports.
- [x] Migrated Users and Roles toolbar layout; preserved page-owned filters, actions, API state, dialogs, and selection rules.
- [x] Removed obsolete admin table implementation and test.
- [x] Focused table/toolbar tests: PASS, 2 files / 5 tests.
- [x] Users/Roles tests: PASS, 2 files / 24 tests.
- [x] Frontend build: PASS.
- [x] Frontend lint: PASS.
- [x] Stale table import check: PASS; no `SystemDataTable`, `SystemColumn`, or `system-data-table` references remain in `src`.
- [x] Full frontend tests: 92 test files passed, 1 unrelated existing failure in `system-overview-page.test.tsx` because fixture expiration date `2026-09-01T12:00` is past current date `2026-09-06`.
- [ ] Browser journey: BLOCKED; no browser surfaces available in current environment. Next rerun: start AppHost, authenticate, navigate through sidebar to Users and Roles, exercise search/filter/actions/selection/pagination, then check approximately 390px width.
- [ ] AppHost evidence: BLOCKED; AppHost/authenticated runtime unavailable in current environment.
