# KnowledgeHub P02: Collections And React Feature Frame

Date: 2026-11-01
Status: DRAFT - owner approval pending.
Prerequisites: approved master and ACCEPTED P00/P01.
Master: `docs/superpowers/specs/2026-10-27-knowledgehub-master-design.md`.
P00: `docs/superpowers/specs/2026-10-27-knowledgehub-p00-integration-contracts-design.md`.
P01 outcome: `docs/knowledgehub/outcomes/P01.md`.

## 1. Intent And Approval Boundary

Deliver the first persistent, private KnowledgeHub feature: a user creates,
selects, edits, and soft-deletes collections through the existing Blocks web
application, Gateway, Python identity boundary, and PostgreSQL persistence.
This contributes KH-01, KH-02, and KH-12, not document ingestion or AI.

The owner writes product code and SQL. Agents analyze, teach, prepare the
manual implementation plan, review, and record evidence. This draft authorizes
no product edits, package installation, database provisioning or mutation,
menu/permission changes, service startup, or deployment.

After approval, prepare a small-step manual plan; do not execute it.
Product acceptance requires evidence from the owner's implementation.

## 2. Confirmed Decisions And Proposed Defaults

Owner-confirmed in this discussion:

- `/knowledgehub?c=<collectionId>` is the source of selected collection identity.
  Do not keep a competing selection in localStorage or component state.
- Collections use soft delete, including collections containing documents.
  Do not require a collection to be empty before deleting it.
- Vectors use hard delete when their collection is deleted.
- No collection restoration feature is needed now.

Inherited approved decisions:

- Collections are private to the authenticated owner, without administrator
  bypass. Platform action permission and ownership are both required.
- Reuse AppHost, Gateway, SystemService identity/permissions, the API envelope,
  existing Blocks shell, and the approved KnowledgeHub visual reference.
- Use database `knowledgehub` in the existing PostgreSQL container, SQL-first
  with explicit SQLAlchemy mappings, and `uv` with the existing Python pin.
- No dedicated test database or implicitly created test schema.

All additional concrete choices in this draft are agent-proposed defaults,
not answers attributed to the owner. Approval accepts those defaults together
with the explicitly confirmed decisions.

## 3. Approaches Discussed

| Concern | Alternatives and trade-offs | Selected direction |
| --- | --- | --- |
| Selection | URL query supports refresh, links, and browser history; local state loses refresh context; localStorage introduces hidden account-specific state and conflicts with links. | Owner selected URL query `c`. |
| Deletion | Empty-only deletion is smaller but blocks removing populated collections; archiving adds a separate state and restore workflow; deleting all content requires file/job lifecycle coordination. | Owner selected soft deletion even with documents, hard deletion of vectors, and no restore feature now. This replaces the earlier empty-only recommendation. |
| Integration | The approved integrated slice reuses existing platform contracts; a standalone application duplicates them. | Preserve the master's selected integrated slice. |

Hard deletion of collection rows and automatic physical deletion of original
files are not the selected approach. A database cascade is not a substitute
for an authorized FileService lifecycle.

This is a multi-layer feature, not a single-file change. Its manual plan
should deliver small observable steps, not a full generated solution.

## 4. Current Source And Scope

Read-only baseline on 2026-11-01:

- Starting working tree was clean; HEAD was `089e113`.
- P01 outcome is ACCEPTED on 2026-11-01. Older CHANGES REQUIRED wording in
  the P01 spec/README is historical drift, not a new prerequisite failure.
- Python currently provides configuration, JWT validation, permission RPC,
  response handlers, health/liveness, and the protected identity endpoint.
  Its `pyproject.toml` has no SQLAlchemy or PostgreSQL driver dependency.
- `main.py` owns application lifespan and the permission client.
  `success_response` constructs JSONResponse directly; UUID/date values must
  be serialized before they reach it.
- No KnowledgeHub collection schema or frontend feature is tracked.
- React already has TanStack Query, React Router, React Hook Form, Zod,
  Radix-based UI primitives, Lucide icons, and Vitest.
- ProtectedRoute resolves permission by the first path segment.
  MainLayout passes permission through Outlet context and owns the shell.
- API client normalizes soft 401 for SystemService refresh, but ordinary
  soft 400/403/404/503 still require explicit `Success` checks.
- Auth logout does not currently clear QueryClient. KnowledgeHub must isolate
  its private cache without requiring a wholesale auth/cache rewrite.
- P01 records a real `knowledgehub` menu with `is_show_menu = false`.
  Current live data and grants have not been reinspected for P02.

Primary source anchors:

- `src/services/Blocks.KnowledgeHubService/pyproject.toml`
- `src/services/Blocks.KnowledgeHubService/src/knowledgehub/{main,config,identity,permission,responses}.py`
- `src/platform/Blocks.AppHost/AppHost.cs`
- `src/apps/Blocks.Web/src/Router.tsx`
- `src/apps/Blocks.Web/src/components/auth/ProtectedRoute.tsx`
- `src/apps/Blocks.Web/src/components/layout/MainLayout/{MainLayout,app-sidebar}.tsx`
- `src/apps/Blocks.Web/src/{lib/api.ts,config/constants.ts,contexts/AuthContext.tsx,main.tsx}`
- `src/apps/Blocks.Web/src/features/catalog/{api/faculty.api.ts,hooks/useFaculty.ts}`
- `src/apps/Blocks.Web/{package.json,vitest.config.ts}`

### Included

Reviewed collection SQL and explicit mappings; scoped persistence/transactions;
collection CRUD and validation; action permissions; URL selection; frontend
API/types/hooks/routes/forms; empty/loading/error/pending states; real menu
integration; both reference tab positions; initial visual acceptance.

### Excluded

Documents/tables/uploads, FileService RPC changes, workers/jobs, vectors or
extensions, parsing, search, Ask/Research execution, sessions, summaries,
collection restoration/trash/purge, sharing, global shell redesign, ORM-driven
DDL, new auth, and a generic repository/service framework.

Do not create future tables or query an imaginary `documents` table to make
P02 counts/deletion appear integrated.

## 5. Persistence Contract

### 5.1. Database-First Sequence And Authority

The manual plan proposes one collection DDL file under `docs/database/`.
The owner writes it; review and record it in Git before authorized application.
Before connecting or applying anything, explicitly verify the intended
PostgreSQL server and database `knowledgehub`.

Database/role provisioning and grants are not known to exist. Their exact
operations need owner authorization; do not silently use a superuser or an
existing SystemService credential. Prefer a dedicated runtime role with only
CONNECT, required schema USAGE, and collection SELECT/INSERT/UPDATE privileges.
P02 soft deletion does not need DELETE, CREATE, or ownership privileges.

Only after authorized SQL application, map the actual schema explicitly.
No `create_all`, startup migrations, Alembic bootstrap, cross-database foreign
keys, container recreation, or changes to other services' grants.

### 5.2. Proposed First Table

Propose `public.collections` in `knowledgehub`:

| Column | Type and rule |
| --- | --- |
| `id` | UUID primary key; server application generates a nonzero UUID. Browser cannot choose it. |
| `owner_id` | UUID NOT NULL, nonzero; derived from verified actor, no SystemService FK. |
| `name` | VARCHAR(200) NOT NULL; trim outer whitespace, reject empty/whitespace-only input and embedded NUL. |
| `description` | VARCHAR(2000) NULL; trim outer whitespace, normalize blank to NULL, reject embedded NUL. |
| `created_at` | TIMESTAMPTZ NOT NULL; database-generated creation time. |
| `updated_at` | TIMESTAMPTZ NOT NULL; database-generated creation time and updated on each successful mutation. |
| `deleted_at` | TIMESTAMPTZ NULL; NULL means active, set by soft delete, never cleared by P02. |

Use parameterized SQL. Record NOT NULL, UUID/nonzero, and basic nonblank-name
constraints in reviewed SQL; application validation additionally rejects
Unicode whitespace-only names. Use UTC ISO-8601 timestamps at the API boundary.
Keep one deletion marker, not both `is_deleted` and `deleted_at`.

Propose an active-owner listing index covering owner and deterministic
`created_at DESC, id DESC` ordering with predicate `deleted_at IS NULL`.
Names need not be unique: no owner/name uniqueness constraint or duplicate-name
error is required. UUID identifies the object; duplicate display names must not
change selection, mutation targets, or confirmation identity.

Lengths above are Unicode character limits, not byte limits. Frontend validation
must agree with backend character counting, including supplementary characters;
do not mistake JavaScript UTF-16 code-unit length for the Python/PostgreSQL limit.

No persistent document count, collection-selected flag, future FK, vector field,
or schema for restoration is needed.

### 5.3. Runtime And Transaction Defaults

Propose SQLAlchemy 2.x asyncio with the asyncpg dialect. Reuse the Python 3.12
pin, FastAPI dependencies/lifespan, unittest, and HTTPX already present.
The manual plan must verify and record exact compatible package pins and
Windows/Python support before the owner changes the lockfile; do not select
unverified versions or silently switch drivers on failure.

Use one engine/session factory per application lifespan and a separate session
per request. Do not share a session between concurrent tasks. One mutation owns
its transaction; commit before success, rollback on failure/cancellation, and
close sessions on every exit. Dispose the engine and close the permission
client even if startup or shutdown of another resource fails.

Complete permission RPC before opening the mutation transaction. Do not hold
transactions over RPCs or external calls. Shared factory/engine is not a shared
transaction.

UPDATE and soft DELETE statements themselves include object ID, actor ownership,
and `deleted_at IS NULL`, with affected-row/RETURNING checks. A prior authorized
SELECT followed by an unscoped write is insufficient. Rename cannot resurrect
a concurrently deleted row. Concurrent metadata edits use last successful write;
ETags/version-conflict UI are not required in P02.

Do not add automatic mutation retries. A lost response after commit is uncertain,
not proof of rollback; retain input and allow refetch before another create.
Disable duplicate form submissions, but do not claim exactly-once creation.

### 5.4. Configuration And Health

Propose required secret setting `KNOWLEDGEHUB_DATABASE_URL`. Resolve it through
existing protected configuration with environment precedence; do not add a real
value to AppHost, docs, fixtures, logs, or tracked examples. No fallback DSN.
In local development, resolve it from the ignored service-local `.env` file
alongside `KNOWLEDGEHUB_JWT_KEY`, matching the approved P01 local-dotenv pattern.

Validate with a structured URL parser: expected PostgreSQL asyncpg dialect,
explicit host/port in range, database exactly `knowledgehub`, and required
runtime identity. Check actual role/grants separately; a role name alone does
not establish least privilege. Preserve deliberately configured TLS.
Missing/invalid configuration fails startup with safe diagnostics.

Do not emit raw URLs, driver exceptions, SQL parameter values, or credentials.
Disable SQL echo and hide bound parameters in diagnostics. Tests use fake
settings and `_env_file=None`, never the owner's service-local `.env`.

Extend `/health` to require both bounded permission-channel readiness and a
bounded DB connection/`SELECT 1` check. Each probe must finish within two seconds,
including connection/pool acquisition and cleanup; failure yields HTTP 503.
Keep `/alive` independent of DB/RPC. A temporarily unavailable database need
not prevent API liveness or force schema writes during startup.
`SELECT 1` proves connectivity only, not correct schema or CRUD grants.

For collection APIs, expected temporary DB connectivity failure returns a safe
application 503 envelope. Unexpected schema/programming errors keep the P01
real HTTP 500 envelope; do not convert all errors into success or permission denial.

## 6. API, Permissions, And Ownership

Keep `/api/knowledgehub` through the real Gateway, with the full prefix intact.
No direct Python host/port in browser code.

| Endpoint | Platform action | Successful Data |
| --- | --- | --- |
| `GET /api/knowledgehub/collections` | VIEW (1) | Paging object described below. |
| `GET /api/knowledgehub/collections/{id}` | VIEW (1) | One active owned Collection DTO. |
| `POST /api/knowledgehub/collections` | ADD (2) | Created Collection DTO. |
| `PUT /api/knowledgehub/collections/{id}` | UPDATE (3) | Updated Collection DTO. |
| `DELETE /api/knowledgehub/collections/{id}` | DELETE (4) | Object containing deleted `Id`. |

Controller is always server-chosen `knowledgehub`. Actor always comes from
verified JWT `name`. VIEW does not imply a mutation permission. Reuse P01
require_permission and RPC error/cancellation behavior.

Collection DTO fields: `Id`, `Name`, `Description`, `CreatedAt`, `UpdatedAt`,
`DocumentCount`. Do not expose tokens or accept ownership/deletion fields.
P02 `DocumentCount` is integer zero because this part cannot register documents;
this is a declared P02 capability limit, not a fake populated repository.
P03 replaces it with a real scoped count when documents first become possible.

List query uses `page_index` (default 1, minimum 1) and `page_size` (default 50,
range 1-100). Return `Data`, `TotalRow`, `PageIndex`, `PageSize` inside the
standard envelope's Data, matching the existing frontend paging shape.
`TotalRow` and results include only the actor's active collections; order by
`created_at DESC, id DESC`. A page beyond the end is empty, not a 404.
The selector must support requesting later pages rather than hiding everything
after the first 50 records. No collection search endpoint is required.

Create body: required `Name`, optional nullable `Description`.
PUT body: required `Name`, optional nullable `Description`; omitted description
clears it, so the edit form submits both current editable values.
Reject extra body fields, including `OwnerId`, `Id`, and `DeletedAt`.
Validate length after normalization; UUID path errors/zero IDs are application 400.
No browser input may override effective actor/controller/action.

Use the exact P01 `Success`, `StatusCode`, `Data`, `Message` contract:

- Successful JSON APIs: HTTP 200, application 200.
- Invalid input: HTTP 200, application 400.
- Missing/invalid/expired token: application 401; reuse frontend refresh.
- Failed platform permission: application 403, no collection query.
- Missing, deleted, or foreign-owned object: identical application 404.
- Temporary permission/DB unavailability: application 503, no allow fallback.
- Unexpected errors: real HTTP 500 and safe 500 envelope.

All messages shown to users remain Vietnamese. Serialize DTO UUID/date values
into JSON-compatible values before calling existing response helpers.
For valid requests, authorization precedes persistence; invalid JWT/denied
action must never query collection data.

Soft delete updates deletion/update timestamps atomically, without counting
documents or deleting files. A repeated delete returns the same 404 as any
other inaccessible object, consistent with the chosen visibility contract.
No endpoint can list deleted collections, clear `deleted_at`, or physically
purge collection rows.

## 7. Deletion Contract Inherited By Later Parts

These are requirements for future owning parts, not extra P02 tables/code:

- P03: every document read/write/download/registration resolves through an
  active owned collection. A deleted parent's children cannot be accessed by
  guessing their IDs. Collection deletion does not authorize physical file
  deletion, hard deletion of document metadata, or loss of original bytes.
- P03: registration/finalization racing with collection deletion needs explicit
  coordination and compensation. An existence check before an external RPC is
  insufficient; uncertain FileService data is not deleted as a workaround.
- P04: jobs cannot publish results after collection deletion. Pending/running
  work must observe deletion and cancellation at appropriate boundaries;
  resource retention and cleanup must survive process failure.
- P05/P07: exclude deleted parents from all new keyword/vector retrieval and
  new answer evidence immediately after delete commits. Cleanup completion
  is not the authorization boundary.
- P06: hard-delete all embedding versions belonging to a deleted collection,
  not only the current model's rows. Define durable, retryable cleanup and
  prevent in-flight workers from reintroducing vectors after deletion.
  Collection soft delete may not strand vectors indefinitely.
- P08: explicitly design historical answer/citation retention and rendering
  after parent deletion; do not expose retained originals or evidence through
  historical endpoints. P02 does not promise historical behavior or restore.

The selected hybrid policy refines the master's deletion requirements; it does
not remove ingestion/vector/worker parts or authorize original-file destruction.
No vector schema, cleanup job, pgvector installation, or FileService change
belongs in P02. P02 cannot claim those future contracts have been tested.

## 8. React State And Interaction Contract

### 8.1. Feature Integration

Mount `/knowledgehub` inside existing ProtectedRoute/MainLayout.
Keep code under `src/features/knowledgehub/{api,hooks,routes,types}` with small
feature components when useful. Reuse UI primitives, Lucide, form validation,
API client, endpoint registry, and TanStack Query. No new frontend dependency
or dedicated global state store is needed.

Use MainLayout Outlet permission context for IsViewed/IsAdded/IsUpdated/IsDeleted
controls. Missing permissions fail closed; hiding an action is usability,
not backend authorization. Reuse existing administration for real grants.
Do not weaken ProtectedRoute or hardcode a sidebar entry.

Feature API functions must explicitly reject `Success=false` for queries and
mutations so failures cannot enter success cache, close forms, change selection,
or show success toasts. Reuse client soft-401 refresh; do not refresh tokens in
a feature hook. Separate transport failure, permission denial, and list emptiness.

### 8.2. URL Selection

- `c` is the only selection source. Parse it on every relevant navigation;
  transient form/tab state is allowed, a second selected-collection ID is not.
- No `c`: show an unselected state and a real selector/create action.
  Do not auto-select the first collection or reuse localStorage.
- Exactly one valid nonzero UUID `c`: request its detail under the current
  actor. Detail lookup is independent of the current list page.
- Empty, duplicate, malformed, or zero-UUID `c`: show invalid-selection state;
  do not fetch arbitrary IDs, silently fall back, or drop other query parameters.
- Missing/deleted/foreign selection: show the same unavailable state and let
  the user choose again. Preserve the URL until explicit selection/removal.
- Selecting a collection pushes a URL entry; browser Back/Forward and refresh
  resolve from URL. Preserve unrelated query parameters.
- Successful creation selects the returned ID. Successful rename keeps `c`.
- Successful deletion of the currently selected ID removes `c` using history
  replace and leaves an unselected state. Deleting another item leaves `c`.
  Back may still reach an older deleted-ID URL; its detail must be unavailable.

Never render the previous collection's content while a new selection loads or
after it is denied. Mutations capture actor and target identity; if actor or
selection changes while pending, completion must not overwrite the new context
or resurrect removed cache entries. Conditional navigation/cache invalidation
uses current context, not only a stale callback closure.

### 8.3. Cache And Mutation Lifecycle

Namespace keys under `knowledgehub`, include current authenticated user ID,
and include ID/paging arguments where applicable. Only query once auth/actor
and relevant permissions are resolved. Client user ID partitions cache;
server still derives authorization actor from JWT.

Do not use cross-actor or cross-collection placeholder data. Cancel outstanding
KnowledgeHub reads on auth change/logout and remove its previous private cache;
use a narrowly scoped lifecycle hook or minimal auth integration, not mandatory
global `queryClient.clear()` or unrelated feature refactoring.
Honor Query's AbortSignal and suppress stale mutation effects on actor change.

After create/update/delete, invalidate current actor's affected list queries
and update/remove/refetch affected detail as appropriate. Remove deleted detail,
but retain the list operation needed to display other active collections.
No optimistic deletion is needed. Preserve form input on errors and show pending
state; failures do not alter URL. A route remount/account switch resets open
dialogs so drafts from another actor are not displayed.

## 9. Visual Scope And Navigation Acceptance

Reference: `D:\Workspace\Personal\Doc\Blocks\KnowledgeHub\stitch_blocks_interface`.
Keep `code.html`, `screen.png`, and `DESIGN.md` unchanged.

P02 reproduces the feature-area hierarchy: collection heading/selector, count
badge, create/edit/delete actions, and two switchable primary tab positions:
document repository/import and Ask/Research. The initial tab is repository.
Tab state may be local; it does not become a second collection selector.

Both tab panels have truthful unselected/empty/unavailable states. Document
upload, search, chat, sessions, citation modal, and Research execution do not
work yet and cannot appear to succeed. Either omit future controls or show
clearly disabled states; do not copy mockup files, chat content, scores, model
labels, document counts, limits, or progress into production.
Do not label the future Ask panel's lack of results as an API failure.

Keep existing Blocks sidebar, header, theme, and typography. Use reference
spacing/hierarchy and Lucide equivalents, not copied Material Symbols/CDN
scripts. Feature sections are unframed layouts, not a new generic dashboard.
Collection dialogs add the management flows absent from the static mockup.

On 2026-11-01, supplied `screen.png` was inspected as 1280x1024 pixels.
Those are asset dimensions, not proof of the original browser viewport/DPR.
Propose reference browser viewport 1280x1024 CSS pixels at 100% zoom and DPR 1,
recorded together with actual owner-captured implementation screenshots.
Also verify 1440x900 and 390x844. Record accepted shell/font/icon differences
and exact screenshot states for repeatable P12 comparison.

P02 screenshot capture belongs to owner implementation acceptance; no new
browser baseline has been captured by drafting this document.
Use real disposable permitted collections for live captures; deterministic
fictional multi-state data belongs only in tests, not production defaults.
Do not reproduce the reference's initially open citation-modal defect.

Check long collection names/descriptions, wrapping, selector pagination,
scrolling, dialog labels/errors, keyboard selection, Escape, focus trap/return,
pending button states, and mobile controls without overlap or overflow.
No fixed mockup sidebar offsets inside the existing shell.

After the route works, the owner enables the existing `knowledgehub` menu
through authorized SystemService administration and configures the required
Can*/Is* CRUD actions on the intended existing roles. Preserve unrelated grants,
especially when submitting the full permission list. Reauthenticate through
existing session flow to refresh menu/permissions.
Do not make runtime KnowledgeHub write System tables or seed new roles/accounts.

## 10. Acceptance And Evidence

| ID | Required evidence |
| --- | --- |
| P02-01 | Reviewed Git-recorded SQL; exact authorized DB/role/grants application; explicit mapping matches actual schema without ORM DDL. |
| P02-02 | Validation/serialization covers whitespace, Unicode limits, NUL, omitted/null description, extra ownership fields, UUID/date fields, paging boundaries. |
| P02-03 | Every route uses correct fixed controller/action and verified actor; invalid token/denied action does not reach persistence. |
| P02-04 | Production-generated SELECT/UPDATE/soft-DELETE include actor/active predicates; foreign/missing/deleted IDs have identical 404 behavior, including admin. |
| P02-05 | Per-request session, commit-before-response, rollback/cancellation/close, concurrent request isolation, safe DB errors, engine/client shutdown. |
| P02-06 | Real create/list/detail/update/delete persist after browser/service restart using explicitly authorized disposable records. Soft delete retains row and hides it from APIs; repeat delete is 404. |
| P02-07 | Real Gateway/client refresh, real VIEW/ADD/UPDATE/DELETE allow/deny, menu visibility and route access; two actors cannot access each other's collections. |
| P02-08 | URL selection, direct deep link off list page, Back/Forward/refresh, no `c`, malformed/duplicate/foreign/deleted `c`, create selection, conditional delete URL cleanup. |
| P02-09 | Cache and drafts do not leak across actors; pending reads/mutations cannot replace a newer selection/account; soft errors do not trigger success effects. |
| P02-10 | Selector paging, CRUD form validation/pending/error, edit/delete permissions, both tab frames, and honest document-count/empty/unavailable states. |
| P02-11 | Health includes bounded DB/RPC probes; liveness survives outages; fake settings isolate existing P01 tests from real DB/dotenv. |
| P02-12 | Recorded reference viewport/screenshots/deviations; keyboard/focus/long text and 1280x1024, 1440x900, 390x844 checks. |
| P02-13 | Relevant existing P01 tests, frontend tests/build/lint and any changed AppHost/Gateway checks; baseline failures recorded separately. |

### Automated DB-Free Checks

Extend existing unittest/HTTPX tests and add close-to-feature Vitest tests.
Inspect actual compiled PostgreSQL statements, mappings, parameter bindings,
transaction paths, and HTTP envelopes using isolated fixtures. Test production
query construction, not a fake repository that implements its own ownership.

Use real PostgreSQL dialect compilation without opening a connection.
Mock sessions/RPC only at boundaries. Such checks do not establish real
constraints, grants, locking, persistence, connection behavior, or DB races.
No SQLite substitute presented as PostgreSQL integration proof.

Frontend tests include auth-resolved cache keys, API soft 403/404/503 handling,
refresh retry, form errors, URL/history, paginated off-page selection, account
switch, selection change during mutation, deleted deep links, and keyboard use.
Existing P01 tests need fake database configuration/probes after settings and
health evolve; they must remain DB-free rather than loading real local config.

Candidate commands, to be made precise in the approved manual plan:

```powershell
uv run --locked --project src/services/Blocks.KnowledgeHubService python -m unittest discover -s src/services/Blocks.KnowledgeHubService/tests -v
npm --prefix src/apps/Blocks.Web test -- src/features/knowledgehub
npm --prefix src/apps/Blocks.Web test
npm --prefix src/apps/Blocks.Web run build
npm --prefix src/apps/Blocks.Web run lint
```

Real-Gateway tests retain their explicit prebuilt Gateway DLL requirement.
Missing artifacts are NOT RUN, not silently passed/skipped coverage.
Build/run backend regression checks only where touched integration warrants
them; inspect harnesses and coordinate shared build outputs before running.

### Owner-Authorized Live Evidence

Before manual checks, agree on target server/database, existing test actors and
roles, exact disposable collection scope, and permitted setup/cleanup.
Do not create accounts/roles, purge soft-deleted records, inject live DB failures,
or modify unrelated grants implicitly. Retained disposable rows are expected
under soft delete; test cleanup is not permission to hard-delete them.

Automated DB-mutating checks remain NOT RUN without a separately authorized
safe environment. No dedicated test DB or test schema may be provisioned.
Real persistence/grants/action checks use owner-performed, explicitly scoped
manual evidence; DB-free passes alone do not satisfy P02-01/06/07.

P02 cannot populate a real collection with documents because ingestion does
not exist yet. Review the absence of an empty-only deletion restriction now;
actual populated-collection deletion, file retention, worker races, retrieval
exclusion, and vector cleanup must receive evidence in their owning parts.
Their absence is declared deferred evidence, not a P02 claim of integration.

Record PASS/FAIL/NOT RUN for every required check. No P02 outcome or ACCEPTED
status until actual implementation review. Required missing live evidence is
an acceptance gap, not replaced by mocks.

## 11. Manual Learning Handoff And Builder Discretion

After design approval, the manual plan covers SQL types/constraints/indexes;
SQLAlchemy mapping versus schema authority; async session/transaction lifecycle;
JWT actor versus action permission/ownership; DTO serialization; React state
versus server state/URL state; query invalidation; forms; navigation; accessible
dialogs; and isolated versus live evidence.

Each small task lists objective, prerequisite concepts, current files/callers
to read, observable behavior, checks/expected results, and common traps.
Do not supply complete production implementations or delegate coding.
Ask the owner to explain one create/delete flow including why a guessed ID
and a hidden UI button are not authorization; record the explanation at review.

Builder decides exact module/component names, narrow function decomposition,
equivalent query syntax, styling details within the reference, and small
fixture organization. Avoid generic repositories, a new unit-of-work layer,
permission caches, broad auth refactors, or a new test framework.
Exact dependency pins are a documented verification step, not an invitation
to upgrade existing platform or frontend packages.

Future parts inherit owner-scoped soft deletion with no restore endpoint,
the `c` URL contract, action mapping, JSON field names, session boundaries,
and the deferred deletion requirements in section 7.

## 12. Sources And Draft Review Status

Current repository source and accepted outcomes are the integration authority.
Original product/reference inputs remain subordinate to approved decisions.
Official SQLAlchemy documentation checked for the proposed dialect/session
boundary:

- `https://docs.sqlalchemy.org/en/20/dialects/postgresql.html#asyncpg`
- `https://docs.sqlalchemy.org/en/20/orm/session_basics.html#is-the-session-thread-safe-is-asyncsession-safe-to-share-in-concurrent-tasks`

These support asyncpg dialect availability and per-task session isolation;
they do not verify future selected package pins in the owner's environment.

Builder check: pending. Owner approval: pending.
No SQL, package, product code, menu record, or runtime has changed in this
design session.
