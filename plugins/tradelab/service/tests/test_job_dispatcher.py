from __future__ import annotations

import pytest

from tradelab_api.services.job_dispatcher import JobDispatcher


@pytest.mark.parametrize("operation", ["start", "poll_once"])
def test_dispatcher_requires_workload_authority_before_any_queue_access(operation):
    opened = []

    def forbidden_session():
        opened.append(True)
        raise AssertionError("Queue access without authority")

    dispatcher = JobDispatcher(session_factory=forbidden_session)
    with pytest.raises(RuntimeError, match="workspace_authority_recheck_unavailable"):
        getattr(dispatcher, operation)()
    assert opened == []
    assert dispatcher.stats.processed_backtests == 0
    assert dispatcher.stats.processed_import_jobs == 0
    assert dispatcher.stats.failed_runs == 0
    assert dispatcher._thread is None
