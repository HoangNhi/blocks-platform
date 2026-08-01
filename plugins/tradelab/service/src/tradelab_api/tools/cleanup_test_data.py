from __future__ import annotations

import argparse
import json
from collections.abc import Sequence

from tradelab_api.db.session import SessionLocal, get_engine
from tradelab_api.services.test_data_cleanup import (
    CLEANUP_ACTOR,
    CleanupGuardError,
    TestDataCleanupSummary,
    apply_test_data_cleanup,
    build_test_data_cleanup_plan,
)


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Preview or soft-delete TradeLab local automated test fixtures."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Commit soft-delete changes. Omit this flag to preview only.",
    )
    parser.add_argument(
        "--updated-by",
        default=CLEANUP_ACTOR,
        help="Audit actor stored in updated_by when --apply is used.",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    session = SessionLocal(bind=get_engine())
    try:
        if args.apply:
            summary = apply_test_data_cleanup(session, updated_by=args.updated_by)
            session.commit()
        else:
            summary = build_test_data_cleanup_plan(session)
        print(_to_json(summary))
        return 0
    except CleanupGuardError as exc:
        session.rollback()
        print(
            json.dumps(
                {
                    "mode": "apply" if args.apply else "preview",
                    "success": False,
                    "error": str(exc),
                },
                ensure_ascii=False,
                sort_keys=True,
            )
        )
        return 2
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def _to_json(summary: TestDataCleanupSummary) -> str:
    payload = {"success": True, **summary.as_dict()}
    return json.dumps(payload, ensure_ascii=False, sort_keys=True)


if __name__ == "__main__":
    raise SystemExit(main())
