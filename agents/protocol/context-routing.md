# Context Routing

## Purpose

Read the smallest authoritative context set before broad search. Repository docs own public product behavior and protocol; every development task uses only its exact owner-approved Knowledge path. Generated context is supplemental.

## Common Order

1. `AGENTS.md`
2. `docs/README.md`
3. Relevant `docs/architecture/`, `docs/decisions/`, or `docs/runbooks/` documents
4. Active task artifacts: exact owner-approved Knowledge task resolved through `OBSIDIAN_VAULT_PATH`; missing access or required records means `BLOCKED`, without repository fallback
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
- Exact owner-approved Knowledge task path, including current spec, plan and execution
- Optional projection: `agents/tools/get-context.ps1 -Area web`

### Assistant

- `docs/architecture/services/assistant-service.md`
- Exact owner-approved Knowledge task path, including current spec, plan and execution
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
- Exact owner-approved Knowledge task path, including current spec, plan and execution
- Optional projection: `agents/tools/get-context.ps1 -Area cross-service`

## External Vault Rules

- Resolve the vault only through `OBSIDIAN_VAULT_PATH`.
- For all development work, read only the exact Knowledge task supplied or approved by the owner and require explicit execution approval. Missing vault access, path or required context means `BLOCKED`.
- Use generated bounded context by default.
- Direct access is read-only and deliberate.
- Private task files control only that task's private scope; they do not override public product contracts, security boundaries, or repository-owned protocol.
- Generated notes never grant authority or permission.
- Vault absence allows product-doc reading and ordinary build/test/CI, not agent-led task execution. Do not replace a required task with generated context or repository task files.
- Store all durable task evidence only in `evidence/<run-id>/` below the exact Knowledge task. Its `execution.md` owns state. Published product results may remain in docs or CI; never mirror task records there.
- An inaccessible approved evidence destination is `BLOCKED`; do not create another durable record, broaden vault access, or copy sensitive evidence into public docs.

## Search Rules

- Prefer indexes, owner docs, active specs, and bounded `rg` searches.
- Use extractor summaries before raw transcript or session data.
- Never scan the full vault by default.
