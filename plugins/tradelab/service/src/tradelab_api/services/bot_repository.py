from __future__ import annotations

from uuid import UUID

from tradelab_api.db.models import Bot

from .repository_base import CRUDRepository


class BotRepository(CRUDRepository[Bot]):
    model = Bot

    def create_bot(self, **fields: object) -> Bot:
        return self.create(Bot(**fields))

    def list_bots(self) -> list[Bot]:
        return self.list_all()

    def get_bot(self, bot_id: UUID) -> Bot | None:
        return self.get_by_id(bot_id)

    def get_backtest_bot_for_strategy(self, strategy_id: UUID, *, name: str) -> Bot | None:
        return (
            self.session.query(Bot)
            .filter(
                Bot.strategy_id == strategy_id,
                Bot.name == name,
                Bot.mode == "backtest",
                Bot.is_deleted.is_(False),
                Bot.is_active.is_(True),
            )
            .one_or_none()
        )

    def update_bot(self, bot: Bot, **fields: object) -> Bot:
        return self.update(bot, **fields)
