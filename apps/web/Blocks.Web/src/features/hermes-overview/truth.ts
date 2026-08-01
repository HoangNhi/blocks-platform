export type TruthState =
  | "ok"
  | "stale"
  | "unknown"
  | "not_reported"
  | "no_recent_data"

export type ProvenancedField<T> = {
  value: T | null
  state: TruthState
  observedAt?: string
  source?: string
}

export function provenanced<T>(
  value: T,
  extras: Partial<Omit<ProvenancedField<T>, "value" | "state">> = {},
): ProvenancedField<T> {
  return { value, state: "ok", ...extras }
}

export function notReported<T>(
  source: string,
  observedAt?: string,
): ProvenancedField<T> {
  return { value: null, state: "not_reported", source, observedAt }
}

export function unknown<T>(
  reason: string,
  observedAt?: string,
): ProvenancedField<T> {
  return { value: null, state: "unknown", source: reason, observedAt }
}

export function noRecentData<T>(source: string): ProvenancedField<T> {
  return { value: null, state: "no_recent_data", source }
}

export function stale<T>(
  value: T,
  observedAt: string,
  source: string,
): ProvenancedField<T> {
  return { value, state: "stale", observedAt, source }
}

export function displayText<T>(field: ProvenancedField<T>): string {
  switch (field.state) {
    case "ok":
    case "stale":
      return field.value === null || field.value === undefined
        ? "—"
        : String(field.value)
    case "unknown":
      return "Unknown"
    case "not_reported":
      return "Not configured"
    case "no_recent_data":
      return "Disabled"
  }
}

export function stateLabel(state: TruthState): string {
  switch (state) {
    case "ok":
      return "Enabled"
    case "stale":
      return "Configured"
    case "unknown":
      return "Unknown"
    case "not_reported":
      return "Not configured"
    case "no_recent_data":
      return "Disabled"
  }
}

export function isUsable<T>(field: ProvenancedField<T>): boolean {
  return (
    field.state === "ok" &&
    field.value !== null &&
    field.value !== undefined
  )
}
