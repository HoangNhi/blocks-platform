import json
from datetime import datetime, timezone
import pytest
from agents.tools import tradelab_pilot_controller as tpc
from agents.tools.tradelab_pilot_controller import TradeLabClient, render_strategy_source, research_status, submit_experiment


def _write_campaign(root, campaign_id="smoke-test", task_id="t_deadbeef", profile="tradelab-trend-researcher", selected=None):
    d = root / campaign_id
    (d / "trend").mkdir(parents=True, exist_ok=True)
    agents = {"trend": {"profile": profile, "taskId": task_id}}
    campaign_data = {
        "campaignId": campaign_id, "status": "frozen",
        "market": {"marketType": "USD_M_FUTURES", "exchange": "binance", "symbol": "BTCUSDT",
                   "timeframe": "1h", "startAt": "2022-01-01T00:00:00Z", "endAt": "2026-06-16T00:00:00Z",
                   "datasetKey": "binance:BTCUSDT:1h"},
        "capital": {"initialEquity": "100", "recurringDeposit": None},
        "costs": {"feeBps": "10", "slippageBps": "1", "fundingModel": "TradeLab engine"},
        "risk": {"leverage": 2, "maxOrderPercent": "50", "maxPositionPercent": "50",
                 "minNotional": "5", "maxDrawdownPercent": "15"},
        "budget": {"maxTrialsPerAgent": 5, "maxMinutesPerAgent": 30, "preSubmissionTransportRetries": 1},
        "target": {"monthlyReturnPct": "2", "guaranteed": False},
        "agents": agents,
    }
    if selected is not None:
        campaign_data["selectedAgents"] = selected
    (d / "campaign.json").write_text(json.dumps(campaign_data))
    return d


class RecordingTransport:
    def __init__(self, responses=None):
        self.calls = []
        self.responses = list(responses or [])

    def __call__(self, method, url, payload, timeout):
        self.calls.append((method, url, payload, timeout))
        if self.responses:
            return self.responses.pop(0)
        return {"Success": True, "Message": "OK", "StatusCode": 200, "Data": {}}


def test_client_rejects_every_execution_and_dataset_mutation_route() -> None:
    client = TradeLabClient(transport=RecordingTransport())
    for path in (
        "/api/tradelab/paper/sessions",
        "/api/tradelab/testnet/orders/preview",
        "/api/tradelab/live/orders/submit",
        "/api/tradelab/testnet-credentials",
        "/api/tradelab/live-credentials",
        "/api/tradelab/datasets/fill-local",
        "/api/tradelab/exchange-connections",
    ):
        with pytest.raises(ValueError, match="forbidden_route"):
            client.request("POST", path, {})


def test_client_does_not_retry_ambiguous_backtest_post(monkeypatch) -> None:
    calls = []

    def timeout(*args, **kwargs):
        calls.append(args)
        raise TimeoutError("response lost after submit")

    monkeypatch.setattr(tpc.urllib.request, "urlopen", timeout)

    with pytest.raises(TimeoutError, match="response lost after submit"):
        TradeLabClient().request("POST", "/api/tradelab/bots/abcd-ef01/backtests", {})

    assert len(calls) == 1


def test_research_status_accepts_snake_case_campaign_id(tmp_path, monkeypatch) -> None:
    # glm-5.2 emits snake_case keys even when tool docs ask for camelCase.
    # A case mismatch must not block the worker at step 1.
    _write_campaign(tmp_path, campaign_id="smoke-snake")
    monkeypatch.setattr(tpc, "CAMPAIGNS_ROOT", tmp_path)
    monkeypatch.setenv("HERMES_PROFILE", "tradelab-trend-researcher")
    monkeypatch.setenv("HERMES_KANBAN_TASK", "t_deadbeef")
    snake = json.loads(research_status({"campaign_id": "smoke-snake"}))
    camel = json.loads(research_status({"campaignId": "smoke-snake"}))
    assert snake["Success"] is True and snake["agentId"] == "trend"
    assert camel["Success"] is True and camel["agentId"] == "trend"


def test_research_status_recovers_campaign_id_from_reason(tmp_path, monkeypatch) -> None:
    _write_campaign(tmp_path, campaign_id="smoke-reason")
    monkeypatch.setattr(tpc, "CAMPAIGNS_ROOT", tmp_path)
    monkeypatch.setenv("HERMES_PROFILE", "tradelab-trend-researcher")
    monkeypatch.setenv("HERMES_KANBAN_TASK", "t_deadbeef")

    payload = json.loads(research_status({"reason": "Get status for campaign smoke-reason"}))

    assert payload["Success"] is True
    assert payload["agentId"] == "trend"


def test_submit_parses_reason_manifest_and_records_invalid_parameters(tmp_path, monkeypatch) -> None:
    _write_campaign(tmp_path, campaign_id="smoke-reason-manifest")
    monkeypatch.setattr(tpc, "CAMPAIGNS_ROOT", tmp_path)
    monkeypatch.setenv("HERMES_PROFILE", "tradelab-trend-researcher")
    monkeypatch.setenv("HERMES_KANBAN_TASK", "t_deadbeef")

    response = json.loads(submit_experiment({"reason": json.dumps({
        "campaignId": "smoke-reason-manifest",
        "hypothesis": "A malformed manifest must be rejected without a controller crash.",
        "sources": [{
            "url": "https://example.com/research",
            "retrievedAt": "2026-07-24",
            "claim": "test",
        }],
        "changedParameterGroup": "baseline",
        "parameters": "not-an-object",
        "expectedEffect": "test",
    })}))

    assert response["Success"] is False
    assert "parameters_must_be_object" in response["errors"]
    rejected = [
        json.loads(line)
        for line in (tmp_path / "smoke-reason-manifest" / "trend" / "rejected-manifests.jsonl").read_text().splitlines()
    ]
    assert rejected[0]["manifest"]["parameters"] == {}


def test_family_templates_are_deterministic_and_force_futures_boundary() -> None:
    params = {"fast": 10, "slow": 40, "adx": 20, "exitBars": 48}
    first = render_strategy_source("trend", params)
    second = render_strategy_source("trend", dict(reversed(list(params.items()))))
    assert first == second
    assert "ctx.set_leverage(2)" in first
    assert "ctx.set_margin_mode(\"CROSS\")" in first
    assert "def on_candle(ctx):" in first
    assert "import os" not in first


def test_submission_workflow_calls_allowed_endpoints_only(tmp_path, monkeypatch) -> None:
    # Use hex/hyphens for all mock IDs so they match allowlist regexes
    strat_id = "0123-4567"
    bot_id = "89ab-cdef"
    run_id = "1234-5678"
    version_id = "abcd-ef01"

    responses = [
        # 1. coverage
        {"Success": True, "Data": {"coverage": [{"datasetKey": "binance:BTCUSDT:1h", "coveredEndAt": "2026-06-16T00:59:59.999000Z"}]}},
        # 2. validate-source
        {"Success": True, "Data": {"validationStatus": "valid"}},
        # 3. strategy-group
        {"Success": True, "Data": {"id": "group-id"}},
        # 4. strategy
        {"Success": True, "Data": {"id": strat_id}},
        # 5. strategy version
        {"Success": True, "Data": {"id": version_id}},
        # 6. bot
        {"Success": True, "Data": {"id": bot_id}},
        # 7. preflight
        {"Success": True, "Data": {"preflightStatus": "ok", "datasetFingerprint": "fingerprint123"}},
        # 8. backtest run
        {"Success": True, "Data": {"bot_run_id": run_id, "id": run_id}},
        # 9. poll run status (status: completed, pipeline_status: completed)
        {"Success": True, "Data": {
            "id": run_id, "status": "completed", "pipeline_status": "completed", "error_message": None,
            "exchange": "binance", "symbol": "BTCUSDT", "timeframe": "1h",
            "botId": bot_id, "strategyId": strat_id, "strategyVersionId": version_id,
            "start_at": "2022-01-01T00:00:00Z", "end_at": "2026-06-16T00:59:59.999000Z",
            "runtime_config": {"initialEquity": 100.0, "feeBps": 10.0, "slippageBps": 1.0},
            "risk_config": {"maxOrderPercent": 50.0, "maxPositionPercent": 50.0, "minNotional": 5.0, "maxDrawdownPercent": 15.0},
            "dataset_context": {"datasetKey": "binance:BTCUSDT:1h"},
            "dataset_fingerprint": "fingerprint123"
        }},
        # 10. result
        {"Success": True, "Data": {
            "bot_run_id": run_id, "initial_equity": "100", "final_equity": "130",
            "total_return_pct": "30", "max_drawdown_pct": "10", "profit_factor": "1.5",
            "total_trades": 40,
            "metrics": {"liquidationCount": 0, "closedTrades": 40, "totalFundingFeePaid": 1.2},
            "equity_curve": [
                {"timestamp": "2025-01-28T23:00:00Z", "equity": 100},
                {"timestamp": "2025-02-28T23:00:00Z", "equity": 105},
                {"timestamp": "2025-03-28T23:00:00Z", "equity": 110},
                {"timestamp": "2025-04-28T23:00:00Z", "equity": 115},
                {"timestamp": "2025-05-28T23:00:00Z", "equity": 120},
                {"timestamp": "2025-06-28T23:00:00Z", "equity": 125},
                {"timestamp": "2025-07-28T23:00:00Z", "equity": 130},
                {"timestamp": "2025-08-28T23:00:00Z", "equity": 135},
                {"timestamp": "2025-09-28T23:00:00Z", "equity": 140},
                {"timestamp": "2025-10-28T23:00:00Z", "equity": 145},
                {"timestamp": "2025-11-28T23:00:00Z", "equity": 150},
                {"timestamp": "2025-12-28T23:00:00Z", "equity": 155},
            ]
        }},
        # 11. analysis
        {"Success": True, "Data": {"trade_summary": {"open_trades": 0, "closed_trades": 40}}},
        # 12. orders
        {"Success": True, "Data": [{"status": "filled", "reason": "entry"}]},
        # 13. logs
        {"Success": True, "Data": []},
    ]

    transport = RecordingTransport(responses)
    client = TradeLabClient(transport=transport)

    # Set environment variables for status and submit
    monkeypatch.setenv("HERMES_PROFILE", "tradelab-trend-researcher")
    monkeypatch.setenv("HERMES_KANBAN_TASK", "task-1")

    # Set up campaign directory
    campaign_dir = tmp_path / "campaigns" / "pilot-1"
    campaign_dir.mkdir(parents=True, exist_ok=True)

    # write campaign.json policy file
    policy_data = {
        "campaignId": "pilot-1",
        "status": "frozen",
        "selectedAgents": ["trend"],
        "market": {
            "marketType": "USD_M_FUTURES", "exchange": "binance", "symbol": "BTCUSDT",
            "timeframe": "1h", "startAt": "2022-01-01T00:00:00Z", "endAt": "2026-06-16T00:59:59.999000Z",
            "datasetKey": "binance:BTCUSDT:1h"
        },
        "capital": {"initialEquity": "100", "recurringDeposit": None},
        "costs": {"feeBps": "10", "slippageBps": "1", "fundingModel": "TradeLab engine"},
        "risk": {
            "leverage": 2, "maxOrderPercent": "50", "maxPositionPercent": "50",
            "minNotional": "5", "maxDrawdownPercent": "15"
        },
        "budget": {"maxTrialsPerAgent": 5, "maxMinutesPerAgent": 30, "preSubmissionTransportRetries": 1},
        "target": {"monthlyReturnPct": "2", "guaranteed": False},
        "agents": {
            "trend": {"profile": "tradelab-trend-researcher", "taskId": "task-1"}
        }
    }
    with open(campaign_dir / "campaign.json", "w") as f:
        json.dump(policy_data, f)

    # Mock campaigns root inside controller
    monkeypatch.setattr("agents.tools.tradelab_pilot_controller.CAMPAIGNS_ROOT", tmp_path / "campaigns")

    # Run submit_experiment
    args = {
        "campaignId": "pilot-1",
        "hypothesis": "ADX filter should reduce chop losses.",
        "sources": [{"url": "https://example.com/adx", "retrievedAt": "2026-07-18", "claim": "ADX measures trend strength."}],
        "changedParameterGroup": "baseline",
        "parameters": {"fast": 10, "slow": 40, "adx": 20, "exitBars": 48},
        "expectedEffect": "Lower drawdown without eliminating trade count.",
        "observedEffect": "",
        "lesson": "Initial baseline trial.",
        "nextExperiment": "Raise ADX threshold."
    }

    result = json.loads(submit_experiment(args, client=client))
    assert result["evidenceOk"] is True
    assert result["verdict"] == "RESEARCH_CANDIDATE"
    assert result["runId"] == run_id
    evidence_records = [
        json.loads(line)
        for line in (campaign_dir / "trend" / "controller-evidence.jsonl").read_text().splitlines()
    ]
    assert len(evidence_records) == 1
    assert evidence_records[0]["runId"] == run_id
    assert evidence_records[0]["sourceHash"]
    assert evidence_records[0]["policyHash"]
    assert evidence_records[0]["normalizedEvidence"]["result"]["bot_run_id"] == run_id
    accepted_records = [
        json.loads(line)
        for line in (campaign_dir / "trend" / "accepted-trials.jsonl").read_text().splitlines()
    ]
    assert len(accepted_records) == 1
    accepted_record = accepted_records[0]
    assert accepted_record["normalizedEvidence"]["result"]["bot_run_id"] == run_id
    assert accepted_record["integrityChecks"] == evidence_records[0]["integrityChecks"]
    assert accepted_record["gateResults"] == evidence_records[0]["gateResults"]
    assert accepted_record["controllerVerdict"] == evidence_records[0]["controllerVerdict"]

    # Verify calls
    assert len(transport.calls) > 0
    forbidden = ["paper", "testnet", "live", "credential", "submit-order", "cancel", "reconcile"]
    for method, path, payload, timeout in transport.calls:
        for f in forbidden:
            assert f not in path


def test_controller_requires_exact_campaign_profile_and_task(tmp_path, monkeypatch) -> None:
    _write_campaign(tmp_path, campaign_id="pilot-auth", selected=["trend"], task_id="task-trend", profile="tradelab-trend-researcher")
    monkeypatch.setattr(tpc, "CAMPAIGNS_ROOT", tmp_path)
    monkeypatch.setenv("HERMES_PROFILE", "tradelab-mean-reversion-researcher")
    monkeypatch.setenv("HERMES_KANBAN_TASK", "task-trend")
    payload = json.loads(research_status({"campaignId": "pilot-auth"}))
    assert payload["error"] == "profile_task_authorization_failed"
    assert not list((tmp_path / "pilot-auth" / "trend").glob("*.jsonl"))


class RecordingTransportClient:
    def __init__(self, acknowledge_run_id, timeout_after_ack=False):
        self.ack_run_id = acknowledge_run_id
        self.timeout_after_ack = timeout_after_ack
        self.backtest_post_count = 0
        self.calls = []

    def __call__(self, method, path, payload, timeout=20):
        self.calls.append((method, path, payload, timeout))
        if method == "POST" and "backtests" in path and "preflight" not in path:
            self.backtest_post_count += 1
            return {"Success": True, "Data": {"bot_run_id": self.ack_run_id, "id": self.ack_run_id}}
        if method == "GET" and "bot-runs" in path:
            if self.timeout_after_ack:
                return {"Success": False, "Message": "connection timeout", "StatusCode": 504}
            if "result" in path:
                return {"Success": True, "Data": {
                    "bot_run_id": self.ack_run_id,
                    "metrics": {"liquidationCount": 0, "closedTrades": 40},
                    "equity_curve": [{"timestamp": "2025-01-28T23:00:00Z", "equity": 100}]
                }}
            elif "analysis" in path:
                return {"Success": True, "Data": {"trade_summary": {"open_trades": 0, "closed_trades": 40}}}
            elif "orders" in path:
                return {"Success": True, "Data": [{"status": "filled", "reason": "entry"}]}
            else:
                return {"Success": True, "Data": {
                    "id": self.ack_run_id, "status": "completed", "pipeline_status": "completed",
                    "exchange": "binance", "symbol": "BTCUSDT", "timeframe": "1h",
                    "start_at": "2022-01-01T00:00:00Z", "end_at": "2026-06-16T00:00:00Z",
                    "runtime_config": {"initialEquity": 100.0, "feeBps": 10.0, "slippageBps": 1.0},
                    "risk_config": {"maxOrderPercent": 50.0, "maxPositionPercent": 50.0, "minNotional": 5.0, "maxDrawdownPercent": 15.0},
                    "dataset_context": {"datasetKey": "binance:BTCUSDT:1h"},
                }}
        if "validate-source" in path:
            return {"Success": True, "Data": {"validationStatus": "valid"}}
        return {"Success": True, "Data": {"id": "abcd-ef01"}}


class LostBacktestTransport(RecordingTransportClient):
    def __call__(self, method, path, payload, timeout=20):
        if method == "POST" and "backtests" in path and "preflight" not in path:
            self.backtest_post_count += 1
            raise TimeoutError("response lost after submit")
        return super().__call__(method, path, payload, timeout)


def test_acknowledged_run_never_resubmits_after_retry(tmp_path, monkeypatch) -> None:
    _write_campaign(tmp_path, campaign_id="pilot-retry", selected=["trend"], task_id="task-trend", profile="tradelab-trend-researcher")
    monkeypatch.setattr(tpc, "CAMPAIGNS_ROOT", tmp_path)
    monkeypatch.setenv("HERMES_PROFILE", "tradelab-trend-researcher")
    monkeypatch.setenv("HERMES_KANBAN_TASK", "task-trend")

    # Speed up sleep in polling
    import time as pytime
    monkeypatch.setattr(pytime, "sleep", lambda x: None)

    # We want a client that acts like TradeLab API
    transport = RecordingTransportClient("run-1", timeout_after_ack=True)
    client = TradeLabClient(transport=transport)

    args = {
        "campaignId": "pilot-retry",
        "hypothesis": "h",
        "sources": [{"url": "https://example.com/adx", "retrievedAt": "2026-07-18", "claim": "claim"}],
        "changedParameterGroup": "baseline",
        "parameters": {"fast": 10, "slow": 40, "adx": 20, "exitBars": 48},
        "expectedEffect": "x"
    }

    first = json.loads(submit_experiment(args, client=client))
    intent_records = [
        json.loads(line)
        for line in (tmp_path / "pilot-retry" / "trend" / "submission-intents.jsonl").read_text().splitlines()
    ]
    assert [record["status"] for record in intent_records] == ["pending", "acknowledged"]
    second = json.loads(submit_experiment(args, client=client))
    assert first.get("runId") == second.get("runId") == "run-1"
    assert transport.backtest_post_count == 1


def test_ambiguous_backtest_submission_blocks_retry_without_second_post(tmp_path, monkeypatch) -> None:
    _write_campaign(tmp_path, campaign_id="pilot-ambiguous", selected=["trend"], task_id="task-trend", profile="tradelab-trend-researcher")
    monkeypatch.setattr(tpc, "CAMPAIGNS_ROOT", tmp_path)
    monkeypatch.setenv("HERMES_PROFILE", "tradelab-trend-researcher")
    monkeypatch.setenv("HERMES_KANBAN_TASK", "task-trend")
    transport = LostBacktestTransport("run-not-returned")
    client = TradeLabClient(transport=transport)
    args = {
        "campaignId": "pilot-ambiguous",
        "hypothesis": "h",
        "sources": [{"url": "https://example.com/adx", "retrievedAt": "2026-07-18", "claim": "claim"}],
        "changedParameterGroup": "baseline",
        "parameters": {"fast": 10, "slow": 40, "adx": 20, "exitBars": 48},
        "expectedEffect": "x",
    }

    first = json.loads(submit_experiment(args, client=client))
    second = json.loads(submit_experiment(args, client=client))

    assert first["error"] == "ambiguous_backtest_submission"
    assert second["error"] == "ambiguous_backtest_submission"
    assert transport.backtest_post_count == 1
    intents = [
        json.loads(line)
        for line in (tmp_path / "pilot-ambiguous" / "trend" / "submission-intents.jsonl").read_text().splitlines()
    ]
    assert len(intents) == 1
    assert intents[0]["status"] == "pending"


def test_subsequent_trial_creates_bot_bound_to_its_strategy_version(tmp_path, monkeypatch) -> None:
    _write_campaign(tmp_path, campaign_id="pilot-version", selected=["trend"], task_id="task-trend")
    monkeypatch.setattr(tpc, "CAMPAIGNS_ROOT", tmp_path)
    monkeypatch.setenv("HERMES_PROFILE", "tradelab-trend-researcher")
    monkeypatch.setenv("HERMES_KANBAN_TASK", "task-trend")

    agent_dir = tmp_path / "pilot-version" / "trend"
    (agent_dir / "accepted-trials.jsonl").write_text(
        json.dumps({
            "runId": "run-1",
                "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "strategyId": "strategy-1",
            "botId": "bot-1",
            "versionId": "version-1",
            "manifest": {"parameters": {"fast": 10, "slow": 40, "adx": 20, "exitBars": 48}},
        }) + "\n",
        encoding="utf-8",
    )

    class VersionBoundClient:
        def __init__(self):
            self.calls = []

        def request(self, method, path, payload=None):
            self.calls.append((method, path, payload))
            if path == "/api/tradelab/datasets/coverage":
                return {"items": []}
            if path == "/api/tradelab/strategies/validate-source":
                return {"validationStatus": "valid"}
            if path == "/api/tradelab/strategies/strategy-1/versions":
                return {"id": "version-2"}
            if path == "/api/tradelab/bots":
                return {"id": "bot-2"}
            if path == "/api/tradelab/bots/bot-2/backtests/preflight":
                return {"outcome": "ready"}
            if path == "/api/tradelab/bots/bot-2/backtests":
                return {"id": "run-2"}
            if path == "/api/tradelab/bot-runs/run-2":
                return {"id": "run-2", "status": "completed", "pipeline_status": "completed", "error_message": None}
            if path.endswith(("/result", "/analysis", "/orders", "/logs")):
                return {}
            raise AssertionError(f"Unexpected request: {method} {path}")

    monkeypatch.setattr(
        tpc,
        "verify_run",
        lambda *args: tpc.VerifiedEvidence(
            evidence_ok=True,
            failed_reasons=(),
            run_id="run-2",
            dataset_fingerprint="dataset",
            metrics={},
            integrity_checks={"warningLogs": [], "errorLogs": []},
            gate_results={"closed_trades_ok": False},
        ),
    )
    client = VersionBoundClient()

    result = json.loads(submit_experiment({
        "campaignId": "pilot-version",
        "hypothesis": "Changed entry parameters require a matching version.",
        "sources": [{"url": "https://example.com", "retrievedAt": "2026-07-24", "claim": "test"}],
        "changedParameterGroup": "entry",
        "parameters": {"fast": 11, "slow": 40, "adx": 20, "exitBars": 48},
        "expectedEffect": "test",
    }, client=client))

    assert result.get("runId") == "run-2", result
    bot_call = next(call for call in client.calls if call[1] == "/api/tradelab/bots")
    assert bot_call[2]["strategy_version_id"] == "version-2"
    assert any(path == "/api/tradelab/bots/bot-2/backtests" for _, path, _ in client.calls)
