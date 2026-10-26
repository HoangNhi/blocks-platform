# Blocks Studio Login And Branding Design

Date: 2026-10-25
Status: Implemented; browser acceptance pending. Tasks 1-3 implemented in commits fc62df2, 4df6ed4, ac82610, and remediated in 9391626, 0f61865. Full test suite 112/112 passed. Visual browser screenshot acceptance pending authorized browser tooling.
Scope: Frontend redesign.
Builder check: Independent read-only review on 2026-10-25 found no important unanswered planning questions.
Implementation plan: `docs/superpowers/plans/2026-10-25-blocks-studio-login-branding.md`.

## 1. Intent And Decisions

Replace the old education-quality-assurance login identity with Blocks Studio,
a microservice-oriented platform. The old education copy belongs to a previous
project; it must not remain in login or application branding.

User decisions:
- Center the login as in `code.html`, not the current split-screen layout.
- Use Blocks Studio and the microservice copy from the supplied mockup.
- Keep GitHub, Blocks SSO, forgot-password and remember-session placeholders.
- Apply the new logo/identity to login, sidebar, favicon and browser title.
- Follow the animated mockup rather than the static-background alternative.

## 2. Inputs And Current State

Authoritative references:
- `C:\Users\hoang\Desktop\screen.png`: 1024 x 1024 supplied logo, four connected
  blue/cyan isometric cubes on a pale rounded-square background.
- `C:\Users\hoang\Desktop\Login.zip`: `code.html`, `screen.png`, `DESIGN.md`.
- ZIP `code.html` defines the intended centered layout and animation.
- ZIP `screen.png` is the rendered login reference, not the standalone logo.
- ZIP `DESIGN.md` is supporting inspiration, not a global application theme migration.

Reference defects are not requirements: HTML prints a remote image URL as text
instead of rendering a logo; its form submits to `#`; secondary actions have no
backend implementation.

Relevant current source, relative to `src/apps/Blocks.Web/`:
- `src/features/system/routes/Auth/LoginPage.tsx`: RHF/Zod form, `useAuth().login`,
  response-envelope errors, redirect to `/` once `user` exists, split illustration.
- `src/contexts/AuthContext.tsx`: real authentication, token storage and permission
  bootstrap. Preserve this flow, including its current loading lifecycle.
- `src/lib/cookies.ts`: persistent token policy independent of a remember checkbox.
- `src/components/layout/MainLayout/app-sidebar.tsx`: logo and Blocks wordmark.
- `index.html`: `/blocks.png` favicon and legacy education title.
- `src/styles/index.css`: shared Tailwind theme; no existing Inter web font.
- `src/ObsoleteFeatures.test.ts`: retained brand-asset existence checks.

Backend currently looks up `Username`, not a separate email identifier.
No backend/API/database changes belong to this redesign.

## 3. Goals And Boundaries

Goals:
- Recognizable, centered Blocks Studio login matching reference composition.
- Reuse the supplied logo without redrawing it or inventing a new mark.
- Keep functional account/password login, errors and authenticated navigation.
- Make password visibility, keyboard use, responsive layout and pending state work.
- Retain requested placeholder controls without network calls or fake success.
- Synchronize visible application identity without changing business screens.

Non-goals:
- OAuth, GitHub authentication, Blocks identity federation or password recovery.
- Changing token lifetime, cookie options, auth context, refresh logic or permissions.
- Adding email login, backend services, databases or orchestration capabilities.
- Rebuilding the home page, domain navigation, dashboard or global theme.
- Dependencies, package upgrades, a shared branding framework or feature flags.
- Deleting retained legacy assets or rewriting historical project documentation.

Anti-goals:
- Copying the standalone HTML scripts/CDN Tailwind into the React application.
- Sending credentials to placeholder routes/providers or submitting a native HTML form.
- Replacing real authentication with mock success to match the screenshot.
- Presenting the decorative version/status badges as real release/health information.

## 4. Approaches

### Selected: Faithful React Adaptation With Animated Canvas

Translate the HTML composition into existing React/Tailwind UI. Reuse RHF, Zod,
Lucide, `useAuth` and current components. Port the small canvas effect with native
browser APIs and proper React cleanup. No new dependency.

Trade-off: closest to the reference, but requires animation lifecycle,
reduced-motion and browser checks. User selected this approach.

### Not Selected: Same Composition With Static Background

Keep layout, copy and logo but omit ongoing canvas animation.

Trade-off: smaller implementation and fewer lifecycle checks, but loses the motion
the user chose. A static fallback remains required for reduced motion or canvas failure.

## 5. Visual Contract

### Layout

- Full-viewport pale background `#f8fafc`; remove the rendered `/login.png` column.
- Use a column shell with `min-height: 100svh`, a small top spacer, centered main
  and a footer in normal flow, matching the reference's overall balance.
- Main wrapper: width 100%, max-width 440px INCLUDING horizontal padding;
  padding 16px, increasing to 24px at the existing small-screen breakpoint.
  The white card inside is therefore narrower than 440px.
- Card: white at approximately 95% opacity, subtle neutral border, restrained
  blue-tinted shadow, 16px corner radius as in this supplied reference,
  24px padding increasing to 36px on larger screens.
- Center horizontally and distribute available vertical space around main.
  On short screens, validation errors, zoom or a mobile keyboard must allow
  normal page scrolling; never clip the first field or cover content with footer.
- Keep the form, divider and two secondary buttons in reference order.
  Utility text may wrap on narrow screens rather than overflow.
- Reserve stable logo, icon and button dimensions; no horizontal page scrolling.

### Colors, Type And Icons

- Primary `#2563eb`; hover `#1d4ed8`; active `#1e40af`.
- Pale neutral background, white surfaces, dark readable text and subtle borders.
- Match reference font sizes using fixed sizes/breakpoints, not viewport-scaled type.
  Heading: 20px, then 24px; main controls 14px; helper/secondary text 11-12px.
- Proposed implementation choice: Inter for login UI and JetBrains Mono for
  password/version details, loaded with `display=swap` from the Google Fonts
  stylesheet already identified in the HTML reference. Keep usable local
  sans-serif/monospace fallbacks; blocked fonts must not block login.
- Scope font families and login colors to login. Do not change other screens'
  typography, dark-mode preference, or shared theme variables.
- Login retains the reference's light appearance even when the app prefers dark.
- Use installed Lucide icons, including accessible show/hide and pending icons.
  Keep letter spacing at zero. Do not copy the inline icon paths from the HTML.

### Copy

| Element | Text |
| --- | --- |
| Login/sidebar wordmark | `Blocks Studio` |
| Heading | `Đăng nhập Blocks Studio` |
| Description | `Nơi mỗi ý tưởng trở thành một Microservice độc lập.` |
| Identity label | `Tên tài khoản` |
| Identity placeholder | `Tên tài khoản của bạn` |
| Password label | `Mật khẩu` |
| Remember checkbox | `Ghi nhớ đăng nhập` |
| Recovery control | `Quên mật khẩu?` |
| Primary submit | `Đăng nhập Studio` |
| Pending submit | `Đang đăng nhập…` |
| Secondary divider | `Hoặc đăng nhập nhanh qua` |
| Secondary buttons | `GitHub`, `Blocks SSO` |
| Footer | `© {currentYear} Blocks Platform. Modular Microservices Ecosystem.` |
| Browser title | `Blocks Studio` |

The account label is a deliberate proposed deviation from mockup's
`Email / Tên tài khoản`: do not promise email authentication that does not exist.
Keep current Vietnamese validation and error fallback messages.

Retain mockup's static `v2.4` badge as decoration only, not package/release metadata.
Retain the small green footer dot as decoration, `aria-hidden`; do not add
"online", a health claim, polling or a new endpoint.

## 6. Logo And Application Identity

- Replace the contents of existing `public/blocks.png` with the supplied standalone
  logo. Do not use the broken remote URL or ZIP login screenshot as an asset.
- Keep the same asset path for login, sidebar and favicon; do not add a parallel
  logo component/configuration layer. Existing favicon MIME remains PNG.
- Preserve logo aspect ratio and all four cubes; use `object-fit: contain`.
  Login logo is approximately 40px, sidebar remains 32px.
- Preserve the supplied pale background. No invented transparent redraw or
  simplified favicon mark in this iteration. Check readability at 16px and 32px.
- Update login/sidebar wordmarks and browser title to Blocks Studio. Sidebar
  collapsed mode must still show the icon without a clipped wordmark.
- Decorative logo beside readable brand text may use empty alt text; any
  standalone logo/link needs an accessible Blocks Studio name.
- Keep `public/login.png` and `public/vite.svg` on disk, though login stops using
  the old illustration. Existing retention checks are not a reason to keep old UI.
- No bulk replacement of domain terminology, audit content, database menus,
  technical project identifiers or historical specs.

## 7. Interaction Contract

### Real Login

- Preserve existing schema, field names, API client and
  `login(values.username, values.password)` call.
- Keep username as plain text with `autocomplete="username"` and password with
  `autocomplete="current-password"`. Do not add an email format requirement.
- Show/hide password is a working local toggle, not a placeholder. Use
  `type="button"`, state-dependent accessible name and `aria-pressed`.
- Enter submits the form. Use RHF's submit lifecycle for local pending UI,
  prevent repeated submission while pending and expose `aria-busy`.
- Do not refactor auth context or protected-route loading to preserve the card
  during the existing global loading behavior. Pending-state tests may isolate
  the component; report if the real route displays an existing global loader.
- Application `Success: false`, including HTTP 200 envelopes, remains a failure.
  Preserve server-message/fallback toast behavior and thrown-error handling.
- Existing user-based redirect to `/` stays unchanged. No new remembered URL,
  permission shortcuts, fake tokens or auth claims.

### Explicit Placeholders

- GitHub, Blocks SSO and recovery controls remain visually active and focusable.
- Use buttons with `type="button"`; recovery may look like a text link.
  No `href="#"`, form submit, navigation, popup, API call or success toast.
- Remember checkbox toggles local UI state only, defaults unchecked and resets
  on remount. It does not enter login DTO, localStorage or cookie logic.
- Add a brief code comment identifying these deliberate placeholders and their
  upgrade point: real integrations/session policy when separately requested.
- No visible "coming soon" badges, instructions or dialogs absent from mockup.

## 8. Canvas And Accessibility

- One decorative full-viewport canvas behind interactive content,
  `aria-hidden`, `pointer-events: none`. No 3D library or animation dependency.
- Port reference circles/squares, faint connecting lines and slow drift.
  Starting parameters: 30-85 nodes depending on viewport area, connection
  distance 135 CSS pixels, pointer influence radius 160 CSS pixels.
- Proposed performance choice: cap device pixel ratio at 2 and use elapsed
  frame time for consistent speed. Touch does not require pointer interaction.
- No added gradient orbs/glows. Nodes/lines carry the background; removing the
  reference's radial glow is an intentional decoration-only simplification.
- Respect `prefers-reduced-motion` on initial load and changes: static drawing,
  no continuous RAF or pointer-driven movement while reduced motion is enabled.
- Pause animation while the document is hidden; resume with one RAF chain.
- Cancel RAF and remove resize, pointer, visibility and media-query listeners
  on unmount. React StrictMode remounts must not duplicate work.
- Resize must reset canvas transforms and redraw at the correct dimensions.
  If 2D context is unavailable, leave the pale static background and usable form.
- Associate labels/errors with controls, retain focus rings and keyboard order,
  hide decorative icons from assistive technology, and keep readable contrast.
- Maintain useful icon/button hit targets without changing reference composition.

## 9. Implementation Surface And Builder Discretion

Expected changes under `src/apps/Blocks.Web/`:
- Modify `src/features/system/routes/Auth/LoginPage.tsx`.
- Add one nearby canvas component under `src/features/system/components/` if
  separating lifecycle code keeps the page readable; no generic animation engine.
- Modify `src/components/layout/MainLayout/app-sidebar.tsx`, `index.html`,
  and `public/blocks.png`.
- Add narrowly scoped login CSS only if existing utilities are insufficient.
- Add focused tests near login/canvas and update sidebar assertions if required.

Builder chooses exact filenames, small JSX composition, test fixture structure,
font stylesheet insertion and pointer-listener organization within this contract.
If an existing icon is unavailable, use another installed Lucide symbol rather
than a new dependency. Do not implement speculative integration hooks.

Implementation will need the original desktop logo file; verify its availability
before replacing the asset. Product changes must make the final app independent
of desktop paths, ZIP contents and remote image hosting.

## 10. Acceptance And Verification

Before implementation, record existing frontend build/lint/test results with
installed dependencies. Install locked dependencies only if missing. No upgrades.

Automated behavior checks:
- Empty fields show existing Vietnamese errors and do not call login.
- Valid submission calls login with username/password unchanged; pending state
  prevents duplicate submits, then settles after failure.
- Application-envelope failure and rejected promise show errors, not success.
- Existing authenticated user redirects to `/`.
- Password toggle works without submitting or altering entered values.
- Secondary controls and remember checkbox never call login or navigate;
  remember state does not change storage/session behavior.
- Canvas cleanup, reduced-motion changes, hidden-tab pause/resume, resize and
  missing-context fallback work with focused browser-API mocks.
- Login/sidebar show Blocks Studio; favicon points to retained logo asset;
  old education login/title copy and split illustration are no longer rendered.
- Existing router, sidebar permission filtering and retained-asset checks pass.

Repository checks from root:

```powershell
npm --prefix src/apps/Blocks.Web run build
npm --prefix src/apps/Blocks.Web run lint
npm --prefix src/apps/Blocks.Web test
git diff --check
```

Browser verification after implementation:
- Run Vite on a free port and provide its actual URL.
- Inspect screenshots at 1440 x 900, 1366 x 768, 390 x 844 and 320 x 568;
  check 200% zoom, short viewport and expanded validation messages.
- Check keyboard submit/focus, password visibility, long text, loading/errors,
  sidebar expanded/collapsed, favicon and font-loading fallback.
- Confirm canvas pixels are nonblank, frames change with motion enabled,
  reduced motion stays static and foreground controls remain usable.
- Compare composition to ZIP HTML, excluding explicitly documented deviations.
- Use mocked/isolated auth for checks unless an authorized environment exists;
  no real database writes, credential disclosure or claims of real SSO/health.
- Report baseline failures separately and browser/live-auth checks not run.
  UI tests do not prove backend authentication, permission or audit integration.

## 11. Approval Gate

This document proposes label correction, scoped font loading, light-only login,
decorative version/status treatment and canvas safeguards as engineering choices,
not prior user decisions. Approval accepts them.

After written-design approval, prepare a separate implementation plan under
`docs/superpowers/plans/` using `superpowers:writing-plans`. Do not start product
edits, dependency installation or service/database work during design review.
