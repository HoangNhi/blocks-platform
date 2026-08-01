from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any, Protocol
from uuid import UUID

from sqlalchemy.orm import Session

from tradelab_api.db.models import BotRun
from tradelab_api.services.execution_journal import (
    ASSISTED_LIVE_EXECUTION_JOURNAL_SAFETY_STATUS,
    JournalFillInput,
    build_assisted_live_planned_snapshot,
    derive_comparison_summary,
)

TERMINAL_LIVE_ORDER_STATUSES = {"filled", "cancelled", "rejected", "reconciled"}


class OrderRepository(Protocol):
    def get_intent(self, intent_id: UUID, *, active_only: bool = True) -> object | None: ...
    def mark_journal_projected(self, intent: object, *, journal_entry_id: UUID, reason_code: str, actor: str) -> object: ...
    def add_event(
        self,
        *,
        intent_id: UUID,
        preview_id: UUID | None,
        event_type: str,
        from_status: str | None,
        to_status: str | None,
        reason_code: str | None,
        idempotency_key: str | None,
        client_order_id: str | None,
        exchange_order_id: str | None,
        actor: str,
        metadata: dict[str, Any],
    ) -> object: ...


class JournalRepository(Protocol):
    def create_entry(self, **kwargs: Any) -> object: ...


class RunRepository(Protocol):
    def get_run(self, run_id: UUID) -> object | None: ...


@dataclass(frozen=True)
class LiveOrderJournalProjectionRequestData:
    __test__ = False

    order_id: UUID
    confirm_live_journal_projection: bool
    source: str = "strategy_lab"
    actor: str = "local-user"


@dataclass(frozen=True)
class LiveOrderJournalProjectionResult:
    __test__ = False

    status: str
    reason_code: str
    safety_status: str = ASSISTED_LIVE_EXECUTION_JOURNAL_SAFETY_STATUS
    semantic_status_code: int = 200
    should_commit: bool = False
    intent_id: str | None = None
    journal_entry_id: str | None = None
    client_order_id: str | None = None
    intent_status: str | None = None
    audit_event_ids: list[str] = field(default_factory=list)
    details: dict[str, Any] = field(default_factory=dict)


class SqlAlchemyRunRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_run(self, run_id: UUID) -> BotRun | None:
        return self.session.get(BotRun, run_id)


def project_live_order_to_journal(
    *,
    order_repository: OrderRepository,
    journal_repository: JournalRepository,
    run_repository: RunRepository,
    request: LiveOrderJournalProjectionRequestData,
) -> LiveOrderJournalProjectionResult:
    if not request.confirm_live_journal_projection:
        return _blocked("live_order_journal_projection_confirm_required")
    if request.source != "strategy_lab":
        return _blocked("live_order_journal_projection_source_not_supported")

    intent = order_repository.get_intent(request.order_id)
    if intent is None:
        return _blocked("live_order_not_found", semantic_status_code=404)
    if getattr(intent, "journal_entry_id", None):
        return _blocked("live_order_journal_projection_duplicate", intent=intent, semantic_status_code=409)
    if getattr(intent, "status", None) not in TERMINAL_LIVE_ORDER_STATUSES:
        return _blocked("live_order_journal_projection_non_terminal", intent=intent)

    source_run_id = getattr(intent, "source_run_id", None)
    if source_run_id is None:
        return _blocked("live_order_journal_projection_source_run_required", intent=intent)
    run = run_repository.get_run(source_run_id)
    if run is None:
        return _blocked("live_order_journal_projection_source_run_not_found", intent=intent, semantic_status_code=404)
    if getattr(run, "status", None) != "completed":
        return _blocked("live_order_journal_projection_source_run_not_completed", intent=intent)

    fills = _fills_from_intent(intent)
    side = "long" if getattr(intent, "side", None) == "buy" else "short"
    evidence = {
        "exchangeOrderStatus": getattr(intent, "exchange_order_status", None),
        "exchangeOrderId": getattr(intent, "exchange_order_id", None),
        "status": getattr(intent, "status", None),
    }
    planned_snapshot = build_assisted_live_planned_snapshot(run, intent=intent, evidence=evidence)
    comparison_summary = derive_comparison_summary(
        side=side,
        planned_snapshot=planned_snapshot,
        fills=fills,
        discipline_status="not_recorded",
    )
    fill_rows = [_fill_row(fill) for fill in fills]
    entry = journal_repository.create_entry(
        source_run_id=source_run_id,
        strategy_id=getattr(intent, "strategy_id", None),
        strategy_version_id=getattr(intent, "strategy_version_id", None),
        symbol=getattr(intent, "symbol"),
        timeframe=getattr(run, "timeframe", ""),
        side=side,
        planned_snapshot=planned_snapshot,
        comparison_summary=comparison_summary,
        outcome_status=str(comparison_summary["outcomeStatus"]),
        discipline_status="not_recorded",
        safety_status=ASSISTED_LIVE_EXECUTION_JOURNAL_SAFETY_STATUS,
        notes="Projected from assisted Binance Spot Live order evidence.",
        fills=fill_rows,
        created_by=request.actor,
    )
    journal_entry_id = getattr(entry, "id")
    previous_status = getattr(intent, "status", None)
    order_repository.mark_journal_projected(
        intent,
        journal_entry_id=journal_entry_id,
        reason_code="live_order_journal_projection_created",
        actor=request.actor,
    )
    event = order_repository.add_event(
        intent_id=getattr(intent, "id"),
        preview_id=getattr(intent, "latest_preview_id", None),
        event_type="live_order_journal_projection_planned",
        from_status=previous_status,
        to_status="journal_projected",
        reason_code="live_order_journal_projection_created",
        idempotency_key=None,
        client_order_id=getattr(intent, "client_order_id", None),
        exchange_order_id=getattr(intent, "exchange_order_id", None),
        actor=request.actor,
        metadata={"journalEntryId": str(journal_entry_id), "source": request.source},
    )
    return LiveOrderJournalProjectionResult(
        status="journal_projected",
        reason_code="live_order_journal_projection_created",
        should_commit=True,
        intent_id=str(getattr(intent, "id")),
        journal_entry_id=str(journal_entry_id),
        client_order_id=getattr(intent, "client_order_id", None),
        intent_status="journal_projected",
        audit_event_ids=[str(getattr(event, "id"))],
        details={"source": request.source},
    )


def _fills_from_intent(intent: object) -> list[JournalFillInput]:
    metadata = dict(getattr(intent, "metadata_", {}) or {})
    fills = metadata.get("fills") if isinstance(metadata.get("fills"), list) else []
    result: list[JournalFillInput] = []
    for item in fills:
        if not isinstance(item, dict):
            continue
        price = _decimal_or_none(item.get("price"))
        quantity = _decimal_or_none(item.get("quantity"))
        if price is None or quantity is None or price <= 0 or quantity <= 0:
            continue
        result.append(
            JournalFillInput(
                fill_role=str(item.get("fillRole") or item.get("fill_role") or "entry"),
                side=str(item.get("side") or getattr(intent, "side")),
                price=price,
                quantity=quantity,
                fee=_decimal_or_none(item.get("fee")) or Decimal("0"),
            )
        )
    if result:
        return result
    quantity = getattr(intent, "quantity", None) or getattr(intent, "quote_quantity", None) or Decimal("0")
    return [JournalFillInput(fill_role="entry", side=getattr(intent, "side"), price=Decimal("1"), quantity=quantity, fee=Decimal("0"))]


def _fill_row(fill: JournalFillInput) -> dict[str, object]:
    return {"fill_role": fill.fill_role, "side": fill.side, "price": fill.price, "quantity": fill.quantity, "fee": fill.fee or Decimal("0")}


def _decimal_or_none(value: object) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def _blocked(reason_code: str, *, intent: object | None = None, semantic_status_code: int = 400) -> LiveOrderJournalProjectionResult:
    return LiveOrderJournalProjectionResult(
        status="blocked",
        reason_code=reason_code,
        semantic_status_code=semantic_status_code,
        intent_id=str(getattr(intent, "id", "")) if intent is not None else None,
        client_order_id=getattr(intent, "client_order_id", None),
        intent_status=getattr(intent, "status", None),
    )
