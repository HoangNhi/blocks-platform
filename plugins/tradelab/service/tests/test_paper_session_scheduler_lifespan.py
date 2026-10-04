from __future__ import annotations

import pytest


@pytest.mark.asyncio
@pytest.mark.parametrize("fail_private_start", [False, True])
async def test_lifespan_never_starts_private_workers(monkeypatch, fail_private_start) -> None:
    import tradelab_api.main as main_module

    events = []

    class PrivateWorker:
        def start(self):
            events.append("private-start")
            if fail_private_start:
                raise RuntimeError("Private execution has no authority")

        def stop(self):
            events.append("private-stop")

    class SharedWorker:
        def start(self):
            events.append("shared-start")

        def stop(self):
            events.append("shared-stop")

    monkeypatch.setattr(main_module, "JobDispatcher", PrivateWorker)
    monkeypatch.setattr(main_module, "PaperSessionScheduler", PrivateWorker)
    monkeypatch.setattr(main_module, "BackgroundFillScheduler", SharedWorker)
    monkeypatch.setattr(main_module, "verify_database_connection", lambda: events.append("verify-db"))
    monkeypatch.setattr(main_module, "apply_schema_compatibility", lambda: events.append("schema"))

    from types import SimpleNamespace
    async with main_module.lifespan(SimpleNamespace(state=SimpleNamespace())):
        assert events == ["verify-db", "schema", "shared-start"]

    assert events == ["verify-db", "schema", "shared-start", "private-stop", "shared-stop", "private-stop"]
