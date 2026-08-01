from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://postgres:postgres123secure@localhost:5432/tradelab",
)

from tradelab_api.db.models import (  # noqa: E402
    MarketDataCoverage,
    MarketDataCoverageSegment,
    MarketDataImportJob,
)
from tradelab_api.db.session import (  # noqa: E402
    SessionLocal,
    apply_schema_compatibility,
    get_engine,
    verify_database_connection,
)
from tradelab_api.main import app  # noqa: E402
from tradelab_api.services.market_data_repository import MarketDataRepository  # noqa: E402

try:
    verify_database_connection()
except RuntimeError as exc:
    pytest.skip(str(exc), allow_module_level=True)
apply_schema_compatibility()
client = TestClient(app)

CATALOG_TEST_ACTOR = "pytest-dataset-catalog"


@pytest.fixture(autouse=True)
def cleanup_dataset_catalog_rows():
    _soft_delete_dataset_catalog_rows()
    yield
    _soft_delete_dataset_catalog_rows()


def assert_success_envelope(response, semantic_status: int = 200) -> dict[str, object]:
    assert response.status_code == 200
    payload = response.json()
    assert payload["Success"] is True
    assert payload["StatusCode"] == semantic_status
    assert payload["Message"] is None
    return payload["Data"]


def test_dataset_coverage_endpoint_lists_active_coverage_and_segments_only() -> None:
    suffix = uuid4().hex[:8].upper()
    active_symbol = f"TST{suffix}USDT"
    inactive_symbol = f"INA{suffix}USDT"
    deleted_symbol = f"DEL{suffix}USDT"
    active_key = f"binance:{active_symbol}:1h"
    inactive_key = f"binance:{inactive_symbol}:1h"
    deleted_key = f"binance:{deleted_symbol}:1h"

    with SessionLocal(bind=get_engine()) as session:
        active = _create_coverage(
            session,
            dataset_key=active_key,
            symbol=active_symbol,
            health_status="healthy",
            segment_count=2,
            gap_count=1,
            metadata_={
                "source": "dataset-catalog-test",
                "apiKey": "SECRET-WAS-HERE",
                "nested": {"safe": "visible", "secret": "HIDDEN-WAS-HERE"},
            },
        )
        inactive = _create_coverage(
            session,
            dataset_key=inactive_key,
            symbol=inactive_symbol,
            health_status="incomplete",
            is_active=False,
            is_deleted=False,
        )
        deleted = _create_coverage(
            session,
            dataset_key=deleted_key,
            symbol=deleted_symbol,
            health_status="blocked",
            is_active=True,
            is_deleted=True,
        )
        active_segment = _create_segment(session, coverage=active, segment_index=0, row_count=145)
        _create_segment(session, coverage=active, segment_index=1, row_count=10, is_active=False)
        _create_segment(session, coverage=active, segment_index=2, row_count=10, is_deleted=True)
        _create_segment(session, coverage=inactive, segment_index=0, row_count=1)
        _create_segment(session, coverage=deleted, segment_index=0, row_count=1)
        before_import_jobs = session.query(MarketDataImportJob).count()
        session.commit()

    data = assert_success_envelope(client.get("/api/tradelab/datasets/coverage"))

    with SessionLocal(bind=get_engine()) as session:
        after_import_jobs = session.query(MarketDataImportJob).count()

    assert after_import_jobs == before_import_jobs
    items = data["items"]
    dataset_keys = {item["dataset_key"] for item in items}
    assert active_key in dataset_keys
    assert inactive_key not in dataset_keys
    assert deleted_key not in dataset_keys

    row = next(item for item in items if item["dataset_key"] == active_key)
    assert row == {
        "id": str(active.id),
        "dataset_key": active_key,
        "exchange": "binance",
        "symbol": active_symbol,
        "timeframe": "1h",
        "health_status": "healthy",
        "earliest_open_time": "2026-01-01T00:00:00+00:00",
        "latest_open_time": "2026-01-07T00:00:00+00:00",
        "covered_start_at": "2026-01-01T00:00:00+00:00",
        "covered_end_at": "2026-01-07T00:00:00+00:00",
        "segment_count": 2,
        "gap_count": 1,
        "last_checked_at": "2026-05-17T00:00:00+00:00",
        "metadata": {"source": "dataset-catalog-test", "nested": {"safe": "visible"}},
        "segments": [
            {
                "id": str(active_segment.id),
                "segment_index": 0,
                "start_at": "2026-01-01T00:00:00+00:00",
        "end_at": "2026-01-01T01:00:00+00:00",
                "row_count": 145,
            }
        ],
    }
    assert "SECRET-WAS-HERE" not in str(row)
    assert "HIDDEN-WAS-HERE" not in str(row)


def test_dataset_coverage_endpoint_returns_empty_items_when_repository_has_no_rows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(MarketDataRepository, "list_coverage", lambda self: [])

    data = assert_success_envelope(client.get("/api/tradelab/datasets/coverage"))

    assert data == {"items": []}


def _create_coverage(
    session,
    *,
    dataset_key: str,
    symbol: str,
    health_status: str,
    segment_count: int = 0,
    gap_count: int = 0,
    is_active: bool = True,
    is_deleted: bool = False,
    metadata_: dict[str, object] | None = None,
) -> MarketDataCoverage:
    coverage = MarketDataCoverage(
        id=uuid4(),
        dataset_key=dataset_key,
        exchange="binance",
        symbol=symbol,
        timeframe="1h",
        health_status=health_status,
        earliest_open_time=datetime(2026, 1, 1, tzinfo=timezone.utc),
        latest_open_time=datetime(2026, 1, 7, tzinfo=timezone.utc),
        covered_start_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        covered_end_at=datetime(2026, 1, 7, tzinfo=timezone.utc),
        segment_count=segment_count,
        gap_count=gap_count,
        last_checked_at=datetime(2026, 5, 17, tzinfo=timezone.utc),
        metadata_=metadata_ or {"source": "dataset-catalog-test"},
        created_by=CATALOG_TEST_ACTOR,
        is_active=is_active,
        is_deleted=is_deleted,
    )
    session.add(coverage)
    session.flush()
    session.refresh(coverage)
    return coverage


def _create_segment(
    session,
    *,
    coverage: MarketDataCoverage,
    segment_index: int,
    row_count: int,
    is_active: bool = True,
    is_deleted: bool = False,
) -> MarketDataCoverageSegment:
    segment = MarketDataCoverageSegment(
        id=uuid4(),
        coverage_id=coverage.id,
        segment_index=segment_index,
        start_at=datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(hours=segment_index),
        end_at=datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(hours=segment_index + 1),
        row_count=row_count,
        metadata_={"source": "dataset-catalog-test"},
        created_by=CATALOG_TEST_ACTOR,
        is_active=is_active,
        is_deleted=is_deleted,
    )
    session.add(segment)
    session.flush()
    session.refresh(segment)
    return segment


def _soft_delete_dataset_catalog_rows() -> None:
    with SessionLocal(bind=get_engine()) as session:
        coverage_rows = (
            session.query(MarketDataCoverage)
            .filter(MarketDataCoverage.created_by == CATALOG_TEST_ACTOR)
            .all()
        )
        coverage_ids = [row.id for row in coverage_rows]
        if coverage_ids:
            segments = (
                session.query(MarketDataCoverageSegment)
                .filter(MarketDataCoverageSegment.coverage_id.in_(coverage_ids))
                .all()
            )
            for segment in segments:
                segment.is_active = False
                segment.is_deleted = True
                segment.updated_by = CATALOG_TEST_ACTOR
        for coverage in coverage_rows:
            coverage.is_active = False
            coverage.is_deleted = True
            coverage.updated_by = CATALOG_TEST_ACTOR
        session.commit()
