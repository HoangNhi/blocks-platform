# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary user is a community member running or joining a self-hosted Blocks instance. They work inside a personal workspace and own their strategies, backtests, risk profiles, files, AI Video projects, and other member-created domain resources.

Secondary user is an instance operator or administrator. They install and configure Blocks, control registration, manage users and functional permissions, operate services and plugins, set quotas, review audit logs, and moderate published resources.

## Product Purpose

Blocks is a self-hosted-first open-source platform where community members can create, analyze, manage, share, and deliberately publish resources across installed product modules. Success means normal members can complete their work without exposure to infrastructure administration, while operators retain explicit control over instance capabilities and safety.

## Positioning

Blocks combines a personal operational workspace with installable domain modules and an explicit community publication boundary. Private work, workspace collaboration, and public community resources use one product while remaining separate authorization states.

## Operating Context

- Every member receives a personal workspace.
- A member may also participate in shared workspaces.
- TradeLab datasets are canonical instance-scoped resources. Ready versions are immutable, corrections create new versions, and superseded versions are deprecated rather than overwritten.
- Functional access is granted by role, menu, and action permissions.
- Resource access is granted by ownership, workspace membership, or explicit sharing.
- Public access exists only through explicit publication.
- Instance administration is separate from normal member navigation.
- Self-hosted deployments may use open, invite-only, or administrator-provisioned registration.

## Capabilities and Constraints

- New public registrations receive a server-selected default member role.
- Public registration never accepts a role or permission assignment from the client.
- One role per user is the approved initial contract.
- Built-in member role cannot be deleted, but its functional permissions may be edited.
- Menu permissions control feature and action access; they do not replace workspace or resource authorization.
- Member-owned resources are private by default. Sharing and publishing are explicit.
- Canonical datasets do not use member ownership or private/workspace/public visibility states.
- A future hosted offering must remain possible without weakening self-hosted operation.
- No secret, credential, internal storage locator, or infrastructure detail may become public through resource publication.

## Brand Commitments

- Product name: Blocks.
- Visual direction: restrained minimalism.
- Three-dimensional block forms may appear as a subtle identity motif on public pages, setup, authentication, onboarding, and selected empty states.
- Operational tables, forms, permission matrices, charts, and workbenches remain quiet and decoration-free.

## Evidence on Hand

- Current authenticated shell, menu, role, and permission implementation under apps/web/Blocks.Web and services/system-service/Blocks.SystemService.
- Current TradeLab, File Service, and AI Video implementations demonstrate domain capabilities but do not yet share one complete workspace/resource authorization contract.
- No repository evidence authorizes fabricated community counts, customer claims, hosted-service claims, or public resource inventory.

## Product Principles

1. Community member experience comes before instance administration.
2. Private by default; sharing and publishing require explicit intent.
3. Functional permissions and resource permissions remain separate layers.
4. Self-hosted operation must stay understandable and safe for one operator.
5. Plugins integrate with stable platform authorization contracts rather than inventing isolated permission systems.

## Accessibility & Inclusion

Blocks Web must preserve keyboard navigation, visible focus, semantic labels, readable contrast, logical headings, usable mobile targets, and non-color status indicators across public, member, and administration surfaces.
