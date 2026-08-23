# Resource Authorization Matrix

Status values: `enforced-and-migrated`, `assigned-owner`, `assigned-instance-workspace`, `quarantined-admin-only`, and `blocked-needs-decision`.

| Resource | Owner field | Workspace field | Visibility field | Legacy row count | Migration state | Enforcing endpoint |
| --- | --- | --- | --- | --- | --- | --- |
| Personal workspaces | `workspace_member.user_id` | `workspace_member.workspace_id` | private by membership | System Service rows | `enforced-and-migrated` | System Service workspace APIs |
| Strategies | none | none | none | unknown | `blocked-needs-decision` | TradeLab `/strategies` |
| Strategy versions | none | none | none | unknown | `blocked-needs-decision` | TradeLab `/strategies/{id}/versions` |
| Bots | none | none | none | unknown | `blocked-needs-decision` | TradeLab `/bots` |
| Backtests and runs | none | none | none | unknown | `blocked-needs-decision` | TradeLab `/bots/{id}/backtests`, `/bot-runs` |
| Risk profiles | embedded in `strategy.risk_config` and `bot.risk_config` | none | none | unknown | `blocked-needs-decision` | TradeLab risk and execution routes |
| Files and attachments | none | none | none | unknown | `blocked-needs-decision` | File Service upload, gRPC, and `/Files` |
| AI Video projects, runs, artifacts | none | none | none | unknown | `blocked-needs-decision` | AI Video `/api/ai-video` |
| Market-data jobs and results | none | none | none | unknown | `blocked-needs-decision` | TradeLab `/datasets` and `/bot-runs` |
| TradeLab datasets | no user owner by decision | instance-scoped | lifecycle not modeled | unknown | `blocked-needs-decision` | TradeLab `/datasets` |

## Safe default

`member` receives only `workspace.home` view permission. No member grant is seeded for domain resources until its row reaches `enforced-and-migrated`.

Existing resources are not made public, assigned to the first administrator, or assigned fabricated user/workspace ownership. Registration remains `admin_provisioned` until a default role contains only safe grants.
