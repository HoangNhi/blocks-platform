from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest

from tradelab_api.services.paper_kill_switch import PaperKillSwitchStatus
from tradelab_api.services.paper_session_retry_local import (
    LOCAL_PAPER_RETRY_SAFETY_STATUS,
    PaperSessionRetryLocalRequestData,
    execute_local_paper_session_retry,
)


def _dt(hour: int) -> datetime:
    return datetime(2026, 1, 1, hour, tzinfo=timezone.utc)


def _settings(*, enabled: bool = True, environment: str = "local") -> SimpleNamespace:
    return SimpleNamespace(
        tradelab_local_paper_engine_enabled=enabled,
        tradelab_environment=environment,
        tradelab_local_paper_kill_switch_enabled=False,
    )


def _request(
    *,
    confirm: bool = True,
    idempotency_key: str = "retry-click-1",
    reason: str = "user_requested",
    actor: str = "admin",
) -> PaperSessionRetryLocalRequestData:
    return PaperSessionRetryLocalRequestData(
        confirm_local_paper_retry=confirm,
        idempotency_key=idempotency_key,
        reason=reason,
        actor=actor,
    )


class FakePaperSession:
    def __init__(self, *, status: str = "failed", mode: str = "paper") -> None:
        self.id = uuid4()
        self.bot_id = uuid4()
        self.strategy_id = uuid4()
        self.strategy_version_id = uuid4()
        self.mode = mode
        self.status = status
        self.exchange = "binance"
        self.symbol = "BTCUSDT"
        self.timeframe = "1h"
        self.dataset_key = "binance:BTCUSDT:1h"
        self.start_at = _dt(0)
        self.end_at = _dt(2)
        self.starting_cash = Decimal("10000")
        self.runtime_config = {"initialEquity": 10000}
        self.risk_config = {"maxOpenPositions": 2}
        self.source_snapshot = {"source": "unit_test"}
        self.dataset_context = {"datasetKey": self.dataset_key}
        self.gate_context = {"source": "unit_test"}
        self.reason_code = "paper_engine_strategy_failed"
        self.error_message = "strategy failed"
        self.updated_at = None
        self.updated_by = None


class FakePaperRepository:
    def __init__(self, source: FakePaperSession | None) -> None:
        self.source = source
        self.retry_session: SimpleNamespace | None = None
        self.audit_events: list[dict[str, object]] = []
        self.for_update_ids: list[object] = []

    def get_paper_session_for_update(self, session_id):
        self.for_update_ids.append(session_id)
        if self.source and self.source.id == session_id:
            return self.source
        return None

    def find_retry_session_by_source_and_idempotency_key(self, source_session_id, idempotency_key):
        if self.retry_session is None:
            return None
        gate_context = dict(self.retry_session.gate_context or {})
        retry = dict(gate_context.get("retry") or {})
        if (
            retry.get("sourceSessionId") == str(source_session_id)
            and gate_context.get("idempotencyKey") == idempotency_key
        ):
            return self.retry_session
        return None

    def create_paper_session(self, **fields):
        self.retry_session = SimpleNamespace(id=uuid4(), **fields)
        return self.retry_session

    def find_queued_session_by_idempotency_key(self, idempotency_key):
        if self.retry_session and self.retry_session.gate_context.get("idempotencyKey") == idempotency_key:
            return self.retry_session
        return None

    def create_audit_event(self, **fields):
        self.audit_events.append(fields)
        return SimpleNamespace(id=uuid4(), **fields)


class FakeBotRepository:
    def __init__(self, source: FakePaperSession) -> None:
        self.source = source

    def get_bot(self, bot_id):
        return SimpleNamespace(
            id=self.source.bot_id,
            strategy_id=self.source.strategy_id,
            strategy_version_id=self.source.strategy_version_id,
            mode="paper",
            status="draft",
            symbol=self.source.symbol,
            timeframe=self.source.timeframe,
            risk_config={},
            runtime_config=self.source.runtime_config,
            metadata_={},
            is_active=True,
            is_deleted=False,
        )


class FakeStrategyRepository:
    def __init__(self, source: FakePaperSession) -> None:
        self.source = source

    def get_strategy_version(self, version_id):
        return SimpleNamespace(id=self.source.strategy_version_id, validation_status="valid", source_hash="hash")


class FakeMarketRepository:
    pass


def _call(
    source: FakePaperSession | None,
    *,
    settings: object | None = None,
    request: PaperSessionRetryLocalRequestData | None = None,
    kill_switch_status: PaperKillSwitchStatus | None = None,
):
    repository = FakePaperRepository(source)
    result = execute_local_paper_session_retry(
        FakeBotRepository(source or FakePaperSession()),
        FakeStrategyRepository(source or FakePaperSession()),
        FakeMarketRepository(),
        repository,
        settings=settings or _settings(),
        session_id=source.id if source else uuid4(),
        request=request or _request(),
        kill_switch_status=kill_switch_status
        or PaperKillSwitchStatus(
            enabled=False,
            reason_code="paper_kill_switch_status_read",
            details={"environment": "local", "localDevOnly": True},
        ),
    )
    return result, repository


def test_retry_failed_source_creates_new_queued_session_and_audits(monkeypatch) -> None:
    source = FakePaperSession(status="failed")
    source.original_orders_marker = object()
    source.original_snapshots_marker = object()
    monkeypatch.setattr(
        "tradelab_api.services.paper_session_start.build_preflight_result",
        lambda repository, **kwargs: SimpleNamespace(
            dataset_key=source.dataset_key,
            exchange=source.exchange,
            symbol=source.symbol,
            timeframe=source.timeframe,
            outcome="ready",
        ),
    )

    result, repository = _call(source)

    assert result.status == "queued"
    assert result.reason_code == "paper_local_retry_queued"
    assert result.safety_status == LOCAL_PAPER_RETRY_SAFETY_STATUS
    assert result.source_session_id == str(source.id)
    assert result.retry_session_id == str(repository.retry_session.id)
    assert result.source_status == "failed"
    assert result.retry_status == "queued"
    assert result.should_commit is True
    assert result.semantic_status_code == 201
    assert source.status == "failed"
    assert source.reason_code == "paper_engine_strategy_failed"
    assert getattr(source, "original_orders_marker") is not None
    assert getattr(source, "original_snapshots_marker") is not None
    assert repository.retry_session.status == "queued"
    assert repository.retry_session.gate_context["retry"]["sourceSessionId"] == str(source.id)
    assert [event["action"] for event in repository.audit_events][-2:] == [
        "paper_session_retry_requested",
        "paper_session_retry_queued",
    ]


@pytest.mark.parametrize("status", ["blocked", "cancelled"])
def test_retry_other_retryable_terminal_statuses_create_new_session(monkeypatch, status: str) -> None:
    source = FakePaperSession(status=status)
    monkeypatch.setattr(
        "tradelab_api.services.paper_session_start.build_preflight_result",
        lambda repository, **kwargs: SimpleNamespace(
            dataset_key=source.dataset_key,
            exchange=source.exchange,
            symbol=source.symbol,
            timeframe=source.timeframe,
            outcome="ready",
        ),
    )

    result, repository = _call(source)

    assert result.status == "queued"
    assert result.source_status == status
    assert repository.retry_session.gate_context["retry"]["sourceStatus"] == status
    assert source.status == status


@pytest.mark.parametrize("status", ["queued", "running", "cancel_requested", "completed"])
def test_retry_blocks_non_retryable_statuses(status: str) -> None:
    source = FakePaperSession(status=status)

    result, repository = _call(source)

    assert result.status == "blocked"
    assert result.reason_code == "paper_local_retry_not_retryable"
    assert result.source_status == status
    assert result.retry_session_id is None
    assert result.should_commit is False
    assert result.semantic_status_code == 409
    assert repository.retry_session is None


@pytest.mark.parametrize(
    ("settings", "request_data", "reason_code", "semantic_status_code"),
    [
        (_settings(enabled=False), _request(), "paper_local_retry_not_enabled", 403),
        (_settings(environment="production"), _request(), "paper_local_retry_environment_not_allowed", 403),
        (_settings(), _request(confirm=False), "paper_local_retry_confirm_required", 400),
        (_settings(), _request(idempotency_key=" "), "paper_local_retry_idempotency_required", 400),
        (_settings(), _request(idempotency_key="secret-token"), "paper_local_retry_idempotency_invalid", 400),
        (_settings(), _request(reason="operator_requested"), "paper_local_retry_reason_invalid", 400),
    ],
)
def test_retry_static_guards_block_before_source_lookup(
    settings,
    request_data,
    reason_code,
    semantic_status_code,
) -> None:
    source = FakePaperSession(status="failed")
    result, repository = _call(source, settings=settings, request=request_data)

    assert result.status == "blocked"
    assert result.reason_code == reason_code
    assert result.should_commit is False
    assert result.semantic_status_code == semantic_status_code
    assert repository.for_update_ids == []
    assert repository.audit_events == []


def test_retry_missing_source_returns_not_found() -> None:
    result, repository = _call(None)

    assert result.status == "blocked"
    assert result.reason_code == "paper_local_retry_source_not_found"
    assert result.semantic_status_code == 404
    assert repository.audit_events == []


def test_retry_wrong_mode_blocks_without_mutation() -> None:
    source = FakePaperSession(status="failed", mode="backtest")

    result, repository = _call(source)

    assert result.status == "blocked"
    assert result.reason_code == "paper_local_retry_wrong_mode"
    assert result.semantic_status_code == 409
    assert repository.retry_session is None


def test_retry_kill_switch_enabled_blocks_with_source_audit() -> None:
    source = FakePaperSession(status="failed")

    result, repository = _call(
        source,
        kill_switch_status=PaperKillSwitchStatus(
            enabled=True,
            reason_code="paper_kill_switch_enabled",
            details={"environment": "local", "localDevOnly": True},
        ),
    )

    assert result.status == "blocked"
    assert result.reason_code == "paper_kill_switch_enabled"
    assert result.retry_session_id is None
    assert result.should_commit is True
    assert result.semantic_status_code == 403
    assert repository.retry_session is None
    assert repository.audit_events[0]["action"] == "paper_session_retry_blocked_by_kill_switch"


def test_retry_gate_failure_blocks_with_source_audit(monkeypatch) -> None:
    source = FakePaperSession(status="failed")
    monkeypatch.setattr(
        "tradelab_api.services.paper_session_start.build_preflight_result",
        lambda repository, **kwargs: SimpleNamespace(
            dataset_key=source.dataset_key,
            exchange=source.exchange,
            symbol=source.symbol,
            timeframe=source.timeframe,
            outcome="needs_fill",
        ),
    )

    result, repository = _call(source)

    assert result.status == "blocked"
    assert result.reason_code == "paper_local_retry_gate_failed"
    assert result.retry_session_id is None
    assert result.should_commit is True
    assert repository.retry_session is None
    assert repository.audit_events[0]["action"] == "paper_session_retry_blocked"


def test_retry_idempotent_replay_returns_existing_retry_session(monkeypatch) -> None:
    source = FakePaperSession(status="failed")
    monkeypatch.setattr(
        "tradelab_api.services.paper_session_start.build_preflight_result",
        lambda repository, **kwargs: SimpleNamespace(
            dataset_key=source.dataset_key,
            exchange=source.exchange,
            symbol=source.symbol,
            timeframe=source.timeframe,
            outcome="ready",
        ),
    )
    result, repository = _call(source)

    replay = execute_local_paper_session_retry(
        FakeBotRepository(source),
        FakeStrategyRepository(source),
        FakeMarketRepository(),
        repository,
        settings=_settings(),
        session_id=source.id,
        request=_request(),
        kill_switch_status=PaperKillSwitchStatus(
            enabled=False,
            reason_code="paper_kill_switch_status_read",
            details={"environment": "local", "localDevOnly": True},
        ),
    )

    assert replay.status == "queued"
    assert replay.reason_code == "paper_local_retry_idempotency_replayed"
    assert replay.retry_session_id == result.retry_session_id
    assert replay.semantic_status_code == 200
