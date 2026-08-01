import { describe, expect, it } from "vitest"

import {
  normalizeBacktestExecution,
  normalizeBenchmarkCheck,
  normalizeBotSummary,
  normalizeManualSignalPackage,
  normalizeResearchRobustnessGate,
  normalizeDatasetCoverageItem,
  normalizeDatasetFillEnqueueResult,
  normalizeExecutionJournalEntry,
  normalizeExecutionJournalList,
  normalizeDatasetFillJobVisibility,
  normalizeDatasetFillPreview,
  normalizeDatasetLocalFillAudit,
  normalizeDatasetLocalFillResult,
  normalizeFillSchedulerStatus,
  normalizePaperSchedulerStatus,
  normalizePaperSessionDetail,
  normalizePaperSessionCancelLocal,
  normalizePaperKillSwitchStatus,
  normalizePaperSessionObservability,
  normalizePaperSessionPreview,
  normalizePaperSessionResumeLocal,
  normalizePaperSessionResumeReadiness,
  normalizePaperSessionRetryLocal,
  normalizePaperSessionRunLocal,
  normalizePaperSessionStart,
  normalizeLiveOrderCancelResult,
  normalizeLiveOrderConfirmSubmitResult,
  normalizeLiveOrderDetail,
  normalizeLiveOrderJournalProjectionResult,
  normalizeLiveOrderList,
  normalizeLiveOrderPreviewResult,
  normalizeLiveOrderReconcileResult,
  normalizeRunAnalysis,
  normalizeTestnetOrderCancelResult,
  normalizeTestnetOrderConfirmSubmitResult,
  normalizeTestnetOrderJournalProjectionResult,
  normalizeTestnetOrderReconcileResult,
  normalizePreflightResult,
  normalizeRunChart,
  normalizeRunDetail,
  normalizeStrategyJobVisibility,
  normalizeRunPipeline,
  normalizeSelectedTradeExecutionDetail,
  normalizeStrategyDetail,
  normalizeStrategyGroupSummary,
  normalizeStrategySummary,
  normalizeStrategyValidationCheck,
  normalizeStrategyVersion,
} from "./tradelab-normalizers"

describe("TradeLab normalizers", () => {
  it("normalizes assisted testnet operation results from snake and camel case", () => {
    expect(normalizeTestnetOrderConfirmSubmitResult({
      status: "submitted",
      reason_code: "testnet_order_submit_binance_accepted",
      safety_status: "assisted_testnet_real_submit_testnet_only",
      semantic_status_code: 200,
      should_commit: true,
      intent_id: "intent-1",
      preview_id: "preview-1",
      client_order_id: "client-order-1",
      exchange_order_id: "exchange-1",
      intent_status: "submitted",
      submit_snapshot: { endpoint: "POST /api/v3/order" },
      audit_event_ids: ["event-1"],
      details: { connectorMode: "real" },
    })).toMatchObject({
      status: "submitted",
      reasonCode: "testnet_order_submit_binance_accepted",
      safetyStatus: "assisted_testnet_real_submit_testnet_only",
      semanticStatusCode: 200,
      shouldCommit: true,
      intentId: "intent-1",
      previewId: "preview-1",
      clientOrderId: "client-order-1",
      exchangeOrderId: "exchange-1",
      intentStatus: "submitted",
      snapshot: { endpoint: "POST /api/v3/order" },
      auditEventIds: ["event-1"],
    })

    expect(normalizeTestnetOrderCancelResult({
      status: "cancelled",
      reasonCode: "testnet_order_cancel_binance_accepted",
      safetyStatus: "assisted_testnet_cancel_testnet_only",
      intentId: "intent-1",
      cancelSnapshot: { endpoint: "DELETE /api/v3/order" },
    }).snapshot).toEqual({ endpoint: "DELETE /api/v3/order" })

    expect(normalizeTestnetOrderReconcileResult({
      status: "reconciled",
      reasonCode: "testnet_order_reconcile_binance_matched",
      safetyStatus: "assisted_testnet_reconcile_testnet_only",
      reconciliationAttemptId: "attempt-1",
      reconcileSnapshot: { exchangeStatus: "FILLED" },
    })).toMatchObject({
      status: "reconciled",
      reconciliationAttemptId: "attempt-1",
      snapshot: { exchangeStatus: "FILLED" },
    })

    expect(normalizeTestnetOrderJournalProjectionResult({
      status: "journal_projected",
      reason_code: "testnet_order_journal_projection_created",
      safety_status: "assisted_testnet_execution_journal_projection",
      intent_id: "intent-1",
      journal_entry_id: "entry-1",
      client_order_id: "client-1",
      intent_status: "journal_projected",
      audit_event_ids: ["event-1"],
    })).toMatchObject({
      status: "journal_projected",
      journalEntryId: "entry-1",
      reasonCode: "testnet_order_journal_projection_created",
      auditEventIds: ["event-1"],
    })
  })

  it("normalizes assisted live order payloads from snake and camel case", () => {
    expect(normalizeLiveOrderConfirmSubmitResult({
      status: "submitted",
      reason_code: "live_order_submit_binance_accepted",
      safety_status: "assisted_live_real_submit_live_only",
      semantic_status_code: 200,
      should_commit: true,
      intent_id: "intent-1",
      preview_id: "preview-1",
      client_order_id: "client-order-1",
      exchange_order_id: "exchange-1",
      intent_status: "submitted",
      submit_snapshot: { endpoint: "POST /api/v3/order" },
      audit_event_ids: ["event-1"],
      details: { connectorMode: "real" },
    })).toMatchObject({
      status: "submitted",
      reasonCode: "live_order_submit_binance_accepted",
      safetyStatus: "assisted_live_real_submit_live_only",
      semanticStatusCode: 200,
      shouldCommit: true,
      intentId: "intent-1",
      previewId: "preview-1",
      clientOrderId: "client-order-1",
      exchangeOrderId: "exchange-1",
      intentStatus: "submitted",
      snapshot: { endpoint: "POST /api/v3/order" },
      auditEventIds: ["event-1"],
    })

    expect(normalizeLiveOrderCancelResult({
      status: "cancelled",
      reasonCode: "live_order_cancel_binance_accepted",
      safetyStatus: "assisted_live_cancel_live_only",
      cancelSnapshot: { endpoint: "DELETE /api/v3/order" },
    })).toMatchObject({
      status: "cancelled",
      reasonCode: "live_order_cancel_binance_accepted",
      snapshot: { endpoint: "DELETE /api/v3/order" },
    })

    expect(normalizeLiveOrderReconcileResult({
      status: "filled",
      reason_code: "live_order_reconcile_binance_matched",
      safety_status: "assisted_live_reconcile_live_only",
      reconciliation_attempt_id: "attempt-1",
      reconcile_snapshot: { exchangeStatus: "FILLED" },
    })).toMatchObject({
      status: "filled",
      reasonCode: "live_order_reconcile_binance_matched",
      reconciliationAttemptId: "attempt-1",
      snapshot: { exchangeStatus: "FILLED" },
    })

    expect(normalizeLiveOrderJournalProjectionResult({
      status: "journal_projected",
      reason_code: "live_order_journal_projection_created",
      safety_status: "assisted_live_execution_journal_projection",
      intent_id: "intent-1",
      journal_entry_id: "entry-1",
      client_order_id: "client-1",
      intent_status: "journal_projected",
      audit_event_ids: ["event-1"],
    })).toMatchObject({
      status: "journal_projected",
      journalEntryId: "entry-1",
      reasonCode: "live_order_journal_projection_created",
      auditEventIds: ["event-1"],
    })

    expect(normalizeLiveOrderPreviewResult({
      status: "allowed",
      allowed: true,
      reason_code: "live_order_preview_allowed",
      safety_status: "assisted_live_order_preview_only",
      intent_id: "intent-1",
      preview_id: "preview-1",
      client_order_id: "client-order-1",
      order: {
        environment: "binance_live",
        exchange: "binance",
        market_type: "spot",
        symbol: "BTCUSDT",
        side: "buy",
        order_type: "market",
        quantity: null,
        quote_quantity: "25",
      },
    })).toMatchObject({
      status: "allowed",
      allowed: true,
      reasonCode: "live_order_preview_allowed",
      previewId: "preview-1",
      clientOrderId: "client-order-1",
    })

    expect(normalizeLiveOrderDetail({
      safety_status: "assisted_live_order_read_only",
      intent: {
        intent_id: "intent-1",
        status: "previewed",
        reason_code: "live_order_preview_allowed",
        client_order_id: "client-order-1",
        environment: "binance_live",
        exchange: "binance",
        market_type: "spot",
        symbol: "BTCUSDT",
        side: "buy",
        order_type: "market",
        quantity: null,
        quote_quantity: "25",
        strategy_id: "strategy-1",
        strategy_version_id: "version-1",
        source_run_id: null,
        credential_ref_id: "credential-ref-1",
        latest_preview_id: "preview-1",
        reconciliation_required: false,
        created_at: null,
        updated_at: null,
      },
      latest_preview: {
        preview_id: "preview-1",
        preview_key: "preview-key-1",
        status: "allowed",
        reason_code: "live_order_preview_allowed",
        symbol: "BTCUSDT",
        side: "buy",
        order_type: "market",
        quantity: null,
        quote_quantity: "25",
        estimated_notional: null,
        estimated_fee: null,
        risk_snapshot: { maxNotional: "100" },
        credential_snapshot: { status: "stored_live_only" },
        source_snapshot: { source: "strategy_lab" },
        expires_at: null,
        created_at: null,
      },
      previews: [],
      events: [],
      reconciliation_attempts: [],
    })).toMatchObject({
      safetyStatus: "assisted_live_order_read_only",
      intent: expect.objectContaining({
        intentId: "intent-1",
        environment: "binance_live",
      }),
      latestPreview: expect.objectContaining({
        previewId: "preview-1",
      }),
    })

    expect(normalizeLiveOrderList({
      safety_status: "assisted_live_order_list_read_only",
      items: [
        {
          intent: {
            intent_id: "intent-1",
            status: "previewed",
            client_order_id: "client-order-1",
            environment: "binance_live",
            exchange: "binance",
            market_type: "spot",
            symbol: "BTCUSDT",
            side: "buy",
            order_type: "market",
            quantity: null,
            quote_quantity: "25",
            strategy_id: "strategy-1",
            strategy_version_id: "version-1",
            source_run_id: null,
            credential_ref_id: "credential-ref-1",
            latest_preview_id: "preview-1",
            reconciliation_required: false,
            created_at: null,
            updated_at: null,
          },
          latest_preview: null,
        },
      ],
    })).toMatchObject({
      safetyStatus: "assisted_live_order_list_read_only",
      items: [
        {
          intent: expect.objectContaining({
            intentId: "intent-1",
            clientOrderId: "client-order-1",
          }),
        },
      ],
    })
  })

  it("normalizes paper kill switch status from snake case", () => {
    const result = normalizePaperKillSwitchStatus({
      enabled: true,
      reason_code: "paper_kill_switch_enabled",
      safety_status: "read_only_paper_kill_switch_status",
      source: "config",
      updated_at: null,
      updated_by: null,
      details: { environment: "local", localDevOnly: true },
    })

    expect(result).toEqual({
      enabled: true,
      reasonCode: "paper_kill_switch_enabled",
      safetyStatus: "read_only_paper_kill_switch_status",
      source: "config",
      updatedAt: null,
      updatedBy: null,
      details: { environment: "local", localDevOnly: true },
    })
  })

  it("normalizes paper session run-local result from snake case", () => {
    const result = normalizePaperSessionRunLocal({
      status: "completed",
      reason_code: "paper_engine_completed",
      session_id: "paper-session-1",
      candles_processed: "3",
      orders_created: 1,
      fills_created: 1,
      snapshots_created: 3,
      safety_status: "local_dev_paper_engine_tick",
      details: {
        workerId: "strategy-lab-local-paper-run",
        maxCandlesPerTick: 10000,
      },
    })

    expect(result).toEqual({
      status: "completed",
      reasonCode: "paper_engine_completed",
      sessionId: "paper-session-1",
      candlesProcessed: 3,
      ordersCreated: 1,
      fillsCreated: 1,
      snapshotsCreated: 3,
      safetyStatus: "local_dev_paper_engine_tick",
      details: {
        workerId: "strategy-lab-local-paper-run",
        maxCandlesPerTick: 10000,
      },
    })
  })

  it("normalizes paper session cancel-local result from snake case", () => {
    const result = normalizePaperSessionCancelLocal({
      status: "cancelled",
      reason_code: "paper_local_cancelled",
      session_id: "paper-session-1",
      previous_status: "queued",
      current_status: "cancelled",
      cancel_requested_at: "2026-05-22T10:30:00Z",
      safety_status: "local_dev_paper_cancel",
      details: { actor: "strategy-lab-local-paper-cancel" },
    })

    expect(result).toEqual({
      status: "cancelled",
      reasonCode: "paper_local_cancelled",
      sessionId: "paper-session-1",
      previousStatus: "queued",
      currentStatus: "cancelled",
      cancelRequestedAt: "2026-05-22T10:30:00Z",
      safetyStatus: "local_dev_paper_cancel",
      details: { actor: "strategy-lab-local-paper-cancel" },
    })
  })

  it("normalizes paper session retry local result from snake case response", () => {
    const result = normalizePaperSessionRetryLocal({
      status: "queued",
      reason_code: "paper_local_retry_queued",
      safety_status: "local_dev_paper_retry",
      source_session_id: "paper-source-1",
      retry_session_id: "paper-retry-1",
      source_status: "cancelled",
      retry_status: "queued",
      idempotency_key: "paper-retry:paper-source-1:click-1",
      details: { actor: "strategy-lab-local-paper-retry" },
    })

    expect(result).toEqual({
      status: "queued",
      reasonCode: "paper_local_retry_queued",
      safetyStatus: "local_dev_paper_retry",
      sourceSessionId: "paper-source-1",
      retrySessionId: "paper-retry-1",
      sourceStatus: "cancelled",
      retryStatus: "queued",
      idempotencyKey: "paper-retry:paper-source-1:click-1",
      details: { actor: "strategy-lab-local-paper-retry" },
    })
  })

  it("normalizes paper session retry local result from camel case response and nullable IDs", () => {
    const result = normalizePaperSessionRetryLocal({
      status: "blocked",
      reasonCode: "paper_local_retry_gate_failed",
      safetyStatus: "local_dev_paper_retry",
      sourceSessionId: "paper-source-1",
      retrySessionId: null,
      sourceStatus: "failed",
      retryStatus: null,
      idempotencyKey: "paper-retry:paper-source-1:click-2",
      details: { failedGateCount: 1 },
    })

    expect(result).toEqual({
      status: "blocked",
      reasonCode: "paper_local_retry_gate_failed",
      safetyStatus: "local_dev_paper_retry",
      sourceSessionId: "paper-source-1",
      retrySessionId: null,
      sourceStatus: "failed",
      retryStatus: null,
      idempotencyKey: "paper-retry:paper-source-1:click-2",
      details: { failedGateCount: 1 },
    })
  })

  it("normalizes paper session resume readiness from snake case response", () => {
    const result = normalizePaperSessionResumeReadiness({
      session_id: "paper-session-1",
      status: "cancelled",
      reason_code: "paper_local_resume_readiness_ready",
      allowed: true,
      safety_status: "read_only_paper_resume_readiness",
      checkpoint_source: "persisted",
      artifact_identity_status: "ready",
      resume_mode: "same_session",
      attempt_no: 1,
      blocking_reasons: [],
      details: { supportedStrategyState: true },
      checkpoint: {
        last_processed_candle_id: "candle-1",
        last_processed_candle_open_time: "2026-01-01T00:00:00Z",
        next_candle_id: "candle-2",
        next_candle_open_time: "2026-01-01T01:00:00Z",
        cash_balance: "1000.5",
        equity: "1005.25",
        realized_pnl: "2.5",
        unrealized_pnl: "3.25",
        fees_paid: "0.25",
        exposure_notional: "50",
        open_position_quantity: "0.01",
        average_entry_price: "50000",
        pending_orders_count: 0,
      },
    })

    expect(result.sessionId).toBe("paper-session-1")
    expect(result.allowed).toBe(true)
    expect(result.checkpointSource).toBe("persisted")
    expect(result.checkpoint?.nextCandleOpenTime).toBe("2026-01-01T01:00:00Z")
    expect(result.checkpoint?.cashBalance).toBe(1000.5)
  })

  it("normalizes paper session resume-local result from camel case response", () => {
    const result = normalizePaperSessionResumeLocal({
      status: "queued",
      reasonCode: "paper_local_resume_queued",
      safetyStatus: "local_dev_paper_resume",
      sourceSessionId: "paper-session-1",
      resumeSessionId: "paper-session-1",
      sourceStatus: "cancelled",
      resumeStatus: "queued",
      idempotencyKey: "paper-resume:paper-session-1:strategy-lab-resume:paper-session-1:1",
      resumeCursor: { lastProcessedCandleId: "candle-1", nextCandleOpenTime: "2026-01-01T01:00:00Z", attemptNo: 1 },
      details: { actor: "strategy-lab-local-paper-resume" },
    })

    expect(result.status).toBe("queued")
    expect(result.reasonCode).toBe("paper_local_resume_queued")
    expect(result.resumeSessionId).toBe("paper-session-1")
    expect(result.resumeCursor?.attemptNo).toBe(1)
  })

  it("normalizes dataset local fill result from snake_case payload", () => {
    const result = normalizeDatasetLocalFillResult({
      job_id: "job-1",
      dataset_key: "binance:BTCUSDT:1h",
      status: "completed",
      safety_status: "local_dev_fill_only",
      requested_range: {
        start_at: "2026-01-01T00:00:00Z",
        end_at: "2026-01-02T00:00:00Z",
      },
      ranges_filled: [
        {
          start_at: "2026-01-01T00:00:00Z",
          end_at: "2026-01-01T02:00:00Z",
          kind: "head",
          rows_fetched: 3,
          rows_inserted: 2,
          rows_skipped_existing: 1,
        },
      ],
      rows_fetched: 3,
      rows_inserted: 2,
      rows_skipped_existing: 1,
      blocked_reasons: [],
      preview_id: "preview-1",
      request_fingerprint: "fingerprint-1",
    })

    expect(result).toEqual({
      jobId: "job-1",
      datasetKey: "binance:BTCUSDT:1h",
      status: "completed",
      safetyStatus: "local_dev_fill_only",
      requestedRange: {
        startAt: "2026-01-01T00:00:00Z",
        endAt: "2026-01-02T00:00:00Z",
      },
      rangesFilled: [
        {
          startAt: "2026-01-01T00:00:00Z",
          endAt: "2026-01-01T02:00:00Z",
          kind: "head",
          rowsFetched: 3,
          rowsInserted: 2,
          rowsSkippedExisting: 1,
        },
      ],
      rowsFetched: 3,
      rowsInserted: 2,
      rowsSkippedExisting: 1,
      blockedReasons: [],
      previewId: "preview-1",
      requestFingerprint: "fingerprint-1",
    })
  })

  it("normalizes dataset fill enqueue result from snake case", () => {
    const result = normalizeDatasetFillEnqueueResult({
      job_id: "job-1",
      dataset_key: "binance:BTCUSDT:1h",
      status: "queued",
      safety_status: "queued_local_dev",
      requested_range: { start_at: "2026-01-01T00:00:00Z", end_at: "2026-01-01T06:00:00Z" },
      missing_range_count: 1,
      preview_id: "preview-1",
      request_fingerprint: "fingerprint-1",
    })

    expect(result).toEqual({
      jobId: "job-1",
      datasetKey: "binance:BTCUSDT:1h",
      status: "queued",
      safetyStatus: "queued_local_dev",
      requestedRange: { startAt: "2026-01-01T00:00:00Z", endAt: "2026-01-01T06:00:00Z" },
      missingRangeCount: 1,
      previewId: "preview-1",
      requestFingerprint: "fingerprint-1",
    })
  })

  it("normalizes local fill audit response with provider failure detail", () => {
    const result = normalizeDatasetLocalFillAudit({
      dataset_key: "binance:BTCUSDT:1h",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      safety_status: "read_only",
      items: [
        {
          job_id: "job-1",
          status: "failed",
          created_at: "2026-01-01T00:00:00Z",
          finished_at: "2026-01-01T00:01:00Z",
          requested_range: { start_at: "2026-01-01T00:00:00Z", end_at: "2026-01-01T06:00:00Z" },
          applied_range: { start_at: null, end_at: null },
          rows_imported: 0,
          rows_fetched: 0,
          rows_inserted: 0,
          rows_skipped_existing: 0,
          error_message: "Binance public klines request failed.",
          reason_code: "dataset_fill_provider_rate_limited",
          provider_status: "429",
          preview_id: "preview-1",
          request_fingerprint: "fingerprint-1",
          missing_ranges: [{ startAt: "2026-01-01T00:00:00Z", endAt: "2026-01-01T01:00:00Z", kind: "tail" }],
          range_results: [],
        },
      ],
    })

    expect(result.datasetKey).toBe("binance:BTCUSDT:1h")
    expect(result.safetyStatus).toBe("read_only")
    expect(result.items[0].status).toBe("failed")
    expect(result.items[0].reasonCode).toBe("dataset_fill_provider_rate_limited")
    expect(result.items[0].providerStatus).toBe("429")
    expect(result.items[0].previewId).toBe("preview-1")
    expect(result.items[0].requestFingerprint).toBe("fingerprint-1")
    expect(result.items[0].rowsInserted).toBe(0)
    expect(result.items[0].missingRanges).toHaveLength(1)
  })

  it("normalizes fill job visibility from snake case response", () => {
    const result = normalizeDatasetFillJobVisibility({
      dataset_key: "binance:BTCUSDT:1h",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      safety_status: "read_only",
      active: [
        {
          job_id: "job-active",
          dataset_key: "binance:BTCUSDT:1h",
          job_type: "fill",
          status: "running",
          requested_range: { start_at: "2026-01-01T00:00:00Z", end_at: "2026-01-01T06:00:00Z" },
          applied_range: { start_at: "2026-01-01T01:00:00Z", end_at: "2026-01-01T02:00:00Z" },
          rows_imported: 2,
          rows_fetched: 3,
          rows_inserted: 2,
          rows_skipped_existing: 1,
          reason_code: null,
          provider_status: null,
          attempt_count: 1,
          worker_id: "worker-a",
          created_at: "2026-01-01T00:00:00Z",
          started_at: "2026-01-01T00:01:00Z",
          finished_at: null,
          heartbeat_at: "2026-01-01T00:02:00Z",
          metadata: { source: "strategy_lab_local_fill" },
        },
      ],
      recent: [],
    })

    expect(result.datasetKey).toBe("binance:BTCUSDT:1h")
    expect(result.safetyStatus).toBe("read_only")
    expect(result.active[0]).toMatchObject({
      jobId: "job-active",
      jobType: "fill",
      status: "running",
      rowsInserted: 2,
      attemptCount: 1,
      heartbeatAt: "2026-01-01T00:02:00Z",
    })
    expect(result.recent).toEqual([])
  })

  it("normalizes fill job visibility from camel case response and defaults arrays", () => {
    const result = normalizeDatasetFillJobVisibility({
      datasetKey: "binance:ETHUSDT:1h",
      exchange: "binance",
      symbol: "ETHUSDT",
      timeframe: "1h",
      safetyStatus: "read_only",
      recent: [
        {
          jobId: "job-recent",
          datasetKey: "binance:ETHUSDT:1h",
          jobType: "fill",
          status: "failed",
          requestedRange: { startAt: null, endAt: null },
          appliedRange: { startAt: null, endAt: null },
          reasonCode: "dataset_fill_provider_rate_limited",
          providerStatus: "429",
        },
      ],
    })

    expect(result.active).toEqual([])
    expect(result.recent[0].reasonCode).toBe("dataset_fill_provider_rate_limited")
    expect(result.recent[0].providerStatus).toBe("429")
    expect(result.recent[0].rowsImported).toBe(0)
  })

  it("normalizes fill scheduler status from snake case response", () => {
    const result = normalizeFillSchedulerStatus({
      enabled: true,
      running: false,
      worker_id: "trade-lab-local-scheduler",
      interval_seconds: "60",
      last_tick_started_at: "2026-05-19T10:00:00Z",
      last_tick_completed_at: "2026-05-19T10:01:00Z",
      last_tick_status: "processed",
      last_skip_reason: null,
      last_reason_code: null,
      last_job_id: "job-1",
      last_dataset_key: "binance:BTCUSDT:1h",
      stale_jobs_marked: "2",
      consecutive_failure_count: 0,
      safety_status: "read_only_scheduler_visibility",
    })

    expect(result).toEqual({
      enabled: true,
      running: false,
      workerId: "trade-lab-local-scheduler",
      intervalSeconds: 60,
      lastTickStartedAt: "2026-05-19T10:00:00Z",
      lastTickCompletedAt: "2026-05-19T10:01:00Z",
      lastTickStatus: "processed",
      lastSkipReason: null,
      lastReasonCode: null,
      lastJobId: "job-1",
      lastDatasetKey: "binance:BTCUSDT:1h",
      staleJobsMarked: 2,
      consecutiveFailureCount: 0,
      safetyStatus: "read_only_scheduler_visibility",
    })
  })

  it("normalizes fill scheduler status from camel case response and defaults missing fields", () => {
    const result = normalizeFillSchedulerStatus({
      lastTickStatus: "disabled",
      lastSkipReason: "dataset_fill_scheduler_unavailable",
    })

    expect(result).toMatchObject({
      enabled: false,
      running: false,
      workerId: "trade-lab-local-scheduler",
      intervalSeconds: 60,
      lastTickStartedAt: null,
      lastTickCompletedAt: null,
      lastTickStatus: "disabled",
      lastSkipReason: "dataset_fill_scheduler_unavailable",
      lastReasonCode: null,
      lastJobId: null,
      lastDatasetKey: null,
      staleJobsMarked: 0,
      consecutiveFailureCount: 0,
      safetyStatus: "read_only_scheduler_visibility",
    })
  })

  it("normalizes paper scheduler status from snake case response", () => {
    const result = normalizePaperSchedulerStatus({
      enabled: true,
      running: false,
      worker_id: "tradelab-local-paper-scheduler",
      interval_seconds: "60",
      last_tick_started_at: "2026-05-29T10:00:00Z",
      last_tick_completed_at: "2026-05-29T10:01:00Z",
      last_tick_status: "processed",
      last_skip_reason: null,
      last_reason_code: "paper_engine_completed",
      last_session_id: "paper-session-1",
      candles_processed: "100",
      orders_created: "1",
      fills_created: "1",
      snapshots_created: "100",
      consecutive_failure_count: 0,
      safety_status: "read_only_paper_scheduler_visibility",
    })

    expect(result).toEqual({
      enabled: true,
      running: false,
      workerId: "tradelab-local-paper-scheduler",
      intervalSeconds: 60,
      lastTickStartedAt: "2026-05-29T10:00:00Z",
      lastTickCompletedAt: "2026-05-29T10:01:00Z",
      lastTickStatus: "processed",
      lastSkipReason: null,
      lastReasonCode: "paper_engine_completed",
      lastSessionId: "paper-session-1",
      candlesProcessed: 100,
      ordersCreated: 1,
      fillsCreated: 1,
      snapshotsCreated: 100,
      consecutiveFailureCount: 0,
      safetyStatus: "read_only_paper_scheduler_visibility",
    })
  })

  it("normalizes paper scheduler status from camel case response and defaults missing fields", () => {
    const result = normalizePaperSchedulerStatus({
      lastTickStatus: "disabled",
      lastSkipReason: "paper_scheduler_unavailable",
    })

    expect(result).toMatchObject({
      enabled: false,
      running: false,
      workerId: "tradelab-local-paper-scheduler",
      intervalSeconds: 60,
      lastTickStartedAt: null,
      lastTickCompletedAt: null,
      lastTickStatus: "disabled",
      lastSkipReason: "paper_scheduler_unavailable",
      lastReasonCode: null,
      lastSessionId: null,
      candlesProcessed: 0,
      ordersCreated: 0,
      fillsCreated: 0,
      snapshotsCreated: 0,
      consecutiveFailureCount: 0,
      safetyStatus: "read_only_paper_scheduler_visibility",
    })
  })

  it("normalizes bot summary creation timestamp", () => {
    expect(
      normalizeBotSummary({
        id: "bot-1",
        strategy_id: "strategy-1",
        strategy_version_id: "version-1",
        name: "Paper Draft 1",
        mode: "paper",
        status: "draft",
        symbol: "BTCUSDT",
        timeframe: "1h",
        runtime_config: {},
        risk_config: {},
        metadata: {
          credentialBoundary: {
            status: "read_only_ready",
          },
        },
        created_at: "2026-05-16T00:00:00Z",
      }),
    ).toMatchObject({
      id: "bot-1",
      mode: "paper",
      status: "draft",
      metadata: {
        credentialBoundary: {
          status: "read_only_ready",
        },
      },
      createdAt: "2026-05-16T00:00:00Z",
    })
  })

  it("normalizes benchmark check payload", () => {
    expect(
      normalizeBenchmarkCheck({
        id: "check-1",
        baseline_run_id: "run-a",
        repeat_run_id: "run-b",
        strategy_id: "strategy-1",
        strategy_version_id: "version-1",
        dataset_key: "binance:BTCUSDT:1h",
        input_fingerprint: "input-a",
        repeat_input_fingerprint: "input-a",
        input_match: true,
        result_fingerprint: "result-a",
        repeat_result_fingerprint: "result-a",
        result_match: true,
        tolerance_policy: { mode: "exact" },
        metric_diffs: { final_equity: { baseline: "1000", repeat: "1000", match: true } },
        status: "matched",
        error_message: null,
        created_at: "2026-05-15T00:00:00Z",
        updated_at: null,
      }),
    ).toMatchObject({
      id: "check-1",
      baselineRunId: "run-a",
      repeatRunId: "run-b",
      datasetKey: "binance:BTCUSDT:1h",
      inputMatch: true,
      resultMatch: true,
      status: "matched",
    })
  })

  it("normalizes manual signal package payloads", () => {
    const packageResult = normalizeManualSignalPackage({
      signal_package_id: "pkg-1",
      source_run_id: "run-1",
      strategy_id: "strategy-1",
      strategy_version_id: "version-1",
      strategy_name: "Breakout Lab",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      dataset_key: "binance:BTCUSDT:1h",
      run_start_at: "2026-01-01T00:00:00Z",
      run_end_at: "2026-01-31T00:00:00Z",
      generated_at: "2026-05-30T00:00:00Z",
      action: "watch",
      entry_rule: "Manual setup only",
      stop_rule: "Use risk guard",
      exit_rule: "Use strategy exit",
      position_sizing_rule: "maxOrderPercent=10",
      invalidation_rule: "Mismatch invalidates",
      manual_execution_notes: ["Manual only"],
      limitations: ["Historical evidence"],
      warnings: ["robustness_not_available"],
      source_metrics: { totalReturnPct: "12.5" },
      source_trade_summary: { totalTrades: 24 },
      dataset_evidence: { datasetKey: "binance:BTCUSDT:1h" },
      risk_evidence: { maxOrderPercent: 10 },
      robustness_evidence_status: "not_available",
      live_readiness_status: "manual_handoff_only",
      safety_status: "manual_live_signal_handoff_only",
      markdown: "# TradeLab Manual Signal Handoff",
    })

    expect(packageResult.signalPackageId).toBe("pkg-1")
    expect(packageResult.sourceRunId).toBe("run-1")
    expect(packageResult.strategyName).toBe("Breakout Lab")
    expect(packageResult.datasetKey).toBe("binance:BTCUSDT:1h")
    expect(packageResult.warnings).toEqual(["robustness_not_available"])
    expect(packageResult.safetyStatus).toBe("manual_live_signal_handoff_only")
  })

  it("normalizes research robustness gate payload", () => {
    const gate = normalizeResearchRobustnessGate({
      robustness_gate_id: "gate-1",
      source_run_id: "run-1",
      strategy_id: "strategy-1",
      strategy_version_id: "version-1",
      strategy_name: "Baseline",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      dataset_key: "binance:BTCUSDT:1h",
      generated_at: "2026-05-30T00:00:00Z",
      candidate_label: "research_candidate",
      live_readiness_status: "not_live_ready",
      safety_status: "research_robustness_gate_only",
      gates: { tradeCount: { status: "pass", reasonCode: "trade_count_sufficient", summary: "Enough trades" } },
      warnings: ["parameter_sensitivity_requires_rerun_evidence"],
      limitations: ["Research evidence only."],
      source_metrics: { totalReturnPct: "14.5" },
      source_trade_summary: { totalTrades: 36 },
    })

    expect(gate.sourceRunId).toBe("run-1")
    expect(gate.candidateLabel).toBe("research_candidate")
    expect(gate.gates.tradeCount.status).toBe("pass")
    expect(gate.safetyStatus).toBe("research_robustness_gate_only")
  })

  it("normalizes execution journal entry payload", () => {
    const entry = normalizeExecutionJournalEntry({
      entry_id: "entry-1",
      source_run_id: "run-1",
      strategy_id: "strategy-1",
      strategy_version_id: "version-1",
      symbol: "BTCUSDT",
      timeframe: "1h",
      side: "long",
      planned_snapshot: { plannedEntryPrice: 100 },
      comparison_summary: { outcomeStatus: "win", averageEntryPrice: 100, averageExitPrice: 120 },
      outcome_status: "win",
      discipline_status: "followed_plan",
      safety_status: "manual_execution_journal_only",
      live_readiness_status: "not_live_ready",
      notes: "Observed manually.",
      fills: [{ fill_id: "fill-1", fill_role: "entry", side: "buy", price: 100, quantity: 1, fee: 0.1 }],
      created_at: "2026-05-30T00:00:00Z",
      updated_at: null,
    })

    expect(entry.entryId).toBe("entry-1")
    expect(entry.fills[0].fillRole).toBe("entry")
    expect(entry.comparisonSummary.averageExitPrice).toBe(120)
    expect(entry.liveReadinessStatus).toBe("not_live_ready")
  })

  it("normalizes execution journal list payload", () => {
    const list = normalizeExecutionJournalList({ items: [{ entryId: "entry-1", fills: [] }] })

    expect(list.items).toHaveLength(1)
    expect(list.items[0].entryId).toBe("entry-1")
  })

  it("normalizes strategy validation checks", () => {
    expect(
      normalizeStrategyValidationCheck({
        validation_status: "invalid",
        validation_message: "Syntax error: expected ':' at line 1, column 19",
        line: 1,
        column: 19,
      }),
    ).toEqual({
      validationStatus: "invalid",
      validationMessage: "Syntax error: expected ':' at line 1, column 19",
      line: 1,
      column: 19,
    })

    expect(
      normalizeStrategyValidationCheck({
        validationStatus: "valid",
        validationMessage: null,
        line: null,
        column: null,
      }),
    ).toEqual({
      validationStatus: "valid",
      validationMessage: null,
      line: null,
      column: null,
    })
  })

  it("normalizes strategy group summaries from snake_case rows", () => {
    const group = normalizeStrategyGroupSummary(
      {
        id: "group-1",
        name: "Trend Group",
        slug: "trend-group",
        description: "Momentum strategies",
        metadata: { owner: "qa" },
      },
      [
        { id: "strategy-1", strategy_group_id: "group-1", status: "active" },
        { id: "strategy-2", strategy_group_id: "group-1", status: "draft" },
        { id: "strategy-3", strategy_group_id: "group-2", status: "active" },
      ],
    )

    expect(group).toEqual({
      id: "group-1",
      name: "Trend Group",
      slug: "trend-group",
      description: "Momentum strategies",
      metadata: { owner: "qa" },
      strategyCount: 2,
      activeStrategyCount: 1,
    })
  })

  it("normalizes strategy details and versions", () => {
    const strategy = normalizeStrategyDetail({
      id: "strategy-1",
      strategy_group_id: "group-1",
      name: "Supertrend",
      slug: "supertrend",
      description: "TradeLab trend follower",
      status: "active",
      current_version_id: "version-2",
      runtime_config: {
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        start_at: "2026-01-01T00:00:00Z",
        end_at: "2026-01-02T00:00:00Z",
        initial_equity: 1000,
        fee_bps: 10,
        slippage_bps: 5,
      },
      risk_config: {
        max_order_percent: 10,
        max_position_percent: 100,
        max_drawdown_percent: 15,
        min_notional: 10,
        step_size: 0.001,
        tick_size: 0.01,
      },
      metadata: { note: "ok" },
      versions: [
        {
          id: "version-1",
          strategy_id: "strategy-1",
          version_number: 1,
          validation_status: "draft",
          validation_message: null,
          source_code: "print('draft')",
          source_hash: "hash-1",
          created_at: "2026-01-01T00:00:00Z",
        },
        {
          id: "version-2",
          strategy_id: "strategy-1",
          version_number: 2,
          validation_status: "valid",
          validation_message: "ok",
          source_code: "print('live')",
          source_hash: "hash-2",
          created_at: "2026-01-02T00:00:00Z",
        },
      ],
    })

    expect(strategy.currentVersionId).toBe("version-2")
    expect(strategy.versionCount).toBe(2)
    expect(strategy.runtimeConfig.startAt).toBe("2026-01-01T00:00:00Z")
    expect(strategy.riskConfig.maxOrderPercent).toBe(10)
    expect(strategy.metadata).toEqual({ note: "ok" })
    expect(strategy.versions[1]).toEqual({
      id: "version-2",
      strategyId: "strategy-1",
      versionNumber: 2,
      validationStatus: "valid",
      validationMessage: "ok",
      sourceCode: "print('live')",
      sourceHash: "hash-2",
      createdAt: "2026-01-02T00:00:00Z",
    })
  })

  it("normalizes strategy summaries and version counts", () => {
    const summary = normalizeStrategySummary({
      id: "strategy-1",
      strategy_group_id: "group-1",
      name: "Supertrend",
      slug: "supertrend",
      description: "TradeLab trend follower",
      status: "active",
      current_version_id: "version-2",
      runtime_config: {},
      risk_config: {},
      versions: [
        { id: "version-1", strategy_id: "strategy-1", version_number: 1 },
        { id: "version-2", strategy_id: "strategy-1", version_number: 2 },
      ],
    })

    expect(summary.versionCount).toBe(2)
    expect(summary.currentVersionId).toBe("version-2")
  })

  it("normalizes backtest execution payloads", () => {
    const execution = normalizeBacktestExecution({
      status: "completed",
      bot_run: { id: "run-1" },
      result: {
        metrics: {
          initial_equity: 1000,
          final_equity: 1000,
          total_return_pct: 0,
          max_drawdown_pct: 0,
          profit_factor: null,
          win_rate_pct: null,
          total_trades: 0,
          closed_trades: 0,
        },
        equity_curve: [{ timestamp: "2026-01-01T00:00:00Z", equity: 1000, drawdown_pct: 0 }],
      },
      logs: [
        {
          id: "log-1",
          created_at: "2026-01-01T00:00:00Z",
          level: "info",
          event_type: "RUN_STARTED",
          message: "Backtest started.",
          payload: { candles: 2 },
        },
      ],
      trade_orders: [
        {
          id: "order-1",
          created_at: "2026-01-01T00:00:01Z",
          side: "buy",
          order_type: "market",
          status: "filled",
          fill_price: 100,
          fill_qty: 1,
          fill_notional: 100,
          fee_amount: 0.1,
          reason: null,
          payload: { candleIndex: 1 },
        },
      ],
      stop_reason: null,
      error_message: null,
    })

    expect(execution.runId).toBe("run-1")
    expect(execution.status).toBe("completed")
    expect(execution.metrics?.closedTrades).toBe(0)
    expect(execution.logs[0]?.eventType).toBe("RUN_STARTED")
    expect(execution.orders[0]?.status).toBe("filled")
    expect(execution.equityCurve[0]?.drawdownPct).toBe(0)
  })

  it("normalizes preflight, pipeline, chart, and run detail payloads", () => {
    const preflight = normalizePreflightResult({
      dataset_key: "binance:BTCUSDT:1h",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      requested_start_at: "2026-01-01T00:00:00Z",
      requested_end_at: "2026-01-02T00:00:00Z",
      outcome: "needs_fill",
      action: "fill",
      reasons: ["Missing head range"],
      coverage: {
        dataset_key: "binance:BTCUSDT:1h",
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        health_status: "incomplete",
        earliest_open_time: "2026-01-01T00:00:00Z",
        latest_open_time: "2026-01-02T00:00:00Z",
        covered_start_at: "2026-01-01T01:00:00Z",
        covered_end_at: "2026-01-02T00:00:00Z",
        segment_count: 1,
        gap_count: 1,
        segments: [
          {
            start_at: "2026-01-01T01:00:00Z",
            end_at: "2026-01-02T00:00:00Z",
            row_count: 2,
          },
        ],
        metadata: { source: "coverage" },
      },
      missing_segments: [
        { start_at: "2026-01-01T00:00:00Z", end_at: "2026-01-01T01:00:00Z", kind: "fill" },
      ],
      repair_start_at: null,
      repair_end_at: null,
      active_job_id: null,
      active_job_type: null,
      source_blocked: false,
      source_summary: [{ source: "binance", row_count: 24 }],
      provenance_blocked: true,
      provenance_reason_code: "dataset_contains_fixture_rows",
    })!
    expect(preflight.sourceSummary).toEqual([{ source: "binance", rowCount: 24 }])
    expect(preflight.provenanceBlocked).toBe(true)
    expect(preflight.provenanceReasonCode).toBe("dataset_contains_fixture_rows")
    const pipeline = normalizeRunPipeline({
      run: {
        id: "run-1",
        strategy_id: "strategy-1",
        strategy_version_id: "version-1",
        status: "queued",
        pipeline_status: "queued",
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        start_at: "2026-01-01T00:00:00Z",
        end_at: "2026-01-02T00:00:00Z",
        created_at: "2026-01-01T00:00:00Z",
      },
      preflight,
      data_job: {
        id: "job-1",
        dataset_key: "binance:BTCUSDT:1h",
        job_type: "fill",
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        requested_start_at: "2026-01-01T00:00:00Z",
        requested_end_at: "2026-01-02T00:00:00Z",
        status: "running",
        rows_imported: 2,
        created_at: "2026-01-01T00:00:00Z",
      },
      backtest_job: { id: "backtest-1" },
      status: "running",
      message: "Data job active",
    })!
    const chart = normalizeRunChart({
      candles: [
        {
          open_time: "2026-01-01T00:00:00Z",
          close_time: "2026-01-01T01:00:00Z",
          open: 100,
          high: 105,
          low: 99,
          close: 104,
          volume: 10,
        },
      ],
      markers: [
        {
          id: "marker-1",
          timestamp: "2026-01-01T00:30:00Z",
          kind: "buy",
          side: "buy",
          price: 100,
          quantity: 1,
          trade_order_id: "order-1",
          strategy_signal_id: "signal-1",
          message: "Entry",
          payload: {},
          signal: { id: "signal-1" },
        },
      ],
      equity_curve: [{ timestamp: "2026-01-01T00:00:00Z", equity: 1000, drawdown_pct: 0 }],
      selected_trade: {
        marker: {
          id: "marker-1",
          timestamp: "2026-01-01T00:30:00Z",
          kind: "buy",
          side: "buy",
          price: 100,
          quantity: 1,
          trade_order_id: "order-1",
          strategy_signal_id: "signal-1",
          message: "Entry",
          payload: {},
          signal: { id: "signal-1" },
        },
        order: { id: "order-1" },
        signal: { id: "signal-1" },
        logs: [],
      },
    })!
    const runDetail = normalizeRunDetail({
      id: "run-1",
      bot_id: "bot-1",
      strategy_id: "strategy-1",
      strategy_version_id: "version-1",
      status: "completed",
      pipeline_status: "completed",
      started_at: "2026-01-01T00:00:00Z",
      finished_at: "2026-01-01T01:00:00Z",
      error_message: null,
      stop_reason: null,
      snapshot: {
        source_snapshot: { sourceCode: "print('snapshot')" },
        dataset_context: { exchange: "binance" },
        pipeline_context: { status: "completed" },
      },
      pipeline,
      result: {
        metrics: {
          initial_equity: 1000,
          final_equity: 1010,
          total_return_pct: 1,
          max_drawdown_pct: 0.5,
          profit_factor: 1.2,
          win_rate_pct: 55,
          total_trades: 1,
          closed_trades: 1,
        },
        equity_curve: [{ timestamp: "2026-01-01T00:00:00Z", equity: 1010, drawdown_pct: 0 }],
      },
    })!

    expect(preflight.outcome).toBe("needs_fill")
    expect(preflight.coverage?.segmentCount).toBe(1)
    expect(preflight.missingSegments[0]?.kind).toBe("fill")
    expect(pipeline.dataJob?.jobType).toBe("fill")
    expect(chart.selectedTrade?.marker.id).toBe("marker-1")
    expect(runDetail.snapshot?.sourceSnapshot.sourceCode).toContain("snapshot")
    expect(runDetail.pipeline?.status).toBe("running")
  })

  it("normalizes strategy job visibility active, recent, and stale metadata", () => {
    const payload = normalizeStrategyJobVisibility({
      strategy_id: "strategy-1",
      stale_threshold_minutes: 10,
      active: [
        {
          run: {
            id: "run-active",
            strategy_id: "strategy-1",
            strategy_version_id: "version-1",
            status: "queued",
            pipeline_status: "waiting_for_data",
            exchange: "binance",
            symbol: "BTCUSDT",
            timeframe: "1h",
            start_at: "2026-05-17T00:00:00Z",
            end_at: "2026-05-17T01:00:00Z",
            data_job_id: "job-1",
            created_at: "2026-05-17T00:00:00Z",
          },
          preflight: { outcome: "needs_fill", dataset_key: "binance:BTCUSDT:1h" },
          data_job: {
            id: "job-1",
            dataset_key: "binance:BTCUSDT:1h",
            job_type: "fill",
            exchange: "binance",
            symbol: "BTCUSDT",
            timeframe: "1h",
            requested_start_at: "2026-05-17T00:00:00Z",
            requested_end_at: "2026-05-17T01:00:00Z",
            status: "running",
            rows_imported: 0,
            created_at: "2026-05-17T00:00:00Z",
          },
          backtest_job: { id: "run-active" },
          status: "waiting_for_data",
          message: null,
          is_stale: true,
          stale_reason: "active_job_exceeded_stale_threshold",
          last_activity_at: "2026-05-17T00:00:00Z",
        },
      ],
      recent: [
        {
          run: {
            id: "run-recent",
            strategy_id: "strategy-1",
            strategy_version_id: "version-1",
            status: "completed",
            pipeline_status: "completed",
            exchange: "binance",
            symbol: "ETHUSDT",
            timeframe: "1h",
            start_at: "2026-05-17T00:00:00Z",
            end_at: "2026-05-17T01:00:00Z",
            created_at: "2026-05-17T00:00:00Z",
            finished_at: "2026-05-17T01:00:00Z",
          },
          status: "completed",
          is_stale: false,
          stale_reason: null,
          last_activity_at: "2026-05-17T01:00:00Z",
        },
      ],
    })

    expect(payload.strategyId).toBe("strategy-1")
    expect(payload.staleThresholdMinutes).toBe(10)
    expect(payload.active[0]?.run.id).toBe("run-active")
    expect(payload.active[0]?.isStale).toBe(true)
    expect(payload.active[0]?.staleReason).toBe("active_job_exceeded_stale_threshold")
    expect(payload.recent[0]?.run.symbol).toBe("ETHUSDT")
    expect(payload.recent[0]?.isStale).toBe(false)
  })

  it("normalizes dataset coverage catalog payloads from snake_case and camelCase", () => {
    expect(
      normalizeDatasetCoverageItem({
        id: "coverage-1",
        dataset_key: "binance:BTCUSDT:1h",
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        health_status: "healthy",
        earliest_open_time: "2026-01-01T00:00:00Z",
        latest_open_time: "2026-01-07T00:00:00Z",
        covered_start_at: "2026-01-01T00:00:00Z",
        covered_end_at: "2026-01-07T00:00:00Z",
        segment_count: "1",
        gap_count: 0,
        last_checked_at: "2026-05-17T00:00:00Z",
        metadata: { source: "test" },
        segments: [
          {
            id: "segment-1",
            segment_index: 0,
            start_at: "2026-01-01T00:00:00Z",
            end_at: "2026-01-07T00:00:00Z",
            row_count: "145",
          },
        ],
      }),
    ).toEqual({
      id: "coverage-1",
      datasetKey: "binance:BTCUSDT:1h",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      healthStatus: "healthy",
      earliestOpenTime: "2026-01-01T00:00:00Z",
      latestOpenTime: "2026-01-07T00:00:00Z",
      coveredStartAt: "2026-01-01T00:00:00Z",
      coveredEndAt: "2026-01-07T00:00:00Z",
      segmentCount: 1,
      gapCount: 0,
      lastCheckedAt: "2026-05-17T00:00:00Z",
      metadata: { source: "test" },
      segments: [
        {
          id: "segment-1",
          segmentIndex: 0,
          startAt: "2026-01-01T00:00:00Z",
          endAt: "2026-01-07T00:00:00Z",
          rowCount: 145,
        },
      ],
    })

    expect(
      normalizeDatasetCoverageItem({
        id: "coverage-2",
        datasetKey: "binance:ETHUSDT:15m",
        exchange: "binance",
        symbol: "ETHUSDT",
        timeframe: "15m",
        healthStatus: "incomplete",
        segmentCount: 0,
        gapCount: 2,
        lastCheckedAt: null,
        segments: [],
      }),
    ).toMatchObject({
      id: "coverage-2",
      datasetKey: "binance:ETHUSDT:15m",
      healthStatus: "incomplete",
      lastCheckedAt: null,
      segmentCount: 0,
      gapCount: 2,
    })
  })

  it("normalizes dataset fill preview payloads from snake_case and camelCase", () => {
    expect(
      normalizeDatasetFillPreview({
        preview_id: "preview-1",
        generated_at: "2026-05-17T00:00:00Z",
        request_fingerprint: "fingerprint-1",
        dataset_key: "binance:BTCUSDT:1h",
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        requested_range: {
          start_at: "2026-01-01T00:00:00Z",
          end_at: "2026-01-02T00:00:00Z",
        },
        coverage_status: "partial",
        gap_count: "1",
        estimated_rows: "24",
        blocked_reasons: ["active_job_exists"],
        safety_status: "preview_only",
        missing_ranges: [
          {
            start_at: "2026-01-01T00:00:00Z",
            end_at: "2026-01-01T23:00:00Z",
            kind: "tail",
          },
        ],
        active_job_id: "job-1",
        active_job_type: "fill",
      }),
    ).toEqual({
      previewId: "preview-1",
      generatedAt: "2026-05-17T00:00:00Z",
      requestFingerprint: "fingerprint-1",
      datasetKey: "binance:BTCUSDT:1h",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      requestedRange: {
        startAt: "2026-01-01T00:00:00Z",
        endAt: "2026-01-02T00:00:00Z",
      },
      coverageStatus: "partial",
      gapCount: 1,
      estimatedRows: 24,
      blockedReasons: ["active_job_exists"],
      safetyStatus: "preview_only",
      missingRanges: [
        {
          startAt: "2026-01-01T00:00:00Z",
          endAt: "2026-01-01T23:00:00Z",
          kind: "tail",
        },
      ],
      activeJobId: "job-1",
      activeJobType: "fill",
    })

    expect(
      normalizeDatasetFillPreview({
        previewId: "preview-2",
        generatedAt: "2026-05-17T01:00:00Z",
        requestFingerprint: "fingerprint-2",
        datasetKey: "binance:ETHUSDT:15m",
        requestedRange: { startAt: "start", endAt: "end" },
        coverageStatus: "covered",
        gapCount: 0,
        estimatedRows: 0,
        blockedReasons: [],
        missingRanges: [],
      }),
    ).toMatchObject({
      previewId: "preview-2",
      datasetKey: "binance:ETHUSDT:15m",
      coverageStatus: "covered",
      safetyStatus: "preview_only",
    })
  })

  it("normalizes paper session preview payloads from snake_case", () => {
    const result = normalizePaperSessionPreview({
      mode: "paper",
      preview_status: "blocked",
      allowed: false,
      reason_code: "paper_dataset_not_ready",
      failed_gates: [
        {
          gate: "dataset",
          reason_code: "paper_dataset_not_ready",
          message: "Dataset preflight is blocked.",
          data: { outcome: "blocked" },
        },
      ],
      warnings: ["Dataset has gaps."],
      details: { source: "strategy_lab" },
      safety_status: "preview_only",
      bot_context: {
        bot_id: "paper-bot-1",
        mode: "paper",
        status: "draft",
        symbol: "BTCUSDT",
        timeframe: "1h",
      },
      strategy_context: {
        strategy_id: "strategy-1",
        strategy_version_id: "version-1",
        source_valid: true,
        version_locked: true,
        dirty: false,
      },
      dataset_context: {
        dataset_key: "binance:BTCUSDT:1h",
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        start_at: "2026-01-01T00:00:00Z",
        end_at: "2026-01-02T00:00:00Z",
        preflight_outcome: "blocked",
      },
    })

    expect(result).toEqual({
      mode: "paper",
      previewStatus: "blocked",
      allowed: false,
      reasonCode: "paper_dataset_not_ready",
      failedGates: [
        {
          gate: "dataset",
          reasonCode: "paper_dataset_not_ready",
          message: "Dataset preflight is blocked.",
          data: { outcome: "blocked" },
        },
      ],
      warnings: ["Dataset has gaps."],
      details: { source: "strategy_lab" },
      safetyStatus: "preview_only",
      botContext: {
        botId: "paper-bot-1",
        mode: "paper",
        status: "draft",
        symbol: "BTCUSDT",
        timeframe: "1h",
      },
      strategyContext: {
        strategyId: "strategy-1",
        strategyVersionId: "version-1",
        sourceValid: true,
        versionLocked: true,
        dirty: false,
      },
      datasetContext: {
        datasetKey: "binance:BTCUSDT:1h",
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        startAt: "2026-01-01T00:00:00Z",
        endAt: "2026-01-02T00:00:00Z",
        preflightOutcome: "blocked",
      },
    })
  })

  it("normalizes paper session preview payloads from camelCase and defaults missing arrays", () => {
    const result = normalizePaperSessionPreview({
      mode: "paper",
      previewStatus: "allowed",
      allowed: true,
      reasonCode: "paper_preview_allowed",
      safetyStatus: "preview_only",
      botContext: {
        botId: "paper-bot-2",
        mode: "paper",
        status: "draft",
        symbol: "ETHUSDT",
        timeframe: "4h",
      },
      strategyContext: {
        strategyId: null,
        strategyVersionId: null,
        sourceValid: true,
        versionLocked: true,
        dirty: false,
      },
      datasetContext: {
        datasetKey: "binance:ETHUSDT:4h",
        exchange: "binance",
        symbol: "ETHUSDT",
        timeframe: "4h",
        startAt: "2026-01-01T00:00:00Z",
        endAt: "2026-01-03T00:00:00Z",
        preflightOutcome: "ready",
      },
    })

    expect(result.allowed).toBe(true)
    expect(result.previewStatus).toBe("allowed")
    expect(result.reasonCode).toBe("paper_preview_allowed")
    expect(result.failedGates).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.details).toEqual({})
    expect(result.botContext.botId).toBe("paper-bot-2")
    expect(result.datasetContext.datasetKey).toBe("binance:ETHUSDT:4h")
  })

  it("normalizes paper session observability summaries from snake case", () => {
    const result = normalizePaperSessionObservability({
      safety_status: "read_only_paper_session_observability",
      has_more: false,
      items: [
        {
          session_id: "paper-session-1",
          status: "completed",
          reason_code: "paper_engine_completed",
          safety_status: "read_only_paper_session_observability",
          strategy_id: "strategy-1",
          strategy_version_id: "version-1",
          dataset_key: "binance:BTCUSDT:1h",
          exchange: "binance",
          symbol: "BTCUSDT",
          timeframe: "1h",
          start_at: "2026-01-01T00:00:00Z",
          end_at: "2026-01-01T02:00:00Z",
          created_at: "2026-01-01T00:00:01Z",
          started_at: "2026-01-01T00:00:02Z",
          finished_at: "2026-01-01T00:00:05Z",
          error_message: null,
          artifact_counts: {
            orders: "2",
            fills: 1,
            positions: 1,
            portfolio_snapshots: 3,
            audit_events: 4,
          },
          latest_audit: {
            audit_event_id: "audit-1",
            event_at: "2026-01-01T00:00:05Z",
            action: "paper_session_completed",
            reason_code: "paper_engine_completed",
            new_state: "completed",
            actor: "local-worker",
            metadata: { safe: "visible" },
          },
          gate_summary: {
            failed_gate_count: 0,
            failed_gate_reasons: [],
            blocked_reason_code: null,
          },
        },
      ],
    })

    expect(result.safetyStatus).toBe("read_only_paper_session_observability")
    expect(result.hasMore).toBe(false)
    expect(result.items[0]?.sessionId).toBe("paper-session-1")
    expect(result.items[0]?.artifactCounts.orders).toBe(2)
    expect(result.items[0]?.artifactCounts.portfolioSnapshots).toBe(3)
    expect(result.items[0]?.latestAudit?.action).toBe("paper_session_completed")
    expect(result.items[0]?.gateSummary.failedGateReasons).toEqual([])
  })

  it("normalizes queued paper session start payloads from snake_case", () => {
    const result = normalizePaperSessionStart({
      session_id: "paper-session-1",
      status: "queued",
      allowed: true,
      reason_code: "paper_session_queued",
      safety_status: "paper_start_accepted",
      request_fingerprint: "paper-start:fingerprint",
      idempotency_key: "strategy-lab:123:abc",
      failed_gates: [],
      warnings: ["risk policy normalized"],
      details: { gate: "passed" },
      dataset_context: {
        dataset_key: "binance:BTCUSDT:1h",
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        start_at: "2026-01-01T00:00:00Z",
        end_at: "2026-01-02T00:00:00Z",
      },
      gate_context: {
        idempotencyKey: "strategy-lab:123:abc",
        requestFingerprint: "paper-start:fingerprint",
      },
      audit_event_ids: ["audit-1"],
    })

    expect(result.sessionId).toBe("paper-session-1")
    expect(result.status).toBe("queued")
    expect(result.allowed).toBe(true)
    expect(result.reasonCode).toBe("paper_session_queued")
    expect(result.datasetContext.datasetKey).toBe("binance:BTCUSDT:1h")
    expect(result.auditEventIds).toEqual(["audit-1"])
  })

  it("normalizes blocked paper session start payloads from camelCase", () => {
    const result = normalizePaperSessionStart({
      sessionId: null,
      status: "blocked",
      allowed: false,
      reasonCode: "paper_dataset_not_ready",
      safetyStatus: "paper_start_blocked",
      requestFingerprint: "paper-start:fingerprint",
      idempotencyKey: "strategy-lab:123:abc",
      failedGates: [
        {
          gate: "dataset",
          reasonCode: "paper_dataset_not_ready",
          message: "Dataset must be ready for the requested paper range.",
          data: { sourceReasonCode: "needs_fill" },
        },
      ],
      warnings: [],
      details: {},
      datasetContext: {
        datasetKey: "binance:BTCUSDT:1h",
      },
      gateContext: {},
      auditEventIds: [],
    })

    expect(result.sessionId).toBeNull()
    expect(result.status).toBe("blocked")
    expect(result.allowed).toBe(false)
    expect(result.reasonCode).toBe("paper_dataset_not_ready")
    expect(result.failedGates).toEqual([
      {
        gate: "dataset",
        reasonCode: "paper_dataset_not_ready",
        message: "Dataset must be ready for the requested paper range.",
        data: { sourceReasonCode: "needs_fill" },
      },
    ])
    expect(result.datasetContext.datasetKey).toBe("binance:BTCUSDT:1h")
    expect(result.auditEventIds).toEqual([])
  })

  it("normalizes paper session detail payloads from snake_case with artifacts", () => {
    const result = normalizePaperSessionDetail({
      session: {
        session_id: "paper-session-1",
        bot_id: "paper-bot-1",
        strategy_id: "strategy-1",
        strategy_version_id: "version-1",
        mode: "paper",
        status: "completed",
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        dataset_key: "binance:BTCUSDT:1h",
        start_at: "2026-01-01T00:00:00Z",
        end_at: "2026-01-02T00:00:00Z",
        started_at: "2026-01-02T00:00:01Z",
        finished_at: "2026-01-02T00:00:05Z",
        cancel_requested_at: null,
        starting_cash: "1000.00",
        reason_code: "paper_engine_completed",
        error_message: null,
      },
      dataset_context: { dataset_key: "binance:BTCUSDT:1h" },
      gate_context: { paperEngineSummary: { candlesProcessed: 3 } },
      audit_events: [
        {
          audit_event_id: "audit-1",
          event_at: "2026-01-02T00:00:05Z",
          actor: "local-worker",
          action: "paper_session_completed",
          target_type: "paper_session",
          target_id: "paper-session-1",
          old_state: "running",
          new_state: "completed",
          reason_code: "paper_engine_completed",
          correlation_id: null,
          request_id: null,
          metadata: { apiSecret: "[REDACTED]" },
          created_at: "2026-01-02T00:00:05Z",
          created_by: "local-worker",
        },
      ],
      artifacts: {
        orders: [
          {
            order_id: "order-1",
            side: "buy",
            order_type: "market",
            status: "filled",
            quantity: "0.5",
            requested_price: "100.25",
            requested_notional: "50.125",
            submitted_at: "2026-01-02T00:00:02Z",
            finalized_at: "2026-01-02T00:00:03Z",
            reason_code: null,
            metadata: {},
          },
        ],
        fills: [
          {
            fill_id: "fill-1",
            paper_order_id: "order-1",
            source_candle_id: "candle-1",
            fill_time: "2026-01-02T00:00:03Z",
            side: "buy",
            price: "100.25",
            quantity: "0.5",
            notional: "50.125",
            fee_amount: "0",
            fee_asset: "USDT",
            slippage_amount: "0",
            metadata: {},
          },
        ],
        positions: [
          {
            position_id: "position-1",
            symbol: "BTCUSDT",
            side: "long",
            status: "open",
            quantity: "0.5",
            average_entry_price: "100.25",
            realized_pnl: "0",
            unrealized_pnl: "5.5",
            opened_at: "2026-01-02T00:00:03Z",
            closed_at: null,
            metadata: {},
          },
        ],
        portfolio_snapshots: [
          {
            snapshot_id: "snapshot-1",
            source_candle_id: "candle-1",
            snapshot_at: "2026-01-02T00:00:04Z",
            cash_balance: "949.875",
            equity: "1005.5",
            realized_pnl: "0",
            unrealized_pnl: "5.5",
            fees_paid: "0",
            drawdown_pct: "0",
            exposure_notional: "55.625",
            metadata: {},
          },
        ],
        limits: {
          orders: 100,
          fills: 100,
          positions: 20,
          portfolio_snapshots: 100,
          audit_events: 20,
        },
      },
      safety_status: "read_only_paper_session_detail",
    })

    expect(result.session.sessionId).toBe("paper-session-1")
    expect(result.session.startingCash).toBe(1000)
    expect(result.auditEvents[0].action).toBe("paper_session_completed")
    expect(result.auditEvents[0].metadata.apiSecret).toBe("[REDACTED]")
    expect(result.artifacts.orders[0].quantity).toBe(0.5)
    expect(result.artifacts.fills[0].notional).toBe(50.125)
    expect(result.artifacts.positions[0].unrealizedPnl).toBe(5.5)
    expect(result.artifacts.portfolioSnapshots[0].equity).toBe(1005.5)
    expect(result.artifacts.limits.portfolioSnapshots).toBe(100)
    expect(result.safetyStatus).toBe("read_only_paper_session_detail")
  })

  it("normalizes paper session detail payloads from camelCase and defaults missing artifact arrays", () => {
    const result = normalizePaperSessionDetail({
      session: {
        sessionId: "paper-session-2",
        status: "queued",
        datasetKey: "binance:ETHUSDT:4h",
        startingCash: 500,
      },
      artifacts: {
        limits: {
          orders: 10,
          fills: 11,
          positions: 12,
          portfolioSnapshots: 13,
          auditEvents: 14,
        },
      },
      safetyStatus: "read_only_paper_session_detail",
    })

    expect(result.session.sessionId).toBe("paper-session-2")
    expect(result.session.status).toBe("queued")
    expect(result.session.datasetKey).toBe("binance:ETHUSDT:4h")
    expect(result.session.startingCash).toBe(500)
    expect(result.auditEvents).toEqual([])
    expect(result.artifacts.orders).toEqual([])
    expect(result.artifacts.fills).toEqual([])
    expect(result.artifacts.positions).toEqual([])
    expect(result.artifacts.portfolioSnapshots).toEqual([])
    expect(result.artifacts.limits.auditEvents).toBe(14)
  })

  it("normalizes strategy versions directly", () => {
    expect(
      normalizeStrategyVersion({
        id: "version-1",
        strategy_id: "strategy-1",
        version_number: 1,
        validation_status: "draft",
        validation_message: null,
        source_code: "print('ok')",
        source_hash: "hash-1",
        created_at: "2026-01-01T00:00:00Z",
      }),
    ).toEqual({
      id: "version-1",
      strategyId: "strategy-1",
      versionNumber: 1,
      validationStatus: "draft",
      validationMessage: null,
      sourceCode: "print('ok')",
      sourceHash: "hash-1",
      createdAt: "2026-01-01T00:00:00Z",
    })
  })

  it("normalizes run analysis payloads", () => {
    const analysis = normalizeRunAnalysis({
      run: {
        id: "run-1",
        bot_id: "bot-1",
        strategy_id: "strategy-1",
        strategy_version_id: "version-1",
        status: "completed",
        pipeline_status: "completed",
        started_at: "2026-01-01T00:00:00Z",
        finished_at: "2026-01-01T01:00:00Z",
        error_message: null,
        stop_reason: null,
        snapshot: {
          source_snapshot: { sourceCode: "print('snapshot')", strategyVersionId: "version-1" },
          dataset_context: {
            exchange: "binance",
            symbol: "BTCUSDT",
            timeframe: "1h",
            requestedStartAt: "2026-01-01T00:00:00Z",
            requestedEndAt: "2026-01-02T00:00:00Z",
            sourceHash: "hash-1",
            strategyVersionId: "version-1",
          },
          pipeline_context: {},
        },
      },
      result: {
        id: "result-1",
        bot_run_id: "run-1",
        initial_equity: 1000,
        final_equity: 1050,
        total_return_pct: 5,
        max_drawdown_pct: 2,
        profit_factor: 1.4,
        win_rate_pct: 60,
        total_trades: 1,
        metrics: {
          initial_equity: 1000,
          final_equity: 1050,
          total_return_pct: 5,
          max_drawdown_pct: 2,
          profit_factor: 1.4,
          win_rate_pct: 60,
          total_trades: 1,
          closed_trades: 1,
        },
        equity_curve: [{ timestamp: "2026-01-01T00:00:00Z", equity: 1000, drawdown_pct: 0 }],
        created_at: "2026-01-01T01:00:00Z",
      },
      snapshot: {
        source_snapshot: { sourceCode: "print('snapshot')", strategyVersionId: "version-1" },
        dataset_context: {
          exchange: "binance",
          symbol: "BTCUSDT",
          timeframe: "1h",
          requestedStartAt: "2026-01-01T00:00:00Z",
          requestedEndAt: "2026-01-02T00:00:00Z",
          sourceHash: "hash-1",
          strategyVersionId: "version-1",
        },
        pipeline_context: {},
      },
      runtime_config: {
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        startAt: "2026-01-01T00:00:00Z",
        endAt: "2026-01-02T00:00:00Z",
        initialEquity: 1000,
        feeBps: 0,
        slippageBps: 0,
      },
      risk_config: {
        maxOrderPercent: 10,
        maxPositionPercent: 100,
        maxDrawdownPercent: 15,
        minNotional: 10,
        stepSize: 0.001,
        tickSize: 0.01,
      },
      dataset_context: {
        dataset_key: "binance:BTCUSDT:1h",
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        requested_start_at: "2026-01-01T00:00:00Z",
        requested_end_at: "2026-01-02T00:00:00Z",
        source_hash: "hash-1",
        strategy_version_id: "version-1",
        coverage: null,
      },
      trade_summary: {
        total_trades: 1,
        closed_trades: 1,
        open_trades: 0,
        winning_trades: 1,
        losing_trades: 0,
        break_even_trades: 0,
        realized_pnl: 50,
        average_pnl: 50,
        average_pnl_pct: 5,
        average_duration_seconds: 3600,
        win_rate_pct: 100,
        profit_factor: 2,
      },
      trades: [
        {
          id: "trade-1",
          entry_order_id: "entry-1",
          exit_order_id: "exit-1",
          entry_time: "2026-01-01T00:10:00Z",
          exit_time: "2026-01-01T00:50:00Z",
          side: "buy",
          status: "closed",
          entry_price: 100,
          exit_price: 110,
          quantity: 1,
          pnl: 10,
          pnl_pct: 10,
          duration_seconds: 2400,
          entry_signal_id: "signal-1",
          exit_signal_id: "signal-2",
          entry_reason: "Entry",
          exit_reason: "Exit",
        },
      ],
    })

    expect(analysis?.run.id).toBe("run-1")
    expect(analysis?.result?.metrics.closedTrades).toBe(1)
    expect(analysis?.datasetContext.strategyVersionId).toBe("version-1")
    expect(analysis?.tradeSummary.totalTrades).toBe(1)
    expect(analysis?.trades[0]?.id).toBe("trade-1")
  })

  it("normalizes selected trade execution details", () => {
    const detail = normalizeSelectedTradeExecutionDetail({
      trade: {
        id: "trade-1",
        entry_order_id: "entry-1",
        exit_order_id: "exit-1",
        entry_time: "2026-01-01T00:10:00Z",
        exit_time: "2026-01-01T00:50:00Z",
        side: "buy",
        status: "closed",
        entry_price: 100,
        exit_price: 110,
        quantity: 1,
        pnl: 10,
        pnl_pct: 10,
        duration_seconds: 2400,
        entry_signal_id: "signal-1",
        exit_signal_id: "signal-2",
        entry_reason: "Entry",
        exit_reason: "Exit",
      },
      entry_order: {
        id: "entry-1",
        created_at: "2026-01-01T00:10:00Z",
        side: "buy",
        order_type: "market",
        status: "filled",
        fill_price: 100,
        fill_qty: 1,
        fill_notional: 100,
        fee_amount: 0.1,
        reason: "Entry",
        payload: {},
      },
      exit_order: {
        id: "exit-1",
        created_at: "2026-01-01T00:50:00Z",
        side: "sell",
        order_type: "market",
        status: "filled",
        fill_price: 110,
        fill_qty: 1,
        fill_notional: 110,
        fee_amount: 0.1,
        reason: "Exit",
        payload: {},
      },
      entry_signal: { id: "signal-1", signal_type: "entry", candle_open_time: "2026-01-01T00:10:00Z" },
      exit_signal: { id: "signal-2", signal_type: "exit", candle_open_time: "2026-01-01T00:50:00Z" },
      logs: [
        {
          id: "log-1",
          created_at: "2026-01-01T00:10:00Z",
          level: "info",
          event_type: "TRADE_OPENED",
          message: "Trade opened.",
          payload: {},
        },
      ],
    })

    expect(detail?.trade.id).toBe("trade-1")
    expect(detail?.entryOrder?.id).toBe("entry-1")
    expect(detail?.exitSignal?.id).toBe("signal-2")
    expect(detail?.logs[0]?.eventType).toBe("TRADE_OPENED")
  })

  it("normalizes run analysis positions and futures summary fields", () => {
    const result = normalizeRunAnalysis({
      run: { id: "run-1", strategyId: "strategy-1", strategyVersionId: "version-1", runType: "backtest", status: "completed", pipelineStatus: "completed", exchange: "binance", symbol: "BTCUSDT", timeframe: "1h", startAt: "2026-01-01T00:00:00Z", endAt: "2026-01-02T00:00:00Z", createdAt: "2026-01-02T00:00:00Z" },
      snapshot: { sourceSnapshot: {}, datasetContext: {}, pipelineContext: {} },
      runtimeConfig: { exchange: "binance", symbol: "BTCUSDT", timeframe: "1h", startAt: "2026-01-01T00:00:00Z", endAt: "2026-01-02T00:00:00Z", initialEquity: 1000, feeBps: 0, slippageBps: 0 },
      riskConfig: {},
      datasetContext: { datasetKey: "binance:BTCUSDT:1h", exchange: "binance", symbol: "BTCUSDT", timeframe: "1h", requestedStartAt: null, requestedEndAt: null, sourceHash: null, strategyVersionId: null, coverage: null },
      tradeSummary: { totalTrades: 0, closedTrades: 0, openTrades: 0, winningTrades: 0, losingTrades: 0, breakEvenTrades: 0, realizedPnl: 0, averagePnl: null, averagePnlPct: null, averageDurationSeconds: null, winRatePct: null, profitFactor: null },
      trades: [],
      positions: [
        {
          id: "pos-1",
          runId: "run-1",
          symbol: "BTCUSDT",
          side: "LONG",
          size: 1,
          leverage: 10,
          entryPrice: 100,
          closePrice: 105,
          liquidationPrice: 90,
          marginMode: "CROSS",
          maintenanceMargin: 2.5,
          fundingFeePaid: 12.5,
          maxNotional: 105,
          maxMarginUsed: 20,
          peakLeverageUsed: 10,
          realizedPnl: 5,
          status: "CLOSED",
        },
      ],
      totalFundingFeePaid: 12.5,
      futuresSummary: {
        totalFundingFeePaid: 12.5,
        totalFundingFeeReceived: 0,
        liquidationCount: 1,
        longTrades: 1,
        shortTrades: 0,
        longWinRate: 100,
        shortWinRate: null,
        avgLeverageUsed: 10,
        maxMarginUsagePct: 72,
        maxMaintenanceMarginPct: 19.5,
      },
    })

    expect(result?.positions[0].marginMode).toBe("CROSS")
    expect(result?.positions[0].fundingFeePaid).toBe(12.5)
    expect(result?.totalFundingFeePaid).toBe(12.5)
    expect(result?.futuresSummary?.maxMarginUsagePct).toBe(72)
  })
})
