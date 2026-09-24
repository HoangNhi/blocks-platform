# Heroku Container CD

Status: approved; implemented locally, awaiting production activation.

## Intent

On each push to `main`, validate source with existing CI, then automatically deploy six existing Heroku apps. Database hosting and VPS File Service remain manual and outside this pipeline.

## Targets

| Heroku app | Dockerfile | Build context |
| --- | --- | --- |
| `blocks-system-service` | `services/system-service/Blocks.SystemService/Dockerfile` | repository root |
| `blocks-api-gateway` | `services/api-gateway/Blocks.ApiGateway/Dockerfile` | repository root |
| `blocks` | `apps/web/Blocks.Web/Dockerfile` | `apps/web/Blocks.Web` |
| `blocks-trade-lab` | `plugins/tradelab/service/Dockerfile` | repository root |
| `blocks-ai-video` | `plugins/ai-video-production/service/Blocks.AiVideoService/Dockerfile` | repository root |
| `blocks-ai-assistant` | `services/assistant-service/Dockerfile` | `services/assistant-service` |

## Delivery

- Extend existing GitHub Actions CI with a deploy job dependent on every validation job. Only successful `push` events on `main` can enter deployment; pull requests and manual CI dispatch cannot deploy.
- Build each Docker image from its listed context, push it to `registry.heroku.com/<app>/web`, and release the `web` process on the matching app. A failed build, push, or release fails that app's job; a pushed image alone is not a successful deploy.
- Deploy all six on each eligible push. Use a matrix so one app's failure does not cancel other app deployments. Prevent concurrent releases to the same app from overlapping.
- Use a GitHub Actions secret named `HEROKU_API_KEY` for registry authentication and Heroku release. Do not commit credentials, echo secret values, or copy local CLI authentication into source.
- Keep existing Heroku config vars and runtime service URLs. No database add-on, database migration, VPS File Service deploy, config-var rewrite, or app code change.
- Update contradictory infrastructure documentation to identify `main` as production trigger; `feature/*` and PR validation must not release.

## Verification

- Check workflow syntax and conditions: validation dependencies, `main` push restriction, six exact app names, Dockerfile/context pairs, secret use, and explicit release step.
- Ensure PRs and `workflow_dispatch` cannot reach deploy job.
- After setup, verify first successful `main` workflow shows six released apps. Application health and database-dependent endpoints require separately supplied runtime configuration.

## Activation

Repository administrator sets `HEROKU_API_KEY` in GitHub Actions secrets, then merges approved workflow to `main`. No local or current-branch edit triggers production deployment. If secret is missing, deployment must fail clearly rather than silently skip.
