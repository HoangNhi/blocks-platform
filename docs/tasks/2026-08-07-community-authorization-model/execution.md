---
task: community-authorization-model
status: complete
last_verified: 2026-08-23
---

# Execution Evidence

## Task Status

All plan tasks 1-12 are implemented and checked in `plan.md`.

### Tasks 1-5: Migration, authorization, administration, and registration

- Migration harness, journal, advisory-lock, and transaction contracts are implemented.
- Authorization uses stable permission keys and derives subject identity from the bearer token.
- Administrative endpoints reject anonymous, missing-subject, disabled, and unauthorized callers.
- Registration provisions the user, personal workspace, owner membership, invitation consumption, and audit record atomically.
- Open, invite-only, and admin-provisioned registration states are covered. Runtime state was restored to `admin_provisioned` after smoke verification.
- Invite-only registration was rechecked after fixing invitation claim persistence: the flow redirects to login, creates one user, one personal workspace, one membership, and one `REGISTER` audit record; the invitation is consumed with `consumed_by` set to the new user.

### Task 6: First-administrator bootstrap

- Bootstrap is headless at `POST /api/Auth/bootstrap`.
- Secret precedence, fixed-time comparison, redaction, advisory locking, atomic provisioning, existing-admin rejection, and overlapping requests are covered.
- Focused result: `13 passed`.

### Task 7: Permission-key navigation

- Readiness bypass was removed.
- Canonical permission keys resolve before legacy controller/name aliases.
- Unknown menus remain non-routable.
- Navigation result: `24 passed` across the focused Vitest files.
- `SystemGroup/get-all` navigation metadata now requires authentication only; mutating administration endpoints retain `admin.permissions` checks.
- Regression coverage: `SystemGroup_navigation_metadata_requires_authentication_only`.

### Task 8: Public and administration UI

- Registration, login, denied state, System Overview registration settings, Users invitations, and combined Roles & Permissions surfaces are implemented with existing primitives.
- Accessibility coverage includes labels, `role=alert`, predictable focus, inline denial, and explanations for unsupported actions.
- Browser evidence covers open registration, invite-only registration, admin-provisioned hidden registration, registration settings, invitations, role editing, and denied access.
- Final runtime evidence covers member workspace entry after the navigation fix at desktop and `390x844`, plus admin-provisioned registration denial at `390x844`.

### Task 9: Cross-service fail-closed authorization

- File Service, AI Video, and TradeLab call System Service with the caller bearer token.
- Timeout, connection, malformed response, unauthorized, and cancellation paths deny access.
- No authorization cache was added.

### Task 10: Domain-service enforcement

- File Service, TradeLab, and AI Video endpoint guards map actions explicitly and fail closed.
- AI Video no longer relies on a role-ID allowlist.
- Health endpoints remain anonymous.
- Browser evidence confirms a member API denial at `.hermes/runs/2026-08-23-community-authorization/browser-invite-fix-member-api-denied.txt`.
- Browser evidence confirms successful member workspace entry at `.hermes/runs/2026-08-23-community-authorization-final/browser-member-workspace-route-fixed.txt`.

### Task 11: Resource-safety gate

- Legacy resource states use conservative ownership and quarantine states.
- Member seed permissions only include enforced-and-migrated keys.
- Open and invite-only registration remain rejected when granted member permissions lack the required resource-safety model.
- No legacy resource was marked public or assigned fabricated ownership.

## Verification

### Automated

- System Service: `113 passed`.
- File Service: `11 passed`.
- AI Video: `47 passed`.
- Web Vitest: `537 passed`.
- API Gateway: `5 passed`.
- Solution .NET tests: `176 passed`.
- Solution build: pass, `0 warnings`, `0 errors`.
- Web build: pass; Vite reports existing `__dirname` native-config and large-chunk warnings.
- TradeLab isolated `tradelab_test` database: `854 passed`, `19 warnings`.
- The default persistent TradeLab DB retained three fixture-contamination failures; the isolated `tradelab_test` run is green. No unrelated fixture patch was made.

### Migration smoke

- Disposable database `blocks_community_auth_migration_fix_20260823` was started twice.
- Both starts were healthy; the migration journal remained at four rows after the second start.
- First bootstrap succeeded; the second bootstrap rejected with response-envelope `StatusCode: 404`.
- Open registration created user, workspace, membership, registration-audit, and member-role rows.

### Browser and UI

- AppHost/browser checks were run against disposable runtime state and recorded under `.hermes/runs/2026-08-23-community-authorization-final/`; final dashboard evidence shows TradeLab, Web, and API Gateway running.
- Same member JWT gained access after DB role promotion and lost access after DB role demotion; current DB role, not a stale JWT role claim, controls access.
- Invite-only registration completed after the invitation persistence fix.
- Member login now reaches `Platform Overview` after removing the over-broad `SystemGroup/get-all` permission requirement.
- Impeccable bundled detector returned `[]` for `apps/web/Blocks.Web/src/features/auth` and `apps/web/Blocks.Web/src/features/admin`.
- `npx impeccable audit` was unavailable in the installed CLI; detector output is the available local specialist check.
- Runtime registration state was restored to `admin_provisioned`; invitation evidence token was redacted; disposable invitation data was removed.

### Repository hygiene

- `git diff --check` passed.
- No secret or invitation token was restored; `.hermes/runs/2026-08-23-community-authorization/invite-token.runtime` is empty.
- AppHost runtime was stopped after evidence capture.

## Remaining Gates

- No implementation task remains in this plan.
- Keep `registration_mode=admin_provisioned` until the approved resource-safety model allows open or invite-only registration.
- V6 shell/theme redesign remains outside this plan.
