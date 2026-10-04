from __future__ import annotations

from datetime import datetime, timezone

from uuid import UUID, uuid4
import pytest

from tradelab_api.core.authorization import (
    FunctionalAuthorizationResult,
)
from tradelab_api.db.models import BotRun
from tradelab_api.services.job_dispatcher import JobDispatcher

WORKSPACE_ID = UUID("11111111-1111-1111-1111-111111111111")
USER_ID = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")


class StubAuthorityClient:
    def __init__(self, allowed: bool = True, available: bool = True) -> None:
        self.allowed = allowed
        self.available = available
        self.calls = []

    async def check_workload(self, user_id: UUID, workspace_id: UUID) -> FunctionalAuthorizationResult:
        self.calls.append((user_id, workspace_id))
        return FunctionalAuthorizationResult(
            allowed=self.allowed,
            authority_available=self.available,
            authenticated=True,
            user_id=user_id,
            workspace_id=workspace_id,
        )


def test_dispatcher_fails_closed_without_authority():
    dispatcher = JobDispatcher(auth_client=None)
    with pytest.raises(RuntimeError, match="workspace_authority_recheck_unavailable"):
        dispatcher.poll_once()


def test_dispatcher_authority_unavailable_keeps_run_queued(monkeypatch):
    run_id = uuid4()
    run = BotRun(
        id=run_id,
        workspace_id=WORKSPACE_ID,
        created_by=str(USER_ID),
        ownership_verified_at=datetime.now(timezone.utc),
        status="queued",
        run_type="backtest",
    )

    auth = StubAuthorityClient(allowed=False, available=False)
    dispatcher = JobDispatcher(auth_client=auth)

    decision = dispatcher._evaluate_candidate_authority(run)
    assert decision == "backoff"
    assert run.status == "queued"
    assert len(auth.calls) == 1


def test_dispatcher_authority_denied_marks_run_failed():
    run_id = uuid4()
    run = BotRun(
        id=run_id,
        workspace_id=WORKSPACE_ID,
        created_by=str(USER_ID),
        ownership_verified_at=datetime.now(timezone.utc),
        status="queued",
        run_type="backtest",
    )

    auth = StubAuthorityClient(allowed=False, available=True)
    dispatcher = JobDispatcher(auth_client=auth)

    decision = dispatcher._evaluate_candidate_authority(run)
    assert decision == "denied"
    assert len(auth.calls) == 1


def test_dispatcher_quarantines_ownerless_run():
    run_id = uuid4()
    run_no_ws = BotRun(
        id=run_id,
        workspace_id=None,
        created_by=str(USER_ID),
        status="queued",
    )
    run_invalid_creator = BotRun(
        id=uuid4(),
        workspace_id=WORKSPACE_ID,
        created_by="not-a-uuid",
        status="queued",
    )

    auth = StubAuthorityClient(allowed=True, available=True)
    dispatcher = JobDispatcher(auth_client=auth)

    assert dispatcher._is_quarantined(run_no_ws) is True
    assert dispatcher._is_quarantined(run_invalid_creator) is True


def test_dispatcher_pre_persistence_check_detects_revocation():
    auth = StubAuthorityClient(allowed=False, available=True)
    dispatcher = JobDispatcher(auth_client=auth)

    assert dispatcher._recheck_authority_before_persist(USER_ID, WORKSPACE_ID) is False


def test_dispatcher_fairness_outage_for_user_a_does_not_starve_user_b():
    user_a = uuid4()
    user_b = uuid4()

    class DualUserAuthorityClient:
        def __init__(self):
            self.calls = []

        async def check_workload(self, user_id: UUID, workspace_id: UUID) -> FunctionalAuthorizationResult:
            self.calls.append(user_id)
            if user_id == user_a:
                # User A authority service is down / unavailable
                return FunctionalAuthorizationResult(allowed=False, authority_available=False, authenticated=True, user_id=user_id, workspace_id=workspace_id)
            # User B is allowed
            return FunctionalAuthorizationResult(allowed=True, authority_available=True, authenticated=True, user_id=user_id, workspace_id=workspace_id)

    auth = DualUserAuthorityClient()
    dispatcher = JobDispatcher(auth_client=auth)

    run_a = BotRun(id=uuid4(), workspace_id=WORKSPACE_ID, created_by=str(user_a), ownership_verified_at=datetime.now(timezone.utc), status="queued", run_type="backtest")
    run_b = BotRun(id=uuid4(), workspace_id=WORKSPACE_ID, created_by=str(user_b), ownership_verified_at=datetime.now(timezone.utc), status="queued", run_type="backtest")

    decision_a = dispatcher._evaluate_candidate_authority(run_a)
    assert decision_a == "backoff"

    # User B must be evaluated and allowed, not blocked by A
    decision_b = dispatcher._evaluate_candidate_authority(run_b)
    assert decision_b == "allowed"


def test_complete_bot_run_rejects_cancelled_run():
    from tradelab_api.services.run_repository import RunRepository
    from unittest.mock import MagicMock

    session = MagicMock()
    repo = RunRepository(session, workspace_id=WORKSPACE_ID, owner_user_id=USER_ID)

    run = BotRun(id=uuid4(), workspace_id=WORKSPACE_ID, created_by=str(USER_ID), status="cancelled")
    res = repo.complete_bot_run(run, status="completed")
    assert res is None
