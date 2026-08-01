from agents.tools.tradelab_research_contract import (
    append_trial_log_entry,
    build_blocked_note,
    build_blocked_report,
    build_completed_report,
    verify_evidence,
)


def test_verify_evidence_flags_metric_mismatch() -> None:
    summary = verify_evidence(
        api_status="completed",
        api_metrics={"totalReturnPct": "8.20", "profitFactor": "1.45"},
        artifact_metrics={"totalReturnPct": "8.20", "profitFactor": "0.00"},
    )

    assert summary.overall_passed is False
    assert summary.failed_reasons == ["Artifact metric mismatch: profitFactor"]


def test_completed_report_includes_not_verified_and_improvements() -> None:
    report = build_completed_report(
        strategy_description="EMA Cross 9/21",
        gate_results=["monthly_return: PASS", "profit_factor: PASS"],
        backend_checks=["API run status = completed"],
        artifact_checks=["Report metrics matched API metrics"],
        improvements=[
            (
                "ui/ux",
                "Run detail required extra clicks from the trial log.",
                "Add a direct run-detail shortcut from the research trial log.",
            )
        ],
        not_verified=["Stress-cost realism beyond configured fee/slippage inputs."],
    )

    assert "**Final Status:** COMPLETED" in report
    assert "## Improvement Suggestions" in report
    assert "## Not Verified" in report
    assert "Add a direct run-detail shortcut" in report


def test_blocked_report_and_note_include_recovery_details() -> None:
    report = build_blocked_report(
        blocker_reason="Artifact metric mismatch: profitFactor",
        trusted_findings=["Validation run completed and API result remained readable."],
        untrusted_findings=["Rendered report profit factor disagreed with API result."],
        recovery_summary="Restarted the affected runtime once and reran once; mismatch remained.",
        improvements=[
            (
                "reporting",
                "Profit factor None was rendered as 0.00.",
                "Render missing profit factor as N/A instead of 0.00.",
            )
        ],
        not_verified=["Whether futures stress costs are applied in the current engine path."],
    )
    note = build_blocked_note(
        blocker_reason="Artifact metric mismatch: profitFactor",
        triggering_evidence="API profitFactor=1.45 while report profitFactor=0.00.",
        recovery_summary="Restarted the affected runtime once and reran once; mismatch remained.",
        final_reason="The session could not continue trustworthily after the single allowed recovery.",
    )

    assert "**Final Status:** BLOCKED" in report
    assert "## Trusted Before Stop" in report
    assert "## Not Verified" in report
    assert "# Research Session Blocked" in note
    assert "API profitFactor=1.45" in note


def test_trial_log_keeps_failed_strategy_attempt(tmp_path) -> None:
    trial_log_path = tmp_path / "trial-log.md"

    append_trial_log_entry(
        trial_log_path=trial_log_path,
        strategy_description="EMA Cross 9/21",
        status="failed_gates",
        key_metrics=["monthly_return: 2.1%", "profit_factor: 1.05"],
        runtime_notes=[],
    )

    text = trial_log_path.read_text(encoding="utf-8")
    assert "EMA Cross 9/21" in text
    assert "failed_gates" in text


def test_trial_log_keeps_infrastructure_interruption(tmp_path) -> None:
    trial_log_path = tmp_path / "trial-log.md"

    append_trial_log_entry(
        trial_log_path=trial_log_path,
        strategy_description="BB Reversion 20/2.0",
        status="interrupted",
        key_metrics=[],
        runtime_notes=["AppHost restart required before rerun."],
    )

    text = trial_log_path.read_text(encoding="utf-8")
    assert "BB Reversion 20/2.0" in text
    assert "interrupted" in text
    assert "AppHost restart required before rerun." in text
