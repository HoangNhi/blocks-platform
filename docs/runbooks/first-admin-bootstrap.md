# First Administrator Bootstrap

Bootstrap uses `POST /api/Auth/bootstrap` with the same fields as public registration. Send the configured secret only through `X-Blocks-Bootstrap-Secret`.

Configure `Bootstrap:Secret` through the environment or local secret store. Environment configuration takes precedence. Do not place secret values in source, logs, or documentation.

Bootstrap is available only while no active administrator exists. It creates the first administrator, personal workspace, owner membership, registration mode `admin_provisioned`, and audit record atomically. After success, the endpoint returns `404`.

If active administrator role mapping is ambiguous, endpoint returns `409`; map exactly one active role to stable key `administrator`, then retry.
