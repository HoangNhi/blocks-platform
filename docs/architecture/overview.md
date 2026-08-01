---
status: approved
owner: repository
last_reviewed: 2026-07-26
scope: Blocks
sources:
  - AGENTS.md
  - Blocks.slnx
---

# Blocks Architecture Overview

Blocks is a .NET Aspire workspace containing backend services, a React/Vite web app, shared contracts, and plugin modules.

## Source Ownership

- `apps/`: user-facing applications
- `services/`: independently owned backend services
- `plugins/`: plugin implementation and contracts
- `platform/apphost/`: Aspire orchestration
- `platform/service-defaults/`: shared Aspire defaults
- `platform/shared/`: shared .NET contracts
- `agents/`: canonical agent protocol, skills, manifests, and tools
- `docs/`: approved project knowledge
- `tests/`: repository and integration validation

Folder moves must preserve namespaces, assemblies, image names, service names, routes, ports, database names, and public identifiers.
