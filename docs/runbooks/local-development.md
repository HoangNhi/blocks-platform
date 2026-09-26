---
status: approved
owner: repository
last_reviewed: 2026-07-26
scope: local-development
---

# Local Development

## Repository

```powershell
git fetch --prune
git status --short --branch
```

Run `git pull --ff-only` only when the working tree is clean.

## .NET

```powershell
dotnet restore Blocks.slnx
dotnet build Blocks.slnx -c Release --no-restore
dotnet test Blocks.slnx -c Release --no-build
```

## Frontend

```powershell
Set-Location apps/web/Blocks.Web
npm ci
npm run lint
npm test
npm run build
```

## Context

Generate optional historical context with `agents/tools/get-context.ps1`. Product build/test/CI remains independent of Knowledge. Agent-led development requires the exact approved Knowledge task; missing access is `BLOCKED`, without repository task fallback.

## Configuration ownership

- .NET projects use native host configuration precedence. Safe defaults belong in `appsettings.json`; ignored `appsettings.Development.json` owns local Development values; committed `appsettings.Production.json` may contain non-secret production settings. Environment and supported command-line overrides retain native precedence.
- Do not manually append local JSON after host construction. The AI Video Importer's domain arguments are not configuration overrides.
- Child services own database, JWT, CORS, LLM and plugin settings. AppHost owns orchestration settings and may inject service endpoints or smoke overrides; it must not parse child-service dotenv files.
- Assistant Service and TradeLab use ignored .env.local files with process environment taking precedence. Vite uses its native .env.local/build-time configuration.
- Local plaintext settings are intentionally private. Keep Development JSON and local dotenv files out of Git, published artifacts and every Docker build context. Git ignore rules alone do not protect publish/container outputs.
- Production secrets stay outside committed configuration; use configured secret stores or environment. Never include local credential values in examples or evidence.

## Runtime smoke

Run `bash platform/apphost/validate-browser-smoke.sh` in an environment containing setsid, uv, dotnet and node, with locally configured BLOCKS_SMOKE_POSTGRES_* values. Use BLOCKS_SMOKE_ENVIRONMENT=Production for a production-mode smoke check. An unavailable runtime is not a PASS result; capture task evidence only in the exact Knowledge task.
