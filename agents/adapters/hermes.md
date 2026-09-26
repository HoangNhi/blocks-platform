# Hermes Adapter

## Context Order

1. Repository `AGENTS.md` and `docs/`
2. Exact owner-approved Knowledge task resolved through `OBSIDIAN_VAULT_PATH`; missing access or required records means `BLOCKED`, not repository fallback
3. Optional bounded historical context; never a substitute for the current task records

## Vault Access

- Read-only by default.
- Never copy the full vault into the repository.
- Preserve source paths and generation time.
- Exclude secret-bearing files and redact secret-like assignments.

## Report Writes

- Read-only remains the default for knowledge snapshots and task records.
- Write only under the approved Knowledge task's `evidence/<run-id>/` after owner approval and actual filesystem boundary verification; if that boundary is not proven, remain read-only.
- Never update task specs, plans, or execution state, and never give the browser worker credentials for public issue publication or Git pushes.

For Docker terminal execution, mount the vault read-only as documented in `docs/runbooks/agent-context.md`.
