# Blocks Studio Login And Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved centered Blocks Studio login, animated background and synchronized application identity without changing authentication policy.

**Architecture:** Adapt reference HTML into the existing React form and one adjacent native Canvas 2D component. Reuse RHF/Zod, `useAuth`, shared controls and installed Lucide icons; retain secondary actions as explicit local-only placeholders. Replace the existing logo file and update sidebar/title without a shared branding abstraction or global theme migration.

**Tech Stack:** Existing locked React 19, TypeScript 6, Vite 8, Tailwind CSS 4, React Hook Form, Zod, Lucide, Vitest 5 and Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-25-blocks-studio-login-branding-design.md` (approved October 25, 2026).

## Global Constraints

- Product changes only under `src/apps/Blocks.Web/`; preserve unrelated work and historical documentation. This plan/spec may be updated for progress/approval.
- No new dependencies or upgrades; do not change package manifest/lockfile, shared test setup, auth context, cookies, routing, backend, secrets or databases.
- Preserve `login(values.username, values.password)`, existing Zod required-field validation, user-based redirect to `/` and `{ Success, StatusCode, Data, Message }` handling.
- Keep `public/blocks.png`, `public/login.png` and `public/vite.svg`; replace only `blocks.png` contents with supplied standalone logo.
- Wordmark and browser title: `Blocks Studio`. Heading: `Đăng nhập Blocks Studio`. Description: `Nơi mỗi ý tưởng trở thành một Microservice độc lập.`
- Identity label/placeholder: `Tên tài khoản` / `Tên tài khoản của bạn`. Password: `Mật khẩu`. No email-format validation.
- Controls: `Ghi nhớ đăng nhập`, `Quên mật khẩu?`, `Đăng nhập Studio`, `Đang đăng nhập…`, `Hoặc đăng nhập nhanh qua`, `GitHub`, `Blocks SSO`.
- Footer: `© {currentYear} Blocks Platform. Modular Microservices Ecosystem.` Static `v2.4` and green dot are decoration, not release/health claims.
- Login shell: `#f8fafc`, `min-height: 100svh`, 440px wrapper INCLUDING 16px/24px horizontal padding; card padding 24px/36px and radius 16px.
- Primary/hover/active: `#2563eb` / `#1d4ed8` / `#1e40af`. Heading 20px/24px, controls 14px, secondary text 11-12px; zero letter spacing.
- Inter/JetBrains Mono apply only to login, with local fallbacks. Login stays light without changing the application's saved theme.
- Canvas: 30-85 nodes, connection distance 135 CSS px, pointer radius 160 CSS px, DPR cap 2; no radial glows or orbs.
- Secondary controls never submit, navigate, open popups, call APIs or show fake success. Remember state resets on remount and never changes session policy/storage.
- No native form POST, Tailwind CDN, inline reference scripts, remote logo URL, fake tokens or production-data tests.

## Review Focus

- Whitespace, punctuation and Vietnamese credentials must pass unchanged to login; no implicit normalization or email restriction (Task 3).
- Immediate duplicate submissions, including Enter while pending, must make one in-flight call; rejection releases the guard (Task 3).
- Reduced-motion changes while hidden must not restart animation until visible and motion-enabled; never duplicate RAF chains (Task 2).
- StrictMode remount, unavailable 2D context and resize at DPR > 2 must leave no leaked work/listeners and a usable form (Tasks 2-3).
- Narrow viewport, 200% zoom, blocked fonts and existing dark preference must retain readable controls and reachable footer without horizontal overflow (Task 4).

---

## File Map And Order

Paths are repository-relative. Read `AGENTS.md`, spec and affected source first.

| Path | Responsibility | Action |
| --- | --- | --- |
| `src/apps/Blocks.Web/public/blocks.png` | Supplied shared logo | Replace binary |
| `src/apps/Blocks.Web/index.html` | Title, existing favicon, font stylesheet | Modify |
| `src/apps/Blocks.Web/src/Branding.test.ts` | Asset/title contract | Create |
| `src/apps/Blocks.Web/src/components/layout/MainLayout/app-sidebar.tsx` | Sidebar identity only | Modify |
| `src/apps/Blocks.Web/src/components/layout/MainLayout/app-sidebar.test.tsx` | Brand assertion and existing menu checks | Modify |
| `src/apps/Blocks.Web/src/features/system/components/MotionCanvas.tsx` | Login canvas lifecycle | Create |
| `src/apps/Blocks.Web/src/features/system/components/MotionCanvas.test.tsx` | Canvas lifecycle checks/local mocks | Create |
| `src/apps/Blocks.Web/src/features/system/routes/Auth/LoginPage.tsx` | Login UI/local state | Modify |
| `src/apps/Blocks.Web/src/features/system/routes/Auth/LoginPage.test.tsx` | Mocked-auth interaction checks | Create |

Tasks 1 and 2 are independent; Task 3 consumes both; Task 4 verifies integration.
Parallel edits use disjoint file sets. Run full build/test checks serially.
All steps are pending. Commands run from repository root. Red tests must fail for
intended missing behavior, not fixture errors or unavailable dependencies.

### Task 1: Synchronize Logo, Sidebar And Title

**Files:** First five File Map entries. Existing `src/apps/Blocks.Web/src/ObsoleteFeatures.test.ts` remains unchanged and must pass.

**Interfaces:**
- Consumes: `C:\Users\hoang\Desktop\screen.png`, 1024 x 1024 PNG; SHA256 `0ce329c391489919cba2f98655f5eade1bbda89b77d63b2c636554f40d76df20`.
- Consumes: `AppSidebar(props: React.ComponentProps<typeof Sidebar>)`; existing test helper `renderSidebar(menu: Menu[], systemGroup: SystemGroup[], pathname?: string)`.
- Produces: same `/blocks.png` URL, `Blocks Studio` document/sidebar identity, available font faces; no new production export.

- [x] **Step 1: Establish execution workspace and record baseline.**

Use `superpowers:using-git-worktrees` at execution time to establish isolation.
Ensure approved documents exist there; if committing documents, stage these two
paths explicitly, never `git add .`.

Check status and inspect `package.json`, `vitest.config.ts`, `src/test/setup.ts`.
Verify original logo with `Get-FileHash -LiteralPath 'C:\Users\hoang\Desktop\screen.png' -Algorithm SHA256`.
Read ZIP `code.html` without importing its scripts. Run baseline serially:
```powershell
npm --prefix src/apps/Blocks.Web run build
npm --prefix src/apps/Blocks.Web run lint
npm --prefix src/apps/Blocks.Web test
```
Record exit codes and preexisting failures separately. Run `npm --prefix src/apps/Blocks.Web ci` only if dependencies are absent; preserve lockfile. No baseline commands ran during plan preparation.

- [x] **Step 2: Write failing asset/title and sidebar tests.**

New `src/Branding.test.ts` uses Vitest/jsdom, `node:fs`, `node:crypto`,
`new URL("../index.html", import.meta.url)` and
`new URL("../public/blocks.png", import.meta.url)`. Parse HTML using native
`DOMParser`, not regex. Tests must not read desktop paths.

Test `uses_supplied_logo_and_studio_document_identity`, with `documentHead`
the parsed head and `logoBytes` the asset Buffer:
```ts
expect(documentHead.querySelector("title")?.textContent).toBe("Blocks Studio");
expect(documentHead.querySelector('link[rel="icon"]')?.getAttribute("href")).toBe("/blocks.png");
expect(documentHead.querySelector('link[rel="icon"]')?.getAttribute("type")).toBe("image/png");
expect(createHash("sha256").update(logoBytes).digest("hex")).toBe("0ce329c391489919cba2f98655f5eade1bbda89b77d63b2c636554f40d76df20");
expect(logoBytes.readUInt32BE(16)).toBe(1024);
expect(logoBytes.readUInt32BE(20)).toBe(1024);
```
Also assert retained `login.png` and `vite.svg` still exist.

Add `renders_studio_brand_without_changing_menu_behavior` to sidebar tests.
Mock `useAuth` with empty menus/groups and null user as nearby tests do;
call `renderSidebar([], [])`, then:
```tsx
expect(screen.getByText("Blocks Studio")).toBeInTheDocument();
expect(screen.getByAltText("Blocks Studio")).toHaveAttribute("src", "/blocks.png");
expect(screen.getByRole("link", { name: /Blocks Studio/ })).toHaveAttribute("href", "/");
```
Do not assert the full accessible name; sidebar retains its version sublabel.

- [x] **Step 3: Run red checks.**

Run `npm --prefix src/apps/Blocks.Web test -- src/Branding.test.ts src/components/layout/MainLayout/app-sidebar.test.tsx`.
Expected: new title/asset/wordmark assertions fail; existing menu tests retain baseline result.

- [x] **Step 4: Apply minimal brand changes.**

Copy verified logo with native
`Copy-Item -LiteralPath 'C:\Users\hoang\Desktop\screen.png' -Destination 'src/apps/Blocks.Web/public/blocks.png'`;
verify destination hash.

Set HTML title to `Blocks Studio`, preserving PNG favicon. Add reference Google
Fonts preconnects and stylesheet for Inter 400/500/600/700 and JetBrains Mono
400/500 with `display=swap`. Do not assign fonts globally.

Set sidebar logo alt/visible wordmark to `Blocks Studio`; keep a nonshrinking
32px `object-contain` icon. Keep `/`, version sublabel, filtering, permissions and
navigation unchanged. Hide brand text in collapsed icon mode using existing
sidebar group-data pattern; maintain an accessible `Blocks Studio` link name.

- [x] **Step 5: Run green checks.**

Run `npm --prefix src/apps/Blocks.Web test -- src/Branding.test.ts src/components/layout/MainLayout/app-sidebar.test.tsx src/ObsoleteFeatures.test.ts`.
Expected: zero failed tests; existing menu/asset retention checks unchanged.

- [x] **Step 6: Commit only Task 1 files.**
```powershell
git add src/apps/Blocks.Web/public/blocks.png src/apps/Blocks.Web/index.html src/apps/Blocks.Web/src/Branding.test.ts src/apps/Blocks.Web/src/components/layout/MainLayout/app-sidebar.tsx src/apps/Blocks.Web/src/components/layout/MainLayout/app-sidebar.test.tsx
git commit -m "feat(web): synchronize Blocks Studio branding"
```

### Task 2: Add Canvas With Safe Lifecycle

**Files:** Create the two `MotionCanvas` files in File Map.

**Interfaces:**
- Consumes: Canvas 2D, RAF/cancelRAF, `matchMedia("(prefers-reduced-motion: reduce)")`, window resize/pointer events and document visibility.
- Produces: named export `MotionCanvas(): React.JSX.Element`, no props, rendering one fixed/inset-0/pointer-events-none/aria-hidden canvas below content.
- No production animation service, exported hook, shared config or public node type.

- [x] **Step 1: Write failing canvas tests with local browser mocks.**

In `MotionCanvas.test.tsx`, mock `HTMLCanvasElement.prototype.getContext` with
spies for used drawing methods: `clearRect`, `setTransform`, `fillRect`,
`beginPath`, `arc`, `fill`, `moveTo`, `lineTo`, `stroke`.
Return null only in fallback test. Use a RAF callback queue with numeric IDs and
an EventTarget-backed media-query mock, not synchronous recursive callbacks.

Private test helper `installCanvasMocks()` returns `ctx` spies, RAF queue
`pending`, `stepFrame(timestamp: number): void`, `setReduced(value: boolean): void`
and `setHidden(value: boolean): void`. Setters dispatch real `change` /
`visibilitychange` events. Restore descriptors, globals and mocks after tests;
do not modify shared setup.

Each row becomes its named `it(...)` with these assertions:

| Test | Assertions |
| --- | --- |
| `decorative_canvas_draws_and_schedules_one_frame` | `expect(canvas).toHaveAttribute("aria-hidden", "true")`; `expect(canvas).toHaveClass("fixed", "inset-0", "pointer-events-none")`; `expect(ctx.fillRect.mock.calls.length + ctx.arc.mock.calls.length).toBeGreaterThan(0)`; `expect(pending.size).toBe(1)` after `stepFrame(16)` |
| `reduced_motion_at_mount_is_static` | Enable reduced before render; `expect(ctx.clearRect).toHaveBeenCalled()`; `expect(pending.size).toBe(0)` |
| `hidden_and_reduced_transitions_never_duplicate_raf` | Hide, enable reduced, show: `expect(pending.size).toBe(0)`; disable reduced while visible: `expect(pending.size).toBe(1)`; repeated show keeps `1`; reduced cancels to `0` |
| `resize_caps_dpr_and_replaces_transform` | Stub viewport 390x844, DPR 3; `expect(canvas.width).toBe(780)`; `expect(canvas.height).toBe(1688)`; `expect(ctx.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0)` before/after resize |
| `strictmode_unmount_releases_every_resource` | Render in `<StrictMode>`; `expect(pending.size).toBe(1)`; unmount gives `0`; registrations match removed callbacks; events after unmount cause no more paint |
| `missing_context_is_nonfatal` | Return null; `expect(() => render(<MotionCanvas />)).not.toThrow()`; `expect(pending.size).toBe(0)` |

- [x] **Step 2: Run red canvas checks.**

Run `npm --prefix src/apps/Blocks.Web test -- src/features/system/components/MotionCanvas.test.tsx`.
Expected: missing component import; resolve fixture/import errors before implementing behavior.

- [x] **Step 3: Implement `export function MotionCanvas(): React.JSX.Element`.**

Use a canvas ref and one effect. Null context returns without scheduling.
Keep nodes/lifecycle state local to effect, not React state per frame.

Density: `Math.max(30, Math.min(85, Math.floor(width * height * 0.000045)))`.
Draw reference faint blue circle/square nodes and distance-faded lines within
135px; softly repel within 160px using window pointer tracking, resetting on
pointer leave. Ignore touch pointer tracking; never prevent scrolling.

Cap DPR at 2; assign backing dimensions and reset transform via
`setTransform(dpr, 0, 0, dpr, 0, 0)` on resize. Scale reference drift by elapsed
time relative to 60Hz, capped at 50ms; reset timestamp on resume. No radial glow.

Paint once in reduced motion, stop when hidden and start only when visible,
motion-enabled and no RAF is pending. Resize redraws without a second chain.
Cleanup cancels queued ID and removes exact callbacks; runtime media changes
and StrictMode must not leak work.

- [x] **Step 4: Run green canvas checks.**

Run same command. Expected: zero failed tests and no jsdom unimplemented-context
noise. Run with Task 1 checks when ready to expose leaked globals.

- [x] **Step 5: Commit only canvas files.**
```powershell
git add src/apps/Blocks.Web/src/features/system/components/MotionCanvas.tsx src/apps/Blocks.Web/src/features/system/components/MotionCanvas.test.tsx
git commit -m "feat(auth): add reduced-motion-aware login canvas"
```

### Task 3: Adapt Login And Preserve Auth Behavior

**Files:** Modify `LoginPage.tsx`; create adjacent `LoginPage.test.tsx` from File Map.

**Interfaces:**
- Consumes: Task 1 logo/fonts; Task 2 `MotionCanvas`; `useAuth(): AuthContextType`, `login(username: string, password: string): Promise<ApiResponse<LoginResponse>>`, `toast.error` and React Router.
- Produces: existing default export `LoginPage(): React.JSX.Element`; unchanged auth/context/schema contract, no new service/API.
- Keep handler `onSubmit(values: z.infer<typeof formSchema>): Promise<void>`; add form-event wrapper `onFormSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void>`, local visibility/remember state and an in-flight ref guard.

- [x] **Step 1: Write failing login behavior tests with installed facilities.**

Use RTL `render`, `screen`, `fireEvent`, `act`, `waitFor`; do NOT import
uninstalled `@testing-library/user-event`. Mock `useAuth` as `vi.fn()` and
`toast.error`; use a complete typed `AuthContextType` fixture as in
`HomePage.test.tsx`. Mock `MotionCanvas` as inert aria-hidden canvas here.

Private test helpers: `renderLogin(user: User | null = null): RenderResult`
renders real MemoryRouter routes `/login` (page) and `/` (heading `Home`),
starting at `/login`; `fillCredentials(username: string, password: string): void`
uses `fireEvent.change`; `submit(): void` fires submit on the named form
`Đăng nhập Blocks Studio`. Reset fixtures per test; use complete User objects.

Each row becomes its named test (async RHF updates use `act`/`waitFor`):

| Test | Assertions |
| --- | --- |
| `renders_studio_copy_and_no_split_illustration` | Exact Global Constraints heading/description/wordmark/footer/badge/divider/buttons; `expect(screen.getByLabelText("Tên tài khoản")).toHaveAttribute("autocomplete", "username")`; password autocomplete `current-password`; no `/login.png` image or education copy |
| `empty_credentials_show_existing_errors_without_login` | Submit blank; `expect(await screen.findByText("Vui lòng nhập tên đăng nhập")).toBeVisible()` and same for `Vui lòng nhập mật khẩu`; `expect(login).not.toHaveBeenCalled()`; inputs have `aria-invalid="true"` and linked error IDs |
| `credentials_pass_unchanged_without_email_validation` | Fill `"  lập.trình+dev  "` / `" pass ! mật khẩu "`; `expect(login).toHaveBeenCalledWith("  lập.trình+dev  ", " pass ! mật khẩu ")`; values remain unchanged |
| `duplicate_submissions_share_one_pending_request` | Deferred typed promise; submit twice immediately and once while pending; `expect(login).toHaveBeenCalledTimes(1)`; disabled `Đang đăng nhập…` and form `aria-busy="true"`; resolve failure, flush; enabled submit; next attempt calls login second time |
| `envelope_failures_and_rejections_restore_submit` | Parameterize `{Success:false,StatusCode:200,Message:"Sai thông tin"}`, empty message, `Error("Mất kết nối")`, non-Error rejection; toast equals `"Sai thông tin"`, `"Đăng nhập thất bại"`, `"Mất kết nối"`, `"Đăng nhập thất bại"` respectively; submit enabled and no Home |
| `existing_user_redirects_home` | `renderLogin(validUser)`; `expect(await screen.findByRole("heading", {name:"Home"})).toBeVisible()`; no login call |
| `visibility_toggle_keeps_password_without_submitting` | Click `Hiện mật khẩu` then `Ẩn mật khẩu`; password type text/password, unchanged value and `aria-pressed` true/false; `expect(login).not.toHaveBeenCalled()` |
| `placeholders_remain_noops_with_valid_credentials` | Fill valid values; click GitHub, Blocks SSO, recovery; each `type="button"`; spy `api.post`/`window.open`; `expect(login).not.toHaveBeenCalled()`, `expect(api.post).not.toHaveBeenCalled()`, `expect(window.open).not.toHaveBeenCalled()`; named form remains, no toast |
| `remember_is_local_and_resets_on_remount` | Spy `Storage.prototype.setItem` and cookie setter after fixture setup; checkbox click gives `expect(checkbox).toBeChecked()`; no storage/cookie/login calls; remount gives `expect(checkbox).not.toBeChecked()` |

- [x] **Step 2: Run red login checks.**

Run `npm --prefix src/apps/Blocks.Web test -- src/features/system/routes/Auth/LoginPage.test.tsx`.
Expected: new UI/behavior assertions fail against old split page; fixtures load.

- [x] **Step 3: Apply centered layout, scoped styling and accessible controls.**

Render `MotionCanvas`, spacer, main and normal-flow footer inside relative
`min-h-svh flex flex-col` shell. Main:
`max-w-[440px] mx-auto w-full px-4 sm:px-6 my-auto`; add vertical shell spacing
so short viewports scroll without clipping. Card:
`bg-white/95 backdrop-blur-md border border-slate-200/80 rounded-2xl shadow-xl shadow-blue-900/5 p-6 sm:p-9`.
Allow utility-row wrapping; secondary buttons use stable two-column tracks.

Use 40px `/blocks.png` with `object-contain`, wordmark `Blocks Studio` (NOT
`Blocks`), static `v2.4` and exact heading/description. Footer year is dynamic.
Scope Inter/local sans-serif to root and JetBrains Mono/local monospace to
password/badge via inline font-family or local utilities; no new CSS file.
Explicitly override shared inputs/buttons' inherited dark styles on these
instances; `color-scheme: light` alone does not override `dark:bg-input/30`.

Retain `Form`, fields/messages, `Input`, `Button`, schema/errors/redirect.
Name form `aria-label="Đăng nhập Blocks Studio"`, retain label/error IDs and
visible focus. Use installed `UserRound`, `LockKeyhole`, `Eye`, `EyeOff`,
`ArrowRight`, `LoaderCircle`; hide decorative icons. No installed GitHub brand
icon: use `UserRound` beside unchanged label, not copied SVG/new dependency.

Eye control is a stable icon button with Vietnamese state-dependent name,
`aria-pressed`, focus and matching tooltip/title. All secondary controls use
`type="button"`; remember checkbox is local and initially unchecked.
One concise `ponytail:` comment names placeholder ceiling and upgrade path when
real integrations/session policy are separately requested; no visible dialog.

- [x] **Step 4: Guard pending submissions without changing auth policy.**

Implement `onFormSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void>`
and wire it to the form. Always prevent the native event first; if the
`useRef(false)` latch is already set, return before invoking RHF. Otherwise set
it synchronously, await `form.handleSubmit(onSubmit)(event)` and release it in
`finally`, including validation failures.

RHF `formState.isSubmitting` drives disabled/spinner text and `aria-busy`.
Do not put the sole guard inside the async login callback: a second RHF submit
that returns early could reset `isSubmitting` while the first request remains
pending. Preserve existing login/error logic, including HTTP 200 envelopes.
Do not normalize input or change context/cookies/protected-route loading.
Report if real route replaces pending card with its existing global loader.

- [x] **Step 5: Run green login/integration checks.**

Run `npm --prefix src/apps/Blocks.Web test -- src/features/system/routes/Auth/LoginPage.test.tsx src/features/system/components/MotionCanvas.test.tsx src/Branding.test.ts src/components/layout/MainLayout/app-sidebar.test.tsx src/Router.behavior.test.tsx src/ObsoleteFeatures.test.ts`.
Expected: zero failed tests; navigation/permission/asset checks preserved.

- [x] **Step 6: Commit only login files.**
```powershell
git add src/apps/Blocks.Web/src/features/system/routes/Auth/LoginPage.tsx src/apps/Blocks.Web/src/features/system/routes/Auth/LoginPage.test.tsx
git commit -m "feat(auth): adapt centered Blocks Studio login"
```

### Task 4: Verify Integrated UI And Hand Off Evidence

**Files:** No new production files; fix only owning Task 1-3 files if needed.

**Interfaces:**
- Consumes: integrated Tasks 1-3 and existing frontend routes.
- Produces: actual command results, browser evidence and running preview URL; no empty verification commit.

- [x] **Step 1: Run full checks serially.**
```powershell
npm --prefix src/apps/Blocks.Web run build
npm --prefix src/apps/Blocks.Web run lint
npm --prefix src/apps/Blocks.Web test
git diff --check
```
Expected: exit 0, no failed tests/new lint/build errors. Separate unrelated
baseline failures/warnings; never label failed checkpoint green or weaken rules.

- [x] **Step 2: Start preview on free loopback port.**

Inspect Vite config without printing secrets; default 3000 (`VITE_DEV_PORT`),
AppHost may use 5173. Run
`npm --prefix src/apps/Blocks.Web run dev -- --host 127.0.0.1`;
use `--port` for another free port if occupied. Read actual URL, keep preview
running for user, do not displace another process.

Use available browser tools. Playwright is not installed; adding it is not
authorized. Runtime browser-tool absence must be reported, not hidden by jsdom.

- [ ] **Step 3: Execute browser visual/interaction acceptance.** (NOT RUN: runtime lacks browser automation tools (Playwright/Puppeteer); jsdom/unit tests 100% pass.)

Use isolated/intercepted auth fixtures, no real credentials/database writes.
Check real login route without altering production auth/loading for screenshots.

| Browser test | Pass condition / assertion |
| --- | --- |
| `centered_login_at_required_viewports` | Screenshots at 1440x900, 1366x768, 390x844, 320x568; `Math.abs(mainRect.x + mainRect.width / 2 - innerWidth / 2) <= 2`; `mainRect.width <= 440`; computed padding 24px/36px and radius 16px |
| `short_viewport_errors_zoom_and_keyboard` | Expand both errors, 200% browser zoom, short keyboard-like viewport; `document.documentElement.scrollWidth <= innerWidth`; fields/submit/footer reachable by scroll; footer rectangle does not intersect card; text not clipped |
| `dark_preference_and_font_failure` | Dark app preference and blocked Google Fonts requests retain light fields/card, readable fallback text and usable inputs; no overflow, saved theme unchanged |
| `keyboard_and_placeholders` | Tab/Shift+Tab reach controls; actual Enter submits once while pending; eye preserves value; placeholders do not navigate/open popup/make request; visible focus/useful hit targets |
| `logo_sidebar_favicon` | Logo loads in login/sidebar/favicon, correct title; four cubes visible at 40px/32px; inspect 16px/32px favicon without redraw; sidebar collapsed/expanded retains icon/accessible link without clipped wordmark |
| `canvas_motion_and_static_fallback` | Painted alpha pixels exist; frames ~250ms apart differ with motion; equal-size captures stay unchanged under reduced motion; resize/hidden-tab transitions do not break foreground controls; forcing a null 2D context in an isolated page still leaves the form usable |

Record actual screenshots/measurements outside tracked source/generated output.
Compare to ZIP HTML excluding documented deviations. Blocked browser checks are
explicitly NOT RUN, never inferred from unit tests.

- [x] **Step 4: Review scope and commit only real fixes.**

Inspect status, diff/stat, `git diff --check` and implementation commits.
No API/context/cookie/dependency/database changes, secrets, screenshots, `dist/`
or `node_modules/` in commits. Preserve unrelated files. Request independent
final branch review under chosen execution skill; fix in-scope findings and
re-run owning checks. Stage exact files; no `--allow-empty` commit.

- [x] **Step 5: Deliver results and update progress.**

Check off only completed steps. Report command exit codes/baseline failures,
browser evidence, NOT RUN checks, actual preview URL and placeholder limits.
Do not claim backend auth/audit, SSO/GitHub integration, changed remember policy
or system health from frontend tests.

## Self-Review And Handoff

Plan author checked spec sections 1-11: identity/assets (Task 1), motion/lifecycle
(Task 2), copy/auth/accessibility/placeholders (Task 3), responsive/browser/full
regression acceptance (Task 4). Review Focus rows have corresponding tests.
No unresolved cross-task symbols, new dependencies or extra subsystems.

Recommend **Native** for three coupled production tasks plus acceptance, with
independent final review; one owner keeps auth/canvas integration coherent and
avoids repeated context setup. **Subagent-driven** remains available for per-task
implementation/review gates. Preserve configured model/provider in both methods.

Plan is not execution authorization. User reviews plan and selects execution
method before product edits.
