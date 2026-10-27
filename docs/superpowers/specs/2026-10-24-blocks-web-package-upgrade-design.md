# Blocks.Web Package Upgrade Design (Phase 2)

Date: 2026-10-24
Status: Approved by user on 2026-10-24. Approach 1 selected. No package versions or application source code modified yet.

Implementation plan: `docs/superpowers/plans/2026-10-24-blocks-web-package-upgrade.md` (awaiting plan review and execution-method selection).

---

## 1. Intent And Why

Following the completion and independent review of Phase 1 (`docs/superpowers/specs/2026-10-24-blocks-web-obsolete-cleanup-design.md`), `src/apps/Blocks.Web` has been purged of obsolete Business and retired Catalog source, routes, viewers, and 20 dead dependencies.

The current retained dependency tree still contains:
1. Vulnerabilities reported by `npm audit` across active runtime and transitive dependencies (including high/critical advisories in `axios`, `react-router`, `undici`, `vitest`, `body-parser`, `proxy-addr`).
2. An intermediate Vite integration pinned via `npm:rolldown-vite@7.2.5` alias and overrides, which the upstream maintainers officially deprecated in favor of native Vite 8.
3. Outdated minor and major versions across retained UI and platform libraries (`lucide-react`, `date-fns`, `uuid`, `@tanstack/react-query`, `@radix-ui/*`, `eslint`).

The user explicitly requested upgrading packages in `Blocks.Web` to their latest mutually compatible versions following the code cleanup.

---

## 2. Goals, Non-Goals, And Anti-Goals

### Goals
- Upgrade retained production dependencies (41 packages) and development dependencies (18 packages) to the latest mutually compatible stable versions available in the npm registry.
- Migrate the bundler from the deprecated `npm:rolldown-vite@7.2.5` alias to official `vite@^8.3.5` and align `@vitejs/plugin-react` (`^6.1.2`), `@tailwindcss/vite` (`^4.3.3`), and `vitest` (`^5.0.5`).
- Migrate `react-day-picker` to v10 (`10.0.2`), updating `src/apps/Blocks.Web/src/components/ui/calendar.tsx` and `datepicker.tsx` to replace removed v9 navigation props (`fromYear`/`toYear` -> `startMonth`/`endMonth`), classNames, and component slots.
- Upgrade `@tanstack/react-table` to v9 (`9.3.1`) using the official `@tanstack/react-table/legacy` adapter (`useLegacyTable`, `getCoreRowModel`) inside `src/components/ui/data-table.tsx` to preserve all existing column definitions, row selection, and pagination across 7 list views without rewriting application schemas.
- Upgrade `lucide-react` to `^1.61.0`, keeping brand-free UI icons and verifying custom CSS sizing.
- Upgrade `axios` (`^1.20.0`), `uuid` (`^14.0.3`), `zod` (`^4.6.7`), `react-router-dom` (`^7.18.4`), and `@tanstack/react-query` (`^5.104.5`), resolving known high/critical audit advisories.
- Update `ObsoleteFeatures.test.ts` to assert official Vite 8 pins instead of the obsolete `rolldown-vite@7.2.5` alias.
- Add focused unit tests for `DatePicker`/`Calendar` and combobox query integration to close existing baseline test gaps before and after package changes.
- Verify full build, lint, unit tests, and live browser smoke checks across desktop (1440x900) and mobile (390x844).

### Non-Goals
- Upgrading backend services, database schemas, Dockerfile definitions, or Aspire orchestration in `src/platform/Blocks.AppHost/`.
- Migrating to TypeScript 7.0 until `typescript-eslint` adds official support (TypeScript is pinned to `6.0.3` to respect `<6.1.0` peer requirement).
- Replacing TanStack Query, React Hook Form, Radix UI, or Tailwind CSS with alternate frameworks.
- Rewriting table column definitions or application schemas across System and Faculty features.

### Anti-Goals
- Using `--force` or `--legacy-peer-deps` to bypass dependency resolution conflicts.
- Introducing breaking changes to the `{ Success, StatusCode, Data, Message }` API envelope or authentication token refresh flow in `src/lib/api.ts`.
- Reintroducing any deleted Business or Catalog entities, routes, or mockups.

---

## 3. Constraints

- **Scope boundary**: Changes are strictly confined to `src/apps/Blocks.Web`. No edits permitted in backend `.csproj`, `.slnx`, or `src/services/*`.
- **Runtime target**: Must run smoothly on Node.js 24 LTS (`v24.20.0` checked locally) and npm 11.
- **Orchestration compatibility**: Aspire AppHost invokes `builder.AddJavaScriptApp("Web", "../../apps/Blocks.Web", "dev")` with port `5173` mapped to `VITE_DEV_PORT`. Vite server configuration and dev scripts must maintain this contract.
- **Production static server**: `server.js` uses Express 5 (`"express": "^5.2.1"`) with route syntax `app.get('/{*splat}', ...)`. Express 5 compatibility must be preserved.
- **Baseline preservation**: Existing 73 unit tests across 15 files must remain green. Preexisting lint warnings in legacy files must be tracked and not worsened.

---

## 4. Approaches Considered

1. **Option 1 (Selected): Full Compatible Modernization (Vite 8, Table 9 Legacy Adapter, DayPicker 10, TS 6.0.3)**
   - *Description*: Upgrade all retained dependencies to their newest stable versions. Remove the deprecated Rolldown preview alias in favor of Vite 8. Adopt TanStack Table 9 using the official legacy adapter in `data-table.tsx`. Upgrade DayPicker to 10 with component prop updates. Pin TypeScript to 6.0.3 to maintain strict peer compatibility with `typescript-eslint` 8.
   - *Trade-off*: Requires small code adaptations in `calendar.tsx`, `datepicker.tsx`, and `data-table.tsx`, but achieves maximum security vulnerability remediation and toolchain modernization.

2. **Option 2 (Rejected): Conservative In-Major Upgrades Only**
   - *Description*: Restrict upgrades to minor/patch bumps within existing majors (e.g. keep Vite on rolldown-vite 7.2.x, Table 8.21.x, DayPicker 9.13.x, Lucide 0.556.x).
   - *Trade-off*: Leaves deprecated packages (`rolldown-vite`), unresolved security advisories in transitive packages, and fails the user's primary requirement to bring the project up to date.

3. **Option 3 (Rejected): Bleeding Edge Without Peer Constraints (TS 7.0 + ESLint 10 + Table 9 Full Rewrite)**
   - *Description*: Force install TypeScript 7.0.2, ESLint 10, and rewrite all 7 table route column definitions to use TanStack Table 9's native `tableFeatures` pipeline.
   - *Trade-off*: Breaks `typescript-eslint` which currently caps TypeScript at `<6.1.0`, triggers cascading type breakages across all list views, and introduces severe regression risks for minimal runtime gain.

---

## 5. Target Dependency Manifest

### 5.1. Production Dependencies (`dependencies`)

| Package Name | Current Version | Target Version | Upgrade Type | Notes & Breaking Change Handling |
| --- | --- | --- | --- | --- |
| `@hookform/resolvers` | `^5.2.2` | `^6.0.0` | Major | Breaking change affects Effect-ts only; Zod resolver contract unchanged. |
| `@radix-ui/react-accordion` | `^1.2.12` | `^1.3.1` | Minor | Compatible React 19 peer. |
| `@radix-ui/react-avatar` | `^1.1.11` | `^1.3.1` | Minor | Compatible React 19 peer. |
| `@radix-ui/react-checkbox` | `^1.3.3` | `^1.4.1` | Minor | Compatible React 19 peer. |
| `@radix-ui/react-collapsible` | `^1.1.12` | `^1.2.1` | Minor | Compatible React 19 peer. |
| `@radix-ui/react-dialog` | `^1.1.15` | `^1.3.1` | Minor | Compatible React 19 peer. |
| `@radix-ui/react-dropdown-menu` | `^2.1.16` | `^2.2.1` | Minor | Compatible React 19 peer. |
| `@radix-ui/react-label` | `^2.1.8` | `^2.1.17` | Patch | Compatible React 19 peer. |
| `@radix-ui/react-popover` | `^1.1.15` | `^1.3.1` | Minor | Compatible React 19 peer. |
| `@radix-ui/react-progress` | `^1.1.8` | `^1.2.1` | Minor | Compatible React 19 peer. |
| `@radix-ui/react-radio-group` | `^1.3.8` | `^1.5.1` | Minor | Compatible React 19 peer. |
| `@radix-ui/react-scroll-area` | `^1.2.10` | `^1.4.0` | Minor | Compatible React 19 peer. |
| `@radix-ui/react-select` | `^2.2.6` | `^2.4.1` | Minor | Compatible React 19 peer. |
| `@radix-ui/react-separator` | `^1.1.8` | `^1.2.0` | Minor | Compatible React 19 peer. |
| `@radix-ui/react-slot` | `^1.2.4` | `^1.5.0` | Minor | Compatible React 19 peer. |
| `@radix-ui/react-tabs` | `^1.1.13` | `^1.2.1` | Minor | Compatible React 19 peer. |
| `@radix-ui/react-tooltip` | `^1.2.8` | `^1.4.1` | Minor | Compatible React 19 peer. |
| `@tailwindcss/vite` | `^4.1.18` | `^4.3.3` | Minor | Aligns with Vite 8 peer. |
| `@tanstack/react-query` | `^5.90.12` | `^5.104.5` | Minor | Compatible with React 19. |
| `@tanstack/react-table` | `^8.21.3` | `^9.3.1` | Major | Adopt `@tanstack/react-table/legacy` adapter in `data-table.tsx`. |
| `axios` | `^1.13.2` | `^1.20.0` | Minor | Resolves 18 GHSA security advisories. |
| `class-variance-authority` | `^0.7.1` | `^0.7.1` | Current | Already latest stable. |
| `clsx` | `^2.1.1` | `^2.1.1` | Current | Already latest stable. |
| `cmdk` | `^1.1.1` | `^1.1.1` | Current | Already latest stable. |
| `date-fns` | `^4.1.0` | `^4.4.0` | Minor | Preserves `date-fns/locale/vi`. |
| `express` | `^5.2.1` | `^5.3.0` | Minor | Preserves Express 5 `server.js` SPA router. |
| `js-cookie` | `^3.0.5` | `^3.0.8` | Patch | Compatible cookie helper. |
| `jwt-decode` | `^4.0.0` | `^4.0.0` | Current | Already latest stable. |
| `lucide-react` | `^0.556.0` | `^1.61.0` | Major | Check for removed brand icons (none used in retained code). |
| `next-themes` | `^0.4.6` | `^0.4.6` | Current | Already latest stable. |
| `radix-ui` | `^1.4.3` | `^1.8.1` | Minor | Headless UI package. |
| `react` | `^19.2.3` | `^19.3.1` | Minor | Core React runtime. |
| `react-day-picker` | `^9.13.0` | `^10.0.2` | Major | Migrate deprecated v9 props in `calendar.tsx` and `datepicker.tsx`. |
| `react-dom` | `^19.2.3` | `^19.3.1` | Minor | Core React DOM runtime. |
| `react-hook-form` | `^7.71.2` | `^7.91.0` | Minor | Form state management. |
| `react-router-dom` | `^7.11.0` | `^7.18.4` | Minor | Resolves open redirect & XSS advisories. |
| `sonner` | `^2.0.7` | `^2.0.8` | Patch | Toast notifications. |
| `tailwind-merge` | `^3.4.0` | `^3.7.0` | Minor | Class utility merge. |
| `tailwindcss` | `^4.1.17` | `^4.3.3` | Minor | Tailwind compiler engine. |
| `uuid` | `^13.0.0` | `^14.0.3` | Major | Requires Node >= 20 (satisfied by Node 24). |
| `zod` | `^4.3.6` | `^4.6.7` | Minor | Resolves DoS advisory GHSA-mrhx-c7xc-m3w5. |

### 5.2. Development Dependencies (`devDependencies`)

| Package Name | Current Version | Target Version | Upgrade Type | Notes & Breaking Change Handling |
| --- | --- | --- | --- | --- |
| `@eslint/js` | `^9.39.1` | `^9.39.2` | Patch | Pin to ESLint 9 LTS stream to match `typescript-eslint` 8. |
| `@testing-library/jest-dom` | `^6.9.1` | `^6.9.1` | Current | Keep on v6 for React 19 testing library harmony. |
| `@testing-library/react` | `^16.3.2` | `^16.3.3` | Patch | React 19 test runner. |
| `@types/js-cookie` | `^3.0.6` | `^3.0.6` | Current | Type definitions. |
| `@types/node` | `^24.10.4` | `^24.19.2` | Minor | Aligned to Node.js 24 LTS runtime. |
| `@types/react` | `^19.2.7` | `^19.3.0` | Minor | Type definitions for React 19.3. |
| `@types/react-dom` | `^19.2.3` | `^19.3.0` | Minor | Type definitions for React DOM 19.3. |
| `@vitejs/plugin-react` | `^5.1.2` | `^6.1.2` | Major | Official plugin for Vite 8. |
| `eslint` | `^9.39.2` | `^9.39.2` | Current | Pin to ESLint 9 stream; avoid ESLint 10 until plugin ecosystem transitions. |
| `eslint-plugin-react-hooks` | `^7.0.1` | `^7.1.1` | Minor | React hooks lint rules. |
| `eslint-plugin-react-refresh`| `^0.4.26` | `^0.5.7` | Minor | Vite fast refresh lint rules. |
| `globals` | `^16.5.0` | `^17.13.0` | Major | Browser globals definition. |
| `jsdom` | `^28.1.0` | `^28.1.0` | Current | Pinned to current stable for Node 24 / Vitest harmony. |
| `tw-animate-css` | `^1.4.0` | `^1.4.0` | Current | Already latest. |
| `typescript` | `~5.9.3` | `~6.0.3` | Major | Upgraded to 6.0.3; respects `typescript-eslint` `<6.1.0` limit. |
| `typescript-eslint` | `^8.50.0` | `^8.72.0` | Minor | Supports TypeScript up to `<6.1.0`. |
| `vite` | `npm:rolldown-vite@7.2.5` | `^8.3.5` | Major | Unalias from `rolldown-vite`; use official Vite 8. |
| `vitest` | `^4.0.18` | `^5.0.5` | Major | Official test runner for Vite 8. |

### 5.3. Dependency Overrides

- **Remove override**: Delete `"overrides": { "vite": "npm:rolldown-vite@7.2.5" }` from `package.json`.
- Vite 8 resolves natively without aliases or force flags.

---

## 6. Code Migration & File Modifications

### 6.1. Bundler & Test Configuration (`vite.config.ts`, `vitest.config.ts`)

- In `src/apps/Blocks.Web/vite.config.ts`:
  - Retain `loadEnv` port binding: `server: { port: parseInt(env.VITE_DEV_PORT || "3000"), host: true }`.
  - Retain path alias: `@` -> `./src`.
  - Ensure compatibility with `@vitejs/plugin-react@6` and `@tailwindcss/vite@4`.
- In `src/apps/Blocks.Web/vitest.config.ts`:
  - Vitest 5 enables `clearMocks: true` by default. Set `test: { clearMocks: false }` or verify mock isolation across existing suites to avoid test flakiness.

### 6.2. Calendar & DatePicker Component Migration (`calendar.tsx`, `datepicker.tsx`)

- In `src/apps/Blocks.Web/src/components/ui/datepicker.tsx`:
  - Replace removed `fromYear={fromYear}` and `toYear={toYear}` with:
    ```tsx
    startMonth={fromYear ? new Date(fromYear, 0) : undefined}
    endMonth={toYear ? new Date(toYear, 11) : undefined}
    ```
- In `src/apps/Blocks.Web/src/components/ui/calendar.tsx`:
  - Review `classNames` and component slots against DayPicker 10 deprecations.
  - Verify `vi` locale import from `date-fns/locale` functions correctly under `date-fns@4.4.0`.

### 6.3. Table Adapter Modernization (`data-table.tsx`)

- In `src/apps/Blocks.Web/src/components/ui/data-table.tsx`:
  - Switch imports to use the official legacy adapter:
    ```tsx
    import {
      useLegacyTable,
      getCoreRowModel,
    } from "@tanstack/react-table/legacy";
    import type {
      ColumnDef,
      RowSelectionState,
      OnChangeFn,
    } from "@tanstack/react-table";
    ```
  - Replace `useReactTable` with `useLegacyTable`.
  - All existing `columns` arrays, `rowSelection`, and pagination controls remain 100% compatible.

### 6.4. Regression Test Assertion Updates (`ObsoleteFeatures.test.ts`)

- In `src/apps/Blocks.Web/src/ObsoleteFeatures.test.ts:187-193`:
  - Update the hardcoded test assertions:
    ```tsx
    // Remove obsolete rolldown-vite assertions
    expect(pkg.devDependencies?.vite).toMatch(/^\^8\./);
    expect(pkg.overrides?.vite).toBeUndefined();
    expect(lock.packages?.["node_modules/vite"]?.name).toBe("vite");
    expect(lock.packages?.["node_modules/vite"]?.version).toMatch(/^8\./);
    ```

---

## 7. Verification Plan & Test Strategy

### 7.1. Automated Suite Execution

1. **Clean Installation**:
   ```powershell
   npm --prefix src/apps/Blocks.Web ci
   ```
   Must succeed with exit code 0, without `--force` or `--legacy-peer-deps`.
2. **TypeScript Compilation & Build**:
   ```powershell
   npm --prefix src/apps/Blocks.Web run build
   ```
   Must produce production bundle in `dist/` with zero TypeScript errors (`tsc -b`).
3. **Lint Verification**:
   ```powershell
   npm --prefix src/apps/Blocks.Web run lint
   ```
   Must pass with zero errors. Verify that no new warnings are introduced beyond the existing 10 baseline warnings.
4. **Unit & Integration Suite**:
   ```powershell
   npm --prefix src/apps/Blocks.Web test -- --run
   ```
   All 15 test files (73+ tests) must pass.
5. **Security Audit Verification**:
   ```powershell
   npm --prefix src/apps/Blocks.Web audit
   ```
   Verify that high and critical vulnerabilities in `axios`, `react-router`, and `vitest` are resolved.

### 7.2. Regression Coverage For Previous Gaps

Add dedicated unit tests:
1. `src/apps/Blocks.Web/src/components/ui/datepicker.test.tsx`:
   - Verifies `DatePicker` popover opening, date selection, Vietnamese month formatting, and min/max year constraints (`startMonth`/`endMonth`).
2. `src/apps/Blocks.Web/src/components/ui/combobox.test.tsx`:
   - Verifies search filtering and selection behavior in combobox dropdowns.

### 7.3. Browser Smoke Check

- Launch local Vite dev server on an explicit free port (e.g. `3000` or `5173`).
- Test Desktop (1440x900) and Mobile (390x844):
  - Minimal Home page with greeting.
  - Sidebar navigation and collapsed state.
  - Faculty list page (table rendering, pagination, selection).
  - User detail modal and avatar preview/upload.
  - DatePicker interaction on forms.
  - Not Found page for retired and unknown URLs.
  - Console and network tab: verify 0 uncaught exceptions or failed chunk loads.
