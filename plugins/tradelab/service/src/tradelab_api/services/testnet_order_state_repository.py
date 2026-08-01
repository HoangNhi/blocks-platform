from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import case, desc, func, select
from sqlalchemy.orm import Session, joinedload

from tradelab_api.db.models import (
    TestnetOrderEvent,
    TestnetOrderIntent,
    TestnetOrderPreview,
    TestnetReconciliationAttempt,
)
from tradelab_api.services.credential_redaction import sanitize_credential_payload
from tradelab_api.services.testnet_order_state import hash_idempotency_key


class TestnetOrderStateRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def create_intent(
        self,
        *,
        intent_key: str,
        strategy_id: UUID,
        strategy_version_id: UUID,
        source_run_id: UUID | None,
        source_signal_package_id: str | None,
        credential_ref_id: UUID,
        environment: str,
        exchange: str,
        market_type: str,
        symbol: str,
        side: str,
        order_type: str,
        quantity: Decimal | None,
        quote_quantity: Decimal | None,
        client_order_id: str,
        status: str,
        status_reason_code: str | None,
        metadata: dict[str, Any],
        actor: str,
    ) -> TestnetOrderIntent:
        row = TestnetOrderIntent(
            intent_key=intent_key,
            strategy_id=strategy_id,
            strategy_version_id=strategy_version_id,
            source_run_id=source_run_id,
            source_signal_package_id=source_signal_package_id,
            credential_ref_id=credential_ref_id,
            environment=environment,
            exchange=exchange,
            market_type=market_type,
            symbol=symbol,
            side=side,
            order_type=order_type,
            quantity=quantity,
            quote_quantity=quote_quantity,
            client_order_id=client_order_id,
            status=status,
            status_reason_code=status_reason_code,
            reconciliation_required=False,
            metadata_=sanitize_credential_payload(metadata),
            created_by=actor,
        )
        self.session.add(row)
        self.session.flush()
        return row

    def create_preview(
        self,
        *,
        intent_id: UUID,
        preview_key: str,
        status: str,
        reason_code: str | None,
        symbol: str,
        side: str,
        order_type: str,
        quantity: Decimal | None,
        quote_quantity: Decimal | None,
        estimated_notional: Decimal | None,
        estimated_fee: Decimal | None,
        risk_snapshot: dict[str, Any],
        credential_snapshot: dict[str, Any],
        source_snapshot: dict[str, Any],
        expires_at: datetime | None,
        metadata: dict[str, Any],
        actor: str,
    ) -> TestnetOrderPreview:
        row = TestnetOrderPreview(
            intent_id=intent_id,
            preview_key=preview_key,
            status=status,
            reason_code=reason_code,
            symbol=symbol,
            side=side,
            order_type=order_type,
            quantity=quantity,
            quote_quantity=quote_quantity,
            estimated_notional=estimated_notional,
            estimated_fee=estimated_fee,
            risk_snapshot=sanitize_credential_payload(risk_snapshot),
            credential_snapshot=sanitize_credential_payload(credential_snapshot),
            source_snapshot=sanitize_credential_payload(source_snapshot),
            expires_at=expires_at,
            metadata_=sanitize_credential_payload(metadata),
            created_by=actor,
        )
        self.session.add(row)
        self.session.flush()
        return row

    def set_latest_preview(self, intent: TestnetOrderIntent, *, preview_id: UUID, actor: str) -> TestnetOrderIntent:
        intent.latest_preview_id = preview_id
        intent.updated_by = actor
        self.session.flush()
        return intent

    def get_preview_with_intent(self, preview_id: UUID) -> tuple[TestnetOrderPreview, TestnetOrderIntent] | tuple[None, None]:
        statement = (
            select(TestnetOrderPreview)
            .options(joinedload(TestnetOrderPreview.intent))
            .where(
                TestnetOrderPreview.id == preview_id,
                TestnetOrderPreview.is_active.is_(True),
                TestnetOrderPreview.is_deleted.is_(False),
            )
        )
        preview = self.session.scalars(statement).first()
        if preview is None or preview.intent is None:
            return None, None
        intent = preview.intent
        if not intent.is_active or intent.is_deleted:
            return None, None
        return preview, intent

    def update_intent_exchange_snapshot(
        self,
        intent: TestnetOrderIntent,
        *,
        exchange_order_id: str | None,
        exchange_order_status: str | None,
        metadata: dict[str, Any],
        actor: str,
    ) -> TestnetOrderIntent:
        intent.exchange_order_id = exchange_order_id
        intent.exchange_order_status = exchange_order_status
        if metadata:
            merged = dict(intent.metadata_ or {})
            merged.update(sanitize_credential_payload(metadata))
            intent.metadata_ = merged
        intent.updated_by = actor
        self.session.flush()
        return intent

    def get_latest_submit_event_by_idempotency_key(self, intent_id: UUID, idempotency_key: str) -> TestnetOrderEvent | None:
        final_event_priority = case(
            (
                TestnetOrderEvent.event_type.in_(
                    [
                        "testnet_order_submit_accepted",
                        "testnet_order_submit_rejected",
                        "testnet_order_submit_unknown_recorded",
                        "testnet_order_submit_blocked",
                    ]
                ),
                0,
            ),
            else_=1,
        )
        statement = (
            select(TestnetOrderEvent)
            .where(
                TestnetOrderEvent.intent_id == intent_id,
                TestnetOrderEvent.idempotency_key_hash == hash_idempotency_key(idempotency_key),
                TestnetOrderEvent.event_type.in_(
                    [
                        "testnet_order_submit_accepted",
                        "testnet_order_submit_rejected",
                        "testnet_order_submit_unknown_recorded",
                        "testnet_order_submit_blocked",
                        "testnet_order_submit_attempted",
                    ]
                ),
            )
            .order_by(final_event_priority, desc(TestnetOrderEvent.created_at))
            .limit(1)
        )
        return self.session.scalars(statement).first()

    def get_latest_cancel_event_by_idempotency_key(self, intent_id: UUID, idempotency_key: str) -> TestnetOrderEvent | None:
        final_event_priority = case(
            (
                TestnetOrderEvent.event_type.in_(
                    [
                        "testnet_order_cancel_accepted",
                        "testnet_order_cancel_rejected",
                        "testnet_order_cancel_unknown_recorded",
                        "testnet_order_cancel_blocked",
                    ]
                ),
                0,
            ),
            else_=1,
        )
        statement = (
            select(TestnetOrderEvent)
            .where(
                TestnetOrderEvent.intent_id == intent_id,
                TestnetOrderEvent.idempotency_key_hash == hash_idempotency_key(idempotency_key),
                TestnetOrderEvent.event_type.in_(
                    [
                        "testnet_order_cancel_requested",
                        "testnet_order_cancel_accepted",
                        "testnet_order_cancel_rejected",
                        "testnet_order_cancel_unknown_recorded",
                        "testnet_order_cancel_blocked",
                    ]
                ),
            )
            .order_by(final_event_priority, desc(TestnetOrderEvent.created_at))
            .limit(1)
        )
        return self.session.scalars(statement).first()

    def get_next_reconciliation_attempt_no(self, intent_id: UUID) -> int:
        statement = select(func.max(TestnetReconciliationAttempt.attempt_no)).where(
            TestnetReconciliationAttempt.intent_id == intent_id
        )
        latest = self.session.execute(statement).scalar_one_or_none()
        return int(latest) + 1 if latest is not None else 0

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
    ) -> TestnetOrderEvent:
        created_at = datetime.now(UTC)
        latest_created_at = self.session.execute(
            select(func.max(TestnetOrderEvent.created_at)).where(TestnetOrderEvent.intent_id == intent_id)
        ).scalar_one_or_none()
        if latest_created_at is not None and created_at <= latest_created_at:
            created_at = latest_created_at + timedelta(microseconds=1)
        row = TestnetOrderEvent(
            intent_id=intent_id,
            preview_id=preview_id,
            event_type=event_type,
            from_status=from_status,
            to_status=to_status,
            reason_code=reason_code,
            idempotency_key=idempotency_key,
            idempotency_key_hash=hash_idempotency_key(idempotency_key) if idempotency_key else None,
            client_order_id=client_order_id,
            exchange_order_id=exchange_order_id,
            actor=actor,
            metadata_=sanitize_credential_payload(metadata),
            created_at=created_at,
            created_by=actor,
        )
        self.session.add(row)
        self.session.flush()
        return row

    def add_reconciliation_attempt(
        self,
        *,
        intent_id: UUID,
        attempt_no: int,
        trigger: str,
        status: str,
        reason_code: str | None,
        exchange_order_status: str | None,
        fills_snapshot: dict[str, Any],
        metadata: dict[str, Any],
        actor: str,
    ) -> TestnetReconciliationAttempt:
        row = TestnetReconciliationAttempt(
            intent_id=intent_id,
            attempt_no=attempt_no,
            trigger=trigger,
            status=status,
            reason_code=reason_code,
            exchange_order_status=exchange_order_status,
            fills_snapshot=sanitize_credential_payload(fills_snapshot),
            metadata_=sanitize_credential_payload(metadata),
            created_by=actor,
        )
        self.session.add(row)
        self.session.flush()
        return row

    def update_intent_status(
        self,
        intent: TestnetOrderIntent,
        *,
        status: str,
        reason_code: str | None,
        reconciliation_required: bool,
        actor: str,
    ) -> TestnetOrderIntent:
        intent.status = status
        intent.status_reason_code = reason_code
        intent.reconciliation_required = reconciliation_required
        if status == "unknown" and intent.unknown_since is None:
            intent.unknown_since = datetime.now(UTC)
        intent.updated_by = actor
        self.session.flush()
        return intent

    def mark_journal_projected(
        self,
        intent: TestnetOrderIntent,
        *,
        journal_entry_id: UUID,
        reason_code: str,
        actor: str,
    ) -> TestnetOrderIntent:
        intent.status = "journal_projected"
        intent.status_reason_code = reason_code
        intent.journal_entry_id = journal_entry_id
        intent.reconciliation_required = False
        intent.updated_by = actor
        self.session.flush()
        return intent

    def soft_delete_intent(self, intent: TestnetOrderIntent, *, actor: str) -> TestnetOrderIntent:
        intent.is_active = False
        intent.is_deleted = True
        intent.updated_by = actor
        self.session.flush()
        return intent

    def get_intent(self, intent_id: UUID, *, active_only: bool = True) -> TestnetOrderIntent | None:
        statement = select(TestnetOrderIntent).where(TestnetOrderIntent.id == intent_id)
        if active_only:
            statement = statement.where(
                TestnetOrderIntent.is_active.is_(True),
                TestnetOrderIntent.is_deleted.is_(False),
            )
        return self.session.scalars(statement).first()

    def get_intent_by_key(self, intent_key: str) -> TestnetOrderIntent | None:
        statement = select(TestnetOrderIntent).where(
            TestnetOrderIntent.intent_key == intent_key,
            TestnetOrderIntent.is_active.is_(True),
            TestnetOrderIntent.is_deleted.is_(False),
        )
        return self.session.scalars(statement).first()

    def get_intent_by_client_order_id(self, client_order_id: str) -> TestnetOrderIntent | None:
        statement = select(TestnetOrderIntent).where(
            TestnetOrderIntent.client_order_id == client_order_id,
            TestnetOrderIntent.is_active.is_(True),
            TestnetOrderIntent.is_deleted.is_(False),
        )
        return self.session.scalars(statement).first()

    def get_preview_by_idempotency_key(self, intent_id: UUID, idempotency_key: str) -> TestnetOrderPreview | None:
        event_statement = (
            select(TestnetOrderEvent.preview_id)
            .where(
                TestnetOrderEvent.intent_id == intent_id,
                TestnetOrderEvent.idempotency_key_hash == hash_idempotency_key(idempotency_key),
                TestnetOrderEvent.preview_id.is_not(None),
            )
            .order_by(desc(TestnetOrderEvent.created_at))
            .limit(1)
        )
        preview_id = self.session.execute(event_statement).scalar_one_or_none()
        if preview_id is None:
            return None
        return self.session.get(TestnetOrderPreview, preview_id)

    def get_preview(self, preview_id: UUID) -> TestnetOrderPreview | None:
        return self.session.get(TestnetOrderPreview, preview_id)

    def list_intents(
        self,
        *,
        strategy_id: UUID | None = None,
        strategy_version_id: UUID | None = None,
        source_run_id: UUID | None = None,
        credential_ref_id: UUID | None = None,
        status: str | None = None,
        symbol: str | None = None,
        limit: int = 20,
    ) -> list[TestnetOrderIntent]:
        bounded_limit = min(max(limit, 1), 50)
        statement = select(TestnetOrderIntent).where(
            TestnetOrderIntent.is_active.is_(True),
            TestnetOrderIntent.is_deleted.is_(False),
        )
        if strategy_id is not None:
            statement = statement.where(TestnetOrderIntent.strategy_id == strategy_id)
        if strategy_version_id is not None:
            statement = statement.where(TestnetOrderIntent.strategy_version_id == strategy_version_id)
        if source_run_id is not None:
            statement = statement.where(TestnetOrderIntent.source_run_id == source_run_id)
        if credential_ref_id is not None:
            statement = statement.where(TestnetOrderIntent.credential_ref_id == credential_ref_id)
        if status:
            statement = statement.where(TestnetOrderIntent.status == status)
        if symbol:
            statement = statement.where(TestnetOrderIntent.symbol == symbol.upper())
        statement = statement.order_by(desc(TestnetOrderIntent.created_at)).limit(bounded_limit)
        return list(self.session.scalars(statement).all())

    def list_previews_for_intent(self, intent_id: UUID, *, limit: int = 10) -> list[TestnetOrderPreview]:
        statement = (
            select(TestnetOrderPreview)
            .where(
                TestnetOrderPreview.intent_id == intent_id,
                TestnetOrderPreview.is_active.is_(True),
                TestnetOrderPreview.is_deleted.is_(False),
            )
            .order_by(desc(TestnetOrderPreview.created_at))
            .limit(min(max(limit, 1), 50))
        )
        return list(self.session.scalars(statement).all())

    def list_events_for_intent(self, intent_id: UUID, *, limit: int = 50) -> list[TestnetOrderEvent]:
        statement = (
            select(TestnetOrderEvent)
            .where(TestnetOrderEvent.intent_id == intent_id)
            .order_by(TestnetOrderEvent.created_at, TestnetOrderEvent.id)
            .limit(min(max(limit, 1), 100))
        )
        return list(self.session.scalars(statement).all())

    def list_reconciliation_attempts_for_intent(self, intent_id: UUID, *, limit: int = 20) -> list[TestnetReconciliationAttempt]:
        statement = (
            select(TestnetReconciliationAttempt)
            .where(TestnetReconciliationAttempt.intent_id == intent_id)
            .order_by(TestnetReconciliationAttempt.attempt_no)
            .limit(min(max(limit, 1), 50))
        )
        return list(self.session.scalars(statement).all())
