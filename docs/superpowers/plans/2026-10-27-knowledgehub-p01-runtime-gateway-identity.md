# KnowledgeHub P01: Python Runtime, Gateway, And Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **For owner learning:** Step-by-step guide for manual implementation. The owner writes all product and test code; the agent provides review and debugging guidance upon request.

**Goal:** Build and integrate a minimal Python API service (`Blocks.KnowledgeHubService`) hosted via Aspire AppHost and reverse-proxied by YARP Gateway, enforcing local SystemService HS256 JWT validation and remote `SystemProto.CheckPermission` gRPC authorization.

**Architecture:** A FastAPI application managed with `uv` in a `src` layout. It validates incoming HS256 JWTs locally using shared platform secrets, extracts actor GUID from the `name` claim, and calls SystemService's private gRPC `CheckPermission` service over TLS with an internal `x-service-authorization` token. Reverse proxy routing forwards `/api/knowledgehub/{**catch-all}` through Gateway without stripping prefix.

**Tech Stack:** Python 3.12.14, `uv`, FastAPI 0.162.0, Uvicorn 0.54.0, Pydantic 2.14.1, Pydantic-Settings 2.16.1, PyJWT 2.15.1, grpcio 1.85.0, protobuf 7.36.2, .NET 10, Aspire.Hosting.Python 13.6.3, YARP 2.3.0.

**Spec:** `docs/superpowers/specs/2026-10-27-knowledgehub-p01-runtime-gateway-identity-design.md`

**Revision 2026-11-01:** Owner approved the service-local `.env` as the local
JWT key source. This revision also corrects earlier plan instructions that
contradicted the approved spec. Existing owner checkmarks are historical claims,
not proof of acceptance. Review outcome is `CHANGES REQUIRED`; the owner performs
all remaining code changes and live checks.

## Global Constraints

- Root package directory: `src/services/Blocks.KnowledgeHubService/`.
- Python version constraint: Python `3.12.14`, pinned in `.python-version` and `requires-python = ">=3.12,<3.13"`.
- AppHost integration: `Aspire.Hosting.Python` version `13.6.3` with `AddUvicornApp` and `WithUv(args: ["sync", "--locked", "--python", "3.12.14", "--no-python-downloads"])`.
- Gateway URL prefix: `/api/knowledgehub/{**catch-all}`, preserving the full path without `PathRemovePrefix`.
- Standard envelope for JSON APIs: `{ "Success": bool, "StatusCode": int, "Data": any, "Message": string? }` with HTTP 200 for application errors (soft-401, soft-403, soft-503).
- Operational health checks: `GET /alive` (HTTP 200 when alive), `GET /health` (HTTP 200 when healthy, HTTP 503 if gRPC channel fails).
- JWT claims: Actor GUID in `name`, username in `unique_name`, zero clock skew (`leeway=0`), explicit `algorithms=["HS256"]`.
- gRPC authorization metadata: `x-service-authorization: Bearer <current user token>`.
- Testing discipline: All unit/mock tests must be DB-free; no test database provisioning; standard library `unittest` + `httpx`.
- Local `KNOWLEDGEHUB_JWT_KEY` comes from the ignored service `.env` resolved relative to `config.py`; environment overrides dotenv. AppHost secret injection for this key is no longer required.
- Only the local JWT key source changed. Keep HTTPS, required public CA, safe startup diagnostics, exact issuer/audience, dynamic endpoints, and all acceptance gates.
- Unit tests use `_env_file=None`; dotenv tests use fake temporary files, never the owner's `.env`.
- Unexpected exceptions use real HTTP 500. Permission-service outages use application 503 inside HTTP 200.

## Review Focus

1. **Clock skew boundary:** Token expired by 1 second must fail validation (`leeway=0`).
2. **Untrusted algorithm header:** Token specifying `alg: none` or asymmetric keys must be rejected immediately.
3. **Actor extraction trap:** Claim `sub` is not actor GUID in Blocks; missing or invalid GUID in `name` claim must return application 401.
4. **Header convention:** Verify the selected `x-service-authorization` metadata carries the current request's token; do not assume other header support or share token state between actors (Tasks 6-7).
5. **Gateway prefix double-stripping:** Missing or malformed route transform in Gateway forwarding must not alter the `/api/knowledgehub` path expected by FastAPI router.

---

## File Map And Remaining Work

Paths below are relative to `src/services/Blocks.KnowledgeHubService/`
unless a full repository path is shown.

| Files | Planned operation / responsibility |
| --- | --- |
| `.python-version`, `pyproject.toml`, `uv.lock`, `.gitignore`, `src/knowledgehub/__init__.py`, `tests/__init__.py` | Retain package/lock setup; ensure `.env`, `.venv`, caches, PEM/private-key files stay excluded. Task 1. |
| `.env` | Owner-managed local JWT key only for this decision; never stage, print, or generate from real secrets in tests. Tasks 3/10. |
| `src/knowledgehub/rpc/__init__.py`, `system_pb2.py`, `system_pb2_grpc.py`; `tests/test_proto_stubs.py` | Regenerate package-qualified imports, never hand-edit generated code; test runtime imports. Task 2. |
| `src/knowledgehub/config.py`; `tests/test_config.py` | Dotenv loading, HTTPS/public CA validation, redacted diagnostics and source-isolation checks. Task 3. |
| `src/knowledgehub/responses.py`; `tests/test_responses.py` | HTTP/application envelope distinction and Vietnamese safe handlers. Task 4. |
| `src/knowledgehub/identity.py`; `tests/test_identity.py` | JWT validation including expiry type and safe Vietnamese errors. Task 5. |
| `src/knowledgehub/permission.py`; `tests/test_permission.py` | Exact RPC status mapping, TLS-only client, deadline/cancellation/metadata checks. Task 6. |
| `src/knowledgehub/main.py`; `tests/test_endpoints.py` | Lifespan ownership/cleanup, health recovery, no-RPC-on-invalid-token tests. Task 7. |
| `src/services/Blocks.ApiGateway/appsettings.json` | Preserve checked-in full-prefix route; no fixed destination. Task 8. |
| `tests/test_gateway_forwarding.py` | Replace dummy backend with real FastAPI plus isolated TLS gRPC fixture; opt-in real Gateway artifact. Task 9. |
| `src/platform/Blocks.AppHost/AppHost.cs`, `src/platform/Blocks.AppHost/Blocks.AppHost.csproj`, `test/Backend.Upgrade.Check.ps1` | Retain native Python hosting/pins; remove guessed issuer/audience, pin service-local venv, preserve existing platform structure. Task 10. |
| `docs/knowledgehub/outcomes/P01.md`, `docs/knowledgehub/README.md` | Record evidence/deviations; do not mark ACCEPTED before live gates. Tasks 11-12. |

Delete no product files. Remove only obsolete generated-import hand patches,
dummy-backend acceptance logic, and guessed configuration fallbacks when replacing
those sections. Do not delete existing services, permissions, or unrelated code.

### Task 1: Python Project Scaffolding & Dependency Pinning

**Files:**
- Create: `src/services/Blocks.KnowledgeHubService/.python-version`
- Create: `src/services/Blocks.KnowledgeHubService/pyproject.toml`
- Create: `src/services/Blocks.KnowledgeHubService/.gitignore`
- Create: `src/services/Blocks.KnowledgeHubService/src/knowledgehub/__init__.py`
- Create: `src/services/Blocks.KnowledgeHubService/tests/__init__.py`

**Interfaces:**
- Produces: Installable Python package `knowledgehub` in editable mode inside `.venv` via `uv sync`.

- [ ] **Step 1: Create `.python-version`**

File: `src/services/Blocks.KnowledgeHubService/.python-version`
Content:
```text
3.12.14
```

- [ ] **Step 2: Create `pyproject.toml` with strict pins and src-layout build configuration**

File: `src/services/Blocks.KnowledgeHubService/pyproject.toml`
Content:
```toml
[build-system]
requires = ["setuptools==84.2.1"]
build-backend = "setuptools.build_meta"

[project]
name = "knowledgehub"
version = "0.1.0"
description = "Blocks KnowledgeHub Document Intelligence Service"
requires-python = ">=3.12,<3.13"
dependencies = [
    "fastapi==0.162.0",
    "uvicorn==0.54.0",
    "pydantic==2.14.1",
    "pydantic-settings==2.16.1",
    "PyJWT==2.15.1",
    "grpcio==1.85.0",
    "protobuf==7.36.2",
]

[dependency-groups]
dev = [
    "grpcio-tools==1.85.0",
    "httpx==0.28.1",
]

[tool.setuptools.packages.find]
where = ["src"]
```

- [ ] **Step 3: Create `.gitignore` to keep local environments and caches untracked**

File: `src/services/Blocks.KnowledgeHubService/.gitignore`
Content:
```text
.venv/
__pycache__/
*.pyc
*.egg-info/
build/
dist/
.pytest_cache/
.env
*.pem
*.key
```

- [ ] **Step 4: Create package marker files**

File: `src/services/Blocks.KnowledgeHubService/src/knowledgehub/__init__.py`
Content:
```python
"""KnowledgeHub core package."""

__version__ = "0.1.0"
```

File: `src/services/Blocks.KnowledgeHubService/tests/__init__.py`
Content:
```python
"""KnowledgeHub test suite."""
```

- [ ] **Step 5: Run `uv lock` and `uv sync` to generate `uv.lock` and `.venv`**

Run in PowerShell:
```powershell
uv lock --project src/services/Blocks.KnowledgeHubService --python 3.12.14
uv sync --project src/services/Blocks.KnowledgeHubService --python 3.12.14
```
Expected: `uv.lock` generated, `.venv` created, dependencies installed cleanly.

- [ ] **Step 6: Verify package importability**

Run in PowerShell:
```powershell
uv run --project src/services/Blocks.KnowledgeHubService python -c "import knowledgehub; print(knowledgehub.__version__)"
```
Expected: `0.1.0`

---

### Task 2: Protobuf Python Stubs Generation

**Files:**
- Create: `src/services/Blocks.KnowledgeHubService/src/knowledgehub/rpc/__init__.py`
- Create: `src/services/Blocks.KnowledgeHubService/src/knowledgehub/rpc/system_pb2.py` (generated)
- Create: `src/services/Blocks.KnowledgeHubService/src/knowledgehub/rpc/system_pb2_grpc.py` (generated)
- Test: `src/services/Blocks.KnowledgeHubService/tests/test_proto_stubs.py`

**Interfaces:**
- Consumes: Canonical proto file `src/services/Blocks.SystemService/Protos/system.proto`.
- Produces: `system_pb2.CheckPermissionRequest`, `system_pb2.CheckActionResponse`, `system_pb2_grpc.SystemProtoStub`.

- [ ] **Step 1: Write test verifying import and instantiation of generated stubs**

File: `src/services/Blocks.KnowledgeHubService/tests/test_proto_stubs.py`
```python
import unittest

class TestProtoStubs(unittest.TestCase):
    def test_stub_imports_and_request_structure(self):
        from knowledgehub.rpc import system_pb2, system_pb2_grpc
        req = system_pb2.CheckPermissionRequest(
            user_id="11111111-1111-1111-1111-111111111111",
            controller="knowledgehub",
            action=1,
        )
        self.assertEqual(req.user_id, "11111111-1111-1111-1111-111111111111")
        self.assertEqual(req.controller, "knowledgehub")
        self.assertEqual(req.action, 1)

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run test to verify it fails before code generation**

Run in PowerShell:
```powershell
uv run --project src/services/Blocks.KnowledgeHubService python -m unittest src/services/Blocks.KnowledgeHubService/tests/test_proto_stubs.py -v
```
Expected: FAIL (ModuleNotFoundError: No module named 'knowledgehub.rpc')

- [ ] **Step 3: Create package directory and compile protobuf stubs**

Create empty file: `src/services/Blocks.KnowledgeHubService/src/knowledgehub/rpc/__init__.py`

Run compilation in PowerShell:
```powershell
uv run --locked --project src/services/Blocks.KnowledgeHubService python -m grpc_tools.protoc -Iknowledgehub/rpc=src/services/Blocks.SystemService/Protos --python_out=src/services/Blocks.KnowledgeHubService/src --grpc_python_out=src/services/Blocks.KnowledgeHubService/src knowledgehub/rpc/system.proto
```

Virtual include mapping must generate package-qualified imports automatically.
Do not manually change generated sources. Run generation twice; the second run
must leave no diff. Import the stubs with development tools unavailable to prove
runtime does not require `grpc_tools`. The generator's protobuf version need not
equal the compatible runtime version; do not change dependency pins to force that.

- [ ] **Step 4: Run test to verify stub compilation and import pass**

Run in PowerShell:
```powershell
uv run --project src/services/Blocks.KnowledgeHubService python -m unittest src/services/Blocks.KnowledgeHubService/tests/test_proto_stubs.py -v
```
Expected: PASS

---

### Task 3: Validated Configuration with Pydantic Settings

**Files:**
- Create: `src/services/Blocks.KnowledgeHubService/src/knowledgehub/config.py`
- Test: `src/services/Blocks.KnowledgeHubService/tests/test_config.py`

**Interfaces:**
- Produces: `Settings` class with fields:
  - `jwt_key: SecretStr` (at least 32 UTF-8 bytes, not whitespace-only)
  - `jwt_issuer: str` (non-empty)
  - `jwt_audience: str` (non-empty)
  - `system_grpc_url: str` (HTTPS URL with host and port)
  - `system_grpc_ca_file: Path` (required readable absolute public PEM path)
  - `permission_timeout_seconds: float = 3.0` (positive, max 30)

- [ ] **Step 1: Write tests for configuration validation**

File: `src/services/Blocks.KnowledgeHubService/tests/test_config.py`.
Use `unittest`, `tempfile`, and `patch.dict`; supply a temporary public test PEM,
fake issuer/audience/key, and `_env_file=None` for every normal settings test.
Use subtests for the following named checks and assertions:

| Test | Required assertions |
| --- | --- |
| `test_valid_configuration` | `.jwt_key.get_secret_value()` equals fake input; timeout defaults to `3.0`; a configured `5.0` is preserved. |
| `test_invalid_configuration_rejected` | `ValidationError` for missing/short/whitespace-only key, empty issuer/audience, `http://localhost:1`, absent port, credentials, query, fragment, non-root path, missing/relative/unreadable CA, timeout `0`, `-1`, `30.1`, NaN, infinity. |
| `test_key_length_uses_utf8_bytes` | A non-whitespace key with 32 UTF-8 bytes passes; one with 31 fails, regardless of character count. |
| `test_invalid_key_diagnostics_hide_input` | `str(error)` and captured startup diagnostics exclude a synthetic weak-key marker and raw inputs, but identify `jwt_key`. |
| `test_dotenv_loads_local_key` | `Settings(_env_file=temporary_env, ...)` resolves only fake dotenv key without depending on CWD. Never read real `.env`. |
| `test_environment_overrides_dotenv` | With distinct fake values, environment key wins; `_env_file=None` ignores the fixture and fails if no key is supplied. |

Do not weaken required CA validation to preserve old tests that omitted the CA.

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run --project src/services/Blocks.KnowledgeHubService python -m unittest src/services/Blocks.KnowledgeHubService/tests/test_config.py -v`
Expected on the current implementation: new source-isolation/security assertions
FAIL. Initial implementation would fail with missing `knowledgehub.config`.

- [ ] **Step 3: Implement `Settings` in `src/knowledgehub/config.py`**

File: `src/services/Blocks.KnowledgeHubService/src/knowledgehub/config.py`
Implement `Settings(BaseSettings)` using `pydantic-settings`:
- `ENV_PATH = Path(__file__).resolve().parents[2] / ".env"` and settings config
  with `env_prefix="KNOWLEDGEHUB_"`, UTF-8 `env_file=ENV_PATH`,
  `hide_input_in_errors=True`. Do not dump `.errors()`, settings, or raw values.
- Validate key byte length, nonempty issuer/audience, finite timeout `(0,30]`,
  HTTPS-only URI with host and explicit port `1..65535`, no credentials/query/
  fragment/non-root path; require a readable absolute public PEM CA file.
- Dotenv loading does not supply fallback keys or relax validation. The owner
  creates the ignored file locally; no command here writes a real credential.
- All other Python tests must pass fake settings with `_env_file=None` and a
  temporary public CA fixture after the stricter settings contract is applied.

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run --project src/services/Blocks.KnowledgeHubService python -m unittest src/services/Blocks.KnowledgeHubService/tests/test_config.py -v`
Expected: PASS

---

### Task 4: Standard Response Envelopes & Exception Normalization

**Files:**
- Create: `src/services/Blocks.KnowledgeHubService/src/knowledgehub/responses.py`
- Test: `src/services/Blocks.KnowledgeHubService/tests/test_responses.py`

**Interfaces:**
- Produces:
  - `ApiResponse(BaseModel, Generic[T])`: fields `Success: bool`, `StatusCode: int`, `Data: T | None = None`, `Message: str | None = None`.
  - `success_response(data: T, message: str | None = None) -> JSONResponse`: HTTP 200 with `{ "Success": true, "StatusCode": 200, "Data": data, "Message": message }`.
  - `error_response(status_code: int, message: str) -> JSONResponse`: HTTP 200 with `{ "Success": false, "StatusCode": status_code, "Data": None, "Message": message }`.
  - `setup_exception_handlers(app: FastAPI) -> None`: validation/404/405 use HTTP 200 application envelopes; unexpected exceptions use HTTP 500 and a safe 500 envelope.

- [ ] **Step 1: Write tests for standard envelopes**

File: `src/services/Blocks.KnowledgeHubService/tests/test_responses.py`
```python
import json
import unittest
from knowledgehub.responses import ApiResponse, success_response, error_response

class TestResponses(unittest.TestCase):
    def test_success_envelope_serialization(self):
        resp = success_response(data={"ActorId": "test-guid"})
        self.assertEqual(resp.status_code, 200)
        body = json.loads(resp.body.decode())
        self.assertTrue(body["Success"])
        self.assertEqual(body["StatusCode"], 200)
        self.assertEqual(body["Data"]["ActorId"], "test-guid")
        self.assertIsNone(body["Message"])

    def test_error_envelope_serialization_http200_contract(self):
        resp = error_response(status_code=401, message="Xác thực không thành công")
        self.assertEqual(resp.status_code, 200)
        body = json.loads(resp.body.decode())
        self.assertFalse(body["Success"])
        self.assertEqual(body["StatusCode"], 401)
        self.assertIsNone(body["Data"])
        self.assertEqual(body["Message"], "Xác thực không thành công")

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 1b: Add handler assertions, not only response-helper assertions**

In `test_responses.py`, create test-only validation/failure routes on an isolated
FastAPI instance using production `setup_exception_handlers`.
Use `ASGITransport(..., raise_app_exceptions=False)`:
`test_validation_envelope` asserts HTTP 200/application 400;
`test_not_found_and_method_envelopes` asserts HTTP 200/application 404 or 405;
`test_unexpected_error_uses_http500` asserts HTTP 500/application 500.
Each body has exactly `Success`, `StatusCode`, `Data`, `Message`, `Data is None`
on errors, and excludes a synthetic internal-error marker.

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run --project src/services/Blocks.KnowledgeHubService python -m unittest src/services/Blocks.KnowledgeHubService/tests/test_responses.py -v`
Expected: FAIL

- [ ] **Step 3: Implement `src/knowledgehub/responses.py`**

Keep `error_response` for ordinary HTTP 200 application errors. In the unexpected
exception handler, return a `JSONResponse` with real HTTP 500 and the same safe
500 envelope, message "Đã xảy ra lỗi hệ thống". Never forward raw exception details.

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run --project src/services/Blocks.KnowledgeHubService python -m unittest src/services/Blocks.KnowledgeHubService/tests/test_responses.py -v`
Expected: PASS

---

### Task 5: JWT Authentication Module

**Files:**
- Create: `src/services/Blocks.KnowledgeHubService/src/knowledgehub/identity.py`
- Test: `src/services/Blocks.KnowledgeHubService/tests/test_identity.py`

**Interfaces:**
- Consumes: `Settings` from `knowledgehub.config`.
- Produces:
  - `AuthenticatedUser(BaseModel)`: fields `actor_id: UUID`, `username: str`, `token: str`.
  - `verify_jwt_token(token: str, settings: Settings) -> AuthenticatedUser`: validates HS256, issuer, audience, zero clock skew, extracts GUID from claim `name`.
  - `get_current_user(...) -> AuthenticatedUser`: FastAPI dependency reading `Authorization: Bearer <token>`.

- [ ] **Step 1: Write unit tests covering JWT validation, edge cases, and attack classes**

File: `src/services/Blocks.KnowledgeHubService/tests/test_identity.py`
Cover:
1. Valid token -> returns `actor_id` matching `name` claim.
2. Expired token (`exp < now`) with 0 skew -> raises authentication error (401).
3. Invalid signature (signed with different key) -> raises 401.
4. Algorithm confusion (`alg: none` or RSA) -> rejected (401).
5. Wrong issuer or audience -> raises 401.
6. Missing claim `name` or non-GUID `name` -> raises 401.
7. Future `nbf` claim -> raises 401.
8. Missing `exp`, numeric-string/non-numeric/non-finite/bool `exp`, missing/empty/
   all-zero `name` -> raises 401. Finite JSON numeric expiry is required.
9. All invalid-token paths use a safe Vietnamese message, not `"Invalid token"`.

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run --project src/services/Blocks.KnowledgeHubService python -m unittest src/services/Blocks.KnowledgeHubService/tests/test_identity.py -v`
Expected: FAIL

- [ ] **Step 3: Implement `verify_jwt_token` and `get_current_user` in `src/knowledgehub/identity.py`**

Use `jwt.decode(token, key, algorithms=["HS256"], issuer=..., audience=..., leeway=0, options={"require": ["exp"]})`.
Extract `uuid.UUID(payload["name"])`. If parsing fails, raise authentication exception.
Reject zero GUID and non-numeric/non-finite/bool expiry even if the JWT library
coerces that input. Use the same safe Vietnamese 401 message for signature,
issuer, audience, expiry, and actor failures. No production token issuer.

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run --project src/services/Blocks.KnowledgeHubService python -m unittest src/services/Blocks.KnowledgeHubService/tests/test_identity.py -v`
Expected: PASS

---

### Task 6: SystemService gRPC Permission Client

**Files:**
- Create: `src/services/Blocks.KnowledgeHubService/src/knowledgehub/permission.py`
- Test: `src/services/Blocks.KnowledgeHubService/tests/test_permission.py`

**Interfaces:**
- Consumes: `AuthenticatedUser`, `Settings`, `system_pb2_grpc.SystemProtoStub`.
- Produces:
  - `PermissionClient`:
    - `async check_permission(user: AuthenticatedUser, controller: str, action: int) -> bool`
    - `async check_channel_health() -> bool`
    - `async close() -> None`
  - `get_permission_client(request: Request) -> PermissionClient`: reads the
    lifespan-owned `request.app.state.permission_client`, no process-global client.
  - `require_permission(controller: str, action: int)`: FastAPI dependency chaining after `get_current_user`.

- [ ] **Step 1: Write unit tests for `PermissionClient` with mocked gRPC channel**

File: `src/services/Blocks.KnowledgeHubService/tests/test_permission.py`
Cover:
1. RPC returns `success=True` -> `check_permission` returns `True`.
2. RPC returns `success=False` -> `check_permission` returns `False` (maps to 403 in dependency).
3. RPC metadata verification: asserts metadata tuple contains `("x-service-authorization", f"Bearer {user.token}")`.
4. Python `grpc.RpcError` with `UNAVAILABLE` or `DEADLINE_EXCEEDED` -> 503.
5. `UNAUTHENTICATED` -> 401; `PERMISSION_DENIED` -> 403; `INTERNAL` and other unexpected RPC statuses -> safe 503, not 500.
6. `test_deadline_and_no_retry` asserts one awaited RPC and `timeout=3.0`.
7. `test_cancellation_propagates` asserts `CancelledError` is not turned into an
   envelope/retry; `test_concurrent_metadata_isolated` sends two actors/tokens and
   asserts each captured `(user_id, metadata)` pair matches its own request.
8. `test_close_owned_channel` asserts owned channel closes once. TLS factory
   assertions verify supplied CA bytes and no insecure or hostname-override option.

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run --project src/services/Blocks.KnowledgeHubService python -m unittest src/services/Blocks.KnowledgeHubService/tests/test_permission.py -v`
Expected: FAIL

- [ ] **Step 3: Implement `PermissionClient` and dependency in `src/knowledgehub/permission.py`**

File: `src/services/Blocks.KnowledgeHubService/src/knowledgehub/permission.py`
- Create `grpc.aio.secure_channel` using root certificates read from `settings.system_grpc_ca_file`. Insecure channel fallback or certificate verification bypass is strictly forbidden.
- `metadata = (("x-service-authorization", f"Bearer {user.token}"),)`
- `stub.CheckPermission(req, metadata=metadata, timeout=settings.permission_timeout_seconds)`
- Implement exact mappings above; propagate cancellation, never cache grants or retry.

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run --project src/services/Blocks.KnowledgeHubService python -m unittest src/services/Blocks.KnowledgeHubService/tests/test_permission.py -v`
Expected: PASS

---

### Task 7: FastAPI App, Lifespan, Health & Identity Endpoints

**Files:**
- Create: `src/services/Blocks.KnowledgeHubService/src/knowledgehub/main.py`
- Test: `src/services/Blocks.KnowledgeHubService/tests/test_endpoints.py`

**Interfaces:**
- Produces:
  - `app`: FastAPI ASGI application instance.
  - `GET /alive`: returns `{ "status": "alive" }` HTTP 200.
  - `GET /health`: checks gRPC channel readiness, returns HTTP 200 or HTTP 503.
  - `GET /api/knowledgehub/identity`: protected endpoint requiring valid JWT and `CheckPermission("knowledgehub", 1)`. Returns `{ "Success": true, "StatusCode": 200, "Data": { "ActorId": "..." }, "Message": null }`.

- [ ] **Step 1: Write integration tests for API endpoints**

File: `src/services/Blocks.KnowledgeHubService/tests/test_endpoints.py`
Use `httpx.AsyncClient` with `ASGITransport(app=app)`:
1. `GET /alive` -> HTTP 200.
2. `GET /health` with mocked healthy gRPC channel -> HTTP 200.
3. `GET /health` with mocked failed gRPC channel -> HTTP 503.
4. `GET /api/knowledgehub/identity` without token -> HTTP 200 with `StatusCode: 401`.
5. `GET /api/knowledgehub/identity` with valid token and permission granted -> HTTP 200 with `StatusCode: 200, Data.ActorId`.
6. `GET /api/knowledgehub/identity` with valid token but permission denied -> HTTP 200 with `StatusCode: 403`.
7. `test_invalid_tokens_never_call_permission`: malformed/missing/expired tokens
   produce application 401 and `mock_client.check_permission.assert_not_awaited()`.
8. `test_actor_input_cannot_override_claim`: forged actor/controller/action query
   inputs cannot change the verified actor or fixed RPC `knowledgehub`, action `1`.
9. `test_lifespan_closes_on_error_and_recreates_client`: two lifespan entries
   produce distinct clients; each closes, including when the context raises.
10. `test_health_outage_recovery`: isolated channel readiness changes false/true;
    health changes HTTP 503/200, liveness remains 200, no permission RPC is used.
11. `/docs`, `/redoc`, `/openapi.json` remain unavailable.

`ASGITransport` does not run lifespan automatically. For lifespan tests enter
`async with app.router.lifespan_context(app)` and patch only construction of the
external client with a fake; restore overrides/state after each test.

- [ ] **Step 2: Run test to verify it fails**

Run: `uv run --project src/services/Blocks.KnowledgeHubService python -m unittest src/services/Blocks.KnowledgeHubService/tests/test_endpoints.py -v`
Expected: FAIL

- [ ] **Step 3: Implement `src/knowledgehub/main.py`**

File: `src/services/Blocks.KnowledgeHubService/src/knowledgehub/main.py`
- Lifespan creates `PermissionClient(get_settings())` on the running event loop,
  stores it in `app.state.permission_client`, and closes/removes it in `finally`.
  Remove `_client_instance` caching from `permission.py`; repeated lifespans
  must not reuse a closed channel. Settings cache may remain if tests clear it.
- Include `GET /alive`, `GET /health`, and router `/api/knowledgehub`.
- Register standard exception handlers from `knowledgehub.responses`.
- Set `docs_url=None, redoc_url=None, openapi_url=None` for security hardening.

- [ ] **Step 4: Run test to verify it passes**

Run: `uv run --project src/services/Blocks.KnowledgeHubService python -m unittest src/services/Blocks.KnowledgeHubService/tests/test_endpoints.py -v`
Expected: PASS

- [ ] **Step 5: Run full DB-free test suite**

Run in PowerShell:
```powershell
uv run --locked --project src/services/Blocks.KnowledgeHubService python -m unittest discover -s src/services/Blocks.KnowledgeHubService/tests -v
```
Expected: All tests PASS.
If the opt-in Gateway artifact is absent, that integration group reports NOT RUN
and does not establish P01-08 acceptance; run Task 9 with the explicit artifact.

---

### Task 8: Gateway Reverse Proxy Route Configuration

**Files:**
- Modify: `src/services/Blocks.ApiGateway/appsettings.json`


**Interfaces:**
- Consumes: KnowledgeHub FastAPI service endpoint.
- Produces: Route `knowledgehub-route` forwarding `/api/knowledgehub/{**catch-all}` to `knowledgehub-cluster`.

- [ ] **Step 1: Add KnowledgeHub route to checked-in `appsettings.json`**

File: `src/services/Blocks.ApiGateway/appsettings.json`
Add `ReverseProxy` section with `knowledgehub-route`:
```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "AllowedHosts": "*",
  "ReverseProxy": {
    "Routes": {
      "knowledgehub-route": {
        "ClusterId": "knowledgehub-cluster",
        "Match": {
          "Path": "/api/knowledgehub/{**catch-all}"
        }
      }
    },
    "Clusters": {
      "knowledgehub-cluster": {}
    }
  }
}
```

- [ ] **Step 2: Inspect ignored `appsettings.Development.json` to ensure no conflicting KnowledgeHub overrides**

Do NOT add a hardcoded `localhost:8000` destination. Destination addresses are dynamically injected by AppHost via environment variables. Ensure no stale KnowledgeHub route exists in the local development file.

- [ ] **Step 3: Run existing FileService Gateway boundary regression checks**

Run in PowerShell:
```powershell
dotnet run --project test/FileService.RemovalChecks -- gateway
dotnet run --project test/FileService.RemovalChecks -- boundary
```
Expected: All checks PASS (proves FileServiceBoundary is not broken by the new route).

---

### Task 9: Real Gateway, FastAPI, And Isolated Permission RPC

**Files:**
- Create: `src/services/Blocks.KnowledgeHubService/tests/test_gateway_forwarding.py`

**Interfaces:**
- Consumes: absolute `KNOWLEDGEHUB_TEST_GATEWAY_DLL` pointing to a prebuilt
  production Gateway DLL; production FastAPI `knowledgehub.main:app`;
  generated RPC server stubs; fake JWT keys/tokens and a localhost TLS fixture.
- Produces: DB-free forwarding/authentication/permission/transport evidence
  for P01-08. This is not a live SystemService check.

- [ ] **Step 1: Write Gateway forwarding test using live ephemeral listener**

File: `src/services/Blocks.KnowledgeHubService/tests/test_gateway_forwarding.py`
Replace `BaseHTTPRequestHandler` and hardcoded success JSON with the real
FastAPI app running under Uvicorn on an owned ephemeral localhost socket.
Use an isolated `grpc.aio` server implementing generated `SystemProtoServicer`;
it records `(user_id, controller, action, metadata)` and returns allow/deny
according to fake actor IDs. Bind with a test-only localhost certificate/key,
not the owner's CA or SystemService credentials. Supply that public CA and fake
settings explicitly to the child; override the real dotenv source in the test
composition, without a production `AUTH_DISABLED` or fake-mode flag.

Start the real Gateway in Production, loading checked-in route config.
Set `FileProxy:ClusterId=test-file-cluster` and inject the fixture destination;
never overwrite unrelated live configuration. Missing artifact/runtime is
`unittest.SkipTest` with an explicit NOT RUN reason, not an automatic build.
Record subprocess cleanup immediately (`addClassCleanup`/`try/finally`), bound
startup/readiness with a real deadline, and do not block on `stdout.readline()`.
Use only owned processes/ports; wait after terminate/kill and close listeners.

| Test | Assertions |
| --- | --- |
| `test_gateway_allows_verified_actor` | HTTP 200, exact success envelope/actor; RPC receives authenticated actor, `knowledgehub`, `1`, exact bearer metadata. Full-prefix route must work. |
| `test_gateway_rejects_invalid_token` | HTTP 200/application 401; zero permission RPCs. |
| `test_gateway_denies_missing_view` | HTTP 200/application 403, `Data is None`; one matching RPC. |
| `test_gateway_backend_down_is_transport_failure` | Stop only owned Python backend; next request has genuine non-2xx transport status (for example 502/503), not an application-success envelope. |

- [ ] **Step 2: Run test to verify forwarding behavior**

Run in PowerShell:
```powershell
dotnet build src/services/Blocks.ApiGateway/Blocks.ApiGateway.csproj
$env:KNOWLEDGEHUB_TEST_GATEWAY_DLL = (Resolve-Path src/services/Blocks.ApiGateway/bin/Debug/net10.0/Blocks.ApiGateway.dll).Path
try {
    uv run --locked --project src/services/Blocks.KnowledgeHubService python -m unittest discover -s src/services/Blocks.KnowledgeHubService/tests -p test_gateway_forwarding.py -v
} finally {
    Remove-Item Env:KNOWLEDGEHUB_TEST_GATEWAY_DLL -ErrorAction SilentlyContinue
}
```
Expected after the owner replaces the harness: four checks PASS, no skipped
artifact check. A skipped artifact check remains NOT RUN.

---

### Task 10: Aspire AppHost Python Integration

**Files:**
- Modify: `src/platform/Blocks.AppHost/Blocks.AppHost.csproj`
- Modify: `src/platform/Blocks.AppHost/AppHost.cs`
- Modify: `test/Backend.Upgrade.Check.ps1`
- Owner-only local setup: ignored `src/services/Blocks.KnowledgeHubService/.env`

**Interfaces:**
- Consumes: Python package at `../../services/Blocks.KnowledgeHubService`.
- Produces: Managed resource `knowledgehubservice` running uvicorn on a dynamically assigned port, wired to Gateway.

- [ ] **Step 1: Add `Aspire.Hosting.Python` package to `Blocks.AppHost.csproj`**

File: `src/platform/Blocks.AppHost/Blocks.AppHost.csproj`
Add PackageReference:
```xml
    <PackageReference Include="Aspire.Hosting.Python" Version="13.6.3" />
```

- [ ] **Step 2: Register KnowledgeHub service in `AppHost.cs`**

File: `src/platform/Blocks.AppHost/AppHost.cs`
Update `AppHost.cs`:
```csharp
var knowledgeHub = builder.AddUvicornApp(
        "knowledgehubservice",
        "../../services/Blocks.KnowledgeHubService",
        "knowledgehub.main:app")
    .WithUv(args: ["sync", "--locked", "--python", "3.12.14", "--no-python-downloads"])
    .WithVirtualEnvironment(".venv", createIfNotExists: false)
    .WithEnvironment("KNOWLEDGEHUB_JWT_ISSUER", builder.AddParameter("knowledgehub-jwt-issuer"))
    .WithEnvironment("KNOWLEDGEHUB_JWT_AUDIENCE", builder.AddParameter("knowledgehub-jwt-audience"))
    .WithEnvironment("KNOWLEDGEHUB_SYSTEM_GRPC_URL", systemService.GetEndpoint("https"))
    .WithEnvironment("KNOWLEDGEHUB_SYSTEM_GRPC_CA_FILE", builder.AddParameter("knowledgehub-grpc-ca-file"))
    .WithEnvironment("KNOWLEDGEHUB_PERMISSION_TIMEOUT_SECONDS", "3.0");

var gateway = builder.AddProject<Projects.Blocks_ApiGateway>("ApiGateway")
    .WithReference(systemService)
    .WithReference(catalogService)
    .WithReference(fileService)
    .WithReference(knowledgeHub)
    .WithEnvironment("ReverseProxy__Clusters__knowledgehub-cluster__Destinations__destination1__Address", knowledgeHub.GetEndpoint("http"));
```

The owner supplies matching issuer/audience and an absolute public CA path
through AppHost local configuration, not guessed string defaults. Do not change
SystemService credentials. Python reads the local JWT key from its ignored
service `.env`; no AppHost key parameter is required under the amendment.
Verify exclusion without reading it:

```powershell
git check-ignore src/services/Blocks.KnowledgeHubService/.env
git ls-files -- src/services/Blocks.KnowledgeHubService/.env
```

Expected: first command names the ignored file; second prints nothing.
Keep local file access restricted; never put the key into command arguments/history.

- [ ] **Step 3: Update `test/Backend.Upgrade.Check.ps1` AppHost expected pins**

Add `'Aspire.Hosting.Python' = '13.6.3'` to both AppHost expected-pin tables
in `Run-PackagesChecks` and `Run-AppHostChecks`. Preserve exactly four .NET
ProjectReferences/AddProject calls, mutual File/System references, Web port 5173,
and the existing no-`WaitFor` assertions.

- [ ] **Step 4: Build AppHost and run Backend Upgrade regression checks**

Run in PowerShell:
```powershell
dotnet build src/platform/Blocks.AppHost/Blocks.AppHost.csproj
& ./test/Backend.Upgrade.Check.ps1 -Check all
```
Expected: Build succeeds, all regression assertions PASS.

---

### Task 11: Administration Menu & Role Permission Setup (Manual UI)

**Files:**
- Record: Notes/snapshot in outcome document.

**Interfaces:**
- Consumes: Blocks Web application at `http://localhost:5173`.
- Produces: System database record for menu `knowledgehub` with VIEW action enabled, assigned to target test role.

- [x] **Step 1: Start platform services via AppHost**

Run in PowerShell:
```powershell
dotnet run --project src/platform/Blocks.AppHost/Blocks.AppHost.csproj
```
Use the dashboard URL printed by this AppHost run, not an assumed port.
Verify existing resources and Python; record actual endpoints without tokens.

- [x] **Step 2: Log in as administrator on web UI (`http://localhost:5173`)**

Navigate to **Hệ thống** -> **Menu** (`/menu`).

- [x] **Step 3: Inspect/reuse or create the minimum `knowledgehub` Menu record**

Before mutation, select existing group/role/non-admin test accounts and snapshot
relevant non-secret menu/permission fields. Reuse a matching active controller
record; do not duplicate it or clear existing unrelated grants. Only if absent,
use **Thêm mới Menu**:
- Tên Menu: `KnowledgeHub`
- Controller: `knowledgehub` (lowercase)
- Nhóm quyền: Chọn nhóm hệ thống phù hợp
- Hiển thị Menu: **Bỏ chọn** (`IsShowMenu = false` to keep hidden until P02)
- Phân quyền: Chọn checkbox **Xem** (`CanView=true`). New P01 record needs no other actions; preserve unrelated values on existing records.
Click **Lưu**.

- [x] **Step 4: Grant `knowledgehub` VIEW to test role**

Navigate to **Hệ thống** -> **Vai trò** (`/role`).
Select the role of your designated test account, click **Cập nhật phân quyền**:
- Locate menu `KnowledgeHub`
- Check **Xem** (`IsViewed = true`)
Click **Lưu**.
The form submits a full permission list: compare before/after to preserve other
menu grants. Reauthenticate using the existing login/refresh flow. Identify a
second existing suitable denied account; absence is a blocker, not authorization
to create accounts/roles or revoke someone else's rights.

- [x] **Step 5: Verify hidden-menu behavior**

Record that `IsShowMenu=false` still permits VIEW assignment/checking and creates
no dead navigation link. If hidden records cannot be assigned/checked, report
the blocker; no fake page, frontend workaround, or direct SQL mutation.

---

### Task 12: End-to-End Live Verification & Outcome Recording

**Files:**
- Create: `docs/knowledgehub/outcomes/P01.md`
- Modify: `docs/knowledgehub/README.md` (Update P01 status to `ACCEPTED` upon review)

**Interfaces:**
- Consumes: actual live Gateway endpoint discovered from the current AppHost run.
- Produces: Recorded PASS/FAIL evidence for P01-01 through P01-10.

- [x] **Step 1: Perform curl/API check with authorized test token**

Log in as the authorized test user through the existing web session flow; do not
assume tokens live in LocalStorage. Prompt privately for the token; never put it
into command history, logs, or outcome evidence. Discover the non-secret Gateway
URL from the current dashboard. Run in PowerShell:
```powershell
$gatewayUrl = Read-Host "Gateway URL from current AppHost dashboard"
$token = Read-Host "Access token" -AsSecureString
$bstr = [IntPtr]::Zero
try {
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($token)
    $rawToken = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    $response = Invoke-WebRequest -Uri "$($gatewayUrl.TrimEnd('/'))/api/knowledgehub/identity" -Headers @{ Authorization = "Bearer $rawToken" }
    $response.StatusCode
    $response.Content
} finally {
    if ($bstr -ne [IntPtr]::Zero) {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
    Remove-Variable rawToken, token -ErrorAction SilentlyContinue
}
```
Expected output:
```json
{
  "Success": true,
  "StatusCode": 200,
  "Data": {
    "ActorId": "<test-user-guid>"
  },
  "Message": null
}
```

- [x] **Step 2: Perform curl/API check with unauthorized account**

Log in as an account belonging to a role without `knowledgehub` VIEW grant.
Repeat the secure prompt/request above with that account's real token. Do not
revoke grants to manufacture denial. Capture HTTP status and safe response body.
Expected output:
```json
{
  "Success": false,
  "StatusCode": 403,
  "Data": null,
  "Message": "Bạn không có quyền truy cập"
}
```

- [x] **Step 2b: Verify expired-token behavior**

A real expired SystemService token must return HTTP 200/application 401, without
client refresh hiding that response. Do not mint a replacement user token.

- [x] **Step 3: Stop AppHost and verify clean termination**

Before stopping, record IDs/parent IDs for the AppHost-owned uv/Python/reloader
process tree and its assigned ports; capture no environment or token-bearing
command lines. Press `Ctrl+C`. Verify those IDs exited and owned listeners closed,
then restart AppHost and confirm fresh Python startup without port conflicts.
Do not require unrelated Python processes to exit or kill them.

- [x] **Step 4: Create P01 outcome record**

File: `docs/knowledgehub/outcomes/P01.md`
Record evidence matching the template:
- Spec: `docs/superpowers/specs/2026-10-27-knowledgehub-p01-runtime-gateway-identity-design.md`
- Implemented tasks: Tasks 1-12.
- PASS/FAIL/NOT RUN check table.
- Owner explanation of the flow from Gateway through JWT validation and gRPC CheckPermission.

Historical checkmarks above are preserved, but missing live evidence is NOT RUN.
Mark P01 `ACCEPTED` only after the outcome's open findings and required
P01-01 through P01-10 gates have evidence. A 401 response alone proves neither
permission setup nor a successful TLS/RPC call.
