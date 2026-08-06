# Standard Development Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace custom local configuration loading with native `appsettings.Development.json` behavior while keeping local values out of Git, publish artifacts, and Docker contexts.

**Architecture:** WebApplication and AppHost projects rely on native builders with no appended JSON provider. AI Video Importer adopts `Microsoft.Extensions.Hosting` while retaining domain CLI arguments. Python and Vite keep `.env.local`; AppHost injects only smoke and orchestration-owned values.

**Tech Stack:** .NET 10, Aspire 13.1, Microsoft.Extensions.Hosting 10.0.1, Python 3.12, Pydantic Settings, Vite, PowerShell, pytest, Docker

---

## File Map

- Modify `.gitignore`, five .NET entry points, AppHost, importer project, Python tests, and smoke script.
- Create `Directory.Build.props`, root `.dockerignore`, Web `.dockerignore`, and final `execution.md`.
- Delete two tracked Development files; recreate six ignored Development files by secret-safe migration.
- Delete six obsolete ignored Local files.

Never print, stage, commit, or retain real local values in evidence.

### Task 1: Define Failing Configuration Contract

**Files:**
- Modify: `tests/agent-workflow/test_local_configuration_contract.py`
- Modify: `services/assistant-service/tests/test_assistant_ollama.py`
- Modify: `plugins/tradelab/service/tests/test_config.py`

- [ ] **Step 1: Rewrite repository contract test**

Keep the existing `ROOT` and `read()` helpers. Replace Local-contract assertions with exact assertions for:

```python
assert "**/appsettings.Development.json" in read(".gitignore")
assert "**/appsettings.Local.json" not in read(".gitignore")
assert "appsettings.Production.json" not in read(".gitignore")
```

For AppHost, System, File, API Gateway, and AI Video Service entry points:

```python
assert "appsettings.Local.json" not in read(path), path
```

For AI Video Importer:

```python
importer = read("plugins/ai-video-production/service/Blocks.AiVideoImporter/Program.cs")
project = read("plugins/ai-video-production/service/Blocks.AiVideoImporter/Blocks.AiVideoImporter.csproj")
assert "Host.CreateApplicationBuilder()" in importer
assert "new ConfigurationBuilder()" not in importer
assert "appsettings.Local.json" not in importer
assert 'PackageReference Include="Microsoft.Extensions.Hosting" Version="10.0.1"' in project
```

For AppHost ownership:

```python
apphost = read("platform/apphost/Blocks.AppHost/AppHost.cs")
for marker in ("LoadDotEnv", "GetSetting", "tradeLabDotEnv", "assistantDotEnv"):
    assert marker not in apphost
assert 'WithEnvironment("DATABASE_URL", smokeDatabaseUrl)' in apphost
assert 'WithEnvironment("ASSISTANT_LLM_PROVIDER", "disabled")' in apphost
```

Also assert `Directory.Build.props` contains `CopyToPublishDirectory="Never"`; root and Web Docker ignore files contain approved patterns; `git ls-files` excludes API Gateway and AI Video Development files; Python modules retain `.env.local`; smoke script uses `BLOCKS_SMOKE_ENVIRONMENT`.

- [ ] **Step 2: Add Python precedence tests**

Assistant test:

```python
def test_settings_environment_overrides_env_local_file(tmp_path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    (tmp_path / ".env.local").write_text(
        "ASSISTANT_LLM_MODEL=local-file-model\n", encoding="utf-8"
    )
    monkeypatch.setenv("ASSISTANT_LLM_MODEL", "environment-model")
    assert Settings().assistant_llm_model == "environment-model"
```

TradeLab test:

```python
def test_settings_environment_overrides_env_local_file(tmp_path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    (tmp_path / ".env.local").write_text(
        "DATABASE_URL=postgresql+psycopg://local-file/database\n", encoding="utf-8"
    )
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://environment/database")
    assert Settings().database_url == "postgresql+psycopg://environment/database"
```

- [ ] **Step 3: Verify RED**

Run `py -3.14 -m pytest tests/agent-workflow/test_local_configuration_contract.py -q` from repo root.

Expected: FAIL on Local loaders, tracking, publish/Docker guards, importer, AppHost, and smoke script.

Run focused Python tests from each service. Expected: PASS, proving Pydantic already gives process environment priority.

- [ ] **Step 4: Commit when authorized**

```powershell
git add tests/agent-workflow/test_local_configuration_contract.py services/assistant-service/tests/test_assistant_ollama.py plugins/tradelab/service/tests/test_config.py
git commit -m "test: define standard development configuration"
```

Do not commit without explicit authorization.

### Task 2: Add Tracking, Publish, and Docker Guards

**Files:**
- Modify: `.gitignore`
- Create: `Directory.Build.props`
- Create: `.dockerignore`
- Create: `apps/web/Blocks.Web/.dockerignore`
- Delete: `services/api-gateway/Blocks.ApiGateway/appsettings.Development.json`
- Delete: `plugins/ai-video-production/service/Blocks.AiVideoService/appsettings.Development.json`

- [ ] **Step 1: Replace appsettings ignore block**

```gitignore
.worktrees/
**/appsettings.Development.json
/platform/apphost/Blocks.AppHost/aspire-manifest.json
/plugins/tradelab/service/.env.local
```

Remove Local and Production appsettings ignore rules.

- [ ] **Step 2: Add publish exclusion**

Create `Directory.Build.props`:

```xml
<Project>
  <ItemGroup>
    <Content Update="appsettings.Development.json" CopyToPublishDirectory="Never" />
    <None Update="appsettings.Development.json" CopyToPublishDirectory="Never" />
  </ItemGroup>
</Project>
```

- [ ] **Step 3: Add Docker exclusions**

Root `.dockerignore`:

```dockerignore
**/appsettings.Development.json
**/appsettings.Local.json
**/.env.local
**/.env.*.local
```

Web `.dockerignore`:

```dockerignore
.env.local
.env.*.local
node_modules
dist
```

- [ ] **Step 4: Delete tracked Development files**

Delete both listed files with `apply_patch`. Task 3 recovers their safe local-only contents from `HEAD` before creating ignored replacements.

- [ ] **Step 5: Verify partial RED**

Run contract test. Expected: failures remain only for source loaders, importer, AppHost, and smoke script.

- [ ] **Step 6: Commit when authorized**

```powershell
git add .gitignore Directory.Build.props .dockerignore apps/web/Blocks.Web/.dockerignore services/api-gateway/Blocks.ApiGateway/appsettings.Development.json plugins/ai-video-production/service/Blocks.AiVideoService/appsettings.Development.json
git commit -m "chore: guard development configuration files"
```

Do not commit without explicit authorization.

### Task 3: Migrate Local .NET Values Without Disclosure

**Files:**
- Create ignored: six `appsettings.Development.json` files
- Delete ignored: six `appsettings.Local.json` files

- [ ] **Step 1: Verify destination ignore status**

```powershell
$destinations = @(
  'platform/apphost/Blocks.AppHost/appsettings.Development.json',
  'services/system-service/Blocks.SystemService/appsettings.Development.json',
  'services/file-service/Blocks.FileService/appsettings.Development.json',
  'services/api-gateway/Blocks.ApiGateway/appsettings.Development.json',
  'plugins/ai-video-production/service/Blocks.AiVideoService/appsettings.Development.json',
  'plugins/ai-video-production/service/Blocks.AiVideoImporter/appsettings.Development.json'
)
foreach ($path in $destinations) {
  git check-ignore --quiet -- $path
  if ($LASTEXITCODE -ne 0) { throw "Destination is not ignored: $path" }
}
```

- [ ] **Step 2: Migrate in process memory**

Run this PowerShell in process memory:

```powershell
function Read-Json([string]$path) {
  Get-Content -LiteralPath $path -Raw | ConvertFrom-Json -AsHashtable
}
function Read-HeadJson([string]$path) {
  $text = (git show "HEAD:$path") -join "`n"
  if ($LASTEXITCODE -ne 0) { throw "Cannot read HEAD:$path" }
  $text | ConvertFrom-Json -AsHashtable
}
function Merge-Json([hashtable]$base, [hashtable]$overlay) {
  foreach ($key in $overlay.Keys) {
    if ($base[$key] -is [hashtable] -and $overlay[$key] -is [hashtable]) {
      $base[$key] = Merge-Json $base[$key] $overlay[$key]
    } else {
      $base[$key] = $overlay[$key]
    }
  }
  $base
}
$items = @(
  @{ Source='platform/apphost/Blocks.AppHost/appsettings.Local.json'; Destination=$destinations[0]; Baseline=$null },
  @{ Source='services/system-service/Blocks.SystemService/appsettings.Local.json'; Destination=$destinations[1]; Baseline=$null },
  @{ Source='services/file-service/Blocks.FileService/appsettings.Local.json'; Destination=$destinations[2]; Baseline=$null },
  @{ Source='services/api-gateway/Blocks.ApiGateway/appsettings.Local.json'; Destination=$destinations[3]; Baseline='services/api-gateway/Blocks.ApiGateway/appsettings.Development.json' },
  @{ Source='plugins/ai-video-production/service/Blocks.AiVideoService/appsettings.Local.json'; Destination=$destinations[4]; Baseline='plugins/ai-video-production/service/Blocks.AiVideoService/appsettings.Development.json' },
  @{ Source='plugins/ai-video-production/service/Blocks.AiVideoImporter/appsettings.Local.json'; Destination=$destinations[5]; Baseline=$null }
)
foreach ($item in $items) {
  if (-not (Test-Path -LiteralPath $item.Source)) { throw "Missing source: $($item.Source)" }
  $value = if ($item.Baseline) { Read-HeadJson $item.Baseline } else { @{} }
  $value = Merge-Json $value (Read-Json $item.Source)
  $json = $value | ConvertTo-Json -Depth 100
  [System.IO.File]::WriteAllText(
    (Join-Path (Get-Location) $item.Destination),
    $json + [Environment]::NewLine,
    [System.Text.UTF8Encoding]::new($false)
  )
}
```

Write with:

```powershell
$json = $value | ConvertTo-Json -Depth 100
[System.IO.File]::WriteAllText(
  (Join-Path (Get-Location) $destination),
  $json + [Environment]::NewLine,
  [System.Text.UTF8Encoding]::new($false)
)
```

Never emit `$value` or `$json`.

- [ ] **Step 3: Validate then delete Local files**

Parse all six destinations with `ConvertFrom-Json`. Only after all parse, remove each exact Local path with non-recursive `Remove-Item -LiteralPath`.

- [ ] **Step 4: Verify repository safety**

`git status --porcelain=v1 --ignored=matching` must show Development files only as ignored. `git diff --cached --name-only` must contain no Development, Local, or `.env.local` path.

No commit: migrated files are intentionally ignored.

### Task 4: Restore Native .NET Configuration

**Files:**
- Modify: System, File, API Gateway, and AI Video Service `Program.cs`
- Modify: `plugins/ai-video-production/service/Blocks.AiVideoImporter/Program.cs`
- Modify: `plugins/ai-video-production/service/Blocks.AiVideoImporter/Blocks.AiVideoImporter.csproj`

- [ ] **Step 1: Remove appended Local providers**

Delete `builder.Configuration.AddJsonFile("appsettings.Local.json", ...)` from four WebApplication projects. Add no replacement.

- [ ] **Step 2: Convert importer to native Hosting**

Add:

```xml
<PackageReference Include="Microsoft.Extensions.Hosting" Version="10.0.1" />
```

Replace manual builder with:

```csharp
var builder = Host.CreateApplicationBuilder();
var configuration = builder.Configuration;
```

Register services through `builder.Services`, then create `using var serviceProvider = builder.Services.BuildServiceProvider();`. Remove `System.IO` and `Microsoft.Extensions.Configuration` usings.

Do not pass importer domain arguments into configuration parsing; keep `--source-key` and `--apply` behavior unchanged.

- [ ] **Step 3: Build five changed projects**

```powershell
$projects = @(
  'services/system-service/Blocks.SystemService/Blocks.SystemService.csproj',
  'services/file-service/Blocks.FileService/Blocks.FileService.csproj',
  'services/api-gateway/Blocks.ApiGateway/Blocks.ApiGateway.csproj',
  'plugins/ai-video-production/service/Blocks.AiVideoService/Blocks.AiVideoService.csproj',
  'plugins/ai-video-production/service/Blocks.AiVideoImporter/Blocks.AiVideoImporter.csproj'
)
foreach ($project in $projects) {
  dotnet build $project --no-restore
  if ($LASTEXITCODE -ne 0) { throw "Build failed: $project" }
}
```

Expected: all five PASS.

- [ ] **Step 4: Verify only AppHost remains RED**

Run contract test. Expected: AppHost ownership and smoke environment failures only.

- [ ] **Step 5: Commit when authorized**

```powershell
git add services/system-service/Blocks.SystemService/Program.cs services/file-service/Blocks.FileService/Program.cs services/api-gateway/Blocks.ApiGateway/Program.cs plugins/ai-video-production/service/Blocks.AiVideoService/Program.cs plugins/ai-video-production/service/Blocks.AiVideoImporter/Program.cs plugins/ai-video-production/service/Blocks.AiVideoImporter/Blocks.AiVideoImporter.csproj
git commit -m "refactor: use native dotnet configuration"
```

Do not commit without explicit authorization.

### Task 5: Return Child Configuration Ownership

**Files:**
- Modify: `platform/apphost/Blocks.AppHost/AppHost.cs`
- Modify: `platform/apphost/validate-browser-smoke.sh`

- [ ] **Step 1: Remove AppHost local-file infrastructure**

Delete Local JSON provider, dotenv parser helpers, child dotenv paths, and all variables populated through `GetSetting`. Keep smoke-variable validation.

- [ ] **Step 2: Restrict TradeLab injection to smoke mode**

Normal registration contains only AddUvicornApp, `WithUv`, and health check. In `if (appHostSmokeMode)`, inject this exact map:

| Key | Value |
| --- | --- |
| `DATABASE_URL` | `smokeDatabaseUrl` |
| `SEED_BASELINE_ON_STARTUP` | `false` |
| `SEED_BASELINE_CREATED_BY` | `trade-lab-apphost` |
| `TRADELAB_ENVIRONMENT` | `local` |
| local fill and paper engine | `false` |
| background fill and paper schedulers | `false` |
| testnet vault and connector | `fake` |
| testnet credential validation and network | `false` |
| testnet kill switch | `true` |
| testnet base URL | `http://127.0.0.1:9` |
| live vault | `disabled` |
| live credential validation and network | `false` |
| live kill switch | `true` |
| live connector | `fake` |
| live base URL | `http://127.0.0.1:9` |
| live receive windows | `5000` |
| live timeouts | `5.0` |
| local credential keys | empty string |

- [ ] **Step 3: Restrict Assistant injection to smoke mode**

Normal registration contains only AddUvicornApp, `WithUv`, and health check. Smoke block injects provider `disabled`, model `qwen3.5:2b-q4_K_M`, base URL `http://127.0.0.1:9`, context tokens `4096`, and timeout `60`. Keep smoke-only certificate removal.

- [ ] **Step 4: Make smoke environment selectable**

```bash
runtime_environment="${BLOCKS_SMOKE_ENVIRONMENT:-Development}"
```

Use `$runtime_environment` for both `ASPNETCORE_ENVIRONMENT` and `DOTNET_ENVIRONMENT`.

- [ ] **Step 5: Verify GREEN**

Run contract, Assistant, and TradeLab focused tests; build AppHost. Expected: all PASS.

- [ ] **Step 6: Commit when authorized**

```powershell
git add platform/apphost/Blocks.AppHost/AppHost.cs platform/apphost/validate-browser-smoke.sh
git commit -m "refactor: keep service configuration service-owned"
```

Do not commit without explicit authorization.

### Task 6: Verify Publish, Docker, Runtime, and CI Behavior

**Files:**
- Create: `docs/tasks/2026-08-05-standard-development-configuration/execution.md`

- [ ] **Step 1: Run focused tests and lint**

Run contract pytest, Assistant Ruff and focused pytest, and TradeLab Ruff and config pytest. Expected: all PASS.

- [ ] **Step 2: Build and repository checks**

```powershell
dotnet restore Blocks.slnx
dotnet build Blocks.slnx --no-restore
dotnet format Blocks.slnx --verify-no-changes
git diff --check
```

Record pre-existing unrelated formatter failures without editing them.

- [ ] **Step 3: Verify publish exclusion**

```powershell
$publishRoot = '.hermes/runs/2026-08-05-standard-development-configuration/publish'
New-Item -ItemType Directory -Force -Path $publishRoot | Out-Null
$projects = @(
  'platform/apphost/Blocks.AppHost/Blocks.AppHost.csproj',
  'services/system-service/Blocks.SystemService/Blocks.SystemService.csproj',
  'services/file-service/Blocks.FileService/Blocks.FileService.csproj',
  'services/api-gateway/Blocks.ApiGateway/Blocks.ApiGateway.csproj',
  'plugins/ai-video-production/service/Blocks.AiVideoService/Blocks.AiVideoService.csproj',
  'plugins/ai-video-production/service/Blocks.AiVideoImporter/Blocks.AiVideoImporter.csproj'
)
foreach ($project in $projects) {
  $name = [System.IO.Path]::GetFileNameWithoutExtension($project)
  $output = Join-Path $publishRoot $name
  dotnet publish $project -c Release --no-restore -o $output
  if ($LASTEXITCODE -ne 0) { throw "Publish failed: $project" }
  if (Test-Path -LiteralPath (Join-Path $output 'appsettings.Development.json')) {
    throw "Development config entered publish output: $project"
  }
}
```

- [ ] **Step 4: Verify Docker contexts**

Repo-root probe:

```powershell
$probe = @'
FROM busybox:1.36
COPY . /context
RUN test ! -e /context/platform/apphost/Blocks.AppHost/appsettings.Development.json \
 && test ! -e /context/services/system-service/Blocks.SystemService/appsettings.Development.json \
 && test ! -e /context/services/assistant-service/.env.local \
 && test ! -e /context/plugins/tradelab/service/.env.local
'@
$probe | docker build --no-cache -f - .
```

Web-context probe:

```powershell
Push-Location apps/web/Blocks.Web
$probe = @'
FROM busybox:1.36
COPY . /context
RUN test ! -e /context/.env.local
'@
$probe | docker build --no-cache -f - .
Pop-Location
```

If Docker is unavailable, mark execution `BLOCKED` with these exact rerun commands.

- [ ] **Step 5: Verify Development runtime**

```powershell
$runDir = '.hermes/runs/2026-08-05-standard-development-configuration'
New-Item -ItemType Directory -Force -Path $runDir | Out-Null
$process = Start-Process dotnet -ArgumentList @(
  'run', '--project', 'platform/apphost/Blocks.AppHost/Blocks.AppHost.csproj'
) -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru `
  -RedirectStandardOutput (Join-Path $runDir 'apphost.stdout.log') `
  -RedirectStandardError (Join-Path $runDir 'apphost.stderr.log')
[System.IO.File]::WriteAllText(
  (Join-Path (Get-Location) (Join-Path $runDir 'apphost.pid')),
  $process.Id.ToString()
)
```

Use browser-use first. Confirm all seven active resources reach `Running`; record any fallback browser and reason.

- [ ] **Step 6: Verify Production smoke**

```powershell
$env:BLOCKS_SMOKE_ENVIRONMENT = 'Production'
bash platform/apphost/validate-browser-smoke.sh
Remove-Item Env:BLOCKS_SMOKE_ENVIRONMENT
```

Expected: `PASS AppHost browser smoke` with no Development-file dependency.

- [ ] **Step 7: Stop runtime and scan secrets**

Stop AppHost tree. Confirm no worktree child remains. Run `git diff --check` and bounded `rg` for unresolved markers and assigned secret-like values, excluding ignored Development and dotenv files.

- [ ] **Step 8: Write truthful execution record**

Create `execution.md` with `COMPLETED` only when tests, build, publish, Docker, Development runtime, Production smoke, shutdown, and secret scan pass. Otherwise use `BLOCKED` with exact reason and rerun command. Include Summary, Files Changed, Context Used, Testing, Notes, Obsidian follow-up, missing context, conflicts, and tests not run.

- [ ] **Step 9: Commit when authorized**

```powershell
git add .gitignore Directory.Build.props .dockerignore apps/web/Blocks.Web/.dockerignore platform services plugins tests docs/tasks/2026-08-05-standard-development-configuration
git commit -m "refactor: use standard development configuration"
```

Before committing, verify no staged path ends with Development JSON, Local JSON, or `.env.local`. Do not commit without explicit authorization.
