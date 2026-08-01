from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import httpx
import pytest

from tradelab_api.services.dataset_fill_preview import build_dataset_fill_preview
from tradelab_api.services.dataset_local_fill import (
    DatasetLocalFillValidationError,
    execute_dataset_local_fill,
)
from tradelab_api.services.market_data_repository import build_dataset_key


def _dt(hour: int) -> datetime:
    return datetime(2026, 1, 1, hour, tzinfo=timezone.utc)


def _settings(*, enabled: bool = True, environment: str = "local") -> SimpleNamespace:
    return SimpleNamespace(
        tradelab_local_fill_enabled=enabled,
        tradelab_environment=environment,
        default_worker_identity="trade-lab-local-fill-test",
    )


def _remote(hour: int) -> dict[str, object]:
    timestamp = _dt(hour)
    return {
        "open_time": timestamp,
        "close_time": timestamp,
        "open": 100 + hour,
        "high": 101 + hour,
        "low": 99 + hour,
        "close": 100 + hour,
        "volume": 10,
        "quote_volume": 1000 + hour,
        "trade_count": 20 + hour,
    }


def _candle(hour: int) -> dict[str, object]:
    row = _remote(hour)
    return {
        "exchange": "binance",
        "symbol": "BTCUSDT",
        "timeframe": "1h",
        "open_time": row["open_time"],
        "close_time": row["close_time"],
        "open": row["open"],
        "high": row["high"],
        "low": row["low"],
        "close": row["close"],
        "volume": row["volume"],
        "quote_volume": row["quote_volume"],
        "trade_count": row["trade_count"],
        "source": "binance",
    }


def _request() -> httpx.Request:
    return httpx.Request("GET", "https://binance.test/api/v3/klines")

def _http_status_error(status_code: int) -> httpx.HTTPStatusError:
    response = httpx.Response(status_code, request=_request())
    return httpx.HTTPStatusError(f"HTTP {status_code}", request=response.request, response=response)

def _assert_failed_provider_job(
    repository: "FakeRepository",
    *,
    reason_code: str,
    provider_status: str,
    preview_id: str,
    fingerprint: str,
) -> None:
    assert repository.created_rows == []
    assert len(repository.jobs) == 1
    job = repository.jobs[0]
    assert job.status == "failed"
    assert job.rows_imported == 0
    assert job.error_message == "Binance public klines request failed."
    assert job.metadata_["source"] == "strategy_lab_local_fill"
    assert job.metadata_["previewId"] == preview_id
    assert job.metadata_["requestFingerprint"] == fingerprint
    assert job.metadata_["reasonCode"] == reason_code
    assert job.metadata_["providerStatus"] == provider_status
    assert job.metadata_["rowsInserted"] == 0
    assert job.metadata_["rowsFetched"] == 0
    assert job.metadata_["rowsSkippedExisting"] == 0
    assert job.metadata_["safetyStatus"] == "local_dev_fill_only"
    assert job.metadata_["missingRanges"]

class FakeClient:
    def __init__(self, rows: list[dict[str, object]] | None = None, error: Exception | None = None) -> None:
        self.rows = rows or []
        self.error = error
        self.calls: list[dict[str, object]] = []

    def get_klines(self, **kwargs):
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        start_time = kwargs["start_time"]
        end_time = kwargs["end_time"]
        return [row for row in self.rows if start_time <= row["open_time"] <= end_time]


class FakeRepository:
    def __init__(self, candles: list[dict[str, object]], active_job: object | None = None) -> None:
        self.candles = list(candles)
        self.active_job = active_job
        self.jobs: list[SimpleNamespace] = []
        self.coverage_refreshes: list[dict[str, object]] = []
        self.created_rows: list[dict[str, object]] = []
        self.replace_calls = 0

    def get_coverage(self, *, dataset_key: str):
        rows = [
            row
            for row in self.candles
            if build_dataset_key(str(row["exchange"]), str(row["symbol"]), str(row["timeframe"])) == dataset_key
        ]
        if not rows:
            return None
        return SimpleNamespace(
            id=uuid4(),
            dataset_key=dataset_key,
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            health_status="healthy",
            earliest_open_time=min(row["open_time"] for row in rows),
            latest_open_time=max(row["open_time"] for row in rows),
            covered_start_at=min(row["open_time"] for row in rows),
            covered_end_at=max(row["open_time"] for row in rows),
            segment_count=1,
            gap_count=0,
            metadata_={},
        )

    def list_coverage_segments(self, *, coverage_id):
        if not self.candles:
            return []
        return [
            SimpleNamespace(
                coverage_id=coverage_id,
                segment_index=0,
                start_at=min(row["open_time"] for row in self.candles),
                end_at=max(row["open_time"] for row in self.candles),
                row_count=len(self.candles),
            )
        ]

    def list_market_candle_source_summary(self, **kwargs):
        return []

    def list_market_candles(self, **kwargs):
        rows = list(self.candles)
        if kwargs.get("exchange") is not None:
            rows = [row for row in rows if row["exchange"] == kwargs["exchange"]]
        if kwargs.get("symbol") is not None:
            rows = [row for row in rows if row["symbol"] == kwargs["symbol"]]
        if kwargs.get("timeframe") is not None:
            rows = [row for row in rows if row["timeframe"] == kwargs["timeframe"]]
        if kwargs.get("start_at") is not None:
            rows = [row for row in rows if row["open_time"] >= kwargs["start_at"]]
        if kwargs.get("end_at") is not None:
            rows = [row for row in rows if row["open_time"] <= kwargs["end_at"]]
        return [SimpleNamespace(**row) for row in sorted(rows, key=lambda row: row["open_time"])]

    def find_compatible_active_import_job(self, **kwargs):
        return self.active_job

    def create_import_job(self, **fields):
        job = SimpleNamespace(id=uuid4(), **fields)
        self.jobs.append(job)
        return job

    def create_market_candles(self, candles):
        self.created_rows.extend(candles)
        self.candles.extend(candles)
        return [SimpleNamespace(id=uuid4(), **row) for row in candles]

    def replace_market_candles(self, **kwargs):
        self.replace_calls += 1
        raise AssertionError("Local fill must not replace candles.")

    def refresh_coverage_from_candles(self, **kwargs):
        self.coverage_refreshes.append(kwargs)
        return SimpleNamespace(id=uuid4(), dataset_key=build_dataset_key(kwargs["exchange"], kwargs["symbol"], kwargs["timeframe"]))

    def complete_import_job(self, job, **fields):
        for key, value in fields.items():
            setattr(job, key, value)
        return job


def _preview(repository: FakeRepository, strategy_id) -> tuple[str, str]:
    preview = build_dataset_fill_preview(
        repository,
        strategy_id=strategy_id,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        requested_start_at=_dt(0),
        requested_end_at=_dt(2),
        source="strategy_lab",
        generated_at=_dt(10),
    )
    return preview.preview_id, preview.request_fingerprint


def test_disabled_guard_blocks_before_provider_or_job() -> None:
    strategy_id = uuid4()
    repository = FakeRepository([])
    client = FakeClient([_remote(0)])

    with pytest.raises(DatasetLocalFillValidationError) as error:
        execute_dataset_local_fill(
            repository,
            client,
            settings=_settings(enabled=False),
            strategy_id=strategy_id,
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            requested_start_at=_dt(0),
            requested_end_at=_dt(2),
            preview_id="preview",
            request_fingerprint="fingerprint",
            confirm_local_fill=True,
            source="strategy_lab",
            generated_at=_dt(10),
        )

    assert error.value.reason_code == "local_fill_disabled"
    assert client.calls == []
    assert repository.jobs == []
    assert repository.created_rows == []


def test_production_environment_blocks_before_provider_or_job() -> None:
    strategy_id = uuid4()
    repository = FakeRepository([])
    client = FakeClient([_remote(0)])

    with pytest.raises(DatasetLocalFillValidationError) as error:
        execute_dataset_local_fill(
            repository,
            client,
            settings=_settings(environment="production"),
            strategy_id=strategy_id,
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            requested_start_at=_dt(0),
            requested_end_at=_dt(2),
            preview_id="preview",
            request_fingerprint="fingerprint",
            confirm_local_fill=True,
            source="strategy_lab",
            generated_at=_dt(10),
        )

    assert error.value.reason_code == "local_fill_not_allowed_in_environment"
    assert client.calls == []
    assert repository.jobs == []


def test_confirmation_is_required() -> None:
    strategy_id = uuid4()
    repository = FakeRepository([])
    client = FakeClient([_remote(0)])

    with pytest.raises(DatasetLocalFillValidationError) as error:
        execute_dataset_local_fill(
            repository,
            client,
            settings=_settings(),
            strategy_id=strategy_id,
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            requested_start_at=_dt(0),
            requested_end_at=_dt(2),
            preview_id="preview",
            request_fingerprint="fingerprint",
            confirm_local_fill=False,
            source="strategy_lab",
            generated_at=_dt(10),
        )

    assert error.value.reason_code == "local_fill_confirmation_required"
    assert client.calls == []
    assert repository.jobs == []


def test_preview_mismatch_blocks_before_provider_or_job() -> None:
    strategy_id = uuid4()
    repository = FakeRepository([])
    client = FakeClient([_remote(0)])

    with pytest.raises(DatasetLocalFillValidationError) as error:
        execute_dataset_local_fill(
            repository,
            client,
            settings=_settings(),
            strategy_id=strategy_id,
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            requested_start_at=_dt(0),
            requested_end_at=_dt(2),
            preview_id="wrong-preview",
            request_fingerprint="wrong-fingerprint",
            confirm_local_fill=True,
            source="strategy_lab",
            generated_at=_dt(10),
        )

    assert error.value.reason_code == "dataset_fill_preview_mismatch"
    assert client.calls == []
    assert repository.jobs == []


def test_active_job_blocks_before_provider_or_job() -> None:
    strategy_id = uuid4()
    active_job = SimpleNamespace(id=uuid4(), job_type="fill")
    repository = FakeRepository([_candle(1)], active_job=active_job)
    client = FakeClient([_remote(0), _remote(2)])
    preview_id, fingerprint = _preview(repository, strategy_id)

    with pytest.raises(DatasetLocalFillValidationError) as error:
        execute_dataset_local_fill(
            repository,
            client,
            settings=_settings(),
            strategy_id=strategy_id,
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            requested_start_at=_dt(0),
            requested_end_at=_dt(2),
            preview_id=preview_id,
            request_fingerprint=fingerprint,
            confirm_local_fill=True,
            source="strategy_lab",
            generated_at=_dt(10),
        )

    assert error.value.reason_code == "active_job_exists"
    assert client.calls == []
    assert repository.jobs == []


def test_insert_only_fill_writes_missing_candles_and_refreshes_coverage() -> None:
    strategy_id = uuid4()
    repository = FakeRepository([_candle(1)])
    client = FakeClient([_remote(0), _remote(1), _remote(2)])
    preview_id, fingerprint = _preview(repository, strategy_id)

    result = execute_dataset_local_fill(
        repository,
        client,
        settings=_settings(),
        strategy_id=strategy_id,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        requested_start_at=_dt(0),
        requested_end_at=_dt(2),
        preview_id=preview_id,
        request_fingerprint=fingerprint,
        confirm_local_fill=True,
        source="strategy_lab",
        generated_at=_dt(10),
    )

    assert result.status == "completed"
    assert result.safety_status == "local_dev_fill_only"
    assert result.rows_fetched == 2
    assert result.rows_inserted == 2
    assert result.rows_skipped_existing == 0
    assert [row["open_time"] for row in repository.created_rows] == [_dt(0), _dt(2)]
    assert repository.replace_calls == 0
    assert len(repository.jobs) == 1
    assert repository.jobs[0].metadata_["previewId"] == preview_id
    assert repository.jobs[0].metadata_["rowsInserted"] == 2
    assert repository.coverage_refreshes


def test_second_confirm_blocks_when_preview_has_no_missing_ranges() -> None:
    strategy_id = uuid4()
    repository = FakeRepository([_candle(0), _candle(1), _candle(2)])
    client = FakeClient([_remote(0), _remote(1), _remote(2)])
    preview = build_dataset_fill_preview(
        repository,
        strategy_id=strategy_id,
        exchange="binance",
        symbol="BTCUSDT",
        timeframe="1h",
        requested_start_at=_dt(0),
        requested_end_at=_dt(2),
        source="strategy_lab",
        generated_at=_dt(10),
    )

    with pytest.raises(DatasetLocalFillValidationError) as error:
        execute_dataset_local_fill(
            repository,
            client,
            settings=_settings(),
            strategy_id=strategy_id,
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            requested_start_at=_dt(0),
            requested_end_at=_dt(2),
            preview_id=preview.preview_id,
            request_fingerprint=preview.request_fingerprint,
            confirm_local_fill=True,
            source="strategy_lab",
            generated_at=_dt(10),
        )

    assert error.value.reason_code == "dataset_fill_no_missing_ranges"
    assert client.calls == []
    assert repository.jobs == []


@pytest.mark.parametrize(
    ("error", "reason_code", "provider_status"),
    [
        (httpx.TimeoutException("timed out", request=_request()), "dataset_fill_provider_timeout", "timeout"),
        (_http_status_error(429), "dataset_fill_provider_rate_limited", "429"),
        (_http_status_error(503), "dataset_fill_provider_unavailable", "503"),
        (httpx.ConnectError("network unavailable", request=_request()), "dataset_fill_provider_unavailable", "network_unavailable"),
        (RuntimeError("provider exploded"), "dataset_fill_provider_failed", "unknown"),
    ],
)
def test_provider_failure_marks_job_failed_with_machine_readable_metadata(
    error: Exception,
    reason_code: str,
    provider_status: str,
) -> None:
    strategy_id = uuid4()
    repository = FakeRepository([_candle(1)])
    preview_id, fingerprint = _preview(repository, strategy_id)
    client = FakeClient(error=error)

    with pytest.raises(DatasetLocalFillValidationError) as raised:
        execute_dataset_local_fill(
            repository,
            client,
            settings=_settings(),
            strategy_id=strategy_id,
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            requested_start_at=_dt(0),
            requested_end_at=_dt(2),
            preview_id=preview_id,
            request_fingerprint=fingerprint,
            confirm_local_fill=True,
            source="strategy_lab",
            generated_at=_dt(10),
        )

    assert raised.value.reason_code == reason_code
    assert raised.value.provider_status == provider_status
    assert raised.value.should_commit is True
    _assert_failed_provider_job(
        repository,
        reason_code=reason_code,
        provider_status=provider_status,
        preview_id=preview_id,
        fingerprint=fingerprint,
    )

def test_empty_provider_response_marks_job_failed_without_inserting_candles() -> None:
    strategy_id = uuid4()
    repository = FakeRepository([_candle(1)])
    preview_id, fingerprint = _preview(repository, strategy_id)
    client = FakeClient(rows=[])

    with pytest.raises(DatasetLocalFillValidationError) as raised:
        execute_dataset_local_fill(
            repository,
            client,
            settings=_settings(),
            strategy_id=strategy_id,
            exchange="binance",
            symbol="BTCUSDT",
            timeframe="1h",
            requested_start_at=_dt(0),
            requested_end_at=_dt(2),
            preview_id=preview_id,
            request_fingerprint=fingerprint,
            confirm_local_fill=True,
            source="strategy_lab",
            generated_at=_dt(10),
        )

    assert raised.value.reason_code == "dataset_fill_provider_empty"
    assert raised.value.provider_status == "empty_response"
    assert raised.value.should_commit is True
    _assert_failed_provider_job(
        repository,
        reason_code="dataset_fill_provider_empty",
        provider_status="empty_response",
        preview_id=preview_id,
        fingerprint=fingerprint,
    )
