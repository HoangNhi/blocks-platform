---
status: approved
owner: infrastructure
last_reviewed: 2026-09-25
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

Production branch policy is `master`. The existing `.github/workflows/ci.yml` still has a push guard for `main`; that workflow mismatch requires separately approved deployment alignment. This documentation task does not change CI/CD behavior, deployment targets, release state, secrets, or branch workflow.

The six Heroku apps use container builds and explicit `web` releases from `.github/workflows/ci.yml` when its separate deployment gate is aligned. The VPS File Service and database remain manual. Keep `HEROKU_API_KEY` as a GitHub Actions repository secret; this pipeline does not create databases, migrate data, or rewrite config vars. Check deployment with `heroku releases -a <app>`; recover a faulty release manually with `heroku releases:rollback -a <app>`.

## Sanitized Deployment Topology

- Pull requests and manual CI validate without releasing.
- `master` is production policy; workflow trigger alignment is a separate deployment change.
- Containerized Heroku services release explicit `web` processes when the approved CI/CD gate permits.
- VPS File Service and database operations remain manual and separately verified.
- Secret values remain outside repository documentation and configuration.
