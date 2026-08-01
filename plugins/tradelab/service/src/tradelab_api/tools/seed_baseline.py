from __future__ import annotations

import json

from tradelab_api.db.session import SessionLocal, get_engine
from tradelab_api.services.baseline_seed import seed_baseline_fixture


def main() -> None:
    with SessionLocal(bind=get_engine()) as session:
        try:
            result = seed_baseline_fixture(session, created_by="trade-lab-cli")
            session.commit()
        except Exception:
            session.rollback()
            raise
    print(
        json.dumps(
            {
                "groupId": str(result.group_id),
                "strategyId": str(result.strategy_id),
                "versionId": str(result.version_id),
                "botId": str(result.bot_id),
                "taggedTestGroupCount": result.tagged_test_group_count,
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
