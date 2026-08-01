from pathlib import Path


PROMPT = Path("docs/runbooks/tradelab-research-prompt.md").read_text(encoding="utf-8")


def test_prompt_uses_completed_and_blocked_only() -> None:
    assert "COMPLETED" in PROMPT
    assert "BLOCKED" in PROMPT
    assert "Successful Backtest Candidate" not in PROMPT
    assert "Best Available Candidate - Target Not Met" not in PROMPT
    assert "No Credible Candidate Found" not in PROMPT


def test_prompt_requires_evidence_checks_and_not_verified() -> None:
    assert "backend/API proof" in PROMPT
    assert "artifact consistency" in PROMPT
    assert "including UI/UX, workflow, and reporting issues when observed" in PROMPT
    assert "Not Verified" in PROMPT


def test_prompt_requires_current_artifact_contract() -> None:
    assert "execution.md" in PROMPT
    assert "trial-log.md" in PROMPT
    assert "blocked.md" in PROMPT
    assert "Keep `execution.md` updated as the durable live execution state for the session" in PROMPT


def test_prompt_forbids_repair_work_inside_research_session() -> None:
    assert "Report bugs and improvement opportunities, but do not fix them" in PROMPT
    assert "attempt only the single allowed recovery" in PROMPT
    assert "Do not mutate engine, dispatcher, reporting, or prompt logic during the session" in PROMPT


def test_prompt_preserves_existing_research_boundary_rules() -> None:
    assert "USD_M_FUTURES" in PROMPT
    assert "UI-FIRST EXECUTION RULE" in PROMPT
    assert "STRICT SAFETY BOUNDARY" in PROMPT
    assert "DATA DISCOVERY & DATA FILL" in PROMPT
    assert "DATA SPLIT PROTOCOL" in PROMPT
    assert "stress test cost scenario" in PROMPT


def test_prompt_removes_best_available_fallback_from_scorecard() -> None:
    assert "best available candidate" not in PROMPT


def test_prompt_uses_placeholders_instead_of_stale_hardcoded_inputs() -> None:
    assert "Starting capital: `<STARTING_CAPITAL>`" in PROMPT
    assert "Monthly target: `<MONTHLY_TARGET>`" in PROMPT
    assert "Starting capital: 100" not in PROMPT
    assert "Monthly target: 5%" not in PROMPT
    assert "End at: 2026-06-16" not in PROMPT
