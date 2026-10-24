# Blocks.Web Obsolete Feature Cleanup Design

Date: 2026-10-24
Status: Approved by the user on 2026-10-24. Implementation plan prepared; execution-method selection and implementation remain pending. No product code, routes, or dependencies have been modified yet.

Implementation plan: `docs/superpowers/plans/2026-10-24-blocks-web-obsolete-cleanup.md`.

## 1. Intent And Why

The backend solution (`Blocks.slnx`) has eliminated `Blocks.BusinessService` and `Blocks.CollabService`, and `Blocks.CatalogService` has been scoped strictly to Faculty (`Phòng ban`).

`src/apps/Blocks.Web` still contains legacy screens, routing, types, API clients, and mock hooks from the removed services. These remnants introduce dead dependencies (e.g. TipTap, Yjs, Recharts, docx/xlsx/pdf viewers), leave routes vulnerable to runtime failures when navigated to, cause confusion around active capabilities, and bloat package dependencies.

The user explicitly requested:
1. Complete cleanup of all obsolete business and retired catalog features with no legacy mockups or screens retained.
2. Two-phase execution: execute code and dependency cleanup first, verify build/lint/test, and handle package upgrades subsequently.

## 2. Goals, Non-Goals, And Anti-Goals

### Goals
- Completely remove `src/apps/Blocks.Web/src/features/business/` (all routes, hooks, components, API clients, types, and tests).
- Completely remove the 13 auxiliary catalog files in `src/apps/Blocks.Web/src/features/catalog/` that were retained solely to service `features/business/`.
- Preserve `src/apps/Blocks.Web/src/features/catalog/routes/Faculty/` intact with current contract and "Phòng ban" labels.
- Preserve all active SystemService features (`Auth`, `User`, `Role`, `Menu`, `SystemGroup`, `AuditLog`) and FileService avatar integrations.
- Remove obsolete business route definitions from `Router.tsx` and update the test contract in `Router.catalog.test.ts`.
- Replace the business-dependent `HomePage.tsx` with a minimal authenticated home, not a new dashboard or mockup. Proposed default: existing layout, a Vietnamese welcome heading and current user's display name from auth context; no new API calls, counters, charts, health indicators, or hardcoded navigation to privileged features.
- Clean up unused business endpoint constants and obsolete business preview wrappers.
- Remove obsolete npm dependencies that become unreferenced after business/preview deletion.
- Run frontend build, lint, and tests; distinguish preexisting failures from cleanup regressions.

### Non-Goals
- Upgrading remaining package versions to latest (e.g. Vite 8, React 19 minor bumps, Vitest 5). That is Phase 2 and will be executed separately after this cleanup passes all checks.
- Modifying backend services, database schemas, or database records (e.g. `blocks_system_dev` menu seeds).
- Re-architecting state management or replacing TanStack Query / React Router / Radix UI.

### Anti-Goals
- Retaining placeholder mockups, dead routes, or commented-out business components "for future reference".
- Modifying `Blocks.CatalogService` or re-introducing retired catalog entities/routes.
- Breaking existing authentication, session persistence, role permissions, or avatar upload/view flows.

## 3. Constraints

- Preserve existing changes. Product edits stay inside `src/apps/Blocks.Web`; update repository `AGENTS.md` to reflect the newly authorized frontend removal. Do not change backend source, database, or historical specs.
- Envelope preservation: Maintain `{ Success, StatusCode, Data, Message }` handling in `src/lib/api.ts`.
- Vietnamese localization: Maintain existing Vietnamese UI labels, button text, and messages for all user-facing screens.
- Strict two-phase boundary: Phase 1 is code and dead dependency cleanup only. No package upgrades or major toolchain migrations are permitted in this phase.

## 4. Approaches Considered

1. **Option A (Selected): Two-Phase Execution - Clean Obsolete Code First, Upgrade Dependencies Later**
   - *Description*: Purge all obsolete business and catalog code, dead routes, dead components, and obsolete packages. Verify build, lint, and tests pass against locked dependencies. Once verified and green, plan package upgrades as a clean, isolated second task.
   - *Trade-off*: Requires two distinct verification checkpoints, but guarantees that breaking changes from package upgrades are never conflated with cleanup regressions.

2. **Option B (Rejected): Combined Cleanup and Upgrade**
   - *Description*: Delete dead features and upgrade packages in a single pass.
   - *Trade-off*: High risk of cascading failures where linter errors, breaking API changes (e.g., Vite 8 Rolldown switch, Vitest 5, TypeScript 7 vs typescript-eslint), and deleted import issues compound and become difficult to isolate.

3. **Option C (Ruled Out By User Requirement): Soft Hide / Deprecation via Feature Flags**
   - *Description*: Hide business routes from `Router.tsx` and sidebar but keep `features/business` files on disk.
   - *Trade-off*: Violates the user's explicit directive ("dọn sạch toàn bộ và không giữ lại bất cứ màn hình hay mockup nào của business cũ") and leaves dead code and heavy unused packages in the repo.

## 5. Detailed Component & File Changes (Phase 1)

### 5.1. File Deletions

#### A. Obsolete Business Domain
Delete directory `src/apps/Blocks.Web/src/features/business/` in its entirety, including tests:
- `src/features/business/api/*` (actionPlan, criterionEvaluation, cycle, dashboard, evidence, evidenceCycleMap, externalReview, internalreview, sar, survey-campaign, survey-template, taskExecution)
- `src/features/business/components/*`
- `src/features/business/hooks/*`
- `src/features/business/routes/*` (ActionPlan, CriterionEvaluation, Cycle, Dashboard, Evidence, EvidenceCycleMap, ExternalReview, InternalReview, Sar, SurveyCampaign, SurveyTemplate, TaskExecution)
- `src/features/business/types/*`
- `src/features/business/utils/*`

#### B. Obsolete Catalog Auxiliaries (retained only for business)
Delete the 13 auxiliary catalog files from `src/apps/Blocks.Web/src/features/catalog/`:
- `api/filetype.api.ts`
- `api/standard.api.ts`
- `api/standardset.api.ts`
- `components/MultiStandardSetPanel.tsx`
- `components/StandardCriteriaTable.tsx`
- `hooks/useFileTypeOptions.ts`
- `hooks/useMultiStandardSets.ts`
- `hooks/useStandardSetOptions.ts`
- `hooks/useStandardsWithCriteria.ts`
- `types/filetype.types.ts`
- `types/stakeholder.types.ts`
- `types/standard.types.ts`
- `types/standardset.types.ts`

*Note*: Keep `src/apps/Blocks.Web/src/features/catalog/routes/Faculty/*`, `api/faculty.api.ts`, `hooks/useFaculty.ts`, and `types/faculty.types.ts` intact.

#### C. Obsolete Constants
- Delete `src/apps/Blocks.Web/src/constants/business.constants.ts`.
- Delete `src/apps/Blocks.Web/src/constants/catalog.constants.ts` (confirmed unreferenced outside deleted business/catalog files).
- Remove the obsolete frontend external-review marker as one connected change: `EXT_ROLE_ID` in `constants/roles.ts`, derived `isExternalReviewer` in `contexts/AuthContext.tsx` and `hooks/useAuth.ts`, its field in `features/system/types/auth.types.ts`, and obsolete mock fields in retained tests. Confirm no non-business behavior consumes the marker before deletion.
- Keep real role records, role APIs, `RoleId`, permissions and login/session logic unchanged. Removing this UI-only derived marker does not authorize deleting external-review accounts or roles from the database.

#### D. Obsolete UI Components & Viewers (Only consumed by business)
- `src/apps/Blocks.Web/src/components/ui/chart.tsx`: Consumed only by business dashboard and survey campaign.
- `src/apps/Blocks.Web/src/components/ui/upload-file.tsx` and `src/components/ui/upload-file.test.tsx`: Consumed only by business evidence/action plans (System uses `upload-avatar.tsx`).
- `src/apps/Blocks.Web/src/components/ui/file-viewer-dialog.tsx`, `file-viewer-dialog.test.tsx`, `excel-viewer.tsx`, `pdf-viewer.tsx`: Used only inside `upload-file.tsx`.
- `src/apps/Blocks.Web/src/lib/pdf-worker.ts`: Only used by `pdf-viewer.tsx`.
- Delete `src/apps/Blocks.Web/src/lib/file-utils.ts` after confirming its sole remaining consumer is the removed file viewer.
- Inspect `components/ui/carousel.tsx` and other supporting components for transitive business-only use. Remove only the obsolete feature's now-unreferenced support chain, not unrelated UI primitives.
- In `styles/index.css`, remove obsolete `.ProseMirror` and `.collaboration-cursor__*` rules. Remove chart tokens and custom scrollbar rules only when no retained consumer references them; preserve base theme and shared animation behavior used by dialogs/popovers.
- Check business-specific assets/config references before removal. Do not delete generic brand assets, rewrite environment configuration or expose local secrets.

### 5.2. File Modifications

#### A. `src/apps/Blocks.Web/src/Router.tsx`
- Remove all imports of business pages (`CyclePage`, `EvidencePage`, `EvidenceCycleMapPage`, `SurveyTemplatePage`, `SurveyCampaignPage`, `CriterionEvaluationPage`, `SarPage`, `InternalReviewPage`, `ExternalReviewPage`, `ActionPlanPage`, `TaskExecutionPage`, `DoSurveyPage`).
- Remove the corresponding 12 `<Route>` elements: `/cycle`, `/evidence`, `/evidencecyclemap`, `/surveytemplate`, `/surveycampaign`, `/criterionevaluation`, `/sar`, `/internalreview`, `/externalreview`, `/actionplan`, `/taskexecution`, and public `/survey/do-survey`.
- Retained routes:
  - `/login` (`LoginPage`)
  - Authenticated layout wrapper:
    - `/` (`HomePage`)
    - `/user` (`UserPage`)
    - `/faculty` (`FacultyPage`)
    - `/systemgroup` (`SystemGroupPage`)
    - `/menu` (`MenuPage`)
    - `/role` (`RolePage`)
    - `/auditlog` (`AuditLogPage`)
  - `/unauthorized` (`UnauthorizedPage`)
- Proposed default for removed and otherwise unmatched URLs: one generic client-side not-found route (`*`), no legacy page, API request, or automatic business fallback. Render a short Vietnamese not-found message and home link outside the authenticated layout; expose no private data. Keep `/login` public and existing protected routes and `/unauthorized` behavior unchanged. This is SPA rendering, not a promise of an HTTP 404 status from the static server.

#### B. `src/apps/Blocks.Web/src/pages/Home/HomePage.tsx`
- Remove all imports from `@/features/business/routes/Dashboard/*`.
- Proposed default: a small Vietnamese welcome heading and current user's display name from existing auth context within the existing authenticated layout.
- No KPI cards, carousel, system status, new data-fetching hooks, mock numbers, or feature shortcuts. Users continue navigating through the existing permission-aware application flow.
- Keep `/` as the post-login destination. Do not redirect everyone to `/user` or `/faculty`, because not every signed-in account has access to those pages.
- Update `HomePage.test.tsx` to verify retained home rendering, safe missing-name fallback, and no business imports or network calls from Home.

#### C. `src/apps/Blocks.Web/src/Router.catalog.test.ts`
- Update the expected paths to the nine retained paths listed above plus `*`.
- Update test `business_catalog_dependencies_remain` to assert absence (or rename test to reflect that obsolete dependencies were cleanly removed and only `Faculty` remains).

#### D. `src/apps/Blocks.Web/src/components/layout/MainLayout/app-sidebar.tsx`
- Extend the `retiredKeys` list in `app-sidebar.tsx` to filter out business controllers:
  ```ts
  const retiredKeys = new Set([
    "filetype", "stakeholder", "standard", "standardset",
    "cycle", "evidence", "evidencecyclemap", "surveytemplate", "surveycampaign",
    "criterionevaluation", "sar", "internalreview", "externalreview",
    "actionplan", "taskexecution"
  ]);
  ```
  Apply the existing case-insensitive retired-controller filter to direct menus, subgroups, empty-group checks, and active state. This prevents the known retired business menus from being rendered even when old rows remain cached or are returned by SystemService.
- Update `src/apps/Blocks.Web/src/components/layout/MainLayout/app-sidebar.test.tsx` to assert that business keys are filtered out just like retired catalog keys.
- Preserve other controllers, ordering, permissions, `IsShowMenu` semantics, and cache loading. Do not switch to a global route allowlist or rewrite AuthContext storage. Menu/Role management screens still display server-owned records; hiding retired sidebar links is not authorization to alter those records.

#### E. `src/apps/Blocks.Web/src/features/file/api/uploadfile.api.ts`
- Remove the three preview methods calling absent business endpoints: `previewFile`, `previewActionPlanAttachment`, and `previewTaskAttachment`.
- Keep `uploadFile`, `UploadFileRequest`, and `getAvatarBlob`, including avatar key/MIME validation, cancellation, soft-error handling, and staging/commit behavior.
- Remove the business-only `uploadFileEmbed` and generic legacy `fileService.downloadFile` wrapper after a caller check. Keep the shared `api.downloadFile` implementation, which active avatars use.
- Remove unreferenced `Attachment` and `PreviewFileResult` types and obsolete File endpoint constants. Retain `API_ENDPOINTS.File.UploadFile.POST` and `API_ENDPOINTS.File.Avatar.GET`.
- Business preview URLs were intentional domain authorization boundaries, not wrong routes. Delete their callers; never redirect them to a raw FileService endpoint. Do not modify FileService or Gateway compatibility behavior such as `/embed`.

#### F. `src/apps/Blocks.Web/src/config/constants.ts`
- Remove `const BUSINESS_BASE = "/Business";`.
- Remove the entire `API_ENDPOINTS.Business` block.
- In `API_ENDPOINTS.Catalog`, remove `Stakeholder`, `FileType`, `Standard`, and `StandardSet` endpoints, retaining only `Faculty`.

### 5.3. Dependency Removals in `package.json`
Remove the following direct dependencies once their complete source support chain is deleted. Regenerate the existing lockfile without deleting it or running a broad upgrade:
- `@sereneinserenade/tiptap-comment-extension`
- `@tiptap/extension-collaboration`
- `@tiptap/extension-collaboration-cursor`
- `@tiptap/extension-image`
- `@tiptap/extension-link`
- `@tiptap/extension-table`
- `@tiptap/extension-table-cell`
- `@tiptap/extension-table-header`
- `@tiptap/extension-table-of-contents`
- `@tiptap/extension-table-row`
- `@tiptap/extension-text-align`
- `@tiptap/extension-underline`
- `@tiptap/react`
- `@tiptap/starter-kit`
- `y-websocket`
- `yjs`
- `recharts`
- `docx-preview`
- `xlsx`
- `pdfjs-dist`

Keep all retained dependency ranges, locked package versions, Vite alias, overrides, scripts, and toolchain configuration unchanged. Review the lockfile diff against the baseline: any unavoidable re-resolution must be explained, not silently accepted as an upgrade. Then validate the result with `npm --prefix src/apps/Blocks.Web ci`.

In particular, keep `uuid` (active user/profile/avatar callers), `date-fns`, `react-day-picker`, `cmdk`, `radix-ui`, individual Radix primitives, TanStack Query/Table, axios and auth libraries. Do not treat their presence in business code as proof they are obsolete. Any further package removal needs a retained-caller/config check; no generic dependency cleanup or deduplication in this phase.

### 5.4. Documentation And Remaining Decisions

- Update only the current-checkout/frontend guidance in `AGENTS.md`: business UI has been intentionally removed, Catalog retains Faculty, and avatar remains active. Preserve historical design docs and backend boundary instructions.
- Home content and generic not-found behavior are proposed minimal defaults, not decisions already made by the user. Approval of this document accepts those defaults; implementation stays blocked until that approval.
- Builder chooses exact test organization, minor JSX structure, and supporting-file deletion order within this scope. No new framework, dependency, generic abstraction, dashboard feature or backend is required.

## 6. Verification Plan

Before product edits, inspect the existing test setup and record build/lint/test baselines using installed locked dependencies (or `npm ci` if installation is needed after approval). Keep baseline failures and warnings separate. Do not weaken active tests or ESLint rules to achieve a green result.

1. **Static Analysis & Build**:
   ```powershell
   npm --prefix src/apps/Blocks.Web run build
   npm --prefix src/apps/Blocks.Web run lint
   ```
   Target: no new TypeScript or ESLint errors. Preexisting unrelated failures must be reported, not absorbed into a broader refactor. Do not call the checkpoint green while failures remain.

2. **Automated Unit & Integration Tests**:
   ```powershell
   npm --prefix src/apps/Blocks.Web test
   ```
   All remaining tests in `src/apps/Blocks.Web` must pass, including:
   - `Router.catalog.test.ts`
   - `src/pages/Home/HomePage.test.tsx`
   - `src/features/catalog/routes/Faculty/Faculty.test.tsx`
   - `src/features/system/routes/User/PopupDetail.test.tsx`
   - `src/components/layout/MainLayout/app-sidebar.test.tsx`
   - `src/components/layout/MainLayout/NavUser.test.tsx`
   - `src/features/file/hooks/useAvatarUrl.test.tsx`
   - Upload/avatar/profile tests, shared `api.test.ts`, and `uploadfile.api.test.ts`.

   Add or update focused checks for:
   - Absence of retired routes, files, imports, endpoints and removed dependencies.
   - Home without business calls; unmatched retired URLs render only not-found.
   - Cached business/catalog menu keys with mixed case, direct/nested/empty/mixed groups; active Faculty/System navigation and permission objects preserved.
   - Existing login protection, authorized/unauthorized retained-route behavior, avatar upload/view and profile save/error handling. Isolated UI mocks are not proof of backend authorization.
   - No obsolete external-review UI marker or editor CSS remains; legitimate audit terminology/permission fields must not be removed by a broad text match.

3. **Browser And Scope Review**:
   - Run the local Vite server on a free port; provide its URL after implementation.
   - Check desktop/mobile rendering, Home, sidebar, not-found and retained screens with isolated fixtures or an explicitly available authorized environment.
   - Do not write to application databases for smoke tests. Live CRUD, permission enforcement, audit persistence and external integrations remain NOT RUN unless an authorized isolated environment exists.
   - Review `git diff --check`, changed paths and final lockfile. No backend, database, machine config, generated output or secrets in the diff.

No full backend build is required for this frontend-only change. Backend source regression checks may provide supplemental evidence but do not prove service health.

## 7. Phase 2 Handoff

Package upgrades start only after the cleanup checkpoint is reviewed. Preserve this cleanup as a separate diff/commit boundary. Re-query official registry metadata and release notes at that time; versions observed during initial analysis are not a future upgrade manifest.

Prepare a separate compatibility proposal for retained runtime and development packages, including Node/CI runtime, React/types, Vite/plugin/Tailwind, Vitest/jsdom, ESLint/TypeScript, and TanStack Table. Distinguish registry `latest` from the newest mutually supported set. Do not use force or legacy-peer-deps to hide a conflict, and do not migrate the toolchain as part of Phase 1.
