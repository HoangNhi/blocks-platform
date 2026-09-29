from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session

from tradelab_api.db.models import Bot
from tradelab_api.services.scoped_repository import ScopedRepository


class BotRepository(ScopedRepository[Bot]):
    model = Bot

    def __init__(self, session: Session, workspace_id: UUID) -> None:
        super().__init__(session, workspace_id)

    def create_bot(self, **fields: object) -> Bot:
        fields.pop("workspace_id", None)
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
        return self.update(bot, **fields)
