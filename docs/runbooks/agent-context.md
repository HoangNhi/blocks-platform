---
status: approved
owner: agent-workflow
last_reviewed: 2026-07-26
scope: external-obsidian-context
---

# External Obsidian Context

Set `OBSIDIAN_VAULT_PATH` to the absolute external vault root. The vault is read-only by default and is never copied wholesale into the repository.

```powershell
$env:OBSIDIAN_VAULT_PATH = "<absolute-vault-path>"
powershell -NoProfile -ExecutionPolicy Bypass -File agents/tools/get-context.ps1 -Area tradelab
```

Generated files include source attribution and generation time, redact secret-like assignments, enforce a byte limit, and are written under the ignored `.agent-context/generated/` directory.

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
