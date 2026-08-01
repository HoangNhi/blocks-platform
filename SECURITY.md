# Security Policy

## Reporting

Report vulnerabilities through GitHub Private Vulnerability Reporting when it
is enabled for this repository. Do not disclose an unpatched vulnerability in
a public issue, pull request, discussion, or chat.

If private reporting is unavailable, open a minimal issue asking maintainers
for a private reporting channel. Do not include exploit details or secrets.

## Rules

- Never include credentials, tokens, private URLs, production data, or personal information in issues, logs, fixtures, or pull requests.
- Contributors receive no production access. Use local or synthetic data for development and verification.
- Do not test against systems or accounts without explicit authorization.
- Dependency exceptions require an advisory ID, reason, owner, approval date, and expiry date in `.security/dependency-exceptions.yml`.

## Supported Versions

Security fixes target latest `main` revision and latest published release. Older snapshots may not receive fixes.

## Disclosure

Maintainers will validate reports, coordinate a fix, and publish disclosure after a fix or mitigation is available. Reporters receive credit when desired.
