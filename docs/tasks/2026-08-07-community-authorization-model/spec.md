---
status: approved
owner: cross-service
last_reviewed: 2026-08-08
scope: registration-functional-authorization
---

# Community Registration And Functional Authorization

## 1. Decision Summary

Blocks retains menu-and-action functional authorization, adds configurable community registration, and assigns each newly registered member a safe default role selected by the server.

Initial role contract is one role per user. Built-in role uses stable key member and may display name User. Operators may edit its menu permissions, create additional roles, and assign another role to a user.

Functional authorization does not determine ownership of domain data. Workspace and resource authorization remain separate mandatory checks.

TradeLab datasets are the approved exception: they are canonical instance-scoped data, not member-owned resources. Their safety boundary is functional authorization plus immutable version lifecycle, not private/workspace/public visibility.

~~~text
Request allowed
  = authenticated when endpoint requires authentication
  AND role permits menu action
  AND workspace/resource policy permits target data when applicable
~~~

## 2. Current State

Current System Service provides:

- User.RoleId: one role per user.
- Menu.Controller: controller-based permission domain.
- menu-supported actions: view, add, update, delete, approve, analyze.
- Permission: role-to-menu granted action flags.
- AttributePermission: backend controller enforcement through fn_user_checkpermission.
- role permission matrix UI.
- authenticated menu projection through Menu/get-list-by-user.

Current gaps:

- no public registration endpoint.
- no configurable registration mode or default registration role.
- controller names are implementation-coupled permission identifiers.
- frontend contains readiness-route permission bypasses.
- File Service, TradeLab, and AI Video do not enforce one equivalent functional permission contract.
- menu permission does not express workspace ownership or resource visibility.
- PermissionRequestValidator validates RoleId twice instead of validating MenuId.
- User/get-all-combobox is anonymously accessible.

PostgreSQL function bodies for fn_user_checkpermission, fn_menu_getbyuser, and related functions are absent from repository. Capture or inspect them before database migration work.

## 3. Goals

1. Support open, invite-only, and administrator-provisioned registration.
2. Assign a safe configurable default role during registration.
3. Let operators add or remove functional permissions by role.
4. Keep frontend navigation and backend action authorization aligned.
5. Preserve one-role-per-user behavior for first implementation.
6. Introduce stable permission keys suitable for all services and plugins.
7. Keep functional authorization separate from workspace/resource authorization.
8. Close known anonymous and route-bypass authorization gaps.

## 4. Non-Goals

- multiple simultaneous roles per user.
- field-level authorization.
- replacing workspace/resource ownership with menu permissions.
- public publication implementation.
- email verification in initial registration contract.
- social login or external identity providers.
- per-user permission overrides outside role assignment.
- full V6 shell, theme, and route-by-route UI redesign; track that work in a separate UI-refactor task.

## 5. Role Model

### 5.1 Member

Normal community member. New public registrations receive this role unless an authorized invitation or administrator-provisioning flow selects another registration-eligible role.

Stable key: member.

Default display name: User.

### 5.2 Additional Roles

Operators may create roles such as creator, moderator, and operator. Mandatory platform roles use stable keys member and administrator, with default display names User and Administrator.

### 5.3 Role Safety Fields

~~~text
key                         stable unique identifier
name                        editable display name
is_system                   protected platform role
is_registration_eligible    may be selected as registration default
is_deleted                  existing lifecycle behavior
~~~

Rules:

- member key cannot change.
- built-in member role cannot be deleted.
- member permissions may be edited.
- administrator and operator roles cannot be registration eligible.
- changing registration eligibility or registration default is audited.

The combined Roles & Permissions surface displays stable key, system/protected state, registration eligibility, and a derived default-registration-role indicator beside the permission matrix. Unsupported menu actions render disabled and cannot be granted.

## 6. Registration Modes

### 6.1 Open

- public registration form and endpoint enabled.
- existing Register route renders normal account fields only; it never renders registration-mode or role selectors.
- successful registration activates account immediately.
- server assigns DefaultRegistrationRoleId.
- server creates personal workspace and owner membership in same transaction or coordinated failure-safe workflow.

### 6.2 Invite Only

- valid unexpired invitation token required.
- existing Register route renders invitation state when a token is present; no separate invitation-acceptance route exists.
- invitation determines target workspace membership when present.
- invitation may select another registration-eligible role only when creator may assign that role.
- absent role selection falls back to DefaultRegistrationRoleId.

### 6.3 Administrator Provisioned

- public registration UI and endpoint unavailable.
- public navigation hides Create account and direct Register access renders registration-unavailable state or returns to Login.
- authorized administrator creates account.
- administrator may choose assignable role.
- personal workspace is still created.

## 7. Registration Configuration

Instance settings:

~~~text
registration_mode             open | invite_only | admin_provisioned
default_registration_role_id  required when registration creates members
created_at
created_by
updated_at
updated_by
is_active
is_deleted
~~~

Validation:

- default role exists, is active, not deleted, and registration eligible.
- default role cannot possess protected instance-administration permissions.
- invalid or missing default role blocks registration; no implicit fallback.
- changing default role affects only future registrations.

## 8. Public Registration Contract

Public UI reads registration availability from the server. Registration mode, default role, registration eligibility, and invitation role assignment remain administrator/server controlled and never appear as editable public form fields.

Gateway route:

~~~text
POST /api/system/Auth/register
~~~

Accepted request:

~~~json
{
  "username": "member-name",
  "email": "member@example.com",
  "fullname": "Member Name",
  "password": "user-supplied password",
  "invitationToken": null
}
~~~

Forbidden request fields:

- role ID
- permissions
- workspace role
- active, admin, or operator flags
- personal workspace ID

Server flow:

1. Check instance initialization and registration mode.
2. Validate invitation when required.
3. Resolve configured registration role server-side.
4. Validate username and email uniqueness.
5. Validate password through approved password policy.
6. Create user.
7. Create personal workspace.
8. Create owner membership.
9. Consume invitation when applicable.
10. Write registration audit event.
11. Return account-created response; member uses normal login flow.

Open registration requires rate limiting and abuse controls. Exact middleware and thresholds belong in implementation plan after gateway inspection.

## 9. First-Administrator Bootstrap

A new instance with no users is uninitialized.

Rules:

- first public registrant never becomes administrator automatically.
- bootstrap requires one-time secret from environment or local secret store.
- bootstrap endpoint exists only while no administrator exists.
- one atomic transaction creates first user, administrator assignment, personal workspace, owner membership, required roles, and registration settings.
- bootstrap secret invalidates after success.
- attempts and completion are audited without logging secret value.
- initial implementation is headless through endpoint, environment or local secret-store configuration, and operator runbook; no routed first-admin setup page is included.

Proposed gateway route:

~~~text
POST /api/system/Auth/bootstrap
~~~

## 10. Functional Authorization Model

### 10.1 Stable Permission Key

Add Menu.PermissionKey as stable authorization identifier.

Examples:

~~~text
workspace.home
tradelab.strategies
tradelab.datasets
tradelab.backtests
tradelab.risk-profiles
files.library
ai-video.projects
admin.users
admin.roles
admin.permissions
admin.registration
admin.services
admin.plugins
admin.audit
~~~

Menu.Controller remains temporarily for compatibility. Authorization migrates toward PermissionKey; frontend route names and backend controller names must not become permanent permission identifiers.

### 10.2 Supported And Granted Actions

Menu-supported actions:

- CanView
- CanAdd
- CanUpdate
- CanDelete
- CanApprove
- CanAnalyze

Role-granted actions:

- IsViewed
- IsAdded
- IsUpdated
- IsDeleted
- IsApproved
- IsAnalyzed

Effective permission:

~~~text
effective(action) = menu supports action AND role grants action
~~~

The matrix renders unsupported actions disabled. Saving a role cannot grant an action whose menu capability flag is false.

First implementation keeps these fields. Before community sharing and publication, action storage must be reviewed for stable actions such as share, publish, execute, and manage. Existing actions must not receive misleading meanings.

### 10.3 Presentation Versus Authorization

- IsShowMenu controls navigation presentation only.
- absence from sidebar does not revoke backend access.
- backend checks are authoritative.
- frontend route guards improve UX but are not security controls.
- role with no effective action cannot reach menu through generated navigation.

## 11. Default Member Permissions

| Menu key | View | Add | Update | Delete | Approve | Analyze |
| --- | --- | --- | --- | --- | --- | --- |
| workspace.home | yes | no | no | no | no | no |
| tradelab.strategies | yes | yes | yes | yes | no | yes |
| tradelab.datasets | yes | no | no | no | no | no |
| tradelab.backtests | yes | yes | no | yes | no | yes |
| tradelab.risk-profiles | yes | yes | yes | yes | no | no |
| ai-video.projects | yes | yes | yes | yes | no | no |

Default member role receives no administration permissions. Operators may edit this matrix. Removal affects every user assigned to role.

This table is the target default matrix. During migration, each domain permission is seeded only after its service enforces the approved resource safety model: ownership and visibility for member-owned resources, or canonical lifecycle for datasets. Open and invite-only registration remain disabled until every permission granted to member is safe under functional authorization and its applicable resource policy.

## 12. Role Assignment

First implementation preserves User.RoleId.

Rules:

- public registration assigns role server-side.
- administrator-provisioned accounts may select an assignable role.
- changing user role is audited administrator action.
- permission evaluation resolves current database role state rather than relying only on stale role claim.
- existing users keep current roles during migration.

Multiple-role assignments remain deferred until concrete use case requires them.

## 13. Workspace And Resource Boundary

Functional authorization answers: may this role use this feature and action?

Resource authorization answers: may this user perform that action on this workspace or resource?

Examples:

- tradelab.strategies plus VIEW permits opening strategy functionality but not reading another member's private strategy.
- tradelab.strategies plus UPDATE still requires owner, workspace editor, or explicit edit grant.
- files.library plus DELETE does not permit deleting files outside accessible ownership scope.

Every domain service enforces both layers when request targets member-owned data.

Canonical dataset rules:

- datasets have no member owner, workspace-sharing state, or public visibility state.
- every authorized member may read ready dataset versions through `tradelab.datasets` view permission.
- ready versions are immutable.
- corrections create a new version; previous versions become deprecated and remain traceable.
- create, approve, deprecate, and administrative lifecycle actions require explicit non-default grants and dataset lifecycle validation.

## 14. Cross-Service Enforcement

System Service remains authority for roles, menus, and functional permissions.

Required contract:

~~~text
CheckFunctionalPermission(userId, permissionKey, action) -> allowed or denied
~~~

System Service controllers may continue local checks. File Service, TradeLab, AI Video, and future plugins must use a shared service contract, authenticated internal call, or approved cached projection. Frontend-only filtering is forbidden.

Implementation plan selects mechanism after inspecting latency, service authentication, and failure behavior. Denial is safe result when permission authority is unavailable.

## 15. UI Surfaces

### Public

- registration availability query
- existing Register route with open-registration or invitation-token state
- no registration-mode or role selector
- login

### Member

- navigation generated from effective role permissions
- personal workspace context
- inline or route-local permission-denied state; no dedicated Access Denied page

### Administration

- System Overview with Registration Settings section or tab
- Users with role assignment and Invitations section or tab
- combined Roles & Permissions creation and matrix workflow
- menus
- authorization audit events

Standalone registration-settings, invitations, bootstrap, file-library, shared-with-me, published-by-me, and access-denied routes are outside the approved target. Existing obsolete routes are removed when this task touches their authorization flow; other product routes remain unchanged.

## 16. Security Requirements

- never accept role or permission assignment from public registration.
- never use first-registrant-wins administration.
- prevent administrator and operator roles from becoming registration defaults.
- enforce username and email uniqueness in database.
- enforce one permission row per role_id and menu_id.
- validate MenuId in permission requests.
- remove anonymous user combobox access before public registration ships.
- require subject match or administration permission when querying another user's menus or permissions.
- remove readiness-route permission bypasses or replace them with explicit baseline menus.
- audit registration configuration, role assignment, permission changes, invitations, and bootstrap.
- do not log passwords, invitation secrets, bootstrap secrets, refresh tokens, or authorization headers.

## 17. Migration

1. Capture current PostgreSQL permission functions as repository-owned migrations or verified schema artifacts.
2. Add stable role key and role safety fields.
3. Add Menu.PermissionKey and backfill approved controller-to-key mapping.
4. Add unique permission constraint for role_id and menu_id.
5. Create or reconcile built-in member role without changing existing user assignments.
6. Seed approved default member permissions.
7. Add registration settings with registration initially disabled until valid.
8. Add workspace creation dependency required by registration.
9. Add registration, invitation, and bootstrap contracts.
10. Close anonymous and route-bypass gaps.
11. Add shared functional authorization enforcement to domain services.
12. Inventory and migrate ownership for strategies, backtests, risk profiles, files, AI Video resources, jobs, and results; never mark legacy resources public by default.
13. Establish canonical dataset version lifecycle without assigning dataset rows to users or workspaces.
14. Enable selected registration mode only after backend, frontend, audit, and abuse controls pass verification.

## 18. Compatibility

- existing users retain RoleId and current permissions.
- current controller checks remain during PermissionKey migration.
- current administration pages remain available to authorized roles.
- changing default registration role does not migrate existing users.
- role permission edits take effect for all assigned users.
- non-registration API clients remain unaffected except anonymous-access tightening.

## 19. Acceptance Criteria

### Registration

- availability reflects configured mode.
- open mode creates member without client role assignment.
- invite-only mode rejects missing, invalid, expired, or consumed invitations.
- invite-only registration uses the existing Register route and token state.
- administrator-provisioned mode rejects public registration.
- public Register never exposes registration-mode or role selection.
- new member receives configured default role.
- new member receives personal workspace and owner membership.
- invalid default role blocks registration without partial user creation.

### Functional Authorization

- navigation contains only menus with effective granted action.
- backend denies missing permission even when URL or endpoint is known.
- permission matrix changes affect assigned users.
- role creation and permission editing complete in one Roles & Permissions workflow.
- role safety fields and default-registration-role status are visible before save.
- unsupported permission actions are disabled and rejected if submitted.
- role change affects navigation and backend authorization.
- hidden menu presentation does not grant backend access.
- File Service, TradeLab, and AI Video protected actions use equivalent functional authorization.

### Security

- public payload cannot assign privileged role or permissions.
- first public registrant cannot become administrator.
- privileged roles cannot become registration defaults.
- anonymous user combobox endpoint is closed.
- another user's menu or permission data requires authorization.
- readiness routes no longer bypass configured permissions.
- duplicate role-menu permission rows are impossible.

### Resource Boundary

- functional permission alone never exposes another member's private resource.
- domain endpoints enforce workspace/resource access after functional permission succeeds.
- ready datasets are instance-scoped, immutable, readable only with `tradelab.datasets` view, and corrected through new versions.
- dataset migration never fabricates member or workspace ownership.

## 20. Verification Requirements

- focused System Service tests for registration mode, default role, role safety, and permission checks.
- database migration and stored-function regression tests.
- frontend tests for conditional registration and permission-driven navigation.
- cross-service authorization tests for File Service, TradeLab, and AI Video.
- headless bootstrap smoke proving one successful initialization and safe rejection after initialization.
- browser-use-first journeys for open registration, same-page invite registration, hidden registration in administrator-provisioned mode, System Overview registration settings, Users invitations, combined role/permission editing, permission removal, role reassignment, and denied direct URL/API access.
- desktop and 390px mobile checks for registration, member shell, and permission administration.
- audit evidence for registration configuration and permission changes.

## 21. Design Direction

Public registration, login, and onboarding use restrained minimalism with small three-dimensional Blocks motif. Member and administration surfaces use Calm Productive Workbench grammar. Permission tables and operational forms contain no decorative block imagery. Full V6 shell and theme implementation belongs to a separate UI-refactor task. Mock community counts, inventories, and activity values are illustrative unless backed by runtime data and must be labeled as examples.

## 22. Approved Decisions

- community member is primary product user.
- self-hosted-first with future hosted offering possible.
- one role per user for first implementation.
- configurable default registration role.
- built-in member role protected from deletion, permissions editable.
- menu/action functional authorization retained.
- stable permission key added beside legacy controller identifier.
- functional and resource authorization remain separate.
- member-owned resources private by default.
- TradeLab datasets canonical instance-scoped immutable versions.
- invitation acceptance stays inside Register; first-admin bootstrap stays headless.
- Registration Settings stays inside System Overview; Invitations stays inside Users.
- Roles and permission matrix stay in one page workflow.
- no route-by-route UI implementation starts before specification and implementation plan are approved.
