import { hermesOverviewSnapshot, type HermesOverviewSnapshot } from "./snapshot"

export type OverviewDataSource = {
  getSnapshot(): HermesOverviewSnapshot
}

export const localSnapshotDataSource: OverviewDataSource = {
  getSnapshot() {
    return hermesOverviewSnapshot
  },
}

export function getOverviewSnapshot(): HermesOverviewSnapshot {
  return localSnapshotDataSource.getSnapshot()
}

export function snapshotFreshnessMinutes(
  _snapshot: HermesOverviewSnapshot,
  _now: Date = new Date(),
): number {
  void _now
  return Number.NaN
}

export function formatAgeLabel(minutes: number): string {
  if (Number.isNaN(minutes) || minutes < 0) return "Unknown"
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.floor(hours / 24)
  return `${days} d ago`
}
