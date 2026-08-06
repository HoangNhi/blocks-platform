---
status: approved
owner: Adonis
last_reviewed: 2026-08-05
scope: standard-development-configuration
supersedes:
  - docs/tasks/2026-08-02-local-service-configuration/spec.md
---

# Standard Development Configuration Specification

## Problem

The previous local configuration design added `appsettings.Local.json` after the default ASP.NET configuration providers. This reverses expected precedence because the custom JSON file can override environment variables and command-line values.

The previous design also lets local JSON files enter .NET build output and potentially enter Docker build context. Git ignore rules alone do not protect publish artifacts or container builds.

## Goal

Use framework-native development configuration without requiring code changes between local development, CI, and production.

Local .NET values live in ignored `appsettings.Development.json` files. CI and production use environment variables with the standard provider precedence.

## Accepted Trade-off

> [!warning] Plain-text local values
> `appsettings.Development.json` stores local values as plain text. This is accepted for this workspace. These files must remain ignored, excluded from publish output, and excluded from Docker build context.

User Secrets are not part of the active configuration contract. Existing User Secret values remain untouched but unused.

## Configuration Contract

### .NET Services

Each .NET project uses native host configuration only:

1. `appsettings.json` contains safe shared defaults.
2. `appsettings.Development.json` contains local Development values and remains ignored.
3. `appsettings.Production.json`, when present, contains committed non-secret production settings.
4. Environment variables provide CI/CD and deployed values.
5. Command-line configuration values remain highest-priority runtime overrides for WebApplication and AppHost projects.

No project manually loads `appsettings.Local.json` or manually re-adds `appsettings.Development.json` after host creation.

Projects:

- `platform/apphost/Blocks.AppHost/`
- `services/system-service/Blocks.SystemService/`
- `services/file-service/Blocks.FileService/`
- `services/api-gateway/Blocks.ApiGateway/`
- `plugins/ai-video-production/service/Blocks.AiVideoService/`
- `plugins/ai-video-production/service/Blocks.AiVideoImporter/`

`WebApplication.CreateBuilder(args)` and `DistributedApplication.CreateBuilder(args)` remain responsible for standard configuration loading.

AI Video Importer adds the official `Microsoft.Extensions.Hosting` package matching the workspace .NET version and changes from its hand-built `ConfigurationBuilder` to `Host.CreateApplicationBuilder()`. The project currently has only `Microsoft.Extensions.Hosting.Abstractions`, which does not provide the native host builder. Importer arguments remain domain arguments (`--source-key` and `--apply`) and are not passed into configuration parsing.

### Python Services

Assistant Service and TradeLab keep ignored `.env.local` files through Pydantic Settings.

Process environment variables must override `.env.local`. AppHost must not parse child-service dotenv files or replace externally supplied values with local file values.

AppHost may inject only:

- smoke-test overrides
- Aspire-generated service endpoints
- settings owned by orchestration rather than the child service

### Web App

Vite keeps its native ignored `.env.local` behavior. Aspire may inject `VITE_API_BASE_URL` for orchestrated runs. CI/CD supplies build-time production values through environment variables.

## File Ownership

### AppHost

`platform/apphost/Blocks.AppHost/appsettings.Development.json` contains AppHost-owned local settings only.

Child-service database, JWT, LLM, trading, and plugin settings do not belong in AppHost configuration.

### System Service

`services/system-service/Blocks.SystemService/appsettings.Development.json` owns:

- `ConnectionStrings:System`
- `Jwt`
- `Cors`
- optional direct-run `GrpcClients:FileService`

### File Service

`services/file-service/Blocks.FileService/appsettings.Development.json` owns:

- `Jwt`
- `Cors`

### API Gateway

`services/api-gateway/Blocks.ApiGateway/appsettings.Development.json` owns local gateway settings such as `Cors`.

Aspire-generated destinations remain environment-injected during orchestrated runs.

### AI Video Service

`plugins/ai-video-production/service/Blocks.AiVideoService/appsettings.Development.json` owns:

- `ConnectionStrings:AiVideo`
- `Jwt`
- `AiVideoAccess`
- `ImportSources`

### AI Video Importer

`plugins/ai-video-production/service/Blocks.AiVideoImporter/appsettings.Development.json` owns:

- `ConnectionStrings:AiVideo`
- `ImportSources`

### Python and Web

- `services/assistant-service/.env.local`
- `plugins/tradelab/service/.env.local`
- `apps/web/Blocks.Web/.env.local`

## Tracking Rules

- Ignore `**/appsettings.Development.json`.
- Remove currently tracked API Gateway and AI Video Development files from Git tracking.
- Move their safe logging and CORS defaults into `appsettings.json` when those defaults should remain shared.
- Remove existing ignore rules for `appsettings.Production.json`; non-secret production files must remain trackable.
- Remove `**/appsettings.Local.json` usage and files.
- Keep `.env.local` files ignored.

No local value appears in committed documentation, tests, logs, examples, or generated evidence.

## Publish and Container Safety

Add a root MSBuild rule that marks `appsettings.Development.json` with `CopyToPublishDirectory=Never` for every .NET project.

Add Docker ignore protection for:

- `**/appsettings.Development.json`
- `**/appsettings.Local.json`
- `**/.env.local`
- `**/.env.*.local`

Docker ignore coverage must match each actual build context. Repo-root Docker builds use a root `.dockerignore`; the Web app receives a local `.dockerignore` if its Docker build context is `apps/web/Blocks.Web`.

## CI/CD Contract

CI uses clean source checkout, so ignored Development files are absent.

Deployment sets the runtime environment to `Production` and supplies deploy-specific values through environment variables or the deployment platform's secret injection.

Examples:

- `ConnectionStrings__System`
- `Jwt__Key`
- `DATABASE_URL`
- `ASSISTANT_LLM_PROVIDER`
- `VITE_API_BASE_URL` at frontend build time

No CI/CD stage rewrites application source code or changes configuration-loading code.

## Migration

1. Copy current local .NET values from `appsettings.Local.json` into matching `appsettings.Development.json` files without printing values.
2. Verify all Development files are ignored before retaining real values.
3. Remove custom `appsettings.Local.json` loaders.
4. Add `Microsoft.Extensions.Hosting` to AI Video Importer and replace its manual configuration builder with native host configuration.
5. Remove AppHost child-service dotenv parsing and normal local-value injection.
6. Preserve smoke-mode overrides.
7. Remove obsolete `appsettings.Local.json` files.
8. Remove obsolete Production-file ignore rules.
9. Add publish and Docker exclusions.
10. Leave existing User Secrets unchanged but unused.

## Verification

- Source contract confirms no `appsettings.Local.json` loader remains.
- Source contract confirms AI Video Importer uses native host configuration.
- Source contract confirms Production appsettings files are not ignored.
- Runtime test proves environment variables override Development-file values.
- Development-file values load when environment variables are absent.
- Python tests prove environment variables override `.env.local`.
- `dotnet publish` output contains no `appsettings.Development.json`.
- Docker build context contains no Development or local dotenv files.
- AppHost starts all active resources successfully in Development.
- Production-mode smoke run starts without any Development file.
- Tracked diff and retained output contain no real local values.

## Acceptance Criteria

- Local .NET configuration uses only native `appsettings.Development.json` behavior.
- CI/CD and production configuration use environment variables without code rewrites.
- Environment variables override local files.
- No local configuration file enters publish output or Docker context.
- AppHost does not own or parse child-service local configuration.
- Python and Vite retain native `.env.local` behavior.
- Existing smoke-mode behavior remains intact.

## Out of Scope

- Production secret-manager implementation.
- Credential rotation.
- Deployment pipeline implementation.
- Database schema changes.
- API or UI behavior changes.
