from __future__ import annotations

import pytest

@pytest.mark.asyncio
async def test_lifespan_starts_and_stops_paper_scheduler(monkeypatch) -> None:
    import tradelab_api.main as main_module

    events: list[str] = []

    class FakeDispatcher:
        def start(self) -> None:
            events.append("dispatcher-start")

        def stop(self) -> None:
            events.append("dispatcher-stop")

    class FakeFillScheduler:
        def start(self) -> bool:
            events.append("fill-scheduler-start")
            return True

        def stop(self) -> None:
            events.append("fill-scheduler-stop")

    class FakePaperScheduler:
        def start(self) -> bool:
            events.append("paper-scheduler-start")
            return True

        def stop(self) -> None:
            events.append("paper-scheduler-stop")

    monkeypatch.setattr(main_module, "JobDispatcher", FakeDispatcher)
    monkeypatch.setattr(main_module, "BackgroundFillScheduler", FakeFillScheduler)
    monkeypatch.setattr(main_module, "PaperSessionScheduler", FakePaperScheduler)
    monkeypatch.setattr(main_module, "verify_database_connection", lambda: events.append("verify-db"))
    monkeypatch.setattr(main_module, "apply_schema_compatibility", lambda: events.append("schema"))
    monkeypatch.setattr(main_module, "seed_startup_baseline_if_enabled", lambda: events.append("seed"))

    class FakeApp:
        class State:
            pass

        state = State()

    async with main_module.lifespan(FakeApp()):
        assert events == [
            "verify-db",
            "schema",
            "seed",
            "dispatcher-start",
            "fill-scheduler-start",
            "paper-scheduler-start",
        ]

    assert events == [
        "verify-db",
        "schema",
        "seed",
        "dispatcher-start",
        "fill-scheduler-start",
        "paper-scheduler-start",
        "paper-scheduler-stop",
        "fill-scheduler-stop",
        "dispatcher-stop",
    ]

@pytest.mark.asyncio
async def test_lifespan_stops_started_services_when_paper_scheduler_start_fails(monkeypatch) -> None:
    import tradelab_api.main as main_module

    events: list[str] = []

    class FakeDispatcher:
        def start(self) -> None:
            events.append("dispatcher-start")

        def stop(self) -> None:
            events.append("dispatcher-stop")

    class FakeFillScheduler:
        def start(self) -> bool:
            events.append("fill-scheduler-start")
            return True

        def stop(self) -> None:
            events.append("fill-scheduler-stop")

    class FailingPaperScheduler:
        def start(self) -> bool:
            events.append("paper-scheduler-start")
            raise RuntimeError("paper scheduler start failed")

        def stop(self) -> None:
            events.append("paper-scheduler-stop")

    monkeypatch.setattr(main_module, "JobDispatcher", FakeDispatcher)
    monkeypatch.setattr(main_module, "BackgroundFillScheduler", FakeFillScheduler)
    monkeypatch.setattr(main_module, "PaperSessionScheduler", FailingPaperScheduler)
    monkeypatch.setattr(main_module, "verify_database_connection", lambda: events.append("verify-db"))
    monkeypatch.setattr(main_module, "apply_schema_compatibility", lambda: events.append("schema"))
    monkeypatch.setattr(main_module, "seed_startup_baseline_if_enabled", lambda: events.append("seed"))

    class FakeApp:
        class State:
            pass

        state = State()

    with pytest.raises(RuntimeError, match="paper scheduler start failed"):
        async with main_module.lifespan(FakeApp()):
            pass

    assert events == [
        "verify-db",
        "schema",
        "seed",
        "dispatcher-start",
        "fill-scheduler-start",
        "paper-scheduler-start",
        "paper-scheduler-stop",
        "fill-scheduler-stop",
        "dispatcher-stop",
    ]
