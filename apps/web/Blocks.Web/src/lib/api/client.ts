import {
  getEnvelopeData,
  getEnvelopeSuccess,
  toApiError,
} from "./api-error"
import type { ApiEnvelope, ApiRequestOptions } from "./types"

type ApiClientOptions = {
  baseUrl: string
  getAccessToken: () => string | null
  fetcher?: typeof fetch
}

export type ApiClient = {
  request<T>(path: string, options?: ApiRequestOptions): Promise<T>
}

function buildUrl(
  baseUrl: string,
  path: string,
  query?: ApiRequestOptions["query"],
) {
  const absoluteBaseUrl = /^https?:\/\//i.test(baseUrl)
    ? baseUrl
    : new URL(baseUrl, globalThis.location?.origin ?? "http://127.0.0.1").toString()
  const normalizedBaseUrl = absoluteBaseUrl.endsWith("/")
    ? absoluteBaseUrl
    : `${absoluteBaseUrl}/`
  const url = new URL(path.replace(/^\//, ""), normalizedBaseUrl)

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== null && value !== undefined) {
      url.searchParams.set(key, String(value))
    }
  }

  return url.toString()
}

export function createApiClient({
  baseUrl,
  getAccessToken,
  fetcher = fetch,
}: ApiClientOptions): ApiClient {
  async function request<T>(path: string, options: ApiRequestOptions = {}) {
    const token = getAccessToken()
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...options.headers,
    }

    let body: BodyInit | undefined
    if (options.body instanceof FormData) {
      body = options.body
    } else if (options.body !== undefined) {
      headers["Content-Type"] = "application/json"
      body = JSON.stringify(options.body)
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    const response = await fetcher(buildUrl(baseUrl, path, options.query), {
      method: options.method ?? "GET",
      headers,
      body,
    })

    const payload = (await response.json().catch(() => null)) as
      | ApiEnvelope<T>
      | null

    if (!payload) {
      throw new Error("The server returned an empty or invalid JSON response.")
    }

    if (!response.ok || !getEnvelopeSuccess(payload)) {
      throw toApiError(payload, "The request failed.", response.status)
    }

    return getEnvelopeData(payload) as T
  }

  return { request }
}
