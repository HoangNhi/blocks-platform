# Contributing

## Workflow

1. Open or select an issue that describes the change.
2. Create an isolated branch or worktree from `main`.
3. Implement the smallest scoped change with tests or validation evidence.
4. Open a pull request with scope, test commands, and known limitations.
5. Let public CI complete and address review feedback.
6. Merge only after review and required checks pass.

## Branch Names

```text
feature/<issue>-<name>
fix/<issue>-<name>
docs/<issue>-<name>
infra/<issue>-<name>
```

## Requirements

- Read `AGENTS.md` and relevant `docs/` context first.
- Keep secrets and production configuration outside the repository.
- Keep generated runtime mirrors and execution output uncommitted.
- Add focused tests for non-trivial behavior.
- Document blocked or not-applicable runtime evidence honestly.
- Do not change API contracts, database schema, or deployment control planes without an approved task.

## Pull Requests

Describe behavior changed, files touched, validation run, security impact, dependency changes, and follow-up work. Do not include private operational context or credentials.
