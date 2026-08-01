from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from tradelab_api.services.dataset_fill_worker_tick import DatasetFillWorkerTickResult


def _dt(hour: int, minute: int = 0, second: int = 0) -> datetime:
    return datetime(2026, 1, 1, hour, minute, second, tzinfo=timezone.utc)


def _settings(
    *,
    scheduler_enabled: bool = True,
    local_fill_enabled: bool = True,
    environment: str = "local",
    interval_seconds: float = 60.0,
    worker_id: str = "trade-lab-local-scheduler",
    backoff_seconds: float = 60.0,
) -> SimpleNamespace:
    return SimpleNamespace(
        tradelab_background_fill_scheduler_enabled=scheduler_enabled,
        tradelab_background_fill_scheduler_interval_seconds=interval_seconds,
        tradelab_background_fill_scheduler_worker_id=worker_id,
        tradelab_background_fill_scheduler_error_backoff_seconds=backoff_seconds,
        tradelab_local_fill_enabled=local_fill_enabled,
        tradelab_environment=environment,
        binance_base_url="https://binance.test",
    )


def _worker_result(*, processed: bool = True, status: str = "completed") -> DatasetFillWorkerTickResult:
    return DatasetFillWorkerTickResult(
        processed=processed,
        job_id="job-1" if processed else None,
        dataset_key="binance:BTCUSDT:1h" if processed else None,
        status=status,
        safety_status="local_dev_worker_tick",
        rows_fetched=4 if processed else 0,
        rows_inserted=4 if processed else 0,
        rows_skipped_existing=0,
        stale_jobs_marked=0,
        reason_code=None,
        provider_status=None,
        attempt_count=1 if processed else 0,
        max_attempts=3,
        retry_exhausted=False,
    )


class FakeSession:
    def __init__(self) -> None:
        self.commits = 0
        self.rollbacks = 0
        self.closed = False

    def commit(self) -> None:
        self.commits += 1

    def rollback(self) -> None:
        self.rollbacks += 1

    def close(self) -> None:
        self.closed = True


class FakeRepository:
    def __init__(self, session) -> None:
        self.session = session


class FakeClient:
    def __init__(self, *, base_url: str) -> None:
        self.base_url = base_url


def test_scheduler_skips_when_disabled() -> None:
    from tradelab_api.services.dataset_fill_scheduler import BackgroundFillScheduler

    calls: list[object] = []
    scheduler = BackgroundFillScheduler(
        settings_factory=lambda: _settings(scheduler_enabled=False),
        worker_tick=lambda *args, **kwargs: calls.append(kwargs),
    )

    state = scheduler.tick_once(now=_dt(10))

    assert state.last_tick_status == "disabled"
    assert state.last_skip_reason == "dataset_fill_scheduler_disabled"
    assert calls == []


@pytest.mark.parametrize(
    ("settings", "reason_code"),
    [
        (_settings(local_fill_enabled=False), "dataset_fill_scheduler_local_fill_disabled"),
        (_settings(environment="production"), "dataset_fill_scheduler_environment_blocked"),
    ],
)
def test_scheduler_safety_gates_skip_without_worker_call(settings, reason_code) -> None:
    from tradelab_api.services.dataset_fill_scheduler import BackgroundFillScheduler

    calls: list[object] = []
    scheduler = BackgroundFillScheduler(
        settings_factory=lambda: settings,
        worker_tick=lambda *args, **kwargs: calls.append(kwargs),
    )

    state = scheduler.tick_once(now=_dt(10))

    assert state.last_tick_status == "skipped"
    assert state.last_skip_reason == reason_code
    assert calls == []


def test_scheduler_delegates_to_worker_internally_and_commits() -> None:
    from tradelab_api.services.dataset_fill_scheduler import BackgroundFillScheduler

    session = FakeSession()
    captured: dict[str, object] = {}

    def fake_tick(repository, client, **kwargs):
        captured["repository"] = repository
        captured["client"] = client
        captured["kwargs"] = kwargs
        return _worker_result()

    scheduler = BackgroundFillScheduler(
        settings_factory=lambda: _settings(worker_id="scheduler-1"),
        session_factory=lambda: session,
        repository_factory=FakeRepository,
        client_factory=lambda settings: FakeClient(base_url=settings.binance_base_url),
        worker_tick=fake_tick,
    )

    state = scheduler.tick_once(now=_dt(10))

    assert state.last_tick_status == "processed"
    assert state.last_reason_code is None
    assert state.last_job_id == "job-1"
    assert state.last_dataset_key == "binance:BTCUSDT:1h"
    assert session.commits == 1
    assert session.rollbacks == 0
    assert session.closed is True
    assert isinstance(captured["repository"], FakeRepository)
    assert isinstance(captured["client"], FakeClient)
    assert captured["kwargs"] == {
        "settings": _settings(worker_id="scheduler-1"),
        "confirm_local_worker_tick": True,
        "worker_id": "scheduler-1",
        "now": _dt(10),
    }


def test_scheduler_records_idle_when_worker_has_no_job() -> None:
    from tradelab_api.services.dataset_fill_scheduler import BackgroundFillScheduler

    session = FakeSession()
    scheduler = BackgroundFillScheduler(
        settings_factory=lambda: _settings(),
        session_factory=lambda: session,
        repository_factory=FakeRepository,
        client_factory=lambda settings: FakeClient(base_url=settings.binance_base_url),
        worker_tick=lambda *args, **kwargs: _worker_result(processed=False, status="idle"),
    )

    state = scheduler.tick_once(now=_dt(10))

    assert state.last_tick_status == "idle"
    assert state.last_skip_reason == "dataset_fill_scheduler_no_job"
    assert session.commits == 1


def test_scheduler_skips_overlapping_tick() -> None:
    from tradelab_api.services.dataset_fill_scheduler import BackgroundFillScheduler

    scheduler = BackgroundFillScheduler(settings_factory=lambda: _settings())
    assert scheduler._tick_lock.acquire(blocking=False) is True
    try:
        state = scheduler.tick_once(now=_dt(10))
    finally:
        scheduler._tick_lock.release()

    assert state.last_tick_status == "skipped"
    assert state.last_skip_reason == "dataset_fill_scheduler_tick_in_progress"


def test_scheduler_records_failure_rolls_back_and_continues() -> None:
    from tradelab_api.services.dataset_fill_scheduler import BackgroundFillScheduler

    session = FakeSession()

    def fail_tick(*args, **kwargs):
        raise RuntimeError("provider loop failed")

    scheduler = BackgroundFillScheduler(
        settings_factory=lambda: _settings(),
        session_factory=lambda: session,
        repository_factory=FakeRepository,
        client_factory=lambda settings: FakeClient(base_url=settings.binance_base_url),
        worker_tick=fail_tick,
    )

    state = scheduler.tick_once(now=_dt(10))

    assert state.last_tick_status == "failed"
    assert state.last_reason_code == "dataset_fill_scheduler_tick_failed"
    assert state.consecutive_failure_count == 1
    assert session.commits == 0
    assert session.rollbacks == 1
    assert session.closed is True
