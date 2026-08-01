from datetime import datetime, timedelta, timezone
from decimal import Decimal
import json
from pathlib import Path
import pytest

from agents.tools.tradelab_pilot_contract import (
    CampaignPolicy,
    ExperimentManifest,
    VerifiedEvidence,
    AgentState,
    ARTIFACT_NAMES,
    append_jsonl,
    compute_monthly_metrics,
    validate_manifest,
    verify_run,
    write_agent_artifacts,
    validate_selected_agents,
    load_agent_state,
    read_jsonl,
    write_agent_summary,
)


def policy() -> CampaignPolicy:
    return CampaignPolicy(
        campaign_id="pilot-20260718",
        exchange="binance", symbol="BTCUSDT", timeframe="1h",
        market_type="USD_M_FUTURES",
        start_at="2022-01-01T00:00:00Z",
        end_at="2026-06-16T00:59:59.999000Z",
        initial_equity=Decimal("100"), fee_bps=Decimal("10"),
        slippage_bps=Decimal("1"), leverage=2,
        max_order_percent=Decimal("50"), max_position_percent=Decimal("50"),
        min_notional=Decimal("5"), max_drawdown_percent=Decimal("15"),
        max_trials=5, max_minutes=30, monthly_target_pct=Decimal("2"),
    )


def manifest(**overrides) -> ExperimentManifest:
    values = dict(
        campaign_id="pilot-20260718", agent_id="trend",
        hypothesis="ADX filter should reduce chop losses.",
        sources=({"url": "https://example.com/adx", "retrievedAt": "2026-07-18", "claim": "ADX measures trend strength."},),
        changed_parameter_group="entry",
        parameters={"fast": 10, "slow": 40, "adx": 20, "exitBars": 48},
        expected_effect="Lower drawdown without eliminating trade count.",
    )
    values.update(overrides)
    return ExperimentManifest(**values)


def test_rejects_sixth_trial_and_expired_agent() -> None:
    now = datetime(2026, 7, 18, tzinfo=timezone.utc)
    assert "trial_budget_exhausted" in validate_manifest(policy(), manifest(), None, 5, now, now)
    assert "time_budget_exhausted" in validate_manifest(
        policy(), manifest(), None, 0, now - timedelta(minutes=31), now
    )


def test_only_declared_parameter_group_may_change() -> None:
    previous = {"fast": 10, "slow": 40, "adx": 20, "exitBars": 48}
    next_manifest = manifest(parameters={"fast": 12, "slow": 48, "adx": 20, "exitBars": 36})
    errors = validate_manifest(policy(), next_manifest, previous, 1, None, datetime.now(timezone.utc))
    assert errors == ["parameter_changed_outside_group:exitBars"]


def test_monthly_metrics_use_month_end_equity_not_deposits() -> None:
    curve = [
        {"timestamp": "2026-01-31T23:00:00Z", "equity": 102},
        {"timestamp": "2026-02-28T23:00:00Z", "equity": 99.96},
        {"timestamp": "2026-03-31T23:00:00Z", "equity": 104.958},
    ]
    metrics = compute_monthly_metrics(curve, Decimal("100"))
    assert metrics["monthlyReturnsPct"] == ["2.0000", "-2.0000", "5.0000"]
    assert metrics["medianMonthlyReturnPct"] == "2.0000"
    assert metrics["profitableMonths"] == 2
    assert metrics["worstMonthPct"] == "-2.0000"


def test_append_jsonl_never_rewrites_prior_records(tmp_path) -> None:
    path = tmp_path / "experiments.jsonl"
    append_jsonl(path, {"experimentId": "e1", "verdict": "reject"})
    first = path.read_bytes()
    append_jsonl(path, {"experimentId": "e2", "verdict": "advance"})
    assert path.read_bytes().startswith(first)
    assert [json.loads(line)["experimentId"] for line in path.read_text().splitlines()] == ["e1", "e2"]


def test_verified_lesson_requires_completed_consistent_run(tmp_path) -> None:
    evidence = verify_run(
        policy(), manifest(),
        run={
            "id": "run-1", "status": "completed", "pipeline_status": "completed",
            "error_message": None, "exchange": "binance", "symbol": "BTCUSDT",
            "timeframe": "1h", "start_at": policy().start_at, "end_at": policy().end_at,
            "runtime_config": {"initialEquity": 100.0, "feeBps": 10.0, "slippageBps": 1.0},
            "risk_config": {"maxOrderPercent": 50.0, "maxPositionPercent": 50.0, "minNotional": 5.0, "maxDrawdownPercent": 15.0},
            "dataset_context": {"datasetKey": "binance:BTCUSDT:1h"},
        },
        result={
            "bot_run_id": "run-1", "initial_equity": "100", "final_equity": "130",
            "total_return_pct": "30", "max_drawdown_pct": "10", "profit_factor": "1.5",
            "total_trades": 40,
            "metrics": {"liquidationCount": 0, "closedTrades": 40, "totalFundingFeePaid": 1.2},
            "equity_curve": [
                {"timestamp": f"2025-{month:02d}-28T23:00:00Z", "equity": 100 + month * 3}
                for month in range(1, 13)
            ],
        },
        analysis={"trade_summary": {"open_trades": 0, "closed_trades": 40}},
        orders=[{"status": "filled", "reason": "entry"}],
    )
    assert evidence.evidence_ok is True
    status = write_agent_artifacts(tmp_path, {
        "experimentId": "e1", "agentId": "trend", "hypothesis": "h",
        "sourceUrls": ["https://example.com/adx"], "changedParameterGroup": "baseline",
        "previousValue": None, "newValue": manifest().parameters, "expectedEffect": "x",
        "runId": "run-1", "observedEffect": "positive full-window result",
        "lesson": "Keep ADX prior for next trend experiment.", "nextExperiment": "Raise ADX threshold.",
    }, evidence)
    assert status in {"RESEARCH_CANDIDATE", "NO_CANDIDATE_WITHIN_BUDGET"}
    assert (tmp_path / "lessons.jsonl").exists()


def test_mismatch_blocks_lesson_promotion(tmp_path) -> None:
    bad = VerifiedEvidence(
        evidence_ok=False, failed_reasons=("result_run_id_mismatch",),
        run_id="run-1", dataset_fingerprint="", metrics={}, integrity_checks={}, gate_results={},
    )
    status = write_agent_artifacts(tmp_path, {
        "experimentId": "e1", "agentId": "trend", "hypothesis": "h", "sourceUrls": [],
        "changedParameterGroup": "baseline", "previousValue": None, "newValue": {},
        "expectedEffect": "x", "runId": "run-1", "observedEffect": "untrusted",
        "lesson": "must not promote", "nextExperiment": "none",
    }, bad)
    assert status == "BLOCKED"
    assert not (tmp_path / "lessons.jsonl").exists()
    assert (tmp_path / "blocked.md").exists()


def _live_results(equity_curve, closed_trades=40, open_trades=0):
    return {
        "ts": analysis_ts(profit_factor="1.5", closed_trades=closed_trades, open_trades=open_trades),
        "orders": {"items": [{"status": "filled", "reason": "entry"}] * closed_trades},
        "result": {
            "bot_run_id": "run-1", "initial_equity": "100", "final_equity": "130",
            "total_return_pct": "30", "max_drawdown_pct": "10", "profit_factor": None,
            "total_trades": 40,
            "metrics": {"liquidationCount": 0, "closedTrades": 40, "totalFundingFeePaid": 1.2},
            "equity_curve": equity_curve,
        },
        "run": {
            "id": "run-1", "status": "completed", "pipeline_status": "completed",
            "error_message": None, "exchange": "binance", "symbol": "BTCUSDT", "timeframe": "1h",
            "start_at": "2022-01-01T00:00:00+00:00", "end_at": policy().end_at.replace("Z", "+00:00"),
            "runtime_config": {"initialEquity": 100.0, "feeBps": 10.0, "slippageBps": 1.0},
            "risk_config": {"maxOrderPercent": 50.0, "maxPositionPercent": 50.0, "minNotional": 5.0, "maxDrawdownPercent": 15.0},
            "dataset_context": {"datasetKey": "binance:BTCUSDT:1h", "dataset_key": "binance:BTCUSDT:1h"},
        },
    }


def analysis_ts(profit_factor="1.5", closed_trades=40, open_trades=0):
    return {"trade_summary": {"open_trades": open_trades, "closed_trades": closed_trades, "profit_factor": profit_factor}}


def test_verify_run_handles_live_tradeLab_shapes(tmp_path) -> None:
    # /orders returns {"items": [...]}, profit_factor lives in analysis.trade_summary
    # not result top-level, and timestamps carry +00:00 not Z.
    monthly = [
        {"timestamp": f"2025-{month:02d}-28T23:00:00+00:00", "equity": 100 + month * 3}
        for month in range(1, 13)
    ]
    parts = _live_results(monthly)
    evidence = verify_run(policy(), manifest(), parts["run"], parts["result"], parts["ts"], parts["orders"])
    assert evidence.evidence_ok is True
    assert "result_run_id_mismatch" not in evidence.failed_reasons
    assert "run_market_parameters_mismatch" not in evidence.failed_reasons
    assert evidence.dataset_fingerprint == "binance:BTCUSDT:1h"
    assert evidence.gate_results["profit_factor_ok"] is True


def test_open_trades_block_candidate(tmp_path) -> None:
    monthly = [
        {"timestamp": f"2025-{month:02d}-28T23:00:00+00:00", "equity": 100 + month * 3}
        for month in range(1, 13)
    ]
    parts = _live_results(monthly, open_trades=3)
    evidence = verify_run(policy(), manifest(), parts["run"], parts["result"], parts["ts"], parts["orders"])
    # open trades fail the candidate gate, not evidence trust
    assert evidence.evidence_ok is True
    assert "open_trades_present" not in evidence.failed_reasons
    assert evidence.gate_results["open_trades_ok"] is False
    assert evidence.gate_results["orders_filled_ok"] is True


def test_selected_agents_require_one_to_three_unique_supported_families() -> None:
    agents = {"trend": {"profile": "p1"}, "mean-reversion": {"profile": "p2"}}
    assert validate_selected_agents(["trend", "mean-reversion"], agents) == ("trend", "mean-reversion")
    for selected in ([], ["trend", "trend"], ["unknown"], ["trend", "mean-reversion", "breakout", "trend"]):
        with pytest.raises(ValueError):
            validate_selected_agents(selected, agents)


def test_rejections_do_not_consume_accepted_budget_and_fourth_blocks(tmp_path) -> None:
    for i in range(3):
        append_jsonl(tmp_path / "rejected-manifests.jsonl", {"error": f"invalid_source_url:{i}"})
    state = load_agent_state(tmp_path, policy(), datetime(2026, 7, 24, tzinfo=timezone.utc))
    assert (state.accepted_trials, state.manifest_rejections, state.terminal) == (0, 3, False)
    append_jsonl(tmp_path / "rejected-manifests.jsonl", {"error": "invalid_source_url:0"})
    state2 = load_agent_state(tmp_path, policy(), datetime.now(timezone.utc))
    assert state2.terminal_reason == "blocked_repeated_manifest_rejection"


def test_malformed_jsonl_blocks_writes(tmp_path) -> None:
    path = tmp_path / "accepted-trials.jsonl"
    path.write_text('{"runId": "run-1"}\nnot-json\n', encoding="utf-8")
    with pytest.raises(ValueError, match="malformed_jsonl:accepted-trials.jsonl:2"):
        read_jsonl(path)


def test_duplicate_acknowledged_run_id_blocks_state(tmp_path) -> None:
    for _ in range(2):
        append_jsonl(tmp_path / "accepted-trials.jsonl", {"runId": "run-1", "timestamp": "2026-07-24T00:00:00Z"})

    with pytest.raises(ValueError, match="duplicate_run_id:run-1"):
        load_agent_state(tmp_path, policy(), datetime(2026, 7, 24, tzinfo=timezone.utc))


def test_five_accepted_ids_exhaust_budget(tmp_path) -> None:
    for i in range(5):
        append_jsonl(tmp_path / "accepted-trials.jsonl", {"runId": f"run-{i}", "timestamp": "2026-07-24T00:00:00Z"})
    state = load_agent_state(tmp_path, policy(), datetime(2026, 7, 24, tzinfo=timezone.utc))
    assert state.terminal is True
    assert state.terminal_reason == "trial_budget_exhausted"


def test_immutable_accepted_records_survive_assessment_writes(tmp_path) -> None:
    append_jsonl(tmp_path / "accepted-trials.jsonl", {"runId": "run-1", "timestamp": "2026-07-24T00:00:00Z"})
    before = (tmp_path / "accepted-trials.jsonl").read_bytes()
    append_jsonl(tmp_path / "agent-assessments.jsonl", {"runId": "run-1", "lesson": "test"})
    assert (tmp_path / "accepted-trials.jsonl").read_bytes() == before


def test_rejected_manifests_do_not_reduce_remaining_trials(tmp_path) -> None:
    append_jsonl(tmp_path / "accepted-trials.jsonl", {"runId": "run-1", "timestamp": "2026-07-24T00:00:00Z"})
    for i in range(2):
        append_jsonl(tmp_path / "rejected-manifests.jsonl", {"error": f"err:{i}"})
    state = load_agent_state(tmp_path, policy(), datetime(2026, 7, 24, tzinfo=timezone.utc))
    assert state.accepted_trials == 1
    assert state.manifest_rejections == 2
    remaining = policy().max_trials - state.accepted_trials
    assert remaining == 4


def test_time_begins_at_first_acknowledged_receipt(tmp_path) -> None:
    t0 = datetime(2026, 7, 24, 10, 0, tzinfo=timezone.utc)
    append_jsonl(tmp_path / "accepted-trials.jsonl", {"runId": "run-1", "timestamp": t0.isoformat()})
    now_ok = t0 + timedelta(minutes=29)
    state = load_agent_state(tmp_path, policy(), now_ok)
    assert state.terminal is False
    now_expired = t0 + timedelta(minutes=31)
    state2 = load_agent_state(tmp_path, policy(), now_expired)
    assert state2.terminal is True
    assert state2.terminal_reason == "time_budget_exhausted"


def test_controller_evidence_terminal_verdict_stops_worker(tmp_path) -> None:
    append_jsonl(tmp_path / "accepted-trials.jsonl", {"runId": "run-1", "timestamp": "2026-07-24T00:00:00Z"})
    append_jsonl(tmp_path / "controller-evidence.jsonl", {"runId": "run-1", "controllerVerdict": "BLOCKED"})

    blocked = load_agent_state(tmp_path, policy(), datetime(2026, 7, 24, tzinfo=timezone.utc))
    assert blocked.terminal is True
    assert blocked.terminal_reason == "blocked_evidence_mismatch"

    (tmp_path / "controller-evidence.jsonl").write_text(
        '{"runId":"run-1","controllerVerdict":"RESEARCH_CANDIDATE"}\n',
        encoding="utf-8",
    )
    candidate = load_agent_state(tmp_path, policy(), datetime(2026, 7, 24, tzinfo=timezone.utc))
    assert candidate.terminal is True
    assert candidate.terminal_reason == "research_candidate_found"


def test_all_three_count_mismatch_reasons_block_evidence() -> None:
    ev = verify_run(
        policy(), manifest(),
        run={
            "id": "run-1", "status": "completed", "pipeline_status": "completed",
            "error_message": None, "exchange": "binance", "symbol": "BTCUSDT",
            "timeframe": "1h", "start_at": policy().start_at, "end_at": policy().end_at,
            "runtime_config": {"initialEquity": 100.0, "feeBps": 10.0, "slippageBps": 1.0},
            "risk_config": {"maxOrderPercent": 50.0, "maxPositionPercent": 50.0, "minNotional": 5.0, "maxDrawdownPercent": 15.0},
            "dataset_context": {"datasetKey": "binance:BTCUSDT:1h"},
        },
        result={
            "bot_run_id": "run-1", "total_trades": 99,
            "metrics": {"closedTrades": 77},
            "equity_curve": [{"timestamp": "2025-01-28T23:00:00Z", "equity": 100}],
        },
        analysis={"trade_summary": {"closed_trades": 40, "open_trades": 0, "total_trades": 50}},
        orders=[],
    )
    assert ev.evidence_ok is False
    assert "analysis_trade_count_mismatch" in ev.failed_reasons
    assert "result_trade_count_mismatch" in ev.failed_reasons
    assert "metrics_closed_trade_count_mismatch" in ev.failed_reasons


def test_receipt_identity_mismatch_blocks_and_surfaces_error_logs() -> None:
    evidence = verify_run(
        policy(),
        manifest(),
        run={
            "id": "run-1", "status": "completed", "pipeline_status": "completed",
            "error_message": None, "exchange": "binance", "symbol": "BTCUSDT",
            "timeframe": "1h", "start_at": policy().start_at, "end_at": policy().end_at,
            "botId": "bot-actual", "strategyId": "strategy-1", "strategyVersionId": "version-actual",
            "runtime_config": {"initialEquity": 100.0, "feeBps": 10.0, "slippageBps": 1.0},
            "risk_config": {"maxOrderPercent": 50.0, "maxPositionPercent": 50.0, "minNotional": 5.0, "maxDrawdownPercent": 15.0},
            "dataset_context": {"datasetKey": "binance:BTCUSDT:1h"},
        },
        result={
            "bot_run_id": "run-1", "total_trades": 0, "metrics": {"closedTrades": 0},
            "equity_curve": [{"timestamp": "2025-01-28T23:00:00Z", "equity": 100}],
        },
        analysis={"trade_summary": {"closed_trades": 0, "open_trades": 0, "total_trades": 0}},
        orders=[],
        logs={"items": [{"level": "error", "message": "strategy warning"}]},
        receipt={"botId": "bot-receipt", "strategyId": "strategy-1", "versionId": "version-receipt"},
    )

    assert evidence.evidence_ok is False
    assert "receipt_bot_id_mismatch" in evidence.failed_reasons
    assert "receipt_version_id_mismatch" in evidence.failed_reasons
    assert evidence.integrity_checks["errorLogs"] == ["strategy warning"]


def test_write_agent_summary_atomic(tmp_path) -> None:
    state = AgentState(
        accepted_trials=2, manifest_rejections=1,
        first_acknowledged_at=datetime(2026, 7, 24, tzinfo=timezone.utc),
        run_ids=frozenset({"run-1", "run-2"}),
        terminal=False, terminal_reason=None, next_action="submit_next_experiment",
    )
    write_agent_summary(tmp_path, state, None)
    data = json.loads((tmp_path / "agent-summary.json").read_text())
    assert data["acceptedTrials"] == 2
    assert data["terminal"] is False


def test_write_agent_summary_generates_controller_owned_markdown(tmp_path) -> None:
    state = AgentState(
        accepted_trials=1, manifest_rejections=0,
        first_acknowledged_at=datetime(2026, 7, 24, tzinfo=timezone.utc),
        run_ids=frozenset({"run-1"}), terminal=True,
        terminal_reason="blocked_evidence_mismatch", next_action="stop",
    )

    write_agent_summary(tmp_path, state, None)

    assert "blocked_evidence_mismatch" in (tmp_path / "execution.md").read_text()
    assert "BLOCKED" in (tmp_path / "report.md").read_text()
    assert "blocked_evidence_mismatch" in (tmp_path / "blocked.md").read_text()
