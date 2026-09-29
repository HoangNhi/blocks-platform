---
status: approved
owner: tradelab
last_reviewed: 2026-07-26
scope: plugins/tradelab
sources:
  - obsidian-vault/02-plugins/tradelab/README.md
  - obsidian-vault/02-plugins/tradelab/technical-decisions.md
---

# TradeLab

- Backend: `plugins/tradelab/service/`
- Web plugin: `apps/web/Blocks.Web/src/plugins/tradelab/`
- Research workflow: `docs/runbooks/tradelab-research-prompt.md`

Repository source and current tests define runtime behavior. The refactor preserves routes, modes, safety gates, service identifiers, database names, and research result contracts. Historical phase notes remain in the external vault and cannot silently authorize new trading behavior.

## Ownership transition safeguards

- Private Bot/Strategy/Run repositories require an explicit workspace UUID. Credential repositories additionally require an explicit owner UUID; model defaults never invent ownership.
- Tenant requests cannot operate instance-wide live safety/proof controls or smoke-fixture resets.
- Private dispatcher and paper scheduler execution are disabled until a workload-authenticated authorization recheck exists. Startup neither seeds private resources nor runs the ownership migration. Queued work is not a promise of execution while this gate is closed.
- Legacy rows without ownership remain quarantined; scoped repositories cannot adopt them through normal update/create operations.
- These safeguards alone do not authorize public multi-user deployment. Remaining private-path coverage, database write/relationship enforcement and frontend context isolation require verification before opening access.
