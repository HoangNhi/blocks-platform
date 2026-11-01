# KnowledgeHub P01: Python Runtime, Gateway, And Identity

Date: 2026-10-27
Status: APPROVED by owner on 2026-10-27; local JWT configuration amendment APPROVED on 2026-11-01. Implementation review: CHANGES REQUIRED.
Prerequisites: approved master and ACCEPTED P00.
Master: `docs/superpowers/specs/2026-10-27-knowledgehub-master-design.md`.
P00: `docs/superpowers/specs/2026-10-27-knowledgehub-p00-integration-contracts-design.md`.

## 1. Intent And Approval Boundary

Run one small Python API through the existing Blocks AppHost and Gateway.
Prove that it authenticates SystemService tokens and enforces a real platform
action permission before collections or persistence are introduced.

Owner-confirmed choices in this discussion:

- AppHost starts and stops the Python API; a separately managed terminal process
  is not the normal local workflow.
- Move minimum `knowledgehub` VIEW permission setup through the existing
  administration UI from P02 into P01, to enable real authorized-request checks.
- The owner still writes all product code and performs authorized data setup.
  Agents analyze, explain, write the manual plan, and review.
- On 2026-11-01, the owner approved loading the local JWT key from the
  service's ignored `.env` instead of requiring an AppHost secret parameter.
  Section 5 defines the narrow scope; other security and acceptance gates remain.

Concrete defaults below were approved with this document on 2026-10-27,
not individually confirmed before that approval. This document permits no agent product edits,
dependency installation, service startup, SQL, permission changes, or deployment.
Approval of the spec permits preparing a manual plan, not agent implementation.

## 2. Scope, Non-Goals, And Approaches

P01 includes the Python package, validated configuration, health/readiness,
JWT verification, permission RPC client, one protected identity endpoint,
response compatibility, Gateway routing, AppHost lifecycle, and focused checks.
It contributes the runtime/identity foundation of KH-01 and KH-12.

No KnowledgeHub database, SQLAlchemy, tables, dedicated test DB, worker,
collections, file integration, AI, frontend feature, new login/refresh endpoints,
platform dependency upgrade, or generic service framework.
Fake authorization in production and a second token issuer are anti-goals.

| Approach discussed | Trade-off | Decision |
| --- | --- | --- |
| Python hosted by AppHost, preferring native Python integration | One lifecycle and managed endpoints; requires checking the pinned Aspire API. | Owner selected AppHost; native integration proposed below. |
| Manually run `uv run uvicorn`, Gateway points to a fixed port | Easy isolated debugging, but startup/shutdown is outside AppHost. | Not selected as the normal workflow. |

Generic AppHost executable hosting is unnecessary now that a compatible native
API has been verified. If the real package/build contradicts source inspection,
report the blocker; do not silently switch hosting, versions, or providers.

This is a service integration project, not a one-file exercise. The later manual
plan must split runtime, envelopes, identity, RPC, Gateway, and local acceptance
into small independently understandable tasks without providing the solution.

## 3. Verified Baseline And Evidence Limits

Read-only inspection on 2026-10-27:

- Working tree was clean at the start of this design session.
- No KnowledgeHub Python project exists.
- AppHost targets `net10.0`, with Aspire SDK/AppHost/JavaScript at `13.6.3`;
  it currently hosts four .NET services and the web app.
- `uv python list --only-installed` includes CPython `3.12.14` and `3.14.8`.
  Neither global Python nor machine configuration needs changing.
- Official Aspire source at tag `v13.6.3` exposes
  `AddUvicornApp(builder, name, appDirectory, app)` and
  `WithUv(builder, install = true, args = null)`.
  Uvicorn receives a managed HTTP endpoint, host/port arguments, and local reload.
  `WithUv` replaces pip setup, removes the separate venv creator, and runs
  its configured sync command before starting the API.
- Gateway loads YARP configuration, but its current registration does not wire
  a service-discovery destination resolver. A referenced resource name alone is
  not proof that a cluster destination resolves.
- `FileServiceBoundary` rejects every proxied request if `FileProxy:ClusterId`
  is missing, even when the target is not FileService. Preserve that requirement.
- JWT actor is `name`, username is `unique_name`, algorithm is HS256, and
  SystemService validation has zero clock skew.
- The permission RPC checks that `user_id` is a nonempty GUID, then calls
  `fn_user_checkpermission`. It does not itself compare that ID to the token actor.
  KnowledgeHub must derive the ID from the validated token.
- Existing menu editing supports `Controller`, `CanView`, and `IsShowMenu`;
  role editing supports `IsViewed`. Live stored functions and records remain
  uninspected, including how hidden menus affect permission/navigation results.

Source anchors:

| Area | Current source |
| --- | --- |
| AppHost | `src/platform/Blocks.AppHost/AppHost.cs`; `Blocks.AppHost.csproj` in that directory |
| Gateway | `src/services/Blocks.ApiGateway/Program.cs`; `Middlewares/FileServiceBoundary.cs` |
| JWT | `src/services/Blocks.SystemService/Helpers/JWTHelper.cs`; `Configs/ConfigureAuthentication.cs` |
| Permission | `src/services/Blocks.SystemService/Protos/system.proto`; `Services/gRPC/SystemGrpcService.cs`; `Services/CoreFeature/User/UserService.cs` |
| Administration | SystemService `Services/CoreFeature/Menu/MenuService.cs`, `Services/CoreFeature/Role/RoleService.cs`; web `features/system/routes/Menu/PopupDetail.tsx`, `routes/Role/PopupPermission.tsx`, `hooks/usePermissionForm.ts` |
| Frontend consumer | `src/apps/Blocks.Web/src/lib/api.ts`; `src/contexts/AuthContext.tsx` within the web app |
| Gateway test precedent | `test/FileService.RemovalChecks/FileBoundaryChecks.cs` |

No service was started, token requested, database queried, or secret read.
Package metadata and source inspection are not installed-package or live
integration evidence. Earlier claims that Python 3.14 lacks required wheels
or that the database has no KnowledgeHub permission were not established.

## 4. Python Package And Dependency Boundary

Root: `src/services/Blocks.KnowledgeHubService/`.
Propose Python `3.12.14`, pin `.python-version`, and constrain `requires-python`
to `>=3.12,<3.13`. This uses an installed interpreter with published Windows
support for the initial dependencies; it is not a claim against Python 3.14.

Use `pyproject.toml`, reviewed `uv.lock`, and service-local `.venv`.
The `src/knowledgehub/` package is installed into that environment using
`setuptools.build_meta` with src-layout discovery, not a machine-wide install
or a `PYTHONPATH` workaround. App entry point is `knowledgehub.main:app`.

Proposed initial pins, checked against each publisher's PyPI metadata:

| Group | Package | Version |
| --- | --- | --- |
| Runtime | fastapi | 0.162.0 |
| Runtime | uvicorn | 0.54.0 |
| Runtime | pydantic | 2.14.1 |
| Runtime | pydantic-settings | 2.16.1 |
| Runtime | PyJWT | 2.15.1 |
| Runtime | grpcio | 1.85.0 |
| Runtime | protobuf | 7.36.2 |
| Development | grpcio-tools | 1.85.0 |
| Development | httpx | 0.28.1 |
| Build | setuptools | 84.2.1 |

Metadata advertises compatible Python requirements and Windows 3.12 or universal
wheels; grpcio-tools requires grpcio >=1.85.0 and protobuf >=7.35.1,<8.0.0.
Transitive resolution and native imports are NOT RUN until owner setup.
The plan must verify them and record actual lockfile resolution before runtime
acceptance; a conflict requires review, not silently changing these pins.
Do not add SQL/AI libraries, Uvicorn optional extras, JWT crypto extras, pytest,
or a new test framework for this part.

Keep handwritten code small: `main.py`, `config.py`, `identity.py`, and
`responses.py` are suggested responsibilities, not mandatory abstractions.
Add modules only when actual complexity needs them.
Generate importable `knowledgehub/rpc/system_pb2.py` and `system_pb2_grpc.py`
from the canonical lowercase `system.proto`, preserving all field numbers.
Commit those generated source stubs with a reproducible generation command;
never hand-edit them or copy C# `obj/` output. Runtime imports must not depend
on grpcio-tools being installed. The plan chooses the exact protoc include
mapping and verifies package imports from the service root.

Ignore service `.venv`, Python/build/test caches, and package build output;
keep the lockfile, source, tests, and safe setup documentation tracked.
Never put real environment values into examples.

## 5. Configuration And Trust

Use Pydantic Settings to validate settings during app startup.
For local development, Python loads the service-local `.env` described below;
AppHost still injects managed endpoints and the other explicit settings.
Names below define the Python boundary, not a .NET automatic mapping.

| Variable | Requirement |
| --- | --- |
| `KNOWLEDGEHUB_JWT_KEY` | Exact SystemService shared key, protected as a secret; at least 32 UTF-8 bytes and not whitespace. Length alone does not establish entropy. |
| `KNOWLEDGEHUB_JWT_ISSUER` | Exact existing issuer, required and nonempty. |
| `KNOWLEDGEHUB_JWT_AUDIENCE` | Exact existing audience, required and nonempty. |
| `KNOWLEDGEHUB_SYSTEM_GRPC_URL` | Explicit HTTPS URI with host and port; no userinfo, query, fragment, or non-root path. |
| `KNOWLEDGEHUB_SYSTEM_GRPC_CA_FILE` | Readable absolute path to public PEM trust certificate(s) matching the server certificate chain. No private key. |
| `KNOWLEDGEHUB_PERMISSION_TIMEOUT_SECONDS` | Finite positive number, default 3, maximum 30. |

Missing/invalid settings fail startup with setting names and safe reasons,
never secret values, Pydantic raw input dumps, or a settings-object dump.
If the shared key fails validation, stop and report; do not replace or rotate
platform credentials. No `AUTH_DISABLED`, allow-all mode, or production test flag.

### Approved Amendment: Local JWT Key Source

Date: 2026-11-01. Status: APPROVED by owner in this discussion.
This supersedes only the original requirement for AppHost to inject the local
`KNOWLEDGEHUB_JWT_KEY` through a secret parameter.

| Approach | Trade-off | Decision |
| --- | --- | --- |
| AppHost secret parameter | Central AppHost configuration, but requires bridging existing SystemService secrets explicitly. | Original design; no longer required for the local JWT key. |
| Python service-local `.env` | Fits the owner's current local setup; needs manual key synchronization, Git exclusion, and safe diagnostics. | Owner selected for local development. |

- Python reads `KNOWLEDGEHUB_JWT_KEY` from
  `src/services/Blocks.KnowledgeHubService/.env`, resolved from `config.py`,
  not from the process working directory. Use UTF-8.
- Keep normal environment-variable precedence over dotenv values. AppHost need
  not map this key; an explicitly supplied environment key is still validated.
- AppHost continues to own Python startup/shutdown, the dynamic SystemService
  HTTPS endpoint and Gateway destination. Issuer, audience, public CA path,
  and timeout remain explicit configuration; this amendment does not move
  all settings into `.env` or approve guessed issuer/audience fallbacks.
- Rationale: retain the owner's existing Python local configuration without
  requiring a second AppHost copy of the JWT key.
- The `.env` is private local configuration, not an encrypted secret store.
  Ignore it in Git, verify it is not tracked, and never copy its real values
  into documentation, examples, tests, chat, shell history, or logs.
- Use the exact existing SystemService key. Missing or invalid resolved settings
  fail startup safely; no default key, credential rotation, auth bypass, or TLS
  downgrade is authorized.
- Unit tests disable the real dotenv source with `_env_file=None`. Tests of
  dotenv loading supply an absolute temporary `_env_file` containing only fake
  values, clear relevant environment variables, and verify environment override
  behavior. Never read the owner's `.env` to make tests pass.
- Tests must prove invalid-key startup diagnostics contain safe field names and
  reasons without raw inputs; `SecretStr` alone is not sufficient.
- This is local-development policy only. Production secret provisioning needs
  a separately reviewed deployment design; do not ship the local `.env`.

SystemService user secrets are not inherited automatically and are not
automatically synchronized with Python's `.env`. Approval of this amendment
does not prove key compatibility or successful live permission RPCs.

TLS uses the current private SystemService HTTPS endpoint and a trusted public
certificate. Preserve hostname verification and HTTP/2; do not use
`ssl_target_name_override`, disable certificate checks, assume Windows trust
automatically configures native gRPC, or change shared Kestrel protocols.
Exporting a public certificate for local trust does not authorize exporting
its private key or modifying machine trust. Actual handshake is a live gate.

## 6. AppHost And Gateway

Add only `Aspire.Hosting.Python` version `13.6.3` to AppHost.
Register `knowledgehubservice` with project directory
`../../services/Blocks.KnowledgeHubService` and app `knowledgehub.main:app`.
Use its native `WithUv` setup with sync arguments
`sync --locked --python 3.12.14 --no-python-downloads`.
Owner bootstrap must create/review the lockfile before this normal startup.
Explicitly use the service-local `.venv`, never a preexisting AppHost environment.

Let Aspire allocate the HTTP endpoint; do not add a duplicate endpoint or
hardcode the Python port. Inject SystemService's actual HTTPS endpoint reference
and other explicit configuration into Python; the local JWT key source follows
section 5. No worker resource or .NET wrapper.

Gateway uses a distinct `knowledgehub-cluster` and route
`/api/knowledgehub/{**catch-all}`. Preserve the full prefix with no remove-prefix
transform. Keep static route identity/match in checked-in Gateway configuration;
AppHost supplies the destination address from the Python endpoint reference.
Local ignored configuration must not override the route with stale transforms.
For non-AppHost startup, a missing destination is an explicit setup failure,
not a fallback to a fixed port or an unrelated service.

Use a concrete endpoint URI supplied by AppHost, not an assumed
`http://knowledgehubservice` resolution. `WithReference` can express the resource
relationship but does not replace this destination configuration.
Preserve existing routes, CORS, FileService cluster settings and boundary.
Do not make Gateway startup depend on KnowledgeHub becoming healthy: existing
System administration/login must remain usable when KnowledgeHub is down.
Do not expose SystemService gRPC through a new public Gateway route.

Local startup uses the existing AppHost command from repo root:
`dotnet run --project src/platform/Blocks.AppHost/Blocks.AppHost.csproj`.
Document required existing service configuration, certificate setup, dashboard
resource/endpoint discovery, and stopping AppHost. Verify reload/child processes
also stop, and that a subsequent start does not hit an orphaned Python port.
No deployment, Docker build, or global shell redesign belongs to P01.

## 7. HTTP Contract And Health

| Endpoint | Access and behavior |
| --- | --- |
| `GET /alive` | Internal operational endpoint. HTTP 200 while the API is responsive; no token or dependency call. |
| `GET /health` | Internal readiness endpoint. HTTP 200 after settings/startup succeed and a bounded SystemService gRPC channel-ready check succeeds; HTTP 503 otherwise. |
| `GET /api/knowledgehub/identity` | Requires a valid user token and `knowledgehub` VIEW. Returns only authenticated `ActorId` in `Data`. |

Health checks do not expose settings, certificates, users, or dependency error
details. A channel-ready check proves transport/TLS reachability, not a database
query, a user's permission, or successful authenticated RPC execution.
No synthetic user JWT or unauthenticated permission probe is used for readiness.
An unavailable dependency does not prevent liveness from responding.
Reuse/close the async gRPC channel through application lifespan; bound readiness
by the configured deadline and release resources on shutdown.
Do not route Python health over Gateway's existing root health endpoints.

JSON application responses always contain `Success`, integer `StatusCode`,
`Data`, and `Message` with exact casing.
Success: HTTP 200, `Success=true`, `StatusCode=200`.
Ordinary auth, permission, validation, and business failures: HTTP 200,
`Success=false`, appropriate application 400/401/403/404, `Data=null`.
Framework method-not-allowed uses application 405.
Normalize request-validation errors to application 400 instead of raw 422.
Messages shown to users are Vietnamese; never expose raw exception details.

Permission RPC timeout/unavailability is application 503 in HTTP 200, matching
the current Catalog permission consumer; it is not permission denial.
Unexpected application exceptions use HTTP 500 with a safe 500 envelope.
Gateway inability to reach Python remains a genuine failed transport status
(for example 502), not a fabricated successful envelope.
Tests inspect both transport and body. The existing frontend soft-401 refresh
path remains SystemService-owned; KnowledgeHub does not refresh tokens.

No extra business endpoint exists solely to trigger validation. A test-only
route may exercise the production validation/error handlers in isolation.
Disable public OpenAPI/docs endpoints for this initial runtime rather than
accidentally leaving extra unauthenticated application surfaces.

## 8. Authentication And Permission Execution

For the identity request:

1. Read a Bearer token from `Authorization`; do not accept token query params.
2. Verify signature with an explicit HS256-only allowlist and the configured
   issuer/audience; require `exp` and validate lifetime with zero leeway.
   Reject invalid expiry types, future `nbf` when present, and missing,
   malformed, or all-zero actor GUID in `name`.
3. Derive actor only from that verified claim. Ignore username/role as grants,
   and never accept effective actor/controller/action from browser input.
4. Call `system.SystemProto/CheckPermission` using the generated async client:
   `user_id` = authenticated GUID, `controller` = `knowledgehub`, `action` = 1.
   Metadata is `x-service-authorization: Bearer <current user token>`.
5. A true result permits the identity response; false returns application 403.
   Unauthenticated RPC returns application 401, permission-denied RPC returns
   application 403, deadline/unavailability returns application 503.
   Other unexpected RPC failures return a safe 503 without exposing internals.

No retries or permission cache in P01. Use a per-call deadline, propagate
cancellation, and do not store user JWTs in files, jobs, globals, or logs.
The shared channel may persist; per-request token metadata must not persist
on it or leak across concurrent actors. No permission RPC on invalid JWTs.

The HS256 key also enables token minting. KnowledgeHub remains inside the
existing trusted service boundary, but must not issue user tokens.
Ephemeral test keys/tokens are allowed only in isolated tests.
Current SystemService does not bind RPC `user_id` to the authenticated actor;
test KnowledgeHub's derivation, not an invented server-side guarantee.
Broader SystemService RPC hardening is not authorized by this part.

## 9. Minimum Real Permission Setup

This section supersedes only the timing of the P00/P02 menu/role setup gate.
The owner approved moving the minimum VIEW setup into P01 on 2026-10-27.
No other P02 behavior moves forward.

Before mutation, the owner inspects the existing administration UI and selects
the intended existing system group, role, and non-administrator test account.
Do not assume any particular live record exists or that an administrator is
a suitable denied actor. Reuse a matching menu record rather than duplicating it.

Minimum intended state:

- Active menu/controller key `knowledgehub`, `CanView=true`.
- Propose `IsShowMenu=false` until P02 installs the actual route.
- Target test role has `IsViewed=true` for that menu only.
- Existing unrelated fields/permissions are preserved. Do not revoke existing
  grants or alter other roles to manufacture a negative case.
- A second existing suitable account without VIEW proves real denial; if none
  exists, account/role creation or deliberate temporary revocation needs
  separately agreed scope. Mocked denial alone does not prove live denial.

Use current authorized menu/role UI operations, not SQL seeds or Python writes
to System tables. Snapshot relevant non-secret existing settings before changing
them; the role form submits a full permission list, so check unrelated values
remain unchanged. Reauthenticate/refresh through the existing session flow.
Do not create a new system group, account, or broad role implicitly.

Verify the live permission check succeeds even while the menu is hidden, and
navigation has no dead KnowledgeHub link. Stored functions were not inspected:
if `IsShowMenu=false` hides the record from permission assignment/checking or
does not hide navigation, report a blocker and resolve it with the owner.
Do not show a broken link, add a fake page, hardcode a grant, or rewrite
navigation as a workaround.

## 10. Verification And Acceptance

Use standard-library `unittest`, including async tests, plus HTTPX/FastAPI test
support. Test doubles replace external boundaries only in the test composition;
production dependencies have no environment-controlled fake mode.

| ID | Required evidence |
| --- | --- |
| P01-01 | Locked sync selects Python 3.12.14; package imports from src layout; generated stubs import without development tools. No global changes or untracked secrets in diff. |
| P01-02 | Service-local dotenv loading and environment precedence use fake fixtures; real `.env` is ignored/untracked. Missing/weak key, empty issuer/audience, invalid URL/CA path/deadline fail safely without value leaks. |
| P01-03 | Missing/malformed bearer, bad signature, disallowed algorithm/`none`, wrong issuer/audience, absent/expired/invalid expiry, future `nbf`, invalid/empty actor return application 401; permission RPC not called. |
| P01-04 | Valid JWT and RPC allow return the actual actor; RPC deny returns 403; exact resource/action/metadata verified. Forged actor input cannot replace verified actor. Concurrent requests do not exchange tokens. |
| P01-05 | RPC unauthenticated/denied/timeout/unavailable map as specified, no allow fallback/retry. Cancellation and channel shutdown complete without leaks. |
| P01-06 | Exact envelope casing/types/nulls for success and errors, including validation, 404, 405, unexpected error; no raw Python/Pydantic messages. |
| P01-07 | Liveness survives dependency failure; readiness reports transport outage with real HTTP 503 and recovers when isolated dependency returns. |
| P01-08 | Real Gateway forwards to the real Python app using an isolated gRPC permission fixture and test tokens. Full prefix and bearer survive; allow/401/403 are observed; stopping Python yields a true transport failure. |
| P01-09 | Owner-run AppHost starts Python and existing platform resources using real config. Real SystemService-issued token yields allow and suitable denied actor yields 403 through Gateway; expired token yields application 401. Private TLS/RPC actually works. |
| P01-10 | Owner-run stop/restart leaves no Python/reload child behind; safe logs and no broken menu link; relevant .NET and Gateway/FileService regressions pass. |

Keep isolated checks DB-free. For P01-08, a small Python test harness may launch
a prebuilt production Gateway DLL with explicit test configuration and ephemeral
localhost listeners; do not add a new .NET test framework or use the live
System database. Run Gateway in Production environment without ignored local
development settings, set a distinct test `FileProxy:ClusterId`, and use the
checked-in KnowledgeHub route with a fixture destination. Bound process startup,
capture only safe test diagnostics, and stop every owned process in cleanup.
If using an existing harness instead, keep changes scoped to KnowledgeHub checks
and do not replace the real Gateway with a mocked proxy.

Proposed DB-free command, after owner setup:
`uv run --locked --project src/services/Blocks.KnowledgeHubService python -m unittest discover -s src/services/Blocks.KnowledgeHubService/tests -v`.
The plan supplies the exact opt-in real-Gateway artifact argument/environment
and build command. Missing artifact/runtime must be reported NOT RUN, not
silently counted as passed. Normal unit checks need no real credentials.

Build affected AppHost and Gateway projects, and run the existing inspected
`Backend.Upgrade.Check.ps1 -Check all` and relevant FileService Gateway/boundary
checks. AppHost regression assertions may need a narrowly scoped update for
the added Python resource/package; preserve existing package/version gates.
No frontend product change is required; do not claim browser refresh is tested
merely from an API envelope test. Actual client refresh evidence belongs in
the P02 integration checks unless explicitly exercised through the existing client.

Live setup/checks use owner-authorized development services only. No automated
DB mutations, dedicated test schema/database, fault injection into live services,
or real AI calls. Missing SystemService DB/config, accounts, certificates, SDK,
or endpoints are explicit blockers with NOT RUN evidence.
P01 is not ACCEPTED while required live P01-09/P01-10 evidence is missing.

## 11. Manual Learning Plan And P02 Handoff

After owner approval, use writing-plans to produce small tasks covering:
Python packages/types/environments; validated settings; FastAPI lifespan,
dependencies and handlers; JWT authentication versus action authorization;
async gRPC deadlines; proxy boundaries; and automated versus live evidence.
Each task states files/callers to inspect, expected behavior, checks, and traps.
No complete production solution or agent execution.

The owner should explain one request from Gateway through JWT verification
and CheckPermission to response, including why a valid token can still get 403.
Record that explanation during implementation review, not in advance.

P02 inherits the package, actor/permission dependencies, response contract,
running AppHost resource, Gateway route, and reviewed menu/role record identity.
It adds persistence/ownership, ADD/UPDATE/DELETE mappings, React feature and
navigation, enabling the real menu only after the route exists. Private
collections retain no administrator ownership bypass.
Create `docs/knowledgehub/outcomes/P01.md` only during implementation review,
with exact diff, checks, findings, deviations, and prerequisite acceptance.

## 12. Evidence Sources And Pending Gates

Publisher sources inspected without installing dependencies:

- Aspire versioned source:
  `https://raw.githubusercontent.com/dotnet/aspire/v13.6.3/src/Aspire.Hosting.Python/PythonAppResourceBuilderExtensions.cs`.
- NuGet versioned package metadata/package:
  `https://api.nuget.org/v3-flatcontainer/aspire.hosting.python/13.6.3/aspire.hosting.python.13.6.3.nupkg`.
- PyPI publisher metadata: `https://pypi.org/pypi/<package>/json` for table
  packages, versions recorded in section 4.
- Installed `uv sync --help` confirms `--locked`, `--python`, and
  `--no-python-downloads`; `uv python list --only-installed` confirms interpreters.

The 2026-11-01 review found passing baseline tests/builds but unresolved behavior
and acceptance gaps. See `docs/knowledgehub/outcomes/P01.md` for dated evidence.
Actual endpoints/TLS, existing secret compatibility, live menu/function behavior,
authorized/denied test actors, and clean shutdown still need acceptance evidence.
These remain gates, not claims of current functionality.
Builder review completed with no remaining important findings; owner approved
this spec on 2026-10-27. Implementation and live acceptance remain pending.
