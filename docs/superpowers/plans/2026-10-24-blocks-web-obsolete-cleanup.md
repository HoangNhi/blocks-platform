# Blocks.Web Obsolete Feature Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove legacy Business and retired Catalog frontend code completely while preserving System, Faculty and avatar workflows; defer retained-package upgrades to Phase 2.

**Architecture:** Detach Home, sidebar and routing first, each with focused regression tests. Then delete the obsolete feature and its dependent clients, types, viewers and styles as one buildable change. Finally prune dead packages without upgrading retained versions and verify the complete frontend.

**Tech Stack:** Existing React 19, TypeScript 5.9.3, `npm:rolldown-vite@7.2.5`, Tailwind CSS 4, Radix UI, TanStack Query/Table, Vitest and Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-24-blocks-web-obsolete-cleanup-design.md` (approved by user on 2026-10-24).

## Global Constraints

- Product edits stay inside `src/apps/Blocks.Web`; update repository `AGENTS.md`. No backend, database, storage, machine configuration or historical-spec changes.
- Phase 1 is code and dead dependency cleanup only. No package upgrades or major toolchain migrations.
- Maintain `{ Success, StatusCode, Data, Message }` handling in `src/lib/api.ts`, token refresh, permissions, session persistence and active avatar security.
- Preserve Vietnamese UI text and accessibility. Home has no dashboard, mock figures, new requests or hardcoded privileged shortcuts.
- Keep retained dependency ranges, locked versions, Vite alias, overrides, scripts and toolchain configuration unchanged. No `--force`, `--legacy-peer-deps`, broad update or lockfile deletion.
- Preserve user changes and untracked files. Do not stage unrelated edits, remove generated directories, or delete files solely because their name matches a business term.
- Baseline failures stay separate from regressions. No weaker ESLint rules, disabled retained tests or full-system claims from isolated checks.

## Review Focus

- Cached mixed-case retired controllers in nested/mixed groups: hide retired links and empty groups; preserve other menu semantics and permission objects (Task 2).
- Old deep links, including `/survey/do-survey?token=...`: render generic not-found outside private layout with no business calls; retained routes still enforce existing login/permission checks (Task 3).
- Signed-in account with no management permissions or missing/blank `Fullname`: Home stays usable without privileged redirects or new requests (Task 1).
- Avatar upload failure, staged retry, cancellation and JSON error envelope: preserve selection, validation and shared blob error handling (Task 4).
- Package pruning on a fresh install: remove dead roots and private transitives without silently upgrading packages still used by System/Faculty/avatar (Task 5).

---

## File Map And Execution Order

Paths below are repository-relative. Each task repeats its write set so a worker can execute it without inheriting conversation history.

| Owner | Files | Responsibility |
| --- | --- | --- |
| Task 1 | `src/apps/Blocks.Web/src/pages/Home/HomePage.tsx`, `HomePage.test.tsx` | Minimal authenticated Home; baseline record |
| Task 2 | `src/apps/Blocks.Web/src/components/layout/MainLayout/app-sidebar.tsx`, `app-sidebar.test.tsx` | Retired sidebar controllers; no auth/cache rewrite |
| Task 3 | `src/apps/Blocks.Web/src/Router.tsx`, `Router.catalog.test.ts`, new `Router.behavior.test.tsx`, new `pages/common/NotFoundPage.tsx` | Retained route contract and real routing behavior |
| Task 4 | `features/business/`, 13 Catalog auxiliaries, dead UI/files/styles/constants, file client, auth-derived marker, new `src/ObsoleteFeatures.test.ts` | Atomic removal of obsolete source and all consumers |
| Task 5 | `src/apps/Blocks.Web/package.json`, `package-lock.json`, `src/ObsoleteFeatures.test.ts`, root `AGENTS.md` | Dead packages, reproducible lockfile and current guide |
| Task 6 | Existing tests and browser fixtures; no new production surface | Final checks, visual smoke and Phase 2 handoff |

Execute Tasks 1-3 before Task 4; Task 5 depends on Task 4. Task 6 depends on all prior tasks. Do not commit a state where deleted constants/types still have live imports.

At execution time, use the required worktree workflow before implementation; include the approved spec and this plan in that workspace even if still untracked here. Keep the configured model/provider. Follow repository delegation policy for useful independent work; do not let concurrent workers share a lockfile, install, build output or dev-server port.

## Task 1: Baseline And Minimal Home

**Files:**
- Modify: `src/apps/Blocks.Web/src/pages/Home/HomePage.tsx`
- Test: `src/apps/Blocks.Web/src/pages/Home/HomePage.test.tsx`

**Interfaces:**
- Consumes: `useAuth(): AuthContextType`, particularly `user: User | null` and `user.Fullname`.
- Produces: existing default `HomePage` component; `/` remains the post-login destination.

- [ ] **Step 1: Capture pre-edit baseline.**

Run `git status --short` and `git rev-parse HEAD`; record the starting SHA as `BLOCKS_WEB_CLEANUP_BASELINE` for Task 5. Inspect `package.json`, `vitest.config.ts` and `src/test/setup.ts`. If dependencies need installation, use `npm --prefix src/apps/Blocks.Web ci`; do not use `npm install` as a baseline upgrade.

Run these separately and record exit codes, failed test names and warning counts:

```powershell
npm --prefix src/apps/Blocks.Web run build
npm --prefix src/apps/Blocks.Web run lint
npm --prefix src/apps/Blocks.Web test
```

Baseline is evidence, not a requirement to fix unrelated defects. If starting package files have user edits, preserve a local non-secret snapshot for Task 5 rather than assuming HEAD contains them. Do not claim these commands ran while only preparing this plan.

- [ ] **Step 2: Write failing Home assertions.**

Replace the dashboard expectations in `HomePage.test.tsx` with tests named `renders_authenticated_welcome`, `handles_missing_or_blank_fullname`, and `does_not_fetch_or_link_to_privileged_features`.

Mock `useAuth`; for the RED run temporarily keep the existing dashboard mocks with empty data so failure concerns Home content rather than a missing QueryClient. Pin these assertions:

```tsx
expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Xin chào, Test User");
expect(screen.queryByRole("link")).not.toBeInTheDocument();
expect(api.get).not.toHaveBeenCalled();
expect(api.post).not.toHaveBeenCalled();
```

Spy/mock `api.get` and `api.post` locally. Parameterize `user: null`, empty name and whitespace name: heading text equals `"Xin chào"` without `"undefined"`, `"null"` or a trailing comma. An account with empty permissions must render Home without navigating elsewhere.

- [ ] **Step 3: Prove RED.**

Run `npm --prefix src/apps/Blocks.Web test -- src/pages/Home/HomePage.test.tsx`. Expected: new welcome-heading assertion fails against the old dashboard, not a collection/import failure.

- [ ] **Step 4: Replace Home only.**

Keep `HomePage` as a small function component. Read `user?.Fullname?.trim()` from `useAuth`; show `"Xin chào"` with optional `", <name>"`. Remove all business, chart and carousel imports. Use existing theme/layout, normal heading sizing and zero letter-spacing; no KPI, role dashboard, status widget, new request or privileged link. Remove temporary business mocks from the final Home tests.

- [ ] **Step 5: Prove GREEN and build.**

Run the focused command from Step 3 and frontend build. Expected: focused tests pass and no new build errors. Record any retained baseline failures.

- [ ] **Step 6: Commit only this task's two files.**

Suggested message: `refactor(web): replace business dashboard with minimal home`.

## Task 2: Retire Business Sidebar Links

**Files:**
- Modify: `src/apps/Blocks.Web/src/components/layout/MainLayout/app-sidebar.tsx`
- Test: `src/apps/Blocks.Web/src/components/layout/MainLayout/app-sidebar.test.tsx`

**Interfaces:**
- Consumes: existing `useAuth` menu/systemGroup/permissions and `AppSidebar` props.
- Produces: unchanged `AppSidebar` export and retained filtering semantics with expanded retired keys.

- [ ] **Step 1: Add failing table-driven sidebar tests.**

Extend the current fixtures, not the production auth provider. Include every retired key:

```ts
const retiredKeys = [
  "filetype", "stakeholder", "standard", "standardset",
  "cycle", "evidence", "evidencecyclemap", "surveytemplate",
  "surveycampaign", "criterionevaluation", "sar", "internalreview",
  "externalreview", "actionplan", "taskexecution",
];
```

`cached_business_menus_are_hidden_at_each_level` must exercise lower/upper/mixed case in direct and child menus, mixed retained/retired groups, retired-only roots/subgroups and empty arrays. Open mixed groups before inspecting links; otherwise absent collapsed links prove nothing. For retained User, explicitly click its group:

```tsx
fireEvent.click(screen.getByRole("button", { name: "Hệ thống" }));
expect(screen.getByRole("link", { name: "Người dùng" })).toHaveAttribute("href", "/user");
expect(authState.permissions).toEqual(originalPermissions);
```

Keep existing Faculty active-state assertions and `hidden-feature` with `IsShowMenu=false` rendered as before. Freeze input menu/permission objects and verify no mutation.

- [ ] **Step 2: Prove RED.**

Run `npm --prefix src/apps/Blocks.Web test -- src/components/layout/MainLayout/app-sidebar.test.tsx`. Expected: a retired business-only group or opened business link remains visible.

- [ ] **Step 3: Extend only the existing retired-controller set.**

Use the exact keys in Step 1; preserve the existing lowercase comparison and use of `filteredMenu` across groups/active state. No allowlist, new metadata fetch, cache clearing, permission filtering, sorting change or `IsShowMenu` policy change.

- [ ] **Step 4: Prove GREEN.**

Repeat Step 2. Expected: all old/new sidebar tests pass, retained links and frozen permissions survive.

- [ ] **Step 5: Commit only both sidebar files.**

Suggested message: `fix(web): hide retired business menus from sidebar`.

## Task 3: Retained Routes And Generic Not-Found

**Files:**
- Modify: `src/apps/Blocks.Web/src/Router.tsx`
- Test: `src/apps/Blocks.Web/src/Router.catalog.test.ts`
- Create/Test: `src/apps/Blocks.Web/src/Router.behavior.test.tsx`
- Create: `src/apps/Blocks.Web/src/pages/common/NotFoundPage.tsx`
- Read only: `src/apps/Blocks.Web/src/components/auth/ProtectedRoute.tsx`

**Interfaces:**
- Consumes: real `Router`/`ProtectedRoute`, stable mocked `useAuth`, React Router `<Link>`.
- Produces: default `NotFoundPage(): React.JSX.Element`, public `*` fallback and unchanged guards around retained routes.

- [ ] **Step 1: Write failing route and behavior assertions.**

Update the AST route assertion in `Router.catalog.test.ts` to exactly:

```ts
expect(paths.sort()).toEqual([
  "/", "/login", "/user", "/faculty", "/systemgroup",
  "/menu", "/role", "/auditlog", "/unauthorized", "*",
].sort());
```

Keep `business_catalog_dependencies_remain` temporarily: Task 4 owns its replacement when files are deleted.

In `Router.behavior.test.tsx`, import the real default `Router` and real `ProtectedRoute`. Stub heavy retained page modules with simple sentinels; stub `MainLayout` with `<Outlet context={{ permission }} />`, preserving the permission prop passed by the guard. Mock `useAuth` with stable async `getPermission` and a fixed state per mount. During RED, temporarily stub business page modules too if their editor/provider imports otherwise prevent test collection; remove those stubs when their Router imports are removed.

Use `window.history.replaceState({}, "", path)` before `render(<Router />)`; do not nest MemoryRouter around its BrowserRouter. Clean up between mounts. Tests:

- `retired_and_unknown_urls_show_only_not_found`: every 12 business paths listed in spec, four retired Catalog paths, `/survey/do-survey?token=obsolete-test-token`, and `/unknown/deep-link` render `"Trang không tồn tại"` with home link `href="/"`; private layout/page sentinels and `api.get/post` calls are absent.
- `login_stays_public`: unauthenticated `/login` renders Login sentinel without a permission request.
- `retained_routes_stay_guarded`: `/`, `/user`, `/faculty`, `/systemgroup`, `/menu`, `/role`, `/auditlog` require login; authenticated permission denial shows Unauthorized; `IsViewed=true` renders the requested sentinel. Test direct mounts to avoid conflating existing client-side navigation bugs with this cleanup.
- `not_found_has_safe_home_link`: test both signed-in/out states; `getPermission` is not called for fallback; home link offers normal navigation, not an auth bypass.

- [ ] **Step 2: Prove RED.**

Run `npm --prefix src/apps/Blocks.Web test -- src/Router.catalog.test.ts src/Router.behavior.test.tsx`. Expected: route-set and fallback behavior fail against the current router.

- [ ] **Step 3: Detach business routes and add not-found.**

Delete the 12 business imports/routes from `Router.tsx`, including public survey. Keep seven protected pages, public Login and existing Unauthorized layout exactly as before. Add one outer `<Route path="*" element={<NotFoundPage />} />` outside private layout.

`NotFoundPage` contains a semantic Vietnamese not-found heading and `"Về trang chủ"` Link to `/`, using existing visual conventions with no provider/data dependency. No backend/server rewrite, redirect to business, or implied HTTP status guarantee.

- [ ] **Step 4: Prove GREEN and build.**

Repeat Step 2 and run frontend build. Expected: all listed paths and guard cases pass; business source still exists until Task 4.

- [ ] **Step 5: Commit exactly the four written files.**

Suggested message: `refactor(web): retire business routes and add not-found fallback`.

## Task 4: Atomic Obsolete Source Removal

**Files:**
- Delete: all tracked files under `src/apps/Blocks.Web/src/features/business/`.
- Delete: the 13 exact Catalog auxiliaries from spec Section 5.1.B; preserve `routes/Faculty/`, `api/faculty.api.ts`, `hooks/useFaculty.ts`, `types/faculty.types.ts`.
- Delete: `src/apps/Blocks.Web/src/constants/business.constants.ts`, `catalog.constants.ts`, `roles.ts`.
- Delete: `src/apps/Blocks.Web/src/components/ui/chart.tsx`, `upload-file.tsx`, `upload-file.test.tsx`, `file-viewer-dialog.tsx`, `file-viewer-dialog.test.tsx`, `excel-viewer.tsx`, `pdf-viewer.tsx`.
- Delete after caller check: `src/apps/Blocks.Web/src/components/ui/carousel.tsx`, `src/apps/Blocks.Web/src/lib/pdf-worker.ts`, `src/apps/Blocks.Web/src/lib/file-utils.ts`.
- Modify: `src/apps/Blocks.Web/src/features/file/api/uploadfile.api.ts`, `src/apps/Blocks.Web/src/features/file/types/uploadfile.types.ts`, `src/apps/Blocks.Web/src/config/constants.ts`.
- Modify: `src/apps/Blocks.Web/src/contexts/AuthContext.tsx`, `src/apps/Blocks.Web/src/hooks/useAuth.ts`, `src/apps/Blocks.Web/src/features/system/types/auth.types.ts`.
- Modify/Test: `src/apps/Blocks.Web/src/components/layout/MainLayout/NavUser.test.tsx`, `src/apps/Blocks.Web/src/features/file/hooks/useAvatarUrl.test.tsx`, `src/apps/Blocks.Web/src/Router.catalog.test.ts`.
- Modify/Test: `src/apps/Blocks.Web/src/features/file/api/uploadfile.api.test.ts`, `src/apps/Blocks.Web/src/components/layout/MainLayout/PopupEditProfile.test.tsx`.
- Modify: `src/apps/Blocks.Web/src/styles/index.css`.
- Create/Test: `src/apps/Blocks.Web/src/ObsoleteFeatures.test.ts`.

**Interfaces:**
- Consumes: Task 1-3 exports and route/sidebar contracts.
- Produces: `fileService.uploadFile(request: UploadFileRequest): Promise<ApiResponse<void>>`, `fileService.getAvatarBlob(key: string, signal?: AbortSignal): Promise<Blob>`.
- Produces: unchanged `UploadFileRequest { files: File[]; folderUpload: string }`, all `API_ENDPOINTS.System`, `API_ENDPOINTS.Catalog.Faculty`, `API_ENDPOINTS.File.UploadFile.POST`, `API_ENDPOINTS.File.Avatar.GET`.
- Produces: same `useAuth(): AuthContextType` contract minus UI-only `isExternalReviewer`; real role/permission data unchanged.

- [ ] **Step 1: Write focused failing absence and retained-client checks.**

Create `ObsoleteFeatures.test.ts` using `// @vitest-environment node`, `node:fs`, `node:path` and the already-installed TypeScript parser. Resolve paths from `import.meta.url`; scan production `.ts/.tsx` imports/exports, excluding tests. Pin exact retired paths/symbols, not every occurrence of words like `business` or `approval`.

Tests assert absence of the Business tree, 13 Catalog files, listed dead viewer/helper/constants files, imports of them, obsolete auth marker in its three production files, editor/collab CSS and unreferenced chart/custom-scrollbar rules. Assert active Faculty files and branding assets remain. Replace `business_catalog_dependencies_remain` with these new explicit absence assertions; do not drop regression coverage silently.

In the existing file API test add:

```ts
expect(Object.keys(fileService).sort()).toEqual(["getAvatarBlob", "uploadFile"]);
expect(Object.keys(API_ENDPOINTS).sort()).toEqual(["Catalog", "File", "System"]);
expect(Object.keys(API_ENDPOINTS.Catalog)).toEqual(["Faculty"]);
expect(Object.keys(API_ENDPOINTS.File.UploadFile)).toEqual(["POST"]);
```

Extend that file's API mock with `post`. `upload_keeps_formdata_contract` checks POST path `/File/api/UploadFile`, FormData `files` and `FolderName`, 300000 ms timeout, multipart header and returned envelope; a rejected upload must propagate rejection. Keep existing invalid-key/MIME tests.

Add `staged_replacement_keeps_folder_and_save_failure_state` and `upload_failure_prevents_profile_save` to `PopupEditProfile.test.tsx` using its current `mockUpload`. Assert staged upload sends `AvatarAction="replace"` with the same folder; failed save does not reset selection/close; upload rejection never calls `saveChange`.

- [ ] **Step 2: Prove RED for cleanup assertions.**

Run `npm --prefix src/apps/Blocks.Web test -- src/ObsoleteFeatures.test.ts src/features/file/api/uploadfile.api.test.ts src/components/layout/MainLayout/PopupEditProfile.test.tsx`. Expected: absence/method-set assertions fail; retained-avatar characterization checks pass or expose a separately recorded baseline defect.

- [ ] **Step 3: Remove one connected obsolete source chain.**

Read callers with `rg` before deletion. Remove the Business tree, exact Catalog auxiliaries, constants, viewers and helpers from the write set, including tests exclusively for deleted behavior. Prefer apply_patch for individual edits/deletions. Before any recursive PowerShell deletion, resolve and verify its absolute target remains under this repository's `src/apps/Blocks.Web/src/features/business`; preserve unexpected untracked files.

At the same checkpoint remove `API_ENDPOINTS.Business`, retired Catalog endpoints, `File.UploadFile.GET/EMBED`, five dead file client methods (`uploadFileEmbed`, `downloadFile`, `previewFile`, `previewActionPlanAttachment`, `previewTaskAttachment`) and `Attachment`/`PreviewFileResult` types.

Delete only `EXT_ROLE_ID`/derived `isExternalReviewer` from provider/hook/interface and obsolete test mock fields; `useAuth` may return the checked context directly. Keep login/logout, cache, permission lookup, `RoleId`, backend role/account records and shared `api.downloadFile` untouched.

Remove editor/collaboration CSS and no-longer-referenced chart/custom-scrollbar rules. Preserve theme/base styles and shared animation classes/keyframes. Inspect tracked assets/config references for feature-only remnants; remove only proven obsolete support files, never generic Radix components, brand assets or local environment settings.

Do not repoint retired previews to raw FileService URLs or change backend `/embed` behavior.

- [ ] **Step 4: Prove GREEN and check retained workflows.**

Repeat Step 2, then run:

```powershell
npm --prefix src/apps/Blocks.Web test -- src/Router.catalog.test.ts src/Router.behavior.test.tsx src/components/ui/upload-avatar.test.tsx src/components/ui/avatar.test.tsx src/components/layout/MainLayout/NavUser.test.tsx src/features/file/hooks/useAvatarUrl.test.tsx src/features/system/routes/User/PopupDetail.test.tsx src/features/catalog/routes/Faculty/Faculty.test.tsx src/lib/api.test.ts
npm --prefix src/apps/Blocks.Web run build
```

Expected: no dead imports; active upload/retry/removal, cancellation/object-URL lifetime, JSON soft-error/auth refresh, profile and Faculty regressions pass. `rg` remaining Business/Collab references; explicitly justify references in tests that assert removal. Do not remove audit terminology or live permission fields.

- [ ] **Step 5: Commit only reviewed source changes for this task.**

Review `git diff --name-status` before staging deleted files. Suggested message: `refactor(web): purge obsolete business and supporting source`.

## Task 5: Dead Dependencies, Lockfile And Current Guide

**Files:**
- Modify: `src/apps/Blocks.Web/package.json`
- Regenerate: `src/apps/Blocks.Web/package-lock.json`
- Test: `src/apps/Blocks.Web/src/ObsoleteFeatures.test.ts`
- Modify: `AGENTS.md`

**Interfaces:**
- Consumes: Task 4 source tree and Task 1 package baseline.
- Produces: installable locked dependency tree with only the approved 20 direct packages removed; current guide reflecting active frontend.

- [ ] **Step 1: Add failing package-removal assertions.**

Read both JSON manifests with JSON.parse in `ObsoleteFeatures.test.ts`. Assert the 20 names from spec Section 5.3 are absent from `dependencies` and lockfile root dependencies; assert exact Vite alias and override `"npm:rolldown-vite@7.2.5"` remain. Keep `uuid`, `date-fns`, `react-day-picker`, `cmdk`, `radix-ui`, individual Radix primitives, TanStack Query/Table and auth/client packages.

- [ ] **Step 2: Prove RED.**

Run `npm --prefix src/apps/Blocks.Web test -- src/ObsoleteFeatures.test.ts`. Expected: the dead-package assertions fail against current manifests.

- [ ] **Step 3: Remove only approved dead roots.**

Use apply_patch on package.json: remove comment extension, all 13 declared `@tiptap/*` packages, `yjs`, `y-websocket`, `recharts`, `docx-preview`, `xlsx`, `pdfjs-dist`. No additions, range edits, override changes or extra Radix/package deduplication.

- [ ] **Step 4: Regenerate existing lockfile and inspect it.**

Run `npm --prefix src/apps/Blocks.Web install --package-lock-only --ignore-scripts`. Inspect resulting diff before installation. Compare root dependencies and every retained lockfile path's version/resolved/integrity against Task 1 baseline using structured JSON, not substring matching.

If baseline manifests are committed and unchanged, use this read-only check after setting `$env:BLOCKS_WEB_CLEANUP_BASELINE` to the SHA recorded in Task 1:

```powershell
@'
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
assert(process.env.BLOCKS_WEB_CLEANUP_BASELINE, "Missing cleanup baseline SHA");
const path = "src/apps/Blocks.Web/package-lock.json";
const before = JSON.parse(execFileSync("git", ["show", `${process.env.BLOCKS_WEB_CLEANUP_BASELINE}:${path}`], { encoding: "utf8" }));
const after = JSON.parse(fs.readFileSync(path, "utf8"));
const manifestPath = "src/apps/Blocks.Web/package.json";
const oldManifest = JSON.parse(execFileSync("git", ["show", `${process.env.BLOCKS_WEB_CLEANUP_BASELINE}:${manifestPath}`], { encoding: "utf8" }));
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
for (const field of ["devDependencies", "scripts", "overrides"])
  assert.deepEqual(manifest[field], oldManifest[field], `${field} changed`);
for (const [name, range] of Object.entries(manifest.dependencies))
  assert.equal(range, oldManifest.dependencies[name], `${name}: range drift`);
for (const [key, entry] of Object.entries(after.packages)) {
  if (!key) continue;
  assert(before.packages[key], `Unexpected new lockfile path: ${key}`);
  for (const field of ["version", "resolved", "integrity"])
    assert.equal(entry[field], before.packages[key][field], `${key}: ${field} drift`);
}
console.log("PASS retained lockfile entries unchanged");
'@ | node
```

Expected: PASS plus removed dead roots/private transitives. Do not hand-edit integrity/resolved fields or suppress drift. If npm needs unavoidable hoisting/re-resolution, inspect and record exact affected packages; stop for review before accepting a retained-version change. Use the saved local snapshot instead if Task 1 found user-edited manifests.

- [ ] **Step 5: Verify clean installation and GREEN.**

Run `npm --prefix src/apps/Blocks.Web ci`, then the focused command from Step 2. Expected: reproducible install, all absence/manifest tests pass, no forced peer-resolution workaround.

- [ ] **Step 6: Update current-checkout guide and commit.**

Replace AGENTS.md's now-stale frontend-business-exists rule with intentional removal: active System, Faculty and avatar; do not reintroduce Business/Collab. Preserve backend, DB, security and historical instructions. Stage only this task's four files.

Suggested message: `chore(web): prune obsolete packages and update checkout guide`.

## Task 6: Final Verification And Phase 2 Handoff

**Files:**
- Review: all prior changed paths, approved spec and this plan.
- Test: existing frontend suite plus Task 1-5 tests; no new production feature.

**Interfaces:**
- Consumes: all task deliverables.
- Produces: exact PASS/FAIL/NOT RUN report, visual smoke evidence, running local URL and separate Phase 2 checkpoint.

- [ ] **Step 1: Run complete frontend checks after clean install.**

Run build, lint and full tests from Task 1, separately. Expected: exit code 0 and remaining tests pass; record exact totals/warnings. Compare failures with baseline. Do not claim green while a baseline failure remains; identify scope and obtain review before unrelated fixes.

- [ ] **Step 2: Run local browser smoke.**

Start `npm --prefix src/apps/Blocks.Web run dev -- --port 3000 --strictPort` only when port 3000 is free; select another explicit free port if occupied. Keep existing Vite environment/API configuration. Use isolated auth/API fixtures for signed-in checks; never publish fixture credentials or fake production session tokens.

At 1440x900 and 390x844, inspect Home with long/missing display name, sidebar expanded/collapsed, retained page navigation and retired/public-survey/unknown URLs. Check overflow, keyboard focus, not-found home link and console/network for obsolete requests. The application must render without overlays or blank screens. Verify actual CRUD only with an explicitly authorized isolated environment.

Keep a successfully running dev server available and report its actual URL; do not leave build/test/installation commands unfinished.

- [ ] **Step 3: Verify scope and review checkpoint.**

Run `git diff --check`, `git diff --name-status` and `git status --short`; inspect the combined task commits too, not only the final working-tree diff. Confirm no unrelated files, secrets, generated output or backend/config/DB changes. Preserve unrelated preexisting untracked files; a completely empty working tree is not a requirement.

Request a focused independent final review under the chosen execution workflow: retained auth/permission/blob behavior, deletion completeness and lockfile drift. Keep configured model/provider; disclose delegation limitations rather than silently switching.

- [ ] **Step 4: Deliver Phase 1 report; do not begin upgrades.**

List changes, precise commands/results, remaining baseline issues, browser coverage and local URL. Real backend authorization/audit/CRUD and external integration are NOT RUN unless actually verified in an authorized isolated environment. No backend build is required or a substitute for these checks.

Keep cleanup as a separate reviewed diff/commit boundary. Only then re-query official registry/release notes and prepare a separate Phase 2 proposal for the newest mutually compatible retained package set; do not reuse initial version observations as an upgrade manifest.

## Plan Self-Review

Spec coverage: Home, routes, cached menus, every obsolete source chain, derived auth marker, active avatar safeguards, package removals, preserved lockfile, AGENTS.md and Phase 2 boundary each have an owner above. Review Focus cases are assigned to owning tests/checks. Atomic Task 4 avoids dangling imports; each earlier task remains buildable. All execution checkboxes are intentionally unchecked; this document records a plan, not completed verification.
