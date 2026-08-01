from __future__ import annotations

from pathlib import Path
from uuid import UUID

from tradelab_api.db.models import StrategyVersion
from tradelab_api.services.strategy_validator import (
    apply_validation_result,
    validate_strategy_source,
)


FIXTURE_PATH = Path(__file__).resolve().parent / "fixtures" / "sma_9_21_long_only_strategy.py"


def test_valid_strategy_passes_validation() -> None:
    result = validate_strategy_source(FIXTURE_PATH.read_text(encoding="utf-8"))

    assert result.is_valid is True
    assert result.validation_status == "valid"
    assert result.message is None


def test_missing_on_candle_fails_validation() -> None:
    result = validate_strategy_source("def other(ctx):\n    return []\n")

    assert result.is_valid is False
    assert result.validation_status == "invalid"
    assert "on_candle" in (result.message or "")


def test_syntax_error_reports_line_and_column() -> None:
    result = validate_strategy_source("def on_candle(ctx)\n    return []\n")

    assert result.is_valid is False
    assert result.line == 1
    assert result.column is not None
    assert "Syntax error" in (result.message or "")


def test_blocked_import_is_rejected() -> None:
    result = validate_strategy_source("import os\n\ndef on_candle(ctx):\n    return []\n")

    assert result.is_valid is False
    assert result.blocked_imports == ["os"]
    assert "Blocked import" in (result.message or "")


def test_validation_result_updates_version_model() -> None:
    version = StrategyVersion(
        strategy_id=UUID("00000000-0000-0000-0000-000000000000"),
        version_number=1,
        source_code="def on_candle(ctx):\n    return []\n",
        source_hash="abc",
        validation_status="draft",
        validation_message=None,
    )

    result = validate_strategy_source(version.source_code)
    apply_validation_result(version, result)

    assert version.validation_status == "valid"
    assert version.validation_message is None
