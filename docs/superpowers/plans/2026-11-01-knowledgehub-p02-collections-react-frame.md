# KnowledgeHub P02: Collections And React Feature Frame - Manual Implementation Plan

**Date:** 2026-11-01  
**Status:** PROPOSED - P02 spec and this plan require owner approval before implementation.  
**Part:** P02 (KH-01, KH-02, KH-12)  
**Branch at planning time:** `feature/knowledgehub-learning`, commit `16b4616461e1e05d4a343e060c7bc08af1475122`  
**Source specification:** `docs/superpowers/specs/2026-11-01-knowledgehub-p02-collections-react-frame-design.md`  
**Master:** `docs/superpowers/specs/2026-10-27-knowledgehub-master-design.md`  
**Prerequisite outcomes:** `docs/knowledgehub/outcomes/P00.md` and `P01.md`, both ACCEPTED.  
**Reference assets:** `docs/knowledgehub/references/KnowledgeHub_Blocks_Plugin_Spec_v3_MVP_AutoSummary.md` and `docs/knowledgehub/references/stitch_blocks_interface/{code.html,screen.png,DESIGN.md}`.

> **Manual learning contract:** The owner writes and runs all production SQL, Python, TypeScript/React and tests. This is a teaching and review checklist, NOT an instruction for an agent to implement code autonomously. The agent may analyze and review later at the owner's request. Creating this plan does not approve the DRAFT P02 spec, authorize schema or role changes, start services, or certify feature acceptance.

## 0. Outcome, source review and scope

Build the first durable, privately owned KnowledgeHub business feature. Through the existing Blocks React shell, a signed-in user can create, list, select, rename and soft-delete their own collections; all requests flow through the existing Gateway and protected Python API into the `knowledgehub` PostgreSQL database.

P01 has already established FastAPI, local JWT verification, `SystemProto.CheckPermission`, API envelope, Gateway and AppHost startup. P02 must reuse them, not recreate an authentication stack or a second frontend shell.

### Expected observable journey

1. Owner enables the existing KnowledgeHub menu and appropriate existing-role grants using authorized SystemService administration.
2. User enters `/knowledgehub` through `ProtectedRoute`, initially with **no selected collection**.
3. User creates a collection; the backend generates its ID and records `owner_id` from the verified JWT actor.
4. Successful creation selects `/knowledgehub?c=<returned-uuid>`; refresh and Back/Forward follow URL state.
5. Authorized user can view, rename and soft-delete the collection; another actor (including an administrator without ownership) cannot access it.
6. Upon successful deletion, the DB row remains with `deleted_at` set, while list/detail no longer expose it; deletion of the selected ID removes only the `c` query key.
7. The two mockup feature tabs render truthful repository/import and Ask/Research **frames** with unavailable states, not fake document or AI capabilities.

### Design analysis: non-negotiable contracts

- **Scope:** P02 builds only collection persistence, API, React feature frame and initial visual acceptance. No actual documents, upload, FileService contract, processing jobs, vector/pgvector, research, summary, search, session, restoration or global shell redesign.
- **Two-layer authorization:** the verified JWT `name` claim determines the actor; each route also calls server-chosen controller `knowledgehub` and action VIEW=1, ADD=2, UPDATE=3, DELETE=4; SQL reads/writes must be owner-scoped and active-scoped. No administrator bypass.
- **Database-first:** owner writes and Git-reviews DDL, obtains explicit authorization, applies to the verified `knowledgehub` database, THEN writes explicit SQLAlchemy mappings. Never `metadata.create_all`, Alembic bootstrap or silent startup DDL.
- **One active-state marker:** `deleted_at` nullable; collection deletion is soft even if future documents exist. Hard deletion of vectors is a P06 obligation, not P02 work. Do not physically delete originals.
- **URL is the source of truth:** selected collection is determined only from a single, valid, nonzero UUID `c` parameter; no competing React selected-ID state or localStorage key.
- **HTTP and application status differ:** preserve P01 `{Success, StatusCode, Data, Message}`, including HTTP 200 for application 400/401/403/404/503 and real HTTP 500 for unexpected errors. The frontend must reject soft errors before mutation success effects.
- **Private frontend cache:** TanStack Query keys include the authenticated actor; cancel/remove KnowledgeHub-only private queries on actor switch or logout; protect against stale responses/mutation completions.
- **Screens:** re-create feature-area hierarchy in React using existing Blocks primitives; `code.html` is a visual/interaction reference, not embeddable production HTML or an API/data contract.

### Review findings and implementation risks

| Priority | Risk / source observation | Required mitigation |
| --- | --- | --- |
| Critical | P02 spec remains `DRAFT - owner approval pending` | Review/approve decisions before owner implements; this plan stays PROPOSED until then. |
| Critical | Schema and runtime DB role/grants are not established by source inspection | Verify target; separate schema-authoring identity from runtime role; no real DB mutation without owner authorization. |
| Critical | P01 `success_response` directly creates JSONResponse | Serialize UUID/datetime to JSON-compatible strings before using it. |
| Critical | Owner-scoped SELECT without owner-scoped UPDATE/DELETE permits IDOR/races | Actor and `deleted_at IS NULL` conditions must appear **in the write statement**; check affected rows. |
| High | Existing `src/lib/api.ts` handles soft 401 but can return soft 400/403/404/503 as resolved responses | KnowledgeHub API functions must throw on `Success=false`, without duplicating refresh logic. |
| High | Auth logout currently leaves TanStack Query cache | Add a narrowly scoped KnowledgeHub actor lifecycle/cancellation boundary; never reuse private placeholder data. |
| High | `ProtectedRoute` selects permission from the first path segment; menu is currently hidden | Mount exact `/knowledgehub` path and configure existing menu/grants manually after implementation. |
| High | No documents exist in P02 | Return `DocumentCount=0` as an explicit phase limit; never invent document rows, AI responses, or counts. |
| High | Delete of non-empty collections cannot be exercised yet | Defer populated-parent, FileService and vector cleanup proof to P03-P08 with an explicit handoff. |
| Medium | Query-string selection, paging and outstanding mutations interact | Test duplicates, off-page deep links, browser history, account switch and stale completions. |
| Medium | UI reference assets were formerly local-only | Use Git-tracked `docs/knowledgehub/references/...` at the checked-in commit; do not edit the originals. |

### Milestone / dependency order

```text
Approval + read-only baseline
  -> reviewed SQL -> authorized DB/schema/role setup
  -> verified Python pins/config -> async engine/session/health
  -> explicit mapping/DTO -> scoped statements -> five CRUD routes
  -> DB-free backend tests
  -> React API/types/protected route -> actor-cache lifecycle
  -> URL selection/detail -> paged selector -> forms/mutations
  -> honest mockup tab frames -> Vitest and accessibility checks
  -> authorized menu/grants and two-actor live evidence
  -> screenshot/visual acceptance -> owner review and P02 outcome
```

Every checkbox below is **owner work** unless explicitly labeled a review/preflight observation. Do not assume a task PASS just because the previous task was completed.

## 1. Proposed file map (names may be refined by the owner)

| Path | Action and bounded responsibility |
| --- | --- |
| `docs/database/2026-11-01-knowledgehub-p02-collections.sql` | Proposed owner-authored, Git-reviewed DDL for one table/index and safe constraints; exact filename can follow existing DB doc naming. |
| `src/services/Blocks.KnowledgeHubService/pyproject.toml`, `uv.lock` | Add and lock verified SQLAlchemy asyncio + asyncpg dependencies without general package upgrades. |
| `src/services/Blocks.KnowledgeHubService/src/knowledgehub/config.py` | Required, validated, redacted DB URL; preserve P01 local-dotenv behavior. |
| `src/services/Blocks.KnowledgeHubService/src/knowledgehub/main.py` | App lifespan ownership, DB + RPC health probes, API router integration. |
| `src/services/Blocks.KnowledgeHubService/src/knowledgehub/{database,collections}.py` (suggested) | Focused session/mapping/SQL construction, CRUD handlers; no generic repository/framework mandate. |
| `src/services/Blocks.KnowledgeHubService/src/knowledgehub/responses.py` (only if needed) | Preserve P01 envelope; callers must serialize complex values, not change HTTP contract. |
| `src/services/Blocks.KnowledgeHubService/tests/test_{config,database,collections,endpoints}.py` (suggested) | DB-free configuration, compiled SQL, transaction and HTTP contract tests; preserve P01 tests. |
| `src/apps/Blocks.Web/src/config/constants.ts` | Register KnowledgeHub endpoint prefix while retaining existing constants. |
| `src/apps/Blocks.Web/src/Router.tsx` | Add `/knowledgehub` inside existing ProtectedRoute/MainLayout. |
| `src/apps/Blocks.Web/src/features/knowledgehub/{api,hooks,routes,types,components}/` (suggested) | API envelope adapter, actor-partitioned queries, URL logic, page, selector, forms, tab frames and nearby Vitest tests. |
| `src/apps/Blocks.Web/src/contexts/AuthContext.tsx` or small feature-scoped lifecycle hook | Only the minimum private-query cleanup hook if needed; no broad auth rewrite. |
| `docs/knowledgehub/outcomes/P02.md` | **Do not create until actual implementation review and evidence.** |

## 2. Manual work packages

### Task 00 - Approval, environment and reference preflight

**Learn:** spec versus plan versus accepted outcome; read-only evidence versus authorized mutation.

**Inspect:** `AGENTS.md`, P02 spec sections 1-4 and 10-12, Master sections 2/5/9, P00/P01 outcomes, `docs/knowledgehub/README.md`, `git status`, tracked visual references.

- [ ] Confirm the owner approves or requests changes to P02 decisions: URL `c`, owner-only CRUD, soft delete including future non-empty collections, no restore, future vector hard-delete, and chosen defaults.
- [ ] Record exact branch/HEAD and local working-tree changes without resetting unrelated files; reconcile any changes since the plan was written.
- [ ] Confirm P00/P01 accepted outcome and P01 real Gateway test prerequisites still apply.
- [ ] Identify the exact permitted local PostgreSQL server, database, runtime DB role, schema authority, existing test actors/roles and allowable disposable records; **record identifiers only, not secrets**.
- [ ] Inspect `code.html`, `screen.png` and `DESIGN.md` in Git, focusing on collection header/selector, count badge, two main tabs and empty/unavailable states. Record baseline visual expectations.

**Check / done:** approved scope and safe environment checklist; no SQL, role, package, code or menu mutation in this task.

**Trap:** absence of a dedicated test database is an explicit owner decision; it is not permission to use arbitrary live data.

### Task 01 - Author the collection DDL for review (do not apply yet)

**Learn:** SQL constraints versus API validation; partial indexes; PostgreSQL UUID/TIMESTAMPTZ; database-first authority.

**Inspect:** P02 section 5.1-5.2, `docs/database/`, existing PostgreSQL conventions, P00 database ownership decision.

- [ ] Write a single proposed SQL file for `knowledgehub.public.collections` with `id` UUID PK, `owner_id` UUID NOT NULL, `name` VARCHAR(200) NOT NULL, nullable `description` VARCHAR(2000), DB-generated `created_at`/`updated_at` TIMESTAMPTZ, nullable `deleted_at`.
- [ ] Include database-side basic nonblank-name and nonzero-UUID checks. Apply stronger Unicode trim/NUL validation in the application, without pretending SQL `btrim` covers every Unicode whitespace code point.
- [ ] Add the proposed partial active-owner index covering `owner_id` and stable `created_at DESC, id DESC` with predicate `deleted_at IS NULL`.
- [ ] Define how `updated_at` is DB-generated and changes only for successful update/soft-delete; avoid client-local timestamps.
- [ ] Avoid `is_deleted`, uniqueness on name, permanent `DocumentCount`, documents/vectors/tables for later parts, cross-database FKs and automatic cascades.
- [ ] Review the DDL diff, constraints, privilege impact and reversibility **before** authorized execution; record the Git-reviewed SQL revision.

**Check / done:** SQL file is reviewed for the exact table/index/constraints with no database modification yet (P02-01 partial).

**Trap:** duplicate names are valid; deletion must not be implemented as SQL `DELETE`.

### Task 02 - Explicitly authorize and apply schema/role permissions

**Learn:** bootstrap owner versus restricted runtime role; why SELECT access does not prove DDL or DML privileges.

**Inspect:** P02 section 5.1, `AGENTS.md` Database MCP rules, deployment/local database conventions.

- [ ] Obtain separate, explicit owner authorization for any missing database creation, schema application, role/grants, and the selected development data scope.
- [ ] Read-only verify server/container, database name `knowledgehub` and current schema/role state before any write. Stop if the target is unexpected.
- [ ] If needed and authorized, provision through the designated administrative identity; do **not** silently elevate the runtime credential or reuse SystemService's DB login.
- [ ] Apply only the reviewed SQL to the approved target; verify exact columns, constraints and index via catalog read-back.
- [ ] Grant the KnowledgeHub runtime principal only CONNECT, appropriate schema USAGE and collection SELECT/INSERT/UPDATE (plus required sequence/metadata access if the final schema actually needs it). No DELETE, CREATE, schema ownership or unrelated database privileges.
- [ ] Test real effective privileges separately under the runtime identity, and keep a redacted execution log. Do not commit credentials or recorded row contents.

**Check / done:** reviewed SQL, exact authorized application record and effective grants captured; otherwise P02-01 remains NOT RUN.

**Trap:** the existing DB role or even the `knowledgehub` database may not yet exist; a successful admin `SELECT 1` is not proof of runtime authorization.

### Task 03 - Verify and lock Python persistence dependencies

**Learn:** SQLAlchemy async dialect, driver packages, lockfiles, Python ABI/Windows wheels.

**Inspect:** `pyproject.toml`, `uv.lock`, `.python-version`, P01 dependency decisions, publisher package metadata.

- [ ] Keep the existing Python 3.12.14 pin and all working P01 dependencies.
- [ ] Review candidate exact pins `sqlalchemy[asyncio]==2.1.6` and `asyncpg==0.32.0` against current publisher metadata, Python 3.12/Windows architecture and existing lock resolution. These are **review candidates**, not installed or environment-tested by this plan.
- [ ] For SQLAlchemy 2.1 specifically, retain its `asyncio` extra (greenlet is no longer always installed by default); use explicit `postgresql+asyncpg` dialect instead of implicit driver selection.
- [ ] After owner approval, update only the required dependency declarations and run `uv lock --project src/services/Blocks.KnowledgeHubService`, then `uv sync --locked --project src/services/Blocks.KnowledgeHubService` using the approved Python runtime.
- [ ] Verify imports and lock consistency with the real owner's environment; document resolved pins if candidates change. Do not switch driver or upgrade unrelated packages silently.

**Check / done:** deterministic lockfile, pinned versions, successful owner-local import and P01 regressions; note any host-specific failure, do not fabricate a pass.

**Trap:** listing a compatible PyPI wheel does not itself establish that a complete project environment has installed successfully.

### Task 04 - Add safe `KNOWLEDGEHUB_DATABASE_URL` configuration

**Learn:** Pydantic settings, structured driver URL parsing, secrets, dotenv precedence and fail-closed startup.

**Inspect:** `config.py`, `identity.py`, `tests/test_config.py`, P01 `P01-LOCAL-JWT-DOTENV`.

- [ ] Define required `KNOWLEDGEHUB_DATABASE_URL` in existing validated settings; environment overrides the ignored service-local `.env`.
- [ ] Parse as structured URL; require PostgreSQL + asyncpg, explicit valid hostname/port, database exactly `knowledgehub`, and a runtime username. Preserve configured TLS settings; no fallback DSN.
- [ ] Keep the value private; disable SQL echo, bound-parameter logging and raw URL/driver error output. Startup diagnostics identify the invalid field/reason without revealing credentials.
- [ ] Add DB URL validation tests with fake strings and `_env_file=None`; test missing, malformed, wrong dialect, missing database/identity, credential redaction and env precedence.
- [ ] Keep existing JWT/issuer/audience/CA validation and the real local `.env` untouched by tests.

**Check / done:** malformed or absent URL fails safely; P01 config tests still pass (P02-11 partial).

**Trap:** calling `str()` on an unredacted URL or logging raw Pydantic errors can leak usernames/passwords.

### Task 05 - Implement async engine/session lifecycle and bounded health

**Learn:** engine per application lifespan; request-scoped AsyncSession; cancellation/finally semantics; bounded probes.

**Inspect:** `main.py`, `permission.py`, `tests/test_endpoints.py` and P02 sections 5.3-5.4.

- [ ] Set up one engine and session factory per FastAPI lifespan, not one connection per request or one AsyncSession shared between tasks.
- [ ] Add a request-scoped session dependency with guaranteed closure; mutations must commit before returning success and rollback after failure/cancellation.
- [ ] Ensure permission client and DB engine are both cleaned up even if one initialization/shutdown path fails.
- [ ] Extend `/health` to require both the existing permission-channel readiness and a DB connection + `SELECT 1` probe, **each bounded to two seconds including pool acquisition/cleanup**. Preserve independent `/alive`.
- [ ] Return HTTP 503 for failed readiness; expected transient DB connectivity failures in collection APIs become safe application 503. Unexpected schema/programming faults remain safe real HTTP 500.
- [ ] Keep tests DB-free by replacing the engine/session/probe boundary with deterministic fixtures; never load the real owner's `.env`.

**Check / done:** per-request isolation, disposal on success/error/cancellation, healthy/unhealthy recovery, unaffected P01 RPC readiness and liveness (P02-05/11 partial).

**Trap:** `SELECT 1` validates connectivity only; it does not prove that the table exists or that CRUD grants are correct.

### Task 06 - Map the approved schema and validate collection DTOs

**Learn:** explicit SQLAlchemy ORM mappings; Pydantic request/response schemas; Unicode character counting; JSON serialization.

**Inspect:** applied schema read-back, `responses.py`, `main.py`, `src/apps/Blocks.Web/src/types/base/base.types.ts`.

- [ ] Map precisely the reviewed `public.collections` table after Task 02, including server defaults and nullable `deleted_at`; never invoke ORM DDL.
- [ ] Define create/update input with required `Name`, optional nullable `Description` and **forbidden extra fields** such as `Id`, `OwnerId` and `DeletedAt`.
- [ ] Trim external whitespace; reject whitespace-only names, NUL, name over 200 Unicode characters, description over 2000 characters; normalize blank description to null. PUT omission clears description.
- [ ] Reject malformed, zero UUID route IDs and invalid paging inputs with application 400.
- [ ] Define JSON collection output exactly `Id, Name, Description, CreatedAt, UpdatedAt, DocumentCount`; P02 sets `DocumentCount=0` intentionally.
- [ ] Serialize UUIDs and UTC ISO-8601 timestamps to JSON-compatible values **before** passing into P01 `success_response`.

**Check / done:** boundary cases include supplementary Unicode characters, whitespace-only names, NUL, missing/null/omitted description, forbidden fields and UUID/date serialization (P02-02).

**Trap:** JavaScript `string.length` counts UTF-16 code units; PostgreSQL/Python character limits must match a code-point-aware frontend implementation.

### Task 07 - Build and test actor-scoped SQL operations

**Learn:** secure SELECT/UPDATE predicates, RETURNING/row counts, deterministic keyset-compatible ordering, concurrent soft-delete behavior.

**Inspect:** P02 sections 5.2-5.3 and 6, Task 06 models, current P01 permission dependency.

- [ ] Write narrowly focused collection list/count/detail/create/update/soft-delete persistence operations using parameter binding.
- [ ] List and detail always include `owner_id=<verified actor>` and `deleted_at IS NULL`. List uses stable `created_at DESC, id DESC`, plus `page_index`/`page_size` and owner-active-only `TotalRow`.
- [ ] Update and soft-delete statements **themselves** constrain `id + owner_id + active`, then check affected row or `RETURNING`. No read-then-unscoped-write pattern.
- [ ] Generate new nonzero UUID on the server; the client cannot supply it or choose another owner.
- [ ] Soft delete atomically sets `deleted_at` and `updated_at`; no hard delete, file cleanup, vector cleanup or restore.
- [ ] Missing, foreign-owned and deleted rows must be indistinguishable to callers (application 404). Repeated delete is also 404.
- [ ] No automatic mutation retry; an uncertain response after commit should prompt refetch, not blind resubmit.
- [ ] Compile **production SQLAlchemy statements** against the PostgreSQL dialect without connecting to a real DB; inspect bound parameters/predicates, ordering, update/delete guards and returned columns.

**Check / done:** P02-04 SQL proof and P02-05 transaction cases have real production statement coverage; no SQLite presented as proof.

**Trap:** last-writer-wins for concurrent metadata edits is allowed; resurrection after a concurrent delete is not.

### Task 08 - Wire five protected CRUD API routes

**Learn:** dependency-ordering JWT -> platform action check -> scoped DB; error envelope semantics; FastAPI route validation.

**Inspect:** `main.py`, `permission.require_permission`, `identity.py`, `responses.py`, existing Gateway route.

- [ ] `GET /api/knowledgehub/collections?page_index=1&page_size=50` uses VIEW(1) and returns paging fields `Data, TotalRow, PageIndex, PageSize` in the envelope `Data`; enforce page size 1-100.
- [ ] `GET /api/knowledgehub/collections/{id}` uses VIEW(1) and returns one active owned DTO independently of the list's current page.
- [ ] `POST /api/knowledgehub/collections` uses ADD(2), accepts normalized body and returns created DTO.
- [ ] `PUT /api/knowledgehub/collections/{id}` uses UPDATE(3), always sends both editable fields (omitting description clears it).
- [ ] `DELETE /api/knowledgehub/collections/{id}` uses DELETE(4), returns `{"Id":"<deleted-id>"}` on success, no document counting or physical deletion.
- [ ] Derive the actor only from verified `name`; fix controller name `knowledgehub` and action per server route. An untrusted query/body field cannot override any of them.
- [ ] Preserve P01 HTTP/application contract and Vietnamese messages: successful HTTP/app 200; malformed input 400; bad JWT 401; denied permission 403; missing/deleted/foreign row 404; permission/DB outage 503; unexpected failure real HTTP 500.
- [ ] Confirm authorization precedes collection persistence on every **valid** request, and no denied/invalid-token request reaches SQL.

**Check / done:** P02-03 and HTTP half of P02-02/04; no browser direct-to-FastAPI URL.

**Trap:** VIEW grants do not imply ADD/UPDATE/DELETE. Do not catch all database faults as 404 or return `Success=true` for application errors.

### Task 09 - Backend isolation, race and regression tests

**Learn:** `unittest`/HTTPX dependency overrides; Python async failure paths; mocked boundaries versus live evidence.

**Inspect:** `tests/test_endpoints.py`, `test_permission.py`, `test_config.py`, `test_gateway_forwarding.py`, P01 test fixtures.

- [ ] Test each action's **exact** controller, action number and verified actor; include forged owner/controller/action in request body/query.
- [ ] Test foreign/missing/deleted indistinguishability, duplicate names, list ordering, paging, beyond-last-page empty list, Unicode limits, null/omitted description and JSON encodability.
- [ ] Exercise transaction commit-before-response, rollback, cancellation, closure, concurrent independent sessions and no resurrection during update/delete races.
- [ ] Test fail-closed DB/permission outages, health probe budgets, engine and permission-client cleanup, startup invalid DSN redaction and correct 500 versus 503 distinction.
- [ ] Compile and inspect the actual PostgreSQL statements generated by production code; mock only session/RPC boundaries. Record what cannot be proven without PostgreSQL.
- [ ] Re-run all P01 tests using fake settings/fixtures, not the owner's live dotenv. Retain real-Gateway test's explicit prebuilt Gateway DLL gate.

**Check / done:** isolated coverage for P02-02/03/04/05/11 and regression component of P02-13, with PASS/FAIL/NOT RUN recorded.

**Trap:** mocked success is **not** evidence that DB DDL, grants, persistence, isolation under real connections or concurrent SQL locks work.

### Task 10 - Add frontend API contract, types and protected route

**Learn:** Axios envelope, React Router, permission context, typed API functions.

**Inspect:** `Router.tsx`, `ProtectedRoute.tsx`, `MainLayout.tsx`, `lib/api.ts`, `config/constants.ts`, Faculty API/types.

- [ ] Register KnowledgeHub endpoints through the existing Gateway base URL, preserving `/api/knowledgehub` (not a hardcoded Python port).
- [ ] Define collection, paging and create/edit/delete DTO typings with exact PascalCase API response fields and snake_case list query args.
- [ ] Write narrow feature API adapters that **throw on `Success=false` for every query and mutation**; preserve P01's existing soft-401 refresh interceptor.
- [ ] Register `/knowledgehub` within the authenticated `ProtectedRoute` + `MainLayout` outlet; do not create a separate shell or hardcode sidebar entries.
- [ ] Pass/read `IsViewed/IsAdded/IsUpdated/IsDeleted` from the existing Outlet permission context. Missing permissions fail closed; backend remains the authority.
- [ ] Test that HTTP 200 + soft 400/403/404/503 does not become a successful Query response or mutation toast/close/navigation.

**Check / done:** types compile, correct route layout, no duplicate auth/refresh code and no fake success (P02-07/09 partial).

**Trap:** calling `api.get` and checking only network HTTP status is insufficient in this application.

### Task 11 - Isolate private TanStack Query cache by actor

**Learn:** server cache vs UI local state; query keys, AbortSignal, user lifecycle, mutation race guards.

**Inspect:** `main.tsx` (QueryClient placement), `AuthContext.tsx`, `useAuth.ts`, `useFaculty.ts`, Query API methods.

- [ ] Define Query keys beginning with `knowledgehub` and the current authenticated user ID; include collection ID and paging inputs for detail/list keys.
- [ ] Enable actor-private queries only when authentication and applicable permissions are resolved. User ID partitions frontend cache, while the server always trusts verified JWT.
- [ ] Respect `AbortSignal` for reads, cancel in-flight KnowledgeHub queries and remove the **previous actor's** cached private data at logout/account change. Do not globally clear unrelated feature caches.
- [ ] For mutation completion, retain initiating actor and target identity; compare against the **current** actor/selection before navigation, success side effects or cache writing.
- [ ] On route remount/account change, reset open dialogs and local drafts so one user's form data cannot appear under another.
- [ ] Avoid `keepPreviousData` across different actor or collection identities. Do not optimistically delete.

**Check / done:** actor A's cached collection data and pending results never appear for B; stale mutation cannot change B's URL/cache (P02-09).

**Trap:** only including actor in query keys is insufficient if a pending mutation still runs a stale `onSuccess` callback.

### Task 12 - Implement URL-only collection selection

**Learn:** React Router search params, history push/replace, independent detail queries.

**Inspect:** React Router usage in current features, P02 section 8.2, Task 11 query keys.

- [ ] Read all occurrences of query key `c`. No `c` => explicit unselected UI; exactly one valid nonzero UUID => detail query; empty/duplicate/malformed/zero => invalid selection and no detail call.
- [ ] Do not auto-select the first list item, use localStorage for selection or silently rewrite malformed URLs.
- [ ] Detail lookup must work even if the collection lives on another selector page; owner/deleted/missing/foreign 404 all show the same unavailable state without leaking prior content.
- [ ] Explicit selection **pushes** history; keep unrelated parameters. Browser Back, Forward and refresh resolve from the URL.
- [ ] Success after create selects the returned ID; successful rename retains `c`; successful deletion removes `c` with **replace** only if it still references the deleted ID. Deleting a different ID leaves the selection untouched.
- [ ] Handle rapid A->B selection, pending old-detail responses, bad deep links and actor change without rendering stale collection A under B.

**Check / done:** deep links, refresh, Back/Forward, malformed and duplicate `c`, deleted/foreign IDs and conditional URL cleanup (P02-08).

**Trap:** never overwrite the URL based solely on a captured stale callback; inspect the currently selected actor and query before replacing.

### Task 13 - Build the paginated collection selector and states

**Learn:** paginated server data, UI state versus canonical URL, explicit empty/error handling.

**Inspect:** P02 sections 6/8/9, mockup's collection dropdown, existing Radix/Select and ListPageLayout primitives.

- [ ] Render a collection heading/selector, document-count badge and appropriate create/edit/delete affordances within the existing Blocks shell.
- [ ] Start with list `page_index=1, page_size=50` and request later pages on demand (load more/pagination); do not hide the 51st collection or fetch all indefinitely by assumption.
- [ ] Support duplicate collection names using UUID as option identity; selection should never resolve by display name.
- [ ] Distinguish no collections, no current selection, selected detail loading, list loading, permission denied, temporary outage and deleted/foreign selection.
- [ ] Keep selection detail independent of list page; changing page does not clear `c`.
- [ ] Display `DocumentCount=0` without manufactured sample documents or inaccurate progress/limits.

**Check / done:** selector with more than 50 fixture entries, duplicated names, correct count, off-page direct link and all honest states (P02-10).

**Trap:** existing `Faculty` list patterns are examples, not authoritative requirements for KnowledgeHub URL/source-of-truth behavior.

### Task 14 - Implement create, edit and delete dialogs

**Learn:** React Hook Form, Zod 4, accessible Radix Dialog, pending state, non-optimistic mutations.

**Inspect:** `PopupFaculty.tsx`, `components/ui/dialog.tsx`, `confirm-delete-dialog.tsx`, P02 input validation and action permissions.

- [ ] Create and edit: required trimmed name (1-200 Unicode code points), optional normalized description (0-2000), reject whitespace-only/NUL; visually match server errors and preserve user input on failure.
- [ ] Edit submits both current editable values. Duplicate names are allowed. Never allow the browser to submit `Id`/`OwnerId`/`DeletedAt` in the creation body.
- [ ] Enforce action-button visibility/disabled state from `IsAdded/IsUpdated/IsDeleted`; missing permission fails closed, while the API also independently authorizes.
- [ ] Use an explicit confirmation showing the target collection identity; avoid accidental deletion when several items share the same name.
- [ ] Disable double submit while pending; never claim exactly-once creation after uncertain network success. On error, keep form/URL/draft and show Vietnamese message.
- [ ] On success, invalidate actor-scoped list and update/refetch affected detail; creation navigates to returned ID, edit keeps current selection, selected delete removes `c` conditionally and evicts deleted detail.
- [ ] Test dialog focus trap/return, Escape, keyboard labels, error announcements, pending dismissal choice and account-switch cleanup.

**Check / done:** permitted CRUD forms, correct navigation/invalidation, denial/error preservation, keyboard support and P02-09/10.

**Trap:** a hidden Delete button does **not** enforce deletion permission; permission RPC and actor-scoped SQL must do so.

### Task 15 - Implement the two mockup feature tab frames honestly

**Learn:** component composition, responsive feature layout, progressive enhancement without fake data.

**Inspect:** `docs/knowledgehub/references/stitch_blocks_interface/{code.html,screen.png,DESIGN.md}`, Master section 5, P02 section 9.

- [ ] Reproduce the KnowledgeHub feature-area layout/hierarchy rather than embedding HTML scripts. Preserve existing Blocks sidebar/header/theme/typography and use Lucide equivalents.
- [ ] Show two functional **tab switches**: document repository/import and Ask/Research, with repository as initial tab.
- [ ] Inside both tabs, show truthful empty/unselected/unavailable messaging. Future upload/search/chat/sessions/citations/research actions are omitted or visibly disabled, never wired to fake success.
- [ ] Do not transplant the prototype's fake files, answers, scores, model names, timestamps, counts, progress, fixed sidebar offsets or initially open citation modal.
- [ ] Add create/edit/delete management dialogs even though the static mockup did not fully implement them.
- [ ] Avoid global shell redesign, external Material Symbols/CDN scripts, and generic dashboard cards unrelated to feature hierarchy.

**Check / done:** hierarchy and two tab positions visible; no fake usable AI/document feature; responsive composition (P02-10/12).

**Trap:** `DESIGN.md` contains generic orchestration design tokens/examples, not a requirement to rebuild the full Blocks platform UI.

### Task 16 - Frontend behavior tests and failure/race regression

**Learn:** Vitest + Testing Library, memory history, mocked API envelopes, abort and mutation races.

**Inspect:** `vitest.config.ts`, `src/test/setup.ts`, `Router.behavior.test.tsx`, `features/catalog/.../*.test.tsx`.

- [ ] Cover collection API `Success=false` for 400/403/404/503, plus soft-401 refresh behavior through the existing client.
- [ ] Cover missing/duplicate/invalid/zero `c`, unavailable/deleted/foreign detail, deep link on a later selector page, Back/Forward/refresh, preserving unrelated search params.
- [ ] Cover create/edit/delete success and failure semantics, pending/disabled actions, duplicate names, unicode character limits, and preserved form drafts.
- [ ] Cover actor switch/logout with pending read, pending create/update/delete, cached detail and open dialogs; assert no previous actor's visible data or navigation side effects.
- [ ] Cover two tab positions, empty vs error vs unavailable UI, keyboard/focus behavior and selector pagination.
- [ ] Include minimal focused checks for only necessary auth/cache integration; avoid rewriting or weakening unrelated frontend security.

**Check / done:** feature and full frontend tests pass where runnable; no production fake server state (P02-08/09/10/13).

**Trap:** a passing UI mock test does not prove the actual permission table or Gateway works.

### Task 17 - Owner-authorized live integration, permissions and persistence

**Learn:** real action grants, existing-role admin changes, permission propagation, persistence evidence.

**Inspect:** existing `knowledgehub` SystemService menu record, `app-sidebar.tsx`, `ProtectedRoute.tsx`, P01 outcome, P02 section 10.

- [ ] Request explicit scope for turning on the existing hidden KnowledgeHub menu and granting existing users/roles `IsViewed/IsAdded/IsUpdated/IsDeleted` through SystemService administration.
- [ ] Preserve every unrelated existing role permission when saving a full permission list. No new roles/accounts, direct System table edits or automatic seeding.
- [ ] Reauthenticate to refresh menu/permissions. Prove `/knowledgehub` works through the **real** protected route and the **real** Gateway, not a direct FastAPI development port.
- [ ] Using two previously approved actors and disposable collections, test each action allowed/denied, lack of admin ownership bypass, failed JWT, refresh and SQL owner restriction.
- [ ] Prove create/list/detail/update/delete persists across browser/service restart; read back soft-deleted row using authorized administrative read-only inspection without purging it.
- [ ] Verify `/health` bounded DB/RPC probes and `/alive` during ordinary approved testing. Do not intentionally disrupt a shared live DB, drop connections, or mutate unrelated records without separate permission.
- [ ] Keep an exact record of runtime, branch/commit, actors as nonsecret identifiers, permitted data scope, results and redacted evidence. If live checks are not authorized, mark NOT RUN rather than PASS.

**Check / done:** mandatory live portions of P02-01/06/07/11; real persistence and real grants cannot be substituted by unit tests.

**Trap:** no document can exist through P02; populated-collection deletion and downstream deletion/retrieval/vector behavior remain deferred by design.

### Task 18 - Visual/interaction acceptance at recorded viewports

**Learn:** deterministic screenshot comparison, accessibility, long-content layouts and honest difference logging.

**Inspect:** tracked `screen.png` and `code.html`, P02 section 9, actual React rendered page.

- [ ] Record mockup baseline as an image **1280x1024 pixels**, not proof of source browser DPR. For repeatable checks, explicitly choose/record a reference viewport of 1280x1024 CSS pixels, zoom 100%, DPR 1 unless owner approves a different actual baseline.
- [ ] Capture real authorized collection state with the implementation, and compare feature layout against source. Also inspect 1440x900 desktop and 390x844 mobile.
- [ ] Verify long Unicode collection names/descriptions, selector with later pages, scrolling, dialogs, Escape/keyboard/focus return, loading/pending/errors and no overflow or obscured controls.
- [ ] Record accepted differences from the current Blocks shell, fonts and icon mappings; do not count mockup's prototype defects as requirements.
- [ ] Preserve screenshot filenames, viewport data, actual scenario, branch/commit and deviation log for later P12 parity.

**Check / done:** reproducible desktop/mobile captures and decisions (P02-12). Screenshot similarity alone is not backend acceptance.

### Task 19 - Final review, evidence matrix and P03/P06 handoff

**Learn:** distinguishing unit, SQL compile, frontend, live integration and visual evidence; documenting deferred contracts.

- [ ] Inspect the exact owner implementation diff and `git diff --check`; separate unrelated baseline failures. Review database schema/role state with safe, authorized access.
- [ ] Fill the P02 acceptance matrix below with PASS/FAIL/NOT RUN and link commit/test/screenshot/live evidence for every row.
- [ ] Ask the owner to explain one create/delete flow including verified JWT actor, remote permission, active-owner SQL predicate and why a guessed ID/hidden button is not an authorization bypass.
- [ ] Create `docs/knowledgehub/outcomes/P02.md` **only after actual implementation and review**, using the roadmap outcome template. Set ACCEPTED only if all required gates pass or approved scope deviations are explicitly recorded.
- [ ] Hand off P03's deleted-parent FileService access/race contract, P04 worker publication/cancel behavior, P05/P07 retrieval exclusion, P06 hard-delete of **all vector versions** with durable retry/worker fence, and P08 historical citation access rules. No premature implementation or claims.

**Check / done:** honest review findings, acceptance decision and future-contract links. Do not mark P03 ready solely because this planning document was committed.

## 3. Verification commands and evidence types

Commands below are **owner-run after prerequisite approval**, not executed by creation of this plan. Run from repository root; inspect local scripts/harnesses and avoid shared output/database contention.

```powershell
# Baseline, changes and conflict markers
git status --short
git diff --check

# Python: after reviewed dependency changes have been locked
uv run --locked --project src/services/Blocks.KnowledgeHubService python -m unittest discover -s src/services/Blocks.KnowledgeHubService/tests -v

# Frontend focus and regressions
npm --prefix src/apps/Blocks.Web test -- src/features/knowledgehub
npm --prefix src/apps/Blocks.Web test
npm --prefix src/apps/Blocks.Web run build
npm --prefix src/apps/Blocks.Web run lint

# Only if the affected integration warrants it and with safe runtime/config
dotnet build src/platform/Blocks.AppHost/Blocks.AppHost.csproj
```

Before running `test_gateway_forwarding.py`, confirm the prebuilt Gateway DLL exactly as P01 requires. Missing DLL/runtime is **NOT RUN**, not successful coverage. Do not apply SQL, start services, invoke live endpoints or change SystemService permissions simply to satisfy a checkbox. DB-free SQL compilation uses the PostgreSQL dialect with mocked session/RPC boundaries and **cannot** replace real integration checks.

### Acceptance traceability (source spec `10)

| Spec ID | Evidence required | Primary tasks |
| --- | --- | --- |
| P02-01 | Reviewed SQL, verified DB/schema and authorized role/grants | 01, 02, 19 |
| P02-02 | Validation, timestamps/UUID serialization, paging and extra fields | 06, 08, 09 |
| P02-03 | Fixed controller/action, JWT actor, denied requests never touch DB | 08, 09, 17 |
| P02-04 | Real compiled predicates for SELECT/UPDATE/soft DELETE, uniform 404 | 07, 09, 17 |
| P02-05 | Async transaction/session lifecycle, cancellation and safe DB errors | 05, 07, 09 |
| P02-06 | Real CRUD persistence/restart, retained deleted row | 02, 17 |
| P02-07 | Real Gateway/refresh/grants/menu/two-actor isolation | 10, 17 |
| P02-08 | URL-only `c` selection, deep link, history and invalid/deleted keys | 12, 16 |
| P02-09 | Actor-cache and draft isolation, abort/race, no false success | 10, 11, 14, 16 |
| P02-10 | Paging, CRUD forms, two honest tab frames and UI states | 13, 14, 15, 16 |
| P02-11 | Two bounded health probes, alive, fake settings preserving P01 | 04, 05, 09, 17 |
| P02-12 | Reference viewport/screenshots, 1440x900 and 390x844/accessibility | 15, 18 |
| P02-13 | P01 regressions, frontend tests/build/lint, relevant platform checks | 09, 16, 19 |

### Suggested evidence log (fill during actual work)

| Gate | Result (PASS / FAIL / NOT RUN) | Exact command / actors / environment / commit / screenshot | Owner notes |
| --- | --- | --- | --- |
| SQL reviewed / actual role grants | NOT RUN | TBD | |
| DB-free Python contract/tests | NOT RUN | TBD | |
| Real persistence and owner isolation | NOT RUN | TBD | |
| Real Gateway + action/refresh tests | NOT RUN | TBD | |
| Frontend tests, build and lint | NOT RUN | TBD | |
| Browser URL, actor races, form flows | NOT RUN | TBD | |
| Visual 1280x1024, 1440x900, 390x844 | NOT RUN | TBD | |
| Owner explanation / final review | NOT RUN | TBD | |

This table intentionally starts NOT RUN. Creating the plan, fetching sources and researching dependency metadata does not execute or pass these checks.

## 4. Do-not-build list and next-part handoff

- **Not P02:** document storage/upload; document count from future tables; extraction/chunking/embeddings/pgvector; worker; Ask, search or Research execution; summaries, sessions, restore/trash/purge; FileService RPC changes; global Blocks redesign; ORM DDL/Alembic; new roles/auth stack; permission cache; generic repository/UoW abstractions.
- **P03:** ensure every child document operation checks active owned parent and handles delete-versus-registration/finalization without destroying uncertain originals.
- **P04:** prevent jobs from publishing work after parent deletion, including retry/restart/cancel cases.
- **P05/P07:** immediately exclude deleted parents from future keyword/vector retrieval and evidence authorization.
- **P06:** durable, retryable hard deletion of every vector version for a deleted parent; prevent in-flight workers from repopulating embeddings.
- **P08:** design historical answer/citation behavior without re-exposing deleted source content.

## 5. Dependency research notes (external to repository)

Verified publicly as of 2026-11-01 for **planning candidates only**, not installed/tested in this environment:

- SQLAlchemy **2.1.6** is a published current 2.1 release, supports Python 3.12; the 2.1 series requires selecting the `asyncio` extra for `greenlet` in async environments. Sources: `https://pypi.org/project/SQLAlchemy/`, `https://www.sqlalchemy.org/download.html`, `https://www.sqlalchemy.org/blog/2026/09/24/sqlalchemy-2.1.0-released/`.
- asyncpg **0.32.0**, published 2026-10-06, lists CPython 3.12 Windows x86-64/ARM64 wheel artifacts. Source: `https://pypi.org/project/asyncpg/`.
- These facts do **not** establish lockfile compatibility on the owner's machine, database server reachability or installed wheel correctness. Task 03 must resolve and record actual versions before product edits.

## 6. Approval boundary / final checkpoint

**Planning result:** P02 is implementable as a narrow vertical slice once the owner approves its draft specification and this manual plan, confirms the target DB/role scope, and separately authorizes any real provisioning or role changes.

**Not done by this plan:** installed dependencies, authored/applied SQL, Python/React changes, service startup, real database queries/mutations, menu/grant changes, automated tests, screenshots, deployment, P02 outcome or ACCEPTED decision.

**Proposed next owner action:** review P02 spec and this task sequence; approve or request edits, then implement **Task 00 and Task 01** manually and request review of the DDL before authorizing any database application.
