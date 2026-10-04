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

## Initiative and Workstream Context Routing

### Context Packet Structure
When working on an initiative or workstream task, the context packet provided must be strictly bounded:
- **Exact approved paths:** Only the approved Knowledge paths specifically granted by the owner.
- **Requirement IDs:** The precise, stable IDs assigned to this task/workstream.
- **Relevant ADRs & Invariants:** Specific decisions and invariants applicable to this task, along with their approved revision.
- **Baseline Revisions:** Surveyed commit hash and approved contract/artifact revision.
- **Repository Docs & Dependencies:** Applicable repo architecture docs and declared prerequisite tasks.
- **Bounded read rule:** Do not require or attempt reading the entire initiative hierarchy or unrelated workstream documents.

### Access Boundaries & Links (Walkthrough W3)
- **Repo authority:** Repository docs retain source of truth for public contracts, security, and protocol. Private task artifacts never override them.
- **Links do not grant permission:** An internal link from an approved task to a parent initiative, sibling task, or external document does NOT grant read or write permission to that target.
- **Missing access is BLOCKED (W3):** If an agent encounters a link to a parent or dependency outside its approved path, it must stop the dependent work and report `BLOCKED` on that specific path. Never scan sibling folders or attempt vault-wide traversal.

## State Ownership and Baseline Drift

### State Ownership & Single Source of Truth
- **Master Spec (`master-spec.md`):** Holds the authoritative requirement definitions and system-level acceptance criteria.
- **Workstream Decomposition (`workstream-decomposition.md`):** Holds the mapping between requirements and workstreams, ensuring exactly one `primary owner` per requirement ID. It does not track independent execution state.
- **Task Execution (`execution.md`):** Each task's `execution.md` is the sole source of truth for its own execution state.
- **Initiative Coordination:** The initiative-level execution record holds only coordination status and references/links; progress summaries are derived projections with explicit source and revision references, never a secondary state store.

### Contract Drift & Baseline Changes (Walkthrough W4)
- **Baseline drift stops work:** When a baseline contract, schema, or code interface changes, or when an ADR is updated, consumers relying on the previous revision cannot silently continue.
- **Escalation gate (W4):** Identify and document affected requirement IDs and consumer tasks. Immediately stop work on affected paths until an impact review is conducted and fresh owner approval is granted. Never silently patch an outdated plan.

## Search Rules

- Prefer indexes, owner docs, active specs, and bounded `rg` searches.
- Use extractor summaries before raw transcript or session data.
- Never scan the full vault by default.
