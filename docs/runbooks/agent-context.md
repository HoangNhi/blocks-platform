---
status: approved
owner: agent-workflow
last_reviewed: 2026-09-24
scope: external-obsidian-context
---

# External Obsidian Context

Set `OBSIDIAN_VAULT_PATH` to the absolute external vault root. The vault is read-only by default and is never copied wholesale into the repository.

```powershell
$env:OBSIDIAN_VAULT_PATH = "<absolute-vault-path>"
powershell -NoProfile -ExecutionPolicy Bypass -File agents/tools/get-context.ps1 -Area tradelab
```

Generated files include source attribution and generation time, redact secret-like assignments, enforce a byte limit, and are written under the ignored `.agent-context/generated/` directory.

## Private Task Context

For approved private internal work, use only the exact task path supplied by the owner and resolve the vault root through `OBSIDIAN_VAULT_PATH`. Read the task's current spec, plan, and execution record; missing required context or approval means `BLOCKED`. Do not search for an alternate task or treat generated context as approval. Public product behavior and contributor rules remain in repository docs.

Hermes reads the handed-off knowledge snapshot. A run-specific report output may be writable only after its filesystem boundary and owner approval are verified; otherwise keep the vault read-only. Report publication and Git write credentials stay outside the browser worker.

## Hermes Docker

Mount the host vault read-only and point the container environment to the mount:

```yaml
terminal:
  backend: docker
  docker_mount_cwd_to_workspace: true
  docker_volumes:
    - "<host-vault-path>:/knowledge/blocks:ro"
```

```env
OBSIDIAN_VAULT_PATH=/knowledge/blocks
```

## Claude Code

Use `agents/tools/launch-claude.ps1 -WithVault` only for deliberate direct research. Default Claude usage reads generated context instead.

## Codex

Prefer `.agent-context/generated/`. Do not depend on unrestricted external filesystem access.
