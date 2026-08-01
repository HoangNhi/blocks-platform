import os
from agents.tools.file_lock import exclusive_file_lock
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from pathlib import Path
from statistics import median

FAMILIES = {"trend", "mean-reversion", "breakout"}

def validate_selected_agents(selected_agents: list[str], agents: dict[str, object]) -> tuple[str, ...]:
    if not selected_agents:
        raise ValueError("selected_agents must contain one to three families")
    if len(selected_agents) > 3:
        raise ValueError("selected_agents must contain one to three families")
    if len(set(selected_agents)) != len(selected_agents):
        raise ValueError("selected_agents contains duplicates")
    for s in selected_agents:
        if s not in agents:
            raise ValueError(f"unknown family: {s}")
    return tuple(selected_agents)

PARAMETER_GROUPS = {
    "trend": {
        "entry": {"fast", "slow", "adx"},
        "exit": {"exitBars"},
    },
    "mean-reversion": {
        "entry": {"rsiPeriod", "rsiLow", "rsiHigh"},
        "exit": {"exitBars"},
    },
    "breakout": {
        "entry": {"lookback", "atrPeriod", "atrMinimumPct"},
        "exit": {"exitBars"},
    },
}

PARAMETER_BOUNDS = {
    "fast": (5, 40),
    "slow": (20, 200),
    "adx": (10, 40),
    "rsiPeriod": (5, 30),
    "rsiLow": (10, 45),
    "rsiHigh": (55, 90),
    "lookback": (10, 120),
    "atrPeriod": (5, 40),
    "atrMinimumPct": (0.1, 5.0),
    "exitBars": (6, 240),
}

@dataclass(frozen=True, slots=True)
class CampaignPolicy:
    campaign_id: str
    exchange: str
    symbol: str
    timeframe: str
    market_type: str
    start_at: str
    end_at: str
    initial_equity: Decimal
    fee_bps: Decimal
    slippage_bps: Decimal
    leverage: int
    max_order_percent: Decimal
    max_position_percent: Decimal
    min_notional: Decimal
    max_drawdown_percent: Decimal
    max_trials: int
    max_minutes: int
    monthly_target_pct: Decimal

@dataclass(frozen=True, slots=True)
class ExperimentManifest:
    campaign_id: str
    agent_id: str
    hypothesis: str
    sources: tuple[dict[str, str], ...]
    changed_parameter_group: str
    parameters: dict[str, object]
    expected_effect: str

@dataclass(frozen=True, slots=True)
class VerifiedEvidence:
    evidence_ok: bool
    failed_reasons: tuple[str, ...]
    run_id: str
    dataset_fingerprint: str
    metrics: dict[str, object]
    integrity_checks: dict[str, object]
    gate_results: dict[str, object]

@dataclass(frozen=True, slots=True)
class AgentState:
    accepted_trials: int
    manifest_rejections: int
    first_acknowledged_at: datetime | None
    run_ids: frozenset[str]
    terminal: bool
    terminal_reason: str | None
    next_action: str

ARTIFACT_NAMES = (
    "accepted-trials.jsonl",
    "rejected-manifests.jsonl",
    "agent-assessments.jsonl",
    "controller-evidence.jsonl",
    "submission-intents.jsonl",
)

def validate_manifest(
    policy: CampaignPolicy,
    manifest: ExperimentManifest,
    previous: dict[str, object] | None,
    submitted: int,
    started_at: datetime | None,
    now: datetime
) -> list[str]:
    errors = []

    # 1. campaign ID matches
    if manifest.campaign_id != policy.campaign_id:
        errors.append("campaign_id_mismatch")

    # 2. agent family exists
    if manifest.agent_id not in FAMILIES:
        errors.append("invalid_agent_id")
        return errors

    # 3. source list is non-empty and validated
    if not manifest.sources:
        errors.append("empty_sources")
    else:
        for idx, src in enumerate(manifest.sources):
            url = src.get("url", "")
            retrieved = src.get("retrievedAt", "")
            claim = src.get("claim", "")
            if not url or not url.startswith("https://"):
                errors.append(f"invalid_source_url:{idx}")
            if not retrieved or not re.match(r"^\d{4}-\d{2}-\d{2}$", retrieved):
                errors.append(f"invalid_source_retrieved_at:{idx}")
            if not claim:
                errors.append(f"invalid_source_claim:{idx}")

    # 4. hypothesis and expected effect are non-empty
    if not manifest.hypothesis:
        errors.append("empty_hypothesis")
    if not manifest.expected_effect:
        errors.append("empty_expected_effect")

    # 5. trial and elapsed-time budgets pass
    if submitted >= policy.max_trials:
        errors.append("trial_budget_exhausted")
    if started_at is not None:
        elapsed = now - started_at
        if elapsed > timedelta(minutes=policy.max_minutes):
            errors.append("time_budget_exhausted")

    # 6. parameter key set exactly matches family template
    family_groups = PARAMETER_GROUPS[manifest.agent_id]
    all_keys = set()
    for grp_keys in family_groups.values():
        all_keys.update(grp_keys)

    manifest_keys = set(manifest.parameters.keys())
    if manifest_keys != all_keys:
        errors.append("parameter_keys_mismatch")
        return errors

    # 7. numeric bounds pass
    for k, val in manifest.parameters.items():
        if k not in PARAMETER_BOUNDS:
            errors.append(f"unknown_parameter:{k}")
            continue
        low, high = PARAMETER_BOUNDS[k]
        try:
            val_f = float(val)
            if not (low <= val_f <= high):
                errors.append(f"parameter_out_of_bounds:{k}")
        except (ValueError, TypeError):
            errors.append(f"parameter_not_numeric:{k}")

    # relational bounds
    if "fast" in manifest.parameters and "slow" in manifest.parameters:
        try:
            if float(manifest.parameters["fast"]) >= float(manifest.parameters["slow"]):
                errors.append("relational_bound_fast_slow_failed")
        except (ValueError, TypeError):
            pass

    if "rsiLow" in manifest.parameters and "rsiHigh" in manifest.parameters:
        try:
            rsi_l = float(manifest.parameters["rsiLow"])
            rsi_h = float(manifest.parameters["rsiHigh"])
            if not (rsi_l < 50 < rsi_h):
                errors.append("relational_bound_rsi_failed")
        except (ValueError, TypeError):
            pass

    # 8/9. first / subsequent experiment change rules
    if previous is None:
        if manifest.changed_parameter_group != "baseline":
            errors.append("first_experiment_must_be_baseline")
    else:
        if manifest.changed_parameter_group not in {"entry", "exit"}:
            errors.append("subsequent_experiment_must_change_entry_or_exit")
        else:
            changed_keys = set()
            for k in all_keys:
                if manifest.parameters[k] != previous[k]:
                    changed_keys.add(k)
            if not changed_keys:
                errors.append("no_parameters_changed")
            allowed_changed = family_groups[manifest.changed_parameter_group]
            for ck in changed_keys:
                if ck not in allowed_changed:
                    errors.append(f"parameter_changed_outside_group:{ck}")

    return errors

def compute_monthly_metrics(equity_curve: list[dict[str, object]], initial_equity: Decimal) -> dict[str, object]:
    # Group by UTC calendar month (YYYY-MM)
    monthly_points = {}
    for pt in equity_curve:
        ts_str = pt["timestamp"]
        # Replace trailing 'Z' with '+00:00' to parse in standard datetime
        if ts_str.endswith('Z'):
            ts_str = ts_str[:-1] + '+00:00'
        dt = datetime.fromisoformat(ts_str).astimezone(timezone.utc)
        key = (dt.year, dt.month)
        monthly_points[key] = (dt, Decimal(str(pt["equity"])))

    sorted_months = sorted(monthly_points.keys())
    if not sorted_months:
        return {
            "monthlyReturnsPct": [],
            "medianMonthlyReturnPct": "0.0000",
            "profitableMonths": 0,
            "worstMonthPct": "0.0000",
            "longestLosingStreak": 0,
            "rolling12MonthGate": None
        }

    monthly_returns = []
    prev_equity = initial_equity
    for month_key in sorted_months:
        _, eq = monthly_points[month_key]
        ret = (eq - prev_equity) / prev_equity * 100
        monthly_returns.append(ret)
        prev_equity = eq

    # Longest losing streak (consecutive months with return <= 0)
    max_streak = 0
    curr_streak = 0
    for r in monthly_returns:
        if r <= 0:
            curr_streak += 1
            max_streak = max(max_streak, curr_streak)
        else:
            curr_streak = 0

    # Rolling 12-month gate
    # minimum profitable months (return > 0) in any complete 12-month window
    rolling_gate = None
    if len(monthly_returns) >= 12:
        rolling_gate = 12  # start at max
        for i in range(len(monthly_returns) - 11):
            window = monthly_returns[i:i+12]
            prof_in_window = sum(1 for r in window if r > 0)
            rolling_gate = min(rolling_gate, prof_in_window)

    # Quantize to 4 decimals
    def fmt(d: Decimal) -> str:
        return f"{d:.4f}"

    median_ret = median(monthly_returns) if monthly_returns else Decimal(0)
    worst_ret = min(monthly_returns) if monthly_returns else Decimal(0)
    profitable_months = sum(1 for r in monthly_returns if r > 0)

    return {
        "monthlyReturnsPct": [fmt(r) for r in monthly_returns],
        "medianMonthlyReturnPct": fmt(median_ret),
        "profitableMonths": profitable_months,
        "worstMonthPct": fmt(worst_ret),
        "longestLosingStreak": max_streak,
        "rolling12MonthGate": rolling_gate
    }

def verify_run(
    policy: CampaignPolicy,
    manifest: ExperimentManifest,
    run: dict[str, object],
    result: dict[str, object],
    analysis: dict[str, object],
    orders: list[dict[str, object]],
    logs: dict[str, object] | list[dict[str, object]] | None = None,
    receipt: dict[str, object] | None = None,
) -> VerifiedEvidence:
    reasons = []

    def response_value(payload: dict[str, object], *keys: str) -> object:
        for key in keys:
            value = payload.get(key)
            if value is not None:
                return value
        return None

    run_id = run.get("id", "")
    res_run_id = result.get("bot_run_id", "")
    if not run_id or run_id != res_run_id:
        reasons.append("result_run_id_mismatch")

    if receipt is not None:
        identity_checks = (
            ("botId", ("botId", "bot_id"), "receipt_bot_id_mismatch"),
            ("strategyId", ("strategyId", "strategy_id"), "receipt_strategy_id_mismatch"),
            ("versionId", ("strategyVersionId", "strategy_version_id"), "receipt_version_id_mismatch"),
        )
        for receipt_key, run_keys, mismatch_reason in identity_checks:
            expected = receipt.get(receipt_key)
            actual = response_value(run, *run_keys)
            if expected is None or actual is None or str(actual) != str(expected):
                reasons.append(mismatch_reason)

    if run.get("status") != "completed" or run.get("pipeline_status") != "completed" or run.get("error_message") is not None:
        reasons.append("run_not_completed_or_has_errors")

    def _norm_ts(v: object) -> object:
        if not isinstance(v, str):
            return v
        s = v.replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(s).astimezone(timezone.utc).replace(tzinfo=None, microsecond=0)
        except ValueError:
            return s

    if (run.get("exchange") != policy.exchange or
        run.get("symbol") != policy.symbol or
        run.get("timeframe") != policy.timeframe or
        _norm_ts(run.get("start_at")) != _norm_ts(policy.start_at) or
        _norm_ts(run.get("end_at")) != _norm_ts(policy.end_at)):
        reasons.append("run_market_parameters_mismatch")

    rconf = run.get("runtime_config", {})
    if (rconf.get("initialEquity") != float(policy.initial_equity) or
        rconf.get("feeBps") != float(policy.fee_bps) or
        rconf.get("slippageBps") != float(policy.slippage_bps)):
        reasons.append("run_capital_costs_mismatch")

    risk_conf = run.get("risk_config", {})
    if (risk_conf.get("maxOrderPercent") != float(policy.max_order_percent) or
        risk_conf.get("maxPositionPercent") != float(policy.max_position_percent) or
        risk_conf.get("minNotional") != float(policy.min_notional) or
        risk_conf.get("maxDrawdownPercent") != float(policy.max_drawdown_percent)):
        reasons.append("run_risk_config_mismatch")

    dataset_ctx = run.get("dataset_context", {})
    expected_dataset_key = f"{policy.exchange}:{policy.symbol}:{policy.timeframe}"
    if dataset_ctx.get("datasetKey") != expected_dataset_key:
        reasons.append("run_dataset_key_mismatch")

    equity_curve = result.get("equity_curve", [])
    if not equity_curve:
        reasons.append("missing_equity_curve")

    trade_summary = analysis.get("trade_summary", {})
    metrics = result.get("metrics", {})

    log_items = logs.get("items", logs) if isinstance(logs, dict) else (logs or [])
    warning_logs = []
    error_logs = []
    for entry in log_items:
        if not isinstance(entry, dict):
            continue
        level = str(entry.get("level", "")).lower()
        message = str(entry.get("message", ""))
        if level in {"warn", "warning"}:
            warning_logs.append(message)
        elif level in {"error", "fatal"}:
            error_logs.append(message)

    closed_trades = int(trade_summary.get("closed_trades", 0))
    open_trades = int(trade_summary.get("open_trades", 0))
    analysis_total = int(trade_summary.get("total_trades", closed_trades + open_trades))
    if analysis_total != closed_trades + open_trades:
        reasons.append("analysis_trade_count_mismatch")
    if int(result.get("total_trades", -1)) != closed_trades:
        reasons.append("result_trade_count_mismatch")
    if "closedTrades" in metrics and int(metrics["closedTrades"]) != closed_trades:
        reasons.append("metrics_closed_trade_count_mismatch")

    # Candidate thresholds — integrity must pass first; quality failures are gates, not evidence failures.
    gate_results = {}
    evidence_ok = len(reasons) == 0

    if evidence_ok:
        # Order status validation — /orders returns {"items": [...]}.
        # Unfilled orders are a candidate-quality gate, not an evidence-trust break.
        order_items = orders.get("items", orders) if isinstance(orders, dict) else orders
        all_orders_filled = all(o.get("status") == "filled" for o in order_items)
        profit_factor = result.get("profit_factor")
        if profit_factor is None:
            profit_factor = trade_summary.get("profit_factor")

        # profitFactor=None remains None
        pf_val = float(profit_factor) if profit_factor is not None else None

        total_ret = float(result.get("total_return_pct", 0.0))
        max_dd = float(result.get("max_drawdown_pct", 0.0))

        m_metrics = compute_monthly_metrics(equity_curve, policy.initial_equity)
        med_m_ret = float(m_metrics["medianMonthlyReturnPct"])
        worst_m = float(m_metrics["worstMonthPct"])
        rolling_gate = m_metrics["rolling12MonthGate"]

        gate_results = {
            "closed_trades_ok": closed_trades >= 30,
            "profit_factor_ok": pf_val >= 1.20 if pf_val is not None else False,
            "median_monthly_return_ok": med_m_ret >= 2.0,
            "rolling_12_month_gate_ok": (rolling_gate >= 8) if rolling_gate is not None else True,
            "worst_month_ok": worst_m > -10.0,
            "max_drawdown_ok": max_dd < 15.0,
            "positive_return_ok": total_ret > 0,
            "open_trades_ok": open_trades == 0,
            "orders_filled_ok": all_orders_filled,
            "no_liquidation_ok": metrics.get("liquidationCount", 0) == 0,
        }

    return VerifiedEvidence(
        evidence_ok=evidence_ok,
        failed_reasons=tuple(reasons),
        run_id=run_id,
        dataset_fingerprint=run.get("dataset_fingerprint") or run.get("dataset_context", {}).get("dataset_key", ""),
        metrics=metrics,
        integrity_checks={
            "run_id": run_id,
            "status": "verified" if evidence_ok else "failed",
            "warningLogs": warning_logs,
            "errorLogs": error_logs,
        },
        gate_results=gate_results,
    )

def append_jsonl(path: Path, record: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as f:
        with exclusive_file_lock(f):
            f.write(json.dumps(record, sort_keys=True) + "\n")
            f.flush()
            os.fsync(f.fileno())
        

def read_jsonl(path: Path) -> list[dict[str, object]]:
    if not path.exists():
        return []
    records = []
    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError:
            raise ValueError(f"malformed_jsonl:{path.name}:{lineno}")
    return records

def load_agent_state(agent_dir: Path, pol: CampaignPolicy, now: datetime) -> AgentState:
    accepted = read_jsonl(agent_dir / "accepted-trials.jsonl")
    rejected = read_jsonl(agent_dir / "rejected-manifests.jsonl")

    run_ids_raw = []
    for record in accepted:
        run_id = record.get("runId")
        if not isinstance(run_id, str) or not run_id:
            raise ValueError("invalid_accepted_run_id")
        run_ids_raw.append(run_id)
    unique_run_ids = []
    seen = set()
    for rid in run_ids_raw:
        if rid in seen:
            raise ValueError(f"duplicate_run_id:{rid}")
        seen.add(rid)
        unique_run_ids.append(rid)
    accepted_count = len(unique_run_ids)

    manifest_rejections = len(rejected)

    first_ack_at = None
    if accepted:
        ts = accepted[0].get("acknowledgedAt") or accepted[0].get("timestamp")
        if ts:
            if isinstance(ts, str):
                if ts.endswith("Z"):
                    ts = ts[:-1] + "+00:00"
                first_ack_at = datetime.fromisoformat(ts)

    terminal = False
    terminal_reason = None
    next_action = "submit_next_experiment"

    if accepted_count >= pol.max_trials:
        terminal = True
        terminal_reason = "trial_budget_exhausted"
    elif first_ack_at is not None and (now - first_ack_at) > timedelta(minutes=pol.max_minutes):
        terminal = True
        terminal_reason = "time_budget_exhausted"
    elif manifest_rejections > 3:
        terminal = True
        terminal_reason = "blocked_repeated_manifest_rejection"

    controller_evidence = read_jsonl(agent_dir / "controller-evidence.jsonl")
    evidence_run_ids = set()
    for record in controller_evidence:
        run_id = record.get("runId")
        if not isinstance(run_id, str) or run_id not in seen:
            raise ValueError(f"invalid_controller_evidence_run_id:{run_id}")
        if run_id in evidence_run_ids:
            raise ValueError(f"duplicate_controller_evidence:{run_id}")
        evidence_run_ids.add(run_id)

    if any(record.get("controllerVerdict") == "BLOCKED" for record in controller_evidence):
        terminal = True
        terminal_reason = "blocked_evidence_mismatch"

    submission_intents = read_jsonl(agent_dir / "submission-intents.jsonl")
    pending_intent_ids = {
        record.get("intentId")
        for record in submission_intents
        if record.get("status") == "pending" and isinstance(record.get("intentId"), str)
    }
    acknowledged_intent_ids = {
        record.get("intentId")
        for record in submission_intents
        if record.get("status") == "acknowledged" and isinstance(record.get("intentId"), str)
    }
    if pending_intent_ids - acknowledged_intent_ids:
        terminal = True
        terminal_reason = "blocked_ambiguous_submission"

    # check if any accepted trial has a candidate verdict in agent-assessments
    assessments = read_jsonl(agent_dir / "agent-assessments.jsonl")
    any_candidate = any(
        a.get("evidenceOk") is True and all(a.get("gateResults", {}).values())
        for a in assessments
    )
    if (any_candidate or any(record.get("controllerVerdict") == "RESEARCH_CANDIDATE" for record in controller_evidence)) and not terminal:
        terminal = True
        terminal_reason = "research_candidate_found"

    if terminal:
        next_action = "stop"

    return AgentState(
        accepted_trials=accepted_count,
        manifest_rejections=manifest_rejections,
        first_acknowledged_at=first_ack_at,
        run_ids=frozenset(unique_run_ids),
        terminal=terminal,
        terminal_reason=terminal_reason,
        next_action=next_action,
    )

def write_agent_summary(agent_dir: Path, state: AgentState, evidence: VerifiedEvidence | None) -> None:
    agent_dir.mkdir(parents=True, exist_ok=True)
    summary = {
        "acceptedTrials": state.accepted_trials,
        "manifestRejections": state.manifest_rejections,
        "terminal": state.terminal,
        "terminalReason": state.terminal_reason,
        "nextAction": state.next_action,
        "runIds": sorted(state.run_ids),
    }
    if evidence is not None:
        summary["lastEvidence"] = {
            "evidenceOk": evidence.evidence_ok,
            "failedReasons": list(evidence.failed_reasons),
            "runId": evidence.run_id,
        }
    def atomic_write(path: Path, content: str) -> None:
        temporary_path = path.with_suffix(path.suffix + ".tmp")
        temporary_path.write_text(content, encoding="utf-8")
        temporary_path.replace(path)

    atomic_write(agent_dir / "agent-summary.json", json.dumps(summary, indent=2) + "\n")
    atomic_write(agent_dir / "execution.md", "\n".join([
        "# Controller Execution State",
        "",
        f"- Accepted trials: {state.accepted_trials}",
        f"- Manifest rejections: {state.manifest_rejections}",
        f"- Terminal: {state.terminal}",
        f"- Terminal reason: {state.terminal_reason or 'none'}",
        f"- Next action: {state.next_action}",
        f"- Run IDs: {', '.join(sorted(state.run_ids)) or 'none'}",
        "",
    ]))
    report_status = "BLOCKED" if state.terminal_reason and state.terminal_reason.startswith("blocked_") else (
        "TERMINAL" if state.terminal else "IN_PROGRESS"
    )
    atomic_write(agent_dir / "report.md", "\n".join([
        "# Controller Research Report",
        "",
        f"Status: {report_status}",
        f"Accepted trials: {state.accepted_trials}",
        f"Manifest rejections: {state.manifest_rejections}",
        f"Terminal reason: {state.terminal_reason or 'none'}",
        "",
    ]))
    if report_status == "BLOCKED":
        atomic_write(agent_dir / "blocked.md", "\n".join([
            "# Controller Blocked",
            "",
            f"Reason: {state.terminal_reason}",
            "",
        ]))

def write_agent_artifacts(agent_dir: Path, record: dict[str, object], evidence: VerifiedEvidence) -> str:
    agent_dir.mkdir(parents=True, exist_ok=True)

    # 1. append experiments.jsonl
    append_jsonl(agent_dir / "experiments.jsonl", record)

    # Check threshold to determine status
    status = "NO_CANDIDATE_WITHIN_BUDGET"
    if evidence.evidence_ok:
        # Check all gates
        gates = evidence.gate_results
        if all(gates.values()):
            status = "RESEARCH_CANDIDATE"

        # 2. append lessons.jsonl only when evidence_ok
        append_jsonl(agent_dir / "lessons.jsonl", {
            "experimentId": record.get("experimentId"),
            "runId": record.get("runId"),
            "lesson": record.get("lesson"),
            "nextExperiment": record.get("nextExperiment"),
            "status": status,
        })
    else:
        status = "BLOCKED"
        # Create blocked.md
        blocked_path = agent_dir / "blocked.md"
        blocked_path.write_text(
            f"# Execution Blocked\n\nRun {evidence.run_id} failed verification.\n"
            f"Reasons:\n" + "\n".join(f"- {r}" for r in evidence.failed_reasons) + "\n",
            encoding="utf-8"
        )

    # Append to trial-log.md
    log_path = agent_dir / "trial-log.md"
    with open(log_path, "a", encoding="utf-8") as f:
        with exclusive_file_lock(f):
            f.write(f"## Trial {record.get('experimentId')}\n")
            f.write(f"- Hypothesis: {record.get('hypothesis')}\n")
            f.write(f"- Run ID: {record.get('runId')}\n")
            f.write(f"- Status: {status}\n")
            f.write(f"- Timestamp: {datetime.now(timezone.utc).isoformat()}\n\n")
            f.flush()
            os.fsync(f.fileno())
        

    # Atomically replace execution.md and report.md
    tmp_exec = agent_dir / "execution.md.tmp"
    tmp_exec.write_text(
        f"# Execution Summary\n\nLatest Trial: {record.get('experimentId')}\nStatus: {status}\n",
        encoding="utf-8"
    )
    tmp_exec.replace(agent_dir / "execution.md")

    tmp_rep = agent_dir / "report.md.tmp"
    tmp_rep.write_text(
        f"# Campaign Report for Agent {record.get('agentId')}\n\n"
        f"Verdict: {status}\n",
        encoding="utf-8"
    )
    tmp_rep.replace(agent_dir / "report.md")

    # policy proposals logic
    # Check if agent proposals to change key campaign conditions
    proposed_text = f"{record.get('lesson')} {record.get('hypothesis')} {record.get('nextExperiment')}"
    trigger_words = ["prompt", "controller", "engine", "endpoint policy", "budget", "oos split", "safety gate"]
    if any(word in proposed_text.lower() for word in trigger_words):
        proposal_path = agent_dir / "policy-proposals.md"
        with open(proposal_path, "a", encoding="utf-8") as f:
            with exclusive_file_lock(f):
                f.write(f"### Proposal from {record.get('experimentId')} (Run {record.get('runId')})\n")
                f.write(f"- Lesson: {record.get('lesson')}\n")
                f.write(f"- Next: {record.get('nextExperiment')}\n\n")
                f.flush()
                os.fsync(f.fileno())
            

    return status
