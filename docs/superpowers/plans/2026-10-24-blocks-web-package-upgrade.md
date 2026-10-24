# Blocks.Web Package Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Blocks.Web to the approved Phase 2 version matrix while preserving active features and verifying actual dependency, security, and browser results.

**Architecture:** Upgrade packages in sequential, independently verified groups because every group owns the same manifest and lockfile. Replace the Rolldown preview alias with official Vite, translate DayPicker internals without changing DatePicker callers, and use TanStack Table's official legacy adapter with mechanical type-import changes. Characterize current behavior first; retain authentication, server pagination, permissions, and avatar flows.

**Tech Stack:** Node.js 24 LTS, npm 11, React 19, TypeScript 6.0.3, Vite 8, Vitest 5, Tailwind CSS 4, TanStack Query 5, TanStack Table 9 legacy adapter, DayPicker 10, Express 5.

**Spec:** `docs/superpowers/specs/2026-10-24-blocks-web-package-upgrade-design.md`

## Global Constraints

- Application changes: `src/apps/Blocks.Web` only. Plan/spec approval metadata are documentation exceptions, not permission to edit backend, Aspire, databases, or machine configuration.
- Execute under Node.js 24 LTS and npm 11. Spec observations: Node `v24.20.0`, npm `11.19.0`; capture actual execution versions.
- Use exact manifest ranges in the matrix below. Resolve compatible stable versions into the existing lockfile; never hand-edit lock resolutions or delete the lockfile.
- Keep TypeScript `~6.0.3`, ESLint `^9.39.2`, jsdom `^28.1.0`, and `@testing-library/jest-dom` `^6.9.1`. These are approved compatibility choices, not claims of registry-wide latest versions.
- No `--force`, `--legacy-peer-deps`, unreviewed `npm audit fix`, new UI frameworks, or new dependency overrides.
- Preserve `VITE_DEV_PORT`, default `3000`, AppHost override `5173`, `host: true`, `@/` alias, and existing npm scripts.
- Preserve Express 5 `app.get('/{*splat}', ...)`, static assets, and client-side deep links.
- Preserve `{ Success, StatusCode, Data, Message }`, token refresh, permission checks, form validation, avatar upload staging/retry, and Vietnamese UI/accessibility.
- Do not restore obsolete Business/Collab screens, retired Catalog features, mockups, viewers, or dependencies.
- Previous observations: 15 test files / 73 tests and 10 lint warnings. Capture fresh baseline; preserve every existing test, track warning locations/rules, and introduce no new warnings.
- No real database CRUD or real file uploads. Browser fixtures must isolate auth/API requests; never persist credentials or real tokens in evidence.
- Commits below are later execution checkpoints, not instructions to commit now. Stage exact task-owned files; never use `git add .`.

## Review Focus

1. DatePicker becomes disabled while open or reaches first/last permitted year: close safely, preserve required-selection rules, and keep navigation inside bounds. Tests: Task 1, re-run Task 4.
2. Query-backed combobox opens before data resolves or uses `enabled=false`: reflect loading/empty/options, avoid disabled fetches, filter by text, and preserve selection callback values. Tests: Task 1, re-run Task 3.
3. Table data refreshes/reorders with stable IDs or changes server page: keep controlled selection keyed by ID, preserve partial select-all, and never slice server data again. Tests: Task 1, re-run Task 5.
4. Protected requests receive application-level 401 inside HTTP 200 simultaneously: refresh once, retry with new token, preserve denial behavior and abort signals. Tests: Task 1 API characterization, re-run Task 3.
5. Production browser opens a deep link directly: serve SPA HTML, load referenced JS/CSS as assets rather than HTML, and render Not Found for retired paths after client boot. Tests: Task 3 server check, Task 6 browser matrix.

---

## Execution Order And File Ownership

All paths are repository-relative. Execute Tasks 1-6 in order. Independent Task 1 test files may be delegated concurrently; never overlap installs, lockfile edits, shared build output, or server ports. Main agent owns integration and final gates.

| Owner | Files and responsibility |
| --- | --- |
| Task 1 | Create `src/apps/Blocks.Web/src/components/ui/datepicker.test.tsx`, `src/apps/Blocks.Web/src/components/ui/calendar.test.tsx`, `src/apps/Blocks.Web/src/components/ui/combobox.test.tsx`, `src/apps/Blocks.Web/src/components/ui/data-table.test.tsx`; extend `src/apps/Blocks.Web/src/lib/api.test.ts`: characterization. Create `src/apps/Blocks.Web/upgrade-verification.md`: baseline and later evidence. |
| Tasks 2-5, sequential | Modify `src/apps/Blocks.Web/package.json`; regenerate `src/apps/Blocks.Web/package-lock.json` through npm only. |
| Task 2 | Modify `src/apps/Blocks.Web/src/ObsoleteFeatures.test.ts`, `tsconfig.app.json`; modify `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `src/test/setup.ts` only for demonstrated compatibility failures. Create `src/apps/Blocks.Web/src/PackageUpgrade.test.ts`. |
| Task 3 | Create `src/apps/Blocks.Web/test/server.check.mjs`. Existing auth/API/avatar/form suites are verification targets, not permission to rewrite contracts. |
| Task 4 | Modify `src/apps/Blocks.Web/src/components/ui/datepicker.tsx`, `calendar.tsx`, and their Task 1 tests only as required by actual library APIs. |
| Task 5 | Modify `src/apps/Blocks.Web/src/components/ui/data-table.tsx`; mechanical type imports in exact consumers listed in Task 5. Update table tests to use legacy types. |
| Task 6 | Finalize `src/apps/Blocks.Web/upgrade-verification.md`; no new production scope. Findings return to their owning task before final verification repeats. |

### Approved Package Matrix And Checkpoint Owner

Copy ranges exactly. Unchanged entries are intentionally retained and still checked at completion. Counts: 41 runtime, 18 development.

| Runtime package | Target range | Owner |
| --- | --- | --- |
| `@hookform/resolvers` | `^6.0.0` | 3 |
| `@radix-ui/react-accordion` | `^1.3.1` | 3 |
| `@radix-ui/react-avatar` | `^1.3.1` | 3 |
| `@radix-ui/react-checkbox` | `^1.4.1` | 3 |
| `@radix-ui/react-collapsible` | `^1.2.1` | 3 |
| `@radix-ui/react-dialog` | `^1.3.1` | 3 |
| `@radix-ui/react-dropdown-menu` | `^2.2.1` | 3 |
| `@radix-ui/react-label` | `^2.1.17` | 3 |
| `@radix-ui/react-popover` | `^1.3.1` | 3 |
| `@radix-ui/react-progress` | `^1.2.1` | 3 |
| `@radix-ui/react-radio-group` | `^1.5.1` | 3 |
| `@radix-ui/react-scroll-area` | `^1.4.0` | 3 |
| `@radix-ui/react-select` | `^2.4.1` | 3 |
| `@radix-ui/react-separator` | `^1.2.0` | 3 |
| `@radix-ui/react-slot` | `^1.5.0` | 3 |
| `@radix-ui/react-tabs` | `^1.2.1` | 3 |
| `@radix-ui/react-tooltip` | `^1.4.1` | 3 |
| `@tailwindcss/vite` | `^4.3.3` | 2 |
| `@tanstack/react-query` | `^5.104.5` | 3 |
| `@tanstack/react-table` | `^9.3.1` | 5 |
| `axios` | `^1.20.0` | 3 |
| `class-variance-authority` | `^0.7.1` | Retain |
| `clsx` | `^2.1.1` | Retain |
| `cmdk` | `^1.1.1` | Retain |
| `date-fns` | `^4.4.0` | 3 |
| `express` | `^5.3.0` | 3 |
| `js-cookie` | `^3.0.8` | 3 |
| `jwt-decode` | `^4.0.0` | Retain |
| `lucide-react` | `^1.61.0` | 3 |
| `next-themes` | `^0.4.6` | Retain |
| `radix-ui` | `^1.8.1` | 3 |
| `react` | `^19.3.1` | 3 |
| `react-day-picker` | `^10.0.2` | 4 |
| `react-dom` | `^19.3.1` | 3 |
| `react-hook-form` | `^7.91.0` | 3 |
| `react-router-dom` | `^7.18.4` | 3 |
| `sonner` | `^2.0.8` | 3 |
| `tailwind-merge` | `^3.7.0` | 3 |
| `tailwindcss` | `^4.3.3` | 2 |
| `uuid` | `^14.0.3` | 3 |
| `zod` | `^4.6.7` | 3 |

| Development package | Target range | Owner |
| --- | --- | --- |
| `@eslint/js` | `^9.39.2` | 2 |
| `@testing-library/jest-dom` | `^6.9.1` | Retain |
| `@testing-library/react` | `^16.3.3` | 2 |
| `@types/js-cookie` | `^3.0.6` | Retain |
| `@types/node` | `^24.19.2` | 2 |
| `@types/react` | `^19.3.0` | 3 |
| `@types/react-dom` | `^19.3.0` | 3 |
| `@vitejs/plugin-react` | `^6.1.2` | 2 |
| `eslint` | `^9.39.2` | Retain |
| `eslint-plugin-react-hooks` | `^7.1.1` | 2 |
| `eslint-plugin-react-refresh` | `^0.5.7` | 2 |
| `globals` | `^17.13.0` | 2 |
| `jsdom` | `^28.1.0` | Retain |
| `tw-animate-css` | `^1.4.0` | Retain |
| `typescript` | `~6.0.3` | 2 |
| `typescript-eslint` | `^8.72.0` | 2 |
| `vite` | `^8.3.5` | 2 |
| `vitest` | `^5.0.5` | 2 |

### Implementation Clarifications To The Approved Spec

- Table migration preserves schemas/behavior, not necessarily old root type exports. Inspect installed `/legacy` declarations; use `LegacyColumnDef` and `LegacyRow` where required, optionally aliased to local names. Do not hide incompatibility with casts or native Table 9 rewrites.
- Normal npm lock entries may omit `name`. Verify root Vite range, locked major, absence of alias, and installed `vite/package.json` name instead of requiring optional lock metadata.
- Keep DatePicker public `fromYear?: number` / `toYear?: number`, defaults `1900` / `2100`; change only forwarded DayPicker navigation props.
- Remove TS6-deprecated `baseUrl` while preserving relative `paths`, strictness, and module resolution; no `ignoreDeprecations` suppression.
- Preserve mock isolation. Do not automatically set `clearMocks: false`; prefer per-test setup. Any explicit override requires evidence and documented reason.
- Source has six list screens: User, Faculty, SystemGroup, Menu, Role, AuditLog. Spec's count of seven is not permission to add a screen.
- Audit success requires actual lockfile evidence. No guaranteed advisory counts or claim that all transitive issues disappear.

### Common Green Gate

After each dependency group run:

```powershell
npm --prefix src/apps/Blocks.Web ls --all
npm --prefix src/apps/Blocks.Web run build
npm --prefix src/apps/Blocks.Web run lint
npm --prefix src/apps/Blocks.Web test
```

Expected: all exit 0; no invalid peers, lost tests, weakened assertions, new warnings, or broad lint disables. Record actual versions/results in `upgrade-verification.md`. If actual peer constraints require two groups together, record evidence and merge that checkpoint's changes/tests atomically; never leave a broken checkpoint.

---

### Task 1: Capture Baseline And Pin High-Risk Behavior

**Files:** Four new component test files, `src/lib/api.test.ts`, and `upgrade-verification.md` from the ownership map. No production/package changes.

**Interfaces:**
- `DatePicker({ value, onChange, optionLabel?, required?, disabled?, fromYear?, toYear? })`: `value: Date | undefined`, `onChange: (date: Date | undefined) => void`; `Calendar` forwards DayPicker props.
- `Combobox({ options?, loading?, value?, onValueChange, disabled?, readonly?, fetchOptions?, eagerLoading? })`; callback `(value: string, text?: string) => void`. `ModelCombobox` has optional `Value`/`Text`.
- `useComboboxQuery(queryKey: string[], queryFn: () => Promise<ApiResponse<ModelCombobox[]>>, enabled = true)` returns `{ options, isLoading, isError, error }`.
- `DataTable<TData,TValue>` keeps columns/data, controlled selection, custom `getRowId`, `meta`, and external page request `{PageIndex:number,PageSize:number,TextSearch:string|null}`.

- [x] **Step 1: Capture fresh baseline.** Check `git status --short`, read AGENTS.md/spec, record HEAD and Node/npm versions. Run `npm --prefix src/apps/Blocks.Web ci`, then build/lint/test and `audit --json` / `audit --omit=dev --json`. Record command exit codes, test counts/names, warning rule/locations and advisory paths; audit may exit nonzero. No secrets/private API data in evidence.
- [x] **Step 2: Check target availability without upgrading.** For each matrix entry query `npm view '<package>@<version-without-range>' version engines peerDependencies --json`. Record missing versions or incompatible peers; return evidence for spec decision if unresolvable. Never invent a substitute version or bypass resolution.
- [x] **Step 3: Add real DatePicker/Calendar characterization.** Freeze Date only at local `new Date(2026,9,24,12)` and restore after each test; keep timers real for UI waits. No DayPicker mock. If jsdom lacks ResizeObserver/scroll/pointer APIs, add only necessary test-local shims; centralize in `src/apps/Blocks.Web/src/test/setup.ts` only when reused. This is test support, not a production behavior fix.

| Test | Setup and assertions |
| --- | --- |
| `formats_controlled_date_and_emits_selected_local_date` | Value Oct 24 displays `24/10/2026`; open, choose Oct 25; `expect(onChange).toHaveBeenCalledTimes(1)`; emitted local year/month/day equal `[2026,9,25]`; calendar closes. |
| `preserves_default_and_custom_year_bounds` | Parameterize `[1900,2100]` / `[2020,2030]`; year options `expect(optionYears).toEqual(Array.from({length:max-min+1},(_,i)=>min+i))`; navigate to first January/last December; Previous/Next disabled at corresponding boundary. |
| `required_selection_cannot_clear_and_disabled_closes_open_popover` | Re-select current date with `required=true`; callback never emits `undefined`. Rerender open picker disabled, assert trigger disabled/calendar absent; attempted disabled interaction never calls callback. |
| `renders_vietnamese_caption_keyboard_navigation_and_selection` | `calendar.test.tsx`: render October 2026 with dropdown caption/default locale; `expect(normalizedMonthText).toMatch(/thg\.?\s*10/i)`; ArrowRight on focused Oct 24 focuses Oct 25; activate focused day and assert local Oct 25 emitted/selected semantics. Browser smoke separately verifies native Enter activation. |

- [x] **Step 4: Add combobox query integration.** Use real Radix/cmdk and fresh `QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}})` per case. Harness calls actual `useComboboxQuery` and passes options/loading into Combobox; clear client after test.

| Test | Setup and assertions |
| --- | --- |
| `filters_by_text_and_selects_value_and_text` | Options `{Value:"it",Text:"Faculty IT"}`, `{Value:"econ",Text:"Faculty Economics"}`; search `FACULTY IT`, only IT remains; `expect(onValueChange).toHaveBeenCalledWith("it","Faculty IT")`; popup closes. |
| `normalized_selected_value_can_be_cleared` | Value `" IT "`; click matching IT option; `expect(onValueChange).toHaveBeenCalledWith("","")`. Scope queries to options, not duplicate trigger text. |
| `query_loading_resolves_into_options_without_refetch_on_reopen` | Deferred envelope `{Success:true,StatusCode:200,Data:[{Value:"it",Text:"Faculty IT"}],Message:""}`; open before resolve, loading then option; reopen, `expect(queryFn).toHaveBeenCalledTimes(1)`. Freshness setting is test-local, not production. |
| `disabled_query_and_readonly_control_do_not_request_or_select` | `enabled=false`: `expect(queryFn).not.toHaveBeenCalled()`; separate readonly/disabled control cases cannot open or select. Do not conflate readonly with query disabling. |
| `failed_query_yields_empty_options_without_selecting` | Reject query with `new Error("fixture failure")`; wait for `isError=true`, `expect(options).toEqual([])` and no selection callback. |

- [x] **Step 5: Add real DataTable regression.** Use actual Faculty `getColumns(showPopupDetail,deleteList)`, rows `{Id:"faculty-a",Name:"Faculty A"}` / `{Id:"faculty-b",Name:"Faculty B"}`. Controlled harness uses selection state and `getRowId={(row)=>row.Id}`; no mocked TanStack core.

| Test | Setup and assertions |
| --- | --- |
| `renders_faculty_columns_and_empty_state` | Headers/names visible; rerender empty data, empty-state cell spans all columns; no stale rows. |
| `keeps_selection_by_id_after_reorder_and_select_all` | Select A: `expect(selection).toEqual({"faculty-a":true})`, header indeterminate; reverse rows, A stays selected; Select all selects both IDs, toggle off clears page IDs. |
| `server_pagination_emits_requests_without_reslicing_rows` | Page `{PageIndex:2,PageSize:10,TextSearch:"faculty"}`, total 25, two returned rows both visible; Next emits index 3; size 20 emits index 1 preserving search; rerender last page disables Next. |
| `retains_meta_row_class_and_action_row_identity` | Small typed column reads `table.options.meta`; assert rendered marker and row class; Faculty edit receives `"faculty-a",true`; delete-confirm cancel never invokes `deleteList`. |

- [x] **Step 6: Extend API characterization in existing adapter-based suite.** Add `concurrent_soft_401_requests_share_refresh`: two `api.get` calls first return HTTP 200 `{Success:false,StatusCode:401}`, defer refresh response until both initial requests run, then resolve synthetic token. Assert `expect(refreshPostSpy).toHaveBeenCalledTimes(1)`, both retries use new bearer and resolve expected envelopes. Mock token getter/save consistently, restore adapter/spies afterward. Keep real interceptors; retain `blob_soft_401_refreshes_once`, `blob_403_rejects_without_image`, and `signal_survives_retry`.
- [x] **Step 7: Run characterization.** Run full tests plus build/lint using common green-gate commands; expected PASS on current packages. These are baseline tests, not artificially failing feature tests. Existing defects require baseline report/scope decision, not silent production fixes. Record missing Phase 1 browser evidence as NOT RUN.
- [x] **Step 8: Commit baseline.** Stage six owned files, plus shared setup only if Step 3 required it; commit `test(web): characterize package upgrade boundaries`.

### Task 2: Upgrade Toolchain And Preserve Build Contracts

**Files:** Task 2 ownership map plus manifest/lockfile/report.

**Interfaces:** Official `vite@^8.3.5`, Vitest `^5.0.5`, TypeScript `~6.0.3`; unchanged npm scripts, alias and dev-server port contract.

- [x] **Step 1: RED, replace only old Vite assertions.** Keep every retired-feature/dependency/asset assertion in `ObsoleteFeatures.test.ts`. Assert `expect(pkg.devDependencies.vite).toBe("^8.3.5")`, same lock root range, `expect(pkg.overrides?.vite).toBeUndefined()`, locked Vite version matches `/^8\./`, `expect(installedVite.name).toBe("vite")` using resolved installed manifest. Do not assert optional lock-entry `name`.
- [x] **Step 2: Add node-environment `PackageUpgrade.test.ts`.** `toolchain_ranges_match_approved_matrix` checks exact Task 2 entries. Assert `expect(rootLock.devDependencies).toEqual(pkg.devDependencies)` and runtime equivalents; no locked package identifies `rolldown-vite`. `dev_port_and_alias_contract_are_preserved` resolves actual Vite config with controlled process env `VITE_DEV_PORT=""` then `"5173"`: expect ports `3000` / `5173`, host true, alias absolute frontend `src`; restore env in `finally`, do not bind port or read secret values into output.
- [x] **Step 3: Verify RED.** `npm --prefix src/apps/Blocks.Web test -- src/ObsoleteFeatures.test.ts src/PackageUpgrade.test.ts`; expect old alias/range failures, not broken test setup.
- [x] **Step 4: Apply Task 2 matrix entries and install.** Remove `overrides.vite`; `npm --prefix src/apps/Blocks.Web install` must exit 0 and sync lock. React type bumps stay with Task 3 runtime unless actual peer constraints require atomic regrouping.
- [x] **Step 5: Fix demonstrated compiler/config compatibility only.** Remove `baseUrl` from `tsconfig.app.json`, preserve `paths:{"@/*":["./src/*"]}`, strict flags/module resolution/source parsing tests. Retain plugin calls/env ports. If Vite `defineConfig` rejects duplicate `test` block, remove that block from `vite.config.ts`; `vitest.config.ts` remains authoritative. No default browser-target changes or unrelated config rewrite.
- [x] **Step 6: Preserve test isolation.** Reset/create mocks per test; do not automatically disable Vitest clearing. Add narrowly scoped ResizeObserver/scroll/pointer shims only for reproduced missing DOM APIs, never mocks replacing component/query behavior.
- [x] **Step 7: GREEN.** Re-run RED command and common green gate; all pass with no new warnings. Update report with evidence.
- [x] **Step 8: Commit toolchain.** Stage exact task-owned changes; commit `build(web): migrate to official Vite 8 toolchain`.

### Task 3: Upgrade Runtime, Form, Query, And UI Packages

**Files:** Manifest/lockfile/report/version test; create `src/apps/Blocks.Web/test/server.check.mjs`. Active call-site changes require a reproduced package compatibility error and focused regression test.

**Interfaces:** Task 3 runtime/type matrix; unchanged API/auth contracts and Express entrypoint. Server test uses Node built-ins, no added dependency.

- [x] **Step 1: RED, pin runtime ranges.** Add `runtime_ranges_match_approved_matrix` for all Task 3 entries plus Retain entries; assert 41 runtime / 18 development keys with no unexpected package names. Run `npm --prefix src/apps/Blocks.Web test -- src/PackageUpgrade.test.ts`; expect old-range failures.
- [x] **Step 2: Add runnable production-server characterization.** `test/server.check.mjs` uses `node:test`, `assert/strict`, `spawn`, `fetch`, and owned localhost test port. Spawn actual `server.js` with `PORT`; await readiness with deadline/early-exit detection; always terminate and wait for owned child. `serves_root_and_deep_links_as_same_spa` asserts `/`, `/user`, `/faculty`, `/unknown/deep-link` return HTTP 200 HTML identical to built index. `serves_referenced_assets_with_correct_content_types` reads actual built script/style URLs and asserts nonempty JS/CSS, not SPA HTML. Keep `.check.mjs` name so Vitest does not discover this separate Node check. Do not refactor server just for testing.
- [x] **Step 3: Verify baseline server check.** `npm --prefix src/apps/Blocks.Web run build`, then `node --test src/apps/Blocks.Web/test/server.check.mjs`; expect PASS before Express bump.
- [x] **Step 4: Apply only Task 3 matrix entries atomically.** React/react-dom with types; resolver/RHF/Zod together; both Radix forms plus Lucide, query/router/Axios/date-fns/Express and remaining owned packages. Install without bypass flags. No cleanup outside demonstrated compatibility fixes.
- [x] **Step 5: Verify protected behavior at actual existing paths.** Run full tests; explicitly record `src/lib/api.test.ts`, `src/Router.behavior.test.tsx`, `src/components/layout/MainLayout/app-sidebar.test.tsx`, `src/features/file/api/uploadfile.api.test.ts`, `src/features/file/hooks/useAvatarUrl.test.tsx`, `src/components/ui/upload-avatar.test.tsx`, `src/components/layout/MainLayout/PopupEditProfile.test.tsx`, `src/components/layout/MainLayout/NavUser.test.tsx`, and `src/features/system/routes/User/PopupDetail.test.tsx`, all relative to frontend. Confirm Task 1 concurrent refresh, avatar validation/staging/retry, and permission checks remain exercised; no interceptors/guards mocked away to pass.
- [x] **Step 6: GREEN and audit checkpoint.** Common green gate, built-in server tests, real combobox/query tests, full and production-only audits. Record residual advisory path/severity/exit code; never assume a fixed advisory count. Inspect actual Lucide imports and form error handling for breakages.
- [x] **Step 7: Commit.** Stage exact owned changes/evidence, commit `build(web): upgrade retained runtime and UI packages`.

### Task 4: Migrate DayPicker Internals To Version 10

**Files:** Manifest/lockfile/report/version test; `src/apps/Blocks.Web/src/components/ui/calendar.tsx`, `datepicker.tsx`, `calendar.test.tsx`, `datepicker.test.tsx`.

**Interfaces:** Public DatePicker signature/defaults stay unchanged. Internal navigation uses `startMonth: new Date(fromYear,0)` / `endMonth: new Date(toYear,11)`; controlled `Date | undefined`, Vietnamese locale remain.

- [x] **Step 1: RED.** Add `daypicker_range_matches_approved_matrix` with `expect(pkg.dependencies["react-day-picker"]).toBe("^10.0.2")`; `npm --prefix src/apps/Blocks.Web test -- src/PackageUpgrade.test.ts` must fail on old range.
- [x] **Step 2: Upgrade and expose migration failures.** Install `react-day-picker@^10.0.2`; run build and Task 1 calendar suites before code fixes. Record actual removed prop/slot diagnostics or failed assertions; do not rename package to a different distribution.
- [x] **Step 3: Translate DatePicker navigation props only.** Replace forwarded `fromYear`/`toYear` with start/end months; preserve defaults, required/disabled/defaultMonth/onSelect/popover logic. No public prop rename or global date/timezone conversion.
- [x] **Step 4: Adapt Calendar to installed v10 exports.** Inspect `getDefaultClassNames`, `DayButton` props and Root/Chevron/DayButton/WeekNumber slots. Replace only removed keys/slots; retain `vi`, caller overrides, selected/disabled/outside/range styles and focus. No invented class mapping or casts hiding invalid slots.
- [x] **Step 5: GREEN.** `npm --prefix src/apps/Blocks.Web test -- src/components/ui/datepicker.test.tsx src/components/ui/calendar.test.tsx` must pass exact default/custom bounds, boundary navigation, Vietnamese month, local callback, keyboard and required/disabled states. Run common green gate; actual CSS layout still requires Task 6 browser evidence.
- [x] **Step 6: Commit.** Stage task-owned files; commit `build(web): migrate calendar to DayPicker 10`.

### Task 5: Migrate DataTable With Official Table 9 Legacy Adapter

**Files:** Manifest/lockfile/report/version test; `src/apps/Blocks.Web/src/components/ui/data-table.tsx`, `data-table.test.tsx`. Mechanical type-import changes allowed only in these consumers:

```text
src/apps/Blocks.Web/src/components/layout/ListPageLayout.tsx
src/apps/Blocks.Web/src/features/catalog/hooks/useFaculty.ts
src/apps/Blocks.Web/src/features/catalog/routes/Faculty/columns.tsx
src/apps/Blocks.Web/src/features/system/hooks/useMenu.ts
src/apps/Blocks.Web/src/features/system/hooks/useRole.ts
src/apps/Blocks.Web/src/features/system/hooks/useSystemGroup.ts
src/apps/Blocks.Web/src/features/system/hooks/useUser.ts
src/apps/Blocks.Web/src/features/system/routes/AuditLog/AuditLogPage.tsx
src/apps/Blocks.Web/src/features/system/routes/AuditLog/columns.tsx
src/apps/Blocks.Web/src/features/system/routes/Menu/columns.tsx
src/apps/Blocks.Web/src/features/system/routes/Role/columns.tsx
src/apps/Blocks.Web/src/features/system/routes/SystemGroup/columns.tsx
src/apps/Blocks.Web/src/features/system/routes/User/columns.tsx
```

**Interfaces:** Existing `DataTable<TData,TValue>` props and column callback signatures/behavior remain. Import `useLegacyTable`, `getCoreRowModel` from `@tanstack/react-table/legacy`; `flexRender` from supported root export. Use actual exported legacy types for old row/column shapes.

- [x] **Step 1: RED.** Add `table_range_matches_approved_matrix`, `expect(pkg.dependencies["@tanstack/react-table"]).toBe("^9.3.1")`; `npm --prefix src/apps/Blocks.Web test -- src/PackageUpgrade.test.ts` fails on old range.
- [x] **Step 2: Upgrade and capture breaks.** Install approved Table range; run build and real DataTable tests before migration. Record actual import/type/runtime failures, not assumed complete compatibility.
- [x] **Step 3: Use official legacy hook/core row model.** Preserve data, columns, selection updater, custom IDs/state/meta. No hand-rolled adapter or native `tableFeatures` rewrite. Add one comment: `ponytail: official legacy adapter preserves v8 column contracts; migrate to native Table 9 when legacy support must be retired.`
- [x] **Step 4: Apply mechanical legacy type imports.** Use `LegacyColumnDef as ColumnDef`, `LegacyRow as Row` where confirmed by installed exports/generics; inspect supported selection/updater export paths. Preserve accessors/render callbacks/action IDs/permissions/external paging; no broad casts, wrapper module or schema rewrite.
- [x] **Step 5: GREEN with real consumers.** `npm --prefix src/apps/Blocks.Web test -- src/components/ui/data-table.test.tsx`, then common green gate. Pin stable-ID reorder, partial/all selection, empty data, server page-size/index requests, meta and action identity; compile all six list consumers.
- [x] **Step 6: Commit.** Stage exact owned migrations/tests/evidence; commit `build(web): adopt Table 9 official legacy adapter`.

### Task 6: Verify Clean Install, Browser Flows, And Completion Gates

**Files:** Finalize `src/apps/Blocks.Web/upgrade-verification.md`. Fixes return to Tasks 2-5 with focused tests and repeated verification; no new upgrade scope.

**Interfaces:** Consumes all prior checkpoints; produces reproducible PASS/FAIL/NOT RUN evidence, resolved versions, residual risks and independent whole-diff review.

- [x] **Step 1: Prove final matrix/lock completeness.** Verify all 59 exact ranges including Retain entries and lock root parity. `npm --prefix src/apps/Blocks.Web ci`, then `npm --prefix src/apps/Blocks.Web ls --all`: both exit 0, no invalid peers/aliases; `ci` must not change tracked manifest/lock.
- [x] **Step 2: Run final automated checks after clean install.**

```powershell
npm --prefix src/apps/Blocks.Web run build
npm --prefix src/apps/Blocks.Web run lint
npm --prefix src/apps/Blocks.Web test
node --test src/apps/Blocks.Web/test/server.check.mjs
npm --prefix src/apps/Blocks.Web audit --json
npm --prefix src/apps/Blocks.Web audit --omit=dev --json
```

Expected: build/lint/tests/server checks exit 0; all baseline/new assertions pass, no new warning rule/locations. Audits may exit nonzero; new/unresolved high or critical vulnerabilities block unconditional completion. Record advisory/path/usage and compatible remedy or explicit owner risk decision. Never call failed audit PASS.

- [x] **Step 3: Establish isolated browser session.** Disposable profile; synthetic exp-valid JWT cookie `access_token`, fixture localStorage `user`, `systemGroup`, `menu`, `permissions` matching production DTOs. Allowed controllers `user`, `faculty`, `systemgroup`, `menu`, `role`, `auditlog` have `IsViewed:true`; denied fixture sets false. Intercept all application APIs before navigation with local envelopes, block unhandled requests, mock upload/preview in memory. No real credentials or backend writes. Missing tooling/fixtures means NOT RUN, not full completion.
- [x] **Step 4: Verify env ports without editing AppHost.** Start `npm --prefix src/apps/Blocks.Web run dev -- --strictPort` using process-scoped `VITE_DEV_PORT=3000`, then `5173`, when free. Verify requested port serves app; if occupied, record conflict, do not kill another process, use Task 2 port test and explicit free port for smoke. Restore env/stop only owned servers.
- [x] **Step 5: Run browser matrix on dev and actual Express production server.** Build first; start `npm --prefix src/apps/Blocks.Web start` with free process-scoped `PORT`. Test desktop `1440x900` and mobile `390x844`; capture screenshots and console/network evidence.

| Scenario | Assertions |
| --- | --- |
| Home/sidebar | Greeting/active menu visible; collapse/mobile navigation work; no Business/retired Catalog links. |
| Six lists | `/user`, `/faculty`, `/systemgroup`, `/menu`, `/role`, `/auditlog` mount fixture data; headers/cells/actions usable. Faculty selection/refresh/Next/page-size issue correct requests; no double pagination. |
| Forms/combobox/calendar | User detail opens; invalid form cannot save; combobox search/clear works; DatePicker bounds/caption/keyboard/selection/disabled behavior correct. |
| Avatar | Fixture image previews; valid staged upload/save works; failed mocked upload permits retry without unexpected save; invalid file rejected. |
| Routes/auth | Reload active deep link; unauthenticated route redirects `/login`, denied permission redirects `/unauthorized`; `/evidence`, `/standardset`, `/unknown/deep-link` render Not Found, no old mockup. |
| Browser health | No uncaught exceptions/failed chunks/missing assets or overlapping critical controls. Expected deliberately failed API fixture calls labeled separately from regressions. |

- [x] **Step 6: Independent whole-diff review.** Use `superpowers:requesting-code-review`; compare spec/matrix, diff, all six consumers and evidence. Resolve findings and repeat affected gates. Review cannot replace missing browser/audit results or prove real DB/provider/production integration.
- [x] **Step 7: Scope/secret check and evidence commit.** `git diff --check`, inspect final diff/status; no backend/machine edits, generated `dist`/`node_modules`, tokens or real data in changes. Report command/exit/result table, versions, baseline deviations, browser matrix, audit residuals/reviewer outcomes. Stage evidence plus explicitly reviewed fixes; commit `docs(web): record Phase 2 upgrade verification`.

## Definition Of Done

- All approved ranges/official Vite installation verified; compatibility migrations tested without expanding feature scope.
- Clean install/dependency tree/build/lint/original and new tests/production server checks pass.
- Desktop/mobile dev and production smoke pass with isolated fixtures. NOT RUN checks block full-completion claim.
- Audit evidence and owner decisions expose unresolved risks; no vulnerability-free claim from direct bumps.
- Review findings resolved or explicitly accepted; baseline defects and environment/deployment limits remain visible.

## Handoff

Review plan before execution. Recommend subagent-driven execution with fresh implementer/reviewer gates because toolchain, calendar and table major upgrades affect shared UI differently. Manifest/lockfile work stays sequential. Native execution with one final independent review is lower-overhead alternative; writing this document starts neither approach.
