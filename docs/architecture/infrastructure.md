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

Production CD runs after all CI jobs pass on a push to `main`. Pull requests and manual CI runs validate without releasing. The six Heroku apps use container builds and explicit `web` releases from `.github/workflows/ci.yml`; the VPS File Service and database remain manual.

Set `HEROKU_API_KEY` as a GitHub Actions repository secret before merging the workflow into `main`. Keep each app's existing runtime config vars in Heroku; this pipeline does not create databases, migrate data, or rewrite config vars. Check deployment with `heroku releases -a <app>`; recover a faulty release manually with `heroku releases:rollback -a <app>`.
