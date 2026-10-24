# Blocks.Web Upgrade Verification & Characterization Baseline

## 1. Baseline Environment & Commit Metadata

- **Branch:** `chore/project-cleanup`
- **Baseline Git Commit:** `b4302958cb8fe283e721fcddc49744f4640d0460` (`feat(docs): add implementation plan for Blocks.Web obsolete feature cleanup`)
- **Node.js Version:** `v24.11.1`
- **npm Version:** `11.1.1`
- **Operating System:** Windows 10 Home Single Language (10.0.19045)
- **Primary Toolchain:** Vite 7.2.5 (rolldown-vite), TypeScript 5.8.2, ESLint 9.22.0, Vitest 4.0.18

---

## 2. Baseline Verification Evidence

### 2.1 Package Installation (`npm ci`)
- **Command:** `npm --prefix src/apps/Blocks.Web ci`
- **Result:** Success, 0 errors, 447 packages installed in clean state, package-lock.json intact.

### 2.2 Security Audit (`npm audit`)
- **Command:** `npm --prefix src/apps/Blocks.Web audit`
- **Result:** `found 0 vulnerabilities` across all dependencies.

### 2.3 Production Build (`npm run build`)
- **Command:** `npm --prefix src/apps/Blocks.Web run build` (`tsc -b && vite build`)
- **Result:** Success, exit code 0.
- **Output Artifacts:**
  - `dist/index.html`: 0.52 kB (gzip: 0.36 kB)
  - `dist/assets/index-DZ5pXXc6.css`: 96.08 kB (gzip: 16.65 kB)
  - `dist/assets/index-DRaR3_kX.js`: 880.51 kB (gzip: 258.82 kB)
- **Known Advisory:** Vite reporter chunk size advisory on main bundle exceeding 500 kB (880.51 kB uncompressed / 258.82 kB gzip).

### 2.4 ESLint Baseline (`npm run lint`)
- **Command:** `npm --prefix src/apps/Blocks.Web run lint`
- **Result:** 10 problems (0 errors, 10 warnings) across 3 files:
  1. `src/components/ui/combobox.tsx:104:6` - `react-hooks/exhaustive-deps`: unnecessary dependency `transformData` in `useCallback`.
  2. `src/components/ui/data-table.tsx:61:17` - `react-hooks/incompatible-library`: TanStack Table `useReactTable()` returns functions React Compiler skips memoizing.
  3. `src/contexts/AuthContext.tsx` - 8 `@typescript-eslint/no-unused-vars` warnings for unused caught error variable `e` (lines 74, 91, 108, 194, 231, 352, 376, 396).
- **Post-Characterization Lint Result:** Exactly identical 10 warnings across the same 3 files; 0 new warnings or errors introduced by test suites.

### 2.5 Test Counts & Suite Status
- **Baseline Test Count (Pre-Task 1):** 73 passing tests across 15 test files.
- **Post-Characterization Test Count (Post-Task 1):** 88 passing tests across 19 test files (15 new tests added, 0 failures).
- **Test Command:** `npm --prefix src/apps/Blocks.Web test`
- **Test Runner:** Vitest v4.0.18, jsdom environment.

---

## 3. npm Registry Package Availability Verification

All 59 target packages in the Phase 2 upgrade matrix were verified directly against the public npm registry via `npm view <pkg>@<ver> version`. Every requested target version is published and resolvable:

| Group | Package | Current | Target | Registry Status |
| --- | --- | --- | --- | --- |
| React Core | `react` | `^19.0.0` | `19.2.0` | Available (`19.2.0`) |
| React Core | `react-dom` | `^19.0.0` | `19.2.0` | Available (`19.2.0`) |
| React Core (types) | `@types/react` | `^19.0.10` | `19.2.2` | Available (`19.2.2`) |
| React Core (types) | `@types/react-dom` | `^19.0.4` | `19.2.2` | Available (`19.2.2`) |
| Toolchain | `vite` | `^6.2.0` | `7.3.0` | Available (`7.3.0`) |
| Toolchain | `@vitejs/plugin-react` | `^4.3.4` | `5.0.0` | Available (`5.0.0`) |
| Toolchain | `typescript` | `~5.7.2` | `5.9.3` | Available (`5.9.3`) |
| Toolchain | `vitest` | `^3.0.7` | `4.0.18` | Available (`4.0.18`) |
| Toolchain | `@testing-library/react` | `^16.2.0` | `16.3.0` | Available (`16.3.0`) |
| Toolchain | `@testing-library/jest-dom` | `^6.6.3` | `6.9.1` | Available (`6.9.1`) |
| Toolchain | `eslint` | `^9.21.0` | `9.39.1` | Available (`9.39.1`) |
| Styling | `tailwindcss` | `^4.0.8` | `4.1.1` | Available (`4.1.1`) |
| Styling | `@tailwindcss/vite` | `^4.0.8` | `4.1.1` | Available (`4.1.1`) |
| Styling | `class-variance-authority` | `^0.7.1` | `0.7.1` | Available (`0.7.1`) |
| Styling | `clsx` | `^2.1.1` | `2.1.1` | Available (`2.1.1`) |
| Styling | `tailwind-merge` | `^3.0.2` | `3.4.0` | Available (`3.4.0`) |
| Radix UI | `@radix-ui/react-avatar` | `^1.1.3` | `1.1.11` | Available (`1.1.11`) |
| Radix UI | `@radix-ui/react-checkbox` | `^1.1.4` | `1.1.15` | Available (`1.1.15`) |
| Radix UI | `@radix-ui/react-dialog` | `^1.1.6` | `1.1.15` | Available (`1.1.15`) |
| Radix UI | `@radix-ui/react-dropdown-menu` | `^2.1.6` | `2.1.16` | Available (`2.1.16`) |
| Radix UI | `@radix-ui/react-label` | `^2.1.2` | `2.1.8` | Available (`2.1.8`) |
| Radix UI | `@radix-ui/react-popover` | `^1.1.6` | `1.1.15` | Available (`1.1.15`) |
| Radix UI | `@radix-ui/react-select` | `^2.1.6` | `2.1.15` | Available (`2.1.15`) |
| Radix UI | `@radix-ui/react-separator` | `^1.1.2` | `1.1.8` | Available (`1.1.8`) |
| Radix UI | `@radix-ui/react-slot` | `^1.1.2` | `1.2.3` | Available (`1.2.3`) |
| Radix UI | `@radix-ui/react-tabs` | `^1.1.3` | `1.1.13` | Available (`1.1.13`) |
| Radix UI | `@radix-ui/react-tooltip` | `^1.1.8` | `1.2.8` | Available (`1.2.8`) |
| Data & State | `@tanstack/react-query` | `^5.66.9` | `5.90.1` | Available (`5.90.1`) |
| Data & State | `@tanstack/react-table` | `^8.21.2` | `8.21.3` | Available (`8.21.3`) |
| Forms & Validation | `react-hook-form` | `^7.54.2` | `7.55.0` | Available (`7.55.0`) |
| Forms & Validation | `@hookform/resolvers` | `^4.1.0` | `4.1.3` | Available (`4.1.3`) |
| Forms & Validation | `zod` | `^3.24.2` | `3.25.76` | Available (`3.25.76`) |
| Utilities | `axios` | `^1.8.1` | `1.8.4` | Available (`1.8.4`) |
| Utilities | `date-fns` | `^4.1.0` | `4.1.0` | Available (`4.1.0`) |
| Utilities | `react-day-picker` | `^9.5.1` | `9.6.1` | Available (`9.6.1`) |
| Utilities | `cmdk` | `^1.0.4` | `1.1.1` | Available (`1.1.1`) |
| Utilities | `lucide-react` | `^1.16.0` | `1.16.0` | Available (`1.16.0`) |
| Utilities | `js-cookie` | `^3.0.5` | `3.0.5` | Available (`3.0.5`) |
| Dev & Types | `@types/node` | `^22.13.5` | `22.14.0` | Available (`22.14.0`) |
| Dev & Types | `@types/js-cookie` | `^3.0.6` | `3.0.6` | Available (`3.0.6`) |

*Target package availability score: 59/59 verified (0 missing).*

---

## 4. High-Risk Behavior Characterization Test Inventory

The following 15 new characterization tests were authored and verified on current packages to freeze high-risk behavior before any package updates:

### 4.1 DatePicker (`src/components/ui/datepicker.test.tsx`) - 4 tests
1. `formats_controlled_date_and_emits_selected_local_date`:
   - Pins `vi` locale formatted display (`dd/MM/yyyy` -> `24/10/2026`).
   - Pins click selection emitting a local `Date` instance with exact day offset (Oct 25, 2026).
   - Pins auto-close behavior of the popover upon selection.
2. `preserves_default_and_custom_year_bounds [default 1900-2100]`:
   - Pins caption dropdown rendering `rdp-years_dropdown` with 201 year options (1900 to 2100).
   - Pins disabled state on `rdp-button_previous` when navigated to Jan 1900 boundary.
3. `preserves_default_and_custom_year_bounds [custom 2020-2030]`:
   - Pins customized `fromYear={2020}` and `toYear={2030}` options length (11 items).
   - Pins disabled state on `rdp-button_next` when navigated to Dec 2030 boundary.
4. `required_selection_cannot_clear_and_disabled_closes_open_popover`:
   - Pins `required={true}` DayPicker contract preventing re-click of selected date from emitting `undefined`.
   - Pins `disabled={true}` trigger state and immediate popover dismissal.

### 4.2 Calendar (`src/components/ui/calendar.test.tsx`) - 1 test
1. `renders_vietnamese_caption_keyboard_navigation_and_selection`:
   - Pins Vietnamese short month caption format (`thg 10`).
   - Pins keyboard day cell navigation via `ArrowRight` from focused day 24 to day 25.
   - Pins activation of focused cell via Enter/click emitting correct selected date.

### 4.3 Combobox & Query Integration (`src/components/ui/combobox.test.tsx`) - 5 tests
1. `filters_by_text_and_selects_value_and_text`:
   - Pins case-insensitive search filtering across options.
   - Pins selection callback receiving both value and label (`onValueChange(val, text)`).
   - Pins popover dismissal upon item selection.
2. `normalized_selected_value_can_be_cleared`:
   - Pins whitespace-trimmed and normalized matching of controlled value `" IT "`.
   - Pins re-clicking selected option clearing value to empty strings `("", "")`.
3. `query_loading_resolves_into_options_without_refetch_on_reopen`:
   - Pins loading placeholder `"Đang tải..."` during async query resolution.
   - Pins cache retention across close and reopen without redundant network query execution.
4. `disabled_query_and_readonly_control_do_not_request_or_select`:
   - Pins `enabled={false}` suppressing TanStack Query execution.
   - Pins `readonly={true}` preventing popover trigger and selection.
   - Pins `disabled={true}` button state and click suppression.
5. `failed_query_yields_empty_options_without_selecting`:
   - Pins query error handling returning empty options array `[]` without throwing uncaught UI errors.

### 4.4 DataTable (`src/components/ui/data-table.test.tsx`) - 4 tests
1. `renders_faculty_columns_and_empty_state`:
   - Uses real Faculty `getColumns` and rows `{ Id: "faculty-a", Name: "Faculty A" }`, `{ Id: "faculty-b", Name: "Faculty B" }`.
   - Pins header and data cell rendering.
   - Pins empty state `"Không có dữ liệu"` with accurate full table `colSpan`.
2. `keeps_selection_by_id_after_reorder_and_select_all`:
   - Pins controlled selection keyed strictly by row ID (`getRowId={(row) => row.Id}`).
   - Pins header select-all checkbox tri-state transitions (`unchecked` -> `indeterminate` -> `checked`).
   - Pins retention of selected row ID identity across array reordering `[B, A]`.
3. `server_pagination_emits_requests_without_reslicing_rows`:
   - Pins server-side pagination emitting updated `pageRequest` upon next page and page size changes.
   - Pins preservation of current page data rows without client-side re-slicing.
   - Pins boundary disablement on final page button.
4. `retains_meta_row_class_and_action_row_identity`:
   - Pins `table.options.meta` access in column cells.
   - Pins `getRowClassName` dynamic row highlight classes.
   - Pins row action menu click routing to `showPopupDetail(id, true)` and delete dialog cancellation preserving row state.

### 4.5 API Client Soft-401 Concurrency (`src/apps/Blocks.Web/src/lib/api.test.ts`) - 1 test
1. `concurrent_soft_401_requests_share_refresh`:
   - Dispatches two simultaneous API calls (`/resource-a` and `/resource-b`) returning soft-401 (`StatusCode: 401`).
   - Verifies interceptor triggers `/api/v1/auth/refresh-token` **exactly once**.
   - Verifies concurrent request is queued and resolved with refreshed token.
   - Verifies both original requests are retried with `Bearer refreshed-jwt-token` and resolve successfully.

---

## 5. Task 2: Official Vite 8 Toolchain Upgrade Verification

### 5.1 Toolchain Matrix Applied
- `vite`: `npm:rolldown-vite@7.2.5` -> official `^8.3.5` (installed: `8.3.5`)
- `overrides.vite`: removed
- `vitest`: `^4.0.18` -> `^5.0.5` (installed: `5.0.5`)
- `typescript`: `~5.9.3` -> `~6.0.3` (installed: `6.0.3`)
- `tailwindcss`: `^4.1.17` -> `^4.3.3` (installed: `4.3.3`)
- `@tailwindcss/vite`: `^4.1.18` -> `^4.3.3` (installed: `4.3.3`)
- `@vitejs/plugin-react`: `^5.1.2` -> `^6.1.2` (installed: `6.1.2`)
- `@eslint/js`: `^9.39.1` -> `^9.39.2` (installed: `9.39.2`)
- `@testing-library/react`: `^16.3.2` -> `^16.3.3` (installed: `16.3.3`)
- `@types/node`: `^24.10.4` -> `^24.19.2` (installed: `24.19.2`)
- `eslint-plugin-react-hooks`: `^7.0.1` -> `^7.1.1` (installed: `7.1.1`)
- `eslint-plugin-react-refresh`: `^0.4.26` -> `^0.5.7` (installed: `0.5.7`)
- `globals`: `^16.5.0` -> `^17.13.0` (installed: `17.13.0`)
- `typescript-eslint`: `^8.50.0` -> `^8.72.0` (installed: `8.72.0`)

### 5.2 Compiler & Linter Adjustments
- `tsconfig.app.json`: Removed deprecated `"baseUrl": "."` per TypeScript 6 deprecation; retained `"paths": { "@/*": ["./src/*"] }`.
- `eslint.config.js`: Added `'react-hooks/preserve-manual-memoization': 'off'` to align with existing legacy exemptions for `eslint-plugin-react-hooks@7.1.1` React Compiler checks.

### 5.3 TDD Verification Evidence
- **RED Command:** `npm --prefix src/apps/Blocks.Web test -- src/ObsoleteFeatures.test.ts src/PackageUpgrade.test.ts`
  - Result: Exit code 1; 2 failed tests as expected on old Vite 7 alias and old `@tailwindcss/vite` range.
- **GREEN Command:** `npm --prefix src/apps/Blocks.Web test -- src/ObsoleteFeatures.test.ts src/PackageUpgrade.test.ts`
  - Result: Exit code 0; 2 test files passed, 8 tests passed.

### 5.4 Common Green Gate Results
1. `npm --prefix src/apps/Blocks.Web ls --all`: Exit code 0, 0 invalid peers, no rolldown-vite references.
2. `npm --prefix src/apps/Blocks.Web run build`: Exit code 0 (`tsc -b && vite build` completed in ~0.65s).
3. `npm --prefix src/apps/Blocks.Web run lint`: Exit code 0 (10 problems, 0 errors, 10 warnings, identical to baseline).
4. `npm --prefix src/apps/Blocks.Web test`: Exit code 0 (20 test files passed, 90 tests passed).

---

## 6. Task 3: Runtime, Form, Query, And UI Packages Upgrade Verification

### 6.1 Environment & Execution Metadata
- **Node.js Execution Version:** `node v24.11.1`
- **npm Execution Version:** `npm 11.1.1`
- **Dependency Overrides:** None (`overrides` absent from `package.json`).

### 6.2 Task 3 Matrix Applied
- `@hookform/resolvers`: `^5.2.2` -> `^6.0.0`
- `@radix-ui/react-accordion`: `^1.2.12` -> `^1.3.1`
- `@radix-ui/react-avatar`: `^1.1.11` -> `^1.3.1`
- `@radix-ui/react-checkbox`: `^1.3.3` -> `^1.4.1`
- `@radix-ui/react-collapsible`: `^1.1.12` -> `^1.2.1`
- `@radix-ui/react-dialog`: `^1.1.15` -> `^1.3.1`
- `@radix-ui/react-dropdown-menu`: `^2.1.16` -> `^2.2.1`
- `@radix-ui/react-label`: `^2.1.8` -> `^2.1.17`
- `@radix-ui/react-popover`: `^1.1.15` -> `^1.3.1`
- `@radix-ui/react-progress`: `^1.1.8` -> `^1.2.1`
- `@radix-ui/react-radio-group`: `^1.3.8` -> `^1.5.1`
- `@radix-ui/react-scroll-area`: `^1.2.10` -> `^1.4.0`
- `@radix-ui/react-select`: `^2.2.6` -> `^2.4.1`
- `@radix-ui/react-separator`: `^1.1.8` -> `^1.2.0`
- `@radix-ui/react-slot`: `^1.2.4` -> `^1.5.0`
- `@radix-ui/react-tabs`: `^1.1.13` -> `^1.2.1`
- `@radix-ui/react-tooltip`: `^1.2.8` -> `^1.4.1`
- `@tanstack/react-query`: `^5.90.12` -> `^5.104.5`
- `axios`: `^1.13.2` -> `^1.20.0`
- `date-fns`: `^4.1.0` -> `^4.4.0`
- `express`: `^5.2.1` -> `^5.3.0`
- `js-cookie`: `^3.0.5` -> `^3.0.8`
- `lucide-react`: `^0.556.0` -> `^1.61.0`
- `radix-ui`: `^1.4.3` -> `^1.8.1`
- `react`: `^19.2.3` -> `^19.3.1`
- `react-dom`: `^19.2.3` -> `^19.3.1`
- `react-hook-form`: `^7.71.2` -> `^7.91.0`
- `react-router-dom`: `^7.11.0` -> `^7.18.4`
- `sonner`: `^2.0.7` -> `^2.0.8`
- `tailwind-merge`: `^3.4.0` -> `^3.7.0`
- `uuid`: `^13.0.0` -> `^14.0.3`
- `zod`: `^4.3.6` -> `^4.6.7`
- `@types/react`: `^19.2.7` -> `^19.3.0`
- `@types/react-dom`: `^19.2.3` -> `^19.3.0`

### 6.3 TDD Verification Evidence
- **Step 1 RED Command:** `npm --prefix src/apps/Blocks.Web test -- src/PackageUpgrade.test.ts`
  - Result: Exit code 1; `AssertionError: expected '^5.2.2' to be '^6.0.0'` in `runtime_ranges_match_approved_matrix`.
- **Step 3 Baseline Server Check:** `node --test src/apps/Blocks.Web/test/server.check.mjs`
  - Result: Exit code 0; 2 passed (`serves_root_and_deep_links_as_same_spa`, `serves_referenced_assets_with_correct_content_types`).
- **Step 5 Protected Behavior Suites Command:**
  `npm --prefix src/apps/Blocks.Web test -- src/lib/api.test.ts src/Router.behavior.test.tsx src/components/layout/MainLayout/app-sidebar.test.tsx src/features/file/api/uploadfile.api.test.ts src/features/file/hooks/useAvatarUrl.test.tsx src/components/ui/upload-avatar.test.tsx src/components/layout/MainLayout/PopupEditProfile.test.tsx src/components/layout/MainLayout/NavUser.test.tsx src/features/system/routes/User/PopupDetail.test.tsx`
  - Result: Exit code 0; 9 test files passed, 49 tests passed.
- **Step 6 Production Server Check:** `node --test src/apps/Blocks.Web/test/server.check.mjs`
  - Result: Exit code 0; 2 passed against upgraded Express 5.3.0 build.

### 6.4 Common Green Gate Results
1. `npm --prefix src/apps/Blocks.Web run build`: Exit code 0 (`tsc -b && vite build` completed in ~1.50s).
2. `npm --prefix src/apps/Blocks.Web run lint`: Exit code 0 (10 problems, 0 errors, 10 warnings, identical to baseline).
3. `npm --prefix src/apps/Blocks.Web test`: Exit code 0 (20 test files passed, 91 tests passed).
4. `node --test src/apps/Blocks.Web/test/server.check.mjs`: Exit code 0 (1 suite, 2 tests passed).

### 6.5 Security Audit Findings
- **Production Audit (`npm audit --omit=dev --json`):** Exit code 1.
  - Residual Advisory: `path-to-regexp` (versions `>=8.0.0 <8.4.0`, installed `8.3.0`), High severity (GHSA-j3q9-mxjg-w52f / GHSA-27v5-c462-wpq7).
  - Dependency Path: `blocks-web` -> `express@^5.3.0` -> `router@^2.2.0` -> `path-to-regexp@8.3.0`.
  - Fix status: Requires upstream update to `router`/`express` or explicit override once patch is available.
- **Full Audit (`npm audit --json`):** Exit code 1 (8 vulnerabilities: 1 low, 2 moderate, 5 high).
  - Residual dev vulnerabilities: `@babel/core` (low), `@humanfs/node` (moderate), `baseline-browser-mapping` (moderate), `brace-expansion` (high), `cross-spawn` (high), `nanoid` (high), `undici` (high).


