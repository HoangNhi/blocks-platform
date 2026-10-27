# KnowledgeHub P00: Integration Contracts

Date: 2026-10-27
Status: APPROVED by owner on 2026-10-27; ready for P01 analysis and planning.
Master: `docs/superpowers/specs/2026-10-27-knowledgehub-master-design.md`

## 1. Intent And Scope

Make P01/P02 plan-ready without inventing platform contracts. P00 produces
decisions and documented gates, not a Python project, SQL implementation,
installed dependencies, credentials, or deployed services.

The owner implements all product code. Agents analyze, explain, prepare manual
plans, and review. Continuing in this session is allowed; a new session is an
option, not a prerequisite.

## 2. Confirmed Owner Decisions

| Decision | Confirmed choice |
| --- | --- |
| Product integration | Integrated vertical slices inside Blocks, not a standalone app. |
| Learning workflow | Approved part spec, manual implementation plan, owner implementation, agent review. |
| Collection privacy | Each user accesses only their own collections. Administrators have no cross-owner exception. |
| Database placement | A new database inside the existing PostgreSQL Docker container. |
| Database name | Exactly `knowledgehub`; no `_dev` suffix. |
| Separate test database | Not wanted; do not provision one. |
| Schema authority | Database-first: owner-written SQL, agent review, Git record, authorized application, SQLAlchemy mapping. |
| Python tooling | `uv`, with `pyproject.toml`, `uv.lock`, and a service-local `.venv`. |

Database placement is a design decision, not permission to create the database,
change the existing container, or apply SQL now.

## 3. Observed Baseline

Read-only inspection on 2026-10-27 found:

- Branch: `feature/knowledgehub-learning`.
- Existing staged change: `src/services/Blocks.FileService/Blocks.FileService.csproj`.
  Preserve it; do not include it in KnowledgeHub documentation commits.
- Container: `postgres-dev`, image tag `postgres:latest`, running PostgreSQL 18.6.
  A tag is not a promise about the version after a future pull.
- `uv` is installed; Python 3.14 and 3.12 interpreters are available.
- AppHost targets `net10.0`; Aspire packages are pinned to 13.6.3. It currently
  hosts .NET resources and the existing JavaScript app, not Python.
- No database was queried. Existing databases, roles, grants, menu records,
  permission-function behavior, and installed extensions have not been inspected.

Source evidence:

| Contract | Source |
| --- | --- |
| JWT issuance and claim names | `src/services/Blocks.SystemService/Helpers/JWTHelper.cs` |
| JWT validation and internal gRPC bearer metadata | `src/services/Blocks.SystemService/Configs/ConfigureAuthentication.cs` |
| Permission wire contract | `src/services/Blocks.SystemService/Protos/system.proto` |
| Permission server and database function delegation | `src/services/Blocks.SystemService/Services/gRPC/SystemGrpcService.cs`; `Services/CoreFeature/User/UserService.cs` |
| Existing permission consumer and action enum | `src/services/Blocks.CatalogService/Helpers/AttributePermission.cs`; `src/platform/Blocks.Shared/Common/CommonEnum.cs` |
| Protected routes and first-path-segment permission lookup | `src/apps/Blocks.Web/src/Router.tsx`; `src/components/auth/ProtectedRoute.tsx` within the web app |
| HTTP envelope and bearer/refresh behavior | `src/apps/Blocks.Web/src/lib/api.ts` |
| Gateway forwarding | `src/services/Blocks.ApiGateway/Program.cs` |
| Python hosting integration point | `src/platform/Blocks.AppHost/AppHost.cs`; `Blocks.AppHost.csproj` |
| File staging and internal operations | `src/services/Blocks.FileService/Controllers/UploadFileController.cs`; `Services/CoreFeature/UploadFile/UploadFileService.cs`; `Protos/file.proto` |
| File namespaces and extension allowlist | `src/services/Blocks.FileService/Infrastructure/Storage/FileStorage.cs`; `DTOs/Common/CommonConst.cs` |

Paths abbreviated after a semicolon remain relative to the named service/app.
Current source overrides older design documents.

## 4. Approaches And Trade-offs

| Topic | Selected or proposed direction | Alternative and trade-off |
| --- | --- | --- |
| Platform integration | Owner selected integrated slices. | Standalone duplicates platform concerns and delays real integration. |
| Database placement | Owner selected separate `knowledgehub` DB in the existing container. | A separate container isolates restarts and extension changes but adds local infrastructure. Not selected now. |
| Schema workflow | Owner selected SQL-first, with explicit SQLAlchemy mappings. | ORM-driven DDL changes schema authority and does not match the selected workflow. |
| Python environment | Owner selected `uv` and service-local environment. | Global installs are unnecessary and would mix project dependencies. |
| Authentication | Proposal: validate existing JWT locally, matching current service trust. | A new SystemService token-validation API avoids distributing the signing secret but adds an unavailable platform contract and request dependency. |

Authentication and the concrete defaults below are agent proposals. Approval
of this P00 document accepts them; prior owner answers did not individually
approve those implementation choices.

## 5. Repository, Runtime, And Routing Proposals

Backend package root: `src/services/Blocks.KnowledgeHubService/`.
Use a Python package under `src/knowledgehub/`, not a new C# wrapper. API and
worker share the package; create the worker only when P04 needs it.

Frontend feature root: `src/apps/Blocks.Web/src/features/knowledgehub/`.
Reuse nearby `api`, `hooks`, `routes`, `types`, UI primitives, and Lucide icons.

Proposed public boundaries:

- Frontend route root and permission/menu controller key: `knowledgehub`.
- Frontend URL: `/knowledgehub`, with feature subroutes beneath it.
- Gateway URL prefix and API route prefix: `/api/knowledgehub`.
- API resource name: `knowledgehubservice`; later worker: `knowledgehubworker`.
- Preserve the prefix during forwarding; do not accidentally strip it twice.
- The browser calls Gateway, never a hardcoded Python host or FileService RPC.

P01 selects and records a supported installed Python minor version after checking
its initial dependencies; pin it before installation. Do not change machine-wide
Python, use a prerelease implicitly, or silently switch versions after failure.
Exact library pins, test commands, and internal module layout belong to P01.
FastAPI/Pydantic and SQLAlchemy are the proposed application stack; SQLAlchemy
mapping/persistence begins in P02.

AppHost remains the local orchestrator. P01 must verify the supported Python
hosting API against the actual Aspire pins before writing its plan. Prefer
native hosting/endpoint configuration; do not invent `AddPythonApp` signatures,
upgrade the platform, or add a .NET facade to make discovery work.

P01 must verify direct Python calls to private SystemService gRPC and Gateway
forwarding with configured ports/TLS. Do not disable certificate verification or
pretend Aspire `.WithReference(...)` automatically configures a Python client.
Shared container endpoints remain configuration, not hardcoded application code.

## 6. Identity And Authorization Proposal

### 6.1. JWT Validation

SystemService issues HS256 tokens. Actor GUID is in `name`; `unique_name` is
username, and `role` is a role GUID, not an authorization grant.

Python must use a maintained JWT library to validate the signature with an
explicit HS256 allowlist, expected issuer/audience, and required valid expiry.
Reject missing/invalid actor GUID and invalid lifetime; match zero clock skew.
Never select validation algorithm from an untrusted token without an allowlist.
Do not decode a JWT and treat its claims as authenticated.

Proposed local validation reuses existing issuer/audience and signing-key values
through protected, untracked configuration. Environment variable names and secret
injection are defined in P01; secrets are never copied into this document.

Security consequence: HS256 verification requires the signing secret; a holder
can also mint tokens. This proposal puts the Python API inside the existing
service trust boundary. Do not expose that secret to browsers, logs, committed
files, workers that do not need it, or external tools. Do not issue user tokens
from KnowledgeHub. Missing configuration fails closed, without a development
authentication bypass. Reject a weak key without silently replacing shared
platform configuration.

### 6.2. Platform Action Permission

After validating the user JWT, call internal
`system.SystemProto/CheckPermission` with:

- `user_id`: actor GUID derived by Python from the validated JWT.
- `controller`: server-chosen lowercase `knowledgehub`.
- `action`: server-chosen numeric value from the existing enum.
- Metadata: `x-service-authorization: Bearer <current user token>`.

The browser cannot supply the effective actor, permission resource, or action.
Forward the token only for the current authorized request; do not persist it.
Generate Python stubs from the source proto, not C# `obj/` output. Stub generation
and dependencies are manual P01 tasks, not work authorized by this document.

P02 CRUD mapping: reads require VIEW (1), create requires ADD (2), metadata
updates require UPDATE (3), and deletion requires DELETE (4). Read permission
does not imply write permission. Future parts explicitly map retry/cancel,
Ask, automatic analysis, and Research before implementing those operations;
do not silently treat all operations as VIEW or use NONE (0).

A false permission result denies access. RPC failure/timeout is unavailability,
not a successful permission check. No local flag, username, role GUID, fake menu,
or cached allow-all value bypasses SystemService.

The server currently delegates to `fn_user_checkpermission`; its live definition
was not inspected. Do not claim which accounts have access from source alone.

### 6.3. Data Ownership

Action permission and collection ownership are both required. The owner comes
from the validated actor, never a trusted `owner_id` request field.

Apply ownership at query and mutation boundaries. Child access resolves through
its owned collection; evidence filtering happens before retrieval/model calls,
not after an answer is generated. Administrators have no cross-owner exception.

Proposal: a missing, deleted, or foreign-owned object returns the same application
404 behavior, without disclosing its metadata. An authenticated caller lacking
feature permission receives application 403. Creation assigns the current actor.

Jobs store authorized actor/resource identifiers and source versions, not JWTs.
Worker access does not authorize browser reads and must recheck object lifecycle
before publishing output. P03/P04 define its separate service-access contract.

## 7. HTTP And Navigation Compatibility

JSON responses retain `Success`, `StatusCode`, `Data`, and `Message`, with
Vietnamese user-facing errors and no raw exception, SQL, path, or secret leaks.
Normalize FastAPI request-validation errors to this contract.

For compatibility, ordinary business/auth/permission errors use the existing
HTTP-200 application-envelope convention, including application 401/403.
Preserve true transport failures as failures; do not declare a proxy error
successful. Tests must inspect HTTP status and body, including token refresh.

Scope this envelope to JSON application APIs. Health checks use meaningful HTTP
health status; successful authorized downloads return bytes with safe headers,
not wrapped JSON. If streaming is approved later, define its separate transport
and error contract in that part rather than breaking the shared JSON client.

Register `/knowledgehub` under the existing authenticated layout. P02 must use
SystemService's existing menu/role-management flow for the `knowledgehub` record
and assigned permissions. Prefer an owner-performed, authorized operation through
existing management APIs/UI; if SQL is necessary, review and authorize it as a
SystemService-owned change. KnowledgeHub runtime never writes System tables.

Do not assume those records exist or are absent without inspection. A hardcoded
sidebar link or altered ProtectedRoute is not a substitute. Refresh permission
and navigation state through the existing session flow after registration.

Keep the existing global shell. Reproduce the KnowledgeHub feature area from the
mockup, not unrelated TradeLab/AI Video menus or decorative platform controls.
P02 records agreed visual differences; P12 checks final parity.

## 8. Database-First Contract

Use database `knowledgehub` in the existing container. Preserve all existing
databases, volume contents, and container configuration. Never recreate the
container or assume upgrading `postgres:latest` is part of this work.

Propose a dedicated runtime role with only the required KnowledgeHub privileges,
separate from the administrative identity used to review/apply DDL. Do not
silently use the `postgres` superuser. Check actual grants before claiming
isolation; do not change other services' grants without separate authorization.
DSNs stay in protected local configuration and never appear in tracked examples.

Database-first sequence:

1. Owner writes narrowly scoped SQL under `docs/database/`; agent reviews it.
2. Record the reviewed SQL in Git before applying it.
3. Owner authorizes the exact database and operation; confirm target before use.
4. Apply authorized SQL, preserving existing data and required backup gates.
5. Owner writes explicit SQLAlchemy mappings matching the actual schema.
6. Review constraints, types, indexes, relationships, and SQL generation.

No SQLAlchemy `create_all()` as application bootstrap, model-driven schema writes,
or startup migrations. No Alembic dependency is required initially.
Python does not use EF scaffolding; manual model mapping follows SQL-first.

P02 designs the first collection table and constraints. Do not precreate jobs,
embeddings, session tables, cross-database foreign keys, or a future schema now.

pgvector is a P06 environment gate, not an observed installed capability.
Check extension availability and PostgreSQL compatibility before its plan.
Any image replacement, extension installation, restart, or data movement on the
shared container needs explicit approval and a safe backup/recovery procedure.
P01/P02 and keyword search do not depend on vector indexing.

## 9. Verification Without A Dedicated Test Database

Do not create `blocks_knowledgehub_test`, another test DB, or a test schema
implicitly. Do not run automated DB-mutating suites against `knowledgehub`,
SystemService, or the shared container as a workaround.

Keep DB-free unit, HTTP-contract, mocked-RPC, SQL-compilation, and React checks.
These do not prove live grants, constraints, locking, persistence, or cross-service
behavior. DB-dependent automated checks remain NOT RUN until an explicitly
authorized safe environment exists; removing a test DB does not make them PASS.

Owner-performed manual checks against `knowledgehub` may be planned with explicit
scope and deliberately disposable application records. Do not assume permission
to create accounts, purge records, apply DDL, inject DB failures, or disturb the
shared server. Required unverified guarantees remain documented acceptance gaps;
do not declare complete end-to-end acceptance from mocked checks alone.

## 10. Deferred Gates

| Gate | Owning part | Must resolve before |
| --- | --- | --- |
| Python minor/dependency compatibility and native Aspire API | P01 | Installing dependencies or writing an executable hosting plan. |
| Local issuer/audience/key injection and private gRPC/TLS endpoints | P01 | Claiming real authentication/permission integration works. |
| DB provisioning, runtime grants, collection SQL, menu/role setup | P02 | Claiming real collection CRUD/navigation works. |
| Namespace registration, `.md` acceptance, finalize/register/retry consistency | P03 | Real KnowledgeHub file lifecycle. |
| Durable worker service identity/delegation after user-token expiry | P03/P04 | Asynchronous access to original bytes. |
| Parsing and RPC payload/memory limits | P03-P05 | Accepting the advertised file sizes end to end. |
| Extension availability and approved pgvector provisioning | P06 | Vector schema/index work. |
| Provider, permitted document disclosure, budgets and credentials | P06/P07 | Real external AI calls. |
| Streaming, regeneration semantics, complete history/source contracts | P08 | Full conversation interaction acceptance. |

Current FileService stage upload returns an acknowledgement, not finalized file
identities. Internal finalize/delete/original-preview RPCs exist, but active
namespaces are System-specific, `.md` is absent from the document allowlist,
and preview is a bounded buffered read. Do not invent streaming or a final
`file_id` response that current code does not provide.

P03 designs the new namespace and trusted finalization response. It must reconcile
cross-service failures without deleting uncertain data. P04 cannot save a user
JWT, fabricate an actor, mount FileService storage, or fetch arbitrary paths.
No extra raw-file cache or internal credential design is preapproved here.

These are named future design gates, not permission to implement them in P00.

## 11. P00 Acceptance And Next Step

P00 acceptance is a documentation review:

- Owner decisions are accurately distinguished from proposed defaults.
- P01/P02 contracts, authority boundaries, and prerequisites are explicit.
- Future integration gates have named owners and cannot be bypassed.
- No required test DB, secret, generated output, or product code was introduced.
- Builder review is resolved and owner approves this document.

P00 does not certify live DB, JWT, permission, file, or Aspire behavior.
Do not mark P01/P02 ready to execute from this document alone. After P00 approval,
prepare a documentation-only closure/checklist for the owner if needed; P01 still
needs its own analysis, approved detailed spec, and manual implementation plan.
