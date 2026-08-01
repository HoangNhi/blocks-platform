from __future__ import annotations

from uuid import UUID

from sqlalchemy import or_

from tradelab_api.db.models import BenchmarkRunCheck

from .repository_base import CRUDRepository

class BenchmarkRepository(CRUDRepository[BenchmarkRunCheck]):
    model = BenchmarkRunCheck

    def create_check(self, **fields: object) -> BenchmarkRunCheck:
        fields.setdefault("status", "pending")
        fields.setdefault("metric_diffs", {})
        fields.setdefault("tolerance_policy", {"mode": "exact"})
        check = BenchmarkRunCheck(**fields)
        self.session.add(check)
        self.session.flush()
        self.session.refresh(check)
        return check

    def get_check(self, check_id: UUID) -> BenchmarkRunCheck | None:
        return self.get_by_id(check_id, active_only=False)

    def get_latest_for_run(self, run_id: UUID) -> BenchmarkRunCheck | None:
        return (
            self.session.query(BenchmarkRunCheck)
            .filter(or_(BenchmarkRunCheck.baseline_run_id == run_id, BenchmarkRunCheck.repeat_run_id == run_id))
            .order_by(BenchmarkRunCheck.created_at.desc())
            .first()
        )

    def get_for_repeat_run(self, repeat_run_id: UUID) -> BenchmarkRunCheck | None:
        return (
            self.session.query(BenchmarkRunCheck)
            .filter(BenchmarkRunCheck.repeat_run_id == repeat_run_id)
            .order_by(BenchmarkRunCheck.created_at.desc())
            .first()
        )

    def list_for_baseline_run(self, baseline_run_id: UUID) -> list[BenchmarkRunCheck]:
        return list(
            self.session.query(BenchmarkRunCheck)
            .filter(BenchmarkRunCheck.baseline_run_id == baseline_run_id)
            .order_by(BenchmarkRunCheck.created_at.desc())
            .all()
        )
