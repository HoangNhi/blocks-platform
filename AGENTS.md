# Agent Guide

## Scope And Starting Point

- Read the relevant source before editing. Treat current `.csproj`, `package.json`,
  configuration code, and callers as authoritative; docs may describe older states.
- Check `git status --short` first. Preserve existing changes and untracked files.
- Keep changes within the requested feature or service. Do not clean up unrelated
  code, restore removed services, upgrade dependencies, or rewrite configuration.
- Check relevant decisions in `docs/superpowers/` when working on an area they cover.
  Historical task limits are not permanent repo-wide restrictions.

## Subagent Delegation

- Proactively delegate substantial, self-contained work: code exploration, focused
  review, test execution, and log analysis. Keep trivial changes and tightly
  coupled steps in the main agent.
- Optimize for a small main-agent context and low overall cost, not maximum
  parallelism. Start with one subagent; normally use at most two concurrently
  unless more clearly benefits the task. Delegation does not guarantee fewer
  total tokens.
- Give each worker a narrow objective, relevant paths, constraints, and expected
  output. Prefer fresh context with a concise brief over inheriting the full
  conversation when supported. Restate essential safety and scope constraints.
- Request concise findings, file/line references, checks run, and unresolved risks.
  Keep raw logs and full file dumps out of the main agent's context.
- Do not duplicate delegated work. Inspect relevant evidence and changed code
  rather than repeating the entire investigation. Reuse workers for follow-up
  when supported.
- Keep parallel edits in non-overlapping files. The main agent owns integration,
  final verification, and the user-facing response. Avoid nested delegation.
- Prefer native subagent tools when available and compatible with the configured
  model. Discover available tools and supported models; do not assume every
  configured model alias works with native spawning.
- When model selection is permitted, prefer a configured lower-cost supported
  model adequate for the task. Do not silently switch models or providers to
  work around failures, or change machine configuration.
- If native delegation fails, report the exact blocker and do not repeat the
  same failing request. A documented non-interactive CLI worker may be used as
  a fallback when permitted by the runtime. Treat it as a separate process,
  not a native subagent, and disclose the fallback.
- Give CLI workers the same narrow brief and request a concise final report.
  Preserve permission, sandbox, and data-access constraints; never bypass them
  to enable delegation. Do not allow recursive delegation from CLI workers.
- If neither mechanism is usable, continue directly and disclose the limitation.

## Repository Map

| Path | Responsibility |
| --- | --- |
| `Blocks.slnx` | Backend solution; does not include the frontend project. |
| `src/apps/Blocks.Web/` | React 19, TypeScript, Vite, Tailwind CSS, Radix UI, TanStack Query. |
| `src/services/Blocks.ApiGateway/` | YARP reverse proxy; targets `net10.0`. |
| `src/services/Blocks.SystemService/` | Authentication, users, roles, menus, permissions, audit; EF Core with PostgreSQL; targets `net10.0`. |
| `src/services/Blocks.CatalogService/` | Departments (Faculty); EF Core with MySQL; targets `net8.0`. |
| `src/services/Blocks.FileService/` | Uploads, avatars, original-file previews; no watermarking or Office conversion; targets `net8.0`. |
| `src/platform/Blocks.AppHost/` | Aspire orchestration; currently references missing services. |
| `src/platform/Blocks.ServiceDefaults/` | Shared hosting, discovery, resilience, telemetry defaults. |
| `src/platform/Blocks.Shared/` | Shared DTOs, validation, exceptions, gRPC helpers. |
| `test/` | Backend regression checks; inspect each check before running. |

## Current Checkout Limits

- `Blocks.BusinessService` and `Blocks.CollabService` are absent, but
  `Blocks.AppHost.csproj` and `AppHost.cs` still reference them. Full-solution build
  and AppHost startup are not reliable acceptance checks for unrelated changes.
  Do not fix these references unless requested.
- Frontend `src/features/business/` still exists. Its presence does not mean the
  matching backend is available; do not delete those screens or invent a backend.
- SystemService's direct BusinessService dependency was deliberately removed.
  Do not reintroduce it to work around other stale references.
- The frontend README is the Vite starter README, not a project setup guide.

## Backend Changes

- Follow the nearest feature: `Controllers/`, `Services/CoreFeature/`,
  `DTOs/CoreFeature/`, `Entities/`, and `Infrastructure/`. Reuse local validation,
  AutoMapper profiles, and dependency registration patterns.
- Preserve the response envelope: `Success`, `StatusCode`, `Data`, `Message`.
  HTTP 200 can carry an application error; inspect both transport and body.
  Use the existing `BusinessException` and middleware flow for business failures.
- Preserve authentication, permission checks, audit hooks, and soft-delete
  conventions. Do not bypass them to make a request or test pass.
- Before changing HTTP routes, DTO fields, or protobuf contracts, find callers in
  other services and the frontend. No caller found in this repo does not prove
  no external consumer exists.
- Protobuf contracts live in each service's `Protos/` and are linked by consumer
  `.csproj` files. Edit source contracts, not generated files under `obj/`.
  Preserve existing protobuf field numbers.
- Changes under `Blocks.Shared` or `Blocks.ServiceDefaults` require checks of
  affected consumers, not only a build of the shared project.

## Database MCP And Database-First Workflow

- Prefer the local DBHub MCP server `blocks_dbhub` for database inspection and
  explicitly requested SQL changes. Sources are `blocks_system_dev` for
  SystemService PostgreSQL and `blocks_catalog_dev` for CatalogService MySQL.
  Verify the selected source and database before executing SQL.
- Local setup uses `.codex/config.toml` for the STDIO server and its working
  directory, `.codex/dbhub.toml` for sources/tools, and `.codex/.env` for
  `BLOCKS_SYSTEM_POSTGRES_DSN` and `BLOCKS_CATALOG_MYSQL_DSN`. This MCP setup does
  not require .NET user secrets. These local files are ignored by Git; never
  copy their secret values into tracked files, command output, or chat.
- Start with `search_objects` and narrowly scoped `SELECT` queries. Limit rows
  and avoid sensitive columns. Connection checks are read-only and do not
  establish that DDL/DML permissions work.
- Both sources are configured with `readonly = false`; this enables writes but
  does not authorize unrequested changes. Apply DDL/DML only within explicitly
  requested scope. Confirm destructive changes separately and verify backups
  before changes that could lose data. Do not assume MySQL DDL can be rolled back.
- Database-first means reviewing and recording SQL changes in Git, applying
  authorized changes to the intended development database, then scaffolding the
  affected service. DBHub does not scaffold C# code; use the existing EF tooling
  with the project's actual provider and EF version.
- Inspect existing entities, context, and scaffold options first. Use
  `--no-onconfiguring` to avoid generating connection strings. Review the files
  that `--force` would overwrite, preserve custom/partial code, and never purge
  an entity directory. Review the generated diff and build/test the affected
  service afterward.
- If DBHub tools are unavailable, report that limitation. A local STDIO client
  or database driver may use the same local configuration for the authorized
  check; do not change credentials or permissions to bypass a connection error.

## Frontend Changes

- Keep domain code in `src/features/<domain>/{api,hooks,routes,types}`.
  Reuse `src/components/ui/`, layout components, and nearby feature patterns.
- Use the existing API client in `src/lib/api.ts` and endpoint constants in
  `src/config/constants.ts`; preserve token handling and the response envelope.
- Follow TanStack Query query keys and mutation invalidation patterns.
  Reuse existing forms, Zod validation, and Lucide icons where applicable.
- The `@/` alias resolves to frontend `src/`. Match nearby code style and preserve
  Vietnamese UI text and accessibility.
- Keep Vitest tests close to the affected code. Shared test setup lives in
  `src/test/setup.ts`; inspect `vitest.config.ts` for test configuration.

## Commands And Verification

Run these PowerShell commands from the repository root.

Build the affected backend project directly, for example:

```powershell
dotnet build src/services/Blocks.SystemService/Blocks.SystemService.csproj
```

Use the actual target project's `.csproj`; ApiGateway requires an SDK supporting
`net10.0`. Runtime checks also need the relevant database, JWT configuration, and
service endpoints. A successful build does not prove those integrations work.

Frontend setup and checks:

```powershell
npm --prefix src/apps/Blocks.Web ci
npm --prefix src/apps/Blocks.Web run build
npm --prefix src/apps/Blocks.Web run lint
npm --prefix src/apps/Blocks.Web test
```

Run `ci` when dependencies need installation; keep `package-lock.json` intact.
For a focused test, append its frontend-relative path after `test --`.
Frontend dev server: `npm --prefix src/apps/Blocks.Web run dev`.
Vite uses `VITE_DEV_PORT`, defaulting to port 3000; AppHost overrides it to 5173.
The API client uses `VITE_API_URL` with a local fallback; verify configuration
before attempting end-to-end checks.

Existing SystemService source-level regression check:

```powershell
& ./test/SystemService.BusinessDependency.Check.ps1
```

This checks source references and file existence, not authentication behavior.

FileService DB-free checks (production DI and direct service/gRPC methods, not HTTP authorization):

```powershell
dotnet run --project test/FileService.RemovalChecks
```

Existing CatalogService source-level regression check:

```powershell
& ./test/CatalogService.Removal.Check.ps1
```

The CatalogService cleanup harness targets `net8.0`. Its DB-free checks are:

```powershell
dotnet run --project test/CatalogService.CleanupChecks -- contract
dotnet run --project test/CatalogService.CleanupChecks -- runtime
```

The `contract` mode checks the single Faculty entity mapping, snake_case columns, and validation/mapping without opening a database connection. The `runtime` mode checks startup, unauthorized 401 application envelope, 404 for retired routes with valid JWT, and Swagger.

The SystemService cleanup harness targets `net10.0`. Its DB-free checks are:

```powershell
dotnet run --project test/SystemService.CleanupChecks -- contract
dotnet run --project test/SystemService.CleanupChecks -- runtime
dotnet run --project test/SystemService.CleanupChecks -- telemetry
```

The `runtime` mode checks EF/Npgsql SQL generation, startup, the unauthorized
HTTP response envelope, and Swagger without opening a database connection.
The `telemetry` mode checks OpenTelemetry trace export and flush against an isolated
collector receiver; it requires `SYSTEMSERVICE_CLEANUP_TEST_OTLP_ENDPOINT` pointing
to an absolute http localhost URI with an explicit port and no credentials.
The `auth` mode also checks audit persistence through production DI. It requires
`SYSTEMSERVICE_CLEANUP_TEST_CONNECTION` pointing to an isolated localhost database
named `blocks_systemservice_cleanup_test`; it creates and drops a unique test
schema. Never point it at a real application database.

Add or update focused regression tests for behavior changes. Record baseline
failures separately, and report exactly which checks ran, passed, failed, or
could not run. Do not claim full-system success from isolated checks.

## Data And Secrets

- Never expose or commit credentials, connection strings, JWT keys, or tokens.
  Use existing local configuration or .NET user secrets; do not copy secrets
  from configuration files into documentation, logs, or test fixtures.
- Do not run migrations, seed data, destructive SQL, or tests against a real
  database without explicit authorization. Use isolated test data.
- Leave generated output (`bin/`, `obj/`, `node_modules/`, `dist/`) out of changes.
  Review the final diff and keep this guide aligned when documented paths,
  commands, or architectural boundaries change.
