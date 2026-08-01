from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from tradelab_api.services.paper_session_cancel_local import (
    LOCAL_PAPER_CANCEL_SAFETY_STATUS,
    LocalPaperCancelProvider,
    PaperSessionCancelLocalRequestData,
    execute_local_paper_session_cancel,
)


def _dt() -> datetime:
    return datetime(2026, 5, 22, 10, 30, tzinfo=timezone.utc)


def _settings(*, enabled: bool = True, environment: str = "local") -> SimpleNamespace:
    return SimpleNamespace(
        tradelab_local_paper_engine_enabled=enabled,
        tradelab_environment=environment,
    )


def _request(
    *,
    confirm: bool = True,
    reason: str = "user_requested",
    actor: str = "local-user",
) -> PaperSessionCancelLocalRequestData:
    return PaperSessionCancelLocalRequestData(
        confirm_local_paper_cancel=confirm,
        reason=reason,
        actor=actor,
    )


class FakePaperSession:
    def __init__(self, *, status: str = "queued", mode: str = "paper") -> None:
        self.id = uuid4()
        self.mode = mode
        self.status = status
        self.reason_code = None
        self.error_message = None
        self.cancel_requested_at = None
        self.finished_at = None
        self.updated_at = None
        self.updated_by = None


class FakeRepository:
    def __init__(self, row: FakePaperSession | None) -> None:
        self.row = row
        self.audit_events: list[dict[str, object]] = []
        self.for_update_ids: list[object] = []

    def get_paper_session_for_update(self, session_id):
        self.for_update_ids.append(session_id)
        if self.row and self.row.id == session_id:
            return self.row
        return None

    def create_audit_event(self, **fields):
        self.audit_events.append(fields)
        return SimpleNamespace(id=uuid4(), **fields)


class FakeStatusRepository:
    def __init__(self, status: str | None) -> None:
        self.status = status
        self.calls: list[str] = []

    def get_paper_session_status(self, session_id):
        self.calls.append(str(session_id))
        return self.status


def test_cancel_queued_session_marks_cancelled_and_writes_audit() -> None:
    row = FakePaperSession(status="queued")
    repository = FakeRepository(row)

    result = execute_local_paper_session_cancel(
        repository,
        settings=_settings(),
        session_id=row.id,
        request=_request(actor="admin"),
        now=_dt(),
    )

    assert result.status == "cancelled"
    assert result.reason_code == "paper_local_cancelled"
    assert result.safety_status == LOCAL_PAPER_CANCEL_SAFETY_STATUS
    assert result.session_id == str(row.id)
    assert result.previous_status == "queued"
    assert result.current_status == "cancelled"
    assert result.cancel_requested_at == _dt()
    assert result.should_commit is True
    assert result.semantic_status_code == 200
    assert row.status == "cancelled"
    assert row.reason_code == "paper_local_cancelled"
    assert row.cancel_requested_at == _dt()
    assert row.finished_at == _dt()
    assert row.updated_by == "admin"
    assert repository.audit_events[0]["action"] == "paper_session_cancelled"
    assert repository.audit_events[0]["old_state"] == "queued"
    assert repository.audit_events[0]["new_state"] == "cancelled"
    assert repository.audit_events[0]["reason_code"] == "paper_local_cancelled"
    assert repository.audit_events[0]["metadata_"]["safetyStatus"] == LOCAL_PAPER_CANCEL_SAFETY_STATUS


def test_cancel_running_session_marks_cancel_requested_and_writes_audit() -> None:
    row = FakePaperSession(status="running")
    repository = FakeRepository(row)

    result = execute_local_paper_session_cancel(
        repository,
        settings=_settings(),
        session_id=row.id,
        request=_request(actor="admin"),
        now=_dt(),
    )

    assert result.status == "cancel_requested"
    assert result.reason_code == "paper_local_cancel_requested"
    assert result.previous_status == "running"
    assert result.current_status == "cancel_requested"
    assert result.should_commit is True
    assert row.status == "cancel_requested"
    assert row.reason_code == "paper_local_cancel_requested"
    assert row.cancel_requested_at == _dt()
    assert row.finished_at is None
    assert repository.audit_events[0]["action"] == "paper_session_cancel_requested"
    assert repository.audit_events[0]["old_state"] == "running"
    assert repository.audit_events[0]["new_state"] == "cancel_requested"


@pytest.mark.parametrize(
    ("settings", "request_data", "reason_code", "semantic_status_code"),
    [
        (_settings(enabled=False), _request(), "paper_local_cancel_not_enabled", 403),
        (_settings(environment="production"), _request(), "paper_local_cancel_environment_not_allowed", 403),
        (_settings(), _request(confirm=False), "paper_local_cancel_confirm_required", 400),
        (_settings(), _request(reason="apiSecret=hidden"), "paper_local_cancel_reason_invalid", 400),
        (_settings(), _request(reason="operator_requested"), "paper_local_cancel_reason_invalid", 400),
    ],
)
def test_cancel_static_guards_block_before_lookup(settings, request_data, reason_code, semantic_status_code) -> None:
    repository = FakeRepository(FakePaperSession(status="queued"))

    result = execute_local_paper_session_cancel(
        repository,
        settings=settings,
        session_id=repository.row.id,
        request=request_data,
        now=_dt(),
    )

    assert result.status == "blocked"
    assert result.reason_code == reason_code
    assert result.should_commit is False
    assert result.semantic_status_code == semantic_status_code
    assert repository.for_update_ids == []
    assert repository.audit_events == []


def test_cancel_missing_session_returns_not_found_without_audit() -> None:
    repository = FakeRepository(None)

    result = execute_local_paper_session_cancel(
        repository,
        settings=_settings(),
        session_id=uuid4(),
        request=_request(),
        now=_dt(),
    )

    assert result.status == "blocked"
    assert result.reason_code == "paper_local_cancel_session_not_found"
    assert result.should_commit is False
    assert result.semantic_status_code == 404
    assert repository.audit_events == []


@pytest.mark.parametrize("status", ["completed", "failed", "blocked", "cancelled", "cancel_requested"])
def test_cancel_non_cancellable_state_returns_conflict_without_mutation(status: str) -> None:
    row = FakePaperSession(status=status)
    repository = FakeRepository(row)

    result = execute_local_paper_session_cancel(
        repository,
        settings=_settings(),
        session_id=row.id,
        request=_request(),
        now=_dt(),
    )

    assert result.status == "blocked"
    assert result.reason_code == "paper_local_cancel_not_cancellable"
    assert result.previous_status == status
    assert result.current_status == status
    assert result.should_commit is False
    assert result.semantic_status_code == 409
    assert row.status == status
    assert repository.audit_events == []


def test_cancel_wrong_mode_returns_wrong_mode_without_mutation() -> None:
    row = FakePaperSession(status="queued", mode="backtest")
    repository = FakeRepository(row)

    result = execute_local_paper_session_cancel(
        repository,
        settings=_settings(),
        session_id=row.id,
        request=_request(),
        now=_dt(),
    )

    assert result.status == "blocked"
    assert result.reason_code == "paper_local_cancel_wrong_mode"
    assert result.should_commit is False
    assert result.semantic_status_code == 409
    assert row.status == "queued"
    assert repository.audit_events == []


def test_local_cancel_provider_reads_cancel_requested_status() -> None:
    repository = FakeStatusRepository("cancel_requested")
    provider = LocalPaperCancelProvider(repository)
    session_id = uuid4()

    assert provider.should_cancel(str(session_id)) is True
    assert provider.kill_switch_enabled() is False
    assert repository.calls == [str(session_id)]


@pytest.mark.parametrize("status", ["queued", "running", "completed", "failed", "cancelled", None])
def test_local_cancel_provider_only_cancels_cancel_requested(status: str | None) -> None:
    provider = LocalPaperCancelProvider(FakeStatusRepository(status))

    assert provider.should_cancel(str(uuid4())) is False
