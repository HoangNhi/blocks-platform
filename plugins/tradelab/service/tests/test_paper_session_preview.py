from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from tradelab_api.services.paper_kill_switch import PaperKillSwitchStatus
from tradelab_api.services.paper_session_preview import (
    PaperSessionPreviewValidationError,
    build_paper_session_preview,
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
    return SimpleNamespace(id=uuid4(), validation_status=validation_status)


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
        self.requested_version_id = None

    def get_strategy_version(self, version_id):
        self.requested_version_id = version_id
        return self.version


class FakeMarketRepository:
    pass


def test_build_paper_session_preview_allows_ready_paper_draft(monkeypatch) -> None:
    bot = _bot()
    strategy_version = _version()

    monkeypatch.setattr(
        "tradelab_api.services.paper_session_preview.build_preflight_result",
        lambda repository, **kwargs: _preflight(outcome="ready"),
    )

    result = build_paper_session_preview(
        FakeBotRepository(bot),
        FakeStrategyRepository(strategy_version),
        FakeMarketRepository(),
        bot_id=bot.id,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        start_at=_dt(0),
        end_at=_dt(2),
        risk_policy_override=None,
        source="unit_test",
    )

    assert result.mode == "paper"
    assert result.preview_status == "allowed"
    assert result.allowed is True
    assert result.reason_code == "paper_risk_gate_passed"
    assert result.failed_gates == []
    assert result.safety_status == "read_only_preview"
    assert result.bot_context.mode == "paper"
    assert result.strategy_context.source_valid is True
    assert result.dataset_context.preflight_outcome == "ready"


def test_build_paper_session_preview_blocks_non_paper_bot(monkeypatch) -> None:
    bot = _bot(mode="backtest")

    monkeypatch.setattr(
        "tradelab_api.services.paper_session_preview.build_preflight_result",
        lambda repository, **kwargs: _preflight(outcome="ready"),
    )

    result = build_paper_session_preview(
        FakeBotRepository(bot),
        FakeStrategyRepository(_version()),
        FakeMarketRepository(),
        bot_id=bot.id,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        start_at=_dt(0),
        end_at=_dt(2),
    )

    assert result.preview_status == "blocked"
    assert result.allowed is False
    assert result.reason_code == "paper_bot_not_draft"
    assert [failure.reason_code for failure in result.failed_gates] == ["paper_bot_not_draft"]


def test_build_paper_session_preview_blocks_dataset_not_ready(monkeypatch) -> None:
    bot = _bot()

    monkeypatch.setattr(
        "tradelab_api.services.paper_session_preview.build_preflight_result",
        lambda repository, **kwargs: _preflight(outcome="needs_fill"),
    )

    result = build_paper_session_preview(
        FakeBotRepository(bot),
        FakeStrategyRepository(_version()),
        FakeMarketRepository(),
        bot_id=bot.id,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        start_at=_dt(0),
        end_at=_dt(2),
    )

    assert result.preview_status == "blocked"
    assert result.reason_code == "paper_dataset_not_ready"
    assert result.failed_gates[0].data == {"sourceReasonCode": "needs_fill"}
    assert result.dataset_context.preflight_outcome == "needs_fill"


def test_preview_blocks_when_kill_switch_enabled(monkeypatch) -> None:
    bot = _bot()
    monkeypatch.setattr(
        "tradelab_api.services.paper_session_preview.build_preflight_result",
        lambda repository, **kwargs: _preflight(outcome="ready"),
    )

    result = build_paper_session_preview(
        FakeBotRepository(bot),
        FakeStrategyRepository(_version()),
        FakeMarketRepository(),
        bot_id=bot.id,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        start_at=_dt(0),
        end_at=_dt(2),
        kill_switch_status=PaperKillSwitchStatus(
            enabled=True,
            reason_code="paper_kill_switch_enabled",
            details={"environment": "local", "localDevOnly": True},
        ),
    )

    assert result.preview_status == "blocked"
    assert result.allowed is False
    assert result.reason_code == "paper_kill_switch_enabled"
    assert [failure.reason_code for failure in result.failed_gates] == ["paper_kill_switch_enabled"]
    assert result.details["killSwitch"]["enabled"] is True


def test_build_paper_session_preview_blocks_missing_strategy_version(monkeypatch) -> None:
    bot = _bot(strategy_version_id=None)

    monkeypatch.setattr(
        "tradelab_api.services.paper_session_preview.build_preflight_result",
        lambda repository, **kwargs: _preflight(outcome="ready"),
    )

    result = build_paper_session_preview(
        FakeBotRepository(bot),
        FakeStrategyRepository(None),
        FakeMarketRepository(),
        bot_id=bot.id,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        start_at=_dt(0),
        end_at=_dt(2),
    )

    assert result.preview_status == "blocked"
    assert "paper_strategy_version_missing" in [failure.reason_code for failure in result.failed_gates]


def test_build_paper_session_preview_returns_secret_gate_without_echoing_secret_value(monkeypatch) -> None:
    bot = _bot(metadata={"apiSecret": "super-secret-value"})

    monkeypatch.setattr(
        "tradelab_api.services.paper_session_preview.build_preflight_result",
        lambda repository, **kwargs: _preflight(outcome="ready"),
    )

    result = build_paper_session_preview(
        FakeBotRepository(bot),
        FakeStrategyRepository(_version()),
        FakeMarketRepository(),
        bot_id=bot.id,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        start_at=_dt(0),
        end_at=_dt(2),
    )

    assert result.preview_status == "blocked"
    assert "paper_secret_not_allowed" in [failure.reason_code for failure in result.failed_gates]
    assert "super-secret-value" not in repr(result)


def test_build_paper_session_preview_uses_risk_policy_override(monkeypatch) -> None:
    bot = _bot()

    monkeypatch.setattr(
        "tradelab_api.services.paper_session_preview.build_preflight_result",
        lambda repository, **kwargs: _preflight(outcome="ready"),
    )

    result = build_paper_session_preview(
        FakeBotRepository(bot),
        FakeStrategyRepository(_version()),
        FakeMarketRepository(),
        bot_id=bot.id,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        start_at=_dt(0),
        end_at=_dt(2),
        risk_policy_override={"startingCash": 0},
    )

    assert result.preview_status == "blocked"
    assert result.reason_code == "paper_starting_cash_invalid"


def test_build_paper_session_preview_raises_machine_readable_bot_missing_error() -> None:
    with pytest.raises(PaperSessionPreviewValidationError) as exc_info:
        build_paper_session_preview(
            FakeBotRepository(None),
            FakeStrategyRepository(None),
            FakeMarketRepository(),
            bot_id=uuid4(),
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            start_at=_dt(0),
            end_at=_dt(2),
        )

    assert exc_info.value.status_code == 404
    assert exc_info.value.reason_code == "paper_bot_not_found"
    assert exc_info.value.message == "Paper bot not found."


def test_build_paper_session_preview_raises_machine_readable_invalid_range_error() -> None:
    bot = _bot()

    with pytest.raises(PaperSessionPreviewValidationError) as exc_info:
        build_paper_session_preview(
            FakeBotRepository(bot),
            FakeStrategyRepository(_version()),
            FakeMarketRepository(),
            bot_id=bot.id,
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            start_at=_dt(2),
            end_at=_dt(0),
        )

    assert exc_info.value.status_code == 400
    assert exc_info.value.reason_code == "paper_preview_range_invalid"
    assert exc_info.value.message == "Paper session preview range must start before it ends."
