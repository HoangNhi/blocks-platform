# Blocks.Web Phase 2 Review Remediation Handoff

Date: 2026-10-24
Status: RESOLVED. All mandatory items R1-R5 and M1 verified and accepted. Independent review complete.
Reviewed implementation HEAD: `56d6ccc62e5b72e505299446d5f7dfa74d289dc6`
Implementation base: `b4302958cb8fe283e721fcddc49744f4640d0460`

## Instructions For The Receiving Session

User requests resolution of the remaining Phase 2 issues, not a new modernization project.

1. Read `AGENTS.md`, the approved spec, plan, this handoff, and current source before changing anything.
2. Check `git status --short`; preserve existing edits and untracked documents. Recheck findings if HEAD has advanced.
3. Resolve mandatory items below with focused changes/tests. Keep optional performance work separate unless explicitly authorized.
4. Update verification evidence and request fresh independent review. Do not close Phase 2 while required browser checks remain NOT RUN or security decisions remain unaccepted.

Reference documents:
- Spec: `docs/superpowers/specs/2026-10-24-blocks-web-package-upgrade-design.md`
- Plan: `docs/superpowers/plans/2026-10-24-blocks-web-package-upgrade.md`
- Existing evidence: `src/apps/Blocks.Web/upgrade-verification.md`

## Scope And Safety

- Application edits stay within `src/apps/Blocks.Web`; update review/plan documentation only for evidence and decisions.
- Keep all 59 approved manifest ranges, official Vite, Table legacy adapter, DatePicker public props, active routes, auth/permissions, API envelope, and avatar staging/retry behavior.
- No backend, Aspire, database, machine configuration, obsolete Business/Collab UI, or retired Catalog features.
- No `--force`, `--legacy-peer-deps`, unapproved overrides, blanket lint suppression, or assertions weakened to get green.
- Browser checks use disposable profiles, synthetic credentials and intercepted API/file fixtures only. Block unhandled API requests; never mutate real application data.
- Never delete or hand-edit lockfile resolutions. Use npm for authorized dependency changes and inspect the resulting diff.

## Evidence Boundary And Corrections To Previous Review

- Previous review reran build, lint, Vitest and production server checks: build passed; lint had 0 errors / 9 warnings; 20 test files / 93 tests passed; server check had 2 passing tests. These are historical results, not a fresh verification in this handoff session.
- Browser smoke was not run. JSDOM and successful HTTP responses do not prove browser rendering, CSS layout, native keyboard interaction, or mobile behavior.
- Audit results below are recorded in the existing report and must be refreshed. Do not assume the reported versions/advisories are unchanged.
- The earlier claim that static serving makes the remaining security risk low was not established. Assess actual advisory conditions and route usage before making an impact claim.
- The earlier suggestion to wait for upstream patches was not a verified conclusion. First check whether an existing compatible transitive release can be resolved without changing approved direct ranges.
- Additional source checks found type escapes and a global lint exemption omitted from the previous review. R1/R2 below record those plan deviations; they are not evidence of a reproduced runtime failure.

## Mandatory Issues

### R1: Remove Table Migration Type Escapes

Evidence:
- `src/apps/Blocks.Web/src/components/ui/data-table.tsx:31`: legacy column alias falls back to `any`.
- `src/apps/Blocks.Web/src/components/ui/data-table.tsx:70`: hook generic also falls back to `any`.
- `src/apps/Blocks.Web/src/components/ui/data-table.tsx:71`, `:72`, `:75`: `data`, `columns`, and `getRowId` are passed through `as any`.
- Plan Task 5 explicitly disallows broad casts hiding incompatible types. Existing evidence describes the migration as type-safe despite these escapes.

Required handling:
- [ ] Inspect installed `RowData`, `LegacyColumnDef`, `useLegacyTable`, and row-ID signatures.
- [ ] Propagate the actual generic constraint through `DataTableProps` and `DataTable`; preserve typed row callbacks and legacy columns without `as any`, conditional `any`, `unknown as`, or equivalent escape hatches.
- [ ] Check all six consumers and controlled-selection updater types. Keep accessors, row identity, action callbacks, and server pagination behavior unchanged.
- [ ] Keep unrelated preexisting loosely typed props out of scope; do not turn this into a shared table rewrite.

Acceptance:
- Build and real DataTable regression tests pass for all six consumers.
- No new migration type escape remains at the adapter boundary.
- Report records the actual fix; a passing compiler with erased types is not proof of compatibility.

### R2: Restore The Globally Disabled Lint Rule

Evidence:
- `src/apps/Blocks.Web/eslint.config.js:33` adds `'react-hooks/preserve-manual-memoization': 'off'`.
- `src/apps/Blocks.Web/upgrade-verification.md:190` records this as a compatibility adjustment.
- Plan's common green gate prohibits broad lint disables.

Required handling:
- [ ] Remove the newly added global exemption and rerun lint to identify exact affected call sites.
- [ ] Fix demonstrated memoization/dependency issues with minimal changes and behavior checks.
- [ ] If a genuine false positive requires an exception, document evidence and request explicit approval for a narrowly scoped exception. Do not silently swap to another global disable.

Acceptance:
- Rule is no longer disabled globally; lint has 0 errors and no new warnings.
- Any changed hooks preserve behavior and have focused coverage appropriate to the affected workflow.

### R3: Complete Real Browser Verification

Evidence:
- `src/apps/Blocks.Web/upgrade-verification.md:447` starts the browser matrix.
- All rows remain NOT RUN for real browsers; disclosure at line 458 cites missing repository-installed browser tooling.
- Plan Task 6 and Definition Of Done require desktop/mobile checks on dev and production servers.

Required handling:
- [ ] Check available browser tools/connectors/runtime before concluding browser access is unavailable. Missing Playwright in `package.json` alone is not proof. Use an existing browser capability where available; do not add permanent dependencies without scope approval.
- [ ] Prepare disposable auth/API fixtures matching current DTOs and permission guards. Intercept requests before navigation; no real backend/file writes.
- [ ] Run both `1440x900` and `390x844` against Vite dev server and actual Express production server after build.
- [ ] Capture screenshots, console/network outcomes, exact URL/viewport/server mode, and failures/fixes. Use an ignored temporary artifact directory and document artifact locations; commit no generated build output, real credentials, or sensitive screenshots.

Required scenarios:

| Area | Check |
| --- | --- |
| Home/sidebar | Greeting, active navigation, sidebar collapse/mobile opening; no retired links. |
| Six lists | `/user`, `/faculty`, `/systemgroup`, `/menu`, `/role`, `/auditlog` render fixture data with usable headers/actions. Faculty selection, refresh, page size and Next preserve server paging. |
| Forms/calendar/combobox | Invalid save blocked; query search/select/clear; DatePicker Vietnamese caption, bounds, selection, native Enter activation, and disabled behavior. |
| Avatar | Preview, valid staged upload/save, failed upload/retry, invalid-file rejection; all endpoints mocked. |
| Routes/auth | Direct reload of active route; unauthenticated redirect `/login`, denied permission `/unauthorized`; `/evidence`, `/standardset`, `/unknown/deep-link` render Not Found. |
| Browser health | No uncaught errors, failed chunks, missing assets, or overlapping/clipped critical controls; separate deliberate failed API fixtures from regressions. |

Acceptance:
- Every required scenario has browser evidence for both viewports and server modes.
- Fix any observed regression and rerun the affected matrix.
- If blocked, report exact missing capability and retain NOT RUN; do not substitute JSDOM or claim Phase 2 complete.

### R4: Resolve Or Obtain Explicit Acceptance Of Audit Residuals

Recorded evidence:
- `src/apps/Blocks.Web/upgrade-verification.md:434`: production audit exit 1, high finding for `path-to-regexp@8.3.0` through Express/router.
- Line 435: full audit exit 1, 8 reported vulnerabilities, including dev dependencies.
- Section 9.6 starts at line 460; findings are not equivalent to an owner-approved risk decision.

Required handling:
- [ ] Rerun full and production-only JSON audits; retain command, time, exit code, advisory identifier, affected range and exact dependency path.
- [ ] Check installed parent constraints and currently published compatible patched versions using primary package/advisory metadata. Do not assume a direct Express bump or override is the only remedy.
- [ ] Where a compatible resolution fits approved ranges, refresh only the needed dependency graph through npm; inspect lockfile changes and rerun tests, server checks, and audits.
- [ ] If remediation requires an unapproved direct-range change, new override, replacement server, or other architecture change, present the smallest proposed change for approval before applying it.
- [ ] If unresolved, document real affected usage, exposure, mitigations, deployment conditions, and limitations. Obtain explicit owner acceptance or keep the security gate OPEN; never accept risk on the owner's behalf.
- [ ] Include dev/build/test findings in the decision. Not being bundled into browser output does not by itself establish absence of risk.

Acceptance:
- No unresolved high/critical finding without explicit recorded owner decision.
- Report distinguishes audit exit 0, remaining findings, and accepted risk. Never label nonzero audit PASS.

### R5: Reconcile Verification Evidence And Request Independent Review

Evidence:
- Existing report section 3 claims 59 target versions verified, but rows include Vite `7.3.0`, TypeScript `5.9.3`, and Table `8.21.3`, unlike the approved matrix.
- The plan remains untracked, with unchecked steps; neither unchecked boxes nor commit titles alone establish completion.
- Prior review's attempted reviewer dispatch failed with `unsupported call: spawn_agent`; that review was not a completed independent subagent review.

Required handling:
- [ ] Replace incorrect availability statements with reproducible results for approved targets, or explicitly label old information historical/unverified. Do not invent execution logs or alter history to make evidence appear consistent.
- [ ] Reconcile final matrix against current manifest/lock/installed packages, actual runtime versions, lint exceptions, security decisions and browser results.
- [ ] Update only task checkboxes supported by evidence; preserve remaining blockers and owner decisions.
- [ ] Discover supported reviewer tools and request fresh independent whole-diff review through `superpowers:requesting-code-review`, without switching configured model/provider. If unavailable, disclose exact blocker; do not mark that gate complete.
- [ ] Include this handoff's final fixes in the reviewed range and resolve findings before closing.

Acceptance:
- Report accurately distinguishes fresh results, historical baseline, accepted deviations and NOT RUN checks.
- Independent review outcome is recorded, or its unavailable status remains an explicit gate.

## Minor Items

### M1: Vite Config Native-Loader Warning

Location: `src/apps/Blocks.Web/vite.config.ts:17`.

- [ ] Replace `path.resolve(__dirname, "./src")` with supported ESM directory resolution, e.g. `path.resolve(import.meta.dirname, "./src")` under approved Node 24.
- [ ] Verify alias/port contract test, build, and real dev startup; confirm the native-loader compatibility warning disappears.
- Do not suppress the warning with an environment variable or rewrite unrelated configuration.

### M2: Bundle Size Advisory

Existing report section 9.7 records an approximately 1,036 kB main JS chunk.

- Track as separate performance follow-up unless browser testing demonstrates a functional failure or the owner explicitly expands scope.
- Possible follow-up: measure route loading, then introduce targeted route-level dynamic imports while preserving auth/error boundaries.
- Do not raise warning limits or add arbitrary manual chunks to hide the advisory.
- This advisory alone is not the missing Phase 2 acceptance gate; R1-R5 take priority.

## Final Verification

Run after fixes, with no competing installs/builds/servers:

```powershell
npm --prefix src/apps/Blocks.Web ci
npm --prefix src/apps/Blocks.Web ls --all
npm --prefix src/apps/Blocks.Web run build
npm --prefix src/apps/Blocks.Web run lint
npm --prefix src/apps/Blocks.Web test
node --test src/apps/Blocks.Web/test/server.check.mjs
npm --prefix src/apps/Blocks.Web audit --json
npm --prefix src/apps/Blocks.Web audit --omit=dev --json
git diff --check
git status --short
```

Run browser matrix separately; Node server checks do not replace it. Audits may return nonzero: report actual result and owner decision rather than hiding failure.

Receiving session's final report must list:
- Changed files and focused fixes per issue ID.
- Commands/exit codes and actual test counts/warnings.
- Browser evidence by server mode and viewport.
- Remaining advisories, owner approvals and blocked/NOT RUN checks.
- Independent review findings and disposition.

Close Phase 2 only when mandatory issues are verified resolved or explicitly accepted where the plan permits acceptance. Otherwise report migration implemented but acceptance incomplete.
