from __future__ import annotations

import os

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+psycopg://postgres:postgres123secure@localhost:5432/tradelab",
)

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
import pytest

from tradelab_api.db.models import (
    BacktestResult,
    Bot,
    BotRun,
    MarketCandle,
    MarketDataImportJob,
    MarketDataJobRunLink,
    OrderIntent,
    StrategyLog,
    StrategySignal,
    StrategyVersion,
    TradeOrder,
)
from tradelab_api.db.session import (
    SessionLocal,
    apply_schema_compatibility,
    get_engine,
    verify_database_connection,
)
from tradelab_api.main import app
from tradelab_api.services.bot_repository import BotRepository
from tradelab_api.services.market_data_integrity import inspect_candles
from tradelab_api.services.market_data_repository import MarketDataRepository
from tradelab_api.services.job_dispatcher import JobDispatcher

try:
    verify_database_connection()
except RuntimeError as exc:
    pytest.skip(str(exc), allow_module_level=True)
apply_schema_compatibility()
client = TestClient(app)


def assert_success_envelope(response, semantic_status: int = 200) -> dict[str, object]:
    assert response.status_code == 200
    payload = response.json()
    assert payload["Success"] is True
    assert payload["StatusCode"] == semantic_status
    assert payload["Message"] is None
    return payload["Data"]


def assert_error_envelope(response, semantic_status: int) -> dict[str, object]:
    assert response.status_code == 200
    payload = response.json()
    assert payload["Success"] is False
    assert payload["StatusCode"] == semantic_status
    assert isinstance(payload["Message"], str) and payload["Message"]
    return payload

def assert_execution_mode_not_enabled_error(payload: dict[str, object], mode: str) -> None:
    assert payload["Message"] == f"Execution mode '{mode}' is not enabled yet."
    assert payload["Data"] == {
        "mode": mode,
        "reasonCode": "execution_mode_not_enabled",
        "allowedModes": ["backtest"],
        "draftableModes": ["backtest", "paper"],
        "blockedModes": ["live"],
    }


def assert_execution_mode_not_runnable_error(payload: dict[str, object], mode: str) -> None:
    assert payload["Message"] == f"Execution mode '{mode}' is not runnable yet."
    assert payload["Data"] == {
        "mode": mode,
        "reasonCode": "execution_mode_not_runnable",
        "allowedModes": ["backtest"],
        "draftableModes": ["backtest", "paper"],
    }


def test_strategy_creation_and_version_validation_use_envelopes() -> None:
    suffix = uuid4().hex[:8]
    group_data = assert_success_envelope(
        client.post(
            "/api/tradelab/strategy-groups",
            json={
                "name": f"Test Group {suffix}",
                "slug": f"test-group-{suffix}",
                "description": "Integration test group",
                "metadata": {"visibility": "test", "purpose": "automated_test_fixture"},
                "created_by": "codex",
            },
        ),
        201,
    )
    group_id = group_data["id"]

    strategy_data = assert_success_envelope(
        client.post(
            "/api/tradelab/strategies",
            json={
                "strategy_group_id": group_id,
                "name": f"Test Strategy {suffix}",
                "slug": f"test-strategy-{suffix}",
                "description": "Integration test strategy",
                "runtime_config": {},
                "risk_config": {},
                "metadata": {},
                "created_by": "codex",
            },
        ),
        201,
    )
    strategy_id = strategy_data["id"]

    version_data = assert_success_envelope(
        client.post(
            f"/api/tradelab/strategies/{strategy_id}/versions",
            json={
                "source_code": """
def on_candle(ctx):
    return None
""".strip(),
                "created_by": "codex",
            },
        ),
        201,
    )
    assert version_data["validation_status"] == "valid"
    assert version_data["strategy_id"] == strategy_id


def test_validate_strategy_source_endpoint_returns_valid_without_creating_version() -> None:
    with SessionLocal(bind=get_engine()) as session:
        before_count = session.query(StrategyVersion).count()

    payload = assert_success_envelope(
        client.post(
            "/api/tradelab/strategies/validate-source",
            json={"sourceCode": "def on_candle(ctx):\n    return None\n"},
        )
    )

    assert payload == {
        "validationStatus": "valid",
        "validationMessage": None,
        "line": None,
        "column": None,
    }

    with SessionLocal(bind=get_engine()) as session:
        after_count = session.query(StrategyVersion).count()
    assert after_count == before_count

def test_validate_strategy_source_endpoint_reports_syntax_location() -> None:
    payload = assert_success_envelope(
        client.post(
            "/api/tradelab/strategies/validate-source",
            json={"sourceCode": "def on_candle(ctx)\n    return None\n"},
        )
    )

    assert payload["validationStatus"] == "invalid"
    assert payload["validationMessage"].startswith("Syntax error:")
    assert payload["line"] == 1
    assert payload["column"] is not None

def test_validate_strategy_source_endpoint_reports_policy_error() -> None:
    payload = assert_success_envelope(
        client.post(
            "/api/tradelab/strategies/validate-source",
            json={"sourceCode": "import os\n\ndef on_candle(ctx):\n    return None\n"},
        )
    )

    assert payload["validationStatus"] == "invalid"
    assert payload["validationMessage"] == "Blocked import: os"
    assert payload["line"] == 1
    assert payload["column"] == 1

def test_invalid_uuid_returns_validation_envelope() -> None:
    payload = assert_error_envelope(client.get("/api/tradelab/strategies/not-a-uuid"), 400)
    assert payload["Data"] is None
    assert "UUID" in payload["Message"]


def test_paper_draft_bot_creation_is_allowed_without_creating_run() -> None:
    suffix = uuid4().hex[:8]
    _, strategy_id, version_id = _create_strategy_with_version(suffix)

    data = assert_success_envelope(
        client.post(
            "/api/tradelab/bots",
            json={
                "strategy_id": strategy_id,
                "strategy_version_id": version_id,
                "name": f"Paper Draft Bot {suffix}",
                "mode": "paper",
                "status": "draft",
                "symbol": "BTCUSDT",
                "timeframe": "1h",
                "runtime_config": {"exchange": "binance"},
                "risk_config": {"max_order_percent": 10},
                "metadata": {"purpose": "paper-draft-boundary"},
                "created_by": "codex",
            },
        ),
        201,
    )

    assert data["mode"] == "paper"
    assert data["status"] == "draft"
    assert data["name"] == f"Paper Draft Bot {suffix}"
    with SessionLocal(bind=get_engine()) as session:
        bot = session.query(Bot).filter(Bot.id == UUID(data["id"])).one()
        assert bot.mode == "paper"
        assert bot.status == "draft"
        assert session.query(BotRun).filter(BotRun.bot_id == bot.id).count() == 0


def test_paper_draft_bot_creation_accepts_credential_boundary_metadata() -> None:
    suffix = uuid4().hex[:8]
    _, strategy_id, version_id = _create_strategy_with_version(suffix)

    data = assert_success_envelope(
        client.post(
            "/api/tradelab/bots",
            json={
                "strategy_id": strategy_id,
                "strategy_version_id": version_id,
                "name": f"Paper Credential Draft {suffix}",
                "mode": "paper",
                "status": "draft",
                "symbol": "BTCUSDT",
                "timeframe": "1h",
                "runtime_config": {"exchange": "binance"},
                "risk_config": {"max_order_percent": 10},
                "metadata": {
                    "credentialBoundary": {
                        "exchange": "binance",
                        "status": "read_only_ready",
                        "checks": {
                            "readOnlyEnabled": True,
                            "tradingDisabled": True,
                            "withdrawDisabled": True,
                            "futuresMarginDisabled": True,
                            "ipRestricted": True,
                        },
                        "updatedAt": "2026-05-16T00:00:00Z",
                    }
                },
                "created_by": "codex",
            },
        ),
        201,
    )

    assert data["metadata"]["credentialBoundary"]["status"] == "read_only_ready"
    with SessionLocal(bind=get_engine()) as session:
        bot = session.query(Bot).filter(Bot.id == UUID(data["id"])).one()
        assert bot.metadata_["credentialBoundary"]["checks"]["readOnlyEnabled"] is True
        assert session.query(BotRun).filter(BotRun.bot_id == bot.id).count() == 0


def test_bot_creation_rejects_credential_boundary_secret_like_fields_without_echoing_values() -> None:
    suffix = uuid4().hex[:8]
    _, strategy_id, version_id = _create_strategy_with_version(suffix)

    payload = assert_error_envelope(
        client.post(
            "/api/tradelab/bots",
            json={
                "strategy_id": strategy_id,
                "strategy_version_id": version_id,
                "name": f"Paper Credential Secret {suffix}",
                "mode": "paper",
                "status": "draft",
                "symbol": "BTCUSDT",
                "timeframe": "1h",
                "runtime_config": {},
                "risk_config": {},
                "metadata": {
                    "credentialBoundary": {
                        "status": "read_only_ready",
                        "apiKey": "SECRET-WAS-HERE",
                        "nested": {"privateKey": "PRIVATE-WAS-HERE"},
                    }
                },
                "created_by": "codex",
            },
        ),
        400,
    )

    assert payload["Message"] == "Credential boundary must not contain secrets."
    assert payload["Data"] == {
        "reasonCode": "credential_secret_not_allowed",
        "blockedFields": ["credentialBoundary.apiKey", "credentialBoundary.nested.privateKey"],
    }
    assert "SECRET-WAS-HERE" not in str(payload)
    assert "PRIVATE-WAS-HERE" not in str(payload)
    with SessionLocal(bind=get_engine()) as session:
        created = session.query(Bot).filter(Bot.name == f"Paper Credential Secret {suffix}").one_or_none()
    assert created is None


def test_bot_creation_rejects_invalid_credential_boundary_status() -> None:
    suffix = uuid4().hex[:8]
    _, strategy_id, version_id = _create_strategy_with_version(suffix)

    payload = assert_error_envelope(
        client.post(
            "/api/tradelab/bots",
            json={
                "strategy_id": strategy_id,
                "strategy_version_id": version_id,
                "name": f"Paper Credential Invalid {suffix}",
                "mode": "paper",
                "status": "draft",
                "symbol": "BTCUSDT",
                "timeframe": "1h",
                "runtime_config": {},
                "risk_config": {},
                "metadata": {"credentialBoundary": {"status": "paper_trading_enabled"}},
                "created_by": "codex",
            },
        ),
        400,
    )

    assert payload["Message"] == "Credential boundary status is invalid."
    assert payload["Data"] == {
        "reasonCode": "credential_boundary_invalid_status",
        "status": "paper_trading_enabled",
        "allowedStatuses": [
            "missing",
            "read_only_ready",
            "unsafe_permissions",
            "ip_not_restricted",
            "not_verified",
        ],
    }


def test_paper_non_draft_bot_creation_is_rejected_with_machine_readable_error() -> None:
    suffix = uuid4().hex[:8]
    _, strategy_id, version_id = _create_strategy_with_version(suffix)

    payload = assert_error_envelope(
        client.post(
            "/api/tradelab/bots",
            json={
                "strategy_id": strategy_id,
                "strategy_version_id": version_id,
                "name": f"Paper Active Bot {suffix}",
                "mode": "paper",
                "status": "active",
                "symbol": "BTCUSDT",
                "timeframe": "1h",
                "runtime_config": {},
                "risk_config": {},
                "metadata": {},
                "created_by": "codex",
            },
        ),
        400,
    )

    assert_execution_mode_not_enabled_error(payload, "paper")
    with SessionLocal(bind=get_engine()) as session:
        created = (
            session.query(Bot)
            .filter(Bot.name == f"Paper Active Bot {suffix}", Bot.mode == "paper")
            .one_or_none()
        )
    assert created is None


def test_live_bot_creation_is_rejected_with_machine_readable_error() -> None:
    suffix = uuid4().hex[:8]
    _, strategy_id, version_id = _create_strategy_with_version(suffix)

    payload = assert_error_envelope(
        client.post(
            "/api/tradelab/bots",
            json={
                "strategy_id": strategy_id,
                "strategy_version_id": version_id,
                "name": f"Live Bot {suffix}",
                "mode": "live",
                "status": "draft",
                "symbol": "BTCUSDT",
                "timeframe": "1h",
                "runtime_config": {},
                "risk_config": {},
                "metadata": {},
                "created_by": "codex",
            },
        ),
        400,
    )

    assert_execution_mode_not_enabled_error(payload, "live")
    with SessionLocal(bind=get_engine()) as session:
        created = (
            session.query(Bot)
            .filter(Bot.name == f"Live Bot {suffix}", Bot.mode == "live")
            .one_or_none()
        )
    assert created is None


def test_backtest_preflight_rejects_non_backtest_bot_without_creating_run(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    suffix = uuid4().hex[:8]
    _, strategy_id, version_id = _create_strategy_with_version(suffix)
    bot_id = uuid4()
    monkeypatch.setattr(
        BotRepository,
        "get_bot",
        lambda self, requested_id: _make_unpersisted_bot(
            bot_id=requested_id,
            strategy_id=strategy_id,
            version_id=version_id,
            mode="paper",
        ),
    )

    payload = assert_error_envelope(
        client.post(
            f"/api/tradelab/bots/{bot_id}/backtests/preflight",
            json={
                "exchange": "binance",
                "symbol": "BTCUSDT",
                "timeframe": "1h",
                "start_at": "2026-01-01T00:00:00Z",
                "end_at": "2026-01-01T01:00:00Z",
                "initial_equity": 1000,
                "fee_bps": 0,
                "slippage_bps": 0,
            },
        ),
        400,
    )

    assert_execution_mode_not_runnable_error(payload, "paper")
    with SessionLocal(bind=get_engine()) as session:
        run_count = session.query(BotRun).filter(BotRun.bot_id == bot_id).count()
    assert run_count == 0

def test_backtest_start_rejects_non_backtest_bot_without_creating_run(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    suffix = uuid4().hex[:8]
    _, strategy_id, version_id = _create_strategy_with_version(suffix)
    bot_id = uuid4()
    monkeypatch.setattr(
        BotRepository,
        "get_bot",
        lambda self, requested_id: _make_unpersisted_bot(
            bot_id=requested_id,
            strategy_id=strategy_id,
            version_id=version_id,
            mode="paper",
        ),
    )

    payload = assert_error_envelope(
        client.post(
            f"/api/tradelab/bots/{bot_id}/backtests",
            json={
                "exchange": "binance",
                "symbol": "BTCUSDT",
                "timeframe": "1h",
                "start_at": "2026-01-01T00:00:00Z",
                "end_at": "2026-01-01T01:00:00Z",
                "initial_equity": 1000,
                "fee_bps": 0,
                "slippage_bps": 0,
            },
        ),
        400,
    )

    assert_execution_mode_not_runnable_error(payload, "paper")
    with SessionLocal(bind=get_engine()) as session:
        run_count = session.query(BotRun).filter(BotRun.bot_id == bot_id).count()
    assert run_count == 0


def test_paper_draft_with_credential_boundary_is_still_not_runnable() -> None:
    suffix = uuid4().hex[:8]
    _, strategy_id, version_id = _create_strategy_with_version(suffix)

    bot_data = assert_success_envelope(
        client.post(
            "/api/tradelab/bots",
            json={
                "strategy_id": strategy_id,
                "strategy_version_id": version_id,
                "name": f"Paper Credential Runtime Guard {suffix}",
                "mode": "paper",
                "status": "draft",
                "symbol": "BTCUSDT",
                "timeframe": "1h",
                "runtime_config": {"exchange": "binance"},
                "risk_config": {},
                "metadata": {
                    "credentialBoundary": {
                        "exchange": "binance",
                        "status": "read_only_ready",
                        "checks": {
                            "readOnlyEnabled": True,
                            "tradingDisabled": True,
                            "withdrawDisabled": True,
                            "futuresMarginDisabled": True,
                            "ipRestricted": True,
                        },
                    }
                },
                "created_by": "codex",
            },
        ),
        201,
    )

    payload = assert_error_envelope(
        client.post(
            f"/api/tradelab/bots/{bot_data['id']}/backtests/preflight",
            json={
                "exchange": "binance",
                "symbol": "BTCUSDT",
                "timeframe": "1h",
                "start_at": "2026-01-01T00:00:00Z",
                "end_at": "2026-01-01T01:00:00Z",
                "initial_equity": 1000,
                "fee_bps": 0,
                "slippage_bps": 0,
            },
        ),
        400,
    )

    assert_execution_mode_not_runnable_error(payload, "paper")
    with SessionLocal(bind=get_engine()) as session:
        bot = session.query(Bot).filter(Bot.id == UUID(bot_data["id"])).one()
        assert session.query(BotRun).filter(BotRun.bot_id == bot.id).count() == 0


def test_backtest_preflight_and_pipeline_use_envelopes() -> None:
    suffix = uuid4().hex[:8]
    _, strategy_id, version_id = _create_strategy_with_version(suffix)
    bot_data = assert_success_envelope(
        client.post(
            "/api/tradelab/bots",
            json={
                "strategy_id": strategy_id,
                "strategy_version_id": version_id,
                "name": f"Backtest Bot {suffix}",
                "mode": "backtest",
                "status": "draft",
                "symbol": "BTCUSDT",
                "timeframe": "1h",
                "runtime_config": {},
                "risk_config": {},
                "metadata": {},
                "created_by": "codex",
            },
        ),
        201,
    )
    bot_id = bot_data["id"]

    _insert_candles(
        [
            {
                "exchange": "binance",
                "symbol": "BTCUSDT",
                "timeframe": "1h",
                "open_time": datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
                "close_time": datetime(2026, 1, 1, 1, 0, tzinfo=timezone.utc),
                "open": Decimal("100"),
                "high": Decimal("101"),
                "low": Decimal("99"),
                "close": Decimal("100"),
                "volume": Decimal("10"),
                "quote_volume": Decimal("1000"),
                "trade_count": 1,
                "source": "binance",
            },
            {
                "exchange": "binance",
                "symbol": "BTCUSDT",
                "timeframe": "1h",
                "open_time": datetime(2026, 1, 1, 1, 0, tzinfo=timezone.utc),
                "close_time": datetime(2026, 1, 1, 2, 0, tzinfo=timezone.utc),
                "open": Decimal("100"),
                "high": Decimal("101"),
                "low": Decimal("99"),
                "close": Decimal("100"),
                "volume": Decimal("10"),
                "quote_volume": Decimal("1000"),
                "trade_count": 1,
                "source": "binance",
            },
        ]
    )

    preflight_payload = assert_success_envelope(
            client.post(
                f"/api/tradelab/bots/{bot_id}/backtests/preflight",
                json={
                    "exchange": "binance",
                    "symbol": "BTCUSDT",
                    "timeframe": "1h",
                    "start_at": "2026-01-01T00:00:00Z",
                    "end_at": "2026-01-01T01:00:00Z",
                    "initial_equity": 1000,
                    "fee_bps": 0,
                    "slippage_bps": 0,
                },
            )
        )
    assert preflight_payload["outcome"] == "ready"

    pipeline_payload = assert_success_envelope(
        client.post(
            f"/api/tradelab/bots/{bot_id}/backtests",
                json={
                    "exchange": "binance",
                    "symbol": "BTCUSDT",
                    "timeframe": "1h",
                    "start_at": "2026-01-01T00:00:00Z",
                    "end_at": "2026-01-01T01:00:00Z",
                    "initial_equity": 1000,
                    "fee_bps": 0,
                    "slippage_bps": 0,
                },
            ),
        201,
    )

    assert pipeline_payload["status"] in {"queued", "running"}
    run_id = pipeline_payload["run"]["id"]

    run_payload = None
    for _ in range(10):
        JobDispatcher().poll_once()
        run_payload = assert_success_envelope(client.get(f"/api/tradelab/bot-runs/{run_id}"))
        if run_payload["status"] == "completed":
            break
    else:
        pytest.fail("Backtest run did not complete after dispatcher polling.")

    assert run_payload is not None
    assert run_payload["status"] == "completed"
    assert run_payload["result"]["total_trades"] == 0
    assert run_payload["result"]["metrics"]["closedTrades"] == 0
    assert run_payload["pipeline"]["status"] == "completed"

    chart_payload = assert_success_envelope(client.get(f"/api/tradelab/bot-runs/{run_id}/chart"))
    assert isinstance(chart_payload["candles"], list)
    assert isinstance(chart_payload["markers"], list)
    assert chart_payload["selected_trade"] is None or "marker" in chart_payload["selected_trade"]


def test_indicators_route_uses_envelope() -> None:
    payload = assert_success_envelope(client.get("/api/tradelab/indicators"))
    assert isinstance(payload["items"], list)
    assert payload["items"][0]["name"] == "sma"


def test_exchange_connections_route_uses_envelope() -> None:
    payload = assert_success_envelope(client.get("/api/tradelab/exchange-connections"))
    assert isinstance(payload["items"], list)


def test_run_analysis_and_trade_detail_routes_use_envelopes() -> None:
    suffix = uuid4().hex[:8]
    _, strategy_id, version_id = _create_strategy_with_version(suffix)
    completed_run_id, open_run_id = _insert_analysis_runs(strategy_id=strategy_id, version_id=version_id)

    completed_runs_payload = assert_success_envelope(
        client.get("/api/tradelab/bot-runs", params={"strategy_id": strategy_id, "status": "completed"})
    )
    assert [item["id"] for item in completed_runs_payload["items"]] == [completed_run_id]

    analysis_payload = assert_success_envelope(client.get(f"/api/tradelab/bot-runs/{completed_run_id}/analysis"))
    assert analysis_payload["trade_summary"]["total_trades"] == 1
    assert analysis_payload["trade_summary"]["closed_trades"] == 1
    assert analysis_payload["trade_summary"]["open_trades"] == 0
    assert analysis_payload["dataset_context"]["dataset_key"] == "binance:BTCUSDT:1h"
    assert analysis_payload["runtime_config"]["symbol"] == "BTCUSDT"
    assert analysis_payload["risk_config"]["maxOrderPercent"] == 10
    assert analysis_payload["trades"][0]["status"] == "closed"

    detail_payload = assert_success_envelope(
        client.get(f"/api/tradelab/bot-runs/{completed_run_id}/trades/{analysis_payload['trades'][0]['id']}")
    )
    assert detail_payload["trade"]["id"] == analysis_payload["trades"][0]["id"]
    assert detail_payload["entry_order"]["id"] == analysis_payload["trades"][0]["entry_order_id"]
    assert detail_payload["exit_order"]["id"] == analysis_payload["trades"][0]["exit_order_id"]
    assert detail_payload["entry_signal"]["id"] == analysis_payload["trades"][0]["entry_signal_id"]
    assert detail_payload["exit_signal"]["id"] == analysis_payload["trades"][0]["exit_signal_id"]
    assert [item["event_type"] for item in detail_payload["logs"]] == ["ENTRY", "EXIT"]

    open_analysis_payload = assert_success_envelope(client.get(f"/api/tradelab/bot-runs/{open_run_id}/analysis"))
    assert open_analysis_payload["trade_summary"]["total_trades"] == 1
    assert open_analysis_payload["trade_summary"]["open_trades"] == 1
    assert open_analysis_payload["trades"][0]["status"] == "open"


def test_manual_signal_package_route_requires_confirmation() -> None:
    suffix = uuid4().hex[:8]
    _, strategy_id, version_id = _create_strategy_with_version(suffix)
    completed_run_id, _ = _insert_analysis_runs(strategy_id=strategy_id, version_id=version_id)

    response = client.post(
        f"/api/tradelab/bot-runs/{completed_run_id}/manual-signal-package",
        json={"confirmManualSignalOnly": False, "source": "strategy_lab"},
    )

    payload = assert_error_envelope(response, 400)
    assert payload["Data"]["reasonCode"] == "manual_signal_confirmation_required"


def test_manual_signal_package_route_returns_manual_only_package() -> None:
    suffix = uuid4().hex[:8]
    _, strategy_id, version_id = _create_strategy_with_version(suffix)
    completed_run_id, _ = _insert_analysis_runs(strategy_id=strategy_id, version_id=version_id)

    payload = assert_success_envelope(
        client.post(
            f"/api/tradelab/bot-runs/{completed_run_id}/manual-signal-package",
            json={"confirmManualSignalOnly": True, "source": "strategy_lab"},
        )
    )

    assert payload["sourceRunId"] == completed_run_id
    assert payload["strategyId"] == strategy_id
    assert payload["strategyVersionId"] == version_id
    assert payload["datasetKey"] == "binance:BTCUSDT:1h"
    assert payload["action"] == "watch"
    assert payload["robustnessEvidenceStatus"] == "not_available"
    assert payload["liveReadinessStatus"] == "manual_handoff_only"
    assert payload["safetyStatus"] == "manual_live_signal_handoff_only"
    assert "manual handoff only" in payload["markdown"].lower()
    assert "apiSecret" not in str(payload)
    assert "Submit order" not in str(payload)


def test_manual_signal_package_route_blocks_open_run() -> None:
    suffix = uuid4().hex[:8]
    _, strategy_id, version_id = _create_strategy_with_version(suffix)
    _, open_run_id = _insert_analysis_runs(strategy_id=strategy_id, version_id=version_id)

    response = client.post(
        f"/api/tradelab/bot-runs/{open_run_id}/manual-signal-package",
        json={"confirmManualSignalOnly": True, "source": "strategy_lab"},
    )

    payload = assert_error_envelope(response, 400)
    assert payload["Data"]["reasonCode"] == "manual_signal_run_not_completed"


def test_research_robustness_gate_route_requires_confirmation() -> None:
    suffix = uuid4().hex[:8]
    _, strategy_id, version_id = _create_strategy_with_version(suffix)
    completed_run_id, _ = _insert_analysis_runs(strategy_id=strategy_id, version_id=version_id)

    response = client.post(
        f"/api/tradelab/bot-runs/{completed_run_id}/robustness-gate",
        json={"confirmResearchOnly": False, "source": "strategy_lab"},
    )

    payload = assert_error_envelope(response, 400)
    assert payload["Data"]["reasonCode"] == "research_robustness_confirmation_required"


def test_research_robustness_gate_route_returns_research_only_evidence() -> None:
    suffix = uuid4().hex[:8]
    _, strategy_id, version_id = _create_strategy_with_version(suffix)
    completed_run_id, _ = _insert_analysis_runs(strategy_id=strategy_id, version_id=version_id)

    payload = assert_success_envelope(
        client.post(
            f"/api/tradelab/bot-runs/{completed_run_id}/robustness-gate",
            json={"confirmResearchOnly": True, "source": "strategy_lab"},
        )
    )

    assert payload["sourceRunId"] == completed_run_id
    assert payload["strategyId"] == strategy_id
    assert payload["strategyVersionId"] == version_id
    assert payload["datasetKey"] == "binance:BTCUSDT:1h"
    assert payload["candidateLabel"] in {"research_candidate", "insufficient_evidence", "not_candidate"}
    assert payload["candidateLabel"] != "live_ready"
    assert payload["liveReadinessStatus"] == "not_live_ready"
    assert payload["safetyStatus"] == "research_robustness_gate_only"
    assert payload["gates"]["tradeCount"]["status"] in {"pass", "warn", "fail"}
    assert "apiSecret" not in str(payload)
    assert "Submit order" not in str(payload)


def test_research_robustness_gate_route_blocks_open_run() -> None:
    suffix = uuid4().hex[:8]
    _, strategy_id, version_id = _create_strategy_with_version(suffix)
    _, open_run_id = _insert_analysis_runs(strategy_id=strategy_id, version_id=version_id)

    response = client.post(
        f"/api/tradelab/bot-runs/{open_run_id}/robustness-gate",
        json={"confirmResearchOnly": True, "source": "strategy_lab"},
    )

    payload = assert_error_envelope(response, 400)
    assert payload["Data"]["reasonCode"] == "research_robustness_run_not_completed"


def test_execution_journal_route_requires_confirmation() -> None:
    suffix = uuid4().hex[:8]
    _, strategy_id, version_id = _create_strategy_with_version(suffix)
    completed_run_id, _ = _insert_analysis_runs(strategy_id=strategy_id, version_id=version_id)

    response = client.post(
        f"/api/tradelab/bot-runs/{completed_run_id}/execution-journal",
        json={"confirmManualEntryOnly": False, "source": "strategy_lab", "side": "long", "fills": []},
    )

    payload = assert_error_envelope(response, 400)
    assert payload["Data"]["reasonCode"] == "execution_journal_confirmation_required"

def test_execution_journal_route_blocks_open_run() -> None:
    suffix = uuid4().hex[:8]
    _, strategy_id, version_id = _create_strategy_with_version(suffix)
    _, open_run_id = _insert_analysis_runs(strategy_id=strategy_id, version_id=version_id)

    response = client.post(
        f"/api/tradelab/bot-runs/{open_run_id}/execution-journal",
        json={"confirmManualEntryOnly": True, "source": "strategy_lab", "side": "long", "fills": []},
    )

    payload = assert_error_envelope(response, 400)
    assert payload["Data"]["reasonCode"] == "execution_journal_run_not_completed"

def test_execution_journal_route_creates_and_lists_entry() -> None:
    suffix = uuid4().hex[:8]
    _, strategy_id, version_id = _create_strategy_with_version(suffix)
    completed_run_id, _ = _insert_analysis_runs(strategy_id=strategy_id, version_id=version_id)
    payload = {
        "confirmManualEntryOnly": True,
        "source": "strategy_lab",
        "side": "long",
        "plannedSnapshot": {"plannedEntryPrice": 100, "plannedRiskPerUnit": 10},
        "disciplineStatus": "followed_plan",
        "notes": "Manual observed fill after signal handoff.",
        "fills": [
            {"fillRole": "entry", "side": "buy", "price": 100, "quantity": 1, "fee": 0.1},
            {"fillRole": "exit", "side": "sell", "price": 120, "quantity": 1, "fee": 0.1},
        ],
    }

    entry = assert_success_envelope(client.post(f"/api/tradelab/bot-runs/{completed_run_id}/execution-journal", json=payload))

    assert entry["sourceRunId"] == completed_run_id
    assert entry["strategyId"] == strategy_id
    assert entry["strategyVersionId"] == version_id
    assert entry["safetyStatus"] == "manual_execution_journal_only"
    assert entry["liveReadinessStatus"] == "not_live_ready"
    assert entry["comparisonSummary"]["outcomeStatus"] == "win"
    assert len(entry["fills"]) == 2
    assert "apiSecret" not in str(entry)
    assert "Submit order" not in str(entry)

    list_payload = assert_success_envelope(client.get(f"/api/tradelab/bot-runs/{completed_run_id}/execution-journal"))
    assert list_payload["items"][0]["entryId"] == entry["entryId"]

def test_execution_journal_route_soft_deletes_entry() -> None:
    suffix = uuid4().hex[:8]
    _, strategy_id, version_id = _create_strategy_with_version(suffix)
    completed_run_id, _ = _insert_analysis_runs(strategy_id=strategy_id, version_id=version_id)
    payload = {
        "confirmManualEntryOnly": True,
        "source": "strategy_lab",
        "side": "long",
        "plannedSnapshot": {},
        "disciplineStatus": "not_recorded",
        "fills": [{"fillRole": "entry", "side": "buy", "price": 100, "quantity": 1}],
    }
    entry = assert_success_envelope(client.post(f"/api/tradelab/bot-runs/{completed_run_id}/execution-journal", json=payload))

    delete_payload = assert_success_envelope(client.delete(f"/api/tradelab/execution-journal/{entry['entryId']}"))

    assert delete_payload["deleted"] is True
    list_payload = assert_success_envelope(client.get(f"/api/tradelab/bot-runs/{completed_run_id}/execution-journal"))
    assert list_payload["items"] == []

def test_repeat_benchmark_route_requires_completed_baseline() -> None:
    run_id = uuid4()
    response = client.post(f"/api/tradelab/bot-runs/{run_id}/benchmark-repeat", json={"confirm_same_input": True})
    payload = assert_error_envelope(response, 404)
    assert "Bot run" in payload["Message"]

def test_repeat_benchmark_route_creates_check_for_completed_run() -> None:
    suffix = uuid4().hex[:8]
    _, strategy_id, version_id = _create_strategy_with_version(suffix)
    run = BotRun(
        strategy_id=UUID(strategy_id),
        strategy_version_id=UUID(version_id),
        run_type="backtest",
        status="completed",
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        start_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        end_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
        runtime_config={"initialEquity": 1000},
        risk_config={"maxOrderPercent": 25},
        source_snapshot={"sourceHash": "abc"},
        dataset_context={
            "datasetKey": "binance:BTCUSDT:1h",
            "coverage": {"healthStatus": "healthy", "segmentCount": 1, "gapCount": 0},
        },
        pipeline_context={"preflight": {"outcome": "ready"}},
        pipeline_status="completed",
        created_by="codex",
    )
    with SessionLocal(bind=get_engine()) as session:
        session.add(run)
        session.commit()
        session.refresh(run)
        run_id = run.id

    payload = assert_success_envelope(
        client.post(
            f"/api/tradelab/bot-runs/{run_id}/benchmark-repeat",
            json={"confirm_same_input": True},
        ),
        201,
    )

    assert payload["baseline_run_id"] == str(run_id)
    assert payload["repeat_run_id"] is not None
    assert payload["status"] == "running"

    latest_payload = assert_success_envelope(client.get(f"/api/tradelab/bot-runs/{run_id}/benchmark-checks"))
    assert latest_payload["latest"]["id"] == payload["id"]

def test_strategy_job_visibility_returns_active_recent_and_stale_state() -> None:
    suffix = uuid4().hex[:8]
    _, strategy_id, version_id = _create_strategy_with_version(f"visibility-{suffix}")
    _, other_strategy_id, other_version_id = _create_strategy_with_version(f"visibility-other-{suffix}")
    fixture = _insert_job_visibility_fixture(
        strategy_id=strategy_id,
        version_id=version_id,
        other_strategy_id=other_strategy_id,
        other_version_id=other_version_id,
    )

    before_statuses = {}
    with SessionLocal(bind=get_engine()) as session:
        before_statuses["run"] = session.get(BotRun, UUID(fixture["activeRunId"])).status
        before_statuses["pipeline"] = session.get(BotRun, UUID(fixture["activeRunId"])).pipeline_status
        before_statuses["job"] = session.get(MarketDataImportJob, UUID(fixture["dataJobId"])).status

    payload = assert_success_envelope(client.get(f"/api/tradelab/strategies/{strategy_id}/job-visibility"))

    assert payload["strategy_id"] == strategy_id
    assert payload["stale_threshold_minutes"] == 10
    assert [item["run"]["id"] for item in payload["active"]] == [fixture["activeRunId"]]
    recent_ids = [item["run"]["id"] for item in payload["recent"]]
    assert fixture["completedRunId"] in recent_ids
    assert fixture["failedRunId"] in recent_ids
    assert fixture["otherRunId"] not in recent_ids

    active_item = payload["active"][0]
    assert active_item["status"] == "waiting_for_data"
    assert active_item["data_job"]["id"] == fixture["dataJobId"]
    assert active_item["is_stale"] is True
    assert active_item["stale_reason"] == "active_job_exceeded_stale_threshold"
    assert active_item["last_activity_at"]

    with SessionLocal(bind=get_engine()) as session:
        assert session.get(BotRun, UUID(fixture["activeRunId"])).status == before_statuses["run"]
        assert session.get(BotRun, UUID(fixture["activeRunId"])).pipeline_status == before_statuses["pipeline"]
        assert session.get(MarketDataImportJob, UUID(fixture["dataJobId"])).status == before_statuses["job"]

def test_strategy_job_visibility_limits_recent_runs_and_handles_missing_strategy() -> None:
    suffix = uuid4().hex[:8]
    _, strategy_id, version_id = _create_strategy_with_version(f"visibility-limit-{suffix}")
    session = SessionLocal(bind=get_engine())
    try:
        base_time = datetime.now(timezone.utc) - timedelta(hours=1)
        runs = []
        for index in range(7):
            run = BotRun(
                id=uuid4(),
                strategy_id=UUID(strategy_id),
                strategy_version_id=UUID(version_id),
                run_type="backtest",
                status="completed",
                exchange="binance",
                symbol=f"BTC{index}USDT",
                timeframe="1h",
                start_at=base_time,
                end_at=base_time + timedelta(minutes=index + 1),
                started_at=base_time + timedelta(minutes=index),
                finished_at=base_time + timedelta(minutes=index + 1),
                runtime_config={},
                risk_config={},
                source_snapshot={"sourceHash": f"visibility-limit-{index}"},
                dataset_context={"datasetKey": f"binance:BTC{index}USDT:1h"},
                pipeline_context={"preflight": {"outcome": "ready"}},
                pipeline_status="completed",
                data_job_id=None,
                error_message=None,
                created_at=base_time + timedelta(minutes=index),
                created_by="codex",
            )
            runs.append(run)
        session.add_all(runs)
        session.commit()
    finally:
        session.close()

    default_payload = assert_success_envelope(client.get(f"/api/tradelab/strategies/{strategy_id}/job-visibility"))
    assert len(default_payload["recent"]) == 5

    clamped_payload = assert_success_envelope(
        client.get(f"/api/tradelab/strategies/{strategy_id}/job-visibility", params={"limit": 100})
    )
    assert len(clamped_payload["recent"]) == 7

    assert_error_envelope(client.get(f"/api/tradelab/strategies/{uuid4()}/job-visibility"), 404)

def _create_strategy_with_version(suffix: str) -> tuple[str, str, str]:
    group_data = assert_success_envelope(
        client.post(
            "/api/tradelab/strategy-groups",
            json={
                "name": f"Group {suffix}",
                "slug": f"group-{suffix}",
                "description": "Integration test group",
                "metadata": {"visibility": "test", "purpose": "automated_test_fixture"},
                "created_by": "codex",
            },
        ),
        201,
    )
    group_id = group_data["id"]

    strategy_data = assert_success_envelope(
        client.post(
            "/api/tradelab/strategies",
            json={
                "strategy_group_id": group_id,
                "name": f"Strategy {suffix}",
                "slug": f"strategy-{suffix}",
                "description": "Integration test strategy",
                "runtime_config": {},
                "risk_config": {},
                "metadata": {},
                "created_by": "codex",
            },
        ),
        201,
    )
    strategy_id = strategy_data["id"]

    version_data = assert_success_envelope(
        client.post(
            f"/api/tradelab/strategies/{strategy_id}/versions",
            json={
                "source_code": """
def on_candle(ctx):
    return None
""".strip(),
                "created_by": "codex",
            },
        ),
        201,
    )
    version_id = version_data["id"]
    return group_id, strategy_id, version_id


def _make_unpersisted_bot(*, bot_id: UUID, strategy_id: str, version_id: str, mode: str) -> Bot:
    return Bot(
        id=bot_id,
        strategy_id=UUID(strategy_id),
        strategy_version_id=UUID(version_id),
        name=f"{mode.title()} Guard Bot {uuid4().hex[:8]}",
        mode=mode,
        status="draft",
        symbol="BTCUSDT",
        timeframe="1h",
        runtime_config={},
        risk_config={},
        metadata_={"createdFor": "execution-mode-guard-test"},
        created_by="codex",
    )


def _insert_candles(rows: list[dict[str, object]]) -> None:
    session = SessionLocal(bind=get_engine())
    try:
        for row in rows:
            existing = (
                session.query(MarketCandle)
                .filter(
                    MarketCandle.exchange == row["exchange"],
                    MarketCandle.symbol == row["symbol"],
                    MarketCandle.timeframe == row["timeframe"],
                    MarketCandle.open_time == row["open_time"],
                )
                .one_or_none()
                )
            if existing is None:
                session.add(MarketCandle(**row))
        session.commit()

        if rows:
            first_row = rows[0]
            repository = MarketDataRepository(session)
            candles = repository.list_market_candles(
                exchange=str(first_row["exchange"]),
                symbol=str(first_row["symbol"]),
                timeframe=str(first_row["timeframe"]),
            )
            health_status = inspect_candles(
                (
                    {
                        "open_time": candle.open_time,
                        "close_time": candle.close_time,
                        "open": candle.open,
                        "high": candle.high,
                        "low": candle.low,
                        "close": candle.close,
                        "volume": candle.volume,
                    }
                    for candle in candles
                ),
                timeframe=str(first_row["timeframe"]),
                assume_complete=True,
            ).health_status
            repository.refresh_coverage_from_candles(
                exchange=str(first_row["exchange"]),
                symbol=str(first_row["symbol"]),
                timeframe=str(first_row["timeframe"]),
                candles=candles,
                health_status=health_status,
                metadata={"createdBy": "codex"},
            )
            session.commit()
    finally:
        session.close()


def _insert_analysis_runs(*, strategy_id: str, version_id: str) -> tuple[str, str]:
    session = SessionLocal(bind=get_engine())
    try:
        completed_run_id = uuid4()
        open_run_id = uuid4()

        completed_run = BotRun(
            id=completed_run_id,
            strategy_id=UUID(strategy_id),
            strategy_version_id=UUID(version_id),
            run_type="backtest",
            status="completed",
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            start_at=datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
            end_at=datetime(2026, 1, 1, 3, 0, tzinfo=timezone.utc),
            started_at=datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
            finished_at=datetime(2026, 1, 1, 3, 0, tzinfo=timezone.utc),
            runtime_config={
                "exchange": "binance",
                "symbol": "BTCUSDT",
                "timeframe": "1h",
                "startAt": "2026-01-01T00:00:00Z",
                "endAt": "2026-01-01T03:00:00Z",
                "initialEquity": 1000,
                "feeBps": 0,
                "slippageBps": 0,
            },
            risk_config={
                "maxOrderPercent": 10,
                "maxPositionPercent": 100,
                "maxDrawdownPercent": 15,
                "minNotional": 10,
                "stepSize": 0.001,
                "tickSize": 0.01,
            },
            source_snapshot={
                "sourceCode": "print('analysis')",
                "sourceHash": "hash-analysis",
                "strategyVersionId": version_id,
            },
            dataset_context={
                "datasetKey": "binance:BTCUSDT:1h",
                "exchange": "binance",
                "symbol": "BTCUSDT",
                "timeframe": "1h",
                "requestedStartAt": "2026-01-01T00:00:00Z",
                "requestedEndAt": "2026-01-01T03:00:00Z",
                "coverage": {
                    "datasetKey": "binance:BTCUSDT:1h",
                    "exchange": "binance",
                    "symbol": "BTCUSDT",
                    "timeframe": "1h",
                    "healthStatus": "healthy",
                },
            },
            pipeline_context={"preflight": {"outcome": "ready"}},
            pipeline_status="completed",
            created_at=datetime(2026, 1, 1, 3, 0, tzinfo=timezone.utc),
            created_by="codex",
        )
        open_run = BotRun(
            id=open_run_id,
            strategy_id=UUID(strategy_id),
            strategy_version_id=UUID(version_id),
            run_type="backtest",
            status="running",
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            start_at=datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
            end_at=datetime(2026, 1, 1, 3, 0, tzinfo=timezone.utc),
            started_at=datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
            runtime_config={
                "exchange": "binance",
                "symbol": "BTCUSDT",
                "timeframe": "1h",
                "startAt": "2026-01-01T00:00:00Z",
                "endAt": "2026-01-01T03:00:00Z",
                "initialEquity": 1000,
                "feeBps": 0,
                "slippageBps": 0,
            },
            risk_config={
                "maxOrderPercent": 10,
                "maxPositionPercent": 100,
                "maxDrawdownPercent": 15,
                "minNotional": 10,
                "stepSize": 0.001,
                "tickSize": 0.01,
            },
            source_snapshot={
                "sourceCode": "print('analysis-open')",
                "sourceHash": "hash-analysis-open",
                "strategyVersionId": version_id,
            },
            dataset_context={
                "datasetKey": "binance:BTCUSDT:1h",
                "exchange": "binance",
                "symbol": "BTCUSDT",
                "timeframe": "1h",
                "requestedStartAt": "2026-01-01T00:00:00Z",
                "requestedEndAt": "2026-01-01T03:00:00Z",
            },
            pipeline_context={"preflight": {"outcome": "ready"}},
            pipeline_status="running",
            created_at=datetime(2026, 1, 1, 3, 0, tzinfo=timezone.utc),
            created_by="codex",
        )

        entry_signal = StrategySignal(
            id=uuid4(),
            bot_run_id=completed_run_id,
            candle_open_time=datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
            signal_type="buy",
            strength=Decimal("1"),
            payload={"kind": "entry"},
            created_at=datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
        )
        exit_signal = StrategySignal(
            id=uuid4(),
            bot_run_id=completed_run_id,
            candle_open_time=datetime(2026, 1, 1, 1, 0, tzinfo=timezone.utc),
            signal_type="sell",
            strength=Decimal("1"),
            payload={"kind": "exit"},
            created_at=datetime(2026, 1, 1, 1, 0, tzinfo=timezone.utc),
        )
        open_signal = StrategySignal(
            id=uuid4(),
            bot_run_id=open_run_id,
            candle_open_time=datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
            signal_type="buy",
            strength=Decimal("1"),
            payload={"kind": "entry"},
            created_at=datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
        )

        entry_intent = OrderIntent(
            id=uuid4(),
            bot_run_id=completed_run_id,
            strategy_signal_id=entry_signal.id,
            side="buy",
            order_type="market",
            requested_qty=Decimal("1"),
            requested_notional=Decimal("100"),
            status="accepted",
            reject_reason=None,
            payload={"action": "buy_market"},
            created_at=datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
        )
        exit_intent = OrderIntent(
            id=uuid4(),
            bot_run_id=completed_run_id,
            strategy_signal_id=exit_signal.id,
            side="sell",
            order_type="market",
            requested_qty=Decimal("1"),
            requested_notional=Decimal("110"),
            status="accepted",
            reject_reason=None,
            payload={"action": "sell_market"},
            created_at=datetime(2026, 1, 1, 1, 0, tzinfo=timezone.utc),
        )
        open_intent = OrderIntent(
            id=uuid4(),
            bot_run_id=open_run_id,
            strategy_signal_id=open_signal.id,
            side="buy",
            order_type="market",
            requested_qty=Decimal("1"),
            requested_notional=Decimal("120"),
            status="accepted",
            reject_reason=None,
            payload={"action": "buy_market"},
            created_at=datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
        )

        entry_order = TradeOrder(
            id=uuid4(),
            bot_run_id=completed_run_id,
            order_intent_id=entry_intent.id,
            side="buy",
            order_type="market",
            status="filled",
            fill_time=datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
            fill_price=Decimal("100"),
            fill_qty=Decimal("1"),
            fill_notional=Decimal("100"),
            fee_amount=Decimal("0"),
            fee_asset="quote",
            reason="entry",
            payload={"kind": "entry"},
            created_at=datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
        )
        exit_order = TradeOrder(
            id=uuid4(),
            bot_run_id=completed_run_id,
            order_intent_id=exit_intent.id,
            side="sell",
            order_type="market",
            status="filled",
            fill_time=datetime(2026, 1, 1, 1, 0, tzinfo=timezone.utc),
            fill_price=Decimal("110"),
            fill_qty=Decimal("1"),
            fill_notional=Decimal("110"),
            fee_amount=Decimal("0"),
            fee_asset="quote",
            reason="exit",
            payload={"kind": "exit"},
            created_at=datetime(2026, 1, 1, 1, 0, tzinfo=timezone.utc),
        )
        open_order = TradeOrder(
            id=uuid4(),
            bot_run_id=open_run_id,
            order_intent_id=open_intent.id,
            side="buy",
            order_type="market",
            status="filled",
            fill_time=datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
            fill_price=Decimal("120"),
            fill_qty=Decimal("1"),
            fill_notional=Decimal("120"),
            fee_amount=Decimal("0"),
            fee_asset="quote",
            reason="open",
            payload={"kind": "entry"},
            created_at=datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
        )

        completed_result = BacktestResult(
            id=uuid4(),
            bot_run_id=completed_run_id,
            initial_equity=Decimal("1000"),
            final_equity=Decimal("1010"),
            total_return_pct=Decimal("1"),
            max_drawdown_pct=Decimal("2"),
            profit_factor=Decimal("1.5"),
            win_rate_pct=Decimal("50"),
            total_trades=2,
            metrics={
                "initialEquity": 1000,
                "finalEquity": 1010,
                "totalReturnPct": 1,
                "maxDrawdownPct": 2,
                "profitFactor": 1.5,
                "winRatePct": 50,
                "totalTrades": 2,
                "closedTrades": 1,
            },
            equity_curve=[],
            created_at=datetime(2026, 1, 1, 3, 0, tzinfo=timezone.utc),
        )

        session.add_all(
            [
                completed_run,
                open_run,
                completed_result,
                entry_signal,
                exit_signal,
                open_signal,
                entry_intent,
                exit_intent,
                open_intent,
                entry_order,
                exit_order,
                open_order,
                StrategyLog(
                    id=uuid4(),
                    bot_run_id=completed_run_id,
                    level="info",
                    event_type="ENTRY",
                    message="Opened trade.",
                    payload={},
                    created_at=datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
                ),
                StrategyLog(
                    id=uuid4(),
                    bot_run_id=completed_run_id,
                    level="info",
                    event_type="EXIT",
                    message="Closed trade.",
                    payload={},
                    created_at=datetime(2026, 1, 1, 1, 0, tzinfo=timezone.utc),
                ),
                StrategyLog(
                    id=uuid4(),
                    bot_run_id=open_run_id,
                    level="info",
                    event_type="OPEN",
                    message="Still open.",
                    payload={},
                    created_at=datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc),
                ),
            ]
        )
        session.commit()
        return str(completed_run_id), str(open_run_id)
    finally:
        session.close()

def _insert_job_visibility_fixture(
    *,
    strategy_id: str,
    version_id: str,
    other_strategy_id: str,
    other_version_id: str,
) -> dict[str, str]:
    session = SessionLocal(bind=get_engine())
    try:
        now = datetime.now(timezone.utc)
        stale_started_at = now - timedelta(minutes=15)
        fresh_started_at = now - timedelta(minutes=2)

        data_job_id = uuid4()
        active_run_id = uuid4()
        recent_completed_run_id = uuid4()
        recent_failed_run_id = uuid4()
        other_strategy_run_id = uuid4()

        data_job = MarketDataImportJob(
            id=data_job_id,
            dataset_key="binance:BTCUSDT:1h",
            job_type="fill",
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            requested_start_at=stale_started_at,
            requested_end_at=now,
            applied_start_at=stale_started_at,
            applied_end_at=now,
            claimed_at=stale_started_at,
            started_at=stale_started_at,
            finished_at=None,
            worker_id="test-worker",
            start_at=stale_started_at,
            end_at=now,
            status="running",
            rows_imported=0,
            error_message=None,
            metadata_={"source": "job-visibility-test"},
            created_at=stale_started_at,
            created_by="codex",
        )
        active_run = BotRun(
            id=active_run_id,
            strategy_id=UUID(strategy_id),
            strategy_version_id=UUID(version_id),
            run_type="backtest",
            status="queued",
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            start_at=stale_started_at,
            end_at=now,
            started_at=None,
            finished_at=None,
            runtime_config={},
            risk_config={},
            source_snapshot={"sourceHash": "visibility-active"},
            dataset_context={"datasetKey": "binance:BTCUSDT:1h"},
            pipeline_context={"preflight": {"outcome": "needs_fill", "dataset_key": "binance:BTCUSDT:1h"}},
            pipeline_status="waiting_for_data",
            data_job_id=data_job_id,
            error_message=None,
            created_at=stale_started_at,
            created_by="codex",
        )
        completed_run = BotRun(
            id=recent_completed_run_id,
            strategy_id=UUID(strategy_id),
            strategy_version_id=UUID(version_id),
            run_type="backtest",
            status="completed",
            exchange="binance",
            symbol="ETHUSDT",
            timeframe="1h",
            start_at=fresh_started_at,
            end_at=now,
            started_at=fresh_started_at,
            finished_at=now,
            runtime_config={},
            risk_config={},
            source_snapshot={"sourceHash": "visibility-completed"},
            dataset_context={"datasetKey": "binance:ETHUSDT:1h"},
            pipeline_context={"preflight": {"outcome": "ready", "dataset_key": "binance:ETHUSDT:1h"}},
            pipeline_status="completed",
            data_job_id=None,
            error_message=None,
            created_at=fresh_started_at,
            created_by="codex",
        )
        failed_run = BotRun(
            id=recent_failed_run_id,
            strategy_id=UUID(strategy_id),
            strategy_version_id=UUID(version_id),
            run_type="backtest",
            status="failed",
            exchange="binance",
            symbol="BNBUSDT",
            timeframe="1h",
            start_at=fresh_started_at,
            end_at=now,
            started_at=fresh_started_at,
            finished_at=now,
            runtime_config={},
            risk_config={},
            source_snapshot={"sourceHash": "visibility-failed"},
            dataset_context={"datasetKey": "binance:BNBUSDT:1h"},
            pipeline_context={"preflight": {"outcome": "ready", "dataset_key": "binance:BNBUSDT:1h"}},
            pipeline_status="failed",
            data_job_id=None,
            error_message="Synthetic failure.",
            created_at=fresh_started_at,
            created_by="codex",
        )
        other_strategy_run = BotRun(
            id=other_strategy_run_id,
            strategy_id=UUID(other_strategy_id),
            strategy_version_id=UUID(other_version_id),
            run_type="backtest",
            status="running",
            exchange="binance",
            symbol="SOLUSDT",
            timeframe="1h",
            start_at=fresh_started_at,
            end_at=now,
            started_at=fresh_started_at,
            finished_at=None,
            runtime_config={},
            risk_config={},
            source_snapshot={"sourceHash": "visibility-other"},
            dataset_context={"datasetKey": "binance:SOLUSDT:1h"},
            pipeline_context={"preflight": {"outcome": "ready", "dataset_key": "binance:SOLUSDT:1h"}},
            pipeline_status="running",
            data_job_id=None,
            error_message=None,
            created_at=fresh_started_at,
            created_by="codex",
        )
        link = MarketDataJobRunLink(
            id=uuid4(),
            import_job_id=data_job_id,
            bot_run_id=active_run_id,
            link_status="waiting",
            metadata_={"source": "job-visibility-test"},
            created_at=stale_started_at,
            created_by="codex",
        )
        session.add_all([data_job, active_run, completed_run, failed_run, other_strategy_run, link])
        session.commit()
        return {
            "activeRunId": str(active_run_id),
            "completedRunId": str(recent_completed_run_id),
            "failedRunId": str(recent_failed_run_id),
            "otherRunId": str(other_strategy_run_id),
            "dataJobId": str(data_job_id),
        }
    finally:
        session.close()


def test_preflight_blocks_api_bypass() -> None:
    suffix = uuid4().hex[:8]
    _, strategy_id, version_id = _create_strategy_with_version(suffix)
    session = SessionLocal(bind=get_engine())
    try:
        # Create a bot that references the strategy
        bot = Bot(
            strategy_id=strategy_id,
            strategy_version_id=version_id,
            name=f"Bypass Bot {suffix}",
            mode="backtest",
            status="draft",
            symbol="BTCUSDT",
            timeframe="1h",
            runtime_config={},
            risk_config={},
            created_by="pytest",
        )
        # Create 3 candles with fixture source
        c1 = MarketCandle(
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            open_time=datetime(2026, 1, 1, 0, tzinfo=timezone.utc),
            close_time=datetime(2026, 1, 1, 1, tzinfo=timezone.utc),
            open=Decimal("100"),
            high=Decimal("101"),
            low=Decimal("99"),
            close=Decimal("100"),
            volume=Decimal("10"),
            source="tradelab-local-fill-smoke-fixture",
        )
        c2 = MarketCandle(
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            open_time=datetime(2026, 1, 1, 1, tzinfo=timezone.utc),
            close_time=datetime(2026, 1, 1, 2, tzinfo=timezone.utc),
            open=Decimal("100"),
            high=Decimal("101"),
            low=Decimal("99"),
            close=Decimal("100"),
            volume=Decimal("10"),
            source="tradelab-local-fill-smoke-fixture",
        )
        c3 = MarketCandle(
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            open_time=datetime(2026, 1, 1, 2, tzinfo=timezone.utc),
            close_time=datetime(2026, 1, 1, 3, tzinfo=timezone.utc),
            open=Decimal("100"),
            high=Decimal("101"),
            low=Decimal("99"),
            close=Decimal("100"),
            volume=Decimal("10"),
            source="tradelab-local-fill-smoke-fixture",
        )
        session.add_all([bot, c1, c2, c3])
        session.commit()
        bot_id = bot.id
    finally:
        session.close()

    try:
        response = client.post(
            f"/api/tradelab/bots/{bot_id}/backtests",
            json={
                "exchange": "binance",
                "symbol": "BTCUSDT",
                "timeframe": "1h",
                "start_at": "2026-01-01T00:00:00Z",
                "end_at": "2026-01-01T02:00:00Z",
                "initial_equity": 1000,
                "fee_bps": 0,
                "slippage_bps": 0,
            },
        )
        payload = assert_error_envelope(response, 409)
        assert payload["Data"]["reasonCode"] == "dataset_contains_fixture_rows"

        # Check no BotRun or MarketDataImportJob was created
        with SessionLocal(bind=get_engine()) as session:
            run_count = session.query(BotRun).filter(BotRun.bot_id == bot_id).count()
            assert run_count == 0
            job_count = session.query(MarketDataImportJob).filter(
                MarketDataImportJob.dataset_key == "binance:BTCUSDT:1h",
                MarketDataImportJob.job_type == "repair"
            ).count()
            assert job_count == 0
    finally:
        with SessionLocal(bind=get_engine()) as session:
            session.query(MarketCandle).filter(MarketCandle.source == "tradelab-local-fill-smoke-fixture").delete()
            session.commit()
