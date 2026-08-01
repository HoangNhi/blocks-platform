import { describe, expect, it } from "vitest"

import { buildDatasetFreshnessSignals, type DatasetFreshnessSignal } from "./dataset-freshness-signals"

const now = new Date("2026-05-17T12:00:00Z")

function signal(
  overrides: Parameters<typeof buildDatasetFreshnessSignals>[0],
  id: DatasetFreshnessSignal["id"],
) {
  const result = buildDatasetFreshnessSignals({ now, ...overrides }).find((candidate) => candidate.id === id)
  expect(result).toBeTruthy()
  return result!
}

describe("buildDatasetFreshnessSignals", () => {
  it("returns four signals in stable order", () => {
    const result = buildDatasetFreshnessSignals({
      coveredEndAt: "2026-01-07T00:00:00Z",
      latestOpenTime: "2026-01-07T00:00:00Z",
      lastCheckedAt: "2026-05-17T11:59:00Z",
      gapCount: 0,
      segmentCount: 1,
      requestedEndAt: "2026-01-07T00:00:00Z",
      now,
    })

    expect(result.map((candidate) => candidate.id)).toEqual([
      "freshness",
      "check_age",
      "gap_severity",
      "coverage_end",
    ])
  })

  it("marks freshness pass when covered end reaches requested end", () => {
    expect(
      signal(
        {
          coveredEndAt: "2026-01-07T00:00:00Z",
          latestOpenTime: null,
          requestedEndAt: "2026-01-07T00:00:00Z",
        },
        "freshness",
      ),
    ).toMatchObject({
      status: "pass",
      tone: "ok",
      reason: "fresh",
    })
  })

  it("marks freshness warning when coverage is stale by less than or equal to twenty four hours", () => {
    expect(
      signal(
        {
          coveredEndAt: "2026-01-06T01:00:00Z",
          requestedEndAt: "2026-01-07T00:00:00Z",
        },
        "freshness",
      ),
    ).toMatchObject({
      status: "warning",
      tone: "warning",
      reason: "slightly_stale",
    })
  })

  it("marks freshness fail when coverage is stale by more than twenty four hours", () => {
    expect(
      signal(
        {
          latestOpenTime: "2026-01-05T23:59:00Z",
          requestedEndAt: "2026-01-07T00:00:00Z",
        },
        "freshness",
      ),
    ).toMatchObject({
      status: "fail",
      tone: "danger",
      reason: "stale",
    })
  })

  it("marks freshness unknown when timestamps are missing or invalid", () => {
    expect(signal({ coveredEndAt: "not-a-date", requestedEndAt: "2026-01-07T00:00:00Z" }, "freshness")).toMatchObject({
      status: "unknown",
      tone: "info",
      reason: "missing_freshness_timestamps",
    })
    expect(signal({ coveredEndAt: "2026-01-07T00:00:00Z", requestedEndAt: null }, "freshness")).toMatchObject({
      status: "unknown",
      reason: "missing_freshness_timestamps",
    })
  })

  it("marks check age pass for recent last checked timestamp", () => {
    expect(signal({ lastCheckedAt: "2026-05-17T11:55:00Z" }, "check_age")).toMatchObject({
      status: "pass",
      tone: "ok",
      reason: "recently_checked",
    })
  })

  it("marks check age warning for stale last checked timestamp", () => {
    expect(signal({ lastCheckedAt: "2026-05-17T11:49:00Z" }, "check_age")).toMatchObject({
      status: "warning",
      tone: "warning",
      reason: "check_stale",
    })
  })

  it("marks check age unknown when last checked timestamp is missing or invalid", () => {
    expect(signal({ lastCheckedAt: null }, "check_age")).toMatchObject({
      status: "unknown",
      tone: "info",
      reason: "missing_last_checked_at",
    })
    expect(signal({ lastCheckedAt: "not-a-date" }, "check_age")).toMatchObject({
      status: "unknown",
      reason: "missing_last_checked_at",
    })
  })

  it("marks gap severity pass when no gaps are present", () => {
    expect(signal({ gapCount: 0, segmentCount: 4 }, "gap_severity")).toMatchObject({
      status: "pass",
      tone: "ok",
      reason: "no_gaps",
    })
  })

  it("marks gap severity warning for a small gap count", () => {
    expect(signal({ gapCount: 2, segmentCount: 10 }, "gap_severity")).toMatchObject({
      status: "warning",
      tone: "warning",
      reason: "few_gaps",
    })
  })

  it("marks gap severity fail for many gaps or high gap ratio", () => {
    expect(signal({ gapCount: 5, segmentCount: 20 }, "gap_severity")).toMatchObject({
      status: "fail",
      tone: "danger",
      reason: "many_gaps",
    })
    expect(signal({ gapCount: 2, segmentCount: 4 }, "gap_severity")).toMatchObject({
      status: "fail",
      tone: "danger",
      reason: "many_gaps",
    })
  })

  it("marks gap severity unknown when gap count is missing or invalid", () => {
    expect(signal({ gapCount: null, segmentCount: 1 }, "gap_severity")).toMatchObject({
      status: "unknown",
      tone: "info",
      reason: "missing_gap_counts",
    })
    expect(signal({ gapCount: Number.NaN, segmentCount: 1 }, "gap_severity")).toMatchObject({
      status: "unknown",
      reason: "missing_gap_counts",
    })
  })

  it("marks coverage end pass when covered end or latest open time exists", () => {
    expect(signal({ coveredEndAt: "2026-01-07T00:00:00Z", latestOpenTime: null }, "coverage_end")).toMatchObject({
      status: "pass",
      tone: "ok",
      reason: "coverage_end_available",
    })
    expect(signal({ coveredEndAt: null, latestOpenTime: "2026-01-07T00:00:00Z" }, "coverage_end")).toMatchObject({
      status: "pass",
      reason: "coverage_end_available",
    })
  })

  it("marks coverage end unknown when both end timestamps are missing or invalid", () => {
    expect(signal({ coveredEndAt: null, latestOpenTime: null }, "coverage_end")).toMatchObject({
      status: "unknown",
      tone: "info",
      reason: "missing_coverage_end",
    })
    expect(signal({ coveredEndAt: "invalid", latestOpenTime: null }, "coverage_end")).toMatchObject({
      status: "unknown",
      reason: "missing_coverage_end",
    })
  })
})
