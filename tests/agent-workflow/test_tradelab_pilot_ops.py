from pathlib import Path
from subprocess import CompletedProcess

from agents.tools.tradelab_pilot_ops import PROFILE_NAMES, build_task_body, setup_profiles


class Recorder:
    def __init__(self):
        self.commands = []
        self.call_kwargs = []

    def __call__(self, command, **kwargs):
        self.commands.append(command)
        self.call_kwargs.append(kwargs)
        if "-z" in command:
            return CompletedProcess(command, 0, stdout="PROFILE_OK\n", stderr="")
        return CompletedProcess(command, 0, stdout='{"id":"t_test"}\n', stderr="")


SAFE_TOOLSETS = """Built-in toolsets (cli):
  ✓ enabled  web  Web Search & Scraping
Plugin toolsets (cli):
  ✓ enabled  tradelab_research  Tradelab Research
"""


class CapabilityRecorder(Recorder):
    def __init__(self, toolsets=SAFE_TOOLSETS):
        super().__init__()
        self.toolsets = toolsets

    def __call__(self, command, **kwargs):
        self.commands.append(command)
        if "tools" in command and "list" in command:
            return CompletedProcess(command, 0, stdout=self.toolsets, stderr="")
        return CompletedProcess(command, 0, stdout='{"id":"t_test"}\n', stderr="")


def test_profiles_are_role_named_and_restricted(tmp_path, monkeypatch) -> None:
    assert PROFILE_NAMES == {
        "trend": "tradelab-trend-researcher",
        "mean-reversion": "tradelab-mean-reversion-researcher",
        "breakout": "tradelab-breakout-researcher",
    }
    recorder = Recorder()
    setup_profiles(recorder, profiles_root=tmp_path)
    rendered = "\n".join(" ".join(cmd) for cmd in recorder.commands)
    assert "--no-skills" in rendered
    assert "plugins enable tradelab_research" in rendered
    assert "tools enable web tradelab_research" in rendered
    plugin_call = next(
        kwargs
        for command, kwargs in zip(recorder.commands, recorder.call_kwargs)
        if "plugins" in command and "enable" in command
    )
    assert plugin_call["input"] == "n\n"
    assert plugin_call["timeout"] == 15
    for name in PROFILE_NAMES.values():
        config = (tmp_path / name / "config.yaml").read_text()
        assert "ag/gemini-3-flash-agent" in config
        assert "tradelab_research" in config
        # enabled toolsets list must contain only web + tradelab_research
        assert "\ntoolsets:\n  - web\n  - tradelab_research\nagent:" in config
        assert "terminal" in config.split("disabled_toolsets:", 1)[1]


def test_profile_connectivity_probe_requires_explicit_opt_in(tmp_path) -> None:
    recorder = Recorder()

    setup_profiles(recorder, profiles_root=tmp_path, verify_connectivity=True)

    assert sum("-z" in command for command in recorder.commands) == len(PROFILE_NAMES)


def test_worker_brief_has_exact_stop_and_order_boundaries() -> None:
    body = build_task_body("pilot-20260718", "trend")
    assert "maximum 5 submitted backtests or 30 minutes" in body
    assert "Call tradelab_research_status first" in body
    assert "Never call paper, testnet, or live" in body
    assert "2% is a target, not guaranteed income" in body
    assert "kanban_complete" in body or "kanban_block" in body or "complete" in body or "block" in body
    assert "Do not complete or block while `terminal` is false" in body


def test_worker_brief_uses_frozen_trial_budget() -> None:
    body = build_task_body("pilot-smoke", "trend", max_trials=1, max_minutes=30)

    assert "maximum 1 submitted backtests or 30 minutes" in body
    assert '`{"campaignId":"pilot-smoke"}`' in body
    assert "Do not send a `reason` field" in body


def test_worker_trace_uses_profile_session_log_when_board_log_has_no_tool_events(tmp_path, monkeypatch) -> None:
    trace_root = tmp_path / "boards" / "tradelab-research" / "logs"
    trace_root.mkdir(parents=True)
    (trace_root / "t_trace.log").write_text("session_id: session-1\nTask blocked.\n", encoding="utf-8")
    profiles_root = tmp_path / "profiles"
    profile_log = profiles_root / "tradelab-trend-researcher" / "logs" / "agent.log"
    profile_log.parent.mkdir(parents=True)
    profile_log.write_text(
        "INFO [session-1] agent.tool_executor: tool kanban_show completed\n"
        "INFO [session-1] agent.tool_executor: tool tradelab_research_status completed\n"
        "INFO [session-1] agent.tool_executor: tool web_search completed\n"
        "INFO [session-1] agent.tool_executor: tool kanban_block completed\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(tpo, "WORKER_TRACE_ROOT", trace_root)
    monkeypatch.setattr(tpo, "HERMES_PROFILES_ROOT", profiles_root)

    trace = tpo.worker_tool_trace("trend", "t_trace", "tradelab-trend-researcher")

    assert trace["toolNames"] == ["kanban_block", "kanban_show", "tradelab_research_status", "web_search"]


def test_worker_trace_hash_covers_profile_session_events(tmp_path, monkeypatch) -> None:
    trace_root = tmp_path / "boards" / "tradelab-research" / "logs"
    trace_root.mkdir(parents=True)
    (trace_root / "t_hash.log").write_text("session_id: session-hash\n", encoding="utf-8")
    profiles_root = tmp_path / "profiles"
    profile_log = profiles_root / "tradelab-trend-researcher" / "logs" / "agent.log"
    profile_log.parent.mkdir(parents=True)
    profile_log.write_text(
        "INFO [session-hash] agent.tool_executor: tool kanban_show completed\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(tpo, "WORKER_TRACE_ROOT", trace_root)
    monkeypatch.setattr(tpo, "HERMES_PROFILES_ROOT", profiles_root)

    first_trace = tpo.worker_tool_trace("trend", "t_hash", "tradelab-trend-researcher")
    profile_log.write_text(
        profile_log.read_text(encoding="utf-8")
        + "INFO [session-hash] agent.tool_executor: tool web_extract completed\n",
        encoding="utf-8",
    )
    second_trace = tpo.worker_tool_trace("trend", "t_hash", "tradelab-trend-researcher")

    assert first_trace["sessionId"] == "session-hash"
    assert first_trace["sha256"] != second_trace["sha256"]


def test_worker_trace_rejects_forbidden_profile_tool_with_partial_board_trace(tmp_path, monkeypatch) -> None:
    trace_root = tmp_path / "boards" / "tradelab-research" / "logs"
    trace_root.mkdir(parents=True)
    (trace_root / "t_partial.log").write_text(
        "session_id: session-partial\n  ┊ ⚡ preparing kanban_show…\n",
        encoding="utf-8",
    )
    profiles_root = tmp_path / "profiles"
    profile_log = profiles_root / "tradelab-trend-researcher" / "logs" / "agent.log"
    profile_log.parent.mkdir(parents=True)
    profile_log.write_text(
        "INFO [session-partial] agent.tool_executor: tool read_file completed\n",
        encoding="utf-8",
    )
    monkeypatch.setattr(tpo, "WORKER_TRACE_ROOT", trace_root)
    monkeypatch.setattr(tpo, "HERMES_PROFILES_ROOT", profiles_root)

    with pytest.raises(ValueError, match="forbidden_worker_tool:trend:read_file"):
        tpo.worker_tool_trace("trend", "t_partial", "tradelab-trend-researcher")

import json
import pytest
from agents.tools import tradelab_pilot_ops as tpo
from agents.tools.tradelab_pilot_ops import collect_campaign, freeze_campaign, launch_campaign, verify_campaign, wait_campaign
from agents.tools.tradelab_pilot_controller import TradeLabClient


class FakeTransport:
    def __init__(self):
        self.calls = []

    def __call__(self, method, url, payload=None, timeout=20):
        self.calls.append((method, url))
        if url == "/api/tradelab/datasets/coverage":
            return {"Success": True, "Data": {"items": [{
                "exchange": "binance", "symbol": "BTCUSDT", "timeframe": "1h",
                "health_status": "healthy", "gap_count": 0,
                "covered_start_at": "2020-01-01T00:00:00Z",
                "covered_end_at": "2026-07-01T00:00:00Z",
            }]}}
        return {"Success": True, "Data": {}}


class TerminalRecorder(CapabilityRecorder):
    def __call__(self, command, **kwargs):
        self.commands.append(command)
        if "show" in command:
            return CompletedProcess(command, 0, stdout='{"status":"done"}\n', stderr="")
        if "tools" in command and "list" in command:
            return CompletedProcess(command, 0, stdout=self.toolsets, stderr="")
        return CompletedProcess(command, 0, stdout='{"id":"t_test"}\n', stderr="")


class SequencedStatusRecorder(CapabilityRecorder):
    def __init__(self, statuses):
        super().__init__()
        self.statuses = {task_id: list(values) for task_id, values in statuses.items()}

    def __call__(self, command, **kwargs):
        self.commands.append(command)
        if "show" in command:
            task_id = command[command.index("show") + 1]
            values = self.statuses[task_id]
            status = values.pop(0) if len(values) > 1 else values[0]
            return CompletedProcess(command, 0, stdout=json.dumps({"status": status}), stderr="")
        return super().__call__(command, **kwargs)


def test_freeze_records_selected_agents_and_matching_concurrency(tmp_path) -> None:
    client = TradeLabClient(transport=FakeTransport())
    campaign = freeze_campaign(client, "pilot-1", selected_agents=("trend", "mean-reversion"), root=tmp_path)
    data = json.loads((campaign / "campaign.json").read_text())
    assert data["selectedAgents"] == ["trend", "mean-reversion"]
    assert data["dispatchConcurrency"] == 2
    assert set(data["agents"]) == {"trend", "mean-reversion"}


def test_freeze_rejects_reselection(tmp_path) -> None:
    client = TradeLabClient(transport=FakeTransport())
    freeze_campaign(client, "pilot-2", selected_agents=("trend",), root=tmp_path)
    with pytest.raises(ValueError, match="cannot_change_selection"):
        freeze_campaign(client, "pilot-2", selected_agents=("breakout",), root=tmp_path)


def test_launch_dispatches_exact_selected_count_and_is_idempotent(tmp_path) -> None:
    client = TradeLabClient(transport=FakeTransport())
    campaign_path = freeze_campaign(client, "pilot-3", selected_agents=("trend", "mean-reversion"), root=tmp_path)
    recorder = CapabilityRecorder()
    task_ids = launch_campaign(campaign_path, recorder)
    assert set(task_ids) == {"trend", "mean-reversion"}
    dispatch_cmd = [c for c in recorder.commands if "dispatch" in c]
    assert any("2" in cmd for cmd in dispatch_cmd)
    create_cmd = next(cmd for cmd in recorder.commands if "--max-retries" in cmd)
    assert ["--max-retries", "3"] == create_cmd[create_cmd.index("--max-retries"):create_cmd.index("--max-retries") + 2]
    task_ids2 = launch_campaign(campaign_path, recorder)
    assert task_ids == task_ids2


def test_launch_persists_exact_resolved_toolset_receipt(tmp_path) -> None:
    client = TradeLabClient(transport=FakeTransport())
    campaign_path = freeze_campaign(client, "pilot-tools", selected_agents=("trend",), root=tmp_path)

    launch_campaign(campaign_path, CapabilityRecorder())

    receipt = json.loads((campaign_path / "task-receipts.json").read_text())
    assert receipt["capabilities"]["trend"]["enabledToolsets"] == ["tradelab_research", "web"]


def test_launch_updates_campaign_atomically(tmp_path, monkeypatch) -> None:
    client = TradeLabClient(transport=FakeTransport())
    campaign_path = freeze_campaign(client, "pilot-atomic", selected_agents=("trend",), root=tmp_path)
    written_paths = []
    original_write = tpo._write_json_atomic

    def record_write(path, payload):
        written_paths.append(path)
        original_write(path, payload)

    monkeypatch.setattr(tpo, "_write_json_atomic", record_write)
    launch_campaign(campaign_path, CapabilityRecorder())

    assert campaign_path / "campaign.json" in written_paths


def test_controller_parent_evidence_comparison_requires_full_immutable_record() -> None:
    stored = {
        "sourceHash": "source",
        "policyHash": "policy",
        "normalizedEvidence": {"run": {"id": "run-1"}},
        "integrityChecks": {"run_id": "run-1", "status": "verified"},
        "gateResults": {"risk": True},
        "controllerVerdict": "RESEARCH_CANDIDATE",
    }
    fresh = dict(stored)

    assert tpo._controller_evidence_matches(stored, fresh)
    fresh["policyHash"] = "changed"
    assert not tpo._controller_evidence_matches(stored, fresh)


def test_launch_blocks_unexpected_resolved_toolset(tmp_path) -> None:
    client = TradeLabClient(transport=FakeTransport())
    campaign_path = freeze_campaign(client, "pilot-unsafe", selected_agents=("trend",), root=tmp_path)
    unsafe_toolsets = SAFE_TOOLSETS.replace("Plugin toolsets", "  ✓ enabled  file  File Operations\nPlugin toolsets")
    recorder = CapabilityRecorder(unsafe_toolsets)

    with pytest.raises(ValueError, match="worker_capability_mismatch:trend:file"):
        launch_campaign(campaign_path, recorder)

    assert not any("dispatch" in command for command in recorder.commands)


def test_collect_blocks_malformed_controller_artifact(tmp_path) -> None:
    client = TradeLabClient(transport=FakeTransport())
    campaign_path = freeze_campaign(client, "pilot-corrupt", selected_agents=("trend",), root=tmp_path)
    (campaign_path / "trend" / "accepted-trials.jsonl").write_text('not-json\n', encoding="utf-8")

    with pytest.raises(ValueError, match="artifact_corruption:trend:malformed_jsonl:accepted-trials.jsonl:1"):
        collect_campaign(campaign_path, client, CapabilityRecorder())


def test_collect_records_hashes_for_controller_owned_artifacts(tmp_path) -> None:
    client = TradeLabClient(transport=FakeTransport())
    campaign_path = freeze_campaign(client, "pilot-hashes", selected_agents=("trend",), root=tmp_path)
    accepted = campaign_path / "trend" / "accepted-trials.jsonl"
    accepted.write_text('{"runId":"run-1","timestamp":"2026-07-24T00:00:00Z"}\n', encoding="utf-8")

    collect_campaign(campaign_path, client, CapabilityRecorder())

    collection = json.loads((campaign_path / "collection-receipts.json").read_text(encoding="utf-8"))
    assert collection["campaignId"] == "pilot-hashes"
    assert collection["artifactHashes"]["trend"]["accepted-trials.jsonl"]


def test_verifier_uses_frozen_trial_budget(tmp_path, monkeypatch) -> None:
    client = TradeLabClient(transport=FakeTransport())
    campaign_path = freeze_campaign(client, "pilot-one", selected_agents=("trend",), max_trials=1, root=tmp_path)
    campaign = json.loads((campaign_path / "campaign.json").read_text())
    campaign["agents"]["trend"]["taskId"] = "t_test"
    (campaign_path / "campaign.json").write_text(json.dumps(campaign), encoding="utf-8")
    accepted = campaign_path / "trend" / "accepted-trials.jsonl"
    accepted.write_text(
        '{"runId":"run-1","timestamp":"2026-07-24T00:00:00Z"}\n'
        '{"runId":"run-2","timestamp":"2026-07-24T00:01:00Z"}\n',
        encoding="utf-8",
    )
    trace_root = tmp_path / "logs"
    trace_root.mkdir()
    (trace_root / "t_test.log").write_text("  ┊ ⚡ preparing tradelab_research_status…\n", encoding="utf-8")
    monkeypatch.setattr(tpo, "WORKER_TRACE_ROOT", trace_root)

    with pytest.raises(ValueError, match="exceeded max trial budget of 1"):
        verify_campaign(campaign_path, client, TerminalRecorder())


def test_verifier_blocks_forbidden_worker_tool_trace(tmp_path, monkeypatch) -> None:
    client = TradeLabClient(transport=FakeTransport())
    campaign_path = freeze_campaign(client, "pilot-trace", selected_agents=("trend",), root=tmp_path)
    campaign = json.loads((campaign_path / "campaign.json").read_text())
    campaign["agents"]["trend"]["taskId"] = "t_trace"
    (campaign_path / "campaign.json").write_text(json.dumps(campaign), encoding="utf-8")
    trace_root = tmp_path / "logs"
    trace_root.mkdir()
    (trace_root / "t_trace.log").write_text("  ┊ 📖 preparing read_file…\n", encoding="utf-8")
    monkeypatch.setattr(tpo, "WORKER_TRACE_ROOT", trace_root)

    with pytest.raises(ValueError, match="forbidden_worker_tool:trend:read_file"):
        verify_campaign(campaign_path, client, TerminalRecorder())


def test_verifier_blocks_missing_controller_evidence(tmp_path, monkeypatch) -> None:
    client = TradeLabClient(transport=FakeTransport())
    campaign_path = freeze_campaign(client, "pilot-missing-evidence", selected_agents=("trend",), root=tmp_path)
    campaign = json.loads((campaign_path / "campaign.json").read_text())
    campaign["agents"]["trend"]["taskId"] = "t_evidence"
    (campaign_path / "campaign.json").write_text(json.dumps(campaign), encoding="utf-8")
    (campaign_path / "trend" / "accepted-trials.jsonl").write_text(
        '{"runId":"run-1","timestamp":"2026-07-24T00:00:00Z"}\n',
        encoding="utf-8",
    )
    trace_root = tmp_path / "logs"
    trace_root.mkdir()
    (trace_root / "t_evidence.log").write_text("  ┊ ⚡ preparing tradelab_research_status…\n", encoding="utf-8")
    monkeypatch.setattr(tpo, "WORKER_TRACE_ROOT", trace_root)

    with pytest.raises(ValueError, match="missing_controller_evidence:trend:run-1"):
        verify_campaign(campaign_path, client, TerminalRecorder())


def test_verifier_preserves_blocked_controller_terminal_reason(tmp_path, monkeypatch) -> None:
    client = TradeLabClient(transport=FakeTransport())
    campaign_path = freeze_campaign(client, "pilot-blocked-terminal", selected_agents=("trend",), root=tmp_path)
    campaign = json.loads((campaign_path / "campaign.json").read_text())
    campaign["agents"]["trend"]["taskId"] = "t_blocked"
    (campaign_path / "campaign.json").write_text(json.dumps(campaign), encoding="utf-8")
    agent_dir = campaign_path / "trend"
    (agent_dir / "accepted-trials.jsonl").write_text(
        '{"runId":"run-1","timestamp":"2026-07-24T00:00:00Z","manifest":{}}\n',
        encoding="utf-8",
    )
    (agent_dir / "controller-evidence.jsonl").write_text('{"runId":"run-1"}\n', encoding="utf-8")
    (agent_dir / "agent-summary.json").write_text(
        '{"terminalReason":"blocked_repeated_manifest_rejection"}\n',
        encoding="utf-8",
    )
    (campaign_path / "runtime-evidence.json").write_text(
        '{"selectedAgents":["trend"]}\n',
        encoding="utf-8",
    )
    trace_root = tmp_path / "logs"
    trace_root.mkdir()
    (trace_root / "t_blocked.log").write_text("  ┊ ⚡ preparing tradelab_research_status…\n", encoding="utf-8")
    monkeypatch.setattr(tpo, "WORKER_TRACE_ROOT", trace_root)
    monkeypatch.setattr(
        tpo,
        "verify_run",
        lambda *args: tpo.VerifiedEvidence(
            evidence_ok=True,
            failed_reasons=(),
            run_id="run-1",
            dataset_fingerprint="dataset",
            metrics={},
            integrity_checks={"warningLogs": [], "errorLogs": []},
            gate_results={"closed_trades_ok": False},
        ),
    )
    monkeypatch.setattr(tpo, "_controller_evidence_matches", lambda *args: True)

    verify_campaign(campaign_path, client, TerminalRecorder())

    assert json.loads((campaign_path / "verdicts.json").read_text())["trend"] == "BLOCKED"

def test_wait_keeps_sibling_running_after_other_family_fails(tmp_path) -> None:
    client = TradeLabClient(transport=FakeTransport())
    campaign_path = freeze_campaign(client, "pilot-crash", selected_agents=("trend", "mean-reversion"), root=tmp_path)
    campaign = json.loads((campaign_path / "campaign.json").read_text())
    campaign["agents"]["trend"]["taskId"] = "t_trend"
    campaign["agents"]["mean-reversion"]["taskId"] = "t_mean"
    (campaign_path / "campaign.json").write_text(json.dumps(campaign), encoding="utf-8")
    recorder = SequencedStatusRecorder({
        "t_trend": ["failed"],
        "t_mean": ["running", "done"],
    })

    statuses = wait_campaign(campaign_path, recorder, timeout_seconds=1, sleep=lambda _: None)

    assert statuses == {"trend": "failed", "mean-reversion": "done"}
    assert sum("show" in command and "t_mean" in command for command in recorder.commands) == 2

def test_wait_persists_claim_spawn_and_overlap_evidence(tmp_path) -> None:
    client = TradeLabClient(transport=FakeTransport())
    campaign_path = freeze_campaign(client, "pilot-runtime", selected_agents=("trend", "mean-reversion"), root=tmp_path)
    campaign = json.loads((campaign_path / "campaign.json").read_text())
    campaign["runtime"] = {"dispatchRequestedAt": 100}
    campaign["agents"]["trend"]["taskId"] = "t_trend"
    campaign["agents"]["mean-reversion"]["taskId"] = "t_mean"
    (campaign_path / "campaign.json").write_text(json.dumps(campaign), encoding="utf-8")

    timings = {
        "t_trend": {"created_at": 101, "started_at": 103, "completed_at": 180},
        "t_mean": {"created_at": 102, "started_at": 104, "completed_at": 170},
    }

    def timed_recorder(command, **kwargs):
        task_id = command[command.index("show") + 1]
        timing = timings[task_id]
        return CompletedProcess(
            command,
            0,
            stdout=json.dumps({
                "task": {"id": task_id, "status": "done", **timing},
                "events": [
                    {"kind": "claimed", "created_at": timing["started_at"]},
                    {"kind": "spawned", "created_at": timing["started_at"]},
                ],
            }),
            stderr="",
        )

    assert wait_campaign(campaign_path, timed_recorder, sleep=lambda _: None) == {
        "trend": "done",
        "mean-reversion": "done",
    }

    runtime = json.loads((campaign_path / "runtime-evidence.json").read_text())
    assert runtime["allClaimedAndSpawnedWithin15Seconds"] is True
    assert runtime["overlapSeconds"] == 66
    assert runtime["overlapAtLeast30Seconds"] is True

def test_wait_uses_blocked_event_as_terminal_time(tmp_path) -> None:
    client = TradeLabClient(transport=FakeTransport())
    campaign_path = freeze_campaign(client, "pilot-blocked-runtime", selected_agents=("trend", "mean-reversion"), root=tmp_path)
    campaign = json.loads((campaign_path / "campaign.json").read_text())
    campaign["runtime"] = {"dispatchRequestedAt": 100}
    campaign["agents"]["trend"]["taskId"] = "t_trend"
    campaign["agents"]["mean-reversion"]["taskId"] = "t_mean"
    (campaign_path / "campaign.json").write_text(json.dumps(campaign), encoding="utf-8")

    def blocked_recorder(command, **kwargs):
        task_id = command[command.index("show") + 1]
        if task_id == "t_trend":
            task = {"id": task_id, "status": "done", "created_at": 101, "started_at": 103, "completed_at": 180}
            terminal_event = {"kind": "completed", "created_at": 180}
        else:
            task = {"id": task_id, "status": "blocked", "created_at": 102, "started_at": 104, "completed_at": None}
            terminal_event = {"kind": "blocked", "created_at": 170}
        return CompletedProcess(
            command,
            0,
            stdout=json.dumps({
                "task": task,
                "events": [
                    {"kind": "claimed", "created_at": task["started_at"]},
                    {"kind": "spawned", "created_at": task["started_at"]},
                    terminal_event,
                ],
            }),
            stderr="",
        )

    wait_campaign(campaign_path, blocked_recorder, sleep=lambda _: None)

    runtime = json.loads((campaign_path / "runtime-evidence.json").read_text())
    assert runtime["tasks"]["mean-reversion"]["completedAt"] == 170
    assert runtime["overlapSeconds"] == 66
    assert runtime["overlapAtLeast30Seconds"] is True

def test_smoke_uses_wait_campaign_for_runtime_evidence(tmp_path, monkeypatch) -> None:
    calls = []
    monkeypatch.setattr(tpo, "setup_profiles", lambda *args: None)
    monkeypatch.setattr(tpo, "freeze_campaign", lambda *args, **kwargs: tmp_path)
    monkeypatch.setattr(tpo, "launch_campaign", lambda *args: {"trend": "t_smoke"})
    monkeypatch.setattr(tpo, "wait_campaign", lambda *args: calls.append(args) or {"trend": "done"})
    monkeypatch.setattr(tpo, "collect_campaign", lambda *args: tmp_path / "campaign-summary.json")
    monkeypatch.setattr(tpo, "verify_campaign", lambda *args: {"status": "verified"})
    (tmp_path / "verdicts.json").write_text('{"trend":"NO_CANDIDATE_WITHIN_BUDGET"}\n', encoding="utf-8")
    monkeypatch.setattr(
        tpo.subprocess,
        "run",
        lambda command, **kwargs: CompletedProcess(command, 0, stdout='{"status":"done"}', stderr=""),
    )

    assert tpo.main(["smoke"]) == 0
    assert calls and calls[0][0] == tmp_path
