# Context Routing

## Purpose

Read the smallest authoritative context set before broad search. Repository docs are canonical; generated external context is supplemental.

## Common Order

1. `AGENTS.md`
2. `docs/README.md`
3. Relevant `docs/architecture/`, `docs/decisions/`, or `docs/runbooks/` documents
4. Active repository task folder under `docs/tasks/YYYY-MM-DD-<slug>/` or standalone specification/plan
5. `.agent-context/generated/<area>-context.md` when present

## Area Routing

### Core Services

- System Service: `docs/architecture/services/system-service.md`
- File Service: `docs/architecture/services/file-service.md`
- API Gateway: `docs/architecture/services/api-gateway.md`
- Shared contracts: `docs/architecture/services/shared.md`
- Optional projection: `agents/tools/get-context.ps1 -Area core-service`

### File Service

- `docs/architecture/services/file-service.md`
- Optional projection: `agents/tools/get-context.ps1 -Area file-service`

### Shared

- `docs/architecture/services/shared.md`
- Optional projection: `agents/tools/get-context.ps1 -Area shared`

### Web

- `docs/architecture/services/web.md`
- `agents/protocol/verification.md`
- Active repository task folder under `docs/tasks/`
- Optional projection: `agents/tools/get-context.ps1 -Area web`

### Assistant

- `docs/architecture/services/assistant-service.md`
- Active repository task folder under `docs/tasks/`
- Optional projection: `agents/tools/get-context.ps1 -Area assistant`

### TradeLab

- `docs/architecture/plugins/tradelab.md`
- `docs/runbooks/tradelab-research-prompt.md`
- Optional projection: `agents/tools/get-context.ps1 -Area tradelab`

### AI Video Production

- `docs/architecture/plugins/ai-video-production.md`
- Optional projection: `agents/tools/get-context.ps1 -Area ai-video`

### Infrastructure

- `docs/architecture/infrastructure.md`
- `docs/runbooks/local-development.md`
- Optional projection: `agents/tools/get-context.ps1 -Area infrastructure`

### Agent Workflow

- `agents/protocol/`
- `agents/adapters/`
- `docs/runbooks/agent-context.md`
- Optional projection: `agents/tools/get-context.ps1 -Area agent-workflow`

### Cross-Service

- `docs/architecture/overview.md`
- Active repository task folder under `docs/tasks/`
- Optional projection: `agents/tools/get-context.ps1 -Area cross-service`

## External Vault Rules

- Resolve the vault only through `OBSIDIAN_VAULT_PATH`.
- Use generated bounded context by default.
- Direct access is read-only and deliberate.
- External or generated notes never override repository docs.
- If the vault is unavailable, continue with repository docs unless the task explicitly requires history.

## Search Rules

- Prefer indexes, owner docs, active specs, and bounded `rg` searches.
- Use extractor summaries before raw transcript or session data.
- Never scan the full vault by default.
