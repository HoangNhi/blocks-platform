from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

import pytest

from tradelab_api.services.paper_kill_switch import PaperKillSwitchStatus
from tradelab_api.services.paper_session_start import (
    PaperSessionStartValidationError,
    start_paper_session,
)


def _dt(hour: int) -> datetime:
    return datetime(2026, 1, 1, hour, tzinfo=timezone.utc)


_DEFAULT_VERSION_ID = object()


def _bot(
    *,
    mode: str = "paper",
    status: str = "draft",
    strategy_version_id: object | None = _DEFAULT_VERSION_ID,
    risk_config: dict[str, object] | None = None,
    runtime_config: dict[str, object] | None = None,
    metadata: dict[str, object] | None = None,
) -> SimpleNamespace:
    strategy_id = uuid4()
    resolved_strategy_version_id = uuid4() if strategy_version_id is _DEFAULT_VERSION_ID else strategy_version_id
    return SimpleNamespace(
        id=uuid4(),
        strategy_id=strategy_id,
        strategy_version_id=resolved_strategy_version_id,
        mode=mode,
        status=status,
        symbol="BTCUSDT",
        timeframe="1h",
        risk_config=risk_config or {},
        runtime_config=runtime_config or {},
        metadata_=metadata or {},
        is_active=True,
        is_deleted=False,
    )


def _version(*, validation_status: str = "valid") -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        validation_status=validation_status,
        source_hash="source-hash",
    )


def _preflight(*, outcome: str = "ready") -> SimpleNamespace:
    return SimpleNamespace(
        dataset_key="binance:BTCUSDT:1h",
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        requested_start_at=_dt(0),
        requested_end_at=_dt(2),
        outcome=outcome,
        reasons=[] if outcome == "ready" else ["Requested range is only missing head or tail coverage."],
    )


class FakeBotRepository:
    def __init__(self, bot: SimpleNamespace | None) -> None:
        self.bot = bot

    def get_bot(self, bot_id):
        return self.bot


class FakeStrategyRepository:
    def __init__(self, version: SimpleNamespace | None) -> None:
        self.version = version

    def get_strategy_version(self, version_id):
        return self.version


class FakeMarketRepository:
    pass


class FakePaperRepository:
    def __init__(self) -> None:
        self.sessions: list[SimpleNamespace] = []
        self.audit_events: list[SimpleNamespace] = []

    def find_queued_session_by_idempotency_key(self, idempotency_key: str):
        for session in reversed(self.sessions):
            if (
                session.mode == "paper"
                and session.status == "queued"
                and session.gate_context.get("idempotencyKey") == idempotency_key
            ):
                return session
        return None

    def create_paper_session(self, **fields):
        session = SimpleNamespace(id=uuid4(), **fields)
        self.sessions.append(session)
        return session

    def create_audit_event(self, **fields):
        event = SimpleNamespace(id=uuid4(), **fields)
        self.audit_events.append(event)
        return event


def _call(
    paper_repository: FakePaperRepository,
    *,
    bot: SimpleNamespace | None | object = _DEFAULT_VERSION_ID,
    strategy_version: SimpleNamespace | None | object = _DEFAULT_VERSION_ID,
    confirm_start: bool = True,
    idempotency_key: str = "idempotency-key",
    starting_cash: Decimal = Decimal("10000"),
    risk_policy_override: dict[str, object] | None = None,
    preview_fingerprint: str | None = None,
    source: str = "unit_test",
    actor: str = "local-user",
):
    resolved_bot = _bot() if bot is _DEFAULT_VERSION_ID else bot
    resolved_version = _version() if strategy_version is _DEFAULT_VERSION_ID else strategy_version
    return start_paper_session(
        FakeBotRepository(resolved_bot),
        FakeStrategyRepository(resolved_version),
        FakeMarketRepository(),
        paper_repository,
        bot_id=resolved_bot.id if resolved_bot is not None else uuid4(),
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        start_at=_dt(0),
        end_at=_dt(2),
        starting_cash=starting_cash,
        risk_policy_override=risk_policy_override,
        preview_fingerprint=preview_fingerprint,
        idempotency_key=idempotency_key,
        confirm_start=confirm_start,
        source=source,
        actor=actor,
    )


def test_start_requires_confirm_start() -> None:
    paper_repository = FakePaperRepository()

    with pytest.raises(PaperSessionStartValidationError) as exc_info:
        _call(paper_repository, confirm_start=False)

    assert exc_info.value.status_code == 400
    assert exc_info.value.reason_code == "paper_start_confirmation_required"
    assert paper_repository.sessions == []
    assert paper_repository.audit_events == []


def test_start_requires_idempotency_key() -> None:
    paper_repository = FakePaperRepository()

    with pytest.raises(PaperSessionStartValidationError) as exc_info:
        _call(paper_repository, idempotency_key=" ")

    assert exc_info.value.status_code == 400
    assert exc_info.value.reason_code == "paper_idempotency_key_required"
    assert paper_repository.sessions == []
    assert paper_repository.audit_events == []


def test_start_rejects_invalid_range() -> None:
    bot = _bot()
    paper_repository = FakePaperRepository()

    with pytest.raises(PaperSessionStartValidationError) as exc_info:
        start_paper_session(
            FakeBotRepository(bot),
            FakeStrategyRepository(_version()),
            FakeMarketRepository(),
            paper_repository,
            bot_id=bot.id,
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            start_at=_dt(2),
            end_at=_dt(2),
            starting_cash=Decimal("10000"),
            risk_policy_override=None,
            preview_fingerprint=None,
            idempotency_key="idempotency-key",
            confirm_start=True,
            source="unit_test",
            actor="local-user",
        )

    assert exc_info.value.status_code == 400
    assert exc_info.value.reason_code == "paper_start_range_invalid"
    assert paper_repository.sessions == []
    assert paper_repository.audit_events == []


def test_start_missing_bot_returns_machine_readable_error() -> None:
    paper_repository = FakePaperRepository()

    with pytest.raises(PaperSessionStartValidationError) as exc_info:
        start_paper_session(
            FakeBotRepository(None),
            FakeStrategyRepository(None),
            FakeMarketRepository(),
            paper_repository,
            bot_id=uuid4(),
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            start_at=_dt(0),
            end_at=_dt(2),
            starting_cash=Decimal("10000"),
            risk_policy_override=None,
            preview_fingerprint=None,
            idempotency_key="idempotency-key",
            confirm_start=True,
            source="unit_test",
            actor="local-user",
        )

    assert exc_info.value.status_code == 404
    assert exc_info.value.reason_code == "paper_bot_not_found"
    assert paper_repository.sessions == []
    assert paper_repository.audit_events == []


def test_start_blocks_when_gate_fails_without_session_or_audit(monkeypatch) -> None:
    paper_repository = FakePaperRepository()
    monkeypatch.setattr(
        "tradelab_api.services.paper_session_start.build_preflight_result",
        lambda repository, **kwargs: _preflight(outcome="needs_fill"),
    )

    result = _call(paper_repository)

    assert result.semantic_status_code == 200
    assert result.should_commit is False
    assert result.session_id is None
    assert result.status == "blocked"
    assert result.allowed is False
    assert result.reason_code == "paper_dataset_not_ready"
    assert result.audit_event_ids == []
    assert paper_repository.sessions == []
    assert paper_repository.audit_events == []


def test_start_blocks_when_kill_switch_enabled_without_session_or_audit() -> None:
    bot = _bot()
    paper_repository = FakePaperRepository()

    result = start_paper_session(
        FakeBotRepository(bot),
        FakeStrategyRepository(_version()),
        FakeMarketRepository(),
        paper_repository,
        bot_id=bot.id,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        start_at=_dt(0),
        end_at=_dt(2),
        starting_cash=Decimal("10000"),
        risk_policy_override=None,
        preview_fingerprint=None,
        idempotency_key="idempotency-key",
        confirm_start=True,
        source="unit_test",
        actor="local-user",
        kill_switch_status=PaperKillSwitchStatus(
            enabled=True,
            reason_code="paper_kill_switch_enabled",
            details={"environment": "local", "localDevOnly": True},
        ),
    )

    assert result.semantic_status_code == 200
    assert result.should_commit is False
    assert result.session_id is None
    assert result.status == "blocked"
    assert result.allowed is False
    assert result.reason_code == "paper_kill_switch_enabled"
    assert result.safety_status == "paper_start_blocked_by_kill_switch"
    assert result.audit_event_ids == []
    assert result.failed_gates[0].reason_code == "paper_kill_switch_enabled"
    assert result.details["killSwitch"]["enabled"] is True
    assert paper_repository.sessions == []
    assert paper_repository.audit_events == []


def test_start_allowed_creates_one_queued_session_and_audit(monkeypatch) -> None:
    bot = _bot(runtime_config={"initialEquity": 10000}, risk_config={"maxOpenPositions": 2})
    strategy_version = _version()
    paper_repository = FakePaperRepository()
    monkeypatch.setattr(
        "tradelab_api.services.paper_session_start.build_preflight_result",
        lambda repository, **kwargs: _preflight(outcome="ready"),
    )

    result = _call(
        paper_repository,
        bot=bot,
        strategy_version=strategy_version,
        preview_fingerprint="preview-fingerprint",
    )

    assert result.semantic_status_code == 201
    assert result.should_commit is True
    assert result.status == "queued"
    assert result.allowed is True
    assert result.reason_code == "paper_session_queued"
    assert result.safety_status == "paper_start_accepted"
    assert result.session_id == str(paper_repository.sessions[0].id)
    assert result.request_fingerprint.startswith("paper-start:")
    assert len(paper_repository.sessions) == 1
    session = paper_repository.sessions[0]
    assert session.status == "queued"
    assert session.mode == "paper"
    assert session.bot_id == bot.id
    assert session.strategy_id == bot.strategy_id
    assert session.strategy_version_id == bot.strategy_version_id
    assert session.starting_cash == Decimal("10000")
    assert session.gate_context["idempotencyKey"] == "idempotency-key"
    assert session.gate_context["requestFingerprint"] == result.request_fingerprint
    assert session.gate_context["previewFingerprint"] == "preview-fingerprint"
    assert session.gate_context["gateResult"]["reasonCode"] == "paper_risk_gate_passed"
    assert session.reason_code == "paper_session_queued"
    assert len(paper_repository.audit_events) == 1
    assert paper_repository.audit_events[0].action == "paper_session_queued"
    assert paper_repository.audit_events[0].paper_session_id == session.id


def test_start_replays_existing_session_with_same_fingerprint(monkeypatch) -> None:
    bot = _bot()
    strategy_version = _version()
    paper_repository = FakePaperRepository()
    monkeypatch.setattr(
        "tradelab_api.services.paper_session_start.build_preflight_result",
        lambda repository, **kwargs: _preflight(outcome="ready"),
    )
    first = _call(paper_repository, bot=bot, strategy_version=strategy_version)

    second = _call(paper_repository, bot=bot, strategy_version=strategy_version)

    assert second.semantic_status_code == 200
    assert second.should_commit is True
    assert second.session_id == first.session_id
    assert second.reason_code == "paper_idempotency_replayed"
    assert len(paper_repository.sessions) == 1
    assert [event.action for event in paper_repository.audit_events] == [
        "paper_session_queued",
        "paper_idempotency_replayed",
    ]


def test_start_conflicts_on_same_key_with_different_fingerprint(monkeypatch) -> None:
    bot = _bot()
    strategy_version = _version()
    paper_repository = FakePaperRepository()
    monkeypatch.setattr(
        "tradelab_api.services.paper_session_start.build_preflight_result",
        lambda repository, **kwargs: _preflight(outcome="ready"),
    )
    first = _call(paper_repository, bot=bot, strategy_version=strategy_version)

    with pytest.raises(PaperSessionStartValidationError) as exc_info:
        _call(
            paper_repository,
            bot=bot,
            strategy_version=strategy_version,
            starting_cash=Decimal("20000"),
        )

    assert exc_info.value.status_code == 409
    assert exc_info.value.reason_code == "paper_idempotency_conflict"
    assert exc_info.value.should_commit is True
    assert exc_info.value.details["sessionId"] == first.session_id
    assert len(paper_repository.sessions) == 1
    assert [event.action for event in paper_repository.audit_events] == [
        "paper_session_queued",
        "paper_idempotency_conflict",
    ]


def test_start_rejects_secret_like_context_without_echoing_secret(monkeypatch) -> None:
    bot = _bot(metadata={"apiSecret": "super-secret-value"})
    paper_repository = FakePaperRepository()
    monkeypatch.setattr(
        "tradelab_api.services.paper_session_start.build_preflight_result",
        lambda repository, **kwargs: _preflight(outcome="ready"),
    )

    with pytest.raises(PaperSessionStartValidationError) as exc_info:
        _call(paper_repository, bot=bot)

    assert exc_info.value.status_code == 400
    assert exc_info.value.reason_code == "paper_secret_not_allowed"
    assert "metadata.apiSecret" in exc_info.value.details["blockedFields"]
    assert "super-secret-value" not in repr(exc_info.value.details)
    assert paper_repository.sessions == []
    assert paper_repository.audit_events == []
