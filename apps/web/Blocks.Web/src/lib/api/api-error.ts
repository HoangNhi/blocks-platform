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

function getNonEmptyString(value: unknown) {
  if (typeof value !== "string") return null

  const message = value.trim()
  return message || null
}

function getNestedErrorMessage(value: unknown): string | null {
  const directMessage = getNonEmptyString(value)
  if (directMessage) return directMessage

  if (Array.isArray(value)) {
    const messages = value
      .map(getNestedErrorMessage)
      .filter((message): message is string => Boolean(message))

    return messages.length > 0 ? messages.join("; ") : null
  }

  if (!value || typeof value !== "object") return null

  const messages = Object.entries(value).flatMap(([field, fieldErrors]) => {
    const message = getNestedErrorMessage(fieldErrors)
    return message ? [field + ": " + message] : []
  })

  return messages.length > 0 ? messages.join("; ") : null
}

export function getEnvelopeStatusCode<T>(envelope: ApiEnvelope<T>, fallbackStatusCode = 200) {
  return envelope.statusCode
    ?? envelope.StatusCode
    ?? envelope.status
    ?? envelope.Status
    ?? fallbackStatusCode
}

export function getEnvelopeMessage<T>(envelope: ApiEnvelope<T>): string | null {
  const directMessage = getNonEmptyString(envelope.message) ?? getNonEmptyString(envelope.Message)
  if (directMessage) return directMessage

  const validationMessage = getNestedErrorMessage(envelope.errors ?? envelope.Errors)
  if (validationMessage) return validationMessage

  const detail = getNonEmptyString(envelope.detail) ?? getNonEmptyString(envelope.Detail)
  if (detail) return detail

  const errorMessage = getNonEmptyString(envelope.errorDescription)
    ?? getNonEmptyString(envelope.error_description)
    ?? getNonEmptyString(envelope.error)
    ?? getNonEmptyString(envelope.Error)
  if (errorMessage) return errorMessage

  const title = getNonEmptyString(envelope.title) ?? getNonEmptyString(envelope.Title)
  if (title) return title

  const data = getEnvelopeData(envelope)
  return getNonEmptyString(data)
    ?? (data && typeof data === "object"
      ? getEnvelopeMessage(data as ApiEnvelope<unknown>)
      : null)
}

export function getEnvelopeSuccess<T>(envelope: ApiEnvelope<T>) {
  return envelope.success ?? envelope.Success ?? true
}

export function getEnvelopeData<T>(envelope: ApiEnvelope<T>) {
  return envelope.data ?? envelope.Data ?? null
}

export function toApiError<T>(
  envelope: ApiEnvelope<T>,
  fallbackMessage: string,
  responseStatusCode?: number,
) {
  const statusCode = getEnvelopeStatusCode(envelope, responseStatusCode ?? 200)

  return new ApiError(
    getEnvelopeMessage(envelope) ?? (
      statusCode >= 400 ? fallbackMessage + " (HTTP " + statusCode + ")." : fallbackMessage
    ),
    statusCode,
    getEnvelopeData(envelope),
  )
}
