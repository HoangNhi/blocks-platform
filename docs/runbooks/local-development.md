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

Generate optional historical context with `agents/tools/get-context.ps1`. Normal implementation must remain possible when the external vault is unavailable.
