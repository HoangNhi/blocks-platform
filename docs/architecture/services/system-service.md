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

## TradeLab workload authorization

- POST /api/Authorization/workload-check authenticates a trusted service with X-Service-Authorization; a user JWT cannot replace that credential. Existing POST /api/Authorization/check retains its user-authenticated contract.
- The workload request accepts only nonzero userId/workspaceId, permissionKey=tradelab.backtests and action=analyze. Current scoped membership/functional permission is checked; private resource ownership remains TradeLab's responsibility.
- A valid success envelope identifies the exact checked user/workspace and carries a boolean hasPermission, including an authoritative false. Invalid service authentication, missing configuration or authority failure is not a user revocation proof.
- The TradeLab client accepts HTTPS, or HTTP only on loopback, with no redirects, a two-second timeout and a 16 KiB response cap. It distinguishes valid denial from unavailable authority and rejects malformed, conflicting or mismatched subject/scope fields.
- Service keys remain outside committed settings, task documents, browser requests and strategy containers. The endpoint does not authorize cTrader, live trading or legacy-owner adoption.
