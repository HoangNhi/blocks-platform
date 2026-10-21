import type { WebsocketProvider } from "y-websocket";

export interface SarAutosaveUpdateEvent {
  origin?: unknown;
}

function isObjectLike(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

export function isLocalSarAutosaveOrigin(
  event: SarAutosaveUpdateEvent | null | undefined,
  provider?: WebsocketProvider | null,
): boolean {
  const origin = event?.origin;
  if (!isObjectLike(origin)) {
    return false;
  }

  if (provider && origin === provider) {
    return false;
  }

  return true;
}
