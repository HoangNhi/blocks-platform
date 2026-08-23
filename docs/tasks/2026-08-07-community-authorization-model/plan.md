# Community Registration And Functional Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe self-hosted registration, protected built-in roles, stable menu/action permissions, personal workspaces, and fail-closed functional authorization across Blocks services. Full V6 shell, route, and theme redesign remains a separate UI-refactor task.

**Architecture:** System Service remains authority for users, roles, menus, permissions, registration settings, invitations, and personal workspaces. Local checks query PostgreSQL. Other services call one authenticated System Service HTTP check using caller bearer token and deny when authority is unavailable. Registration creates user, personal workspace, owner membership, invitation consumption, and audit evidence in one transaction. Legacy `Menu.Controller` remains fallback during migration; `Menu.PermissionKey` becomes canonical.

**Tech Stack:** .NET 10, ASP.NET Core, EF Core 8, PostgreSQL, Aspire 13.1, React 19, React Router 8, TypeScript 6, Vite 8, Vitest 4, FastAPI, httpx, pytest

---

## Scope And Rollout Gates

- Registration and functional authorization foundation only. No operational-page redesign or theme implementation.
- `registration_mode` starts as `admin_provisioned` after migration.
- `member` receives `workspace.home` first. Domain permissions wait for their approved safety model: ownership/visibility migration or canonical dataset lifecycle.
- Open or invite-only registration stays disabled while granted member permissions lack enforced resource safety.
- Existing users keep current `RoleId`; no automatic privilege reduction.
- Existing `Controller` checks remain compatible until stable-key migration completes.
- No commit without explicit user authorization.

## Frontend Skill Routing

- `ui-ux-pro-max`: registration, login, inline authorization states, and focused administration-flow direction.
- `frontend-ui-engineering`: React implementation, accessibility, responsive behavior.
- `impeccable`: final critique after functional and browser verification.
- Skip `taste-skill`: product/auth surfaces, not marketing pages.

## File Map

- System Service: entities, `SystemContext`, SQL migrations, registration services, functional authorization service, controllers, configuration.
- Shared: action contracts under `platform/shared/Blocks.Shared/Authorization/`.
- Orchestration: System Service references for File Service, TradeLab, and AI Video in `platform/apphost/Blocks.AppHost/AppHost.cs`.
- Domain services: functional authorization clients and endpoint guards.
- Web: existing Login/Register entry, System Overview registration settings, Users invitations, combined Roles & Permissions, denied states, and permission-key navigation.
- Evidence: create `execution.md` when implementation starts and `review.md` during final critique.

## Permission Contract

Actions: `view`, `add`, `update`, `delete`, `approve`, `analyze`.

```http
POST /api/Authorization/check
Authorization: Bearer <current-user-token>
Content-Type: application/json

Body fields: `permissionKey=tradelab.strategies`, `action=view`.
```

System Service derives user ID from token. Endpoint never accepts user ID, role ID, or grants. Unknown key, unsupported action, disabled identity, missing role, database error, or authority outage denies access.

### Task 1: Capture Permission Baseline And Add Migration Harness

**Files:**
- Create: `services/system-service/Blocks.SystemService/Infrastructure/Data/Migrations/README.md`
- Create: `services/system-service/Blocks.SystemService/Infrastructure/Data/SystemMigrationHostedService.cs`
- Modify: `services/system-service/Blocks.SystemService/Blocks.SystemService.csproj`
- Modify: `services/system-service/Blocks.SystemService/Configs/ConfigService.cs`
- Test: `tests/system-service/Blocks.SystemService.Tests/Data/SystemMigrationContractTests.cs`

- [x] **Step 1: Capture current database objects before mutation**

Run against configured System database without printing connection string:

```sql
select p.proname, pg_get_functiondef(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('fn_user_checkpermission', 'fn_menu_getbyuser',
    'fn_permission_getbyrole', 'fn_permission_getbyuser')
order by p.proname;
```

Save reviewed behavior to migration `README.md`. If database unavailable, mark Task 1 `BLOCKED`; never infer function bodies.

- [x] **Step 2: Write failing migration contract test**

Assert embedded scripts are ordered, journaled in `system_schema_migration`, guarded by PostgreSQL advisory lock, and executed inside one transaction. Startup must fail on partial migration.

- [x] **Step 3: Verify RED**

```powershell
dotnet test tests/system-service/Blocks.SystemService.Tests/Blocks.SystemService.Tests.csproj --filter SystemMigrationContractTests
```

Expected: FAIL.

- [x] **Step 4: Implement minimum migration host**

Open one database connection and transaction. Acquire PostgreSQL advisory lock `42425253`, create migration journal, apply pending embedded SQL files in filename order, then commit. Fail startup on any error. Embed only `Infrastructure/Data/Migrations/*.sql`; add no dependency.

- [x] **Step 5: Verify GREEN**

Run focused test. Expected: PASS.

### Task 2: Add Authorization, Registration, And Workspace Schema

**Files:**
- Create: `services/system-service/Blocks.SystemService/Infrastructure/Data/Migrations/2026080701_community_authorization.sql`
- Create: `services/system-service/Blocks.SystemService/Entities/InstanceSetting.cs`
- Create: `services/system-service/Blocks.SystemService/Entities/Workspace.cs`
- Create: `services/system-service/Blocks.SystemService/Entities/WorkspaceMember.cs`
- Create: `services/system-service/Blocks.SystemService/Entities/Invitation.cs`
- Modify: `services/system-service/Blocks.SystemService/Entities/Role.cs`
- Modify: `services/system-service/Blocks.SystemService/Entities/Menu.cs`
- Modify: `services/system-service/Blocks.SystemService/Infrastructure/Data/SystemContext.cs`
- Test: `tests/system-service/Blocks.SystemService.Tests/Data/CommunityAuthorizationSchemaTests.cs`

- [x] **Step 1: Write failing model and SQL contract tests**

Assert unique stable role keys, protected-role flags, unique non-null menu permission keys, unique `(role_id, menu_id)`, unique active username/email, complete audit fields, unique workspace membership, and hashed invitation storage.

- [x] **Step 2: Verify RED**

Run `dotnet test tests/system-service/Blocks.SystemService.Tests/Blocks.SystemService.Tests.csproj --filter CommunityAuthorizationSchemaTests`.

Expected: FAIL.

- [x] **Step 3: Add idempotent SQL migration**

Add role columns `key`, `is_system`, `is_registration_eligible`; add `menu.permission_key`; create required unique indexes and new tables. Reconcile built-in keys `member` and `administrator`. Do not infer administrator from first user. Require explicit existing administrator mapping when no safe mapping exists.

- [x] **Step 4: Add audit fields**

Every new mutable table uses `created_at`, `created_by`, `updated_at`, `updated_by`, `is_active`, and `is_deleted`. Invitation also uses `expires_at`, `consumed_at`, `consumed_by`, `target_workspace_id`, and optional `registration_role_id`.

- [x] **Step 5: Verify GREEN**

Apply migration twice to disposable PostgreSQL. Expected: both runs succeed; second run changes no rows or schema.

### Task 3: Replace Function-Coupled Checks With Stable Permission Evaluation

**Files:**
- Create: `platform/shared/Blocks.Shared/Authorization/FunctionalPermissionAction.cs`
- Create: `services/system-service/Blocks.SystemService/Services/CoreFeature/Authorization/IFunctionalAuthorizationService.cs`
- Create: `services/system-service/Blocks.SystemService/Services/CoreFeature/Authorization/FunctionalAuthorizationService.cs`
- Create: `services/system-service/Blocks.SystemService/DTOs/CoreFeature/Authorization/Requests/FunctionalPermissionCheckRequest.cs`
- Create: `services/system-service/Blocks.SystemService/DTOs/CoreFeature/Authorization/Dtos/FunctionalPermissionCheckResponse.cs`
- Create: `services/system-service/Blocks.SystemService/Controllers/AuthorizationController.cs`
- Modify: `services/system-service/Blocks.SystemService/Helpers/AttributePermission.cs`
- Modify: `services/system-service/Blocks.SystemService/Services/CoreFeature/User/UserService.cs`
- Test: `tests/system-service/Blocks.SystemService.Tests/Security/FunctionalAuthorizationServiceTests.cs`
- Test: `tests/system-service/Blocks.SystemService.Tests/Security/PermissionFilterTests.cs`

- [x] **Step 1: Write failing evaluator tests**

Cover allowed grant, missing grant, unsupported menu action, inactive/deleted user, inactive/deleted role, inactive/deleted menu, missing key, duplicate-row protection, and controller fallback.

- [x] **Step 2: Implement one database query path**

Effective grant requires active user, current active database role, active menu, supported action, and granted permission. Use `Controller` only when endpoint lacks migrated key. Never trust JWT role claim for current permission state.

- [x] **Step 3: Extend `AttributePermission`**

Support explicit `PermissionKey` plus existing `Action`. `ActionType.NONE` remains authentication-only and cannot expose another user's data.

- [x] **Step 4: Add authenticated check endpoint**

Reject unknown actions during validation. Derive current user ID from claims. Return 401 for invalid token and denied result for missing grant.

- [x] **Step 5: Verify GREEN**

Run both focused security test classes. Expected: PASS.

### Task 4: Protect Role, Menu, Permission, And User Administration

**Files:**
- Modify: `services/system-service/Blocks.SystemService/DTOs/CoreFeature/Permission/Requests/PermissionRequest.cs`
- Modify: `services/system-service/Blocks.SystemService/DTOs/CoreFeature/Role/Requests/RoleRequest.cs`
- Modify: `services/system-service/Blocks.SystemService/DTOs/CoreFeature/Menu/Requests/MenuRequest.cs`
- Modify: `services/system-service/Blocks.SystemService/Services/CoreFeature/Role/RoleService.cs`
- Modify: `services/system-service/Blocks.SystemService/Services/CoreFeature/Menu/MenuService.cs`
- Modify: `services/system-service/Blocks.SystemService/Controllers/UserController.cs`
- Modify: `services/system-service/Blocks.SystemService/Controllers/MenuController.cs`
- Modify: `services/system-service/Blocks.SystemService/Controllers/RoleController.cs`
- Test: `tests/system-service/Blocks.SystemService.Tests/Admin/AuthorizationAdministrationTests.cs`

- [x] **Step 1: Write failing security tests**

Cover `MenuId` validation, protected role deletion/key mutation, privileged role registration eligibility, default-registration-role safety, unsupported action grant rejection, duplicate permission rows, anonymous user combobox denial, self menu/permission query, and forbidden cross-user query.

- [x] **Step 2: Fix validator root cause**

Replace duplicated `RoleId` rule with required `MenuId` validation.

- [x] **Step 3: Enforce stable admin keys**

Map endpoints to `admin.users`, `admin.roles`, `admin.permissions`, `admin.registration`, and `admin.audit`. Protect `member` and `administrator` from deletion and key changes.

UI composition does not create new keys: Invitations remains inside Users, Registration Settings remains inside System Overview, and permission editing remains inside Roles & Permissions. Backend endpoints keep explicit least-privilege checks.

- [x] **Step 4: Close subject and anonymous gaps**

Remove `[AllowAnonymous]` from `User/get-all-combobox`. User-specific menu/permission queries allow self; another subject requires matching admin permission.

- [x] **Step 5: Verify GREEN**

Run focused admin and permission tests. Expected: PASS.

### Task 5: Implement Registration, Invitations, And Personal Workspace Provisioning

**Files:**
- Create: `services/system-service/Blocks.SystemService/Configs/RegistrationOptions.cs`
- Create DTOs under `services/system-service/Blocks.SystemService/DTOs/CoreFeature/Registration/`
- Create services under `services/system-service/Blocks.SystemService/Services/CoreFeature/Registration/`
- Modify: `services/system-service/Blocks.SystemService/Controllers/AuthController.cs`
- Create: `services/system-service/Blocks.SystemService/Controllers/RegistrationAdminController.cs`
- Modify: `services/system-service/Blocks.SystemService/Configs/ConfigService.cs`
- Modify: `services/system-service/Blocks.SystemService/Program.cs`
- Test: `tests/system-service/Blocks.SystemService.Tests/Auth/RegistrationServiceTests.cs`
- Test: `tests/system-service/Blocks.SystemService.Tests/Auth/RegistrationEndpointTests.cs`

- [x] **Step 1: Write failing mode and transaction tests**

Cover open, invite-only, admin-provisioned, invalid default role, duplicate username/email, expired/consumed invitation, ineligible role, workspace failure, and audit failure rollback.

- [x] **Step 2: Add public routes**

Add `GET /api/Auth/registration-availability` and `POST /api/Auth/register`. Public request contains username, email, fullname, password, and invitation token only. Reject unknown JSON properties.

Open registration and valid invitation tokens use the same Register route. Public UI never submits or displays registration mode, role, registration eligibility, or default-role selection.

- [x] **Step 3: Use one transaction**

Resolve role, create user, personal workspace, owner membership, consume invitation, write audit event, then commit. Any failure rolls back all writes.

- [x] **Step 4: Apply password and abuse controls**

Use built-in ASP.NET Core rate limiting: registration 5 attempts per minute per remote IP; bootstrap 3 attempts per minute. Password policy is 12-128 characters and rejects all-whitespace. Keep current salt/hash format for compatibility; create separate future task before changing password hashing.

- [x] **Step 5: Add admin settings and invitation endpoints**

Protect with `admin.registration`. Hash invitation tokens with SHA-256 before storage; show plaintext once at creation.

- [x] **Step 6: Verify GREEN**

Run registration tests. Expected: PASS with no partial data after forced failure.

### Task 6: Implement First-Administrator Bootstrap

**Files:**
- Modify: `services/system-service/Blocks.SystemService/Configs/RegistrationOptions.cs`
- Modify: `services/system-service/Blocks.SystemService/Services/CoreFeature/Registration/RegistrationService.cs`
- Modify: `services/system-service/Blocks.SystemService/Controllers/AuthController.cs`
- Modify: `platform/apphost/Blocks.AppHost/AppHost.cs`
- Create: `docs/runbooks/first-admin-bootstrap.md`
- Test: `tests/system-service/Blocks.SystemService.Tests/Auth/BootstrapServiceTests.cs`

- [x] **Step 1: Write failing bootstrap tests**

Cover missing secret, wrong secret, no configured secret, existing administrator, concurrent requests, atomic success, secret redaction, and endpoint disappearance after success.

Bootstrap remains headless. Add endpoint, configuration, and operator runbook coverage only; do not add a routed setup page.

- [x] **Step 2: Configure secret boundary**

Read `Bootstrap:Secret` from environment or local secret store. Accept only `X-Blocks-Bootstrap-Secret`. Compare UTF-8 bytes with `CryptographicOperations.FixedTimeEquals`.

- [x] **Step 3: Implement atomic bootstrap**

Under transaction and advisory lock, create/reconcile `member` and `administrator`, create first administrator, personal workspace, owner membership, registration settings defaulting to `admin_provisioned`, and audit evidence.

- [x] **Step 4: Disable after initialization**

When active administrator exists, return 404 from `POST /api/Auth/bootstrap`. First normal registration never becomes administrator.

- [x] **Step 5: Verify GREEN**

Run bootstrap tests. Expected: one concurrent request succeeds; others fail safely; logs contain no secret.

### Task 7: Migrate Web Navigation To Permission Keys And Remove Bypasses

**Files:**
- Modify: `apps/web/Blocks.Web/src/features/navigation/system-menu-types.ts`
- Modify: `apps/web/Blocks.Web/src/features/navigation/route-catalog.ts`
- Modify: `apps/web/Blocks.Web/src/features/navigation/system-menu-adapter.ts`
- Modify: `apps/web/Blocks.Web/src/features/navigation/navigation-utils.ts`
- Modify: `apps/web/Blocks.Web/src/features/navigation/system-menu-adapter.test.ts`
- Modify: `apps/web/Blocks.Web/src/features/navigation/navigation-utils.test.ts`
- Modify: `apps/web/Blocks.Web/src/App.tsx`

- [x] **Step 1: Write failing navigation tests**

Assert `permissionKey` maps before controller/name aliases; readiness routes deny without menu grant; hidden detail routes require `accessRoutes` from authorized menu; zero effective actions omit menu.

- [x] **Step 2: Remove hard-coded readiness allowlist**

Delete `alwaysAllowedReadinessRoutes`. Route each protected existing surface through its owning canonical permission key. Do not create standalone menu entries for File Library, Storage Providers, Installed Plugins, Plugin Activity, or Plugin Manifests in this task.

- [x] **Step 3: Preserve compatibility**

Adapter lookup order is permission key, controller, then menu name. Unknown menus remain non-routable and appear only in administration diagnostics.

- [x] **Step 4: Verify GREEN**

Run `npm test -- src/features/navigation/system-menu-adapter.test.ts src/features/navigation/navigation-utils.test.ts` from `apps/web/Blocks.Web`. Expected: PASS.

### Task 8: Build Minimal Public And Administration UI Surfaces

**Files:**
- Modify: `apps/web/Blocks.Web/src/features/auth/types.ts`
- Modify: `apps/web/Blocks.Web/src/features/auth/auth-api.ts`
- Modify: `apps/web/Blocks.Web/src/features/auth/auth-api.test.ts`
- Create: `apps/web/Blocks.Web/src/features/auth/registration-page.tsx`
- Create: `apps/web/Blocks.Web/src/features/auth/auth-entry-router.tsx`
- Modify: `apps/web/Blocks.Web/src/features/auth/login-page.tsx`
- Modify: `apps/web/Blocks.Web/src/features/auth/protected-route.tsx`
- Delete: `apps/web/Blocks.Web/src/features/auth/access-denied-page.tsx`
- Modify: `apps/web/Blocks.Web/src/features/admin/system-admin-api.ts`
- Modify: `apps/web/Blocks.Web/src/features/admin/types.ts`
- Create: `apps/web/Blocks.Web/src/features/admin/pages/system-overview-page.tsx`
- Create: `apps/web/Blocks.Web/src/features/admin/pages/system-overview-page.test.tsx`
- Modify: `apps/web/Blocks.Web/src/features/admin/pages/users-page.tsx`
- Modify: `apps/web/Blocks.Web/src/features/admin/pages/users-page.test.tsx`
- Modify: `apps/web/Blocks.Web/src/features/admin/pages/roles-page.tsx`
- Modify: `apps/web/Blocks.Web/src/features/admin/pages/roles-page.test.tsx`
- Modify: `apps/web/Blocks.Web/src/features/admin/pages/permission-matrix-page.tsx`
- Modify: `apps/web/Blocks.Web/src/features/admin/pages/permission-matrix-page.test.tsx`
- Modify: `apps/web/Blocks.Web/src/App.tsx`
- Test: matching API and page tests beside each file

- [x] **Step 1: Produce focused UI contract**

Use `ui-ux-pro-max` for registration, login linking, inline denied states, Registration Settings inside System Overview, Invitations inside Users, and combined Roles & Permissions. Record accepted interaction details in `mockup-ui.md`; do not redesign operational pages or implement V6 themes.

- [x] **Step 2: Write failing API and route tests**

Cover open registration link, invitation token on the same Register route, admin-provisioned hidden registration, account-created return to login, inline 403 state, System Overview registration settings, Users invitations, and combined role creation plus permission save.

- [x] **Step 3: Implement with existing shadcn primitives**

Use `Card`, `Input`, `Label`, `Select`, `Button`, `Alert`, `Table`, `Tabs`, and `Dialog`. Add no UI dependency. Register has no registration-mode or role selector. Roles & Permissions shows stable key, protected/system state, registration eligibility, default-registration-role indicator, and disabled cells for unsupported actions. Use subtle 3D block identity only in authentication empty space; forms and tables stay decoration-free.

Route `/system/overview` to the System Overview component, place Registration Settings there, place Invitations inside Users, remove standalone `/system/identity/permissions`, and render its matrix inside Roles & Permissions.

- [x] **Step 4: Preserve accessibility**

Every field has label and described error, initial focus is predictable, validation summary uses `role=alert`, disabled matrix cells expose an accessible explanation, inline denial is announced, and success does not rely on color.

- [x] **Step 5: Verify GREEN**

Run focused Vitest files, then `npm run build`. Expected: PASS.

### Task 9: Add Cross-Service Fail-Closed Authorization Client

**Files:**
- Create: `platform/shared/Blocks.Shared/Authorization/FunctionalAuthorizationRequest.cs`
- Create: `platform/shared/Blocks.Shared/Authorization/FunctionalAuthorizationResult.cs`
- Create: `services/file-service/Blocks.FileService/Authorization/SystemFunctionalAuthorizationClient.cs`
- Create: `plugins/ai-video-production/service/Blocks.AiVideoService/Api/SystemFunctionalAuthorizationClient.cs`
- Create: `plugins/tradelab/service/src/tradelab_api/core/authorization.py`
- Modify: `platform/apphost/Blocks.AppHost/AppHost.cs`
- Test: focused client tests in File Service, AI Video, and TradeLab test projects

- [x] **Step 1: Write failing client tests**

Cover bearer forwarding, allowed, denied, 401, timeout, malformed response, connection failure, and cancellation. No failure mode may return allowed.

- [x] **Step 2: Wire service discovery**

Add System Service reference to each domain service. .NET clients use Aspire service discovery URI. TradeLab reads `SYSTEM_SERVICE_BASE_URL` injected by AppHost.

- [x] **Step 3: Use short timeout without cache**

Use 2-second authorization timeout. Skip cache because permission edits must take effect immediately and stale grants are unsafe.

- [x] **Step 4: Verify GREEN**

Run three focused client test sets. Expected: PASS.

### Task 10: Enforce Functional Permissions In Domain Services

**Files:**
- Modify File Service controllers under `services/file-service/Blocks.FileService/Controllers/`
- Modify: `services/file-service/Blocks.FileService/Configs/ConfigService.cs`
- Modify: `plugins/ai-video-production/service/Blocks.AiVideoService/Api/AiVideoAccessPolicies.cs`
- Modify: `plugins/ai-video-production/service/Blocks.AiVideoService/Api/AiVideoReadEndpoints.cs`
- Modify: `plugins/ai-video-production/service/Blocks.AiVideoService/Program.cs`
- Modify: `plugins/tradelab/service/src/tradelab_api/api/router.py`
- Modify TradeLab route modules under `plugins/tradelab/service/src/tradelab_api/api/`
- Test: existing service endpoint projects plus new authorization tests

- [x] **Step 1: Write failing endpoint tests**

For each service, valid JWT without grant receives 403, authority outage receives 503, and allowed grant reaches existing handler.

- [x] **Step 2: Map actions explicitly**

```text
File API list/download: files.library view
File API upload: files.library add
File API metadata update: files.library update
File API delete: files.library delete
AI Video status/runs/artifacts: ai-video.projects view
TradeLab strategy reads/writes: tradelab.strategies view/add/update/delete
TradeLab dataset ready-version reads: tradelab.datasets view
TradeLab dataset draft/version creation: tradelab.datasets add
TradeLab dataset approval/deprecation: tradelab.datasets approve
TradeLab backtests: tradelab.backtests view/analyze/delete
TradeLab risk configuration: tradelab.risk-profiles view/add/update/delete
```

- [x] **Step 3: Remove AI Video role-ID allowlist**

JWT proves identity only. System Service proves functional access. Delete `AiVideoAccess:ViewRoleIds` behavior and tests.

- [x] **Step 4: Keep health endpoints anonymous**

Only `/health` and standard service readiness endpoints stay outside functional authorization. Product readiness pages require menu grants.

- [x] **Step 5: Verify GREEN**

Run File Service, AI Video, and TradeLab focused authorization tests. Expected: PASS.

### Task 11: Gate Member Permissions On Resource Safety Migration

**Files:**
- Create: `docs/tasks/2026-08-07-community-authorization-model/resource-authorization-matrix.md`
- Modify: `services/system-service/Blocks.SystemService/Infrastructure/Data/Migrations/2026080701_community_authorization.sql`
- Test: `tests/system-service/Blocks.SystemService.Tests/Security/DefaultMemberPermissionTests.cs`

- [x] **Step 1: Inventory each target resource**

Record owner field, workspace field, visibility field, legacy row count, migration assumption, and enforcing endpoint for strategies, backtests, risk profiles, files, AI Video projects/runs/artifacts, jobs, and results. Record datasets separately as canonical instance-scoped versions with lifecycle state, provenance, checksum, replacement/deprecation link, and enforcing endpoint.

- [x] **Step 2: Write failing safe-default test**

Initial `member` seed grants only keys whose matrix row is `enforced-and-migrated`. Unknown or incomplete rows cannot seed access.

- [x] **Step 3: Use conservative legacy states**

Allowed states are `assigned-owner`, `assigned-instance-workspace`, `quarantined-admin-only`, and `blocked-needs-decision`. Never mark existing resources public. Never assign all legacy resources to first administrator without recorded operator approval.

Datasets never receive fabricated user or workspace ownership. Ready versions remain immutable; corrections create new versions and deprecate superseded versions.

- [x] **Step 4: Keep public registration disabled until safe**

Registration settings validation rejects `open` and `invite_only` when any granted default-member permission lacks its required safety model: ownership/visibility enforcement for member-owned resources or canonical lifecycle enforcement for datasets.

- [x] **Step 5: Verify GREEN**

Run safe-default tests. Expected: PASS.

### Task 12: Full Verification, Browser Evidence, And Final Critique

**Files:**
- Create: `docs/tasks/2026-08-07-community-authorization-model/execution.md`
- Create: `docs/tasks/2026-08-07-community-authorization-model/review.md`
- Modify architecture docs only when implementation changes approved current behavior

- [x] **Step 1: Run focused suites**

```powershell
dotnet test tests/system-service/Blocks.SystemService.Tests/Blocks.SystemService.Tests.csproj
dotnet test tests/file-service/Blocks.FileService.Tests/Blocks.FileService.Tests.csproj
dotnet test tests/ai-video-production/Blocks.AiVideoService.Tests/Blocks.AiVideoService.Tests.csproj
py -3.14 -m pytest plugins/tradelab/service/tests -q
npm --prefix apps/web/Blocks.Web test
```

Expected: PASS.

- [x] **Step 2: Run broad build and tests**

```powershell
dotnet build Blocks.slnx --no-restore
dotnet test Blocks.slnx --no-build
npm --prefix apps/web/Blocks.Web run build
```

Expected: PASS or exact unrelated baseline failures recorded.

- [x] **Step 3: Run migration smoke twice**

Start disposable PostgreSQL, apply migrations twice, call headless bootstrap once, reject second bootstrap, register one member in open mode, and confirm user/workspace/membership/audit rows are atomic.

- [x] **Step 4: Run browser-use-first journeys**

Verify desktop and 390px viewport:

```text
open registration
invite-only registration on existing Register route
admin-provisioned hidden registration
login and personal workspace entry
permission removal hides navigation and blocks direct route/API
role reassignment updates access without trusting stale role claim
registration settings inside System Overview
invitation administration inside Users
role creation and permission editing in one Roles & Permissions workflow
unsupported permission actions remain disabled
denied access renders inline without a dedicated route
```

Mark each `PASS`, `NOT APPLICABLE`, or `BLOCKED` with exact reason and rerun action.

- [x] **Step 5: Run specialist critique**

Use `impeccable` after functional checks. Fix defects through `frontend-ui-engineering`, rerun affected tests and browser journeys, then record findings in `review.md`.

- [x] **Step 6: Validate repository hygiene**

```powershell
git diff --check
git status --short
```

Confirm no secrets, generated browser artifacts, database dumps, or unrelated files are staged.

## Acceptance Mapping

| Spec area | Plan tasks |
| --- | --- |
| registration modes and default role | 2, 5, 11 |
| first-admin bootstrap | 6 |
| stable permission keys | 2, 3, 7 |
| role/menu/permission administration | 4, 8 |
| personal workspace creation | 2, 5, 6 |
| anonymous and subject gaps | 4 |
| cross-service functional authorization | 9, 10 |
| resource boundary and legacy migration | 11 |
| canonical dataset lifecycle | 10, 11, 12 |
| restrained minimal authorization UI | 8, 12 |
| separate V6 redesign boundary | scope gate, 8 |
| browser and runtime evidence | 12 |

## Execution Order

Execute Tasks 1-6, then stop for backend/security review. Execute Tasks 7-8, then stop for UI review. Execute Tasks 9-11 only after System Service checks are stable. Execute Task 12 last. Do not enable open or invite-only registration before Task 11 passes.
