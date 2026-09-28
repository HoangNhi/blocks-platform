---
status: approved
owner: agent-workflow
last_reviewed: 2026-09-26
scope: external-obsidian-context
---

# External Obsidian Context

Set `OBSIDIAN_VAULT_PATH` to the absolute external vault root. The vault is read-only by default and is never copied wholesale into the repository.

```powershell
$env:OBSIDIAN_VAULT_PATH = "<absolute-vault-path>"
powershell -NoProfile -ExecutionPolicy Bypass -File agents/tools/get-context.ps1 -Area tradelab
```

Generated files include source attribution and generation time, redact secret-like assignments, enforce a byte limit, and are written under the ignored `.agent-context/generated/` directory.

## Knowledge-only Task Context

Every development task lives only in Knowledge at its exact owner-approved path, resolved through `OBSIDIAN_VAULT_PATH`. Read current spec, plan and execution directly. Missing access, required context or approval is `BLOCKED`; no repo fallback or canonical task projection. Product contracts and sanitized results stay in repository docs. Ordinary build/test/CI does not require the vault.

Create new blank records only after the destination is approved:

```powershell
./agents/tools/new-task.ps1 -TaskPath "<exact-owner-approved-vault-relative-folder>"
```

The tool refuses existing folders and unsafe or repository-local paths. Old `-Mode`, `-Slug`, `-Scope`, `-Service` and `-Date` switches are removed. Blank records are not execution approval. `get-context.ps1 -TaskPath` is retired; read task records directly. Its other options remain for optional attributed historical summaries.

All durable task reports belong in the exact Knowledge task's `evidence/<run-id>/`; `execution.md` owns state. Public docs/CI may show sanitized product results, not task process history. Hermes retains read-only access to task records; a run-specific report output is writable only after explicit boundary approval. An unavailable destination is `BLOCKED`; do not broaden mounts or expose credentials.

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

Agent-led development requires access to the exact approved Knowledge task. Use `agents/tools/launch-claude.ps1 -WithVault` when that explicit directory-access grant is appropriate; otherwise arrange a bounded authorized mount. Generated context is not a replacement for task access.

## Codex

Read the exact approved Knowledge task directly. Use `.agent-context/generated/` only for optional history. Request bounded task access if unavailable; do not bypass filesystem restrictions.
