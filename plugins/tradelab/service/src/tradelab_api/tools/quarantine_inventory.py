from __future__ import annotations

from collections.abc import Callable
from contextlib import AbstractContextManager
import os
import sys

from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from tradelab_api.db.ownership import PRIVATE_TABLES
from tradelab_api.db.session import SessionLocal

InventoryRow = dict[str, str | int | None]
Inventory = dict[str, InventoryRow]
SessionFactory = Callable[[], AbstractContextManager[Session]]


def _default_session_factory() -> AbstractContextManager[Session]:
    database_url = os.environ["TRADELAB_QUARANTINE_INVENTORY_DATABASE_URL"]
    return SessionLocal(bind=create_engine(database_url, pool_pre_ping=True))


def scan_quarantine_inventory(*, session_factory: SessionFactory) -> Inventory:
    """Count quarantined private rows without modifying schema or application data."""
    inventory: Inventory = {}

    with session_factory() as session:
        for table_name in PRIVATE_TABLES:
            try:
                count = session.execute(
                    text(f"SELECT COUNT(*) FROM {table_name} WHERE workspace_id IS NULL;")
                ).scalar()
            except SQLAlchemyError as exc:
                session.rollback()
                inventory[table_name] = {
                    "status": "error",
                    "quarantined_count": None,
                    "error": str(exc),
                }
                continue

            inventory[table_name] = {
                "status": "ok",
                "quarantined_count": int(count or 0),
                "error": None,
            }

    return inventory


def exit_code_for_inventory(inventory: Inventory) -> int:
    if set(inventory) != set(PRIVATE_TABLES):
        return 1
    return 1 if any(item["status"] != "ok" for item in inventory.values()) else 0


def format_inventory(inventory: Inventory) -> str:
    lines = ["=== TradeLab Legacy Quarantine Inventory (Part 01) ==="]
    total_quarantined = 0

    for table_name in PRIVATE_TABLES:
        item = inventory.get(table_name)
        if item is None:
            lines.append(f"{table_name}: ERROR missing inventory entry")
            continue
        if item["status"] != "ok":
            lines.append(f"{table_name}: ERROR {item['error']}")
            continue

        count = int(item["quarantined_count"] or 0)
        total_quarantined += count
        lines.append(f"{table_name}: {count}")

    lines.append(f"Total quarantined unowned records: {total_quarantined}")
    return "\n".join(lines)


def main() -> int:
    if not os.environ.get("TRADELAB_QUARANTINE_INVENTORY_DATABASE_URL"):
        print(
            "TRADELAB_QUARANTINE_INVENTORY_DATABASE_URL is required; refusing to use application default database.",
            file=sys.stderr,
        )
        return 2

    try:
        inventory = scan_quarantine_inventory(session_factory=_default_session_factory)
    except SQLAlchemyError as exc:
        print(f"Inventory scan failed: {exc}", file=sys.stderr)
        return 1

    print(format_inventory(inventory))
    return exit_code_for_inventory(inventory)


if __name__ == "__main__":
    raise SystemExit(main())
