from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy.exc import OperationalError

from tradelab_api.db.ownership import PRIVATE_TABLES
from tradelab_api.tools.quarantine_inventory import (
    exit_code_for_inventory,
    format_inventory,
    main,
    scan_quarantine_inventory,
)


@dataclass
class FakeResult:
    count: int | None = None

    def scalar(self) -> int | None:
        return self.count


class FakeSession:
    def __init__(self, counts: dict[str, int], failed_tables: set[str] | None = None) -> None:
        self.counts = counts
        self.failed_tables = failed_tables or set()
        self.executed_sql: list[str] = []
        self.rollback_count = 0

    def execute(self, statement: Any) -> FakeResult:
        sql = str(statement)
        self.executed_sql.append(sql)
        table = sql.split(" FROM ", 1)[1].split(" WHERE ", 1)[0]
        if table in self.failed_tables:
            raise OperationalError("SELECT", {}, RuntimeError("permission denied"))
        return FakeResult(self.counts.get(table, 0))

    def rollback(self) -> None:
        self.rollback_count += 1


class FakeSessionContext:
    def __init__(self, session: FakeSession) -> None:
        self.session = session

    def __enter__(self) -> FakeSession:
        return self.session

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
        return None


def test_main_requires_explicit_inventory_database_url(monkeypatch) -> None:
    """Break caught: CLI silently connects to application/default database when no inventory target is declared."""
    monkeypatch.delenv("TRADELAB_QUARANTINE_INVENTORY_DATABASE_URL", raising=False)

    assert main() == 2


def test_scan_reports_known_null_counts_for_every_private_table() -> None:
    """Break caught: omitting a private table or interpreting NULL legacy rows as zero."""
    counts = {table: 0 for table in PRIVATE_TABLES}
    counts["strategy"] = 2
    counts["bot_run"] = 1
    session = FakeSession(counts)

    inventory = scan_quarantine_inventory(session_factory=lambda: FakeSessionContext(session))

    assert set(inventory) == set(PRIVATE_TABLES)
    assert inventory["strategy"] == {"status": "ok", "quarantined_count": 2, "error": None}
    assert inventory["bot_run"] == {"status": "ok", "quarantined_count": 1, "error": None}
    assert inventory["market_candle"] if "market_candle" in inventory else None is None
    assert all(sql.lstrip().upper().startswith("SELECT COUNT(*)") for sql in session.executed_sql)
    assert all("workspace_id IS NULL" in sql for sql in session.executed_sql)


def test_scan_marks_database_error_unknown_instead_of_fabricating_zero() -> None:
    """Break caught: missing table/permission errors silently reported as zero quarantined records."""
    counts = {table: 0 for table in PRIVATE_TABLES}
    session = FakeSession(counts, failed_tables={"strategy"})

    inventory = scan_quarantine_inventory(session_factory=lambda: FakeSessionContext(session))

    assert inventory["strategy"]["status"] == "error"
    assert inventory["strategy"]["quarantined_count"] is None
    assert "permission denied" in inventory["strategy"]["error"]
    assert session.rollback_count == 1
    assert exit_code_for_inventory(inventory) == 1


def test_partial_inventory_returns_nonzero_exit_code() -> None:
    """Break caught: incomplete scan exits success, hiding an unscanned private table."""
    inventory = {"strategy": {"status": "ok", "quarantined_count": 0, "error": None}}

    assert exit_code_for_inventory(inventory) == 1


def test_format_inventory_hides_row_bodies_and_returns_nonzero_for_error() -> None:
    """Break caught: operator output exposes private row bodies or reports success after failed scans."""
    inventory = {
        "strategy": {"status": "ok", "quarantined_count": 3, "error": None},
        "bot_run": {"status": "error", "quarantined_count": None, "error": "permission denied"},
    }

    report = format_inventory(inventory)

    assert "strategy: 3" in report
    assert "bot_run: ERROR" in report
    assert "permission denied" in report
    assert "strategy_group: ERROR missing inventory entry" in report
    assert "source_code" not in report
    assert exit_code_for_inventory(inventory) == 1
