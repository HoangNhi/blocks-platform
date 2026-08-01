from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from tradelab_api.services.paper_kill_switch import PaperKillSwitchStatus
from tradelab_api.services.paper_session_resume_local import (
    LOCAL_PAPER_RESUME_SAFETY_STATUS,
    PaperSessionResumeLocalRequestData,
    execute_local_paper_session_resume,
)


def _dt(hour: int) -> datetime:
    return datetime(2026, 1, 1, hour, tzinfo=timezone.utc)


def _settings(*, environment: str = "local", enabled: bool = True) -> SimpleNamespace:
    return SimpleNamespace(
        tradelab_environment=environment,
        tradelab_local_paper_engine_enabled=enabled,
    )


def _kill_switch(*, enabled: bool = False) -> PaperKillSwitchStatus:
    return PaperKillSwitchStatus(
        enabled=enabled,
        reason_code="paper_kill_switch_enabled" if enabled else "paper_kill_switch_disabled",
        safety_status="local_dev_paper_kill_switch",
        source="test",
        updated_at=None,
        updated_by=None,
        details={},
    )


def _request(**overrides) -> PaperSessionResumeLocalRequestData:
    values = {
        "confirm_local_paper_resume": True,
        "idempotency_key": "resume-key-1",
        "reason": "user_requested",
        "actor": "admin",
    }
    values.update(overrides)
    return PaperSessionResumeLocalRequestData(**values)


@dataclass
class FakeResumeRepository:
    source: SimpleNamespace | None = None
    existing_resume: SimpleNamespace | None = None
    audits: list[dict[str, object]] = field(default_factory=list)

    def get_paper_session_for_update(self, session_id: UUID):
        return self.source if self.source is not None and self.source.id == session_id else None

    def find_resumed_session_by_source_and_idempotency_key(
        self,
        source_session_id: UUID,
        idempotency_key: str,
    ):
        if self.existing_resume is None:
            return None
        gate_context = dict(self.existing_resume.gate_context or {})
        resume = dict(gate_context.get("resume") or {})
        if resume.get("sourceSessionId") == str(source_session_id) and resume.get("idempotencyKey") == idempotency_key:
            return self.existing_resume
        return None

    def create_audit_event(self, **fields):
        event = SimpleNamespace(id=uuid4(), **fields)
        self.audits.append(fields)
        return event


def _source_session(*, status: str = "cancelled", reason_code: str = "paper_session_cancel_requested") -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        mode="paper",
        status=status,
        reason_code=reason_code,
        gate_context={},
        cancel_requested_at=_dt(1),
        finished_at=_dt(2),
        updated_at=_dt(2),
        updated_by="pytest",
    )


@pytest.mark.parametrize(
    ("resume_request", "settings", "expected_reason", "expected_status"),
    [
        (_request(confirm_local_paper_resume=False), _settings(), "paper_local_resume_confirm_required", 400),
        (_request(idempotency_key=""), _settings(), "paper_local_resume_idempotency_required", 400),
        (_request(idempotency_key="secret-token"), _settings(), "paper_local_resume_idempotency_invalid", 400),
        (_request(idempotency_key="x" * 121), _settings(), "paper_local_resume_idempotency_invalid", 400),
        (_request(reason="operator_override"), _settings(), "paper_local_resume_reason_invalid", 400),
        (_request(), _settings(environment="prod"), "paper_local_resume_environment_not_allowed", 403),
        (_request(), _settings(enabled=False), "paper_local_resume_not_enabled", 403),
    ],
)
def test_resume_local_static_guards(resume_request, settings, expected_reason: str, expected_status: int) -> None:
    repository = FakeResumeRepository(source=_source_session())

    result = execute_local_paper_session_resume(
        repository,
        settings=settings,
        session_id=repository.source.id,
        request=resume_request,
        kill_switch_status=_kill_switch(),
        readiness_builder=lambda repository, session_id: None,
    )

    assert result.status == "blocked"
    assert result.reason_code == expected_reason
    assert result.safety_status == LOCAL_PAPER_RESUME_SAFETY_STATUS
    assert result.semantic_status_code == expected_status
    assert result.should_commit is False
    assert repository.audits == []


def _checkpoint() -> SimpleNamespace:
    return SimpleNamespace(
        last_processed_candle_id=str(uuid4()),
        last_processed_candle_open_time=_dt(2),
        next_candle_id=str(uuid4()),
        next_candle_open_time=_dt(3),
        cash_balance=Decimal("9900"),
        equity=Decimal("10050"),
        realized_pnl=Decimal("25"),
        unrealized_pnl=Decimal("125"),
        fees_paid=Decimal("1.5"),
        exposure_notional=Decimal("500"),
        open_position_quantity=Decimal("0.25"),
        average_entry_price=Decimal("40000"),
        pending_orders_count=0,
    )


def _readiness(
    *,
    allowed: bool = True,
    reason_code: str = "paper_local_resume_readiness_ready",
    blocking_reasons: list[str] | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        allowed=allowed,
        reason_code=reason_code,
        checkpoint=_checkpoint() if allowed else None,
        checkpoint_source="persisted" if allowed else "missing",
        artifact_identity_status="ready",
        attempt_no=0,
        blocking_reasons=blocking_reasons or [],
        details={"readOnly": True},
    )


def _builder(result: SimpleNamespace):
    return lambda repository, *, session_id: result


def test_resume_local_blocks_missing_source() -> None:
    repository = FakeResumeRepository(source=None)

    result = execute_local_paper_session_resume(
        repository,
        settings=_settings(),
        session_id=uuid4(),
        request=_request(),
        kill_switch_status=_kill_switch(),
        readiness_builder=_builder(_readiness()),
    )

    assert result.reason_code == "paper_local_resume_source_not_found"
    assert result.semantic_status_code == 404


@pytest.mark.parametrize(
    ("mode", "status", "reason_code", "expected_reason"),
    [
        ("backtest", "cancelled", "paper_session_cancel_requested", "paper_local_resume_wrong_mode"),
        ("paper", "queued", "paper_session_queued", "paper_local_resume_not_resumable"),
        ("paper", "completed", "paper_engine_completed", "paper_local_resume_not_resumable"),
        ("paper", "cancelled", "paper_local_cancelled", "paper_local_resume_not_resumable"),
    ],
)
def test_resume_local_blocks_wrong_source_state(
    mode: str,
    status: str,
    reason_code: str,
    expected_reason: str,
) -> None:
    source = _source_session(status=status, reason_code=reason_code)
    source.mode = mode
    repository = FakeResumeRepository(source=source)

    result = execute_local_paper_session_resume(
        repository,
        settings=_settings(),
        session_id=source.id,
        request=_request(),
        kill_switch_status=_kill_switch(),
        readiness_builder=_builder(_readiness()),
    )

    assert result.reason_code == expected_reason
    assert result.source_session_id == str(source.id)
    assert result.source_status == status
    assert result.semantic_status_code == 409


def test_resume_local_blocks_current_kill_switch_and_writes_audit() -> None:
    source = _source_session()
    repository = FakeResumeRepository(source=source)

    result = execute_local_paper_session_resume(
        repository,
        settings=_settings(),
        session_id=source.id,
        request=_request(actor="admin"),
        kill_switch_status=_kill_switch(enabled=True),
        readiness_builder=_builder(_readiness()),
    )

    assert result.reason_code == "paper_local_resume_kill_switch_enabled"
    assert result.semantic_status_code == 403
    assert result.should_commit is True
    assert repository.audits[-1]["action"] == "paper_session_resume_blocked_by_kill_switch"


def test_resume_local_blocks_failed_readiness_and_writes_audit() -> None:
    source = _source_session()
    repository = FakeResumeRepository(source=source)

    result = execute_local_paper_session_resume(
        repository,
        settings=_settings(),
        session_id=source.id,
        request=_request(),
        kill_switch_status=_kill_switch(),
        readiness_builder=_builder(
            _readiness(
                allowed=False,
                reason_code="paper_local_resume_checkpoint_missing",
                blocking_reasons=["paper_local_resume_checkpoint_missing"],
            )
        ),
    )

    assert result.reason_code == "paper_local_resume_checkpoint_missing"
    assert result.semantic_status_code == 422
    assert result.should_commit is True
    assert repository.audits[-1]["action"] == "paper_session_resume_checkpoint_missing"


def test_resume_local_idempotent_replay_returns_existing_resume() -> None:
    source = _source_session()
    scoped = f"paper-resume:{source.id}:resume-key-1"
    existing = _source_session(status="queued", reason_code="paper_local_resume_queued")
    existing.id = source.id
    existing.gate_context = {"resume": {"sourceSessionId": str(source.id), "idempotencyKey": scoped, "attemptNo": 1}}
    repository = FakeResumeRepository(source=source, existing_resume=existing)

    result = execute_local_paper_session_resume(
        repository,
        settings=_settings(),
        session_id=source.id,
        request=_request(),
        kill_switch_status=_kill_switch(),
        readiness_builder=_builder(_readiness()),
    )

    assert result.reason_code == "paper_local_resume_idempotency_replayed"
    assert result.resume_session_id == str(source.id)
    assert result.resume_status == "queued"
    assert result.idempotency_key == scoped
    assert result.should_commit is True


def test_resume_local_requeues_same_session_with_resume_context_and_audit() -> None:
    source = _source_session()
    repository = FakeResumeRepository(source=source)

    result = execute_local_paper_session_resume(
        repository,
        settings=_settings(),
        session_id=source.id,
        request=_request(actor="admin"),
        kill_switch_status=_kill_switch(),
        readiness_builder=_builder(_readiness()),
    )

    assert result.status == "queued"
    assert result.reason_code == "paper_local_resume_queued"
    assert result.resume_session_id == str(source.id)
    assert result.source_status == "cancelled"
    assert result.resume_status == "queued"
    assert result.resume_cursor is not None
    assert result.resume_cursor.attempt_no == 1
    assert source.status == "queued"
    assert source.reason_code == "paper_local_resume_queued"
    assert source.finished_at is None
    assert source.gate_context["resume"]["attemptNo"] == 1
    assert source.gate_context["resume"]["implementationMode"] == "same_session"
    assert [event["action"] for event in repository.audits] == [
        "paper_session_resume_requested",
        "paper_session_resume_queued",
    ]
    assert result.should_commit is True
