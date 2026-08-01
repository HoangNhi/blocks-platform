import type { ApiEnvelope } from "./types"

export class ApiError extends Error {
  statusCode: number
  data: unknown

  constructor(message: string, statusCode = 500, data: unknown = null) {
    super(message)
    this.name = "ApiError"
    this.statusCode = statusCode
    this.data = data
  }

  get isUnauthorized() {
    return this.statusCode === 401
  }

  get isForbidden() {
    return this.statusCode === 403
  }
}

export function getEnvelopeStatusCode<T>(envelope: ApiEnvelope<T>) {
  return envelope.statusCode ?? envelope.StatusCode ?? 200
}

export function getEnvelopeMessage<T>(envelope: ApiEnvelope<T>) {
  return envelope.message ?? envelope.Message ?? null
}

export function getEnvelopeSuccess<T>(envelope: ApiEnvelope<T>) {
  return envelope.success ?? envelope.Success ?? true
}

export function getEnvelopeData<T>(envelope: ApiEnvelope<T>) {
  return envelope.data ?? envelope.Data ?? null
}

export function toApiError<T>(envelope: ApiEnvelope<T>, fallbackMessage: string) {
  return new ApiError(
    getEnvelopeMessage(envelope) ?? fallbackMessage,
    getEnvelopeStatusCode(envelope),
    getEnvelopeData(envelope),
  )
}
