from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(slots=True)
class EvidenceSummary:
    overall_passed: bool
    failed_reasons: list[str]


def build_trial_log_entry(
    *,
    strategy_description: str,
    status: str,
    key_metrics: list[str],
    runtime_notes: list[str],
) -> str:
    lines = [
        "## Trial Entry",
        "",
        f"- Strategy: {strategy_description}",
        f"- Status: {status}",
        "",
        "- Key metrics:",
    ]
    if key_metrics:
        lines.extend([f"  - {item}" for item in key_metrics])
    else:
        lines.append("  - none recorded")

    lines.extend(["", "- Runtime notes:"])
    if runtime_notes:
        lines.extend([f"  - {item}" for item in runtime_notes])
    else:
        lines.append("  - none recorded")

    return "\n".join(lines) + "\n"


def append_trial_log_entry(
    *,
    trial_log_path: Path,
    strategy_description: str,
    status: str,
    key_metrics: list[str],
    runtime_notes: list[str],
) -> None:
    entry = build_trial_log_entry(
        strategy_description=strategy_description,
        status=status,
        key_metrics=key_metrics,
        runtime_notes=runtime_notes,
    )
    trial_log_path.parent.mkdir(parents=True, exist_ok=True)
    is_existing = trial_log_path.exists() and trial_log_path.stat().st_size > 0
    with trial_log_path.open("a", encoding="utf-8") as handle:
        if is_existing:
            handle.write("\n")
        handle.write(entry)


def verify_evidence(*, api_status: str, api_metrics: dict[str, str], artifact_metrics: dict[str, str]) -> EvidenceSummary:
    failed_reasons: list[str] = []
    if api_status != "completed":
        failed_reasons.append(f"API run status was {api_status}, expected completed")
    for key, api_value in api_metrics.items():
        artifact_value = artifact_metrics.get(key)
        if artifact_value != api_value:
            failed_reasons.append(f"Artifact metric mismatch: {key}")
    return EvidenceSummary(overall_passed=not failed_reasons, failed_reasons=failed_reasons)


def build_completed_report(
    *,
    strategy_description: str,
    gate_results: list[str],
    backend_checks: list[str],
    artifact_checks: list[str],
    improvements: list[tuple[str, str, str]],
    not_verified: list[str],
) -> str:
    lines = [
        "# TradeLab Research Report",
        "",
        "**Final Status:** COMPLETED",
        "",
        "## Passing Strategy",
        f"- {strategy_description}",
        "",
        "## Gate Results",
        *[f"- {item}" for item in gate_results],
        "",
        "## Backend/API Proof",
        *[f"- {item}" for item in backend_checks],
        "",
        "## Artifact Consistency",
        *[f"- {item}" for item in artifact_checks],
    ]
    if improvements:
        lines.extend(["", "## Improvement Suggestions"])
        for area, evidence, suggestion in improvements:
            lines.extend([f"- {area}: {evidence}", f"- Suggestion: {suggestion}"])
    lines.extend(["", "## Not Verified", *[f"- {item}" for item in not_verified]])
    return "\n".join(lines) + "\n"


def build_blocked_report(
    *,
    blocker_reason: str,
    trusted_findings: list[str],
    untrusted_findings: list[str],
    recovery_summary: str,
    improvements: list[tuple[str, str, str]],
    not_verified: list[str],
) -> str:
    lines = [
        "# TradeLab Research Report",
        "",
        "**Final Status:** BLOCKED",
        "",
        "## Stop Reason",
        f"- {blocker_reason}",
        "",
        "## Trusted Before Stop",
        *[f"- {item}" for item in trusted_findings],
        "",
        "## Untrusted After Stop",
        *[f"- {item}" for item in untrusted_findings],
        "",
        "## Recovery Attempt",
        f"- {recovery_summary}",
    ]
    if improvements:
        lines.extend(["", "## Improvement Suggestions"])
        for area, evidence, suggestion in improvements:
            lines.extend([f"- {area}: {evidence}", f"- Suggestion: {suggestion}"])
    lines.extend(["", "## Not Verified", *[f"- {item}" for item in not_verified]])
    return "\n".join(lines) + "\n"


def build_blocked_note(
    *,
    blocker_reason: str,
    triggering_evidence: str,
    recovery_summary: str,
    final_reason: str,
) -> str:
    return "\n".join(
        [
            "# Research Session Blocked",
            "",
            f"- Blocker: {blocker_reason}",
            f"- Triggering evidence: {triggering_evidence}",
            f"- Recovery attempt: {recovery_summary}",
            f"- Final reason: {final_reason}",
            "",
        ]
    )
