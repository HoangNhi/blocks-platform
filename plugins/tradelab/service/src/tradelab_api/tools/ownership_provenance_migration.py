import argparse
import os

from sqlalchemy import DateTime, inspect, text
from sqlalchemy.engine import Connection, Engine

from tradelab_api.db.models import Base, OwnershipProvenanceMixin
from tradelab_api.db.session import create_db_engine

PROVENANCE_TABLES = tuple(sorted(
    mapper.local_table.name for mapper in Base.registry.mappers
    if issubclass(mapper.class_, OwnershipProvenanceMixin)
))

def verify_ownership_provenance_schema(engine: Engine | Connection) -> None:
    inspector = inspect(engine)
    for table_name in PROVENANCE_TABLES:
        columns = {column["name"]: column for column in inspector.get_columns(table_name)}
        proof = columns.get("ownership_verified_at")
        if (
            proof is None or not proof["nullable"] or proof["default"] is not None
            or not isinstance(proof["type"], DateTime) or not proof["type"].timezone
        ):
            raise RuntimeError(f"Ownership provenance migration required for {table_name}.")

def migrate_ownership_provenance(connection: Connection) -> None:
    for table_name in PROVENANCE_TABLES:
        connection.execute(text(
            f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS ownership_verified_at TIMESTAMPTZ NULL"
        ))
    verify_ownership_provenance_schema(connection)

def main() -> None:
    parser = argparse.ArgumentParser(description="Explicit nullable provenance migration; no backfill.")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if not args.apply:
        for table_name in PROVENANCE_TABLES:
            print(f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS ownership_verified_at TIMESTAMPTZ NULL;")
        return
    database_url = os.environ.get("TRADELAB_PROVENANCE_MIGRATION_DATABASE_URL")
    if not database_url:
        parser.error("TRADELAB_PROVENANCE_MIGRATION_DATABASE_URL is required; no application DB fallback.")
    engine = create_db_engine(database_url)
    try:
        with engine.begin() as connection:
            migrate_ownership_provenance(connection)
    finally:
        engine.dispose()

if __name__ == "__main__":
    main()
