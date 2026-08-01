from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import UUID

from tradelab_api.services.paper_session_detail import _sanitize_metadata

READ_ONLY_PAPER_SESSION_OBSERVABILITY_SAFETY_STATUS = "read_only_paper_session_observability"
DEFAULT_PAPER_SESSION_OBSERVABILITY_LIMIT = 10
MAX_PAPER_SESSION_OBSERVABILITY_LIMIT = 25
ALLOWED_PAPER_SESSION_OBSERVABILITY_STATUSES = (
    "blocked",
    "queued",
    "running",
    "completed",
    "failed",
    "cancel_requested",
    "cancelled",
)


class PaperSessionObservabilityValidationError(Exception):
    def __init__(
        self,
        status_code: int,
        reason_code: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.reason_code = reason_code
        self.message = message
        self.details = details or {}


@dataclass(frozen=True)
class PaperSessionObservabilityArtifactCounts:
    orders: int
    fills: int
    positions: int
    portfolio_snapshots: int
    audit_events: int


@dataclass(frozen=True)
class PaperSessionObservabilityLatestAudit:
    audit_event_id: str
    event_at: datetime
    action: str
    reason_code: str | None
    new_state: str | None
    actor: str | None
    metadata: dict[str, Any]


@dataclass(frozen=True)
class PaperSessionObservabilityGateSummary:
    failed_gate_count: int
    failed_gate_reasons: list[str]
    blocked_reason_code: str | None


@dataclass(frozen=True)
class PaperSessionObservabilityItem:
    session_id: str
    status: str
    reason_code: str | None
    safety_status: str
    strategy_id: str
    strategy_version_id: str
    dataset_key: str
    exchange: str
    symbol: str
    timeframe: str
    start_at: datetime
    end_at: datetime
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    error_message: str | None
    artifact_counts: PaperSessionObservabilityArtifactCounts
    latest_audit: PaperSessionObservabilityLatestAudit | None
    gate_summary: PaperSessionObservabilityGateSummary


@dataclass(frozen=True)
class PaperSessionObservabilityResult:
    safety_status: str
    items: list[PaperSessionObservabilityItem]
    has_more: bool


def build_paper_session_observability(
    paper_repository: object,
    *,
    strategy_id: str | None = None,
    strategy_version_id: str | None = None,
    dataset_key: str | None = None,
    status: str | None = None,
    limit: int | None = None,
) -> PaperSessionObservabilityResult:
    parsed_strategy_id = _parse_optional_uuid(strategy_id, "strategyId")
    parsed_strategy_version_id = _parse_optional_uuid(strategy_version_id, "strategyVersionId")
    parsed_status = _parse_optional_status(status)
    bounded_limit = _bounded_limit(limit)

    sessions = paper_repository.list_paper_sessions(
        strategy_id=parsed_strategy_id,
        strategy_version_id=parsed_strategy_version_id,
        dataset_key=dataset_key or None,
        status=parsed_status,
        limit=bounded_limit,
    )

    return PaperSessionObservabilityResult(
        safety_status=READ_ONLY_PAPER_SESSION_OBSERVABILITY_SAFETY_STATUS,
        items=[_serialize_item(paper_repository, session) for session in sessions],
        has_more=False,
    )


def _serialize_item(paper_repository: object, session: object) -> PaperSessionObservabilityItem:
    session_id = getattr(session, "id")
    latest_audit = paper_repository.get_latest_audit_event_for_session(session_id)
    gate_summary = _build_gate_summary(getattr(session, "gate_context", None) or {})
    return PaperSessionObservabilityItem(
        session_id=str(session_id),
        status=str(getattr(session, "status")),
        reason_code=getattr(session, "reason_code", None),
        safety_status=READ_ONLY_PAPER_SESSION_OBSERVABILITY_SAFETY_STATUS,
        strategy_id=str(getattr(session, "strategy_id")),
        strategy_version_id=str(getattr(session, "strategy_version_id")),
        dataset_key=str(getattr(session, "dataset_key")),
        exchange=str(getattr(session, "exchange")),
        symbol=str(getattr(session, "symbol")),
        timeframe=str(getattr(session, "timeframe")),
        start_at=getattr(session, "start_at"),
        end_at=getattr(session, "end_at"),
        created_at=getattr(session, "created_at"),
        started_at=getattr(session, "started_at", None),
        finished_at=getattr(session, "finished_at", None),
        error_message=getattr(session, "error_message", None),
        artifact_counts=PaperSessionObservabilityArtifactCounts(
            orders=paper_repository.count_orders_for_session(session_id),
            fills=paper_repository.count_fills_for_session(session_id),
            positions=paper_repository.count_positions_for_session(session_id),
            portfolio_snapshots=paper_repository.count_portfolio_snapshots_for_session(session_id),
            audit_events=paper_repository.count_audit_events_for_session(session_id),
        ),
        latest_audit=_serialize_latest_audit(latest_audit),
        gate_summary=gate_summary,
    )


def _serialize_latest_audit(audit: object | None) -> PaperSessionObservabilityLatestAudit | None:
    if audit is None:
        return None
    return PaperSessionObservabilityLatestAudit(
        audit_event_id=str(getattr(audit, "id")),
        event_at=getattr(audit, "event_at"),
        action=str(getattr(audit, "action")),
        reason_code=getattr(audit, "reason_code", None),
        new_state=getattr(audit, "new_state", None),
        actor=getattr(audit, "actor", None),
        metadata=_sanitize_metadata(getattr(audit, "metadata_", None) or {}),
    )


def _build_gate_summary(gate_context: dict[str, Any]) -> PaperSessionObservabilityGateSummary:
    gate_result = gate_context.get("gateResult")
    if not isinstance(gate_result, dict):
        gate_result = gate_context.get("gate_result")
    if not isinstance(gate_result, dict):
        return PaperSessionObservabilityGateSummary(0, [], None)
    failed_gates = gate_result.get("failedGates")
    if not isinstance(failed_gates, list):
        failed_gates = gate_result.get("failed_gates")
    if not isinstance(failed_gates, list):
        failed_gates = []
    reasons = []
    for gate in failed_gates:
        if isinstance(gate, dict):
            reason = gate.get("reasonCode") or gate.get("reason_code")
            if isinstance(reason, str) and reason:
                reasons.append(reason)
    blocked_reason = gate_result.get("reasonCode") or gate_result.get("reason_code")
    return PaperSessionObservabilityGateSummary(
        failed_gate_count=len(failed_gates),
        failed_gate_reasons=reasons,
        blocked_reason_code=blocked_reason if isinstance(blocked_reason, str) else None,
    )


def _parse_optional_uuid(value: str | None, filter_name: str) -> UUID | None:
    if value is None or value == "":
        return None
    try:
        return UUID(value)
    except ValueError as exc:
        raise PaperSessionObservabilityValidationError(
            400,
            "paper_session_observability_invalid_filter",
            f"Invalid paper session observability filter: {filter_name}.",
            {"filter": filter_name},
        ) from exc


def _parse_optional_status(value: str | None) -> str | None:
    if value is None or value == "":
        return None
    if value not in ALLOWED_PAPER_SESSION_OBSERVABILITY_STATUSES:
        raise PaperSessionObservabilityValidationError(
            400,
            "paper_session_observability_invalid_filter",
            "Invalid paper session observability filter: status.",
            {
                "filter": "status",
                "allowedStatuses": list(ALLOWED_PAPER_SESSION_OBSERVABILITY_STATUSES),
            },
        )
    return value


def _bounded_limit(value: int | None) -> int:
    if value is None:
        return DEFAULT_PAPER_SESSION_OBSERVABILITY_LIMIT
    return min(max(value, 0), MAX_PAPER_SESSION_OBSERVABILITY_LIMIT)
