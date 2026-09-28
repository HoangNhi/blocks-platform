---
status: approved
owner: system-service
last_reviewed: 2026-07-26
scope: services/system-service
source: obsidian-vault/services/system-service/README.md
---

# System Service

- Code: `services/system-service/Blocks.SystemService/`
- Shared contracts: `platform/shared/Blocks.Shared/`
- Orchestration: `platform/apphost/Blocks.AppHost/`

Use existing API response and authentication patterns. Structure refactors do not authorize endpoint, database, or authentication changes.

## Registration and authorization contract

- Registration modes are server-controlled: open, invite-only and administrator-provisioned. Public input cannot select roles, permissions, administrative flags or personal workspace ownership.
- The server resolves the default registration role and creates the user, personal workspace and owner membership with failure-safe consistency. Invitation use must validate expiry and authorized role assignment.
- First public registration never grants administrator access. First-administrator bootstrap is a separate authenticated-by-bootstrap-secret operation; bootstrap secrets must not appear in logs or docs.
- The role model uses one role per user. Stable menu permission keys identify features; menu-supported capabilities intersect with role grants. Unsupported actions cannot be granted.
- Navigation visibility is presentation only. Backend authorization remains mandatory even when an item is hidden or a frontend route is guarded.
- Functional permission and workspace/resource ownership are separate checks. Deny access when authority is unavailable or resource ownership is not established; never fabricate ownership for legacy records.
- New members must not receive domain-resource grants before resource authorization is enforced. TradeLab datasets are the explicit instance-scoped exception, protected by functional authorization and immutable version lifecycle.

These are product/security contracts, not a claim that all domain-resource migrations or runtime gates have passed. Operational task state lives only in Knowledge.
