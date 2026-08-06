# Standard Development Configuration Execution

**Status:** BLOCKED

## Summary

Standard local configuration migration is implemented. Development files are ignored, child services own their configuration, environment variables retain native precedence, publish output excludes Development JSON, and Docker contexts exclude local configuration.

Completion remains blocked because Production browser smoke could not finish in this Windows environment. Native Git Bash has no `setsid`; WSL can launch AppHost through run-only shims, but the Web resource did not become ready within 480 seconds.

## Files Changed

- Repository guards: `.gitignore`, `.dockerignore`, `apps/web/Blocks.Web/.dockerignore`, `Directory.Build.props`.
- Native .NET configuration: AppHost, System Service, File Service, API Gateway, AI Video Service, AI Video Importer.
- Python local configuration: Assistant Service and TradeLab `.env.local` precedence.
- Verification: configuration contract tests, Python precedence tests, smoke environment selection.
- Test isolation: AI Video missing-configuration coverage no longer loads ignored developer-local Development values.
- Ignored local files: six `appsettings.Development.json` files migrated from six removed `appsettings.Local.json` files without printing values.

## Context Used

- `docs/tasks/2026-08-05-standard-development-configuration/spec.md`
- `docs/tasks/2026-08-05-standard-development-configuration/plan.md`
- `agents/adapters/codex.md`
- `agents/protocol/core.md`
- `agents/protocol/verification.md`

## Testing

- PASS: configuration contract pytest.
- PASS: Assistant Ruff and 6 focused tests.
- PASS: TradeLab Ruff and 2 configuration tests.
- PASS: `dotnet restore Blocks.slnx`.
- PASS: `dotnet build Blocks.slnx --no-restore` with 49 existing warnings and zero errors.
- PASS: `dotnet test Blocks.slnx --no-restore`; 62 tests passed.
- PASS: six fresh Release publishes; zero `appsettings.Development.json` files in outputs.
- PASS: root and Web Docker context probes.
- PASS: Development AppHost runtime; seven named app resources reported `Running` through browser-use.
- PASS: Fresh Development AppHost rerun on August 6, 2026; seven required resources reported `Running` and `Healthy`, TradeLab `/health` returned HTTP 200, and Web returned HTTP 200.
- PASS: `git diff --check`.
- BASELINE FAILURE: `dotnet format Blocks.slnx --verify-no-changes` reports 10 unrelated pre-existing whitespace files.
- BLOCKED: Production AppHost browser smoke. AppHost starts in Production, but Web endpoint `http://127.0.0.1:15173/` does not become ready within 480 seconds under WSL/Windows executable shims.

## Notes

- Real publish testing proved early `Content Update` metadata was overwritten by Web SDK defaults. `Directory.Build.props` now removes `appsettings.Development.json` from `ResolvedFileToPublish` after `ComputeFilesToPublish`.
- Two formerly tracked Development files are staged as deletions so their recreated local values remain ignored and cannot be committed accidentally.
- No commit created.
- Runtime process tree stopped; smoke ports have no listeners.

## Rerun

Run on Linux or another Bash environment containing `setsid`, `uv`, `dotnet`, and `node`, with valid `BLOCKS_SMOKE_POSTGRES_*` variables:

```bash
BLOCKS_SMOKE_ENVIRONMENT=Production bash platform/apphost/validate-browser-smoke.sh
```

## Obsidian Follow-up

No Obsidian update requested. Repository task docs remain canonical.

## Missing Context

None for implementation. A native Linux-compatible Production smoke runtime is unavailable on this machine.

## Conflicts

Implementation plan expected `CopyToPublishDirectory="Never"` item metadata to work from `Directory.Build.props`; live publish evidence disproved that assumption. Resolved publish-item removal preserves approved behavior.

## Tests Not Run

- Successful Production browser smoke remains not run because current Windows Bash choices cannot provide both native `setsid` process control and native Windows executable behavior.
