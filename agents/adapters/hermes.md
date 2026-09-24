# Hermes Adapter

## Context Order

1. Repository `AGENTS.md` and `docs/`
2. Relevant external notes resolved through `OBSIDIAN_VAULT_PATH`
3. Bounded context generated with `agents/tools/get-context.ps1` for implementation agents

## Vault Access

- Read-only by default.
- Never copy the full vault into the repository.
- Preserve source paths and generation time.
- Exclude secret-bearing files and redact secret-like assignments.

## Report Writes

- Read-only remains the default for knowledge snapshots and task records.
- Write only to a run-specific report output after owner approval and verification of the actual filesystem boundary; if that boundary is not proven, remain read-only.
- Never update task specs, plans, or execution state, and never give the browser worker credentials for public issue publication or Git pushes.

For Docker terminal execution, mount the vault read-only as documented in `docs/runbooks/agent-context.md`.
