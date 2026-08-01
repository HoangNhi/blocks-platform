---
status: approved
owner: infrastructure
last_reviewed: 2026-07-26
scope: compose-caddy-deploy-preview
sources:
  - infra/compose/local.yml
  - infra/compose/preview.yml
  - infra/compose/production.yml
  - infra/compose/file-service.production.yml
  - infra/caddy/Caddyfile
  - infra/deploy/deploy-file-service.sh
---

# Infrastructure

Infrastructure entry points live under `infra/compose/`, `infra/caddy/`, `infra/deploy/`, and `infra/preview/`. Commands preserve the repository root as the Compose project directory.

Production CD runs only from `Heroku`. `master` and `dev` run validation without publishing or deploying services.
