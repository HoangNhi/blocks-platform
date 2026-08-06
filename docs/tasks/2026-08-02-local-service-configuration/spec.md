---
status: approved
owner: Adonis
last_reviewed: 2026-08-02
scope: local-service-configuration
---

# Local Service Configuration Specification

## Goal

Replace fragmented local User Secrets and host environment configuration with service-owned, ignored local configuration files that are easy to inspect and maintain.

Real local values remain uncommitted. Tracked configuration files remain secret-free.

## Configuration Contract

### .NET Projects

Each active .NET project loads an optional `appsettings.Local.json` after standard `appsettings.json` and `appsettings.{Environment}.json` sources. Local values therefore override tracked development defaults.

Files:

- `platform/apphost/Blocks.AppHost/appsettings.Local.json`
- `services/system-service/Blocks.SystemService/appsettings.Local.json`
- `services/file-service/Blocks.FileService/appsettings.Local.json`
- `services/api-gateway/Blocks.ApiGateway/appsettings.Local.json`
- `plugins/ai-video-production/service/Blocks.AiVideoService/appsettings.Local.json`
- `plugins/ai-video-production/service/Blocks.AiVideoImporter/appsettings.Local.json`

All `appsettings.Local.json` files are ignored by Git.

### Python Services

Python services use their native Pydantic settings contract and load ignored `.env.local` files.

Files:

- `plugins/tradelab/service/.env.local`
- `services/assistant-service/.env.local`

AppHost reads these same files before launching Python services, preventing a second AppHost-only copy of service configuration.

### Web App

The web app keeps Aspire-injected `VITE_API_BASE_URL` during AppHost runs. Direct Vite runs may use ignored `apps/web/Blocks.Web/.env.local`.

## Required Keys

### AppHost

`platform/apphost/Blocks.AppHost/appsettings.Local.json` may contain AppHost-only local settings:

- `AppHost:OtlpApiKey`
- `AppHost:McpApiKey`

Service database and JWT values do not belong in AppHost configuration.

### System Service

`services/system-service/Blocks.SystemService/appsettings.Local.json` contains:

- `ConnectionStrings:System`
- `Jwt:Key`
- `Jwt:Issuer`
- `Jwt:Audience`
- `Jwt:Expiry`
- `Jwt:ExpireRefreshToken`
- `Cors:Origins`
- optional `GrpcClients:FileService` for direct service runs

### File Service

`services/file-service/Blocks.FileService/appsettings.Local.json` contains:

- `Jwt:Key`
- `Jwt:Issuer`
- `Jwt:Audience`
- `Jwt:Expiry`
- `Jwt:ExpireRefreshToken`
- `Cors:Origins`

System Service and File Service use matching JWT signing, issuer, and audience values.

### API Gateway

`services/api-gateway/Blocks.ApiGateway/appsettings.Local.json` contains:

- `Cors:Origins`

Reverse-proxy service destinations remain AppHost-injected during Aspire runs and remain in tracked configuration for direct-run defaults.

### AI Video Service

`plugins/ai-video-production/service/Blocks.AiVideoService/appsettings.Local.json` contains:

- `ConnectionStrings:AiVideo`
- `Jwt:Key`
- `Jwt:Issuer`
- `Jwt:Audience`
- `AiVideoAccess:ViewRoleIds`
- `ImportSources:Legacy`

AI Video JWT values match System Service values unless intentionally configured otherwise.

### AI Video Importer

`plugins/ai-video-production/service/Blocks.AiVideoImporter/appsettings.Local.json` contains:

- `ConnectionStrings:AiVideo`
- `ImportSources:Legacy`

The importer and AI Video Service use the same database connection and import-source configuration.

### TradeLab

`plugins/tradelab/service/.env.local` contains:

- `DATABASE_URL`
- `TRADELAB_ENVIRONMENT`
- `TRADELAB_TESTNET_CREDENTIAL_VAULT_PROVIDER`
- `TRADELAB_LOCAL_DEV_TESTNET_CREDENTIAL_KEY`
- `TRADELAB_TESTNET_CREDENTIAL_VALIDATION_ENABLED`
- `TRADELAB_BINANCE_TESTNET_BASE_URL`
- testnet order connector, network, timeout, receive-window, and kill-switch settings
- `TRADELAB_LIVE_CREDENTIAL_VAULT_PROVIDER`
- `TRADELAB_LOCAL_DEV_LIVE_CREDENTIAL_KEY`
- `TRADELAB_LIVE_CREDENTIAL_VALIDATION_ENABLED`
- `TRADELAB_BINANCE_LIVE_BASE_URL`
- live order connector, network, timeout, receive-window, and kill-switch settings
- local fill, paper engine, and scheduler settings already supported by TradeLab

AppHost reads `DATABASE_URL` and existing TradeLab settings from this file. The current AppHost parameters `tradelab-smoke-database-url` and stale `tradelab-database-url` are no longer required for normal local runs.

### Assistant Service

`services/assistant-service/.env.local` contains:

- `ASSISTANT_LLM_PROVIDER`
- `ASSISTANT_LLM_MODEL`
- `ASSISTANT_LLM_BASE_URL`
- `ASSISTANT_LLM_CONTEXT_TOKENS`
- `ASSISTANT_LLM_TIMEOUT_SECONDS`

AppHost reads and injects these values instead of hardcoding normal local settings.

### Web App

`apps/web/Blocks.Web/.env.local` may contain:

- `VITE_API_BASE_URL`

AppHost injection keeps higher priority during Aspire runs.

## Migration

1. Read existing User Secret values without printing them.
2. Write available values into matching ignored local files.
3. Reuse the System Service JWT values for File Service and AI Video only where their existing values are absent.
4. Preserve all existing User Secrets as rollback backup.
5. Preserve tracked `appsettings.Development.json` files as non-secret defaults and examples.
6. Do not invent missing credentials. Leave missing values empty or retain safe runtime defaults.

## Security Rules

> [!danger] Secret boundary
> Real database URLs, JWT keys, API keys, exchange credentials, and private role IDs must never enter tracked files, task documentation, test output, or retained evidence.

- Ignore `appsettings.Local.json` and `.env.local` files repository-wide.
- Never print migrated values during scripts or verification.
- Verify ignore status before writing any real value.
- Do not remove User Secrets during this task.
- Do not change production configuration.
- Do not commit generated local files.

## Verification

- Assert every real local configuration file is ignored by Git.
- Parse every generated JSON file successfully.
- Load Python settings from each `.env.local` without printing values.
- Start AppHost and verify each configured service reaches its health endpoint.
- Confirm System, File, TradeLab, Assistant, AI Video, API Gateway, and Web resources start without missing-configuration errors.
- Scan tracked changes and retained command output for secret-like values before closeout.

## Acceptance Criteria

- Each active service has one clear service-owned local configuration file.
- Full Aspire startup and direct service startup use the same service-owned values.
- Existing real local values are migrated without disclosure.
- AppHost no longer owns normal local database or LLM configuration belonging to child services.
- Tracked configuration remains secret-free.
- User Secrets remain available as rollback backup.
- Local files are documented by key name without documenting secret values.

## Out of Scope

- Production secret management.
- Cloud secret stores.
- Credential rotation.
- Database schema changes.
- API contract changes.
- UI behavior changes.
