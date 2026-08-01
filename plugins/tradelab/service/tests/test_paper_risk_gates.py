from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone
from decimal import Decimal

from tradelab_api.services.paper_risk_gates import (
    PAPER_RISK_GATE_PASSED_REASON,
    PaperBotSnapshot,
    PaperDatasetGateSnapshot,
    PaperOrderIntentPreview,
    PaperRiskGateInput,
    PaperRiskPolicy,
    PaperRuntimeSafetySnapshot,
    PaperStrategySnapshot,
    evaluate_paper_risk_gates,
)


def _utc(year: int, month: int, day: int) -> datetime:
    return datetime(year, month, day, tzinfo=timezone.utc)


def _valid_bot() -> PaperBotSnapshot:
    return PaperBotSnapshot(
        bot_id="bot-1",
        mode="paper",
        status="draft",
        is_active=True,
        is_deleted=False,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
    )


def _valid_strategy() -> PaperStrategySnapshot:
    return PaperStrategySnapshot(
        strategy_id="strategy-1",
        strategy_version_id="version-1",
        source_valid=True,
        version_locked=True,
        dirty=False,
    )


def _valid_dataset() -> PaperDatasetGateSnapshot:
    return PaperDatasetGateSnapshot(
        dataset_key="binance:BTCUSDT:1h",
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        ready=True,
        start_at=_utc(2026, 1, 1),
        end_at=_utc(2026, 1, 2),
        reason_code=None,
    )


def _valid_policy() -> PaperRiskPolicy:
    return PaperRiskPolicy(
        starting_cash=Decimal("10000"),
        max_notional_per_order=Decimal("500"),
        max_position_notional=Decimal("1500"),
        max_daily_loss=Decimal("250"),
        max_open_positions=3,
        allowed_symbols=("BTCUSDT",),
        allowed_timeframes=("1h",),
    )


def _valid_order_preview() -> PaperOrderIntentPreview:
    return PaperOrderIntentPreview(
        side="buy",
        requested_notional=Decimal("250"),
        projected_position_notional=Decimal("750"),
        projected_open_positions=1,
    )


def _valid_input(
    *,
    bot: PaperBotSnapshot | None = None,
    strategy: PaperStrategySnapshot | None = None,
    dataset: PaperDatasetGateSnapshot | None = None,
    risk_policy: PaperRiskPolicy | None = None,
    order_preview: PaperOrderIntentPreview | None = None,
    runtime_safety: PaperRuntimeSafetySnapshot | None = None,
    runtime_config: dict[str, object] | None = None,
    metadata: dict[str, object] | None = None,
    gate_context: dict[str, object] | None = None,
) -> PaperRiskGateInput:
    return PaperRiskGateInput(
        bot=bot or _valid_bot(),
        strategy=strategy or _valid_strategy(),
        dataset=dataset or _valid_dataset(),
        risk_policy=risk_policy or _valid_policy(),
        order_preview=order_preview if order_preview is not None else _valid_order_preview(),
        runtime_safety=runtime_safety or PaperRuntimeSafetySnapshot(kill_switch_enabled=False),
        runtime_config=runtime_config or {"paper": {"enabled": False}},
        metadata=metadata or {"credentialBoundary": {"status": "read_only_ready"}},
        gate_context=gate_context or {"source": "unit-test"},
    )


def _reason_codes(input_: PaperRiskGateInput) -> list[str]:
    result = evaluate_paper_risk_gates(input_)
    return [failure.reason_code for failure in result.failed_gates]


def test_all_gates_pass_without_order_preview() -> None:
    input_ = _valid_input(order_preview=None)

    result = evaluate_paper_risk_gates(input_)

    assert result.allowed is True
    assert result.reason_code == PAPER_RISK_GATE_PASSED_REASON
    assert result.failed_gates == []
    assert result.warnings == []
    assert result.details["failedGateCount"] == 0


def test_bot_session_gate_blocks_invalid_paper_draft_state() -> None:
    bot = replace(
        _valid_bot(),
        bot_id=None,
        mode="backtest",
        status="active",
        is_active=False,
        is_deleted=True,
    )

    result = evaluate_paper_risk_gates(_valid_input(bot=bot))

    assert result.allowed is False
    assert result.reason_code == "paper_bot_missing"
    assert _reason_codes(_valid_input(bot=bot)) == [
        "paper_bot_missing",
        "paper_bot_not_draft",
        "paper_bot_inactive",
        "paper_bot_deleted",
    ]


def test_strategy_gate_blocks_missing_dirty_invalid_strategy() -> None:
    strategy = replace(
        _valid_strategy(),
        strategy_id=None,
        strategy_version_id=None,
        source_valid=False,
        version_locked=False,
        dirty=True,
    )

    assert _reason_codes(_valid_input(strategy=strategy)) == [
        "paper_strategy_missing",
        "paper_strategy_version_missing",
        "paper_strategy_source_invalid",
        "paper_strategy_version_not_locked",
        "paper_strategy_dirty",
    ]


def test_dataset_gate_blocks_not_ready_mismatch_and_invalid_range() -> None:
    dataset = replace(
        _valid_dataset(),
        dataset_key="binance:ETHUSDT:1h",
        ready=False,
        start_at=_utc(2026, 1, 2),
        end_at=_utc(2026, 1, 1),
        reason_code="dataset_gap",
    )

    result = evaluate_paper_risk_gates(_valid_input(dataset=dataset))

    assert result.allowed is False
    assert _reason_codes(_valid_input(dataset=dataset)) == [
        "paper_dataset_not_ready",
        "paper_dataset_context_mismatch",
        "paper_requested_range_invalid",
    ]
    assert result.failed_gates[0].data["sourceReasonCode"] == "dataset_gap"


def test_dataset_gate_blocks_missing_key_and_missing_range() -> None:
    dataset = replace(_valid_dataset(), dataset_key=None, start_at=None, end_at=None)

    assert _reason_codes(_valid_input(dataset=dataset)) == [
        "paper_dataset_key_missing",
        "paper_requested_range_invalid",
    ]


def test_risk_policy_gate_blocks_invalid_numeric_values() -> None:
    policy = replace(
        _valid_policy(),
        starting_cash=Decimal("0"),
        max_notional_per_order=Decimal("0"),
        max_position_notional=Decimal("-1"),
        max_daily_loss=Decimal("-0.01"),
        max_open_positions=0,
    )

    assert _reason_codes(_valid_input(risk_policy=policy)) == [
        "paper_starting_cash_invalid",
        "paper_risk_policy_invalid",
        "paper_risk_policy_invalid",
        "paper_risk_policy_invalid",
        "paper_risk_policy_invalid",
    ]


def test_empty_allowlists_do_not_restrict_symbol_or_timeframe() -> None:
    policy = replace(_valid_policy(), allowed_symbols=(), allowed_timeframes=())
    bot = replace(_valid_bot(), symbol="ETHUSDT", timeframe="15m")
    dataset = replace(
        _valid_dataset(),
        dataset_key="binance:ETHUSDT:15m",
        symbol="ETHUSDT",
        timeframe="15m",
    )

    result = evaluate_paper_risk_gates(_valid_input(bot=bot, dataset=dataset, risk_policy=policy))

    assert result.allowed is True
    assert result.reason_code == PAPER_RISK_GATE_PASSED_REASON


def test_allowlists_block_unknown_symbol_and_timeframe() -> None:
    policy = replace(_valid_policy(), allowed_symbols=("ETHUSDT",), allowed_timeframes=("15m",))

    assert _reason_codes(_valid_input(risk_policy=policy)) == [
        "paper_symbol_not_allowed",
        "paper_timeframe_not_allowed",
    ]


def test_order_preview_gate_blocks_invalid_order_and_limits() -> None:
    order_preview = replace(
        _valid_order_preview(),
        side="hold",
        requested_notional=Decimal("501"),
        projected_position_notional=Decimal("1501"),
        projected_open_positions=4,
    )

    assert _reason_codes(_valid_input(order_preview=order_preview)) == [
        "paper_order_side_invalid",
        "paper_max_notional_exceeded",
        "paper_max_position_exceeded",
        "paper_max_open_positions_exceeded",
    ]


def test_safety_gate_blocks_kill_switch_nested_secret_and_live_route_flags() -> None:
    runtime_safety = PaperRuntimeSafetySnapshot(kill_switch_enabled=True)
    runtime_config = {"safe": True, "nested": {"apiSecret": "hidden"}}
    metadata = {"routeToLive": True}
    gate_context = {"checks": [{"exchangeOrder": True}]}

    result = evaluate_paper_risk_gates(
        _valid_input(
            runtime_safety=runtime_safety,
            runtime_config=runtime_config,
            metadata=metadata,
            gate_context=gate_context,
        )
    )

    assert result.allowed is False
    assert _reason_codes(
        _valid_input(
            runtime_safety=runtime_safety,
            runtime_config=runtime_config,
            metadata=metadata,
            gate_context=gate_context,
        )
    ) == [
        "paper_kill_switch_enabled",
        "paper_secret_not_allowed",
        "paper_live_route_blocked",
    ]
    assert result.failed_gates[1].data["blockedFields"] == ["runtimeConfig.nested.apiSecret"]
    assert result.failed_gates[2].data["blockedFields"] == [
        "metadata.routeToLive",
        "gateContext.checks[0].exchangeOrder",
    ]


def test_multiple_gate_failures_are_aggregated_with_first_reason_as_result_reason() -> None:
    bot = replace(_valid_bot(), bot_id=None)
    dataset = replace(_valid_dataset(), ready=False, reason_code="dataset_missing")
    runtime_safety = PaperRuntimeSafetySnapshot(kill_switch_enabled=True)

    result = evaluate_paper_risk_gates(
        _valid_input(bot=bot, dataset=dataset, runtime_safety=runtime_safety)
    )

    assert result.allowed is False
    assert result.reason_code == "paper_bot_missing"
    assert _reason_codes(_valid_input(bot=bot, dataset=dataset, runtime_safety=runtime_safety)) == [
        "paper_bot_missing",
        "paper_dataset_not_ready",
        "paper_kill_switch_enabled",
    ]
    assert result.details["failedGateCount"] == 3
