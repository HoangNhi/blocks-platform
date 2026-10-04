from __future__ import annotations

from uuid import UUID

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from tradelab_api.db.models import Bot, ExchangeConnection, Strategy, StrategyVersion
from tradelab_api.services.exchange_repository import ExchangeConnectionRepository
from tradelab_api.services.strategy_repository import StrategyRepository
from tradelab_api.services.scoped_repository import PrivateOwnerRepository


class BotRepository(PrivateOwnerRepository[Bot]):
    model = Bot

    def __init__(self, session: Session, workspace_id: UUID, owner_user_id: UUID) -> None:
        super().__init__(session, workspace_id, owner_user_id)

    def _base_select(self):
        return (
            super()._base_select()
            .join(Strategy, Strategy.id == Bot.strategy_id)
            .outerjoin(StrategyVersion, StrategyVersion.id == Bot.strategy_version_id)
            .outerjoin(ExchangeConnection, ExchangeConnection.id == Bot.exchange_connection_id)
            .where(
                Strategy.workspace_id == self.workspace_id,
                Strategy.created_by == str(self.owner_user_id),
                Bot.strategy_id.in_(StrategyRepository(self.session, self.workspace_id, self.owner_user_id)._base_select().with_only_columns(Strategy.id)),
                or_(Bot.strategy_version_id.is_(None), and_(
                    StrategyVersion.strategy_id == Bot.strategy_id,
                    StrategyVersion.workspace_id == self.workspace_id,
                    StrategyVersion.created_by == str(self.owner_user_id),
                )),
                or_(Bot.exchange_connection_id.is_(None), and_(
                    ExchangeConnection.workspace_id == self.workspace_id,
                    ExchangeConnection.owner_user_id == self.owner_user_id,
                )),
            )
        )

    def create_bot(self, **fields: object) -> Bot:
        fields.pop("workspace_id", None)
        self._validate_relationships(fields)
        return self.create(Bot(**fields))

    def list_bots(self) -> list[Bot]:
        return self.list_all()

    def get_bot(self, bot_id: UUID) -> Bot | None:
        return self.get_by_id(bot_id)

    def get_backtest_bot_for_strategy(self, strategy_id: UUID, *, name: str) -> Bot | None:
        stmt = (
            self._base_select()
            .where(
                Bot.strategy_id == strategy_id,
                Bot.name == name,
                Bot.mode == "backtest",
                Bot.is_deleted.is_(False),
                Bot.is_active.is_(True),
            )
        )
        return self.session.execute(stmt).scalar_one_or_none()

    def update_bot(self, bot: Bot, **fields: object) -> Bot:
        self._validate_relationships(
            {
                "strategy_id": fields.get("strategy_id", bot.strategy_id),
                "strategy_version_id": fields.get("strategy_version_id", bot.strategy_version_id),
                "exchange_connection_id": fields.get(
                    "exchange_connection_id", bot.exchange_connection_id
                ),
            }
        )
        return self.update(bot, **fields)

    def _validate_relationships(self, fields: dict[str, object]) -> None:
        strategy_id = fields.get("strategy_id")
        if not isinstance(strategy_id, UUID):
            raise PermissionError("Bot strategy must belong to the current owner and workspace.")

        strategy_repository = StrategyRepository(
            self.session, self.workspace_id, self.owner_user_id
        )
        strategy = strategy_repository.get_strategy(strategy_id)
        if strategy is None:
            raise PermissionError("Bot strategy must belong to the current owner and workspace.")

        version_id = fields.get("strategy_version_id")
        if version_id is not None:
            version = (
                strategy_repository.get_strategy_version(version_id)
                if isinstance(version_id, UUID)
                else None
            )
            if version is None or version.strategy_id != strategy.id:
                raise PermissionError("Bot strategy version must belong to the selected strategy.")

        connection_id = fields.get("exchange_connection_id")
        if connection_id is not None:
            connection = (
                ExchangeConnectionRepository(
                    self.session, self.workspace_id, self.owner_user_id
                ).get_exchange_connection(connection_id)
                if isinstance(connection_id, UUID)
                else None
            )
            if connection is None:
                raise PermissionError(
                    "Bot exchange connection must belong to the current owner and workspace."
                )
