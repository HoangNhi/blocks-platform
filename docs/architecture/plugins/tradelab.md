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
