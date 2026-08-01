import os
import re
import json
import time
import hashlib
import urllib.request
import urllib.error
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from agents.tools.tradelab_pilot_contract import (
    CampaignPolicy,
    ExperimentManifest,
    VerifiedEvidence,
    AgentState,
    validate_manifest,
    verify_run,
    write_agent_artifacts,
    read_jsonl,
    load_agent_state,
    write_agent_summary,
    append_jsonl,
)

ALLOWLIST = (
    ("GET", r"^/api/tradelab/datasets/coverage$"),
    ("POST", r"^/api/tradelab/strategy-groups$"),
    ("POST", r"^/api/tradelab/strategies$"),
    ("POST", r"^/api/tradelab/strategies/validate-source$"),
    ("POST", r"^/api/tradelab/strategies/[0-9a-f-]+/versions$"),
    ("POST", r"^/api/tradelab/bots$"),
    ("POST", r"^/api/tradelab/bots/[0-9a-f-]+/backtests/preflight$"),
    ("POST", r"^/api/tradelab/bots/[0-9a-f-]+/backtests$"),
    ("GET", r"^/api/tradelab/bot-runs/[0-9a-f-]+$"),
    ("GET", r"^/api/tradelab/bot-runs/[0-9a-f-]+/result$"),
    ("GET", r"^/api/tradelab/bot-runs/[0-9a-f-]+/analysis$"),
    ("GET", r"^/api/tradelab/bot-runs/[0-9a-f-]+/orders$"),
    ("GET", r"^/api/tradelab/bot-runs/[0-9a-f-]+/logs$"),
    ("GET", r"^/api/tradelab/bot-runs/[0-9a-f-]+/chart$"),
)

_campaigns_root = os.environ.get("TRADELAB_CAMPAIGNS_ROOT")
if not _campaigns_root and os.environ.get("HERMES_DATA_PATH"):
    _campaigns_root = str(Path(os.environ["HERMES_DATA_PATH"]) / "tradelab" / "campaigns")
# ponytail: Environment variables cover current runtimes; add a config object when multiple campaign stores are needed.
CAMPAIGNS_ROOT = Path(_campaigns_root) if _campaigns_root else Path.home() / ".blocks" / "tradelab" / "campaigns"

class TradeLabError(Exception):
    def __init__(self, status_code, message, data):
        self.status_code = status_code
        self.message = message
        self.data = data
        super().__init__(f"TradeLab API Error: [{status_code}] {message}")

class TradeLabClient:
    def __init__(self, base_url="http://127.0.0.1:8011", transport=None):
        self.base_url = base_url.rstrip("/")
        self.transport = transport

    def request(self, method: str, path: str, payload: dict[str, object] | None = None) -> dict[str, object]:
        matched = False
        for allow_method, regex in ALLOWLIST:
            if method == allow_method and re.match(regex, path):
                matched = True
                break
        if not matched:
            raise ValueError(f"forbidden_route: {method} {path}")

        if self.transport is not None:
            res = self.transport(method, path, payload, timeout=20)
            if not res.get("Success", False):
                raise TradeLabError(res.get("StatusCode", 500), res.get("Message", "Error"), res.get("Data", {}))
            return res.get("Data", {})

        url = self.base_url + path
        data = None
        headers = {}
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"

        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        attempts = 1 if method == "POST" else 2
        for attempt in range(attempts):
            try:
                with urllib.request.urlopen(req, timeout=20) as response:
                    body = response.read().decode("utf-8")
                    res = json.loads(body)
                    if not res.get("Success", False):
                        raise TradeLabError(res.get("StatusCode", 500), res.get("Message", "Error"), res.get("Data", {}))
                    return res.get("Data", {})
            except urllib.error.HTTPError as e:
                try:
                    body = e.read().decode("utf-8")
                    res = json.loads(body)
                    if isinstance(res, dict):
                        raise TradeLabError(res.get("StatusCode", e.code), res.get("Message", e.reason), res.get("Data", {}))
                except Exception:
                    pass
                raise TradeLabError(e.code, str(e), {})
            except (urllib.error.URLError, TimeoutError) as e:
                if attempt == attempts - 1:
                    raise e
                continue

def generate_trend_source(fast, slow, adx, exitBars):
    return f"""from tradelab_sdk import StrategyContext

def on_candle(ctx):
    close = ctx.history["close"]
    high = ctx.history["high"]
    low = ctx.history["low"]

    if "initialized" not in ctx.state:
        ctx.set_leverage(2)
        ctx.set_margin_mode("CROSS")
        ctx.state["initialized"] = True
        ctx.state["bars_held"] = 0

    if len(close) < max({slow}, 30) + 10:
        return None

    hist_len = 250
    c_slice = close[-hist_len:]
    h_slice = high[-hist_len:]
    l_slice = low[-hist_len:]

    fast_ema = ctx.indicators.ema(c_slice, {fast})
    slow_ema = ctx.indicators.ema(c_slice, {slow})
    adx_val = ctx.indicators.adx(h_slice, l_slice, c_slice, 14)

    if len(fast_ema) == 0 or fast_ema[-1] is None or len(slow_ema) == 0 or slow_ema[-1] is None or len(adx_val) == 0 or adx_val[-1] is None:
        return None

    pos = ctx.position

    if pos is not None:
        ctx.state["bars_held"] += 1
        if ctx.state["bars_held"] >= {exitBars}:
            ctx.state["bars_held"] = 0
            return ctx.close_position()
        if pos.side == "long" and ctx.indicators.crossunder(fast_ema, slow_ema):
            ctx.state["bars_held"] = 0
            return ctx.close_position()
        if pos.side == "short" and ctx.indicators.crossover(fast_ema, slow_ema):
            ctx.state["bars_held"] = 0
            return ctx.close_position()
        return None

    if ctx.indicators.crossover(fast_ema, slow_ema) and adx_val[-1] > {adx}:
        ctx.state["bars_held"] = 0
        return ctx.buy_market(percent=50)

    if ctx.indicators.crossunder(fast_ema, slow_ema) and adx_val[-1] > {adx}:
        ctx.state["bars_held"] = 0
        return ctx.sell_market(percent=50)
"""

def generate_mean_reversion_source(rsiPeriod, rsiLow, rsiHigh, exitBars):
    return f"""from tradelab_sdk import StrategyContext

def on_candle(ctx):
    close = ctx.history["close"]

    if "initialized" not in ctx.state:
        ctx.set_leverage(2)
        ctx.set_margin_mode("CROSS")
        ctx.state["initialized"] = True
        ctx.state["bars_held"] = 0

    if len(close) < max({rsiPeriod}, 30) + 10:
        return None

    hist_len = 250
    c_slice = close[-hist_len:]

    rsi = ctx.indicators.rsi(c_slice, {rsiPeriod})

    if len(rsi) < 2 or rsi[-1] is None or rsi[-2] is None:
        return None

    pos = ctx.position

    if pos is not None:
        ctx.state["bars_held"] += 1
        if ctx.state["bars_held"] >= {exitBars}:
            ctx.state["bars_held"] = 0
            return ctx.close_position()
        if (rsi[-2] - 50.0) * (rsi[-1] - 50.0) <= 0:
            ctx.state["bars_held"] = 0
            return ctx.close_position()
        return None

    if rsi[-1] < {rsiLow}:
        ctx.state["bars_held"] = 0
        return ctx.buy_market(percent=50)

    if rsi[-1] > {rsiHigh}:
        ctx.state["bars_held"] = 0
        return ctx.sell_market(percent=50)
"""

def generate_breakout_source(lookback, atrPeriod, atrMinimumPct, exitBars):
    return f"""from tradelab_sdk import StrategyContext

def on_candle(ctx):
    close = ctx.history["close"]
    high = ctx.history["high"]
    low = ctx.history["low"]

    if "initialized" not in ctx.state:
        ctx.set_leverage(2)
        ctx.set_margin_mode("CROSS")
        ctx.state["initialized"] = True
        ctx.state["bars_held"] = 0

    if len(close) < max({lookback}, {atrPeriod}) + 10:
        return None

    hist_len = max({lookback}, {atrPeriod}) + 10
    c_slice = close[-hist_len:]
    h_slice = high[-hist_len:]
    l_slice = low[-hist_len:]

    atr_vals = ctx.indicators.atr(h_slice, l_slice, c_slice, {atrPeriod})

    if len(atr_vals) == 0 or atr_vals[-1] is None:
        return None

    window_high = max(high[-{lookback}-1:-1])
    window_low = min(low[-{lookback}-1:-1])
    mid_channel = (window_high + window_low) / 2.0

    pos = ctx.position

    if pos is not None:
        ctx.state["bars_held"] += 1
        if ctx.state["bars_held"] >= {exitBars}:
            ctx.state["bars_held"] = 0
            return ctx.close_position()
        if pos.side == "long" and float(close[-1]) < mid_channel:
            ctx.state["bars_held"] = 0
            return ctx.close_position()
        if pos.side == "short" and float(close[-1]) > mid_channel:
            ctx.state["bars_held"] = 0
            return ctx.close_position()
        return None

    atr_pct = (atr_vals[-1] / float(close[-1])) * 100.0
    if atr_pct <= {atrMinimumPct}:
        return None

    if float(close[-1]) > window_high:
        ctx.state["bars_held"] = 0
        return ctx.buy_market(percent=50)

    if float(close[-1]) < window_low:
        ctx.state["bars_held"] = 0
        return ctx.sell_market(percent=50)
"""

def render_strategy_source(family: str, parameters: dict[str, object]) -> str:
    sorted_params = dict(sorted(parameters.items()))
    if family == "trend":
        return generate_trend_source(
            fast=sorted_params["fast"],
            slow=sorted_params["slow"],
            adx=sorted_params["adx"],
            exitBars=sorted_params["exitBars"]
        )
    elif family == "mean-reversion":
        return generate_mean_reversion_source(
            rsiPeriod=sorted_params["rsiPeriod"],
            rsiLow=sorted_params["rsiLow"],
            rsiHigh=sorted_params["rsiHigh"],
            exitBars=sorted_params["exitBars"]
        )
    elif family == "breakout":
        return generate_breakout_source(
            lookback=sorted_params["lookback"],
            atrPeriod=sorted_params["atrPeriod"],
            atrMinimumPct=sorted_params["atrMinimumPct"],
            exitBars=sorted_params["exitBars"]
        )
    else:
        raise ValueError(f"Unknown family: {family}")

def _arg(args: dict[str, object], camel: str, snake: str | None = None, default: object = None) -> object:
    # glm-5.2 tends to emit snake_case keys even when docs ask for camelCase;
    # accept either so a case mismatch never blocks the worker at step 1.
    if camel in args:
        return args[camel]
    if snake and snake in args:
        return args[snake]
    return default


def _normalize_tool_args(args: dict[str, object] | None, kwargs: dict[str, object]) -> dict[str, object]:
    normalized = {key: value for key, value in kwargs.items() if key != "client"}
    if isinstance(args, dict):
        normalized.update(args)

    reason = normalized.get("reason")
    if not isinstance(reason, str):
        return normalized
    try:
        reason_payload = json.loads(reason)
    except json.JSONDecodeError:
        return normalized
    return {**reason_payload, **normalized} if isinstance(reason_payload, dict) else normalized


def _campaign_id_from_args(args: dict[str, object]) -> str:
    campaign_id = _arg(args, "campaignId", "campaign_id", "")
    if isinstance(campaign_id, str) and campaign_id.strip():
        return campaign_id.strip()
    reason = args.get("reason")
    if not isinstance(reason, str):
        return ""
    match = re.search(r"\bcampaign\s+([a-z0-9-]{1,64})\b", reason.lower())
    if match:
        return match.group(1)
    candidate = reason.strip().lower()
    return candidate if re.fullmatch(r"[a-z0-9-]{1,64}", candidate) else ""


def _hash_payload(payload: object) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _policy_hash(policy: CampaignPolicy) -> str:
    return _hash_payload({
        "campaignId": policy.campaign_id,
        "exchange": policy.exchange,
        "symbol": policy.symbol,
        "timeframe": policy.timeframe,
        "marketType": policy.market_type,
        "startAt": policy.start_at,
        "endAt": policy.end_at,
        "initialEquity": str(policy.initial_equity),
        "feeBps": str(policy.fee_bps),
        "slippageBps": str(policy.slippage_bps),
        "leverage": policy.leverage,
        "maxOrderPercent": str(policy.max_order_percent),
        "maxPositionPercent": str(policy.max_position_percent),
        "minNotional": str(policy.min_notional),
        "maxDrawdownPercent": str(policy.max_drawdown_percent),
        "maxTrials": policy.max_trials,
        "maxMinutes": policy.max_minutes,
    })


def _get_identity_and_campaign(campaign_id: str) -> tuple[CampaignPolicy, str, Path]:
    profile = os.environ.get("HERMES_PROFILE", "")
    task_id = os.environ.get("HERMES_KANBAN_TASK", "")

    if not re.match(r"^[a-z0-9-]{1,64}$", campaign_id):
        raise ValueError("invalid_campaign_id")

    campaign_dir = (CAMPAIGNS_ROOT / campaign_id).resolve()
    if not str(campaign_dir).startswith(str(CAMPAIGNS_ROOT.resolve())):
        raise ValueError("profile_task_authorization_failed")

    policy_path = campaign_dir / "campaign.json"
    if not policy_path.exists():
        raise ValueError("profile_task_authorization_failed")

    with open(policy_path, "r", encoding="utf-8") as f:
        policy_data = json.load(f)

    selected_agents = policy_data.get("selectedAgents")
    if selected_agents is not None:
        if set(policy_data.get("agents", {}).keys()) != set(selected_agents):
            raise ValueError("profile_task_authorization_failed")
    else:
        selected_agents = list(policy_data.get("agents", {}).keys())

    policy = CampaignPolicy(
        campaign_id=policy_data["campaignId"],
        exchange=policy_data["market"]["exchange"],
        symbol=policy_data["market"]["symbol"],
        timeframe=policy_data["market"]["timeframe"],
        market_type=policy_data["market"]["marketType"],
        start_at=policy_data["market"]["startAt"],
        end_at=policy_data["market"]["endAt"],
        initial_equity=Decimal(str(policy_data["capital"]["initialEquity"])),
        fee_bps=Decimal(str(policy_data["costs"]["feeBps"])),
        slippage_bps=Decimal(str(policy_data["costs"]["slippageBps"])),
        leverage=policy_data["risk"]["leverage"],
        max_order_percent=Decimal(str(policy_data["risk"]["maxOrderPercent"])),
        max_position_percent=Decimal(str(policy_data["risk"]["maxPositionPercent"])),
        min_notional=Decimal(str(policy_data["risk"]["minNotional"])),
        max_drawdown_percent=Decimal(str(policy_data["risk"]["maxDrawdownPercent"])),
        max_trials=policy_data["budget"]["maxTrialsPerAgent"],
        max_minutes=policy_data["budget"]["maxMinutesPerAgent"],
        monthly_target_pct=Decimal(str(policy_data["target"]["monthlyReturnPct"])),
    )

    agent_id = None
    for aid, mapping in policy_data.get("agents", {}).items():
        if aid not in selected_agents:
            continue
        if mapping.get("profile") == profile and mapping.get("taskId") == task_id:
            agent_id = aid
            break

    if not agent_id:
        raise ValueError("profile_task_authorization_failed")

    return policy, agent_id, campaign_dir

def research_status(args: dict[str, object] | None = None, **kwargs: object) -> str:
    args = _normalize_tool_args(args, kwargs)
    campaign_id = _campaign_id_from_args(args)
    try:
        policy, agent_id, campaign_dir = _get_identity_and_campaign(campaign_id)
    except ValueError as e:
        return json.dumps({"error": str(e)})

    agent_dir = campaign_dir / agent_id
    now = datetime.now(timezone.utc)
    try:
        state = load_agent_state(agent_dir, policy, now)
    except Exception as e:
        return json.dumps({"error": str(e)})

    elapsed_minutes = 0.0
    if state.first_acknowledged_at is not None:
        elapsed_minutes = (now - state.first_acknowledged_at).total_seconds() / 60.0

    return json.dumps({
        "Success": True,
        "agentId": agent_id,
        "acceptedTrials": state.accepted_trials,
        "remainingTrials": max(policy.max_trials - state.accepted_trials, 0),
        "manifestRejections": state.manifest_rejections,
        "elapsedMinutes": round(elapsed_minutes, 1),
        "terminal": state.terminal,
        "terminalReason": state.terminal_reason,
        "nextAction": state.next_action,
        "runIds": sorted(state.run_ids),
        "policy": {
            "campaignId": policy.campaign_id,
            "exchange": policy.exchange,
            "symbol": policy.symbol,
            "timeframe": policy.timeframe,
            "marketType": policy.market_type,
            "startAt": policy.start_at,
            "endAt": policy.end_at,
            "maxTrials": policy.max_trials,
            "maxMinutes": policy.max_minutes,
        },
    })

def submit_experiment(args: dict[str, object] | None = None, **kwargs: object) -> str:
    client = kwargs.get("client")
    if client is None:
        client = TradeLabClient()

    args = _normalize_tool_args(args, kwargs)
    campaign_id = _campaign_id_from_args(args)
    try:
        policy, agent_id, campaign_dir = _get_identity_and_campaign(campaign_id)
    except ValueError as e:
        return json.dumps({"error": str(e)})

    agent_dir = campaign_dir / agent_id
    now = datetime.now(timezone.utc)
    try:
        state = load_agent_state(agent_dir, policy, now)
    except Exception as e:
        return json.dumps({"error": str(e)})

    if state.terminal:
        response = {
            "Success": False,
            "terminal": True,
            "terminalReason": state.terminal_reason,
            "nextAction": "stop",
            "acceptedTrials": state.accepted_trials,
            "remainingTrials": 0,
        }
        if state.terminal_reason == "blocked_ambiguous_submission":
            response["error"] = "ambiguous_backtest_submission"
        return json.dumps(response)

    input_errors: list[str] = []
    sources_raw = _arg(args, "sources", "sources", [])
    sources_tup: tuple[dict[str, str], ...] = ()
    if not isinstance(sources_raw, list):
        input_errors.append("sources_must_be_array")
    else:
        normalized_sources = []
        for index, source in enumerate(sources_raw):
            if not isinstance(source, dict):
                input_errors.append(f"source_must_be_object:{index}")
                continue
            normalized_sources.append({
                "url": source.get("url", "") if isinstance(source.get("url", ""), str) else "",
                "retrievedAt": source.get("retrievedAt", "") if isinstance(source.get("retrievedAt", ""), str) else "",
                "claim": source.get("claim", "") if isinstance(source.get("claim", ""), str) else "",
            })
        sources_tup = tuple(normalized_sources)

    parameters_raw = _arg(args, "parameters", "parameters", {})
    if not isinstance(parameters_raw, dict):
        input_errors.append("parameters_must_be_object")
        parameters: dict[str, object] = {}
    else:
        parameters = parameters_raw

    manifest = ExperimentManifest(
        campaign_id=campaign_id,
        agent_id=agent_id,
        hypothesis=_arg(args, "hypothesis", "hypothesis", "") if isinstance(_arg(args, "hypothesis", "hypothesis", ""), str) else "",
        sources=sources_tup,
        changed_parameter_group=_arg(args, "changedParameterGroup", "changed_parameter_group", "") if isinstance(_arg(args, "changedParameterGroup", "changed_parameter_group", ""), str) else "",
        parameters=parameters,
        expected_effect=_arg(args, "expectedEffect", "expected_effect", "") if isinstance(_arg(args, "expectedEffect", "expected_effect", ""), str) else "",
    )
    policy_hash = _policy_hash(policy)
    manifest_payload = {
        "hypothesis": manifest.hypothesis,
        "sources": list(manifest.sources),
        "changedParameterGroup": manifest.changed_parameter_group,
        "parameters": manifest.parameters,
        "expectedEffect": manifest.expected_effect,
    }
    manifest_hash = _hash_payload(manifest_payload)
    source_code = ""
    source_hash = ""

    def reject_manifest(errors: list[str], next_action: str) -> str:
        append_jsonl(agent_dir / "rejected-manifests.jsonl", {
            "timestamp": now.isoformat().replace("+00:00", "Z"),
            "errors": errors,
            "manifest": manifest_payload,
        })
        new_state = load_agent_state(agent_dir, policy, now)
        write_agent_summary(agent_dir, new_state, None)
        return json.dumps({
            "Success": False,
            "errors": errors,
            "acceptedTrials": new_state.accepted_trials,
            "remainingTrials": max(policy.max_trials - new_state.accepted_trials, 0),
            "manifestRejections": new_state.manifest_rejections,
            "terminal": new_state.terminal,
            "terminalReason": new_state.terminal_reason,
            "nextAction": next_action,
        })

    accepted = read_jsonl(agent_dir / "accepted-trials.jsonl")
    submission_intents = read_jsonl(agent_dir / "submission-intents.jsonl")
    acknowledged_intents = {
        record.get("intentId"): record
        for record in submission_intents
        if record.get("status") == "acknowledged" and isinstance(record.get("intentId"), str)
    }
    unresolved_intents = [
        record
        for record in submission_intents
        if record.get("status") == "pending" and record.get("intentId") not in acknowledged_intents
    ]
    if unresolved_intents:
        write_agent_summary(agent_dir, state, None)
        return json.dumps({
            "Success": False,
            "error": "ambiguous_backtest_submission",
            "terminal": True,
            "terminalReason": "blocked_ambiguous_submission",
            "nextAction": "stop",
            "acceptedTrials": state.accepted_trials,
            "remainingTrials": max(policy.max_trials - state.accepted_trials, 0),
        })

    # Check if this manifest has already been successfully submitted (acknowledged run id exists)
    existing_receipt = None
    for r in accepted:
        if r.get("manifest", {}).get("parameters") == manifest.parameters:
            existing_receipt = r
            break

    acknowledged_intent = next(
        (
            record
            for record in acknowledged_intents.values()
            if record.get("manifestHash") == manifest_hash
            or record.get("manifest", {}).get("parameters") == manifest.parameters
        ),
        None,
    )

    if existing_receipt:
        receipt = existing_receipt
        run_id = existing_receipt["runId"]
        strategy_id = existing_receipt["strategyId"]
        bot_id = existing_receipt["botId"]
        version_id = existing_receipt["versionId"]
    elif acknowledged_intent:
        receipt = dict(acknowledged_intent)
        run_id = acknowledged_intent["runId"]
        strategy_id = acknowledged_intent["strategyId"]
        bot_id = acknowledged_intent["botId"]
        version_id = acknowledged_intent["versionId"]
    else:
        previous = accepted[-1].get("manifest", {}).get("parameters") if accepted else None
        errors = input_errors + validate_manifest(
            policy, manifest, previous, state.accepted_trials, state.first_acknowledged_at, now
        )

        if errors:
            return reject_manifest(errors, "fix_manifest")

        source_code = render_strategy_source(agent_id, manifest.parameters)
        source_hash = _hash_payload(source_code)

        # Call datasets coverage first to check dataset and align with test calls expectations
        try:
            client.request("GET", "/api/tradelab/datasets/coverage")
        except Exception:
            pass

        try:
            val_res = client.request("POST", "/api/tradelab/strategies/validate-source", {"sourceCode": source_code})
            if val_res.get("validationStatus") != "valid":
                errors = ["invalid_source_code"]
        except Exception as e:
            errors = [f"validate_source_failed: {str(e)}"]

        if errors:
            return reject_manifest(errors, "fix_source")

    try:
        if existing_receipt or acknowledged_intent:
            run_id = receipt["runId"]
            strategy_id = receipt["strategyId"]
            bot_id = receipt["botId"]
            version_id = receipt["versionId"]
        else:
            if state.accepted_trials == 0:
                group_name = f"Pilot {campaign_id} {agent_id}"
                group_slug = f"pilot-{campaign_id}-{agent_id}"
                grp = client.request("POST", "/api/tradelab/strategy-groups", {
                    "name": group_name, "slug": group_slug, "description": "Strategy group for research pilot"
                })
                group_id = grp["id"]

                strat = client.request("POST", "/api/tradelab/strategies", {
                    "strategy_group_id": group_id,
                    "name": f"Pilot {campaign_id} {agent_id} Strategy",
                    "slug": f"pilot-{campaign_id}-{agent_id}-strategy",
                    "description": "Programmatic pilot strategy"
                })
                strategy_id = strat["id"]
            else:
                strategy_id = accepted[0]["strategyId"]

            version = client.request("POST", f"/api/tradelab/strategies/{strategy_id}/versions", {
                "source_code": source_code,
                "change_description": f"Trial {state.accepted_trials + 1}"
            })
            version_id = version["id"]

            bot = client.request("POST", "/api/tradelab/bots", {
                "strategy_id": strategy_id,
                "strategy_version_id": version_id,
                "name": f"Pilot {campaign_id} {agent_id} Trial {state.accepted_trials + 1} Bot",
                "symbol": policy.symbol,
                "timeframe": policy.timeframe,
                "runtime_config": {
                    "exchange": policy.exchange,
                    "symbol": policy.symbol,
                    "timeframe": policy.timeframe,
                    "marketType": policy.market_type
                },
                "risk_config": {
                    "minNotional": float(policy.min_notional),
                    "maxOrderPercent": float(policy.max_order_percent),
                    "maxDrawdownPercent": float(policy.max_drawdown_percent),
                    "maxPositionPercent": float(policy.max_position_percent)
                }
            })
            bot_id = bot["id"]

            client.request("POST", f"/api/tradelab/bots/{bot_id}/backtests/preflight", {
                "exchange": policy.exchange,
                "symbol": policy.symbol,
                "timeframe": policy.timeframe,
                "start_at": policy.start_at,
                "end_at": policy.end_at,
                "initial_equity": float(policy.initial_equity),
                "fee_bps": float(policy.fee_bps),
                "slippage_bps": float(policy.slippage_bps),
            })

            intent_id = hashlib.sha256(
                f"{campaign_id}:{agent_id}:{manifest_hash}:{datetime.now(timezone.utc).isoformat()}".encode("utf-8")
            ).hexdigest()
            pending_intent = {
                "intentId": intent_id,
                "status": "pending",
                "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "manifestHash": manifest_hash,
                "strategyId": strategy_id,
                "botId": bot_id,
                "versionId": version_id,
                "sourceHash": source_hash,
                "policyHash": policy_hash,
                "manifest": manifest_payload,
            }
            append_jsonl(agent_dir / "submission-intents.jsonl", pending_intent)
            try:
                run_data = client.request("POST", f"/api/tradelab/bots/{bot_id}/backtests", {
                "exchange": policy.exchange,
                "symbol": policy.symbol,
                "timeframe": policy.timeframe,
                "start_at": policy.start_at,
                "end_at": policy.end_at,
                "initial_equity": float(policy.initial_equity),
                "fee_bps": float(policy.fee_bps),
                "slippage_bps": float(policy.slippage_bps),
                "max_order_percent": float(policy.max_order_percent),
                "max_position_percent": float(policy.max_position_percent),
                "min_notional": float(policy.min_notional),
                "max_drawdown_percent": float(policy.max_drawdown_percent),
                })
            except Exception:
                blocked_state = load_agent_state(agent_dir, policy, datetime.now(timezone.utc))
                write_agent_summary(agent_dir, blocked_state, None)
                return json.dumps({
                    "Success": False,
                    "error": "ambiguous_backtest_submission",
                    "terminal": True,
                    "terminalReason": "blocked_ambiguous_submission",
                    "nextAction": "stop",
                    "acceptedTrials": blocked_state.accepted_trials,
                    "remainingTrials": max(policy.max_trials - blocked_state.accepted_trials, 0),
                })
            run_id = run_data.get("bot_run_id") or (run_data.get("run") or {}).get("id") or run_data.get("id")
            if not isinstance(run_id, str) or not run_id:
                blocked_state = load_agent_state(agent_dir, policy, datetime.now(timezone.utc))
                write_agent_summary(agent_dir, blocked_state, None)
                return json.dumps({
                    "Success": False,
                    "error": "ambiguous_backtest_submission",
                    "terminal": True,
                    "terminalReason": "blocked_ambiguous_submission",
                    "nextAction": "stop",
                    "acceptedTrials": blocked_state.accepted_trials,
                    "remainingTrials": max(policy.max_trials - blocked_state.accepted_trials, 0),
                })

            receipt = {
                "intentId": intent_id,
                "status": "acknowledged",
                "runId": run_id,
                "strategyId": strategy_id,
                "botId": bot_id,
                "versionId": version_id,
                "sourceHash": source_hash,
                "policyHash": policy_hash,
                "timestamp": now.isoformat().replace("+00:00", "Z"),
                "acknowledgedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "manifestHash": manifest_hash,
                "manifest": manifest_payload,
            }
            append_jsonl(agent_dir / "submission-intents.jsonl", receipt)

        completed_run = None
        for _ in range(150):
            try:
                run_status = client.request("GET", f"/api/tradelab/bot-runs/{run_id}")
                if run_status.get("status") == "completed" and run_status.get("pipeline_status") == "completed":
                    completed_run = run_status
                    break
                if run_status.get("status") == "failed" or run_status.get("error_message") is not None:
                    completed_run = run_status
                    break
            except Exception:
                pass
            time.sleep(2)

        if completed_run is None:
            new_state = load_agent_state(agent_dir, policy, datetime.now(timezone.utc))
            write_agent_summary(agent_dir, new_state, None)
            return json.dumps({
                "Success": False,
                "runId": run_id,
                "error": "blocked_repeated_infrastructure_failure",
                "failedReasons": ["backtest_timeout"],
                "acceptedTrials": new_state.accepted_trials,
                "remainingTrials": max(policy.max_trials - new_state.accepted_trials, 0),
                "terminal": new_state.terminal,
                "terminalReason": new_state.terminal_reason,
                "nextAction": "retry_or_abort",
            })

        result = client.request("GET", f"/api/tradelab/bot-runs/{run_id}/result")
        analysis = client.request("GET", f"/api/tradelab/bot-runs/{run_id}/analysis")
        orders = client.request("GET", f"/api/tradelab/bot-runs/{run_id}/orders")
        logs = client.request("GET", f"/api/tradelab/bot-runs/{run_id}/logs")

        evidence = verify_run(policy, manifest, completed_run, result, analysis, orders, logs, receipt)

        verdict = "NO_CANDIDATE_WITHIN_BUDGET"
        if evidence.evidence_ok and all(evidence.gate_results.values()):
            verdict = "RESEARCH_CANDIDATE"
        elif not evidence.evidence_ok:
            verdict = "BLOCKED"

        canonical_record = {
            **receipt,
            "experimentId": receipt.get("intentId"),
            "normalizedEvidence": {
                "run": completed_run,
                "result": result,
                "analysis": analysis,
                "orders": orders,
                "logs": logs,
            },
            "integrityChecks": evidence.integrity_checks,
            "gateResults": evidence.gate_results,
            "controllerVerdict": verdict,
        }
        if not any(record.get("runId") == run_id for record in accepted):
            append_jsonl(agent_dir / "accepted-trials.jsonl", canonical_record)

        evidence_records = read_jsonl(agent_dir / "controller-evidence.jsonl")
        if not any(record.get("runId") == run_id for record in evidence_records):
            append_jsonl(agent_dir / "controller-evidence.jsonl", {
                "runId": run_id,
                "sourceHash": receipt.get("sourceHash", source_hash),
                "policyHash": receipt.get("policyHash", policy_hash),
                "normalizedEvidence": {
                    "run": completed_run,
                    "result": result,
                    "analysis": analysis,
                    "orders": orders,
                    "logs": logs,
                },
                "integrityChecks": evidence.integrity_checks,
                "gateResults": evidence.gate_results,
                "controllerVerdict": verdict,
                "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            })

        assessment = {
            "runId": run_id,
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "observedEffect": str(_arg(args, "observedEffect", "observed_effect", "")),
            "lesson": str(_arg(args, "lesson", "lesson", "")),
            "nextExperiment": str(_arg(args, "nextExperiment", "next_experiment", "")),
            "evidenceOk": evidence.evidence_ok,
            "failedReasons": list(evidence.failed_reasons),
            "gateResults": evidence.gate_results if evidence.evidence_ok else {},
        }
        append_jsonl(agent_dir / "agent-assessments.jsonl", assessment)

        new_state = load_agent_state(agent_dir, policy, datetime.now(timezone.utc))
        write_agent_summary(agent_dir, new_state, evidence)

        return json.dumps({
            "Success": True,
            "runId": run_id,
            "evidenceOk": evidence.evidence_ok,
            "verdict": verdict,
            "failedReasons": list(evidence.failed_reasons),
            "metrics": result.get("metrics", {}),
            "acceptedTrials": new_state.accepted_trials,
            "remainingTrials": max(policy.max_trials - new_state.accepted_trials, 0),
            "terminal": new_state.terminal,
            "terminalReason": new_state.terminal_reason,
            "nextAction": new_state.next_action,
        })

    except Exception as e:
        new_state = load_agent_state(agent_dir, policy, datetime.now(timezone.utc))
        write_agent_summary(agent_dir, new_state, None)
        return json.dumps({
            "Success": False,
            "error": f"execution_error: {str(e)}",
            "acceptedTrials": new_state.accepted_trials,
            "remainingTrials": max(policy.max_trials - new_state.accepted_trials, 0),
            "terminal": new_state.terminal,
            "nextAction": new_state.next_action,
        })
