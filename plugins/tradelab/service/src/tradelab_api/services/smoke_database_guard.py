from __future__ import annotations

from sqlalchemy.engine import make_url


def is_smoke_fixture_database_allowed(*, database_url: str, environment: str) -> bool:
    parsed = make_url(database_url)
    normalized_environment = environment.strip().lower()
    if parsed.drivername.startswith("sqlite"):
        return normalized_environment in {"test", "testing"}
    database_name = (parsed.database or "").lower()
    return database_name.endswith("_smoke")
