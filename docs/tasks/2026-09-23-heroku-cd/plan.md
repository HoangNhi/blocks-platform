# Heroku Container CD Implementation Plan

> **For agentic workers:** Use executing-plans task-by-task. Checkboxes track work. Do not commit, push, or deploy without separate request.

**Goal:** Automatically deploy six existing Heroku apps after successful CI on pushes to `main`.

**Architecture:** Extend existing GitHub Actions CI with one guarded matrix deployment job. Each matrix entry builds its existing Dockerfile, pushes to Heroku Container Registry, and releases `web`; existing validation jobs gate all releases.

**Tech Stack:** GitHub Actions, Docker, Heroku CLI, Python stdlib, pytest.

**Spec:** `docs/tasks/2026-09-23-heroku-cd/spec.md`

## Global Constraints

- Six targets only: `blocks-system-service`, `blocks-api-gateway`, `blocks`, `blocks-trade-lab`, `blocks-ai-video`, `blocks-ai-assistant`.
- `main` push only; PR and manual dispatch validate without deploying.
- No File Service, database provisioning, migrations, config-var changes, committed secrets, or app-code changes.
- Do not modify or discard unrelated working-tree changes; no automatic git commit/push.

## Review Focus

- PR from fork must not receive `HEROKU_API_KEY` or deploy; test event guard.
- Manual CI dispatch must not release; test event guard.
- Missing `HEROKU_API_KEY` must fail before image build; test preflight marker.
- A successful registry push without release must not count as deploy; test push/release order.
- Root-context and app-context Dockerfiles must use correct source and avoid File Service; test matrix mappings.

---

### Task 1: Guarded Heroku Deploy Job

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `tests/agent-workflow/test_heroku_cd_contract.py`

**Interfaces:** Consumes existing CI job names, six Dockerfiles, `HEROKU_API_KEY` GitHub secret; produces a `deploy-heroku` job with per-app matrix and explicit Heroku `web` release.

- [x] Write a small stdlib-based contract test asserting: deploy job depends on `build-and-test`, `verify-agent-assets`, `test-agent-workflow`, `test-python-services`, `test-frontend`, and `boundary`; guard checks `github.event_name == 'push'` and `github.ref == 'refs/heads/main'`; six exact app/context/Dockerfile rows; `HEROKU_API_KEY` preflight; registry push before `container:release web`; no File Service app. Use `Path.read_text` and focused `assert` / `re` checks, no new YAML dependency.
- [x] Run `python -m pytest -q -p no:cacheprovider tests/agent-workflow/test_heroku_cd_contract.py`; expect failure because deploy job does not exist.
- [x] Add `deploy-heroku` to `ci.yml`: `needs` all six validation jobs; push/main `if` guard; matrix with exact app, Dockerfile, context; `fail-fast: false`; per-app `concurrency` with `cancel-in-progress: false`; checkout without persisted credentials; fail on empty `HEROKU_API_KEY`; install Heroku CLI using official distribution; authenticate Docker via stdin; `docker build -f <dockerfile> -t registry.heroku.com/<app>/web <context>`; `docker push`; `heroku container:release web --app <app>`. Keep secret out of process arguments and logs.
- [x] Rerun focused test and `python -m pytest -q -p no:cacheprovider tests/agent-workflow/test_deployment_template_contract.py`. Inspect workflow job YAML and confirm no paths or expressions are malformed.

### Task 2: Production Branch Documentation and Review

**Files:**
- Modify: `docs/architecture/infrastructure.md`
- Modify: `docs/tasks/2026-09-23-heroku-cd/execution.md` (create at execution)

**Interfaces:** Consumes deployed workflow contract; documents trigger, required secret, config-var ownership, release verification, and rollback.

- [x] Replace obsolete `Heroku`/`master` trigger claim with `main` push gated by CI; add short setup: GitHub repository secret `HEROKU_API_KEY`, existing Heroku config vars kept in apps, no database/File Service deploy. Record `heroku releases -a <app>` and `heroku releases:rollback -a <app>` as manual verification and recovery.
- [x] Run focused contract test and `git diff --check`; check that only approved workflow/test/docs files appear in task diff. Record PASS/BLOCKED evidence and any live deploy limitations in `execution.md` and `.hermes/runs/`.
- [ ] Do not push or activate production from feature branch. After workflow lands on `main` and repository secret is set, validate six actual releases from GitHub Actions; report unverified runtime state until then.
