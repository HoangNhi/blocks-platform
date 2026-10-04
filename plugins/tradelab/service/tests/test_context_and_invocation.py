from __future__ import annotations

import hashlib
import json
from dataclasses import FrozenInstanceError
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

import pytest

from tradelab_api.core.authorization import FunctionalPermissionAction
from tradelab_api.core.context import ExecutionContext
from tradelab_api.core.invocation import ResourcePolicyV1, StrategyInvocation

WORKSPACE = UUID("00000000-0000-0000-0000-000000000001")
ACTOR = UUID("00000000-0000-0000-0000-000000000002")
RUN = UUID("00000000-0000-0000-0000-000000000003")
VERIFIED_AT = datetime(2026, 9, 30, 12, tzinfo=timezone.utc)
AS_OF = datetime(2026, 9, 30, 13, tzinfo=timezone.utc)
SOURCE = "def on_candle(ctx):\n    ctx.state['seen'] = True\n    return []\n"


def closed_bar() -> dict[str, object]:
    return {
        "open_time": VERIFIED_AT,
        "close_time": AS_OF,
        "open": Decimal("100.125"),
        "high": Decimal("102.5"),
        "low": Decimal("99.75"),
        "close": Decimal("101.25"),
        "volume": Decimal("12.5"),
    }


def make_invocation(*, bars=None, config=None, initial_state=None, resource_policy=None):
    policy = resource_policy or ResourcePolicyV1()
    return StrategyInvocation.create(
        strategy_source=SOURCE,
        bars=[closed_bar()] if bars is None else bars,
        symbol="BTCUSDT",
        timeframe="1h",
        config={} if config is None else config,
        initial_state={} if initial_state is None else initial_state,
        seed=17,
        as_of_time=AS_OF,
        resource_policy=policy,
    )


def test_context_requires_verified_authority_and_is_immutable() -> None:
    values = {
        "workspace_id": WORKSPACE,
        "actor_user_id": ACTOR,
        "permission_key": "tradelab.backtests",
        "action": FunctionalPermissionAction.ANALYZE,
        "resource_type": "strategy",
        "resource_id": None,
        "run_id": RUN,
        "correlation_id": "request-123",
        "authority_deadline_monotonic": 120.0,
    }
    with pytest.raises(TypeError):
        ExecutionContext(**values)
    context = ExecutionContext(**values, authority_verified_at=VERIFIED_AT)
    assert context.authority_verified_at is VERIFIED_AT
    with pytest.raises(FrozenInstanceError):
        context.actor_user_id = RUN


def test_context_rejects_naive_authority_timestamp() -> None:
    with pytest.raises(ValueError, match="UTC"):
        ExecutionContext(
            workspace_id=WORKSPACE,
            actor_user_id=ACTOR,
            permission_key="tradelab.backtests",
            action=FunctionalPermissionAction.ANALYZE,
            resource_type="strategy",
            resource_id=None,
            run_id=RUN,
            correlation_id="request-123",
            authority_verified_at=datetime(2026, 9, 30, 12),
            authority_deadline_monotonic=120.0,
        )


def test_invocation_fixture_has_canonical_schema_and_source_hash() -> None:
    invocation = make_invocation()
    payload = json.loads(invocation.canonical_json)
    assert payload["schema_version"] == 1
    assert payload["strategy_source"] == SOURCE
    assert payload["source_sha256"] == hashlib.sha256(SOURCE.encode()).hexdigest()
    assert payload["seed"] == 17
    assert payload["as_of_time"] == "2026-09-30T13:00:00.000000Z"
    assert payload["resource_policy"]["version"] == 1
    assert payload["bars"][0]["open_time"] == "2026-09-30T12:00:00.000000Z"
    assert payload["bars"][0]["close_time"] == "2026-09-30T13:00:00.000000Z"
    assert set(payload["bars"][0]) == {
        "open_time",
        "close_time",
        "open",
        "high",
        "low",
        "close",
        "volume",
    }
    assert "def on_candle(ctx):" in payload["strategy_source"]
    assert invocation.canonical_json == make_invocation().canonical_json
    assert (
        make_invocation(resource_policy=ResourcePolicyV1(cpu_rate_cores=1)).canonical_json
        == invocation.canonical_json
    )


def test_snapshot_ignores_nested_input_and_accessor_mutation() -> None:
    config = {"nested": {"labels": ["original"]}}
    state = {"portfolio": {"positions": [{"symbol": "BTCUSDT"}]}}
    bars = [closed_bar()]
    invocation = make_invocation(config=config, initial_state=state, bars=bars)
    snapshot = invocation.canonical_json
    config["nested"]["labels"].append("caller")
    state["portfolio"]["positions"].clear()
    bars[0]["close"] = Decimal("0")
    exposed = invocation.to_payload()
    exposed["config"]["nested"]["labels"].append("accessor")
    exposed["initial_state"]["portfolio"]["positions"].clear()
    exposed["bars"][0]["close"] = "0"
    assert invocation.canonical_json == snapshot
    assert invocation.to_payload()["config"] == {"nested": {"labels": ["original"]}}
    assert invocation.to_payload()["initial_state"]["portfolio"]["positions"]
    assert invocation.to_payload()["bars"][0]["close"] == "101.25"


@pytest.mark.parametrize("field,value", [("schema_version", 2), ("source_sha256", "0" * 64)])
def test_invocation_rejects_schema_or_hash_mismatch(field: str, value: object) -> None:
    payload = make_invocation().to_payload()
    payload[field] = value
    with pytest.raises(ValueError):
        StrategyInvocation.from_payload(payload)


def test_invocation_rejects_nonfinite_json_input() -> None:
    with pytest.raises(ValueError):
        make_invocation(config={"nested": {"value": float("nan")}})


@pytest.mark.parametrize(
    "field,value",
    [
        ("wall_time_seconds", -1),
        ("cpu_time_seconds", True),
        ("cpu_rate_cores", float("inf")),
        ("memory_bytes", 512 * 1024 * 1024 + 1),
        ("max_bars", 50_001),
    ],
)
def test_policy_rejects_invalid_or_oversized_budget(field: str, value: object) -> None:
    with pytest.raises(ValueError):
        ResourcePolicyV1(**{field: value})


def test_invocation_rejects_decimal_outside_market_candle_precision() -> None:
    invalid_bar = closed_bar()
    for name in ("open", "high", "low", "close"):
        invalid_bar[name] = Decimal("1e30")
    with pytest.raises(ValueError):
        make_invocation(bars=[invalid_bar])


def test_invocation_rejects_unclosed_or_out_of_order_bars() -> None:
    unclosed = closed_bar()
    unclosed["close_time"] = AS_OF + timedelta(seconds=1)
    with pytest.raises(ValueError, match="closed"):
        make_invocation(bars=[unclosed])
    first, second = closed_bar(), closed_bar()
    second["open_time"] = datetime(2026, 9, 30, 11, tzinfo=timezone.utc)
    with pytest.raises(ValueError, match="order"):
        make_invocation(bars=[first, second])


def test_invocation_rejects_bars_above_selected_budget() -> None:
    with pytest.raises(ValueError, match="bar"):
        make_invocation(
            bars=[closed_bar(), closed_bar()], resource_policy=ResourcePolicyV1(max_bars=1)
        )
