from __future__ import annotations

from uuid import UUID

from tradelab_api.db.models import ExchangeConnection, ExchangeSymbol

from .repository_base import CRUDRepository


class ExchangeRepository(CRUDRepository[ExchangeConnection]):
    model = ExchangeConnection

    def create_exchange_connection(self, **fields: object) -> ExchangeConnection:
        return self.create(ExchangeConnection(**fields))

    def list_exchange_connections(self) -> list[ExchangeConnection]:
        return self.list_all()

    def get_exchange_connection(self, connection_id: UUID) -> ExchangeConnection | None:
        return self.get_by_id(connection_id)

    def update_exchange_connection(self, connection: ExchangeConnection, **fields: object) -> ExchangeConnection:
        return self.update(connection, **fields)

    def create_exchange_symbol(self, **fields: object) -> ExchangeSymbol:
        obj = ExchangeSymbol(**fields)
        self.session.add(obj)
        self.session.flush()
        self.session.refresh(obj)
        return obj

    def list_exchange_symbols(self) -> list[ExchangeSymbol]:
        return self.session.query(ExchangeSymbol).filter(
            ExchangeSymbol.is_deleted.is_(False), ExchangeSymbol.is_active.is_(True)
        ).all()

    def upsert_exchange_symbol(self, symbol: str, exchange: str, **fields: object) -> ExchangeSymbol:
        existing = (
            self.session.query(ExchangeSymbol)
            .filter(ExchangeSymbol.symbol == symbol, ExchangeSymbol.exchange == exchange)
            .one_or_none()
        )
        if existing is None:
            return self.create_exchange_symbol(symbol=symbol, exchange=exchange, **fields)
        return self.update(existing, **fields)

