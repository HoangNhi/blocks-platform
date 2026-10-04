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

- Private Bot/Strategy/Run repositories require explicit workspace and actor UUIDs. New private roots stamp trusted, immutable ownership; child access validates the owned parent and matching workspace/references. Credential roots require their explicit owner UUID. Model defaults and client audit fields never invent ownership.
- Tenant requests cannot operate instance-wide live safety/proof controls or smoke-fixture resets.
- Backtest dispatch is disabled by default. Explicit enablement requires workload service credentials and a verified Linux runner-only image. Paper/import/benchmark scheduling remains outside this worker's eligible workload. Startup neither seeds private resources nor runs the ownership migration. Queued work is not a promise of execution while this gate is closed.
- Private roots carry nullable server-owned `ownership_verified_at` provenance. A canonical UUID alone is not ownership proof. Only fresh, matching C-01 creation can stamp the field; identity and proof remain immutable. Unverified roots stay quarantined, including canonical legacy UUIDs. Descendants require an authorized proof-bearing parent and exact workspace/relationship.
- Historical runs and paper sessions retain their pinned strategy version when the same owned bot selects a newer version. Reads still validate both the historical version and the current bot graph; changing the bot selection does not transfer ownership or rewrite history.
- Provenance covers strategy groups, strategies, versions, bots, runs, exchange connections, testnet/live credential refs, testnet/live order previews and intents, manual journal entries and paper sessions. Shared market facts do not acquire private provenance. Database defaults remain NULL; migration performs no backfill or adoption.
- Startup verifies the provenance schema but never applies that migration. Existing databases require separately approved explicit migration; legacy adoption requires a separate approved inventory/policy. Direct or cached object access cannot bypass quarantine.
- These safeguards alone do not authorize public multi-user deployment. Remaining private-path coverage, database write/relationship enforcement and frontend context isolation require verification before opening access.

## Isolated backtest runtime

- C-01 ExecutionContext v1 is immutable trusted authority metadata. HTTP and worker boundaries create it only after matching current subject/workspace authorization. It never enters strategy input.
- C-02 StrategyInvocation v1 freezes canonical JSON inputs, source hash, closed bars, seed, as-of time and finite resource policy. Service and SDK validate the contract; returned output must match the invocation. Existing on_candle(ctx) entrypoint and spot/futures result semantics remain supported.
- Untrusted source runs only in a separate digest-pinned Linux runner image: non-root, network-none, read-only rootfs, isolated tmpfs, dropped capabilities and default-deny seccomp. Native host execution is not a fallback. Import hooks are defense in depth, not the isolation boundary.
- Supported ceilings are wall 60s, aggregate CPU 30s at one core, memory/swap-total 512 MiB, 16 pids, scratch 16 MiB, combined output 2 MiB, input 16 MiB and 50,000 closed bars. Fork/clone are denied; numerical libraries use one thread. The implemented pid ceiling is stricter than the design's 32-pid upper bound.
- One database-scoped dispatcher owns a session advisory lock and verifies its backend identity and lock grant before discovery. Transaction-level admission reserves two active jobs globally, one per actor across workspaces, 20 queued per actor and 100 queued globally. Authority outages keep work queued with per-actor exponential backoff; actor-ranked discovery avoids same-actor head-of-line blocking.
- Claim metadata binds run ID, worker instance ID and sandbox name. Running jobs from an earlier instance are not replayed automatically. Cleanup checks an invocation label and removes the verified container ID, not an unverified name. Unconfirmed termination halts dispatch and leaves the running reservation for operator recovery.
- Supervision rechecks authority/cancellation during execution and again before persistence. Terminal compare-and-swap and successful results share one transaction. Revocation observation is bounded, not an atomic cross-service revoke/commit guarantee.
