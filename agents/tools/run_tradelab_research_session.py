from __future__ import annotations

import json
import sys
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from agents.tools.tradelab_research_contract import (
    build_blocked_note,
    build_blocked_report,
    build_completed_report,
)


def determine_next_action(*, evidence_ok: bool, gates_passed: bool) -> dict[str, str]:
    if not evidence_ok:
        return {"nextAction": "blocked", "reason": "evidence_contract_failed"}
    if gates_passed:
        return {"nextAction": "completed", "reason": "all_required_gates_passed"}
    return {"nextAction": "continue", "reason": "required_gates_failed"}


def finalize_completed_session(
    *,
    report_path: Path,
    strategy_description: str,
    gate_results: list[str],
    backend_checks: list[str],
    artifact_checks: list[str],
    improvements: list[tuple[str, str, str]],
    not_verified: list[str],
) -> None:
    report_path.write_text(
        build_completed_report(
            strategy_description=strategy_description,
            gate_results=gate_results,
            backend_checks=backend_checks,
            artifact_checks=artifact_checks,
            improvements=improvements,
            not_verified=not_verified,
        ),
        encoding="utf-8",
    )


def finalize_blocked_session(
    *,
    report_path: Path,
    blocked_path: Path,
    blocker_reason: str,
    trusted_findings: list[str],
    untrusted_findings: list[str],
    recovery_summary: str,
    improvements: list[tuple[str, str, str]],
    not_verified: list[str],
) -> None:
    report_path.write_text(
        build_blocked_report(
            blocker_reason=blocker_reason,
            trusted_findings=trusted_findings,
            untrusted_findings=untrusted_findings,
            recovery_summary=recovery_summary,
            improvements=improvements,
            not_verified=not_verified,
        ),
        encoding="utf-8",
    )
    blocked_path.write_text(
        build_blocked_note(
            blocker_reason=blocker_reason,
            triggering_evidence="See report.md trusted/untrusted evidence sections.",
            recovery_summary=recovery_summary,
            final_reason="The session could not continue trustworthily after the single allowed recovery.",
        ),
        encoding="utf-8",
    )


def main() -> None:
    payload_text = sys.stdin.read().lstrip("\ufeff").lstrip("ï»¿").strip()
    if not payload_text:
        raise SystemExit("Expected JSON payload on stdin")
    payload = json.loads(payload_text)
    action = determine_next_action(
        evidence_ok=payload["evidenceOk"],
        gates_passed=payload["gatesPassed"],
    )
    print(json.dumps(action))


if __name__ == "__main__":
    main()
