from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_lifespan_starts_and_stops_background_fill_scheduler(monkeypatch) -> None:
    import tradelab_api.main as main_module

    events: list[str] = []

    class FakeDispatcher:
        def start(self) -> None:
            events.append("dispatcher-start")

        def stop(self) -> None:
            events.append("dispatcher-stop")

    class FakeScheduler:
        def start(self) -> bool:
            events.append("scheduler-start")
            return True

        def stop(self) -> None:
            events.append("scheduler-stop")

    monkeypatch.setattr(main_module, "JobDispatcher", FakeDispatcher)
    monkeypatch.setattr(main_module, "BackgroundFillScheduler", FakeScheduler)
    monkeypatch.setattr(main_module, "verify_database_connection", lambda: events.append("verify-db"))
    monkeypatch.setattr(main_module, "apply_schema_compatibility", lambda: events.append("schema"))
    monkeypatch.setattr(main_module, "seed_startup_baseline_if_enabled", lambda: events.append("seed"))

    class FakeApp:
        class State:
            pass

        state = State()

    async with main_module.lifespan(FakeApp()):
        assert events == ["verify-db", "schema", "seed", "dispatcher-start", "scheduler-start"]

    assert events == [
        "verify-db",
        "schema",
        "seed",
        "dispatcher-start",
        "scheduler-start",
        "scheduler-stop",
        "dispatcher-stop",
    ]


@pytest.mark.asyncio
async def test_lifespan_stops_dispatcher_when_scheduler_start_fails(monkeypatch) -> None:
    import tradelab_api.main as main_module

    events: list[str] = []

    class FakeDispatcher:
        def start(self) -> None:
            events.append("dispatcher-start")

        def stop(self) -> None:
            events.append("dispatcher-stop")

    class FailingScheduler:
        def start(self) -> bool:
            events.append("scheduler-start")
            raise RuntimeError("scheduler start failed")

        def stop(self) -> None:
            events.append("scheduler-stop")

    monkeypatch.setattr(main_module, "JobDispatcher", FakeDispatcher)
    monkeypatch.setattr(main_module, "BackgroundFillScheduler", FailingScheduler)
    monkeypatch.setattr(main_module, "verify_database_connection", lambda: events.append("verify-db"))
    monkeypatch.setattr(main_module, "apply_schema_compatibility", lambda: events.append("schema"))
    monkeypatch.setattr(main_module, "seed_startup_baseline_if_enabled", lambda: events.append("seed"))

    class FakeApp:
        class State:
            pass

        state = State()

    with pytest.raises(RuntimeError, match="scheduler start failed"):
        async with main_module.lifespan(FakeApp()):
            pass

    assert events == [
        "verify-db",
        "schema",
        "seed",
        "dispatcher-start",
        "scheduler-start",
        "scheduler-stop",
        "dispatcher-stop",
    ]
