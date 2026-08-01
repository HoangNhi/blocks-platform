from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import logging
from threading import Event, Lock, Thread
from time import sleep
from typing import Callable

from tradelab_api.core.config import get_settings
from tradelab_api.db.session import SessionLocal, get_engine
from tradelab_api.services.dataset_fill_worker_tick import DatasetFillWorkerTickResult, tick_dataset_fill_worker
from tradelab_api.services.exchanges.binance_spot import BinanceSpotClient
from tradelab_api.services.market_data_repository import MarketDataRepository

LOCAL_SCHEDULER_ALLOWED_ENVIRONMENTS = {"local", "dev", "development", "test", "testing"}
LOCAL_SCHEDULER_DEFAULT_WORKER_ID = "trade-lab-local-scheduler"
SCHEDULER_REASON_DISABLED = "dataset_fill_scheduler_disabled"
SCHEDULER_REASON_LOCAL_FILL_DISABLED = "dataset_fill_scheduler_local_fill_disabled"
SCHEDULER_REASON_ENVIRONMENT_BLOCKED = "dataset_fill_scheduler_environment_blocked"
SCHEDULER_REASON_TICK_IN_PROGRESS = "dataset_fill_scheduler_tick_in_progress"
SCHEDULER_REASON_NO_JOB = "dataset_fill_scheduler_no_job"
SCHEDULER_REASON_TICK_FAILED = "dataset_fill_scheduler_tick_failed"

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class BackgroundFillSchedulerState:
    enabled: bool = False
    running: bool = False
    worker_id: str = LOCAL_SCHEDULER_DEFAULT_WORKER_ID
    interval_seconds: float = 60.0
    last_tick_started_at: datetime | None = None
    last_tick_completed_at: datetime | None = None
    last_tick_status: str = "disabled"
    last_skip_reason: str | None = SCHEDULER_REASON_DISABLED
    last_reason_code: str | None = None
    last_job_id: str | None = None
    last_dataset_key: str | None = None
    stale_jobs_marked: int = 0
    consecutive_failure_count: int = 0


class BackgroundFillScheduler:
    def __init__(
        self,
        *,
        settings_factory: Callable[[], object] | None = None,
        session_factory: Callable[[], object] | None = None,
        repository_factory: Callable[[object], object] | None = None,
        client_factory: Callable[[object], object] | None = None,
        worker_tick: Callable[..., DatasetFillWorkerTickResult] | None = None,
        sleep_func: Callable[[float], None] = sleep,
        now_factory: Callable[[], datetime] | None = None,
    ) -> None:
        self._settings_factory = settings_factory or get_settings
        self._session_factory = session_factory or self._create_session
        self._repository_factory = repository_factory or MarketDataRepository
        self._client_factory = client_factory or self._create_client
        self._worker_tick = worker_tick or tick_dataset_fill_worker
        self._sleep = sleep_func
        self._now_factory = now_factory or (lambda: datetime.now(timezone.utc))
        self._stop_event = Event()
        self._tick_lock = Lock()
        self._thread: Thread | None = None
        self.state = BackgroundFillSchedulerState()

    def start(self) -> bool:
        settings = self._settings_factory()
        if not self._can_run(settings):
            self._record_guard_state(settings, now=self._now_factory())
            return False
        if self._thread is not None and self._thread.is_alive():
            return True
        self._stop_event.clear()
        self._thread = Thread(target=self._run_loop, name="tradelab-background-fill-scheduler", daemon=True)
        self._thread.start()
        return True

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=5)
            self._thread = None

    def tick_once(self, *, now: datetime | None = None) -> BackgroundFillSchedulerState:
        settings = self._settings_factory()
        resolved_now = now or self._now_factory()
        guard_reason = self._guard_reason(settings)
        if guard_reason is not None:
            status = "disabled" if guard_reason == SCHEDULER_REASON_DISABLED else "skipped"
            return self._record_skip(settings, status=status, reason=guard_reason, now=resolved_now)

        if not self._tick_lock.acquire(blocking=False):
            return self._record_skip(
                settings,
                status="skipped",
                reason=SCHEDULER_REASON_TICK_IN_PROGRESS,
                now=resolved_now,
            )

        self.state.enabled = True
        self.state.running = True
        self.state.worker_id = self._worker_id(settings)
        self.state.interval_seconds = self._interval_seconds(settings)
        self.state.last_tick_started_at = resolved_now
        self.state.last_tick_completed_at = None
        self.state.last_skip_reason = None
        self.state.last_reason_code = None
        self.state.last_job_id = None
        self.state.last_dataset_key = None
        session = self._session_factory()
        try:
            repository = self._repository_factory(session)
            client = self._client_factory(settings)
            result = self._worker_tick(
                repository,
                client,
                settings=settings,
                confirm_local_worker_tick=True,
                worker_id=self.state.worker_id,
                now=resolved_now,
            )
            session.commit()
            self._record_worker_result(result, completed_at=self._now_factory())
            return self.state
        except Exception:
            logger.exception(
                "Background fill scheduler tick failed.",
                extra={"reasonCode": SCHEDULER_REASON_TICK_FAILED},
            )
            session.rollback()
            self._record_failure(completed_at=self._now_factory())
            return self.state
        finally:
            session.close()
            self.state.running = False
            self._tick_lock.release()

    def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            self.tick_once()
            if self.state.last_tick_status == "failed":
                delay = self._backoff_seconds(self._settings_factory())
            else:
                delay = self._interval_seconds(self._settings_factory())
            self._sleep(max(delay, 0.1))

    def _record_worker_result(self, result: DatasetFillWorkerTickResult, *, completed_at: datetime) -> None:
        self.state.last_tick_completed_at = completed_at
        self.state.last_tick_status = "processed" if result.processed else "idle"
        self.state.last_skip_reason = None if result.processed else SCHEDULER_REASON_NO_JOB
        self.state.last_reason_code = result.reason_code
        self.state.last_job_id = result.job_id
        self.state.last_dataset_key = result.dataset_key
        self.state.stale_jobs_marked = result.stale_jobs_marked
        self.state.consecutive_failure_count = 0

    def _record_failure(self, *, completed_at: datetime) -> None:
        self.state.last_tick_completed_at = completed_at
        self.state.last_tick_status = "failed"
        self.state.last_skip_reason = None
        self.state.last_reason_code = SCHEDULER_REASON_TICK_FAILED
        self.state.consecutive_failure_count += 1

    def _record_guard_state(self, settings: object, *, now: datetime) -> None:
        reason = self._guard_reason(settings) or SCHEDULER_REASON_DISABLED
        status = "disabled" if reason == SCHEDULER_REASON_DISABLED else "skipped"
        self._record_skip(settings, status=status, reason=reason, now=now)

    def _record_skip(
        self,
        settings: object,
        *,
        status: str,
        reason: str,
        now: datetime,
    ) -> BackgroundFillSchedulerState:
        self.state.enabled = bool(getattr(settings, "tradelab_background_fill_scheduler_enabled", False))
        self.state.running = False
        self.state.worker_id = self._worker_id(settings)
        self.state.interval_seconds = self._interval_seconds(settings)
        self.state.last_tick_started_at = now
        self.state.last_tick_completed_at = now
        self.state.last_tick_status = status
        self.state.last_skip_reason = reason
        self.state.last_reason_code = None
        self.state.last_job_id = None
        self.state.last_dataset_key = None
        return self.state

    def _can_run(self, settings: object) -> bool:
        return self._guard_reason(settings) is None

    def _guard_reason(self, settings: object) -> str | None:
        if getattr(settings, "tradelab_background_fill_scheduler_enabled", False) is not True:
            return SCHEDULER_REASON_DISABLED
        if getattr(settings, "tradelab_local_fill_enabled", False) is not True:
            return SCHEDULER_REASON_LOCAL_FILL_DISABLED
        environment = str(getattr(settings, "tradelab_environment", "local")).strip().lower()
        if environment not in LOCAL_SCHEDULER_ALLOWED_ENVIRONMENTS:
            return SCHEDULER_REASON_ENVIRONMENT_BLOCKED
        return None

    @staticmethod
    def _worker_id(settings: object) -> str:
        raw_worker_id = str(
            getattr(settings, "tradelab_background_fill_scheduler_worker_id", LOCAL_SCHEDULER_DEFAULT_WORKER_ID)
        ).strip()
        return raw_worker_id or LOCAL_SCHEDULER_DEFAULT_WORKER_ID

    @staticmethod
    def _interval_seconds(settings: object) -> float:
        return max(float(getattr(settings, "tradelab_background_fill_scheduler_interval_seconds", 60.0) or 60.0), 10.0)

    @staticmethod
    def _backoff_seconds(settings: object) -> float:
        return max(float(getattr(settings, "tradelab_background_fill_scheduler_error_backoff_seconds", 60.0) or 60.0), 1.0)

    @staticmethod
    def _create_session():
        return SessionLocal(bind=get_engine())

    @staticmethod
    def _create_client(settings: object) -> BinanceSpotClient:
        return BinanceSpotClient(base_url=str(getattr(settings, "binance_base_url", "https://api.binance.com")))
