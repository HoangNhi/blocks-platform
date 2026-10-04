from __future__ import annotations

import argparse
import json
from uuid import UUID

from tradelab_api.db.session import SessionLocal, get_engine
from tradelab_api.services.baseline_seed import seed_baseline_fixture


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace-id", type=UUID, required=True)
    parser.add_argument("--actor-id", type=UUID, required=True)
    args = parser.parse_args()
    with SessionLocal(bind=get_engine()) as session:
        try:
            result = seed_baseline_fixture(
                session, workspace_id=args.workspace_id, owner_user_id=args.actor_id
            )
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
