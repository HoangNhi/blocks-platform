from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import func

from tradelab_api.db.models import (
    MarketCandle,
    MarketDataCoverage,
    MarketDataCoverageSegment,
    MarketDataImportJob,
    MarketDataJobRunLink,
)
from tradelab_api.services.market_data_integrity import inspect_candles

from .repository_base import CRUDRepository


def build_dataset_key(exchange: str, symbol: str, timeframe: str) -> str:
    return f"{exchange}:{symbol}:{timeframe}"


@dataclass(frozen=True, slots=True)
class MarketCandleSourceSummary:
    source: str
    row_count: int

FILL_VISIBILITY_ACTIVE_STATUSES = ("queued", "running", "cancel_requested", "stale")
FILL_VISIBILITY_RECENT_STATUSES = ("completed", "failed", "cancelled", "stale")
BACKGROUND_FILL_ENQUEUE_SOURCE = "background_fill_enqueue"


class MarketDataRepository(CRUDRepository[MarketDataImportJob]):
    model = MarketDataImportJob

    def create_import_job(self, **fields: object) -> MarketDataImportJob:
        return self.create(MarketDataImportJob(**fields))

    def list_import_jobs(
        self,
        *,
        dataset_key: str | None = None,
        status: str | None = None,
        job_type: str | None = None,
    ) -> list[MarketDataImportJob]:
        query = self.session.query(MarketDataImportJob)
        if dataset_key is not None:
            query = query.filter(MarketDataImportJob.dataset_key == dataset_key)
        if status is not None:
            query = query.filter(MarketDataImportJob.status == status)
        if job_type is not None:
            query = query.filter(MarketDataImportJob.job_type == job_type)
        return list(query.order_by(MarketDataImportJob.created_at.desc()).all())

    def list_local_fill_audit_jobs(self, *, dataset_key: str, limit: int = 5) -> list[MarketDataImportJob]:
        query = (
            self.session.query(MarketDataImportJob)
            .filter(
                MarketDataImportJob.dataset_key == dataset_key,
                MarketDataImportJob.job_type == "fill",
                MarketDataImportJob.is_active.is_(True),
                MarketDataImportJob.is_deleted.is_(False),
            )
            .order_by(MarketDataImportJob.created_at.desc())
            .limit(max(limit * 3, limit))
        )
        jobs = [
            job
            for job in query.all()
            if (job.metadata_ or {}).get("source") == "strategy_lab_local_fill"
        ]
        return jobs[:limit]

    def list_active_import_jobs(self, *, dataset_key: str | None = None) -> list[MarketDataImportJob]:
        query = self.session.query(MarketDataImportJob).filter(
            MarketDataImportJob.status.in_(("queued", "running")),
            MarketDataImportJob.is_active.is_(True),
            MarketDataImportJob.is_deleted.is_(False),
        )
        if dataset_key is not None:
            query = query.filter(MarketDataImportJob.dataset_key == dataset_key)
        return list(query.order_by(MarketDataImportJob.created_at.asc()).all())

    def list_fill_visibility_active_jobs(self, *, dataset_key: str, limit: int = 5) -> list[MarketDataImportJob]:
        return list(
            self.session.query(MarketDataImportJob)
            .filter(
                MarketDataImportJob.dataset_key == dataset_key,
                MarketDataImportJob.job_type == "fill",
                MarketDataImportJob.status.in_(FILL_VISIBILITY_ACTIVE_STATUSES),
                MarketDataImportJob.is_active.is_(True),
                MarketDataImportJob.is_deleted.is_(False),
            )
            .order_by(MarketDataImportJob.created_at.desc())
            .limit(limit)
            .all()
        )

    def list_fill_visibility_recent_jobs(self, *, dataset_key: str, limit: int = 5) -> list[MarketDataImportJob]:
        return list(
            self.session.query(MarketDataImportJob)
            .filter(
                MarketDataImportJob.dataset_key == dataset_key,
                MarketDataImportJob.job_type == "fill",
                MarketDataImportJob.status.in_(FILL_VISIBILITY_RECENT_STATUSES),
                MarketDataImportJob.is_active.is_(True),
                MarketDataImportJob.is_deleted.is_(False),
            )
            .order_by(MarketDataImportJob.created_at.desc())
            .limit(limit)
            .all()
        )

    def list_active_fill_jobs_for_dataset(self, *, dataset_key: str) -> list[MarketDataImportJob]:
        return list(
            self.session.query(MarketDataImportJob)
            .filter(
                MarketDataImportJob.dataset_key == dataset_key,
                MarketDataImportJob.job_type == "fill",
                MarketDataImportJob.status.in_(FILL_VISIBILITY_ACTIVE_STATUSES),
                MarketDataImportJob.is_active.is_(True),
                MarketDataImportJob.is_deleted.is_(False),
            )
            .order_by(MarketDataImportJob.created_at.asc())
            .all()
        )

    def soft_delete_background_fill_enqueue_jobs(self, *, dataset_key: str, updated_by: str) -> int:
        jobs = (
            self.session.query(MarketDataImportJob)
            .filter(
                MarketDataImportJob.dataset_key == dataset_key,
                MarketDataImportJob.job_type == "fill",
                MarketDataImportJob.is_active.is_(True),
                MarketDataImportJob.is_deleted.is_(False),
            )
            .all()
        )
        count = 0
        for job in jobs:
            if (job.metadata_ or {}).get("source") != "background_fill_enqueue":
                continue
            job.is_active = False
            job.is_deleted = True
            job.updated_by = updated_by
            count += 1
        self.session.flush()
        return count

    def claim_next_queued_import_job(self, *, worker_id: str) -> MarketDataImportJob | None:
        candidates = (
            self.session.query(MarketDataImportJob)
            .filter(
                MarketDataImportJob.status == "queued",
                MarketDataImportJob.is_active.is_(True),
                MarketDataImportJob.is_deleted.is_(False),
            )
            .order_by(MarketDataImportJob.created_at.asc())
            .with_for_update(skip_locked=True)
            .limit(25)
            .all()
        )
        job = next((candidate for candidate in candidates if not _is_background_fill_enqueue_job(candidate)), None)
        if job is None:
            return None
        now = datetime.now(timezone.utc)
        job.status = "running"
        job.claimed_at = now
        job.started_at = now
        job.worker_id = worker_id
        self.session.flush()
        self.session.refresh(job)
        return job

    def claim_next_background_fill_enqueue_job(
        self,
        *,
        worker_id: str,
        now: datetime | None = None,
    ) -> MarketDataImportJob | None:
        candidates = (
            self.session.query(MarketDataImportJob)
            .filter(
                MarketDataImportJob.status == "queued",
                MarketDataImportJob.job_type == "fill",
                MarketDataImportJob.is_active.is_(True),
                MarketDataImportJob.is_deleted.is_(False),
            )
            .order_by(MarketDataImportJob.created_at.asc())
            .with_for_update(skip_locked=True)
            .limit(25)
            .all()
        )
        job = next((candidate for candidate in candidates if _is_background_fill_enqueue_job(candidate)), None)
        if job is None:
            return None
        resolved_now = now or datetime.now(timezone.utc)
        metadata = dict(job.metadata_ or {})
        metadata["workerId"] = worker_id
        metadata["heartbeatAt"] = resolved_now.isoformat()
        metadata["attemptCount"] = int(metadata.get("attemptCount") or 0) + 1
        metadata["safetyStatus"] = "local_dev_worker_tick"
        metadata.setdefault("ranges", [])
        job.metadata_ = metadata
        job.status = "running"
        job.claimed_at = resolved_now
        job.started_at = resolved_now
        job.worker_id = worker_id
        self.session.flush()
        self.session.refresh(job)
        return job

    def claim_next_retryable_background_fill_enqueue_job(
        self,
        *,
        worker_id: str,
        now: datetime | None = None,
    ) -> MarketDataImportJob | None:
        resolved_now = now or datetime.now(timezone.utc)
        candidates = (
            self.session.query(MarketDataImportJob)
            .filter(
                MarketDataImportJob.status == "running",
                MarketDataImportJob.job_type == "fill",
                MarketDataImportJob.is_active.is_(True),
                MarketDataImportJob.is_deleted.is_(False),
            )
            .order_by(MarketDataImportJob.updated_at.asc(), MarketDataImportJob.created_at.asc())
            .with_for_update(skip_locked=True)
            .limit(25)
            .all()
        )
        for job in candidates:
            if not _is_background_fill_enqueue_job(job):
                continue
            metadata = dict(job.metadata_ or {})
            retry_range = _next_retrying_range(metadata)
            if retry_range is None:
                continue
            next_retry_at = _parse_metadata_datetime(retry_range.get("nextRetryAt") or metadata.get("nextRetryAt"))
            if next_retry_at is not None and next_retry_at > resolved_now:
                continue
            metadata["workerId"] = worker_id
            metadata["heartbeatAt"] = resolved_now.isoformat()
            metadata["safetyStatus"] = "local_dev_worker_tick"
            job.metadata_ = metadata
            job.worker_id = worker_id
            job.updated_by = worker_id
            self.session.flush()
            self.session.refresh(job)
            return job
        return None

    def claim_next_cancel_requested_background_fill_enqueue_job(
        self,
        *,
        worker_id: str,
        now: datetime | None = None,
    ) -> MarketDataImportJob | None:
        resolved_now = now or datetime.now(timezone.utc)
        candidates = (
            self.session.query(MarketDataImportJob)
            .filter(
                MarketDataImportJob.status == "cancel_requested",
                MarketDataImportJob.job_type == "fill",
                MarketDataImportJob.is_active.is_(True),
                MarketDataImportJob.is_deleted.is_(False),
            )
            .order_by(MarketDataImportJob.updated_at.asc(), MarketDataImportJob.created_at.asc())
            .with_for_update(skip_locked=True)
            .limit(25)
            .all()
        )
        job = next((candidate for candidate in candidates if _is_background_fill_enqueue_job(candidate)), None)
        if job is None:
            return None
        metadata = dict(job.metadata_ or {})
        metadata["workerId"] = worker_id
        metadata["heartbeatAt"] = resolved_now.isoformat()
        metadata["safetyStatus"] = "local_dev_cancel_only"
        job.metadata_ = metadata
        job.worker_id = worker_id
        job.updated_by = worker_id
        self.session.flush()
        self.session.refresh(job)
        return job

    def mark_stale_background_fill_enqueue_jobs(
        self,
        *,
        now: datetime,
        stale_after: timedelta,
        updated_by: str,
    ) -> int:
        jobs = (
            self.session.query(MarketDataImportJob)
            .filter(
                MarketDataImportJob.status == "running",
                MarketDataImportJob.job_type == "fill",
                MarketDataImportJob.is_active.is_(True),
                MarketDataImportJob.is_deleted.is_(False),
            )
            .order_by(MarketDataImportJob.created_at.asc())
            .all()
        )
        count = 0
        threshold = now - stale_after
        for job in jobs:
            if not _is_background_fill_enqueue_job(job):
                continue
            metadata = dict(job.metadata_ or {})
            heartbeat = _parse_metadata_datetime(metadata.get("heartbeatAt")) or job.claimed_at or job.started_at
            if heartbeat is None or heartbeat > threshold:
                continue
            metadata["reasonCode"] = "dataset_fill_worker_stale"
            metadata["safetyStatus"] = "local_dev_worker_tick"
            metadata["staleMarkedAt"] = now.isoformat()
            job.metadata_ = metadata
            job.status = "stale"
            job.finished_at = None
            job.updated_by = updated_by
            count += 1
        self.session.flush()
        return count

    def mark_stale_background_fill_enqueue_job_failed(
        self,
        job: MarketDataImportJob,
        *,
        now: datetime,
        updated_by: str,
        reason: str,
    ) -> MarketDataImportJob:
        metadata = dict(job.metadata_ or {})
        raw_heartbeat = metadata.get("heartbeatAt")
        heartbeat = _parse_metadata_datetime(raw_heartbeat) or job.claimed_at or job.started_at
        stale_age_seconds = None
        if heartbeat is not None:
            stale_age_seconds = max(0, int((now - heartbeat).total_seconds()))

        if heartbeat is not None:
            metadata["lastHeartbeatAt"] = heartbeat.isoformat()
        previous_worker_id = metadata.get("workerId") or job.worker_id
        if previous_worker_id is not None:
            metadata["previousWorkerId"] = str(previous_worker_id)
        if stale_age_seconds is not None:
            metadata["staleAgeSeconds"] = stale_age_seconds

        metadata["reasonCode"] = "dataset_fill_stale_marked_failed"
        metadata["recoveryAction"] = "mark_stale_failed"
        metadata["recoveryRequestedAt"] = now.isoformat()
        metadata["recoveryRequestedBy"] = updated_by
        metadata["recoveryReason"] = reason
        metadata["safetyStatus"] = "local_dev_recovery_only"

        job.metadata_ = metadata
        job.status = "failed"
        job.finished_at = now
        job.error_message = "Stale background fill job marked failed for local/dev recovery."
        job.updated_by = updated_by
        self.session.flush()
        self.session.refresh(job)
        return job

    def mark_background_fill_enqueue_job_cancel_requested(
        self,
        job: MarketDataImportJob,
        *,
        now: datetime,
        updated_by: str,
        reason: str,
    ) -> MarketDataImportJob:
        metadata = dict(job.metadata_ or {})
        metadata["reasonCode"] = "dataset_fill_cancel_requested"
        metadata["cancelRequestedAt"] = now.isoformat()
        metadata["cancelRequestedBy"] = updated_by
        metadata["cancelReason"] = reason
        metadata["safetyStatus"] = "local_dev_cancel_only"

        job.metadata_ = metadata
        job.status = "cancel_requested"
        job.finished_at = None
        job.updated_by = updated_by
        self.session.flush()
        self.session.refresh(job)
        return job

    def mark_background_fill_enqueue_job_cancelled(
        self,
        job: MarketDataImportJob,
        *,
        now: datetime,
        updated_by: str,
        rows_fetched: int,
        rows_inserted: int,
        rows_skipped_existing: int,
        range_results: list[dict[str, object]],
    ) -> MarketDataImportJob:
        metadata = dict(job.metadata_ or {})
        metadata["reasonCode"] = "dataset_fill_cancelled"
        metadata["cancelObservedAt"] = now.isoformat()
        metadata["cancelObservedBy"] = updated_by
        metadata["cancelledAt"] = now.isoformat()
        metadata["safetyStatus"] = "local_dev_cancel_only"
        metadata["rowsFetched"] = rows_fetched
        metadata["rowsInserted"] = rows_inserted
        metadata["rowsSkippedExisting"] = rows_skipped_existing
        metadata["ranges"] = range_results

        job.metadata_ = metadata
        job.status = "cancelled"
        job.rows_imported = rows_inserted
        job.finished_at = now
        job.error_message = None
        job.updated_by = updated_by
        self.session.flush()
        self.session.refresh(job)
        return job

    def get_import_job(self, job_id: UUID) -> MarketDataImportJob | None:
        return self.get_by_id(job_id, active_only=False)

    def find_compatible_active_import_job(
        self,
        *,
        dataset_key: str,
        job_type: str,
        start_at: datetime,
        end_at: datetime,
    ) -> MarketDataImportJob | None:
        preferred_order = ["repair", "fill"] if job_type == "fill" else [job_type]
        for candidate_type in preferred_order:
            job = (
                self.session.query(MarketDataImportJob)
                .filter(
                    MarketDataImportJob.dataset_key == dataset_key,
                    MarketDataImportJob.job_type == candidate_type,
                    MarketDataImportJob.status.in_(("queued", "running")),
                    MarketDataImportJob.is_active.is_(True),
                    MarketDataImportJob.is_deleted.is_(False),
                    MarketDataImportJob.requested_start_at <= start_at,
                    MarketDataImportJob.requested_end_at >= end_at,
                )
                .order_by(MarketDataImportJob.created_at.asc())
                .first()
            )
            if job is not None:
                return job
        return None

    def complete_import_job(
        self,
        job: MarketDataImportJob,
        *,
        applied_start_at: datetime | None = None,
        applied_end_at: datetime | None = None,
        rows_imported: int,
        status: str = "completed",
        error_message: str | None = None,
    ) -> MarketDataImportJob:
        job.status = status
        job.rows_imported = rows_imported
        job.applied_start_at = applied_start_at or job.applied_start_at
        job.applied_end_at = applied_end_at or job.applied_end_at
        job.finished_at = datetime.now(timezone.utc)
        job.error_message = error_message
        self.session.flush()
        self.session.refresh(job)
        return job

    def create_market_candles(self, candles: list[dict[str, object]]) -> list[MarketCandle]:
        objects = [MarketCandle(**candle) for candle in candles]
        self.session.add_all(objects)
        self.session.flush()
        for candle in objects:
            self.session.refresh(candle)
        return objects

    def delete_market_candles_range(
        self,
        *,
        exchange: str,
        symbol: str,
        timeframe: str,
        start_at: datetime,
        end_at: datetime,
    ) -> int:
        deleted = (
            self.session.query(MarketCandle)
            .filter(
                MarketCandle.exchange == exchange,
                MarketCandle.symbol == symbol,
                MarketCandle.timeframe == timeframe,
                MarketCandle.open_time >= start_at,
                MarketCandle.open_time <= end_at,
            )
            .delete(synchronize_session=False)
        )
        self.session.flush()
        return int(deleted)

    def replace_market_candles(
        self,
        *,
        exchange: str,
        symbol: str,
        timeframe: str,
        start_at: datetime,
        end_at: datetime,
        candles: list[dict[str, object]],
    ) -> list[MarketCandle]:
        self.session.query(MarketCandle).filter(
            MarketCandle.exchange == exchange,
            MarketCandle.symbol == symbol,
            MarketCandle.timeframe == timeframe,
            MarketCandle.open_time >= start_at,
            MarketCandle.open_time <= end_at,
        ).delete(synchronize_session=False)
        self.session.flush()
        return self.create_market_candles(candles)

    def list_market_candles(
        self,
        *,
        exchange: str | None = None,
        symbol: str | None = None,
        timeframe: str | None = None,
        start_at: datetime | None = None,
        end_at: datetime | None = None,
    ) -> list[MarketCandle]:
        query = self.session.query(MarketCandle)
        if exchange is not None:
            query = query.filter(MarketCandle.exchange == exchange)
        if symbol is not None:
            query = query.filter(MarketCandle.symbol == symbol)
        if timeframe is not None:
            query = query.filter(MarketCandle.timeframe == timeframe)
        if start_at is not None:
            query = query.filter(MarketCandle.open_time >= start_at)
        if end_at is not None:
            query = query.filter(MarketCandle.open_time <= end_at)
        return list(query.order_by(MarketCandle.open_time).all())

    def list_market_candle_source_summary(
        self,
        *,
        exchange: str,
        symbol: str,
        timeframe: str,
        start_at: datetime,
        end_at: datetime,
    ) -> list[MarketCandleSourceSummary]:
        rows = (
            self.session.query(MarketCandle.source, func.count(MarketCandle.id))
            .filter(
                MarketCandle.exchange == exchange,
                MarketCandle.symbol == symbol,
                MarketCandle.timeframe == timeframe,
                MarketCandle.open_time >= start_at,
                MarketCandle.open_time <= end_at,
            )
            .group_by(MarketCandle.source)
            .order_by(MarketCandle.source.asc())
            .all()
        )
        return [MarketCandleSourceSummary(source=source, row_count=int(row_count)) for source, row_count in rows]

    def get_coverage(self, *, dataset_key: str) -> MarketDataCoverage | None:
        return (
            self.session.query(MarketDataCoverage)
            .filter(
                MarketDataCoverage.dataset_key == dataset_key,
                MarketDataCoverage.is_active.is_(True),
                MarketDataCoverage.is_deleted.is_(False),
            )
            .one_or_none()
        )

    def list_coverage(self) -> list[MarketDataCoverage]:
        return list(
            self.session.query(MarketDataCoverage)
            .filter(
                MarketDataCoverage.is_active.is_(True),
                MarketDataCoverage.is_deleted.is_(False),
            )
            .order_by(
                MarketDataCoverage.exchange.asc(),
                MarketDataCoverage.symbol.asc(),
                MarketDataCoverage.timeframe.asc(),
                MarketDataCoverage.dataset_key.asc(),
            )
            .all()
        )

    def create_or_update_coverage(self, **fields: object) -> MarketDataCoverage:
        dataset_key = str(fields["dataset_key"])
        coverage = self.get_coverage(dataset_key=dataset_key)
        if coverage is None:
            coverage = MarketDataCoverage(**fields)
            self.session.add(coverage)
        else:
            for key, value in fields.items():
                if key != "dataset_key":
                    setattr(coverage, key, value)
        self.session.flush()
        self.session.refresh(coverage)
        return coverage

    def list_coverage_segments(self, *, coverage_id: UUID) -> list[MarketDataCoverageSegment]:
        return list(
            self.session.query(MarketDataCoverageSegment)
            .filter(
                MarketDataCoverageSegment.coverage_id == coverage_id,
                MarketDataCoverageSegment.is_active.is_(True),
                MarketDataCoverageSegment.is_deleted.is_(False),
            )
            .order_by(MarketDataCoverageSegment.segment_index.asc())
            .all()
        )

    def replace_coverage_segments(
        self,
        *,
        coverage_id: UUID,
        segments: list[dict[str, object]],
    ) -> list[MarketDataCoverageSegment]:
        self.session.query(MarketDataCoverageSegment).filter(
            MarketDataCoverageSegment.coverage_id == coverage_id
        ).delete(synchronize_session=False)
        self.session.flush()
        objects = [MarketDataCoverageSegment(coverage_id=coverage_id, **segment) for segment in segments]
        self.session.add_all(objects)
        self.session.flush()
        for segment in objects:
            self.session.refresh(segment)
        return objects

    def refresh_coverage_from_candles(
        self,
        *,
        exchange: str,
        symbol: str,
        timeframe: str,
        candles: list[MarketCandle],
        health_status: str,
        metadata: dict[str, object] | None = None,
    ) -> MarketDataCoverage | None:
        if not candles:
            return None
        integrity = inspect_candles(
            (
                {
                    "open_time": candle.open_time,
                    "close_time": candle.close_time,
                    "open": candle.open,
                    "high": candle.high,
                    "low": candle.low,
                    "close": candle.close,
                    "volume": candle.volume,
                }
                for candle in candles
            ),
            timeframe=timeframe,
        )
        resolved_health_status = integrity.health_status
        if health_status == "blocked":
            resolved_health_status = "blocked"
        elif health_status == "suspect" and resolved_health_status != "blocked":
            resolved_health_status = "suspect"
        elif health_status == "incomplete" and resolved_health_status == "healthy":
            resolved_health_status = "incomplete"

        created_by = (metadata or {}).get("createdBy")
        dataset_key = build_dataset_key(exchange, symbol, timeframe)
        coverage = self.create_or_update_coverage(
            dataset_key=dataset_key,
            exchange=exchange,
            symbol=symbol,
            timeframe=timeframe,
            health_status=resolved_health_status,
            earliest_open_time=integrity.earliest_open_time,
            latest_open_time=integrity.latest_open_time,
            covered_start_at=integrity.earliest_open_time,
            covered_end_at=integrity.latest_open_time,
            segment_count=len(integrity.segments),
            gap_count=integrity.gap_count,
            last_checked_at=datetime.now(timezone.utc),
            metadata_=metadata or {},
            created_by=created_by,
        )
        self.replace_coverage_segments(
            coverage_id=coverage.id,
            segments=[
                {
                    "segment_index": index,
                    "start_at": segment.start_at,
                    "end_at": segment.end_at,
                    "row_count": segment.row_count,
                    "metadata_": {"source": "refresh_coverage_from_candles"},
                    "created_by": created_by,
                }
                for index, segment in enumerate(integrity.segments)
            ],
        )
        return coverage

    def create_job_run_link(
        self,
        *,
        import_job_id: UUID,
        bot_run_id: UUID,
        link_status: str = "waiting",
        metadata: dict[str, object] | None = None,
        created_by: str | None = None,
    ) -> MarketDataJobRunLink:
        link = MarketDataJobRunLink(
            import_job_id=import_job_id,
            bot_run_id=bot_run_id,
            link_status=link_status,
            metadata_=metadata or {},
            created_by=created_by,
        )
        self.session.add(link)
        self.session.flush()
        self.session.refresh(link)
        return link

    def list_job_run_links(
        self,
        *,
        import_job_id: UUID | None = None,
        bot_run_id: UUID | None = None,
    ) -> list[MarketDataJobRunLink]:
        query = self.session.query(MarketDataJobRunLink)
        if import_job_id is not None:
            query = query.filter(MarketDataJobRunLink.import_job_id == import_job_id)
        if bot_run_id is not None:
            query = query.filter(MarketDataJobRunLink.bot_run_id == bot_run_id)
        return list(query.order_by(MarketDataJobRunLink.created_at.asc()).all())


def _is_background_fill_enqueue_job(job: MarketDataImportJob) -> bool:
    return (job.metadata_ or {}).get("source") == BACKGROUND_FILL_ENQUEUE_SOURCE


def _next_retrying_range(metadata: dict[str, Any]) -> dict[str, Any] | None:
    for item in metadata.get("ranges", []):
        if isinstance(item, dict) and item.get("status") == "retrying":
            return item
    return None


def _parse_metadata_datetime(value: object) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None
