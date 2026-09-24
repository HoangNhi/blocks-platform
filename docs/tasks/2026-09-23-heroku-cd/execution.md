# Heroku Container CD Execution

Status: implemented in working tree; activation pending review, repository secret, and merge to `main`.

## Evidence

- RED: contract test failed (three missing deploy-job failures) before workflow edit.
- GREEN: focused Heroku contract, public CI boundary, and deployment-template tests: 8 passed.
- YAML parsed with seven jobs and six deploy matrix entries.
- `actionlint v1.7.12 .github/workflows/ci.yml`: exit 0.
- Full public-boundary test on this dirty local tree: 3 failures from pre-existing `.vs`, `.agents`, `.hermes`, `obj`, and local virtual environments. Its deployment guard and other focused tests passed. CI uses a clean checkout.
- Local Docker build not run: Docker Desktop daemon unavailable. Live releases not run: workflow has not reached `main`.
- Full repository and live deployment checks remain unverified until review and merge to `main`.

## Rulings

- Existing public-boundary test prohibited all GitHub secrets in `ci.yml`; narrowed rule to validation jobs and required deploy guard, so PRs still cannot reach the secret. An unguarded future job would require revisiting this rule.
- Kept work in existing dirty feature branch instead of isolated worktree to preserve uncommitted Web Docker changes used by this deployment. No unrelated files were changed or reset.
- Python command unavailable locally; used `uv run --no-project --python 3.12 --with pytest` for focused tests.
- A failed two-file patch partially added one deploy job; duplicate-job assertion caught the second insertion. Removed duplicate before workflow lint and focused tests.
- Scoped the API key to preflight, registry login, and release; install/build/push steps do not receive it. GitHub CLI is unavailable locally, so repository secret presence was not checked.

## Activation

Repository administrator sets `HEROKU_API_KEY` GitHub Actions secret. Merge reviewed changes to `main`; only then CI can build, push, and release six Heroku apps. Verify releases in GitHub Actions and Heroku. Database and VPS File Service remain outside this automation.
