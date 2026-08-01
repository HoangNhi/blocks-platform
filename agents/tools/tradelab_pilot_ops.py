import os
import sys
import re
import json
import time
import subprocess
import hashlib
import shutil
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Callable, Any

from agents.tools.tradelab_pilot_contract import (
    CampaignPolicy,
    ARTIFACT_NAMES,
    ExperimentManifest,
    VerifiedEvidence,
    validate_manifest,
    verify_run,
    validate_selected_agents,
    read_jsonl,
    load_agent_state,
    write_agent_summary,
    append_jsonl,
)
from agents.tools.tradelab_pilot_controller import TradeLabClient, CAMPAIGNS_ROOT

PROFILE_NAMES = {
    "trend": "tradelab-trend-researcher",
    "mean-reversion": "tradelab-mean-reversion-researcher",
    "breakout": "tradelab-breakout-researcher",
}

REQUIRED_WORKER_TOOLSETS = frozenset({"web", "tradelab_research"})


def _find_repository_root(start: Path) -> Path:
    current = start.resolve()
    for candidate in (current, *current.parents):
        if (candidate / 'AGENTS.md').exists() and (candidate / 'Blocks.slnx').exists():
            return candidate
    raise RuntimeError('Could not locate the Blocks repository root')


def _path_from_env(name: str, default: Path) -> Path:
    return Path(os.environ.get(name, str(default))).expanduser().resolve()


BLOCKS_WORKSPACE_ROOT = _path_from_env(
    'BLOCKS_WORKSPACE_ROOT',
    _find_repository_root(Path(__file__).resolve().parent),
)
HERMES_HOME = _path_from_env('HERMES_HOME', Path.home() / '.hermes')
HERMES_PROFILES_ROOT = HERMES_HOME / 'profiles'
HERMES_PLUGIN_SOURCE = BLOCKS_WORKSPACE_ROOT / 'agents' / 'integrations' / 'hermes' / 'tradelab_research'
FORBIDDEN_WORKER_TOOLSETS = (
    "browser", "terminal", "file", "code_execution", "vision", "video",
    "image_gen", "video_gen", "x_search", "tts", "skills", "todo", "memory",
    "context_engine", "session_search", "clarify", "delegation", "cronjob",
    "homeassistant", "spotify", "yuanbao", "computer_use",
)
ALLOWED_WORKER_TRACE_TOOLS = frozenset({
    "web_search", "web_extract", "tradelab_research_status", "tradelab_submit_experiment",
    "kanban_show", "kanban_heartbeat", "kanban_comment", "kanban_complete", "kanban_block",
})
WORKER_TRACE_ROOT = HERMES_HOME / 'kanban' / 'boards' / 'tradelab-research' / 'logs'


def _enabled_toolsets(output: str) -> set[str]:
    return {
        match.group(1)
        for match in re.finditer(r"^\s*[✓*]\s+enabled\s+([a-z0-9_:-]+)\b", output, re.MULTILINE)
    }


def _write_json_atomic(path: Path, payload: dict[str, object]) -> None:
    temporary_path = path.with_suffix(path.suffix + ".tmp")
    temporary_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    temporary_path.replace(path)


_IMMUTABLE_EVIDENCE_FIELDS = (
    "sourceHash",
    "policyHash",
    "normalizedEvidence",
    "integrityChecks",
    "gateResults",
    "controllerVerdict",
)


def _controller_evidence_matches(stored: dict[str, object], fresh: dict[str, object]) -> bool:
    return all(stored.get(field) == fresh.get(field) for field in _IMMUTABLE_EVIDENCE_FIELDS)


def preflight_campaign_capabilities(campaign_path: Path, campaign_data: dict[str, object], run: Callable[..., Any]) -> None:
    selected = campaign_data["selectedAgents"]
    capabilities: dict[str, object] = {}

    for family in selected:
        profile = campaign_data["agents"][family]["profile"]
        result = run(
            ["hermes", "-p", profile, "tools", "list", "--platform", "cli"],
            capture_output=True,
            text=True,
            check=True,
        )
        enabled = _enabled_toolsets(result.stdout)
        unexpected = sorted(enabled - REQUIRED_WORKER_TOOLSETS)
        missing = sorted(REQUIRED_WORKER_TOOLSETS - enabled)
        if unexpected or missing:
            detail = unexpected[0] if unexpected else f"missing_{missing[0]}"
            raise ValueError(f"worker_capability_mismatch:{family}:{detail}")
        capabilities[family] = {
            "profile": profile,
            "enabledToolsets": sorted(enabled),
            "requiredToolNames": [
                "web_search", "web_extract", "tradelab_research_status", "tradelab_submit_experiment",
                "kanban_show", "kanban_heartbeat", "kanban_comment", "kanban_complete", "kanban_block",
            ],
            "checkedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }

    _write_json_atomic(campaign_path / "task-receipts.json", {
        "campaignId": campaign_data["campaignId"],
        "capabilities": capabilities,
    })


def worker_tool_trace(family: str, task_id: str, profile: str | None = None) -> dict[str, object]:
    trace_path = WORKER_TRACE_ROOT / f"{task_id}.log"
    if not trace_path.is_file():
        raise ValueError(f"missing_worker_tool_trace:{family}:{task_id}")

    trace = trace_path.read_text(encoding="utf-8")
    tool_names = set(re.findall(r"\bpreparing\s+([a-z][a-z0-9_]*)", trace))
    session_match = re.search(r"\bsession_id:\s*([a-z0-9_-]+)", trace)
    session_id = session_match.group(1) if session_match else None
    trace_sources = [{
        "kind": "kanban_task_log",
        "sha256": hashlib.sha256(trace.encode("utf-8")).hexdigest(),
    }]
    if profile and session_id:
        profile_log = HERMES_PROFILES_ROOT / profile / "logs" / "agent.log"
        if profile_log.is_file():
            session_pattern = re.compile(
                rf"\[{re.escape(session_id)}\].*?agent\.tool_executor: tool ([a-z][a-z0-9_]*)\b"
            )
            session_events = [line for line in profile_log.read_text(encoding="utf-8").splitlines() if session_pattern.search(line)]
            tool_names.update(match.group(1) for line in session_events if (match := session_pattern.search(line)))
            trace_sources.append({
                "kind": "profile_session_log",
                "sha256": hashlib.sha256("\n".join(session_events).encode("utf-8")).hexdigest(),
            })
    tool_names = sorted(tool_names)
    if not tool_names:
        raise ValueError(f"missing_worker_tool_trace:{family}:{task_id}")

    unexpected = sorted(set(tool_names) - ALLOWED_WORKER_TRACE_TOOLS)
    if unexpected:
        raise ValueError(f"forbidden_worker_tool:{family}:{unexpected[0]}")

    canonical_trace = {
        "family": family,
        "taskId": task_id,
        "profile": profile,
        "sessionId": session_id,
        "toolNames": tool_names,
        "traceSources": trace_sources,
    }
    return {
        "toolNames": tool_names,
        "sessionId": session_id,
        "traceSources": trace_sources,
        "sha256": hashlib.sha256(
            json.dumps(canonical_trace, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest(),
    }

def build_task_body(campaign_id: str, family: str, max_trials: int = 5, max_minutes: int = 30) -> str:
    baseline_parameters = {
        "trend": '{"fast":12,"slow":26,"adx":15,"exitBars":48}',
        "mean-reversion": '{"rsiPeriod":14,"rsiLow":30,"rsiHigh":70,"exitBars":24}',
        "breakout": '{"lookback":20,"atrPeriod":14,"atrMinimumPct":1,"exitBars":48}',
    }[family]
    return f"""Task: Conduct TradeLab backtest research for campaign {campaign_id} in {family} family.
Instructions:
1. Call tradelab_research_status first with exactly `{{"campaignId":"{campaign_id}"}}`. Do not send a `reason` field.
2. Design strategy parameter hypotheses based on web research sources.
3. Call tradelab_submit_experiment only after status succeeds. First baseline call must use this complete shape (replace prose with research findings): `{{"campaignId":"{campaign_id}","hypothesis":"research-backed hypothesis","sources":[{{"url":"https://source.example","retrievedAt":"YYYY-MM-DD","claim":"research claim"}}],"changedParameterGroup":"baseline","parameters":{baseline_parameters},"expectedEffect":"measurable expected effect","observedEffect":"","lesson":"","nextExperiment":""}}`. Do not send a `reason` field.
4. You are subject to a trial budget: maximum {max_trials} submitted backtests or {max_minutes} minutes from first accepted submission, whichever occurs first.
5. 2% is a target, not guaranteed income.
6. Never call paper, testnet, or live order routes.
7. Do not complete or block while `terminal` is false in the latest tradelab_research_status response.
8. Only call kanban_show, kanban_heartbeat, kanban_comment, kanban_complete, or kanban_block. Never call kanban_attachments, kanban_attach, kanban_create, kanban_link, kanban_list, or kanban_unblock.
"""

def setup_profiles(
    run: Callable[..., Any],
    profiles_root: Path | None = None,
    verify_connectivity: bool = False,
) -> None:
    profiles_root = profiles_root or HERMES_PROFILES_ROOT
    # Look for NINE_ROUTER_API_KEY
    nine_router_key = os.environ.get("NINE_ROUTER_API_KEY")
    if not nine_router_key:
        env_path = HERMES_HOME / '.env'
        if env_path.exists():
            for line in env_path.read_text(encoding="utf-8").splitlines():
                if line.startswith("NINE_ROUTER_API_KEY="):
                    nine_router_key = line.split("=", 1)[1].strip().strip("\"'")

    for family, name in PROFILE_NAMES.items():
        # Create profile (if it fails/exists, that is fine)
        try:
            run([
                "hermes", "profile", "create", name,
                "--no-skills",
                "--description", f"TradeLab {family} research worker. Backtest-only, evidence-led, no exchange execution."
            ], capture_output=True, text=True, check=True)
        except Exception:
            pass

        # Write config.yaml without terminal, web, or browser sections
        prof_dir = profiles_root / name
        prof_dir.mkdir(parents=True, exist_ok=True)
        config_path = prof_dir / "config.yaml"
        with open(config_path, "w", encoding="utf-8") as f:
            f.write("model:\n")
            f.write("  provider: 9router\n")
            f.write("  default: ag/gemini-3-flash-agent\n")
            f.write("  base_url: http://127.0.0.1:20128/v1\n")
            f.write("providers:\n")
            f.write("  9router:\n")
            f.write("    api: http://127.0.0.1:20128/v1\n")
            f.write("    default_model: ag/gemini-3-flash-agent\n")
            f.write("    discover_models: true\n")
            f.write("    key_env: NINE_ROUTER_API_KEY\n")
            f.write("    name: 9router\n")
            f.write("    transport: chat_completions\n")
            f.write("toolsets:\n")
            f.write("  - web\n")
            f.write("  - tradelab_research\n")
            f.write("agent:\n")
            f.write("  max_turns: 120\n")
            f.write("  gateway_timeout: 2400\n")
            f.write("  tool_use_enforcement: auto\n")
            f.write("  task_completion_guidance: true\n")
            f.write("  disabled_toolsets:\n")
            f.write("    - terminal\n")
            f.write("    - code_execution\n")
            f.write("    - browser\n")
            f.write("    - clarify\n")
            f.write("    - delegation\n")
            f.write("    - skills\n")
            for toolset in FORBIDDEN_WORKER_TOOLSETS:
                if toolset not in {"terminal", "code_execution", "browser", "clarify", "delegation", "skills"}:
                    f.write(f"    - {toolset}\n")

        # Symlink plugin
        plugin_dir = prof_dir / "plugins"
        plugin_dir.mkdir(parents=True, exist_ok=True)
        link_path = plugin_dir / "tradelab_research"
        if not link_path.exists():
            try:
                link_path.symlink_to(HERMES_PLUGIN_SOURCE, target_is_directory=True)
            except OSError:
                shutil.copytree(HERMES_PLUGIN_SOURCE, link_path)

        # Write .env
        env_file = prof_dir / ".env"
        if nine_router_key:
            env_file.write_text(f"NINE_ROUTER_API_KEY={nine_router_key}\n", encoding="utf-8")
        else:
            env_file.write_text("", encoding="utf-8")
        os.chmod(env_file, 0o600)

        run([
            "hermes", "-p", name, "plugins", "enable", "tradelab_research"
        ], input="n\n", capture_output=True, text=True, check=True, timeout=15)
        run([
            "hermes", "-p", name, "tools", "disable", *FORBIDDEN_WORKER_TOOLSETS
        ], capture_output=True, text=True, check=True)
        run([
            "hermes", "-p", name, "tools", "enable", "web", "tradelab_research"
        ], capture_output=True, text=True, check=True)

        if verify_connectivity:
            print(f"Testing connectivity for profile {name}...")
            res = run([
                "hermes", "-p", name, "-z", "Reply exactly PROFILE_OK. Do not call tools."
            ], capture_output=True, text=True, check=True, timeout=45)
            if "PROFILE_OK" not in res.stdout:
                raise ValueError(f"Connectivity check failed for profile {name}: {res.stdout}")

def freeze_campaign(client: TradeLabClient, campaign_id: str, selected_agents: tuple[str, ...] = ("trend",), max_trials: int = 5, root: Path = CAMPAIGNS_ROOT) -> Path:
    if not re.match(r"^[a-z0-9-]{1,64}$", campaign_id):
        raise ValueError("invalid_campaign_id")

    all_agents = {f: {"profile": PROFILE_NAMES[f]} for f in PROFILE_NAMES}
    selected_agents = validate_selected_agents(list(selected_agents), all_agents)

    campaign_dir = root / campaign_id
    policy_path = campaign_dir / "campaign.json"
    if policy_path.exists():
        existing = json.loads(policy_path.read_text(encoding="utf-8"))
        if existing.get("selectedAgents") != list(selected_agents):
            raise ValueError("cannot_change_selection_for_existing_campaign")
        return campaign_dir

    cov = client.request("GET", "/api/tradelab/datasets/coverage")
    items = cov.get("items", [])

    selected = None
    for item in items:
        if (item.get("exchange") == "binance" and
            item.get("symbol") == "BTCUSDT" and
            item.get("timeframe") == "1h"):
            selected = item
            break

    if not selected:
        raise ValueError("binance:BTCUSDT:1h dataset not found in coverage")

    if selected.get("health_status") != "healthy":
        raise ValueError("dataset health status is not healthy")

    if selected.get("gap_count", 0) != 0:
        raise ValueError("dataset has coverage gaps")

    start_str = selected.get("covered_start_at", "")
    def parse_dt(s):
        s_clean = s.replace("Z", "+00:00")
        return datetime.fromisoformat(s_clean).astimezone(timezone.utc)

    start_dt = parse_dt(start_str)
    limit_dt = parse_dt("2022-01-01T00:00:00Z")
    if start_dt > limit_dt:
        raise ValueError(f"Dataset coverage start {start_str} is after 2022-01-01")

    end_str = selected.get("covered_end_at", "")
    end_dt = parse_dt(end_str)

    months_diff = (end_dt.year - limit_dt.year) * 12 + (end_dt.month - limit_dt.month)
    if months_diff < 12:
        raise ValueError(f"Dataset coverage length from 2022-01-01 to {end_str} is under 12 months")

    campaign_dir.mkdir(parents=True, exist_ok=True)

    def to_utc_z(dt):
        return dt.isoformat().replace("+00:00", "Z")

    policy_data = {
        "campaignId": campaign_id,
        "status": "frozen",
        "selectedAgents": list(selected_agents),
        "dispatchConcurrency": len(selected_agents),
        "market": {
            "marketType": "USD_M_FUTURES",
            "exchange": "binance",
            "symbol": "BTCUSDT",
            "timeframe": "1h",
            "startAt": "2022-01-01T00:00:00Z",
            "endAt": to_utc_z(end_dt),
            "datasetKey": "binance:BTCUSDT:1h"
        },
        "capital": {
            "initialEquity": "100",
            "recurringDeposit": None
        },
        "costs": {
            "feeBps": "10",
            "slippageBps": "1",
            "fundingModel": "TradeLab engine"
        },
        "risk": {
            "leverage": 2,
            "maxOrderPercent": "50",
            "maxPositionPercent": "50",
            "minNotional": "5",
            "maxDrawdownPercent": "15"
        },
        "budget": {
            "maxTrialsPerAgent": max_trials,
            "maxMinutesPerAgent": 30,
            "maxManifestRejectionsPerAgent": 3,
            "preSubmissionTransportRetries": 1
        },
        "target": {
            "monthlyReturnPct": "2",
            "guaranteed": False
        },
        "agents": {
            f: {"profile": PROFILE_NAMES[f], "taskId": None}
            for f in selected_agents
        }
    }

    with open(campaign_dir / "campaign.json", "w", encoding="utf-8") as f:
        json.dump(policy_data, f, indent=2)

    for family in selected_agents:
        agent_dir = campaign_dir / family
        agent_dir.mkdir(parents=True, exist_ok=True)

    return campaign_dir

def launch_campaign(campaign_path: Path, run: Callable[..., Any]) -> dict[str, str]:
    with open(campaign_path / "campaign.json", "r", encoding="utf-8") as f:
        campaign_data = json.load(f)

    campaign_id = campaign_data["campaignId"]
    selected = campaign_data.get("selectedAgents", list(campaign_data.get("agents", {}).keys()))
    preflight_campaign_capabilities(campaign_path, campaign_data, run)

    try:
        run([
            "hermes", "kanban", "boards", "create", "tradelab-research",
            "--name", "TradeLab Research",
            "--description", "Bounded autonomous backtest research pilots",
            "--default-workdir", str(BLOCKS_WORKSPACE_ROOT)
        ], capture_output=True, text=True, check=True)
    except Exception:
        pass

    task_ids = {}
    for family in selected:
        mapping = campaign_data["agents"][family]
        if mapping.get("taskId"):
            task_ids[family] = mapping["taskId"]
            continue
        body = build_task_body(
            campaign_id,
            family,
            max_trials=campaign_data["budget"]["maxTrialsPerAgent"],
            max_minutes=campaign_data["budget"]["maxMinutesPerAgent"],
        )
        res = run([
            "hermes", "kanban", "--board", "tradelab-research", "create",
            f"TradeLab pilot: {family}",
            "--body", body,
            "--assignee", mapping["profile"],
            "--workspace", f'dir:{BLOCKS_WORKSPACE_ROOT}',
            "--tenant", "tradelab",
            "--priority", "1",
            "--idempotency-key", f"{campaign_id}:{family}",
            "--max-runtime", "40m",
            "--max-retries", "3",
            "--goal",
            "--goal-max-turns", "12",
            "--json"
        ], capture_output=True, text=True, check=True)

        task_data = json.loads(res.stdout)
        task_id = task_data["id"]
        task_ids[family] = task_id
        mapping["taskId"] = task_id

    runtime = campaign_data.setdefault("runtime", {})
    if runtime.get("dispatchCompletedAt") is not None:
        _write_json_atomic(campaign_path / "campaign.json", campaign_data)
        return task_ids

    runtime["dispatchRequestedAt"] = int(time.time())
    _write_json_atomic(campaign_path / "campaign.json", campaign_data)

    concurrency = str(campaign_data.get("dispatchConcurrency", len(selected)))
    run([
        "hermes", "kanban", "--board", "tradelab-research", "dispatch", "--max", concurrency, "--json"
    ], capture_output=True, text=True, check=True)
    runtime["dispatchCompletedAt"] = int(time.time())
    _write_json_atomic(campaign_path / "campaign.json", campaign_data)

    return task_ids


def wait_campaign(
    campaign_path: Path,
    run: Callable[..., Any],
    timeout_seconds: float = 45 * 60,
    sleep: Callable[[float], None] = time.sleep,
) -> dict[str, str]:
    with open(campaign_path / "campaign.json", "r", encoding="utf-8") as f:
        campaign_data = json.load(f)

    selected = campaign_data["selectedAgents"]
    task_ids = {
        family: campaign_data["agents"][family].get("taskId")
        for family in selected
    }
    missing_task_ids = [family for family, task_id in task_ids.items() if not task_id]
    if missing_task_ids:
        raise ValueError(f"missing_task_id:{','.join(missing_task_ids)}")

    terminal_statuses = {"done", "blocked", "completed", "failed"}
    statuses: dict[str, str] = {}
    task_snapshots: dict[str, dict[str, object]] = {}
    started = time.monotonic()
    while len(statuses) < len(task_ids):
        for family, task_id in task_ids.items():
            if family in statuses:
                continue
            result = run(
                ["hermes", "kanban", "--board", "tradelab-research", "show", task_id, "--json"],
                capture_output=True,
                text=True,
                check=True,
            )
            task_info = json.loads(result.stdout)
            task = task_info.get("task") or task_info
            status = task.get("status")
            events = task_info.get("events", [])
            event_times = {
                kind: min(
                    (event.get("created_at") for event in events if event.get("kind") == kind and isinstance(event.get("created_at"), (int, float))),
                    default=None,
                )
                for kind in ("claimed", "spawned")
            }
            terminal_event_time = max(
                (
                    event.get("created_at")
                    for event in events
                    if event.get("kind") in {"completed", "blocked", "failed"}
                    and isinstance(event.get("created_at"), (int, float))
                ),
                default=None,
            )
            task_snapshots[family] = {
                "taskId": task_id,
                "status": status,
                "createdAt": task.get("created_at"),
                "claimedAt": event_times["claimed"],
                "spawnedAt": event_times["spawned"],
                "startedAt": task.get("started_at"),
                "completedAt": task.get("completed_at") or terminal_event_time,
            }
            if status in terminal_statuses:
                statuses[family] = status

        if len(statuses) == len(task_ids):
            runtime = campaign_data.get("runtime", {})
            dispatch_requested_at = runtime.get("dispatchRequestedAt")
            claim_spawn_times = [
                timestamp
                for task in task_snapshots.values()
                for timestamp in (task["claimedAt"], task["spawnedAt"])
            ]
            all_claimed_and_spawned = len(claim_spawn_times) == len(selected) * 2
            claim_spawn_within_window = (
                isinstance(dispatch_requested_at, (int, float))
                and all_claimed_and_spawned
                and max(claim_spawn_times) - dispatch_requested_at <= 15
            )
            started_at = [task["startedAt"] for task in task_snapshots.values()]
            completed_at = [task["completedAt"] for task in task_snapshots.values()]
            overlap_seconds = None
            if all(isinstance(value, (int, float)) for value in started_at + completed_at):
                overlap_seconds = max(0, min(completed_at) - max(started_at))
            _write_json_atomic(campaign_path / "runtime-evidence.json", {
                "campaignId": campaign_data["campaignId"],
                "selectedAgents": selected,
                "dispatchRequestedAt": dispatch_requested_at,
                "dispatchCompletedAt": runtime.get("dispatchCompletedAt"),
                "tasks": task_snapshots,
                "allClaimedAndSpawnedWithin15Seconds": claim_spawn_within_window,
                "overlapSeconds": overlap_seconds,
                "overlapAtLeast30Seconds": overlap_seconds is not None and overlap_seconds >= 30,
                "recordedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            })
            return statuses
        if time.monotonic() - started > timeout_seconds:
            raise TimeoutError("campaign_wait_timeout")
        sleep(10)

    return statuses

def collect_campaign(campaign_path: Path, client: TradeLabClient, run: Callable[..., Any]) -> Path:
    with open(campaign_path / "campaign.json", "r", encoding="utf-8") as f:
        campaign_data = json.load(f)

    campaign_id = campaign_data["campaignId"]
    selected = campaign_data.get("selectedAgents", list(campaign_data.get("agents", {}).keys()))

    summaries = {}
    artifact_hashes: dict[str, dict[str, str]] = {}
    for family in selected:
        agent_dir = campaign_path / family
        try:
            state = load_agent_state(agent_dir, CampaignPolicy(
                campaign_id=campaign_data["campaignId"],
                exchange=campaign_data["market"]["exchange"],
                symbol=campaign_data["market"]["symbol"],
                timeframe=campaign_data["market"]["timeframe"],
                market_type=campaign_data["market"]["marketType"],
                start_at=campaign_data["market"]["startAt"],
                end_at=campaign_data["market"]["endAt"],
                initial_equity=Decimal(str(campaign_data["capital"]["initialEquity"])),
                fee_bps=Decimal(str(campaign_data["costs"]["feeBps"])),
                slippage_bps=Decimal(str(campaign_data["costs"]["slippageBps"])),
                leverage=campaign_data["risk"]["leverage"],
                max_order_percent=Decimal(str(campaign_data["risk"]["maxOrderPercent"])),
                max_position_percent=Decimal(str(campaign_data["risk"]["maxPositionPercent"])),
                min_notional=Decimal(str(campaign_data["risk"]["minNotional"])),
                max_drawdown_percent=Decimal(str(campaign_data["risk"]["maxDrawdownPercent"])),
                max_trials=campaign_data["budget"]["maxTrialsPerAgent"],
                max_minutes=campaign_data["budget"]["maxMinutesPerAgent"],
                monthly_target_pct=Decimal(str(campaign_data["target"]["monthlyReturnPct"])),
            ), datetime.now(timezone.utc))
        except Exception as exc:
            raise ValueError(f"artifact_corruption:{family}:{exc}") from exc

        summaries[family] = {
            "acceptedTrials": state.accepted_trials if state else 0,
            "manifestRejections": state.manifest_rejections if state else 0,
            "terminal": state.terminal if state else False,
            "terminalReason": state.terminal_reason if state else None,
            "nextAction": state.next_action if state else "stop",
        }
        artifact_hashes[family] = {
            artifact_name: hashlib.sha256((agent_dir / artifact_name).read_bytes()).hexdigest()
            for artifact_name in ARTIFACT_NAMES
            if (agent_dir / artifact_name).is_file()
        }

    summary_path = campaign_path / "campaign-summary.json"
    _write_json_atomic(summary_path, summaries)
    _write_json_atomic(campaign_path / "collection-receipts.json", {
        "campaignId": campaign_id,
        "collectedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "artifactHashes": artifact_hashes,
    })

    return summary_path

def verify_campaign(campaign_path: Path, client: TradeLabClient, run: Callable[..., Any]) -> dict[str, object]:
    with open(campaign_path / "campaign.json", "r", encoding="utf-8") as f:
        campaign_data = json.load(f)

    campaign_id = campaign_data["campaignId"]
    agents = campaign_data.get("agents", {})
    selected = campaign_data.get("selectedAgents", list(agents.keys()))

    policy = CampaignPolicy(
        campaign_id=campaign_data["campaignId"],
        exchange=campaign_data["market"]["exchange"],
        symbol=campaign_data["market"]["symbol"],
        timeframe=campaign_data["market"]["timeframe"],
        market_type=campaign_data["market"]["marketType"],
        start_at=campaign_data["market"]["startAt"],
        end_at=campaign_data["market"]["endAt"],
        initial_equity=Decimal(str(campaign_data["capital"]["initialEquity"])),
        fee_bps=Decimal(str(campaign_data["costs"]["feeBps"])),
        slippage_bps=Decimal(str(campaign_data["costs"]["slippageBps"])),
        leverage=campaign_data["risk"]["leverage"],
        max_order_percent=Decimal(str(campaign_data["risk"]["maxOrderPercent"])),
        max_position_percent=Decimal(str(campaign_data["risk"]["maxPositionPercent"])),
        min_notional=Decimal(str(campaign_data["risk"]["minNotional"])),
        max_drawdown_percent=Decimal(str(campaign_data["risk"]["maxDrawdownPercent"])),
        max_trials=campaign_data["budget"]["maxTrialsPerAgent"],
        max_minutes=campaign_data["budget"]["maxMinutesPerAgent"],
        monthly_target_pct=Decimal(str(campaign_data["target"]["monthlyReturnPct"])),
    )

    verdicts = {}
    shortlist = []
    rejected = []
    parent_verification = {"verified": True, "details": {}}

    for family in selected:
        mapping = agents.get(family, {})
        task_id = mapping.get("taskId")
        if not task_id:
            raise ValueError(f"Task ID missing for family {family}")

        res = run([
            "hermes", "kanban", "--board", "tradelab-research", "show", task_id, "--json"
        ], capture_output=True, text=True, check=True)
        task_info = json.loads(res.stdout)
        status = (task_info.get("task") or task_info).get("status")
        if status not in {"done", "blocked", "completed", "failed"}:
            raise ValueError(f"Task {task_id} is not in terminal state: {status}")

        trace_receipt = worker_tool_trace(family, task_id, mapping["profile"])

        agent_dir = campaign_path / family
        accepted_file = agent_dir / "accepted-trials.jsonl"
        runs = []
        if accepted_file.exists():
            runs = read_jsonl(accepted_file)

        evidence_records = read_jsonl(agent_dir / "controller-evidence.jsonl")
        controller_evidence_by_run: dict[str, dict[str, object]] = {}
        for evidence_record in evidence_records:
            evidence_run_id = evidence_record.get("runId")
            if not isinstance(evidence_run_id, str) or not evidence_run_id:
                raise ValueError(f"invalid_controller_evidence:{family}")
            if evidence_run_id in controller_evidence_by_run:
                raise ValueError(f"duplicate_controller_evidence:{family}:{evidence_run_id}")
            controller_evidence_by_run[evidence_run_id] = evidence_record

        if len(runs) > policy.max_trials:
            raise ValueError(f"Agent {family} exceeded max trial budget of {policy.max_trials}")

        if len(runs) > 0:
            first_ts = datetime.fromisoformat(runs[0]["timestamp"].replace("Z", "+00:00"))
            last_ts = datetime.fromisoformat(runs[-1]["timestamp"].replace("Z", "+00:00"))
            elapsed = last_ts - first_ts
            if elapsed.total_seconds() > policy.max_minutes * 60 + 60:
                raise ValueError(
                    f"Agent {family} ran for {elapsed.total_seconds() / 60} minutes, "
                    f"exceeding {policy.max_minutes}-minute limit"
                )

        summary_path = agent_dir / "agent-summary.json"
        terminal_reason = None
        if summary_path.is_file():
            summary_data = json.loads(summary_path.read_text(encoding="utf-8"))
            terminal_reason = summary_data.get("terminalReason")
        controller_blocked = str(terminal_reason or "").startswith("blocked_")
        family_verdict = "BLOCKED" if len(runs) == 0 or controller_blocked else "NO_CANDIDATE_WITHIN_BUDGET"

        family_verification = {
            "workerToolTrace": trace_receipt,
            "run_verifications": [],
        }

        for r in runs:
            run_id = r.get("runId")
            if not run_id:
                continue
            if run_id not in controller_evidence_by_run:
                raise ValueError(f"missing_controller_evidence:{family}:{run_id}")

            try:
                run_status = client.request("GET", f"/api/tradelab/bot-runs/{run_id}")
                result = client.request("GET", f"/api/tradelab/bot-runs/{run_id}/result")
                analysis = client.request("GET", f"/api/tradelab/bot-runs/{run_id}/analysis")
                orders = client.request("GET", f"/api/tradelab/bot-runs/{run_id}/orders")
                logs = client.request("GET", f"/api/tradelab/bot-runs/{run_id}/logs")

                sources_tup = tuple(r.get("manifest", {}).get("sources", []))
                manifest = ExperimentManifest(
                    campaign_id=campaign_id,
                    agent_id=family,
                    hypothesis=r.get("manifest", {}).get("hypothesis", ""),
                    sources=sources_tup,
                    changed_parameter_group=r.get("manifest", {}).get("changedParameterGroup", ""),
                    parameters=r.get("manifest", {}).get("parameters", {}),
                    expected_effect=r.get("manifest", {}).get("expectedEffect", ""),
                )

                evidence = verify_run(policy, manifest, run_status, result, analysis, orders, logs, r)
                stored_evidence = controller_evidence_by_run[run_id]
                fresh_verdict = "NO_CANDIDATE_WITHIN_BUDGET"
                if evidence.evidence_ok and all(evidence.gate_results.values()):
                    fresh_verdict = "RESEARCH_CANDIDATE"
                elif not evidence.evidence_ok:
                    fresh_verdict = "BLOCKED"
                fresh_evidence = {
                    "sourceHash": r.get("sourceHash"),
                    "policyHash": r.get("policyHash"),
                    "normalizedEvidence": {
                        "run": run_status,
                        "result": result,
                        "analysis": analysis,
                        "orders": orders,
                        "logs": logs,
                    },
                    "integrityChecks": evidence.integrity_checks,
                    "gateResults": evidence.gate_results,
                    "controllerVerdict": fresh_verdict,
                }
                if not _controller_evidence_matches(stored_evidence, r) or not _controller_evidence_matches(stored_evidence, fresh_evidence):
                    evidence = VerifiedEvidence(
                        evidence_ok=False,
                        failed_reasons=(*evidence.failed_reasons, "controller_parent_evidence_mismatch"),
                        run_id=evidence.run_id,
                        dataset_fingerprint=evidence.dataset_fingerprint,
                        metrics=evidence.metrics,
                        integrity_checks=evidence.integrity_checks,
                        gate_results=evidence.gate_results,
                    )
                run_verified = evidence.evidence_ok
                family_verification["run_verifications"].append({
                    "runId": run_id,
                    "verified": run_verified,
                    "reasons": list(evidence.failed_reasons),
                    "warningLogs": evidence.integrity_checks["warningLogs"],
                    "errorLogs": evidence.integrity_checks["errorLogs"],
                })
                if not run_verified:
                    parent_verification["verified"] = False
                    family_verdict = "BLOCKED"
                    rejected.append((family, run_id, f"Failed verification: {evidence.failed_reasons}"))
                else:
                    gates = evidence.gate_results
                    if all(gates.values()) and not controller_blocked:
                        family_verdict = "RESEARCH_CANDIDATE"
                        shortlist.append((family, run_id, r.get("experimentId"), r.get("manifest", {}).get("parameters")))
                    else:
                        if family_verdict not in {"RESEARCH_CANDIDATE", "BLOCKED"}:
                            family_verdict = "NO_CANDIDATE_WITHIN_BUDGET"
                        if controller_blocked:
                            rejected.append((family, run_id, f"Controller terminal: {terminal_reason}"))
                        else:
                            rejected.append((family, run_id, f"Failed gates: {[g for g, v in gates.items() if not v]}"))

            except Exception as e:
                parent_verification["verified"] = False
                family_verdict = "BLOCKED"
                rejected.append((family, run_id, f"API fetch failed: {str(e)}"))
                family_verification["run_verifications"].append({
                    "runId": run_id,
                    "verified": False,
                    "reasons": [str(e)],
                })

        verdicts[family] = family_verdict
        parent_verification["details"][family] = family_verification

    runtime_path = campaign_path / "runtime-evidence.json"
    if not runtime_path.is_file():
        raise ValueError("missing_runtime_evidence")
    runtime_evidence = json.loads(runtime_path.read_text(encoding="utf-8"))
    if runtime_evidence.get("selectedAgents") != selected:
        raise ValueError("runtime_selected_agents_mismatch")
    if len(selected) > 1:
        if runtime_evidence.get("allClaimedAndSpawnedWithin15Seconds") is not True:
            raise ValueError("runtime_dispatch_window_not_verified")
        if runtime_evidence.get("overlapAtLeast30Seconds") is not True:
            raise ValueError("runtime_overlap_not_verified")

    # Write verdicts.json
    with open(campaign_path / "verdicts.json", "w", encoding="utf-8") as f:
        json.dump(verdicts, f, indent=2)

    # Write parent-verification.json
    with open(campaign_path / "parent-verification.json", "w", encoding="utf-8") as f:
        json.dump(parent_verification, f, indent=2)

    # Write campaign-report.md
    report_path = campaign_path / "campaign-report.md"
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(f"# Campaign Report: {campaign_id}\n\n")
        f.write("## Frozen Policy Contract\n")
        f.write(f"- Market: {policy.exchange}/{policy.symbol}/{policy.timeframe}\n")
        f.write(f"- Risk Stop: Max Drawdown {policy.max_drawdown_percent}%\n")
        f.write(f"- Initial Capital: {policy.initial_equity} USD\n\n")

        f.write("## Per-Family Status\n")
        for family in selected:
            f.write(f"- **{family}**: {verdicts.get(family, 'BLOCKED')}\n")
        f.write("\n")

        f.write("## Runtime Evidence\n")
        f.write(f"- Dispatch within 15 seconds: {runtime_evidence.get('allClaimedAndSpawnedWithin15Seconds')}\n")
        f.write(f"- Worker overlap seconds: {runtime_evidence.get('overlapSeconds')}\n")
        f.write(f"- Worker overlap at least 30 seconds: {runtime_evidence.get('overlapAtLeast30Seconds')}\n\n")

        f.write("## Verified Shortlist\n")
        if shortlist:
            for family, run_id, exp_id, params in shortlist:
                f.write(f"- Agent: {family}, Trial: {exp_id}, Run ID: {run_id}, Params: {params}\n")
        else:
            f.write("No candidates qualified.\n")
        f.write("\n")

        f.write("## Rejected Evidence\n")
        if rejected:
            for family, run_id, reason in rejected:
                f.write(f"- Run: {run_id} ({family}) - {reason}\n")
        else:
            f.write("No rejected runs.\n")
        f.write("\n")

        f.write("## Assumptions & Not Verified Warnings\n")
        f.write("- **Research target**: 2% monthly return is a parameter search target, not fixed interest or guaranteed income.\n")
        f.write("- **No OOS**: Locked out-of-sample data is not verified inside this trial budget.\n\n")

        f.write("## Next Recommendation\n")
        if shortlist:
            f.write("Recommend advancing the best candidate to larger out-of-sample confirmation phase.\n")
        else:
            f.write("Recommend adjusting parameter space and initiating a new campaign.\n")

    print("campaign verification PASS")
    return {"status": "verified"}

def main(argv: list[str] | None = None) -> int:
    if argv is None:
        argv = sys.argv[1:]

    if not argv:
        print("Usage: tradelab_pilot_ops.py [setup-profiles|freeze|smoke|launch|wait|collect|verify|run]")
        return 1

    cmd = argv[0]
    client = TradeLabClient()

    if cmd == "setup-profiles":
        import argparse
        parser = argparse.ArgumentParser()
        parser.add_argument("--verify-connectivity", action="store_true")
        args, _ = parser.parse_known_args(argv[1:])
        setup_profiles(subprocess.run, verify_connectivity=args.verify_connectivity)
        print("Profiles set up successfully.")
        return 0

    elif cmd == "freeze":
        import argparse
        parser = argparse.ArgumentParser()
        parser.add_argument("--agents", required=True, help="Comma-separated agent list")
        parser.add_argument("--max-trials", type=int, default=5)
        parser.add_argument("--campaign", default=None)
        args, _ = parser.parse_known_args(argv[1:])

        campaign_id = args.campaign or f"pilot-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%SZ')}".lower()
        agents_list = tuple(a.strip() for a in args.agents.split(","))
        campaign_dir = freeze_campaign(client, campaign_id, selected_agents=agents_list, max_trials=args.max_trials)
        print(f"Campaign frozen at {campaign_dir}")
        return 0

    elif cmd == "launch":
        import argparse
        parser = argparse.ArgumentParser()
        parser.add_argument("--campaign", required=True)
        args, _ = parser.parse_known_args(argv[1:])
        campaign_path = CAMPAIGNS_ROOT / args.campaign
        task_ids = launch_campaign(campaign_path, subprocess.run)
        print(f"Campaign launched. Task IDs: {task_ids}")
        return 0

    elif cmd == "smoke":
        setup_profiles(subprocess.run)
        smoke_id = f"smoke-{int(time.time())}"
        campaign_dir = freeze_campaign(client, smoke_id, selected_agents=("trend",), max_trials=1)
        print(f"Smoke campaign frozen at {campaign_dir}")

        task_ids = launch_campaign(campaign_dir, subprocess.run)
        print(f"Smoke launched. Task IDs: {task_ids}")

        print(f"Waiting for smoke task {task_ids['trend']} to finish...")
        statuses = wait_campaign(campaign_dir, subprocess.run)
        print(f"Smoke task terminal states: {statuses}")

        collect_campaign(campaign_dir, client, subprocess.run)
        print("Smoke campaign collection complete.")
        verify_campaign(campaign_dir, client, subprocess.run)
        verdicts_path = campaign_dir / "verdicts.json"
        if verdicts_path.exists():
            verdicts = json.loads(verdicts_path.read_text(encoding="utf-8"))
            trend_verdict = verdicts.get("trend", "BLOCKED")
            print(f"Smoke trend verdict: {trend_verdict}")
            if trend_verdict == "BLOCKED":
                print("Smoke FAILED: trend blocked. Not proceeding to wider launch.")
                return 1
        print("Smoke PASS.")
        return 0

    elif cmd == "wait":
        import argparse
        parser = argparse.ArgumentParser()
        parser.add_argument("--campaign", required=True)
        args, _ = parser.parse_known_args(argv[1:])
        campaign_path = CAMPAIGNS_ROOT / args.campaign

        statuses = wait_campaign(campaign_path, subprocess.run)
        print(f"All tasks completed: {statuses}")
        return 0

    elif cmd == "collect":
        import argparse
        parser = argparse.ArgumentParser()
        parser.add_argument("--campaign", required=True)
        args, _ = parser.parse_known_args(argv[1:])
        campaign_path = CAMPAIGNS_ROOT / args.campaign

        rep = collect_campaign(campaign_path, client, subprocess.run)
        print(f"Campaign collected. Summary written to {rep}")
        return 0

    elif cmd == "verify":
        import argparse
        parser = argparse.ArgumentParser()
        parser.add_argument("--campaign", required=True)
        args, _ = parser.parse_known_args(argv[1:])
        campaign_path = CAMPAIGNS_ROOT / args.campaign

        verify_campaign(campaign_path, client, subprocess.run)
        return 0

    elif cmd == "run":
        import argparse
        parser = argparse.ArgumentParser()
        parser.add_argument("--agents", default="trend,mean-reversion")
        parser.add_argument("--max-trials", type=int, default=5)
        args, _ = parser.parse_known_args(argv[1:])

        setup_profiles(subprocess.run)

        print("Initiating safety smoke run...")
        subprocess.run([sys.executable, "-m", "agents.tools.tradelab_pilot_ops", "smoke"], check=True)
        print("Smoke run passed. Proceeding with campaign.")

        campaign_id = f"pilot-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%SZ')}".lower()
        agents_list = tuple(a.strip() for a in args.agents.split(","))
        campaign_dir = freeze_campaign(client, campaign_id, selected_agents=agents_list, max_trials=args.max_trials)
        print(f"Campaign frozen at {campaign_dir}")

        task_ids = launch_campaign(campaign_dir, subprocess.run)
        print(f"Campaign launched. Task IDs: {task_ids}")

        subprocess.run([sys.executable, "-m", "agents.tools.tradelab_pilot_ops", "wait", "--campaign", campaign_id], check=True)
        subprocess.run([sys.executable, "-m", "agents.tools.tradelab_pilot_ops", "collect", "--campaign", campaign_id], check=True)
        subprocess.run([sys.executable, "-m", "agents.tools.tradelab_pilot_ops", "verify", "--campaign", campaign_id], check=True)
        return 0

    else:
        print(f"Unknown command: {cmd}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
