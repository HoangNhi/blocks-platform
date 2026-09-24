# Context Routing

## Purpose

Read the smallest authoritative context set before broad search. Repository docs own public product behavior and protocol; an approved private internal task uses only its exact owner-supplied vault path. Generated context is supplemental.

## Common Order

1. `AGENTS.md`
2. `docs/README.md`
3. Relevant `docs/architecture/`, `docs/decisions/`, or `docs/runbooks/` documents
4. Active task artifacts: public contributor task under `docs/tasks/YYYY-MM-DD-<slug>/`, or exact private task path supplied by the owner and resolved through `OBSIDIAN_VAULT_PATH`
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
- Public task folder under `docs/tasks/`, or exact owner-supplied private task path
- Optional projection: `agents/tools/get-context.ps1 -Area web`

### Assistant

- `docs/architecture/services/assistant-service.md`
- Public task folder under `docs/tasks/`, or exact owner-supplied private task path
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
- Public task folder under `docs/tasks/`, or exact owner-supplied private task path
- Optional projection: `agents/tools/get-context.ps1 -Area cross-service`

## External Vault Rules

- Resolve the vault only through `OBSIDIAN_VAULT_PATH`.
- For private internal work, read only the exact task path supplied by the owner and require explicit execution approval. Missing required context means `BLOCKED`.
- Use generated bounded context by default.
- Direct access is read-only and deliberate.
- Private task files control only that task's private scope; they do not override public product contracts, security boundaries, or repository-owned protocol.
- Generated notes never grant authority or permission.
- If the vault is unavailable, continue with repository docs unless the task explicitly requires history.

## Search Rules

- Prefer indexes, owner docs, active specs, and bounded `rg` searches.
- Use extractor summaries before raw transcript or session data.
- Never scan the full vault by default.
