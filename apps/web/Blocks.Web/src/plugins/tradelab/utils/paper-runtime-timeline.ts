import type { TradeLabPaperSessionDetail } from "../types"

export type TradeLabPaperRuntimeTimelineEventKind = "session" | "audit" | "order" | "fill" | "portfolio"

export type TradeLabPaperRuntimeTimelineEvent = {
  id: string
  kind: TradeLabPaperRuntimeTimelineEventKind
  occurredAt: string | null
  title: string
  description: string
  status: string | null
  reasonCode: string | null
  primaryId: string | null
  secondaryId: string | null
  metadata: Record<string, unknown>
}

type SortableTimelineEvent = TradeLabPaperRuntimeTimelineEvent & {
  sortIndex: number
}

const kindSortOrder: Record<TradeLabPaperRuntimeTimelineEventKind, number> = {
  session: 0,
  audit: 1,
  order: 2,
  fill: 3,
  portfolio: 4,
}

export function buildPaperRuntimeTimeline(detail: TradeLabPaperSessionDetail | null): TradeLabPaperRuntimeTimelineEvent[] {
  if (!detail) return []

  const events: SortableTimelineEvent[] = []

  appendSessionEvent(events, detail)
  appendAuditEvents(events, detail)
  appendOrderEvents(events, detail)
  appendFillEvents(events, detail)
  appendPortfolioCheckpointEvents(events, detail)

  return events.sort(compareTimelineEvents).map(toTimelineEvent)
}

function toTimelineEvent(event: SortableTimelineEvent): TradeLabPaperRuntimeTimelineEvent {
  return {
    id: event.id,
    kind: event.kind,
    occurredAt: event.occurredAt,
    title: event.title,
    description: event.description,
    status: event.status,
    reasonCode: event.reasonCode,
    primaryId: event.primaryId,
    secondaryId: event.secondaryId,
    metadata: event.metadata,
  }
}

function appendSessionEvent(events: SortableTimelineEvent[], detail: TradeLabPaperSessionDetail) {
  const occurredAt = detail.session.finishedAt ?? detail.session.startedAt ?? detail.session.cancelRequestedAt
  if (!occurredAt && !detail.session.reasonCode) return

  events.push({
    id: `session-${detail.session.sessionId}-${detail.session.status || "unknown"}`,
    kind: "session",
    occurredAt,
    title: sessionTitle(detail.session.status),
    description: sessionDescription(detail),
    status: detail.session.status || null,
    reasonCode: detail.session.reasonCode,
    primaryId: detail.session.sessionId,
    secondaryId: detail.session.strategyVersionId || detail.session.strategyId || null,
    metadata: {
      datasetKey: detail.session.datasetKey,
      symbol: detail.session.symbol,
      timeframe: detail.session.timeframe,
    },
    sortIndex: events.length,
  })
}

function appendAuditEvents(events: SortableTimelineEvent[], detail: TradeLabPaperSessionDetail) {
  detail.auditEvents.forEach((event) => {
    events.push({
      id: `audit-${event.auditEventId || event.action}-${events.length}`,
      kind: "audit",
      occurredAt: event.eventAt || event.createdAt,
      title: event.action || "Audit event",
      description: describeAuditEvent(event),
      status: event.newState,
      reasonCode: event.reasonCode,
      primaryId: event.auditEventId,
      secondaryId: event.targetId,
      metadata: event.metadata,
      sortIndex: events.length,
    })
  })
}

function appendOrderEvents(events: SortableTimelineEvent[], detail: TradeLabPaperSessionDetail) {
  detail.artifacts.orders.forEach((order) => {
    events.push({
      id: `order-${order.orderId}`,
      kind: "order",
      occurredAt: order.submittedAt ?? order.finalizedAt,
      title: `${titleCase(order.side)} order ${order.status}`,
      description: `Market ${order.side} order for ${formatNumber(order.quantity)} units and ${formatNumber(order.requestedNotional)} notional.`,
      status: order.status,
      reasonCode: order.reasonCode,
      primaryId: order.orderId,
      secondaryId: null,
      metadata: order.metadata,
      sortIndex: events.length,
    })
  })
}

function appendFillEvents(events: SortableTimelineEvent[], detail: TradeLabPaperSessionDetail) {
  detail.artifacts.fills.forEach((fill) => {
    events.push({
      id: `fill-${fill.fillId}`,
      kind: "fill",
      occurredAt: fill.fillTime,
      title: `${titleCase(fill.side)} fill persisted`,
      description: `${formatNumber(fill.quantity)} units at ${formatNumber(fill.price)} for ${formatNumber(fill.notional)} notional.`,
      status: "filled",
      reasonCode: null,
      primaryId: fill.fillId,
      secondaryId: fill.paperOrderId,
      metadata: fill.metadata,
      sortIndex: events.length,
    })
  })
}

function appendPortfolioCheckpointEvents(events: SortableTimelineEvent[], detail: TradeLabPaperSessionDetail) {
  const checkpoints = portfolioCheckpoints(detail.artifacts.portfolioSnapshots)

  checkpoints.forEach(({ snapshot, title }) => {
    events.push({
      id: `portfolio-${snapshot.snapshotId}`,
      kind: "portfolio",
      occurredAt: snapshot.snapshotAt,
      title,
      description: `Equity ${formatNumber(snapshot.equity)}, cash ${formatNumber(snapshot.cashBalance)}, drawdown ${formatNumber(snapshot.drawdownPct)}%.`,
      status: null,
      reasonCode: null,
      primaryId: snapshot.snapshotId,
      secondaryId: snapshot.sourceCandleId,
      metadata: snapshot.metadata,
      sortIndex: events.length,
    })
  })
}

function portfolioCheckpoints(snapshots: TradeLabPaperSessionDetail["artifacts"]["portfolioSnapshots"]) {
  if (snapshots.length === 0) return []

  const first = snapshots[0]
  const last = snapshots[snapshots.length - 1]
  const maxDrawdown = snapshots.reduce(
    (currentMax, snapshot) => (snapshot.drawdownPct > currentMax.drawdownPct ? snapshot : currentMax),
    first,
  )

  const checkpoints = [
    { snapshot: first, title: "Portfolio checkpoint" },
    { snapshot: maxDrawdown, title: "Max drawdown checkpoint" },
    { snapshot: last, title: "Portfolio checkpoint" },
  ]

  const seen = new Set<string>()
  return checkpoints.filter(({ snapshot }) => {
    const key = snapshot.snapshotId || `${snapshot.snapshotAt}-${snapshot.sourceCandleId ?? "none"}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function compareTimelineEvents(left: SortableTimelineEvent, right: SortableTimelineEvent) {
  if (left.occurredAt && right.occurredAt) {
    const timeDelta = new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime()
    if (timeDelta !== 0) return timeDelta
  }

  if (left.occurredAt && !right.occurredAt) return -1
  if (!left.occurredAt && right.occurredAt) return 1

  const kindDelta = kindSortOrder[left.kind] - kindSortOrder[right.kind]
  if (kindDelta !== 0) return kindDelta

  return left.sortIndex - right.sortIndex
}

function sessionTitle(status: string) {
  if (status === "queued") return "Session queued"
  if (status === "running") return "Session running"
  if (status === "completed") return "Session completed"
  if (status === "failed") return "Session failed"
  if (status === "cancelled") return "Session cancelled"
  if (status === "blocked") return "Session blocked"
  return "Session state recorded"
}

function sessionDescription(detail: TradeLabPaperSessionDetail) {
  const status = detail.session.status || "unknown"
  const range = `${detail.session.startAt || "N/A"} to ${detail.session.endAt || "N/A"}`
  return `Paper session ${status} for ${detail.session.datasetKey || "unknown dataset"} over ${range}.`
}

function describeAuditEvent(event: TradeLabPaperSessionDetail["auditEvents"][number]) {
  const state = event.oldState || event.newState ? `${event.oldState ?? "N/A"} -> ${event.newState ?? "N/A"}` : "No state change"
  return `${state}; actor ${event.actor || "unknown"}.`
}

function titleCase(value: string) {
  if (!value) return "Unknown"
  return value.slice(0, 1).toUpperCase() + value.slice(1)
}

function formatNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 }).format(value)
    : "N/A"
}
