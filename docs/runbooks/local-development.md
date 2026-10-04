---
status: approved
owner: repository
last_reviewed: 2026-09-27
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

## Assistant Service

```powershell
Set-Location services/assistant-service
uv sync --locked --python 3.12
uv run --locked --python 3.12 ruff check .
uv run --locked --python 3.12 pytest -q
```

## TradeLab Service

```powershell
Set-Location plugins/tradelab/service
uv sync --locked --python 3.12
uv run --locked --python 3.12 ruff check .
uv run --locked --python 3.12 pytest -q
```

### TradeLab ownership provenance

Provenance migration is explicit and additive. Review the target and obtain separate approval before applying it to an existing database. The application does not run it at startup and does not adopt existing private rows.

From `plugins/tradelab/service`, preview SQL without connecting to a database:

```powershell
uv run --locked --python 3.12 python -m tradelab_api.tools.ownership_provenance_migration
```

After approval, resolve `TRADELAB_PROVENANCE_MIGRATION_DATABASE_URL` from the local secret store/environment for that exact target, then run the same command with `--apply`. There is no application-database fallback. Do not put credentials in command arguments, task evidence or committed files.

The migration adds nullable `ownership_verified_at` columns to private roots with no default or backfill. Old rows remain unverified even when their owner is a canonical UUID. Startup rejects missing, defaulted, non-nullable or incompatible proof columns. Rollback keeps the dispatcher disabled; it does not drop data or restore permissive ownership.

## Agent Workflow

```powershell
uv run --no-project --python 3.12 --with pytest python -m pytest -q -p no:cacheprovider tests/agent-workflow
```

## Command Map

| Area / working directory | Commands |
| --- | --- |
| .NET / repo root | `dotnet restore Blocks.slnx`; `dotnet build Blocks.slnx -c Release --no-restore`; `dotnet test Blocks.slnx -c Release --no-build` |
| Web / `apps/web/Blocks.Web` | `npm ci`; `npm run lint`; `npm test`; `npm run build` |
| Assistant / `services/assistant-service` | `uv sync --locked --python 3.12`; `uv run --locked --python 3.12 ruff check .`; `uv run --locked --python 3.12 pytest -q` |
| TradeLab / `plugins/tradelab/service` | `uv sync --locked --python 3.12`; `uv run --locked --python 3.12 ruff check .`; `uv run --locked --python 3.12 pytest -q`; DB fixtures cần cấu hình dev/test riêng, không production |
| Agent workflow / repo root | `uv run --no-project --python 3.12 --with pytest python -m pytest -q -p no:cacheprovider tests/agent-workflow` |
| Codex CLI / repo root | Research: `codex -C $repoRoot -s read-only -a on-request`; Coding: `codex -C $repoRoot -s workspace-write -a on-request --add-dir $taskRoot` |

## Optional integrations

Context7 is not enabled: version-specific results must match the lockfile before adding a docs skill. Use official versioned documentation and local types instead; do not silently substitute current-branch snippets. GitHub CLI requires explicit authenticated read-only verification before being considered enabled. Do not add more MCP servers to compensate for missing prerequisites.

## Context

Generate optional historical context with `agents/tools/get-context.ps1`. Product build/test/CI remains independent of Knowledge. Agent-led development requires the exact owner-approved Knowledge task; missing access is `BLOCKED`, without repository task fallback.

## Codex local setup

`agents/codex.example.toml` is the portable, non-secret template. Copy to ignored `.codex/config.toml` only if absent; merge deliberately when local settings exist. Never force-add `.codex/` or overwrite user settings. `agents/mcp.example.json` is an example, not live tool inventory.

Restart Codex with the launch flags above after changing project config. Research is read-only; coding grants only repo and exact approved task writes. Parent-app, managed or CLI overrides can change effective permissions: validate restricted subprocess allow/deny behavior before claiming sandbox protection. Existing full-access sessions do not hot-reload into this policy.

### Windows sandbox prerequisites

The native elevated sandbox needs Windows Firewall enabled for the active network profile to enforce external network blocking. Do not infer enforcement from `network_access = false`: compare an outside-sandbox HTTP control with the same request inside the sandbox. Loopback access is not proof of external egress blocking. Never change firewall profiles or ACLs silently.

If Codex setup reports `CreateFileW failed` on long paths under its LocalAppData runtime cache, use the extended Win32 path for the Codex process only. This preserves the same filesystem and runtime ACL validation; do not disable the sandbox or skip validation. Do not change the global user `LOCALAPPDATA` value.

~~~powershell
$originalLocalAppData = $env:LOCALAPPDATA
try {
    if ($env:OS -eq 'Windows_NT' -and $env:LOCALAPPDATA -and -not $env:LOCALAPPDATA.StartsWith('\\?\')) {
        $env:LOCALAPPDATA = '\\?\' + $env:LOCALAPPDATA
    }
    codex -C $repoRoot -s workspace-write -a on-request --add-dir $taskRoot
} finally {
    $env:LOCALAPPDATA = $originalLocalAppData
}
~~~

For research, replace the invocation with `codex -C $repoRoot -s read-only -a on-request`. Keep real allow/deny evidence scoped to the exact approved task. Current full-access host sessions do not become restricted retroactively.

## Configuration ownership

- .NET projects use native host configuration precedence. Safe defaults belong in `appsettings.json`; ignored `appsettings.Development.json` owns local Development values; committed `appsettings.Production.json` may contain non-secret production settings. Environment and supported command-line overrides retain native precedence.
- Do not manually append local JSON after host construction. The AI Video Importer's domain arguments are not configuration overrides.
- Child services own database, JWT, CORS, LLM and plugin settings. AppHost owns orchestration settings and may inject service endpoints or smoke overrides; it must not parse child-service dotenv files.
- Assistant Service and TradeLab use ignored .env.local files with process environment taking precedence. Vite uses its native .env.local/build-time configuration.
- Local plaintext settings are intentionally private. Keep Development JSON and local dotenv files out of Git, published artifacts and every Docker build context. Git ignore rules alone do not protect publish/container outputs.
- Production secrets stay outside committed configuration; use configured secret stores or environment. Never include local credential values in examples or evidence.

## Runtime smoke

Run `bash platform/apphost/validate-browser-smoke.sh` in an environment containing setsid, uv, dotnet and node, with locally configured BLOCKS_SMOKE_POSTGRES_* values. Use BLOCKS_SMOKE_ENVIRONMENT=Production for a production-mode smoke check. An unavailable runtime is not a PASS result; capture task evidence only in the exact Knowledge task.

## TradeLab ownership test safety

TradeLab tests block SQLAlchemy connections unless the actual PostgreSQL database is named `tradelab_test` and `TRADELAB_TEST_DATABASE_RESET=true` is explicitly set. Enabling this flag permits destructive test resets; use only a separately approved disposable target, never application or production data. Database-dependent skips are not migration or tenant-isolation evidence.

Ownership migrations are maintenance operations, not application startup work. Obtain an approved target, backup/window and rollback procedure before invoking them. Private startup seeding is disabled. The operator-only baseline CLI requires `--workspace-id <UUID> --actor-id <UUID>`; it never infers either identity and must run only against an approved target.

## TradeLab isolated backtest worker

- Keep TRADELAB_JOB_DISPATCHER_ENABLED=false until the approved task's database, authority, startup and isolation gates pass. Enabling the flag is not a deployment or multi-user readiness proof.
- Build the runner-only image with `docker build -t tradelab-runner plugins/tradelab/runner`. Resolve its immutable image ID locally and configure TRADELAB_RUNNER_IMAGE to that sha256 value, not a mutable tag. The API image is not a strategy sandbox.
- Configure SYSTEM_SERVICE_BASE_URL to the workload authority's HTTPS origin, or an HTTP loopback origin for isolated local development. Resolve SYSTEM_SERVICE_AUTHORIZATION_KEY from the configured local secret store/environment. Never log its value or mount backend configuration into the runner.
- The executor must expose Linux memory, swap-total, CPU and pid enforcement and support the checked-in seccomp profile. Missing executor/profile/image or unsupported limits fail closed; do not fall back to host subprocesses.
- Runner integration tests may use the local pinned image without database access. Database and API isolation tests still need separately approved disposable tradelab_test and explicit reset permission; do not enable the reset flag merely to remove skips.
- On dispatcher crash or unconfirmed sandbox termination, leave running rows reserved. Inspect the run's pipeline_context workerInstanceId/sandboxName and matching container labels/ID. Confirm termination before any separately approved fail/requeue operation and fresh authority check. Never reset all running rows or restart an orphan automatically.
- Increasing dispatcher replicas requires a separately approved fencing/recovery design. Keep the single-dispatcher advisory-lock gate and existing live/paper safety controls intact.
