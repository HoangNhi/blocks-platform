# Local Service Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every active Blocks service one ignored, service-owned local configuration file while preserving existing local values and keeping tracked files secret-free.

**Architecture:** .NET projects load optional `appsettings.Local.json` after standard JSON configuration. Python services load `.env.local` through Pydantic. AppHost reads the same Python files while preserving smoke-mode overrides. Existing User Secrets remain rollback backup.

**Tech Stack:** .NET 10, .NET 8 services, Aspire 13.1, Python 3.12+, Pydantic Settings, PowerShell, pytest

---

## File Map

- Modify `.gitignore` and six .NET entry points.
- Modify two Python settings modules and their focused tests.
- Modify AppHost child-service configuration ownership.
- Create `tests/agent-workflow/test_local_configuration_contract.py`.
- Create nine ignored local configuration files during migration.
- Create redacted `docs/tasks/2026-08-02-local-service-configuration/execution.md`.

Never stage, commit, print, or retain ignored file contents.

### Task 1: Add Configuration Contract Test

**Files:** Create `tests/agent-workflow/test_local_configuration_contract.py`.

- [ ] **Step 1: Write failing source contract**

```python
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROGRAMS = (
    "platform/apphost/Blocks.AppHost/AppHost.cs",
    "services/system-service/Blocks.SystemService/Program.cs",
    "services/file-service/Blocks.FileService/Program.cs",
    "services/api-gateway/Blocks.ApiGateway/Program.cs",
    "plugins/ai-video-production/service/Blocks.AiVideoService/Program.cs",
)

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")

def test_local_configuration_contract() -> None:
    loader = 'builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: true);'
    assert "**/appsettings.Local.json" in read(".gitignore")
    for path in PROGRAMS:
        assert loader in read(path), path
    importer = read("plugins/ai-video-production/service/Blocks.AiVideoImporter/Program.cs")
    assert '.AddJsonFile("appsettings.Local.json", optional: true)' in importer
    for path in (
        "services/assistant-service/src/assistant_service_api/core/config.py",
        "plugins/tradelab/service/src/tradelab_api/core/config.py",
    ):
        source = read(path)
        assert 'env_file=".env.local"' in source, path
        assert 'env_file_encoding="utf-8"' in source, path
    apphost = read("platform/apphost/Blocks.AppHost/AppHost.cs")
    assert 'GetSetting(tradeLabDotEnv, "DATABASE_URL", "")' in apphost
    assert 'builder.AddParameter("tradelab-smoke-database-url"' not in apphost
    assert 'builder.AddParameter("ai-video-database-url"' not in apphost
    assert "assistantDotEnv" in apphost
```

- [ ] **Step 2: Verify RED**

Run `py -3.14 -m pytest tests/agent-workflow/test_local_configuration_contract.py -q`.

Expected: FAIL because ignore rule and loaders do not exist.

- [ ] **Step 3: Commit when authorized**

Commit test with message `test: define local configuration contract`. Do not commit unless user explicitly authorizes commits during execution.

### Task 2: Load Local JSON in .NET Projects

**Files:** Modify `.gitignore`, AppHost `AppHost.cs`, System/File/API Gateway/AI Video `Program.cs`, and AI Video Importer `Program.cs`.

- [ ] **Step 1: Add ignore rule**

```gitignore
**/appsettings.Local.json
```

- [ ] **Step 2: Add after each `CreateBuilder(args)` call**

```csharp
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: true);
```

- [ ] **Step 3: Add before importer `.AddEnvironmentVariables()`**

```csharp
.AddJsonFile("appsettings.Local.json", optional: true)
```

- [ ] **Step 4: Verify partial GREEN**

Run contract test. Expected: local JSON assertions PASS; Python assertions remain FAIL.

- [ ] **Step 5: Build changed .NET projects**

Run `dotnet build` for AppHost, System, File, API Gateway, AI Video Service, and AI Video Importer project files. Expected: all six PASS.

- [ ] **Step 6: Commit when authorized**

Commit message: `feat: load service local configuration files`.

### Task 3: Load Python `.env.local` Files

**Files:** Modify both Python config modules and Assistant test; create `plugins/tradelab/service/tests/test_config.py`.

- [ ] **Step 1: Add failing Assistant test**

```python
def test_settings_load_default_env_local_file(tmp_path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("ASSISTANT_LLM_MODEL", raising=False)
    (tmp_path / ".env.local").write_text(
        "ASSISTANT_LLM_MODEL=local-file-model\n", encoding="utf-8"
    )
    assert Settings().assistant_llm_model == "local-file-model"
```

- [ ] **Step 2: Add failing TradeLab test**

```python
from tradelab_api.core.config import Settings

def test_settings_load_default_env_local_file(tmp_path, monkeypatch) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    (tmp_path / ".env.local").write_text(
        "DATABASE_URL=postgresql+psycopg://local-file/database\n",
        encoding="utf-8",
    )
    assert Settings().database_url == "postgresql+psycopg://local-file/database"
```

- [ ] **Step 3: Verify RED**

Run each new test from its service directory with `uv run pytest`. Expected: both FAIL.

- [ ] **Step 4: Configure both Pydantic settings classes**

```python
model_config = SettingsConfigDict(
    env_prefix="",
    case_sensitive=False,
    extra="ignore",
    env_file=".env.local",
    env_file_encoding="utf-8",
)
```

- [ ] **Step 5: Verify GREEN**

Run Assistant `tests/test_assistant_ollama.py` and TradeLab `tests/test_config.py`. Expected: PASS.

- [ ] **Step 6: Commit when authorized**

Commit message: `feat: load Python local environment files`.

### Task 4: Move Child Configuration Out of AppHost

**Files:** Modify `platform/apphost/Blocks.AppHost/AppHost.cs`; extend configuration contract test.

- [ ] **Step 1: Read TradeLab database from service file**

```csharp
var tradeLabDatabaseUrl = GetSetting(tradeLabDotEnv, "DATABASE_URL", "");
```

Replace normal database parameter branch with:

```csharp
else if (!string.IsNullOrWhiteSpace(tradeLabDatabaseUrl))
{
    tradeLabService.WithEnvironment("DATABASE_URL", tradeLabDatabaseUrl);
}
```

- [ ] **Step 2: Load Assistant `.env.local`**

Resolve `services/assistant-service/.env.local` from `AppContext.BaseDirectory` using the same pattern as TradeLab. Read provider, model, base URL, context tokens, and timeout with `GetSetting` and current defaults.

- [ ] **Step 3: Inject Assistant values**

Use file-backed values in normal mode. Keep smoke overrides `disabled` and `http://127.0.0.1:9`.

- [ ] **Step 4: Remove normal AI Video parameter injection**

Keep smoke `ConnectionStrings__AiVideo`. Delete `builder.AddParameter("ai-video-database-url", secret: true)` and its normal environment injection.

- [ ] **Step 5: Verify**

Run contract test and `dotnet build platform/apphost/Blocks.AppHost/Blocks.AppHost.csproj`. Expected: PASS.

- [ ] **Step 6: Commit when authorized**

Commit message: `refactor: use service-owned local configuration`.
### Task 5: Migrate Existing Values Safely

**Files:** Create nine ignored files listed in File Map.

- [ ] **Step 1: Verify ignore status before secret reads**

Run `git check-ignore -q --` separately for every destination path. Abort on first nonzero exit code.

Expected: all nine paths return exit code `0`.

- [ ] **Step 2: Read existing values into process memory only**

Use `dotnet user-secrets list --project` for these exact projects:

```text
platform/apphost/Blocks.AppHost/Blocks.AppHost.csproj
services/system-service/Blocks.SystemService/Blocks.SystemService.csproj
services/file-service/Blocks.FileService/Blocks.FileService.csproj
plugins/ai-video-production/service/Blocks.AiVideoService/Blocks.AiVideoService.csproj
```

Split each line once on ` = `. Never echo resulting maps.

- [ ] **Step 3: Validate shared JWT contract**

Require non-empty `Jwt:Key` from System, File, and AI Video. Abort if values differ. Require AI Video issuer and audience to equal `JwtIssuer` and `JwtAudience`.

- [ ] **Step 4: Write BOM-free local JSON**

Use `ConvertTo-Json -Depth 20` and `[Text.UTF8Encoding]::new($false)`. Exact mappings:

| File | Values |
| --- | --- |
| AppHost | `AppHost:OtlpApiKey`, `AppHost:McpApiKey` |
| System | `ConnectionStrings:System`, shared JWT, current CORS, expiry `1`, refresh expiry `168`, direct-run File gRPC URL |
| File | shared JWT, current CORS, expiry `1`, refresh expiry `168` |
| API Gateway | four current localhost CORS origins |
| AI Video | AppHost `Parameters:ai-video-database-url` mapped to `ConnectionStrings:AiVideo`; shared JWT; empty `AiVideoAccess:ViewRoleIds`; existing `ImportSources:Legacy` |
| AI Video Importer | same AI Video connection and `ImportSources:Legacy` |

Abort rather than writing empty database, JWT, or import-source values.

- [ ] **Step 5: Write TradeLab `.env.local`**

Map AppHost `Parameters:tradelab-smoke-database-url` to `DATABASE_URL`. Copy all normal TradeLab settings currently supplied by AppHost: environment, seed, local fill, paper engine, testnet/live vault provider, validation, base URL, connector, network, receive-window, timeout, scheduler, and kill switches.

Use current safe defaults. Keep credential-key values empty unless process environment already supplies them. Quote values and reject embedded quotes or newlines.

- [ ] **Step 6: Write Assistant and Web `.env.local`**

```text
ASSISTANT_LLM_PROVIDER=ollama
ASSISTANT_LLM_MODEL=qwen3.5:2b-q4_K_M
ASSISTANT_LLM_BASE_URL=http://localhost:11434
ASSISTANT_LLM_CONTEXT_TOKENS=4096
ASSISTANT_LLM_TIMEOUT_SECONDS=60
VITE_API_BASE_URL=http://localhost:43100
```

Write Assistant and Web keys to their separate files. Preserve existing `ASSISTANT_LLM_MODEL` environment value when present.

- [ ] **Step 7: Validate without displaying values**

Parse six JSON files with `ConvertFrom-Json`. Count assignment lines in three `.env.local` files. Run `git status --short --ignored`; local files must appear only with `!!`.

### Task 6: Run Targeted Verification

- [ ] Run `py -3.14 -m pytest tests/agent-workflow/test_local_configuration_contract.py -q`.
- [ ] Run Assistant `uv run pytest tests/test_assistant_ollama.py -q`.
- [ ] Run TradeLab `uv run pytest tests/test_config.py -q`.
- [ ] Run `dotnet build Blocks.slnx`.
- [ ] Run `git diff --check`.

Expected: all commands PASS.

### Task 7: Verify AppHost Runtime

**Files:** Create `.hermes/runs/2026-08-02-local-service-configuration/` evidence and final `execution.md`.

- [ ] **Step 1: Start AppHost hidden**

Use `Start-Process dotnet` with arguments `run --project platform/apphost/Blocks.AppHost/Blocks.AppHost.csproj`, `-WindowStyle Hidden`, redirected stdout/stderr, and `-PassThru`. Save returned process ID. Never dump child environments.

- [ ] **Step 2: Verify resources through browser-use**

Run `browser-use doctor`, open emitted Aspire dashboard URL, then verify these resources reach healthy or running state:

```text
fileservice
systemservice
tradelabservice
assistantservice
aivideoservice
apigateway
web
```

Do not open environment-value panels. If browser-use fails, record exact reason and use Playwright fallback.

- [ ] **Step 3: Stop AppHost cleanly**

Read saved process ID into `$processId`, then run `Stop-Process -Id $processId`. Confirm owned child processes stop.

- [ ] **Step 4: Record truthful execution result**

Create `docs/tasks/2026-08-02-local-service-configuration/execution.md`. Use `COMPLETED` only when tests, build, ignore checks, and runtime checks pass. Otherwise use `BLOCKED` with exact reason and rerun command.

### Task 8: Final Security Review

- [ ] Scan tracked diff for database URLs, assigned JWT/API keys, unresolved markers, and accidental local-file content.
- [ ] Run `dotnet format Blocks.slnx --verify-no-changes`.
- [ ] Run Assistant and TradeLab `ruff check` on changed Python files.
- [ ] Confirm no staged path ends with `appsettings.Local.json` or `.env.local`.
- [ ] Confirm all existing User Secrets remain unchanged.
- [ ] Commit tracked changes only when user explicitly authorizes it; suggested message: `feat: add service-owned local configuration`.

Expected: tracked diff contains key names only, ignored files remain untracked, and retained evidence contains no secret values.
