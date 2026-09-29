from __future__ import annotations

import logging
from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine

from tradelab_api.db.ownership import (
    PRIVATE_TABLES,
    CREDENTIAL_ROOT_TABLES,
)

logger = logging.getLogger(__name__)


def migrate_ownership_schema(connection: Connection) -> None:
    """Idempotently migrate PostgreSQL database to support workspace ownership."""
    # 1. Add workspace_id to all 37 private tables
    for table_name in PRIVATE_TABLES:
        connection.execute(text(
            f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS workspace_id UUID NULL;"
        ))
        connection.execute(text(
            f"CREATE INDEX IF NOT EXISTS idx_{table_name}_workspace_id ON {table_name}(workspace_id);"
        ))

    # 2. Add owner_user_id to credential root tables
    for table_name in CREDENTIAL_ROOT_TABLES:
        connection.execute(text(
            f"ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS owner_user_id UUID NULL;"
        ))
        connection.execute(text(
            f"CREATE INDEX IF NOT EXISTS idx_{table_name}_owner_user_id ON {table_name}(owner_user_id);"
        ))

    # 3. Migrate slug unique constraints on strategy and strategy_group
    # Drop global unique constraints and indexes if present in PostgreSQL catalog
    for table_name in ("strategy", "strategy_group"):
        connection.execute(text(f"DROP INDEX IF EXISTS idx_{table_name}_slug;"))
        # Drop constraint if exists
        connection.execute(text(f"""
            DO $$
            DECLARE
                r RECORD;
            BEGIN
                FOR r IN (
                    SELECT conname
                    FROM pg_constraint
                    WHERE conrelid = '{table_name}'::regclass
                      AND contype = 'u'
                      AND conname LIKE '%slug%'
                      AND conname NOT LIKE '%workspace%'
                ) LOOP
                    EXECUTE 'ALTER TABLE {table_name} DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
                END LOOP;
            END $$;
        """))

        # Add workspace-scoped unique constraint if not exists
        scoped_conname = f"uq_{table_name}_workspace_slug"
        connection.execute(text(f"""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint
                    WHERE conrelid = '{table_name}'::regclass AND conname = '{scoped_conname}'
                ) THEN
                    ALTER TABLE {table_name} ADD CONSTRAINT {scoped_conname} UNIQUE (workspace_id, slug);
                END IF;
            END $$;
        """))


def run_ownership_migration(engine: Engine) -> None:
    with engine.begin() as conn:
        migrate_ownership_schema(conn)
    logger.info("Ownership schema migration applied successfully.")
