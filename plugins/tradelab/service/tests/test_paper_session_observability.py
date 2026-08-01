from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest

from tradelab_api.services.paper_session_observability import (
    MAX_PAPER_SESSION_OBSERVABILITY_LIMIT,
    PaperSessionObservabilityValidationError,
    build_paper_session_observability,
)


def _dt(hour: int, minute: int = 0) -> datetime:
    return datetime(2026, 1, 1, hour, minute, tzinfo=timezone.utc)


def _session(
    *,
    session_id: UUID | None = None,
    strategy_id: UUID | None = None,
    strategy_version_id: UUID | None = None,
    dataset_key: str = "binance:BTCUSDT:1h",
    status: str = "completed",
    reason_code: str | None = "paper_engine_completed",
    error_message: str | None = None,
    created_minute: int = 1,
    gate_context: dict[str, object] | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=session_id or uuid4(),
        bot_id=uuid4(),
        strategy_id=strategy_id or uuid4(),
        strategy_version_id=strategy_version_id or uuid4(),
        status=status,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        dataset_key=dataset_key,
        start_at=_dt(0),
        end_at=_dt(2),
        started_at=_dt(0, 2) if status in {"running", "completed", "failed"} else None,
        finished_at=_dt(0, 5) if status in {"completed", "failed", "cancelled"} else None,
        reason_code=reason_code,
        error_message=error_message,
        gate_context=gate_context or {},
        created_at=_dt(0, created_minute),
    )


def _audit(session_id: UUID, action: str, reason_code: str | None, minute: int) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        paper_session_id=session_id,
        event_at=_dt(0, minute),
        action=action,
        reason_code=reason_code,
        new_state="completed",
        actor="local-worker",
        metadata_={"safe": "visible", "apiKey": "SECRET-WAS-HERE"},
    )


class FakePaperRepository:
    def __init__(
        self,
        sessions: list[SimpleNamespace],
        latest_audit: dict[UUID, SimpleNamespace | None] | None = None,
    ) -> None:
        self.sessions = sessions
        self.latest_audit = latest_audit or {}
        self.filters: dict[str, object] | None = None
        self.count_calls: list[tuple[str, UUID]] = []
        self.write_called = False

    def list_paper_sessions(
        self,
        *,
        strategy_id: UUID | None,
        strategy_version_id: UUID | None,
        dataset_key: str | None,
        status: str | None,
        limit: int,
    ) -> list[SimpleNamespace]:
        self.filters = {
            "strategy_id": strategy_id,
            "strategy_version_id": strategy_version_id,
            "dataset_key": dataset_key,
            "status": status,
            "limit": limit,
        }
        rows = list(self.sessions)
        if strategy_id is not None:
            rows = [row for row in rows if row.strategy_id == strategy_id]
        if strategy_version_id is not None:
            rows = [row for row in rows if row.strategy_version_id == strategy_version_id]
        if dataset_key is not None:
            rows = [row for row in rows if row.dataset_key == dataset_key]
        if status is not None:
            rows = [row for row in rows if row.status == status]
        return sorted(rows, key=lambda row: row.created_at, reverse=True)[:limit]

    def count_orders_for_session(self, session_id: UUID) -> int:
        self.count_calls.append(("orders", session_id))
        return 2

    def count_fills_for_session(self, session_id: UUID) -> int:
        self.count_calls.append(("fills", session_id))
        return 1

    def count_positions_for_session(self, session_id: UUID) -> int:
        self.count_calls.append(("positions", session_id))
        return 1

    def count_portfolio_snapshots_for_session(self, session_id: UUID) -> int:
        self.count_calls.append(("portfolio_snapshots", session_id))
        return 3

    def count_audit_events_for_session(self, session_id: UUID) -> int:
        self.count_calls.append(("audit_events", session_id))
        return 4

    def get_latest_audit_event_for_session(self, session_id: UUID):
        return self.latest_audit.get(session_id)

    def create_audit_event(self, **fields):
        self.write_called = True
        raise AssertionError("Observability must not write audit events.")


def test_observability_returns_sorted_filtered_summaries_with_counts_and_latest_audit() -> None:
    strategy_id = uuid4()
    version_id = uuid4()
    older = _session(strategy_id=strategy_id, strategy_version_id=version_id, created_minute=1)
    latest = _session(strategy_id=strategy_id, strategy_version_id=version_id, created_minute=3)
    other = _session(created_minute=4)
    repository = FakePaperRepository(
        [older, latest, other],
        latest_audit={latest.id: _audit(latest.id, "paper_session_completed", "paper_engine_completed", 5)},
    )

    result = build_paper_session_observability(
        repository,
        strategy_id=str(strategy_id),
        strategy_version_id=str(version_id),
        dataset_key="binance:BTCUSDT:1h",
        status="completed",
        limit=5,
    )

    assert result.safety_status == "read_only_paper_session_observability"
    assert [item.session_id for item in result.items] == [str(latest.id), str(older.id)]
    assert result.items[0].artifact_counts.orders == 2
    assert result.items[0].artifact_counts.fills == 1
    assert result.items[0].artifact_counts.portfolio_snapshots == 3
    assert result.items[0].artifact_counts.audit_events == 4
    assert result.items[0].latest_audit is not None
    assert result.items[0].latest_audit.action == "paper_session_completed"
    assert result.items[0].latest_audit.reason_code == "paper_engine_completed"
    assert repository.filters == {
        "strategy_id": strategy_id,
        "strategy_version_id": version_id,
        "dataset_key": "binance:BTCUSDT:1h",
        "status": "completed",
        "limit": 5,
    }
    assert repository.write_called is False


def test_observability_clamps_limit_and_reports_empty_results() -> None:
    repository = FakePaperRepository([])

    result = build_paper_session_observability(repository, limit=999)

    assert result.items == []
    assert result.has_more is False
    assert repository.filters is not None
    assert repository.filters["limit"] == MAX_PAPER_SESSION_OBSERVABILITY_LIMIT


def test_observability_rejects_invalid_filters_with_machine_readable_reason() -> None:
    repository = FakePaperRepository([])

    with pytest.raises(PaperSessionObservabilityValidationError) as exc_info:
        build_paper_session_observability(repository, strategy_id="not-a-uuid", status="completed")

    assert exc_info.value.status_code == 400
    assert exc_info.value.reason_code == "paper_session_observability_invalid_filter"
    assert exc_info.value.details["filter"] == "strategyId"

    with pytest.raises(PaperSessionObservabilityValidationError) as status_exc:
        build_paper_session_observability(repository, status="retry")

    assert status_exc.value.status_code == 400
    assert status_exc.value.reason_code == "paper_session_observability_invalid_filter"
    assert "completed" in status_exc.value.details["allowedStatuses"]


def test_observability_prefers_session_reason_and_summarizes_blocked_gates() -> None:
    failed_gate_context = {
        "gateResult": {
            "failedGates": [
                {"gate": "dataset", "reasonCode": "paper_dataset_not_ready"},
                {"gate": "risk", "reasonCode": "paper_max_notional_exceeded"},
            ],
            "reasonCode": "paper_dataset_not_ready",
        },
        "apiSecret": "SECRET-WAS-HERE",
    }
    blocked = _session(
        status="blocked",
        reason_code="paper_session_blocked",
        error_message="Dataset readiness blocked.",
        gate_context=failed_gate_context,
    )
    repository = FakePaperRepository(
        [blocked],
        latest_audit={blocked.id: _audit(blocked.id, "paper_session_blocked", "paper_dataset_not_ready", 2)},
    )

    result = build_paper_session_observability(repository, status="blocked")

    item = result.items[0]
    assert item.reason_code == "paper_session_blocked"
    assert item.error_message == "Dataset readiness blocked."
    assert item.gate_summary.failed_gate_count == 2
    assert item.gate_summary.failed_gate_reasons == ["paper_dataset_not_ready", "paper_max_notional_exceeded"]
    assert item.gate_summary.blocked_reason_code == "paper_dataset_not_ready"
