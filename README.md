# Blocks

Blocks is a .NET Aspire workspace for backend services, a React/Vite web app,
shared contracts, and plugin modules. It also publishes a repository-owned
agent protocol for repeatable engineering work.

## Architecture

```text
apps/       Web applications
services/   Core backend services
platform/   Aspire host, defaults, and shared code
plugins/    Domain plugin services and tests
agents/     Canonical agent protocol and integrations
infra/      Local infrastructure and deployment examples
tests/      Contract and service tests
docs/       Approved architecture, runbooks, and task records
```

Main components include `Blocks.AppHost`, System Service, File Service, the
API Gateway, the Web app, and the TradeLab plugin.

## Local Setup

Install the .NET SDK, Node.js, Python 3.12, Docker, and `uv`. Resolve local
credentials from environment variables or the local secret store. Never commit
secrets or production configuration.

Clone the repository with its pinned skill submodules:

```powershell
git clone --recurse-submodules https://github.com/HoangNhi/blocks-platform.git blocks-platform
Set-Location .\blocks-platform
```

For an existing checkout, initialize or refresh submodules with:

```powershell
git submodule update --init --recursive
```

Read these files first:

- `AGENTS.md`
- `docs/README.md`
- `docs/runbooks/local-development.md`
- Relevant architecture and task documents under `docs/`

Start the Aspire application with the command documented in
`docs/runbooks/local-development.md`. Run focused tests first, then the
service, frontend, and agent-workflow suites relevant to your change.

## Validation

Public CI runs on `main` pushes and pull requests. It builds and tests .NET,
Python agent workflows, frontend code, generated skill catalogs, and the public
boundary contract. Workflow actions are commit-SHA pinned and checkout does
not persist credentials.

## Agent Workflow

`agents/protocol/`, `agents/adapters/`, `agents/manifests/`, and `agents/tools/`
are canonical repository sources. Runtime-specific skill mirrors are generated
locally from `agents/skills-manifest.yaml` and are not committed.

Use repository task folders under `docs/tasks/` for approved work. Keep plans,
execution evidence, reviews, and validation commands with their task.

## Deployment Examples

`infra/compose/` and `infra/deploy/` contain sanitized examples only. They use
explicit image, storage, environment-file, deployment-root, and health URL
inputs. Production deployment control planes, credentials, inventories, and
real infrastructure values remain private.

## Public History

Blocks was previously developed in a private repository. Public history starts
from a reviewed and sanitized `v0.1.0` snapshot. The public repository is the
future source of truth; private operational history is not published.

## Licensing

Blocks-owned source is licensed under MIT. Third-party skill repositories keep
their original licenses and notices. See `THIRD_PARTY_NOTICES.md` and `LICENSE`.

## Security

See `SECURITY.md` for private vulnerability reporting, responsible disclosure,
dependency exceptions, and contributor access boundaries. Do not put secrets,
production data, or private infrastructure details in issues or pull requests.

## Contributing

See `CONTRIBUTING.md` for issue, branch/worktree, implementation, pull request,
CI, review, and merge workflow.
