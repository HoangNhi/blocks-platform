# Test-Only TLS Fixtures

These fixtures (`test_ca.pem`, `test_ca.key`) are test-only self-signed certificates with `CN=localhost` used exclusively by `tests/test_gateway_forwarding.py`.
They contain no real secrets or production credentials.

## Reproducible Generation Command

```bash
MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -nodes -keyout test_ca.key -out test_ca.pem -days 3650 -subj "/CN=localhost"
```
