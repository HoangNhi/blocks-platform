from pathlib import Path

from agents.tools.run_tradelab_research_session import (
    determine_next_action,
    finalize_blocked_session,
    finalize_completed_session,
)


def test_determine_next_action_returns_continue_for_trustworthy_failures() -> None:
    action = determine_next_action(evidence_ok=True, gates_passed=False)
    assert action == {"nextAction": "continue", "reason": "required_gates_failed"}


def test_determine_next_action_returns_completed_for_exact_pass() -> None:
    action = determine_next_action(evidence_ok=True, gates_passed=True)
    assert action == {"nextAction": "completed", "reason": "all_required_gates_passed"}


def test_finalize_blocked_session_writes_report_and_note(tmp_path: Path) -> None:
    report_path = tmp_path / "report.md"
    blocked_path = tmp_path / "blocked.md"

    finalize_blocked_session(
        report_path=report_path,
        blocked_path=blocked_path,
        blocker_reason="Artifact metric mismatch: profitFactor",
        trusted_findings=["Validation run completed and API result remained readable."],
        untrusted_findings=["Rendered report profit factor disagreed with API result."],
        recovery_summary="Restarted AppHost once and reran once; mismatch remained.",
        improvements=[],
        not_verified=["Whether futures stress costs are applied in the current engine path."],
    )

    assert "**Final Status:** BLOCKED" in report_path.read_text(encoding="utf-8")
    assert blocked_path.exists()


def test_finalize_completed_session_writes_report_only(tmp_path: Path) -> None:
    report_path = tmp_path / "report.md"
    blocked_path = tmp_path / "blocked.md"

    finalize_completed_session(
        report_path=report_path,
        strategy_description="EMA Cross 9/21",
        gate_results=["monthly_return: PASS", "profit_factor: PASS"],
        backend_checks=["API run status = completed"],
        artifact_checks=["Report metrics matched API metrics"],
        improvements=[],
        not_verified=["Stress-cost realism beyond configured fee/slippage inputs."],
    )

    assert "**Final Status:** COMPLETED" in report_path.read_text(encoding="utf-8")
    assert not blocked_path.exists()


def test_blocked_flow_keeps_untrusted_result_out_of_completed_report(tmp_path: Path) -> None:
    report_path = tmp_path / "report.md"
    blocked_path = tmp_path / "blocked.md"

    finalize_blocked_session(
        report_path=report_path,
        blocked_path=blocked_path,
        blocker_reason="API run status was running, expected completed",
        trusted_findings=["Trial log row was written before the stop."],
        untrusted_findings=["Run detail never reached a completed API state."],
        recovery_summary="Restarted AppHost once and reran once; API state stayed inconsistent.",
        improvements=[],
        not_verified=["Gate results for the interrupted run."],
    )

    text = report_path.read_text(encoding="utf-8")
    assert "**Final Status:** BLOCKED" in text
    assert "## Passing Strategy" not in text


def test_completed_flow_keeps_blocked_note_absent(tmp_path: Path) -> None:
    report_path = tmp_path / "report.md"
    blocked_path = tmp_path / "blocked.md"

    finalize_completed_session(
        report_path=report_path,
        strategy_description="BB Reversion 20/2.0",
        gate_results=["monthly_return: PASS", "profit_factor: PASS", "liquidation_count: PASS"],
        backend_checks=["API run status = completed", "API metrics read succeeded"],
        artifact_checks=["Trial log metrics matched API metrics", "Report metrics matched API metrics"],
        improvements=[],
        not_verified=["Live or paper readiness is intentionally out of scope."],
    )

    assert "**Final Status:** COMPLETED" in report_path.read_text(encoding="utf-8")
    assert blocked_path.exists() is False
